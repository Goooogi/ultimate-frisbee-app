'use client';

// League settings — commissioner-only. Renders nothing for everyone else.
//
// SCOPE (2026-08-27). ESPN/Yahoo/Sleeper expose Basic · Roster · Scoring ·
// Draft · Waivers · Trades · Keepers · Playoffs. Most of that has no
// representation here and shipping empty shells would be worse than omitting
// them:
//   • Waivers / trades / keepers / FAAB — no such data model; explicitly out
//     of v1 per the vault.
//   • Playoffs — we rank by cumulative points, there is no H2H bracket.
//   • Scoring — a fixed matrix mirrored across TS + Deno + SQL. Per-league
//     divergence would break the mirror and every stored score. Shown
//     read-only, with the existing rules modal as the explainer.
// What IS real and DB-enforced: the league's name, and roster composition
// (fantasy_enforce_roster_composition reads contest.settings on every slot
// write, so a change binds immediately).

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { renameLeague, updateContestRoster, type ContestView } from '@/lib/fantasy/leagues';
import { revalidateFantasyLeague } from '@/app/fantasy/leagues/actions';
import { FantasyRulesModal } from '@/components/fantasy/fantasy-rules-modal';

interface Props {
  leagueId: string;
  leagueName: string;
  /** The league's contests. Roster settings apply per contest (each game has
   *  its own shape), so each gets its own row. */
  contests: ContestView[];
  /** Only a commissioner sees this panel at all — the parent resolves the role
   *  (the RPCs re-check server-side regardless). */
  isCommissioner: boolean;
}

export function LeagueSettingsPanel({ leagueId, leagueName, contests, isCommissioner }: Props) {
  if (!isCommissioner) return null;
  return (
    <section aria-labelledby="league-settings-heading" className="space-y-4">
      <h2
        id="league-settings-heading"
        className="font-display italic text-[22px] lg:text-[26px] font-bold tracking-[-0.02em] leading-[0.95] text-ink"
      >
        Settings
      </h2>

      <NameCard leagueId={leagueId} initialName={leagueName} />

      {contests.map((c) => (
        <RosterCard key={c.id} leagueId={leagueId} contest={c} />
      ))}

      <ScoringCard />
    </section>
  );
}

// ─── League name ──────────────────────────────────────────────────────────────

function NameCard({ leagueId, initialName }: { leagueId: string; initialName: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const trimmed = name.trim();
  const dirty = trimmed !== initialName;
  const canSave = dirty && trimmed.length >= 1 && trimmed.length <= 60 && !saving;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await renameLeague(leagueId, trimmed);
      await revalidateFantasyLeague(leagueId).catch(() => null);
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rename the league.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="League name">
      <form onSubmit={save} className="flex flex-col sm:flex-row sm:items-end gap-3 max-w-[520px]">
        <div className="flex-1">
          <label htmlFor="league-settings-name" className="sr-only">
            League name
          </label>
          <input
            id="league-settings-name"
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
              setSaved(false);
            }}
            maxLength={60}
            className={[
              'w-full px-3.5 py-2.5 rounded-card-sm bg-ink/5',
              'font-tight text-[14px] text-ink placeholder:text-faint',
              'focus:outline-none focus:ring-2 focus:ring-accent min-h-[44px]',
            ].join(' ')}
          />
        </div>
        <SaveButton disabled={!canSave} saving={saving} />
      </form>
      <Feedback error={error} saved={saved} />
    </Card>
  );
}

// ─── Roster composition (per contest) ─────────────────────────────────────────

function RosterCard({ leagueId, contest }: { leagueId: string; contest: ContestView }) {
  const router = useRouter();
  const s = contest.settings;
  const isWeekly = s.mode === 'weekly-stats';

  const [off, setOff] = useState(isWeekly ? s.offenders : 0);
  const [def, setDef] = useState(isWeekly ? s.defenders : 0);
  const [flex, setFlex] = useState(!isWeekly ? s.flex : 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = isWeekly
    ? off !== s.offenders || def !== s.defenders
    : flex !== s.flex;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dirty || saving) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updateContestRoster(contest.id, isWeekly ? { offenders: off, defenders: def } : { flex });
      await revalidateFantasyLeague(leagueId, contest.id).catch(() => null);
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the roster settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title={`Roster · ${contest.competitionDef.shortLabel} ${contest.seasonYear}`}>
      <form onSubmit={save} className="flex flex-wrap items-end gap-3">
        {isWeekly ? (
          <>
            <NumberField label="Offense" value={off} onChange={setOff} id={`off-${contest.id}`} />
            <NumberField label="Defense" value={def} onChange={setDef} id={`def-${contest.id}`} />
            <span className="font-tight text-[12px] text-faint pb-3">
              {off + def} starters each week
            </span>
          </>
        ) : (
          <>
            <NumberField label="Players" value={flex} onChange={setFlex} id={`flex-${contest.id}`} />
            <span className="font-tight text-[12px] text-faint pb-3">for the whole event</span>
          </>
        )}
        <SaveButton disabled={!dirty || saving} saving={saving} />
      </form>
      <p className="mt-2 text-[11px] text-faint font-tight">
        Slots can be added mid-season, but not removed once anyone has saved a lineup.
      </p>
      <Feedback error={error} saved={saved} />
    </Card>
  );
}

// ─── Scoring (read-only) ──────────────────────────────────────────────────────

function ScoringCard() {
  return (
    <Card title="Scoring">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted font-tight text-[13px] max-w-[440px]">
          Scoring is the same in every league so teams stay comparable across the
          whole game.
        </p>
        <FantasyRulesModal label="View scoring" />
      </div>
    </Card>
  );
}

// ─── Shared bits ──────────────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface rounded-card-lg shadow-card p-5 lg:p-6">
      <h3 className="text-[11px] font-bold tracking-[0.16em] uppercase text-muted font-tight mb-4">
        {title}
      </h3>
      {children}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  id,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  id: string;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-[10.5px] font-bold tracking-[0.14em] uppercase text-faint font-tight mb-1.5"
      >
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={1}
        max={20}
        value={value}
        onChange={(e) => onChange(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
        className={[
          'w-20 px-3.5 py-2.5 rounded-card-sm bg-ink/5',
          'font-tight text-[14px] text-ink tabular',
          'focus:outline-none focus:ring-2 focus:ring-accent min-h-[44px]',
        ].join(' ')}
      />
    </div>
  );
}

function SaveButton({ disabled, saving }: { disabled: boolean; saving: boolean }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className={[
        'inline-flex items-center justify-center gap-2',
        'px-5 py-2.5 rounded-full min-h-[44px]',
        'font-tight text-[12px] font-bold tracking-[0.06em] uppercase transition-colors duration-150',
        disabled
          ? 'bg-ink/[0.08] text-faint cursor-not-allowed'
          : 'bg-accent text-accent-ink hover:opacity-90 cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
      ].join(' ')}
    >
      {saving && (
        <span
          className="w-3.5 h-3.5 rounded-full border-2 border-current/30 border-t-current animate-spin"
          aria-hidden="true"
        />
      )}
      {saving ? 'Saving…' : 'Save'}
    </button>
  );
}

function Feedback({ error, saved }: { error: string | null; saved: boolean }) {
  if (error) {
    return (
      <p role="alert" className="mt-3 text-[12px] text-live font-tight">
        {error}
      </p>
    );
  }
  if (saved) {
    return (
      <p role="status" className="mt-3 text-[12px] text-muted font-tight">
        Saved.
      </p>
    );
  }
  return null;
}

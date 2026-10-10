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
// What IS real and DB-enforced: the league's name. Roster shape is fixed by
// the game and shown read-only (weekly 4 O + 3 D + 5 bench; event 7).

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { renameLeague, type ContestView } from '@/lib/fantasy/leagues';
import { WEEKLY_DEFENSE, WEEKLY_OFFENSE, WEEKLY_STARTERS, teamSize } from '@/lib/fantasy/competitions';
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
        <RosterCard key={c.id} contest={c} />
      ))}

      <ScoringCard contests={contests} />
    </section>
  );
}

// ─── League name ──────────────────────────────────────────────────────────────

export function NameCard({ leagueId, initialName }: { leagueId: string; initialName: string }) {
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
      <form onSubmit={save} className="flex items-center gap-3 max-w-[520px]">
        <div className="flex-1 min-w-0">
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

export function RosterCard({ contest }: { contest: ContestView }) {
  // Team shape is fixed by the game, so this is read-only: weekly lineups
  // start 4 offense + 3 defense with a 5-player bench (Hunter, 2026-10-08),
  // event teams are 7 with no bench.
  const s = contest.settings;
  return (
    <Card title={`Roster · ${contest.competitionDef.shortLabel} ${contest.seasonYear}`}>
      <p className="font-tight text-[13px] text-ink">
        {s.mode === 'weekly-stats'
          ? `${WEEKLY_STARTERS} starters each week (${WEEKLY_OFFENSE} offense + ${WEEKLY_DEFENSE} defense) + ${teamSize(s) - WEEKLY_STARTERS} bench`
          : `${teamSize(s)} players · drafted once, set for the whole event`}
      </p>
    </Card>
  );
}

// ─── Scoring (read-only) ──────────────────────────────────────────────────────

export function ScoringCard({ contests }: { contests: ContestView[] }) {
  // Season (weekly) and event contests score differently — one rules modal per
  // kind this league actually plays, labeled only when both appear.
  const kinds = [...new Map(contests.map((c) => [c.settings.mode, c])).values()];
  return (
    <Card title="Scoring">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted font-tight text-[13px] max-w-[440px]">
          Scoring is the same in every league so teams stay comparable across the
          whole game.
        </p>
        <div className="flex flex-wrap gap-2">
          {kinds.map((c) => (
            <FantasyRulesModal
              key={c.settings.mode}
              label={kinds.length > 1 ? `${c.settings.mode === 'event' ? 'Event' : 'Season'} scoring` : 'View scoring'}
              mode={c.settings.mode}
              playerLeague={c.competitionDef.playerLeague}
              competition={c.competition}
            />
          ))}
        </div>
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

function SaveButton({ disabled, saving }: { disabled: boolean; saving: boolean }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className={[
        'inline-flex items-center justify-center gap-2 flex-shrink-0',
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

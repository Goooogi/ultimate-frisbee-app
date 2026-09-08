'use client';

// DraftSettingsCard — Settings → Draft. Three states, web port of mobile's
// DraftSettingsCard.tsx:
//   1. No draft yet   — commissioner configures type + settings + a time,
//      then schedules it (scheduleDraft / scheduleAuctionDraft).
//   2. Scheduled      — read-only summary + a reschedule form. A MISSED
//      draft (readiness.missed) shows a banner and the reschedule floor
//      shifts to originalScheduledAt + 1 day when missed, else now + 30 min (readiness.rescheduleFloor).
//   3. Live / complete — read-only summary + a link into the draft room.
//
// Team-count gating: the RPC itself refuses to schedule below minTeams, so we
// mirror that client-side (disable Schedule + show the note) rather than
// letting the request round-trip to fail.
//
// DEVIATION from mobile: mobile composes the date/time from two PillSelects
// (RN has no native date input). Web has <input type="datetime-local">, so
// we use that directly instead of porting the composite picker.

import { useState } from 'react';
import Link from 'next/link';
import {
  scheduleDraft,
  scheduleAuctionDraft,
  rescheduleDraft,
  type Draft,
  type DraftReadiness,
  type DraftType,
} from '@/lib/fantasy/draft-room';
import type { ContestView } from '@/lib/fantasy/leagues';
import { PillSelect } from '@/components/pill-select';
import { Card, SaveButton, Feedback, NumberField, ToggleSwitch, isoToLocalInput, localInputToIso } from './shared';

interface Props {
  contest: ContestView;
  draft: Draft | null;
  readiness: DraftReadiness | null;
  loading: boolean;
  onSaved: () => void;
}

const PICK_SECONDS_OPTIONS = [30, 60, 90, 120].map((s) => ({ value: s, label: `${s}s` }));
const NOMINATION_SECONDS_OPTIONS = [15, 30, 45, 60].map((s) => ({ value: s, label: `${s}s` }));
const BID_SECONDS_OPTIONS = [10, 15, 20, 30].map((s) => ({ value: s, label: `${s}s` }));

function formatScheduled(iso: string | null): string {
  if (!iso) return 'Not set';
  const d = new Date(iso);
  const day = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${time}`;
}

export function DraftSettingsCard({ contest, draft, readiness, loading, onSaved }: Props) {
  if (loading || !readiness) {
    return (
      <Card title="Draft">
        <p className="font-tight text-[13px] text-faint">Loading…</p>
      </Card>
    );
  }

  if (!draft) {
    return <ScheduleForm contest={contest} readiness={readiness} onSaved={onSaved} />;
  }

  if (draft.status === 'scheduled') {
    return <ScheduledView contest={contest} draft={draft} readiness={readiness} onSaved={onSaved} />;
  }

  return <ReadOnlyView contest={contest} draft={draft} />;
}

// ─── State 1: no draft yet ──────────────────────────────────────────────────

function ScheduleForm({
  contest,
  readiness,
  onSaved,
}: {
  contest: ContestView;
  readiness: DraftReadiness;
  onSaved: () => void;
}) {
  const [type, setType] = useState<DraftType>('snake');
  const [rounds, setRounds] = useState(12);
  const [pickSeconds, setPickSeconds] = useState(60);
  const [budget, setBudget] = useState(200);
  const [nominationSeconds, setNominationSeconds] = useState(30);
  const [bidSeconds, setBidSeconds] = useState(15);
  const [minBid, setMinBid] = useState(1);
  const [manual, setManual] = useState(readiness.defaultAt == null);
  const [at, setAt] = useState<string | null>(readiness.defaultAt);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const belowMin = readiness.teamCount < readiness.minTeams;
  const canSchedule = !belowMin && (manual || !!at) && !saving;

  const schedule = async () => {
    if (!canSchedule) return;
    setSaving(true);
    setError(null);
    try {
      if (type === 'snake') {
        await scheduleDraft({ contestId: contest.id, at: manual ? null : at, pickSeconds, rounds });
      } else {
        await scheduleAuctionDraft({
          contestId: contest.id,
          at: manual ? null : at,
          rounds,
          budget,
          nominationSeconds,
          bidSeconds,
          minBid,
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not schedule the draft.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Draft">
      <div className="flex flex-col gap-4">
        {!readiness.rostersReady && (
          <div className="rounded-card-sm bg-live/[0.08] px-3 py-2.5">
            <p className="font-tight text-[12px] text-live leading-snug">
              Rosters not set on {readiness.sourceLabel} — draft will be another day.
            </p>
          </div>
        )}

        <div className="flex gap-2" role="radiogroup" aria-label="Draft type">
          <TypeOption label="Snake" selected={type === 'snake'} onClick={() => setType('snake')} />
          <TypeOption label="Auction" selected={type === 'auction'} onClick={() => setType('auction')} />
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <NumberField label="Rounds" value={rounds} onChange={setRounds} id="draft-rounds" min={1} max={30} />
          {type === 'snake' && (
            <PillField label="Pick clock" ariaLabel="Pick clock" value={pickSeconds} onChange={setPickSeconds} options={PICK_SECONDS_OPTIONS} />
          )}
        </div>

        {type === 'auction' && (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <NumberField label="Budget" value={budget} onChange={setBudget} id="draft-budget" min={50} max={1000} step={10} />
              <NumberField label="Min bid" value={minBid} onChange={setMinBid} id="draft-min-bid" min={1} max={10} />
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <PillField
                label="Nomination clock"
                ariaLabel="Nomination clock"
                value={nominationSeconds}
                onChange={setNominationSeconds}
                options={NOMINATION_SECONDS_OPTIONS}
              />
              <PillField label="Bid clock" ariaLabel="Bid clock" value={bidSeconds} onChange={setBidSeconds} options={BID_SECONDS_OPTIONS} />
            </div>
          </>
        )}

        <div className="flex items-center justify-between gap-3 max-w-[440px]">
          <div>
            <p className="font-tight text-[13px] font-semibold text-ink">Start manually</p>
            <p className="font-tight text-[11.5px] text-faint leading-snug">
              Skip scheduling — start the draft yourself whenever you&apos;re ready.
            </p>
          </div>
          <ToggleSwitch checked={manual} onChange={() => setManual((v) => !v)} label="Start draft manually" />
        </div>

        {!manual && (
          <DateTimeField
            label="Draft time"
            value={at}
            onChange={setAt}
            min={readiness.earliestAt}
            max={readiness.lockAt}
          />
        )}

        {belowMin && (
          <p className="font-tight text-[12px] text-live">
            Need {readiness.minTeams} teams to draft ({readiness.teamCount} so far).
          </p>
        )}

        <div>
          <button
            type="button"
            disabled={!canSchedule}
            onClick={schedule}
            className={[
              'inline-flex items-center justify-center gap-2',
              'px-5 py-2.5 rounded-full min-h-[44px]',
              'font-tight text-[12px] font-bold tracking-[0.06em] uppercase transition-colors duration-150',
              !canSchedule
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
            {saving ? 'Scheduling…' : 'Schedule draft'}
          </button>
        </div>
        <Feedback error={error} saved={false} />
      </div>
    </Card>
  );
}

// ─── State 2: scheduled ─────────────────────────────────────────────────────

function ScheduledView({
  contest,
  draft,
  readiness,
  onSaved,
}: {
  contest: ContestView;
  draft: Draft;
  readiness: DraftReadiness;
  onSaved: () => void;
}) {
  const rescheduleFloor = readiness.rescheduleFloor ?? readiness.earliestAt;
  const [at, setAt] = useState<string | null>(draft.scheduledAt ?? rescheduleFloor);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!at || saving) return;
    setSaving(true);
    setError(null);
    try {
      await rescheduleDraft(draft.id, at);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reschedule the draft.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Draft">
      <div className="flex flex-col gap-4">
        <div>
          <p className="font-tight text-[13.5px] font-semibold text-ink">
            {draft.draftType === 'snake' ? 'Snake' : 'Auction'} · {draft.rounds} rounds
          </p>
          <p className="font-tight text-[13.5px] font-semibold text-ink">Scheduled {formatScheduled(draft.scheduledAt)}</p>
        </div>

        {readiness.missed && (
          <div className="rounded-card-sm bg-live/[0.08] px-3 py-2.5">
            <p className="font-tight text-[12px] text-live leading-snug">
              The scheduled time passed before the draft started. Pick a new time at least a day after the
              original ({formatScheduled(readiness.originalScheduledAt)}).
            </p>
          </div>
        )}

        {!readiness.missed && (
          <p className="font-tight text-[12px] text-muted leading-snug">
            Give the league at least 30 minutes&apos; notice.
          </p>
        )}

        <form onSubmit={save} className="flex flex-col gap-4">
          <DateTimeField label="Reschedule" value={at} onChange={setAt} min={rescheduleFloor} max={readiness.lockAt} />
          <div>
            <SaveButton disabled={!at || saving} saving={saving} label="Reschedule" savingLabel="Saving…" />
          </div>
        </form>
        <Feedback error={error} saved={false} />

        <Link
          href={`/fantasy/l/${contest.id}/draft`}
          className="font-tight text-[12.5px] font-bold text-accent no-underline hover:underline self-start"
        >
          Open draft room
        </Link>
      </div>
    </Card>
  );
}

// ─── State 3: live / complete ───────────────────────────────────────────────

function ReadOnlyView({ contest, draft }: { contest: ContestView; draft: Draft }) {
  return (
    <Card title="Draft">
      <div className="flex flex-col gap-4">
        <div>
          <p className="font-tight text-[13.5px] font-semibold text-ink">
            {draft.draftType === 'snake' ? 'Snake' : 'Auction'} · {draft.rounds} rounds
          </p>
          <p className="font-tight text-[13.5px] font-semibold text-ink">
            {draft.status === 'live' ? 'Live now' : 'Complete'}
          </p>
        </div>
        <Link
          href={`/fantasy/l/${contest.id}/draft`}
          className="font-tight text-[12.5px] font-bold text-accent no-underline hover:underline self-start"
        >
          Open draft room
        </Link>
      </div>
    </Card>
  );
}

// ─── Shared bits ────────────────────────────────────────────────────────────

function TypeOption({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={[
        'flex-1 rounded-full border px-4 py-2.5 min-h-[40px]',
        'font-tight text-[12.5px] font-bold tracking-[0.06em] uppercase transition-colors duration-150',
        selected ? 'border-accent text-accent bg-accent/[0.06]' : 'border-hairline text-muted',
        'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

function PillField({
  label,
  ariaLabel,
  value,
  onChange,
  options,
}: {
  label: string;
  ariaLabel: string;
  value: number;
  onChange: (n: number) => void;
  options: { value: number; label: string }[];
}) {
  return (
    <div>
      <span className="block text-[10.5px] font-bold tracking-[0.14em] uppercase text-faint font-tight mb-1.5">
        {label}
      </span>
      <PillSelect value={value} options={options} onChange={onChange} ariaLabel={ariaLabel} />
    </div>
  );
}

function DateTimeField({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: string | null;
  onChange: (iso: string | null) => void;
  min: string | null;
  max: string | null;
}) {
  const id = `dt-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div>
      <label htmlFor={id} className="block text-[10.5px] font-bold tracking-[0.14em] uppercase text-faint font-tight mb-1.5">
        {label}
      </label>
      <input
        id={id}
        type="datetime-local"
        value={isoToLocalInput(value)}
        min={min ? isoToLocalInput(min) : undefined}
        max={max ? isoToLocalInput(max) : undefined}
        onChange={(e) => onChange(localInputToIso(e.target.value))}
        className={[
          'px-3.5 py-2.5 rounded-card-sm bg-ink/5',
          'font-tight text-[14px] text-ink',
          'focus:outline-none focus:ring-2 focus:ring-accent min-h-[44px]',
        ].join(' ')}
      />
    </div>
  );
}

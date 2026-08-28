'use client';

// Draft entry point card on the league-in-game page. Renders one of four
// states from src/lib/fantasy/draft-room.ts' Draft.status (plus "none" when
// no draft row exists yet):
//   none      → commissioner: "Schedule draft" form. Everyone else: nothing
//               (a draft that doesn't exist yet has no spectate value).
//   scheduled → countdown + "Enter draft room" for everyone; commissioner
//               also gets "Start now" inline (mirrors the room's own lobby
//               Start button, so commissioners don't have to enter the room
//               just to kick things off).
//   live      → prominent "Draft in progress — enter room" banner.
//   complete  → "View results" link into the room's summary state.
//
// Any signed-in user can see this card (public read via getDraft); only the
// commissioner sees the schedule form / start button (role resolved here,
// same pattern as LeagueMembersPanel).

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/auth-provider';
import { getDraft, scheduleDraft, startDraft, type Draft } from '@/lib/fantasy/draft-room';
import { getMyLeagueRole } from '@/lib/fantasy/leagues';
import { formatDateOnly } from '@/lib/fantasy/games';

const CLOCK_OPTIONS = [30, 60, 90, 120] as const;

interface Props {
  contestId: string;
  leagueId: string | null;
  /** Where the room lives for this contest (UFA canonical vs generic path). */
  draftPath: string;
  /** Event contests: 'YYYY-MM-DD' the draft window opens (the Saturday before
   *  the event — rosters are in by then). The DB RPCs enforce it; this only
   *  surfaces the date and pre-validates the form. Omit for weekly games. */
  draftOpens?: string | null;
}

/** Today as 'YYYY-MM-DD' in ET (the draft window's timezone). */
function todayEt(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
}

export function DraftScheduleCard({ contestId, leagueId, draftPath, draftOpens = null }: Props) {
  const { user } = useAuth();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [isCommissioner, setIsCommissioner] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getDraft(contestId)
      .then((d) => {
        if (!cancelled) setDraft(d);
      })
      .catch(() => {
        if (!cancelled) setDraft(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [contestId]);

  useEffect(() => {
    if (!user || !leagueId) {
      setIsCommissioner(false);
      return;
    }
    getMyLeagueRole(leagueId)
      .then((role) => setIsCommissioner(role === 'commissioner'))
      .catch(() => setIsCommissioner(false));
  }, [user, leagueId]);

  if (loading) {
    return (
      <div className="bg-surface rounded-card-lg shadow-card p-6">
        <div className="h-11 w-48 rounded-card-sm bg-ink/[0.06] animate-pulse" />
      </div>
    );
  }

  if (!draft) {
    if (!isCommissioner) return null;
    return <ScheduleForm contestId={contestId} draftOpens={draftOpens} onScheduled={setDraft} />;
  }

  if (draft.status === 'scheduled') {
    return (
      <ScheduledCard draft={draft} draftPath={draftPath} isCommissioner={isCommissioner} onStarted={setDraft} />
    );
  }

  if (draft.status === 'live') {
    return (
      <Link
        href={draftPath}
        className={[
          'block bg-accent text-accent-ink rounded-card-lg shadow-card p-5 lg:p-6',
          'hover:opacity-90 transition-opacity duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
        ].join(' ')}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-accent-ink animate-pulse" aria-hidden="true" />
            <span className="font-tight text-[15px] font-bold">Draft in progress</span>
          </div>
          <span className="font-tight text-[12px] font-bold tracking-[0.08em] uppercase">Enter room →</span>
        </div>
      </Link>
    );
  }

  // complete
  return (
    <div className="bg-surface rounded-card-lg shadow-card p-5 lg:p-6 flex items-center justify-between gap-4">
      <span className="font-tight text-[14px] font-semibold text-ink">Draft complete</span>
      <Link
        href={draftPath}
        className="text-accent font-tight text-[13px] font-bold hover:opacity-80 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
      >
        View results
      </Link>
    </div>
  );
}

function ScheduledCard({
  draft,
  draftPath,
  isCommissioner,
  onStarted,
}: {
  draft: Draft;
  draftPath: string;
  isCommissioner: boolean;
  onStarted: (d: Draft) => void;
}) {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStart = async () => {
    setStarting(true);
    setError(null);
    try {
      const updated = await startDraft(draft.id);
      onStarted(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the draft.');
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="bg-surface rounded-card-lg shadow-card p-5 lg:p-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[10.5px] font-bold tracking-[0.14em] uppercase text-faint font-tight mb-1">
            Draft scheduled
          </div>
          <div className="font-tight text-[14px] font-semibold text-ink">
            {draft.scheduledAt ? <ScheduledAt iso={draft.scheduledAt} /> : 'Starts whenever the commissioner is ready'}
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          {isCommissioner && (
            <button
              type="button"
              onClick={handleStart}
              disabled={starting}
              className={[
                'inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full min-h-[44px]',
                'bg-ink/5 text-ink hover:bg-ink/10 transition-colors duration-150 cursor-pointer disabled:opacity-60',
                'font-tight text-[12px] font-bold tracking-[0.06em] uppercase',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              ].join(' ')}
            >
              {starting ? 'Starting…' : 'Start now'}
            </button>
          )}
          <Link
            href={draftPath}
            className={[
              'inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full min-h-[44px]',
              'bg-accent text-accent-ink font-tight text-[12px] font-bold tracking-[0.08em] uppercase',
              'hover:opacity-90 transition-opacity duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
            ].join(' ')}
          >
            Enter draft room
          </Link>
        </div>
      </div>
      {error && <p className="mt-2 text-[12px] text-live font-tight" role="alert">{error}</p>}
    </div>
  );
}

function ScheduledAt({ iso }: { iso: string }) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const s = d.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  });
  return <>{s} ET</>;
}

function ScheduleForm({
  contestId,
  draftOpens,
  onScheduled,
}: {
  contestId: string;
  draftOpens: string | null;
  onScheduled: (d: Draft) => void;
}) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState('');
  const [pickSeconds, setPickSeconds] = useState<(typeof CLOCK_OPTIONS)[number]>(60);
  const [rounds, setRounds] = useState(12);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const windowNotOpen = draftOpens !== null && todayEt() < draftOpens;

  if (!open) {
    return (
      <div className="bg-surface rounded-card-lg shadow-card p-5 lg:p-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[10.5px] font-bold tracking-[0.14em] uppercase text-faint font-tight mb-1">Draft</div>
          <p className="font-tight text-[13px] text-muted">
            No draft scheduled yet.
            {windowNotOpen && draftOpens && (
              <> Drafts open {formatDateOnly(draftOpens)} — once teams and rosters are in.</>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={[
            'inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full min-h-[44px]',
            'bg-accent text-accent-ink font-tight text-[12px] font-bold tracking-[0.08em] uppercase',
            'hover:opacity-90 transition-opacity duration-150 cursor-pointer',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
          ].join(' ')}
        >
          Schedule draft
        </button>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Friendly pre-check only — fantasy_schedule_draft enforces the window.
    if (draftOpens && at && at.slice(0, 10) < draftOpens) {
      setError(`Drafts open ${formatDateOnly(draftOpens)} — pick a later time.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const iso = at ? new Date(at).toISOString() : null;
      const d = await scheduleDraft({ contestId, at: iso, pickSeconds, rounds });
      onScheduled(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not schedule the draft.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-surface rounded-card-lg shadow-card p-5 lg:p-6 space-y-4">
      <div className="text-[10.5px] font-bold tracking-[0.14em] uppercase text-faint font-tight">
        Schedule draft
      </div>

      <div>
        <label htmlFor="draft-at" className="block text-[11px] font-bold text-muted font-tight mb-1.5">
          Date &amp; time (optional — leave blank to start manually)
        </label>
        <input
          id="draft-at"
          type="datetime-local"
          value={at}
          min={draftOpens ? `${draftOpens}T00:00` : undefined}
          onChange={(e) => setAt(e.target.value)}
          className={[
            'w-full sm:w-auto px-3.5 py-2.5 rounded-card-sm bg-ink/5',
            'font-tight text-[14px] text-ink',
            'focus:outline-none focus:ring-2 focus:ring-accent',
            'min-h-[44px]',
          ].join(' ')}
        />
        {draftOpens && windowNotOpen && (
          <p className="mt-1.5 text-[11px] text-faint font-tight">
            Drafts open {formatDateOnly(draftOpens)}, the Saturday before the tournament — schedule
            for then or later.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-6">
        <div>
          <div className="text-[11px] font-bold text-muted font-tight mb-1.5">Pick clock</div>
          <div className="flex gap-1.5" role="radiogroup" aria-label="Pick clock seconds">
            {CLOCK_OPTIONS.map((secs) => (
              <button
                key={secs}
                type="button"
                role="radio"
                aria-checked={pickSeconds === secs}
                onClick={() => setPickSeconds(secs)}
                className={[
                  'px-3.5 py-2 rounded-full min-h-[36px] font-tight text-[12px] font-bold transition-colors duration-150 cursor-pointer',
                  pickSeconds === secs ? 'bg-accent text-accent-ink' : 'bg-ink/5 text-ink hover:bg-ink/10',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                ].join(' ')}
              >
                {secs}s
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="draft-rounds" className="block text-[11px] font-bold text-muted font-tight mb-1.5">
            Rounds
          </label>
          <input
            id="draft-rounds"
            type="number"
            min={1}
            max={30}
            value={rounds}
            onChange={(e) => setRounds(Math.max(1, Math.min(30, Number(e.target.value) || 12)))}
            className={[
              'w-24 px-3.5 py-2.5 rounded-card-sm bg-ink/5',
              'font-tight text-[14px] text-ink tabular',
              'focus:outline-none focus:ring-2 focus:ring-accent',
              'min-h-[44px]',
            ].join(' ')}
          />
        </div>
      </div>

      {error && <p className="text-[12px] text-live font-tight" role="alert">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className={[
            'inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full min-h-[44px]',
            'bg-accent text-accent-ink font-tight text-[12px] font-bold tracking-[0.08em] uppercase',
            'hover:opacity-90 transition-opacity duration-150 cursor-pointer disabled:opacity-60',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
          ].join(' ')}
        >
          {saving ? 'Scheduling…' : 'Schedule draft'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={saving}
          className="font-tight text-[12px] font-bold text-muted hover:text-ink transition-colors duration-150 cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// Contest-scoped public team view — competition-agnostic. Server Component.
// Renders a team's header stats + roster-by-period for ANY contest (event-mode
// flex or weekly-stats O/D), using the generic reads (getContestTeam,
// getContestTeamRoster) rather than data.ts' UFA-only equivalents. Shared by
// /fantasy/contests/[id]/t/[teamId] (any competition) and the canonical
// /fantasy/ufa/l/[id]/t/[teamId] (UFA).
//
// No per-player point breakdown here (data.ts' getTeamWeekBreakdown computes
// that from UFA stat tables only) — periods show their team total from
// fantasy_scores plus that period's roster. Good enough for a public view;
// UFA's fuller weekly-breakdown page is unaffected.

import Link from 'next/link';
import { getContestTeam, type ContestView } from '@/lib/fantasy/leagues';
import { getContestTeamRoster, type ContestRosterSlot } from '@/lib/fantasy/draft';
import { formatWeekLabel } from '@/lib/fantasy/weeks';

export async function ContestTeamView({
  contest,
  teamId,
}: {
  contest: ContestView;
  teamId: string;
}) {
  const team = await getContestTeam(teamId).catch(() => null);
  if (!team || team.contestId !== contest.id) return null;

  const isUfa = contest.competitionDef.playerLeague === 'ufa';
  const isEventMode = contest.settings.mode === 'event';

  // Newest period first. Event-mode contests score once under period 'event'.
  const periods = [...team.weeklyPoints].sort((a, b) =>
    b.week.localeCompare(a.week, undefined, { numeric: true }),
  );
  const latestPeriod = periods[0]?.week ?? (isEventMode ? 'event' : null);

  const roster = latestPeriod
    ? await getContestTeamRoster(contest, teamId, latestPeriod).catch(() => [])
    : [];

  const offenders = roster.filter((s) => s.role === 'offender');
  const defenders = roster.filter((s) => s.role === 'defender');
  const flex = roster.filter((s) => s.role === 'flex');

  return (
    <div className="space-y-8">
      {/* ── Stats header ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Total Points" value={team.totalPoints} unit="pts" highlight />
        {periods.length > 0 && (
          <StatCard
            label={isEventMode ? 'Event Points' : 'Best Week'}
            value={isEventMode ? periods[0].points : Math.max(...periods.map((p) => p.points))}
            unit="pts"
          />
        )}
      </div>

      {/* ── Period history (weekly-stats only; event mode has one period) ──── */}
      {!isEventMode && periods.length > 0 && (
        <section aria-labelledby="periods-heading">
          <h2
            id="periods-heading"
            className="text-[11px] font-bold tracking-[0.18em] uppercase text-muted font-tight mb-3"
          >
            Weekly Points
          </h2>
          <div className="bg-surface rounded-card shadow-card overflow-hidden">
            {periods.map((p, idx) => (
              <div
                key={p.week}
                className={[
                  'flex items-center justify-between gap-3 px-5 py-3',
                  idx > 0 ? 'border-t border-hairline' : '',
                ].join(' ')}
              >
                <span className="font-tight text-[13.5px] font-semibold text-ink">
                  {formatWeekLabel(p.week)}
                </span>
                <span className="font-tight text-[14px] font-bold tabular text-ink">
                  {p.points}
                  <span className="text-[11px] font-medium text-faint ml-1">pts</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Roster ────────────────────────────────────────────────────────── */}
      <section aria-labelledby="roster-heading">
        <h2
          id="roster-heading"
          className="text-[11px] font-bold tracking-[0.18em] uppercase text-muted font-tight mb-3"
        >
          Roster{!isEventMode && latestPeriod ? ` · ${formatWeekLabel(latestPeriod)}` : ''}
        </h2>

        {roster.length === 0 ? (
          <div className="bg-surface rounded-card shadow-card px-5 py-8 text-center">
            <p className="font-tight text-[14px] text-muted">No roster set yet.</p>
          </div>
        ) : isEventMode ? (
          <RosterSection label="Roster" tag="F" slots={flex} isUfa={isUfa} />
        ) : (
          <div className="space-y-4">
            {offenders.length > 0 && <RosterSection label="Offense" tag="O" slots={offenders} isUfa={isUfa} />}
            {defenders.length > 0 && (
              <RosterSection label="Defense" tag="D" slots={defenders} isUfa={isUfa} accent />
            )}
          </div>
        )}
      </section>
    </div>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  unit,
  highlight = false,
}: {
  label: string;
  value: number;
  unit?: string;
  highlight?: boolean;
}) {
  return (
    <div className="bg-surface rounded-card shadow-card px-4 py-4">
      <div className="text-[10px] font-bold tracking-[0.16em] uppercase text-faint font-tight mb-1">
        {label}
      </div>
      <div className="flex items-baseline gap-1">
        <span
          className={[
            'font-tight text-[28px] font-bold tabular tracking-[-0.03em]',
            highlight ? 'text-accent' : 'text-ink',
          ].join(' ')}
        >
          {value}
        </span>
        {unit && <span className="font-tight text-[13px] font-medium text-faint">{unit}</span>}
      </div>
    </div>
  );
}

// ─── RosterSection ───────────────────────────────────────────────────────────

function RosterSection({
  label,
  tag,
  slots,
  isUfa,
  accent = false,
}: {
  label: string;
  tag: string;
  slots: ContestRosterSlot[];
  isUfa: boolean;
  accent?: boolean;
}) {
  if (slots.length === 0) return null;
  const roleColor = accent ? 'text-accent' : 'text-ink';

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span
          className={[
            'inline-flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-bold font-tight',
            'bg-ink/5',
            roleColor,
          ].join(' ')}
          aria-hidden="true"
        >
          {tag}
        </span>
        <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-muted font-tight">
          {label}
        </span>
      </div>

      <div className="bg-surface rounded-card shadow-card overflow-hidden">
        {slots.map((slot, idx) => (
          <div
            key={slot.playerId}
            className={[
              'flex items-center gap-3 px-5 py-3',
              idx > 0 ? 'border-t border-hairline' : '',
            ].join(' ')}
          >
            <span
              className={[
                'flex-shrink-0 w-5 h-5 rounded-full text-[9px] font-bold flex items-center justify-center font-tight',
                'bg-ink/5',
                roleColor,
              ].join(' ')}
              aria-label={label}
            >
              {tag}
            </span>
            <span className="flex-1 min-w-0">
              {isUfa ? (
                <Link
                  href={`/players/${slot.playerId}`}
                  prefetch={false}
                  className={[
                    'block font-tight text-[14px] font-semibold text-ink truncate',
                    'hover:text-accent transition-colors duration-150',
                    'focus-visible:outline-none focus-visible:underline',
                  ].join(' ')}
                >
                  {slot.fullName}
                </Link>
              ) : (
                <span className="block font-tight text-[14px] font-semibold text-ink truncate">
                  {slot.fullName}
                </span>
              )}
              {slot.teamName && (
                <span className="block font-tight text-[11px] text-muted truncate">{slot.teamName}</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

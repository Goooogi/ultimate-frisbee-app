// /fantasy/team/[id] — Public team view. Server Component.
// Fully accessible logged-out. Shows team name, owner handle, cumulative
// points, weekly breakdown, and the current week's roster.

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { PageShell } from '@/components/page-shell';
import {
  getFantasyTeam,
  getTeamRoster,
  currentFantasyWeek,
} from '@/lib/fantasy/data';
import type { FantasyRole } from '@/lib/fantasy/scoring';
import type { Crumb } from '@/components/breadcrumbs';

interface Props {
  params: { id: string };
}

export const revalidate = 60;

export default async function FantasyTeamPage({ params }: Props) {
  const { id } = params;

  const [team, weekInfo] = await Promise.all([
    getFantasyTeam(id).catch(() => null),
    currentFantasyWeek().catch(() => null),
  ]);

  if (!team) notFound();

  // Load current week's roster (or latest if no active week).
  const latestWeek =
    weekInfo?.week ??
    (team.weeklyPoints.length > 0
      ? team.weeklyPoints[team.weeklyPoints.length - 1].week
      : null);

  const roster = latestWeek
    ? await getTeamRoster(id, latestWeek).catch(() => [])
    : [];

  const offenders = roster.filter((s) => s.role === 'offender');
  const defenders = roster.filter((s) => s.role === 'defender');

  const BREADCRUMBS: Crumb[] = [
    { label: 'Fantasy', href: '/fantasy' },
    { label: team.teamName },
  ];

  return (
    <PageShell
      title={team.teamName}
      eyebrow="Fantasy · Beta"
      hideFooterMobile
      subtitle={
        team.ownerDisplayName || team.ownerUsername
          ? `${team.ownerDisplayName ?? `@${team.ownerUsername}`}${
              team.ownerDisplayName && team.ownerUsername ? ` · @${team.ownerUsername}` : ''
            } · ${team.seasonYear} Season`
          : `${team.seasonYear} Season`
      }
      breadcrumbs={BREADCRUMBS}
    >
      {/* ── Stats header ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
        <StatCard label="Total Points" value={team.totalPoints} unit="pts" highlight />
        <StatCard
          label="Weeks Scored"
          value={team.weeklyPoints.filter((w) => w.points > 0).length}
        />
        {team.weeklyPoints.length > 0 && (
          <StatCard
            label="Best Week"
            value={Math.max(...team.weeklyPoints.map((w) => w.points))}
            unit="pts"
          />
        )}
      </div>

      {/* ── Weekly breakdown ──────────────────────────────────────────────── */}
      {team.weeklyPoints.length > 0 && (
        <section aria-labelledby="weekly-heading" className="mb-8">
          <div className="text-[11px] font-bold tracking-[0.18em] uppercase text-muted font-tight mb-3">
            Weekly Points
          </div>
          <div className="rounded-lg border border-border bg-surface overflow-hidden">
            <div className="hidden sm:grid grid-cols-[1fr_auto] px-4 py-2.5 border-b border-hairline">
              <span className="text-[10px] font-bold tracking-[0.14em] uppercase text-faint font-tight">
                Week
              </span>
              <span className="text-[10px] font-bold tracking-[0.14em] uppercase text-faint font-tight text-right">
                Points
              </span>
            </div>
            <ol aria-label="Weekly point breakdown">
              {team.weeklyPoints.map((w, idx) => (
                <li
                  key={w.week}
                  className={[
                    'grid grid-cols-[1fr_auto] items-center px-4 py-3',
                    idx > 0 ? 'border-t border-hairline' : '',
                  ].join(' ')}
                >
                  <span className="font-tight text-[13px] font-medium text-ink">{w.week}</span>
                  <span className="font-tight text-[14px] font-bold tabular text-right text-ink">
                    {w.points}
                    <span className="text-[11px] font-medium text-faint ml-1">pts</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      {/* ── Roster ────────────────────────────────────────────────────────── */}
      <section aria-labelledby="roster-heading">
        <div className="flex items-end justify-between gap-3 mb-3">
          <h2
            id="roster-heading"
            className="text-[11px] font-bold tracking-[0.18em] uppercase text-muted font-tight"
          >
            Roster{latestWeek ? ` · ${latestWeek}` : ''}
          </h2>
        </div>

        {roster.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface px-5 py-8 text-center">
            <p className="font-tight text-[14px] text-muted">
              {latestWeek
                ? `No roster set for ${latestWeek}.`
                : 'No roster data available.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {offenders.length > 0 && (
              <RosterSection label="Offense" role="offender" slots={offenders} />
            )}
            {defenders.length > 0 && (
              <RosterSection label="Defense" role="defender" slots={defenders} />
            )}
          </div>
        )}
      </section>

      {/* ── Back to leaderboard ───────────────────────────────────────────── */}
      <div className="mt-10 pt-6 border-t border-hairline">
        <Link
          href="/fantasy"
          className={[
            'inline-flex items-center gap-2 font-tight text-[13px] font-bold text-muted',
            'hover:text-ink transition-colors duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded',
          ].join(' ')}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M11 7H3M6 4L3 7l3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Leaderboard
        </Link>
      </div>
    </PageShell>
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
    <div className="rounded-lg border border-border bg-surface px-4 py-4">
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
        {unit && (
          <span className="font-tight text-[13px] font-medium text-faint">{unit}</span>
        )}
      </div>
    </div>
  );
}

// ─── RosterSection ───────────────────────────────────────────────────────────

interface RosterSlotShape {
  playerId: string;
  role: FantasyRole;
  fullName: string;
  teamId: string | null;
  teamName: string | null;
}

function RosterSection({
  label,
  role,
  slots,
}: {
  label: string;
  role: FantasyRole;
  slots: RosterSlotShape[];
}) {
  const roleColor = role === 'offender' ? 'text-ink' : 'text-accent';
  const roleTag = role === 'offender' ? 'O' : 'D';

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span
          className={[
            'inline-flex items-center justify-center w-5 h-5 rounded text-[9px] font-bold font-tight',
            'bg-[rgb(var(--ink)/0.08)]',
            roleColor,
          ].join(' ')}
          aria-hidden="true"
        >
          {roleTag}
        </span>
        <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-muted font-tight">
          {label}
        </span>
      </div>

      <div className="rounded-lg border border-border bg-surface overflow-hidden">
        {slots.map((slot, idx) => (
          <div
            key={slot.playerId}
            className={[
              'flex items-center gap-3 px-4 py-3',
              idx > 0 ? 'border-t border-hairline' : '',
            ].join(' ')}
          >
            <span
              className={[
                'flex-shrink-0 w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center font-tight',
                'bg-[rgb(var(--ink)/0.06)]',
                roleColor,
              ].join(' ')}
              aria-label={role}
            >
              {roleTag}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block font-tight text-[14px] font-semibold text-ink truncate">
                {slot.fullName}
              </span>
              {slot.teamName && (
                <span className="block font-tight text-[11px] text-muted truncate">
                  {slot.teamName}
                </span>
              )}
            </span>
            {slot.teamId && (
              <Link
                href={`/teams/${slot.teamId}`}
                className={[
                  'flex-shrink-0 text-[11px] font-bold text-faint font-tight',
                  'hover:text-ink transition-colors duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded',
                ].join(' ')}
              >
                Team
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

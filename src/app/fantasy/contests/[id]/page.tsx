// /fantasy/contests/[id] — Contest page. Server shell: contest header,
// standings (public), period schedule strip. Client island: my-team CTA.

import Link from 'next/link';
import { PageShell } from '@/components/page-shell';
import {
  getContest,
  getLeague,
  getContestStandings,
  getContestPeriods,
  periodsToWeeks,
} from '@/lib/fantasy/leagues';
import { formatWeekLabel } from '@/lib/fantasy/weeks';
import { MyContestTeamCta } from '@/components/fantasy/my-contest-team-cta';
import type { Crumb } from '@/components/breadcrumbs';

export const revalidate = 60;

export default async function ContestPage({ params }: { params: { id: string } }) {
  const contest = await getContest(params.id).catch(() => null);

  if (!contest) {
    return (
      <PageShell
        title="Contest"
        eyebrow="Fantasy Contest"
        breadcrumbs={[{ label: 'Fantasy', href: '/fantasy' }, { label: 'Contest' }]}
        hideFooterMobile
      >
        <div className="bg-surface rounded-card-lg shadow-card p-10 text-center">
          <p className="text-muted font-tight text-[14px]">
            This contest doesn&apos;t exist, or you don&apos;t have access to it.
          </p>
        </div>
      </PageShell>
    );
  }

  const [league, standings, periods] = await Promise.all([
    contest.leagueId ? getLeague(contest.leagueId).catch(() => null) : Promise.resolve(null),
    getContestStandings(contest.id).catch(() => []),
    getContestPeriods(contest.id).catch(() => []),
  ]);
  const weeks = periodsToWeeks(periods);

  const breadcrumbs: Crumb[] = league
    ? [
        { label: 'Fantasy', href: '/fantasy' },
        { label: league.name, href: `/fantasy/leagues/${league.id}` },
        { label: contest.name },
      ]
    : [{ label: 'Fantasy', href: '/fantasy' }, { label: contest.name }];

  return (
    <PageShell
      title={contest.name}
      eyebrow="Fantasy Contest"
      breadcrumbs={breadcrumbs}
      hideFooterMobile
      controls={<CompetitionChip label={contest.competitionDef.shortLabel} season={contest.seasonYear} />}
    >
      <div className="space-y-8">
        {/* ── My team CTA (client island) ──────────────────────────────── */}
        <MyContestTeamCta contest={contest} />

        {/* ── Period schedule strip ────────────────────────────────────── */}
        {weeks.length > 0 && (
          <section aria-labelledby="schedule-heading">
            <h2
              id="schedule-heading"
              className="text-[11px] font-bold tracking-[0.16em] uppercase text-muted font-tight mb-3"
            >
              Schedule
            </h2>
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {weeks.map((w) => (
                <div
                  key={w.week}
                  className="flex-shrink-0 bg-surface rounded-card-sm shadow-soft px-4 py-2.5 min-w-[130px]"
                >
                  <div className="font-tight text-[12px] font-bold text-ink">
                    {formatWeekLabel(w.week)}
                  </div>
                  <div className="font-tight text-[10.5px] text-faint mt-0.5">
                    {periodLockLabel(w)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Standings ─────────────────────────────────────────────────── */}
        <section aria-labelledby="standings-heading">
          <h2
            id="standings-heading"
            className="font-display italic text-[26px] lg:text-[30px] font-bold tracking-[-0.02em] leading-[0.95] text-ink mb-4"
          >
            Standings
          </h2>

          {standings.length === 0 ? (
            <div className="bg-surface rounded-card-lg shadow-card p-8 text-center">
              <p className="text-muted font-tight text-[14px]">No teams yet — be the first to build one.</p>
            </div>
          ) : (
            <div className="bg-surface rounded-card-lg shadow-card overflow-hidden">
              <div className="hidden sm:grid grid-cols-[2.5rem_1fr_auto] items-center px-5 py-3">
                <span className="text-[10px] font-bold tracking-[0.16em] uppercase text-faint font-tight">#</span>
                <span className="text-[10px] font-bold tracking-[0.16em] uppercase text-faint font-tight">Team</span>
                <span className="text-[10px] font-bold tracking-[0.16em] uppercase text-faint font-tight text-right">Pts</span>
              </div>
              <ol aria-label="Contest standings">
                {standings.map((row, idx) => {
                  const rank = idx + 1;
                  const isTop3 = rank <= 3;
                  return (
                    <li key={row.teamId}>
                      <Link
                        href={`/fantasy/team/${row.teamId}`}
                        className={[
                          'grid grid-cols-[2.5rem_1fr_auto] items-center px-5 py-3.5',
                          'no-underline transition-colors duration-150',
                          'hover:bg-surface-hi',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
                          'border-t border-hairline sm:first:border-t-0',
                        ].join(' ')}
                      >
                        <span
                          className={[
                            'font-tight text-[13px] font-bold tabular',
                            isTop3 ? 'text-accent' : 'text-faint',
                          ].join(' ')}
                          aria-label={`Rank ${rank}`}
                        >
                          {rank}
                        </span>
                        <span className="min-w-0 flex flex-col gap-0.5">
                          <span className="font-tight text-[14px] font-semibold text-ink truncate">
                            {row.teamName}
                          </span>
                          {(row.ownerDisplayName || row.ownerUsername) && (
                            <span className="font-tight text-[11px] text-muted truncate">
                              {row.ownerDisplayName ?? row.ownerUsername}
                            </span>
                          )}
                        </span>
                        <span className="font-tight text-[15px] font-bold tabular text-right text-ink">
                          {row.totalPoints}
                          <span className="text-[11px] font-medium text-faint ml-1">pts</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
        </section>
      </div>
    </PageShell>
  );
}

function CompetitionChip({ label, season }: { label: string; season: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold tracking-[0.12em] uppercase px-2.5 py-[5px] rounded-full bg-accent/10 text-accent">
      {label} · {season}
    </span>
  );
}

function periodLockLabel(w: { locked: boolean; complete: boolean; lockAt: string | null }): string {
  if (w.complete) return 'Final';
  if (w.locked) return 'Locked';
  if (!w.lockAt) return 'Open';
  const d = new Date(w.lockAt);
  if (Number.isNaN(d.getTime())) return 'Open';
  const s = d.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'America/New_York',
  });
  return `Locks ${s}`;
}

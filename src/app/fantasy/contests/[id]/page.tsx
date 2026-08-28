// /fantasy/contests/[id] — canonical contest page for non-UFA games (Club
// Nationals first). UFA contests live at /fantasy/ufa/l/[id] (2026-08-27
// game-hub IA inversion) — redirect there. Carries the same league surfaces
// as the UFA page (draft card, members + commissioner tools) so a non-UFA
// league is fully manageable from its game context (2026-08-27 Club Nats
// activation).

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageShell } from '@/components/page-shell';
import {
  getContest,
  getLeague,
  getLeagueMembers,
  getContestStandings,
  getContestPeriods,
  periodsToWeeks,
} from '@/lib/fantasy/leagues';
import { formatWeekLabel } from '@/lib/fantasy/weeks';
import { getGame, draftOpensDate } from '@/lib/fantasy/games';
import { MyContestTeamCta } from '@/components/fantasy/my-contest-team-cta';
import { LeagueMembersPanel } from '@/components/fantasy/league-members-panel';
import { DraftScheduleCard } from '@/components/fantasy/draft-schedule-card';
import type { Crumb } from '@/components/breadcrumbs';

export const revalidate = 60;

export default async function ContestPage({ params }: { params: { id: string } }) {
  const contest = await getContest(params.id).catch(() => null);

  if (contest?.competition === 'ufa') redirect(`/fantasy/ufa/l/${contest.id}`);

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

  const [league, standings, periods, members] = await Promise.all([
    contest.leagueId ? getLeague(contest.leagueId).catch(() => null) : Promise.resolve(null),
    getContestStandings(contest.id).catch(() => []),
    getContestPeriods(contest.id).catch(() => []),
    contest.leagueId ? getLeagueMembers(contest.leagueId).catch(() => []) : Promise.resolve([]),
  ]);
  const weeks = periodsToWeeks(periods);

  // Event contests: drafts open the Saturday before the event (mirrors the DB
  // draft window). The 'event' period's lock_at IS the event start (midnight
  // ET), so derive the calendar date from it in ET.
  const eventLockAt = weeks.find((w) => w.week === 'event')?.lockAt ?? null;
  const eventDateEt = eventLockAt
    ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(eventLockAt))
    : null;
  const draftOpens = eventDateEt ? draftOpensDate(eventDateEt) : null;

  const game = getGame(contest.competition);
  const gameHome = game?.status === 'live' ? `/fantasy/${contest.competition}` : '/fantasy';

  const breadcrumbs: Crumb[] = [
    { label: 'Fantasy', href: '/fantasy' },
    ...(game?.status === 'live' ? [{ label: game.name, href: gameHome }] : []),
    ...(league ? [{ label: league.name, href: `/fantasy/leagues/${league.id}` }] : []),
    { label: contest.name },
  ];

  return (
    <PageShell
      title={contest.name}
      eyebrow="Fantasy Contest"
      breadcrumbs={breadcrumbs}
      hideFooterMobile
      controls={<CompetitionChip label={contest.competitionDef.shortLabel} season={contest.seasonYear} />}
    >
      <div className="space-y-8">
        {/* ── Section jump-nav (anchor links, same pattern as the UFA
            league page — Server Component, deep-linkable) ──────────────── */}
        <nav aria-label="League sections" className="flex items-center gap-5 border-b border-hairline">
          {[
            ...(weeks.length > 0 ? [{ href: '#schedule-heading', label: 'Schedule' }] : []),
            { href: '#standings-heading', label: 'Standings' },
            ...(league ? [{ href: '#members-heading', label: 'Members' }] : []),
          ].map((s) => (
            <a
              key={s.href}
              href={s.href}
              className={[
                'whitespace-nowrap no-underline pb-2 border-b-2 border-transparent',
                'text-[12px] font-bold tracking-[0.1em] uppercase font-tight',
                'text-muted hover:text-ink hover:border-accent transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              ].join(' ')}
            >
              {s.label}
            </a>
          ))}
        </nav>

        {/* ── My team CTA (client island) ──────────────────────────────── */}
        <MyContestTeamCta contest={contest} />

        {/* ── Draft (private leagues only — public contests never draft) ── */}
        {league && (
          <DraftScheduleCard
            contestId={contest.id}
            leagueId={league.id}
            draftPath={`/fantasy/contests/${contest.id}/draft`}
            draftOpens={draftOpens}
          />
        )}

        {/* ── Period schedule strip ────────────────────────────────────── */}
        {weeks.length > 0 && (
          <section aria-labelledby="schedule-heading" className="scroll-mt-24">
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
        <section aria-labelledby="standings-heading" className="scroll-mt-24">
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
                        href={`/fantasy/contests/${contest.id}/t/${row.teamId}`}
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

        {/* ── Members + commissioner tools ─────────────────────────────────
            Private leagues only — public/global contests have no members. */}
        {league && (
          <section aria-labelledby="members-heading" className="scroll-mt-24">
            <h2
              id="members-heading"
              className="font-display italic text-[26px] lg:text-[30px] font-bold tracking-[-0.02em] leading-[0.95] text-ink mb-4"
            >
              Members
            </h2>
            <LeagueMembersPanel leagueId={league.id} members={members} onLeaveRedirect={gameHome} />
          </section>
        )}
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

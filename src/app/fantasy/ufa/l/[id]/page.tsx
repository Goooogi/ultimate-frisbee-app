// /fantasy/ufa/l/[id] — LEAGUE-IN-GAME (canonical UFA contest page). Server
// shell: contest header, standings (public), members + commissioner tools.
// Client islands: my-team CTA, members panel. Moved from
// /fantasy/contests/[id] for UFA contests (2026-08-27 game-hub IA inversion)
// — the old route now redirects here for competition==='ufa'; other
// competitions still render at the old path until they get their own
// game-scoped route (P1+).
//
// Commissioner tools (invite/regenerate/remove/leave) are surfaced here via
// the SAME LeagueMembersPanel the league umbrella uses (P1, 2026-08-27) — a
// commissioner never has to leave the game context to manage the league.
// Only rendered when the contest belongs to a private league (public/global
// contests have no members to manage).

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageShell } from '@/components/page-shell';
import {
  getContest,
  getLeague,
  getLeagueMembers,
  getContestStandings,
} from '@/lib/fantasy/leagues';
import { MyContestTeamCta } from '@/components/fantasy/my-contest-team-cta';
import { LeagueMembersPanel } from '@/components/fantasy/league-members-panel';
import { DraftScheduleCard } from '@/components/fantasy/draft-schedule-card';
import type { Crumb } from '@/components/breadcrumbs';

export const revalidate = 60;

export default async function UfaLeagueInGamePage({ params }: { params: { id: string } }) {
  const contest = await getContest(params.id).catch(() => null);

  if (!contest) {
    return (
      <PageShell
        title="League"
        eyebrow="UFA Fantasy"
        breadcrumbs={[{ label: 'UFA Fantasy', href: '/fantasy/ufa' }, { label: 'League' }]}
        hideFooterMobile
      >
        <div className="bg-surface rounded-card-lg shadow-card p-10 text-center">
          <p className="text-muted font-tight text-[14px]">
            This league doesn&apos;t exist, or you don&apos;t have access to it.
          </p>
        </div>
      </PageShell>
    );
  }

  // This route is UFA-canonical; a non-UFA contest id landing here (stale
  // link, manual URL) has no game-scoped home yet — its real page is the
  // legacy /fantasy/contests/[id] route (P1+ will add the rest).
  if (contest.competition !== 'ufa') notFound();

  const [league, standings, members] = await Promise.all([
    contest.leagueId ? getLeague(contest.leagueId).catch(() => null) : Promise.resolve(null),
    getContestStandings(contest.id).catch(() => []),
    contest.leagueId ? getLeagueMembers(contest.leagueId).catch(() => []) : Promise.resolve([]),
  ]);

  const breadcrumbs: Crumb[] = league
    ? [
        { label: 'UFA Fantasy', href: '/fantasy/ufa' },
        { label: league.name, href: `/fantasy/leagues/${league.id}` },
        { label: contest.name },
      ]
    : [{ label: 'UFA Fantasy', href: '/fantasy/ufa' }, { label: contest.name }];

  return (
    <PageShell
      title={contest.name}
      eyebrow="UFA Fantasy"
      breadcrumbs={breadcrumbs}
      hideFooterMobile
      controls={<CompetitionChip label={contest.competitionDef.shortLabel} season={contest.seasonYear} />}
    >
      <div className="space-y-8">
        {/* ── Section jump-nav ─────────────────────────────────────────────
            ESPN-style in-league navigation. Anchor links rather than stateful
            tabs so the page stays a Server Component (App Health rule: no
            client JS for what a hash can do) and every section stays
            deep-linkable. Standings first — it's the default view on ESPN,
            Yahoo and Sleeper alike. */}
        <nav aria-label="League sections" className="flex items-center gap-5 border-b border-hairline">
          {[
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

        {/* ── Draft (private leagues only — the Public League stays
            pick-anyone and never drafts, per Hunter's 2026-08-27 decision) ── */}
        {league && (
          <DraftScheduleCard
            contestId={contest.id}
            leagueId={league.id}
            draftPath={`/fantasy/ufa/l/${contest.id}/draft`}
          />
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
              <ol aria-label="League standings">
                {standings.map((row, idx) => {
                  const rank = idx + 1;
                  const isTop3 = rank <= 3;
                  return (
                    <li key={row.teamId}>
                      <Link
                        href={`/fantasy/ufa/l/${contest.id}/t/${row.teamId}`}
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
            <LeagueMembersPanel
              leagueId={league.id}
              members={members}
              onLeaveRedirect="/fantasy/ufa"
            />
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

// /fantasy/contests/[id]/t/[teamId] — Public contest-scoped team view.
// Competition-agnostic: works for any contest (event-mode or weekly-stats).
// UFA contests have a canonical mirror at /fantasy/ufa/l/[id]/t/[teamId]
// (P1, 2026-08-27) — both render the same ContestTeamView. Server Component,
// public + ISR like sibling contest pages.

import { notFound } from 'next/navigation';
import { PageShell } from '@/components/page-shell';
import { getContest, getLeague, getContestTeam } from '@/lib/fantasy/leagues';
import { ContestTeamView } from '@/components/fantasy/contest-team-view';
import type { Crumb } from '@/components/breadcrumbs';

export const revalidate = 60;

export default async function ContestTeamPage({
  params,
}: {
  params: { id: string; teamId: string };
}) {
  const contest = await getContest(params.id).catch(() => null);
  if (!contest) notFound();

  const [league, team] = await Promise.all([
    contest.leagueId ? getLeague(contest.leagueId).catch(() => null) : Promise.resolve(null),
    getContestTeam(params.teamId).catch(() => null),
  ]);
  if (!team || team.contestId !== contest.id) notFound();

  const breadcrumbs: Crumb[] = league
    ? [
        { label: 'Fantasy', href: '/fantasy' },
        { label: league.name, href: `/fantasy/leagues/${league.id}` },
        { label: contest.name, href: `/fantasy/contests/${contest.id}` },
        { label: team.teamName },
      ]
    : [
        { label: 'Fantasy', href: '/fantasy' },
        { label: contest.name, href: `/fantasy/contests/${contest.id}` },
        { label: team.teamName },
      ];

  return (
    <PageShell
      title={team.teamName}
      eyebrow={`${contest.competitionDef.shortLabel} · ${contest.seasonYear}`}
      subtitle={
        team.ownerDisplayName || team.ownerUsername
          ? `${team.ownerDisplayName ?? `@${team.ownerUsername}`} · ${contest.name}`
          : contest.name
      }
      breadcrumbs={breadcrumbs}
      hideFooterMobile
    >
      <ContestTeamView contest={contest} teamId={params.teamId} />
    </PageShell>
  );
}

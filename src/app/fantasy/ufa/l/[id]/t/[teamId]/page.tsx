// /fantasy/ufa/l/[id]/t/[teamId] — canonical UFA team view inside the
// league-in-game page. Reuses the same competition-agnostic ContestTeamView
// as /fantasy/contests/[id]/t/[teamId] (P1, 2026-08-27) — this route just
// pins the breadcrumb/eyebrow to the UFA game context and 404s non-UFA
// contest ids (their canonical team view is the /fantasy/contests mirror).

import { notFound } from 'next/navigation';
import { PageShell } from '@/components/page-shell';
import { getContest, getLeague, getContestTeam } from '@/lib/fantasy/leagues';
import { ContestTeamView } from '@/components/fantasy/contest-team-view';
import type { Crumb } from '@/components/breadcrumbs';

export const revalidate = 60;

export default async function UfaLeagueInGameTeamViewPage({
  params,
}: {
  params: { id: string; teamId: string };
}) {
  const contest = await getContest(params.id).catch(() => null);
  if (!contest) notFound();
  if (contest.competition !== 'ufa') notFound();

  const [league, team] = await Promise.all([
    contest.leagueId ? getLeague(contest.leagueId).catch(() => null) : Promise.resolve(null),
    getContestTeam(params.teamId).catch(() => null),
  ]);
  if (!team || team.contestId !== contest.id) notFound();

  const breadcrumbs: Crumb[] = [
    { label: 'UFA Fantasy', href: '/fantasy/ufa' },
    ...(league ? [{ label: league.name, href: `/fantasy/leagues/${league.id}` }] : []),
    { label: contest.name, href: `/fantasy/ufa/l/${contest.id}` },
    { label: team.teamName },
  ];

  return (
    <PageShell
      title={team.teamName}
      eyebrow="UFA Fantasy"
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

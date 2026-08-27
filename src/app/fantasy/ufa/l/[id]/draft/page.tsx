// /fantasy/ufa/l/[id]/draft — canonical UFA draft room. Server shell: fetch
// contest + teams + commissioner role, then hand off to the shared
// DraftRoom client island (draft state itself is realtime — see
// src/components/fantasy/draft-room.tsx). 404s any non-UFA contest id,
// mirroring the parent league-in-game page's canonical guard.

import { notFound } from 'next/navigation';
import { PageShell } from '@/components/page-shell';
import { getContest, getLeague, getContestStandings } from '@/lib/fantasy/leagues';
import { DraftRoom } from '@/components/fantasy/draft-room';
import type { Crumb } from '@/components/breadcrumbs';

export const revalidate = 60;

export default async function UfaDraftRoomPage({ params }: { params: { id: string } }) {
  const contest = await getContest(params.id).catch(() => null);
  if (!contest) notFound();
  if (contest.competition !== 'ufa') notFound();

  const [league, standings] = await Promise.all([
    contest.leagueId ? getLeague(contest.leagueId).catch(() => null) : Promise.resolve(null),
    getContestStandings(contest.id).catch(() => []),
  ]);

  const breadcrumbs: Crumb[] = league
    ? [
        { label: 'UFA Fantasy', href: '/fantasy/ufa' },
        { label: league.name, href: `/fantasy/leagues/${league.id}` },
        { label: contest.name, href: `/fantasy/ufa/l/${contest.id}` },
        { label: 'Draft' },
      ]
    : [
        { label: 'UFA Fantasy', href: '/fantasy/ufa' },
        { label: contest.name, href: `/fantasy/ufa/l/${contest.id}` },
        { label: 'Draft' },
      ];

  return (
    <PageShell title="Draft Room" eyebrow={contest.name} breadcrumbs={breadcrumbs} hideFooterMobile>
      <DraftRoom
        contest={contest}
        teams={standings.map((s) => ({
          id: s.teamId,
          teamName: s.teamName,
          ownerDisplayName: s.ownerDisplayName,
          ownerUsername: s.ownerUsername,
        }))}
        basePath={`/fantasy/ufa/l/${contest.id}`}
      />
    </PageShell>
  );
}

// /fantasy/contests/[id]/draft — generic draft room for non-UFA contests
// (future games: Club Nationals, PUL, WUL, etc). UFA contests redirect to
// their canonical /fantasy/ufa/l/[id]/draft, mirroring the parent contest
// page's redirect. Same shared DraftRoom island as the UFA route.

import { redirect, notFound } from 'next/navigation';
import { PageShell } from '@/components/page-shell';
import { getContest, getLeague, getContestStandings } from '@/lib/fantasy/leagues';
import { DraftRoom } from '@/components/fantasy/draft-room';
import type { Crumb } from '@/components/breadcrumbs';

export const revalidate = 60;

export default async function ContestDraftRoomPage({ params }: { params: { id: string } }) {
  const contest = await getContest(params.id).catch(() => null);
  if (!contest) notFound();
  if (contest.competition === 'ufa') redirect(`/fantasy/ufa/l/${contest.id}/draft`);

  const [league, standings] = await Promise.all([
    contest.leagueId ? getLeague(contest.leagueId).catch(() => null) : Promise.resolve(null),
    getContestStandings(contest.id).catch(() => []),
  ]);

  const breadcrumbs: Crumb[] = league
    ? [
        { label: 'Fantasy', href: '/fantasy' },
        { label: league.name, href: `/fantasy/leagues/${league.id}` },
        { label: contest.name, href: `/fantasy/contests/${contest.id}` },
        { label: 'Draft' },
      ]
    : [
        { label: 'Fantasy', href: '/fantasy' },
        { label: contest.name, href: `/fantasy/contests/${contest.id}` },
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
        basePath={`/fantasy/contests/${contest.id}`}
      />
    </PageShell>
  );
}

// /fantasy/l/[contestId]/draft — canonical in-league draft room. Server
// shell: fetch contest + standings (→ teams), then hand off to the shared
// DraftRoom client island (draft state itself is realtime — see
// src/components/fantasy/draft-room.tsx). Renders as plain content inside
// src/app/fantasy/l/[contestId]/layout.tsx (AppShell + league header + nav) —
// no PageShell here.

import { notFound } from 'next/navigation';
import { getContest, getContestStandings } from '@/lib/fantasy/leagues';
import { DraftRoom } from '@/components/fantasy/draft-room';

export const revalidate = 60;

export default async function LeagueDraftRoomPage({ params }: { params: { contestId: string } }) {
  const contest = await getContest(params.contestId).catch(() => null);
  if (!contest) notFound();
  const standings = await getContestStandings(contest.id).catch(() => []);

  return (
    <DraftRoom
      contest={contest}
      teams={standings.map((s) => ({
        id: s.teamId,
        teamName: s.teamName,
        ownerDisplayName: s.ownerDisplayName,
        ownerUsername: s.ownerUsername,
      }))}
      basePath={`/fantasy/l/${contest.id}`}
    />
  );
}

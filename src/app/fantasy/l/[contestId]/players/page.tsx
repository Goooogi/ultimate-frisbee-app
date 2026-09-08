// /fantasy/l/[contestId]/players — the Players tab. Chrome from the parent
// layout; body is PlayersPanel (search, filter, add/drop).

import { getContest } from '@/lib/fantasy/leagues';
import { PlayersPanel } from '@/components/fantasy/players-panel';

export const revalidate = 60;

export default async function ContestPlayersPage({ params }: { params: { contestId: string } }) {
  const contest = await getContest(params.contestId).catch(() => null);
  if (!contest) return null;

  return <PlayersPanel contest={contest} />;
}

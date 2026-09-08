// /fantasy/l/[contestId]/feed — league activity + chat. Private leagues only
// (reached via the chat-bubble icon in the league header, not a nav tab —
// mirrors mobile's LeagueShell chrome, see league-header.tsx). Chrome comes
// entirely from the parent layout; this page renders only the feed body.

import { notFound } from 'next/navigation';
import { getContest } from '@/lib/fantasy/leagues';
import { LeagueFeed } from '@/components/fantasy/league-feed';

export const revalidate = 0;
export const dynamic = 'force-dynamic';

export default async function ContestFeedPage({ params }: { params: { contestId: string } }) {
  const contest = await getContest(params.contestId).catch(() => null);
  if (!contest || !contest.leagueId) notFound();

  return <LeagueFeed contest={contest} />;
}

// /fantasy/l/[contestId]/t/[teamId] — a team's Fantasy Profile inside a league
// (FantasyProfile). Chrome (league header + sub-tabs) comes from the parent
// layout. Proposing a trade happens here, from another team's profile.

import Link from 'next/link';
import { getContest, getContestTeam } from '@/lib/fantasy/leagues';
import { FantasyProfile } from '@/components/fantasy/profile/fantasy-profile';

export const revalidate = 60;

export default async function ContestTeamDetailPage({
  params,
}: {
  params: { contestId: string; teamId: string };
}) {
  const contest = await getContest(params.contestId).catch(() => null);
  if (!contest) return null;

  const team = await getContestTeam(params.teamId).catch(() => null);
  if (!team || team.contestId !== contest.id) {
    return (
      <div className="bg-surface rounded-card-lg shadow-card p-10 text-center">
        <p className="text-muted font-tight text-[14px]">This team doesn&apos;t exist in this league.</p>
        <Link
          href={`/fantasy/l/${contest.id}`}
          className="inline-flex items-center gap-1.5 mt-4 text-accent font-tight text-[13px] font-bold hover:opacity-80 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
        >
          Back to league
        </Link>
      </div>
    );
  }

  return <FantasyProfile contest={contest} teamId={params.teamId} />;
}

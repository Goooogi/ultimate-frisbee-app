// /fantasy/l/[contestId]/t/[teamId] — public team view inside a league.
// Adapted from the legacy /fantasy/contests/[id]/t/[teamId] route to the new
// canonical in-league path; chrome (league header + sub-tabs) now comes from
// the parent layout instead of this page's own PageShell, so this renders
// only the team header + roster content.

import Link from 'next/link';
import { getContest, getContestTeam } from '@/lib/fantasy/leagues';
import { ContestTeamView } from '@/components/fantasy/contest-team-view';

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

  return (
    <div className="space-y-6">
      <div>
        {(team.ownerDisplayName || team.ownerUsername) && (
          <p className="font-tight text-[12.5px] text-muted mb-1">
            {team.ownerDisplayName ?? `@${team.ownerUsername}`}
          </p>
        )}
        <h1 className="m-0 font-display italic text-[28px] lg:text-[32px] font-bold tracking-[-0.02em] leading-[0.95] text-ink">
          {team.teamName}
        </h1>
      </div>
      <ContestTeamView contest={contest} teamId={params.teamId} />
    </div>
  );
}

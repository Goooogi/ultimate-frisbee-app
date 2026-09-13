// Fantasy — League Settings. Commissioner-only route reached from the league
// shell's gear icon (owned by the layout at ../layout.tsx, which already
// wraps this page in AppShell + league header/nav — this page renders ONLY
// the settings content).
//
// Thin server fetch, then hand off to the client island that owns gating,
// interactivity, and the logo-picker state.

import { notFound } from 'next/navigation';
import { getContest, getLeague } from '@/lib/fantasy/leagues';
import { getDraft, getDraftReadiness } from '@/lib/fantasy/draft-room';
import { SettingsContent } from '@/components/fantasy/settings/settings-content';

export const revalidate = 0;
export const dynamic = 'force-dynamic';

export default async function FantasyLeagueSettingsPage({
  params,
}: {
  params: { contestId: string };
}) {
  const contest = await getContest(params.contestId);
  if (!contest) notFound();

  const [league, draft, readiness] = await Promise.all([
    getLeague(contest.leagueId).catch(() => null),
    getDraft(contest.id).catch(() => null),
    getDraftReadiness(contest.id).catch(() => null),
  ]);

  // Role isn't fetched here — resolved client-side in SettingsContent (same
  // pattern as league-home-client.tsx), since this is a gated, interactive
  // screen and every write RPC re-checks commissioner status server-side
  // regardless.

  return <SettingsContent contest={contest} league={league} draft={draft} readiness={readiness} />;
}

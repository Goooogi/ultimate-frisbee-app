// /fantasy/my-team — legacy shortcut, redirects into the current UFA Public
// League's team page. Kept for old links (next.config.mjs also redirects
// /fantasy/team* here). Always dynamic — resolves "the current season's
// global contest" fresh on every hit rather than caching a stale one.

import { redirect } from 'next/navigation';
import { getGlobalContest } from '@/lib/fantasy/leagues';
import { fantasySeasonYear } from '@/lib/fantasy/data';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function MyTeamRedirectPage() {
  const contest = await getGlobalContest('ufa', fantasySeasonYear()).catch(() => null);
  if (contest) redirect(`/fantasy/l/${contest.id}/team`);
  redirect('/fantasy');
}

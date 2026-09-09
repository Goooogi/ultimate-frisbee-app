// /fantasy/team/[id] — RESOLVER for old public-team links (the Public League's
// /fantasy/team/{id} and /fantasy/ufa/team/{id} both redirect here). A static
// redirect can't know which league a team belongs to, so this looks the team
// up and forwards to its canonical contest-scoped view.

import { notFound, redirect } from 'next/navigation';
import { getContestTeam } from '@/lib/fantasy/leagues';

export const dynamic = 'force-dynamic';

export default async function TeamResolverPage({ params }: { params: { id: string } }) {
  const team = await getContestTeam(params.id).catch(() => null);
  if (!team) notFound();
  redirect(`/fantasy/l/${team.contestId}/t/${team.id}`);
}

// /players/[id]/thread — "The Thread": a player's connection web (teammates,
// shared-history links between them, and paths to elite players). Powered by the
// precomputed player_edges graph (get_player_thread RPC). Name-anchored, like
// the profile it links from.

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getUnifiedPlayerProfile } from '@/lib/unified-player';
import { getPlayerThread } from '@/lib/players/connections';
import { PlayerThreadView } from '@/components/players/player-thread-view';

export const dynamic = 'force-dynamic';

interface Props {
  params: { id: string };
  searchParams: { from?: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const profile = await getUnifiedPlayerProfile(params.id).catch(() => null);
  if (!profile) return { title: 'The Thread · The Layout' };
  return {
    title: `${profile.displayName} — The Thread · The Layout`,
    description: `${profile.displayName}'s connection web: teammates, shared history, and paths to the game's best.`,
  };
}

export default async function ThreadPage({ params, searchParams }: Props) {
  const profile = await getUnifiedPlayerProfile(params.id).catch(() => null);
  if (!profile) notFound();

  const thread = await getPlayerThread(profile.displayName, 12, 40);

  return (
    <PlayerThreadView
      thread={thread}
      anchorDisplayName={profile.displayName}
      anchorHeadshotUrl={profile.headshotUrl}
      backHref={`/players/${params.id}${searchParams.from ? `?from=${searchParams.from}` : ''}`}
    />
  );
}

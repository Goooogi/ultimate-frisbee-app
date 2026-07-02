// /players/[id] — unified UFA + USAU player profile.
//
// One page for one human. Accepts either a UFA slug ("tdecraene") or a
// USAU UUID; the unified profile layer fetches both leagues' data and
// merges by display name. See src/lib/unified-player.ts for the merge.
//
// No league switcher renders here — the profile combines both leagues,
// so toggling between them inside the profile doesn't mean anything. The
// switcher reappears on list/feed pages (/scores, /teams, /players).

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getUnifiedPlayerProfile } from '@/lib/unified-player';
import { UnifiedProfile } from '@/components/players/unified-player-profile';
import { DivisionSync } from '@/components/players/division-sync';
import { getApprovedContentForPlayer } from '@/lib/player-content/server';

// Content rows are user-uploaded and approved on demand — they can change
// any time without an underlying data refresh. Drop the page-level revalidate
// so each request re-fetches; the upstream UFA/USAU calls remain cached via
// their own TTL config.
export const dynamic = 'force-dynamic';

interface Props {
  params: { id: string };
  // `from` records which league's list/feed the user arrived from, so the
  // "< Players" breadcrumb returns them to that league rather than always
  // defaulting to the UFA (root) players list. Absent → root /players.
  searchParams: { from?: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const profile = await getUnifiedPlayerProfile(params.id).catch(() => null);
  if (!profile) return { title: 'Player not found · The Layout' };
  return { title: `${profile.displayName} · The Layout` };
}

export default async function PlayerProfilePage({ params, searchParams }: Props) {
  const profile = await getUnifiedPlayerProfile(params.id).catch(() => null);
  if (!profile) notFound();

  const content = await getApprovedContentForPlayer(profile.anchorLeague, profile.anchorId);

  return (
    <>
      <DivisionSync division={profile.mostRecentUsauDivision} />
      <UnifiedProfile profile={profile} content={content} fromLeague={searchParams.from} />
    </>
  );
}

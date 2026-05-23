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

export const revalidate = 3600;

interface Props {
  params: { id: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const profile = await getUnifiedPlayerProfile(params.id).catch(() => null);
  if (!profile) return { title: 'Player not found · The Layout' };
  return { title: `${profile.displayName} · The Layout` };
}

export default async function PlayerProfilePage({ params }: Props) {
  const profile = await getUnifiedPlayerProfile(params.id).catch(() => null);
  if (!profile) notFound();
  return <UnifiedProfile profile={profile} />;
}

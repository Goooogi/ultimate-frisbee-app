// /utcg — Ultimate Trading Card Game. Standalone sub-app, sibling of /12-0.
// Server component: resolves the signed-in user's wallet + owned collection
// once via getUtcgSnapshot() and hands it to the client game. All further
// mutations (packs/quicksell/match) go through src/lib/utcg/actions.ts RPCs;
// this page never re-renders except via router.refresh().

import { AppRail } from '@/components/app-rail';
import { UtcgGame } from '@/components/utcg/utcg-game';
import { getUtcgSnapshot } from '@/lib/utcg/server';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'UTCG · The Layout',
  description:
    'Collect UFA player cards, open packs, and build a squad — can you go undefeated?',
};

// Render at request time — this page reads live per-user Supabase data
// (wallet + owned cards). Same rationale as /12-0's dynamic export.
export const dynamic = 'force-dynamic';

export default async function UtcgPage() {
  const snapshot = await getUtcgSnapshot();

  return (
    <div className="utcg-theme min-h-[100dvh] flex flex-col bg-bg text-ink">
      <AppRail />
      <main className="flex-1 flex flex-col">
        <UtcgGame snapshot={snapshot} />
      </main>
    </div>
  );
}

// /utcg — Ultimate Trading Card Game. Standalone sub-app, sibling of /12-0.
// Server component: resolves the signed-in user's wallet + owned collection
// once via getUtcgSnapshot() and hands it to the client game. All further
// mutations (packs/quicksell/match) go through src/lib/utcg/actions.ts RPCs;
// this page never re-renders except via router.refresh().

import { notFound } from 'next/navigation';
import { AppRail } from '@/components/app-rail';
import { UtcgGame } from '@/components/utcg/utcg-game';
import { getUtcgSnapshot } from '@/lib/utcg/server';
import { createClient } from '@/lib/supabase/server';
import { canUseUtcg } from '@/lib/auth/types';
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
  // UTCG is in beta — restricted to admins + beta testers. Gate server-side so
  // the route reads as non-existent (notFound) to everyone else; the nav also
  // hides the link. A signed-out visitor has no role → blocked. Matches the
  // /admin gating pattern.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (!canUseUtcg(profile?.role)) notFound();

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

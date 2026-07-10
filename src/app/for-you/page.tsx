// "For You" page — personalized feed of the signed-in user's favorite leagues
// & teams. Favorites + games/standings are all LIVE: getMyFavorites() then the
// getForYouFeed() server action fans out real per-league data (see
// src/lib/for-you/live-data.ts).

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthGate } from '@/components/auth/auth-gate';
import { ForYouContent } from '@/components/for-you/for-you-content';
import { FOR_YOU_ENABLED } from '@/lib/for-you/leagues';

export const metadata: Metadata = {
  title: 'For You · The Layout',
  description: 'Games, teams, and leagues you follow.',
};

export default function ForYouPage() {
  // Page is hidden while unfinished (2026-07-10). Direct-URL visits bounce home.
  // Flip FOR_YOU_ENABLED in lib/for-you/leagues.ts to bring it back.
  if (!FOR_YOU_ENABLED) redirect('/');

  return (
    <AuthGate
      headline="Made for you."
      subhead="Sign in to follow your favorite teams and leagues."
    >
      {/* ForYouContent renders PageShell itself (which composes AppShell), so
          the gate hands off directly to it — no double AppShell nesting. */}
      <ForYouContent />
    </AuthGate>
  );
}

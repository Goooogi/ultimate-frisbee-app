// The Games — live UFA feed (server component shell).
// Pulls today's slate from the UFA backend (cached 30s), sorts it so the
// soonest upcoming/live games are at top and finished games sit at the
// bottom, then hands it to the client FeedPage for theming + interactivity.

import { FeedPage } from '@/components/feed-page';
import { getCurrentGames } from '@/lib/ufa/client';
import { gameUiState } from '@/lib/ufa/format';
import { getToday } from '@/lib/today';
import type { UfaGame } from '@/lib/ufa/types';

export const revalidate = 30;

export default async function HomePage() {
  let games: UfaGame[] = [];
  try {
    games = await getCurrentGames();
  } catch (err) {
    // Upstream is down — render empty rather than crashing the page.
    console.error('Failed to fetch UFA current games:', err);
  }
  const today = getToday();
  return <FeedPage games={sortForFeed(games)} today={today} />;
}

/**
 * Sort order:
 *   1. Live games — earliest start first (active now → kick-off-soon).
 *   2. Upcoming games — earliest start first (next up at top).
 *   3. Final games — most recent first (today's results above last night's).
 *
 * Falls back to gameID alphabetical when a startTimestamp is missing on either
 * side so the order is still stable.
 */
function sortForFeed(games: UfaGame[]): UfaGame[] {
  const rank = (g: UfaGame): number => {
    const s = gameUiState(g);
    if (s.isLive) return 0;
    if (s.isUpcoming) return 1;
    return 2;
  };
  const ts = (g: UfaGame): number =>
    g.startTimestamp ? new Date(g.startTimestamp).getTime() : 0;

  return [...games].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    const ta = ts(a);
    const tb = ts(b);
    if (ta && tb && ta !== tb) {
      return ra === 2 ? tb - ta : ta - tb;
    }
    return a.gameID.localeCompare(b.gameID);
  });
}

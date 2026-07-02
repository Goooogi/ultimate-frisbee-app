// The Games — live UFA feed (server component shell).
// Pulls today's slate from the UFA backend (cached 30s), sorts it so the
// soonest upcoming/live games are at top and finished games sit at the
// bottom, then hands it to the client FeedPage for theming + interactivity.

import { FeedPage } from '@/components/feed-page';
import { getCurrentGames } from '@/lib/ufa/client';
import { gameUiState } from '@/lib/ufa/format';
import { getToday } from '@/lib/today';
import type { UfaGame } from '@/lib/ufa/types';
import { recentUsauTournamentCards, type UsauMajorWithChampions } from '@/lib/usau/data';
import { parseLeagueParam } from '@/lib/league';
import { PageShell } from '@/components/page-shell';
import { PulScores } from '@/components/pul/pul-scores';
import { PUL_CURRENT_SEASON } from '@/lib/pul/data';
import { WulScores } from '@/components/wul/wul-scores';
import { WUL_CURRENT_SEASON } from '@/lib/wul/data';

export const revalidate = 30;

interface Props {
  searchParams: { league?: string; div?: string; season?: string };
}

export default async function HomePage({ searchParams }: Props) {
  const league = parseLeagueParam(searchParams.league);

  // ── PUL branch ────────────────────────────────────────────────────────────
  if (league === 'pul') {
    const season = parseInt(searchParams.season ?? String(PUL_CURRENT_SEASON), 10) || PUL_CURRENT_SEASON;
    return (
      <PageShell title="Scores" eyebrow={`PUL · ${season} Season`}>
        <PulScores season={season} />
      </PageShell>
    );
  }
  // ── WUL branch ────────────────────────────────────────────────────────────
  if (league === 'wul') {
    const season = parseInt(searchParams.season ?? String(WUL_CURRENT_SEASON), 10) || WUL_CURRENT_SEASON;
    return (
      <PageShell title="Scores" eyebrow={`WUL · Western Ultimate League · ${season}`}>
        <WulScores season={season} />
      </PageShell>
    );
  }
  // ─────────────────────────────────────────────────────────────────────────

  // Only the USAU view consumes usauEvent (FeedPage renders it solely when
  // league==='usau'). The USAU lookup is a multi-query Supabase chain
  // (getCurrentEvent → getEvent) that previously ran on EVERY scores render
  // inside Promise.all — so the default UFA view blocked on data it never
  // showed, causing slow/stalled loads. Gate it on the active league so UFA
  // renders as fast as its own ~fast API call. (Mirrors how /schedule gates
  // its USAU fetch.) Switching to USAU re-fetches on that navigation.
  const [games, usauCards] = await Promise.all([
    getCurrentGames().catch((err) => {
      console.error('Failed to fetch UFA current games:', err);
      return [] as UfaGame[];
    }),
    league === 'usau'
      ? recentUsauTournamentCards().catch((err) => {
          console.error('Failed to load recent USAU tournaments:', err);
          return [] as UsauMajorWithChampions[];
        })
      : Promise.resolve<UsauMajorWithChampions[]>([]),
  ]);
  const today = getToday();
  return <FeedPage games={sortForFeed(games)} today={today} usauCards={usauCards} />;
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

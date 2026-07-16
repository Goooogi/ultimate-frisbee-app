// The Games — live UFA feed (server component shell).
// Pulls today's slate from the UFA backend (cached 30s), sorts it so the
// soonest upcoming/live games are at top and finished games sit at the
// bottom, then hands it to the client FeedPage for theming + interactivity.

import { FeedPage } from '@/components/feed-page';
import { getCurrentGames } from '@/lib/ufa/client';
import { gameUiState } from '@/lib/ufa/format';
import { getToday } from '@/lib/today';
import type { UfaGame } from '@/lib/ufa/types';
import { type UsauMajorWithChampions } from '@/lib/usau/data';
import { recentUsauTournamentCardsCached } from '@/lib/cached-readers';
import { parseLeagueParam, parseLevelParam } from '@/lib/league';
import { parseFlightsParam } from '@/lib/usau/flights';
import { PageShell } from '@/components/page-shell';
import { PulScores } from '@/components/pul/pul-scores';
import { getPulCurrentSeason } from '@/lib/pul/data';
import { WulScores } from '@/components/wul/wul-scores';
import { getWulCurrentSeason } from '@/lib/wul/data';

export const revalidate = 30;

interface Props {
  searchParams: { league?: string; div?: string; level?: string; season?: string; flight?: string };
}

export default async function HomePage({ searchParams }: Props) {
  const league = parseLeagueParam(searchParams.league);
  // USAU competition level (?level=club|college-d1|…). Only read on the USAU view.
  const usauLevel = parseLevelParam(searchParams.level);
  // USAU flight filter (?flight=pro,elite) — Triple Crown Tour tiers, Club only,
  // MULTI-select. Mirrors the /schedule tab so completed games filter by flight.
  // Flights are a CLUB-ONLY concept, so ignore any persisted ?flight when the
  // level isn't Club — otherwise switching Club→Masters carries the flight over
  // and filters out every Masters event (no masters event has a TCT flight),
  // showing a false "No completed tournaments" empty state. The UI already hides
  // the flight control off-Club; this makes the server query agree.
  const usauFlights = usauLevel === 'CLUB' ? parseFlightsParam(searchParams.flight) : [];

  // ── PUL branch ────────────────────────────────────────────────────────────
  if (league === 'pul') {
    const currentSeason = await getPulCurrentSeason();
    const season = parseInt(searchParams.season ?? String(currentSeason), 10) || currentSeason;
    return (
      <PageShell title="Scores" eyebrow={`PUL · ${season} Season`}>
        <PulScores season={season} />
      </PageShell>
    );
  }
  // ── WUL branch ────────────────────────────────────────────────────────────
  if (league === 'wul') {
    const currentSeason = await getWulCurrentSeason();
    const season = parseInt(searchParams.season ?? String(currentSeason), 10) || currentSeason;
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
      ? recentUsauTournamentCardsCached(usauLevel, usauFlights).catch((err) => {
          console.error('Failed to load recent USAU tournaments:', err);
          return [] as UsauMajorWithChampions[];
        })
      : Promise.resolve<UsauMajorWithChampions[]>([]),
  ]);
  const today = getToday();
  return (
    <FeedPage
      games={sortForFeed(games)}
      today={today}
      usauCards={usauCards}
      usauLevel={usauLevel}
    />
  );
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

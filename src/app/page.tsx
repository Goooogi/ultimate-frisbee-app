// The Layout — editorial-bento home page.
// Server component: fetches today's slate + current standings + team-stats in
// parallel and hands shaped data to the home components.
// Hero slot is now a cross-league carousel: UFA → USAU → PUL → WUL.
// Any league with no current content is simply omitted (null → no slide).

import React from 'react';
import type { Metadata } from 'next';
import {
  getAllGamesByYears,
  getCurrentGames,
  getStandings,
  getTeamStats,
  currentSeasonYear,
} from '@/lib/ufa/client';
import { gameUiState } from '@/lib/ufa/format';
import { pickGameOfTheWeek } from '@/lib/ufa/game-of-the-week';
import type { UfaGame, UfaStanding, UfaTeamStat } from '@/lib/ufa/types';
import { getCurrentEvent, getEvent, recentUsauMajorsWithChampions } from '@/lib/usau/data';
import { listPulGames, PUL_CURRENT_SEASON } from '@/lib/pul/data';
import { listWulGames, WUL_CURRENT_SEASON } from '@/lib/wul/data';
import { AppRail } from '@/components/app-rail';
import { HeroGameCard } from '@/components/home/hero-game-card';
import { HeroCarousel } from '@/components/home/hero-carousel';
import { HeroUsauSlide } from '@/components/home/hero-usau-slide';
import { HeroPulSlide } from '@/components/home/hero-pul-slide';
import { HeroWulSlide } from '@/components/home/hero-wul-slide';
import { LeaguesPanel } from '@/components/home/leagues-panel';
import {
  MultiLeagueGridSection,
  UfaTileGrid,
  UsauUpNextCard,
  UsauMajorGrid,
  PulRecentCard,
  WulRecentCard,
} from '@/components/home/multi-league-grid-section';
import { StandingsStrip } from '@/components/home/standings-strip';
import { SiteFooter } from '@/components/site-footer';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'The Layout · Ultimate Frisbee',
  description:
    'Live scores, standings, and stats for UFA, USAU, and more — The Layout.',
};

export default async function HomePage() {
  const year = currentSeasonYear();

  // Fetch all data sources in parallel. Cross-league fetches are gated with
  // try/catch via Promise.allSettled so a failure in one league never breaks
  // the page — the slide is simply omitted.
  const [gamesRes, seasonRes, standingsRes, teamStatsRes, usauRes, pulRes, wulRes, usauMajorsRes] =
    await Promise.allSettled([
      getCurrentGames(),
      // Season-wide fetch so "Up next" stays populated between weekends.
      getAllGamesByYears([year]),
      getStandings(),
      getTeamStats({ year }),
      // USAU: current tournament (any gender) — mirrors scores/page.tsx pattern.
      (async () => {
        const pick = await getCurrentEvent();
        if (!pick) return null;
        return await getEvent(pick.slug);
      })(),
      // PUL: upcoming-this-week else most-recent final.
      listPulGames({ season: PUL_CURRENT_SEASON }),
      // WUL: same rule.
      listWulGames({ season: WUL_CURRENT_SEASON }),
      // USAU: recent completed majors (TCT events) with champions, for "Recent results".
      recentUsauMajorsWithChampions(3),
    ]);

  const currentGames: UfaGame[] = gamesRes.status === 'fulfilled' ? gamesRes.value : [];
  const seasonGames: UfaGame[] = seasonRes.status === 'fulfilled' ? seasonRes.value : [];
  // Merge — current-week feed wins on id collision so live/score updates take
  // precedence over the schedule snapshot.
  const gamesByID = new Map<string, UfaGame>();
  for (const g of seasonGames) gamesByID.set(g.gameID, g);
  for (const g of currentGames) gamesByID.set(g.gameID, g);
  const games: UfaGame[] = Array.from(gamesByID.values());
  const standings: UfaStanding[] =
    standingsRes.status === 'fulfilled' ? standingsRes.value : [];
  const teamStats: UfaTeamStat[] =
    teamStatsRes.status === 'fulfilled' ? teamStatsRes.value.stats ?? [] : [];

  // ── Cross-league slide data ──────────────────────────────────────────────
  const usauEvent = usauRes.status === 'fulfilled' ? usauRes.value : null;

  // USAU belongs in "Up next" ONLY when its event is upcoming or in progress
  // (not yet ended). getCurrentEvent()'s weekend cadence can return LAST
  // weekend's already-completed event on a weekday — that's a Recent result,
  // not an "up next", and its scored pool games are finished, not upcoming.
  const todayIso = new Date().toISOString().slice(0, 10);
  const usauUpcomingEvent =
    usauEvent && (usauEvent.endDate ?? usauEvent.startDate ?? '') >= todayIso
      ? usauEvent
      : null;

  // PUL: prefer upcoming game this week; fall back to most-recent final.
  // "This week" = gameDate within 7 days of today (server time).
  const pulGames = pulRes.status === 'fulfilled' ? pulRes.value : [];
  const pulFeatured = pickLeagueGame(pulGames);

  // WUL: same rule.
  const wulGames = wulRes.status === 'fulfilled' ? wulRes.value : [];
  const wulFeatured = pickLeagueGame(wulGames);

  // Pick "Game of the Week" — most evenly-matched current-week game between
  // two good teams. See pickGameOfTheWeek() for the heuristic; the UFA API
  // doesn't expose a featured-game flag so we derive it from standings.
  const featured = pickGameOfTheWeek(games, standings) ?? games[0];

  // Records for the featured game's two teams (from current standings).
  const recordOf = (slug?: string): string | undefined => {
    if (!slug) return undefined;
    const s = standings.find((row) => row.teamID === slug);
    if (!s) return undefined;
    return s.ties > 0 ? `${s.wins}-${s.losses}-${s.ties}` : `${s.wins}-${s.losses}`;
  };
  const awayRec = recordOf(featured?.awayTeamID);
  const homeRec = recordOf(featured?.homeTeamID);

  // Two derived slices fed to the home grids:
  //  - upNext: next 4 games chronologically (Live or Upcoming, soonest first)
  //  - recent: last 4 results (Final, most recent first)
  // We intentionally don't exclude the featured (hero) game — when there's
  // only one upcoming game on the slate, hiding it leaves the row empty.
  // Showing it twice (hero + first tile in Up Next) reads as emphasis, not
  // duplication.
  const tsOf = (g: UfaGame): number =>
    g.startTimestamp ? new Date(g.startTimestamp).getTime() : 0;

  const upNext = games
    .filter((g) => {
      const s = gameUiState(g);
      return s.isUpcoming || s.isLive;
    })
    .sort((a, b) => tsOf(a) - tsOf(b))
    .slice(0, 4);

  const recent = games
    .filter((g) => gameUiState(g).isFinal)
    .sort((a, b) => tsOf(b) - tsOf(a))
    .slice(0, 4);

  // Recent USAU majors (TCT events with champions) — for "Recent results".
  const usauMajors = usauMajorsRes.status === 'fulfilled' ? usauMajorsRes.value : [];

  // For "Recent results": most-recent final game regardless of age (the
  // pickLeagueGame 7-day window is for the hero carousel only — for the
  // results grid we want to show the championship game even if the season
  // ended weeks ago).
  const pulChampGame =
    pulGames
      .filter((g) => g.status === 'final')
      .sort((a, b) => (b.gameDate ?? '').localeCompare(a.gameDate ?? ''))
      [0] ?? null;
  const wulChampGame =
    wulGames
      .filter((g) => g.status === 'final')
      .sort((a, b) => (b.gameDate ?? '').localeCompare(a.gameDate ?? ''))
      [0] ?? null;

  // ── Build carousel slides (order: UFA → USAU → PUL → WUL) ──────────────
  // Each builder returns null when the league has no current content; null
  // entries are filtered out so offseason leagues simply don't appear.
  const slides = [
    // UFA slide — always show the existing HeroGameCard (may render EmptyHero
    // in offseason, which is an intentional UFA-only empty state — keep it).
    <HeroGameCard key="ufa" game={featured} awayRecord={awayRec} homeRecord={homeRec} />,
    // USAU — tournament card, null when no current event.
    usauEvent ? <HeroUsauSlide key="usau" event={usauEvent} /> : null,
    // PUL — game card, null when no current/recent game.
    pulFeatured ? <HeroPulSlide key="pul" game={pulFeatured} /> : null,
    // WUL — game card, null when no current/recent game.
    wulFeatured ? <HeroWulSlide key="wul" game={wulFeatured} /> : null,
  ].filter((s): s is React.ReactElement => s !== null);

  return (
    <div className="min-h-screen bg-bg text-ink pb-20 lg:pb-0">
      {/* Global top rail — app switching + logo + account */}
      <AppRail />

      {/* HERO BENTO — carousel on the left, league panel stacked right */}
      <div className="px-5 lg:px-12 pt-6 lg:pt-9 pb-5 lg:pb-6 grid grid-cols-1 lg:grid-cols-[1.55fr_1fr] gap-5">
        <HeroCarousel slides={slides} />
        <LeaguesPanel />
      </div>

      <StandingsStrip
        standings={standings}
        teamStats={teamStats}
        seasonLabel={`UFA · ${year}`}
      />

      <MultiLeagueGridSection
        title="Up next"
        rightLink={{ label: 'Full schedule', href: '/schedule' }}
        rows={[
          // UFA — upcoming / live games.
          ...(upNext.length > 0
            ? [{ leagueKey: 'UFA', content: <UfaTileGrid games={upNext} /> }]
            : []),
          // USAU — only when the event is upcoming/in-progress (a completed
          // event is a Recent result, not an "up next").
          ...(usauUpcomingEvent
            ? [{ leagueKey: 'USAU', content: <UsauUpNextCard event={usauUpcomingEvent} /> }]
            : []),
        ]}
      />

      <MultiLeagueGridSection
        title="Recent results"
        rows={[
          // UFA — most-recent finals.
          ...(recent.length > 0
            ? [{ leagueKey: 'UFA', content: <UfaTileGrid games={recent} /> }]
            : []),
          // USAU — completed TCT majors with champions.
          ...(usauMajors.length > 0
            ? [{ leagueKey: 'USAU', content: <UsauMajorGrid majors={usauMajors} /> }]
            : []),
          // PUL — most-recent final game (championship emphasis when weekLabel='finals').
          ...(pulChampGame
            ? [{ leagueKey: 'PUL', content: <PulRecentCard game={pulChampGame} /> }]
            : []),
          // WUL — most-recent final game (champion flag when weekLabel='post' and it's
          // the final — we pass champion=true for any 'post' game since deriving the
          // exact postseason round here would require re-running deriveWulPostseasonRounds).
          ...(wulChampGame
            ? [{ leagueKey: 'WUL', content: <WulRecentCard game={wulChampGame} champion={wulChampGame.weekLabel === 'post'} /> }]
            : []),
        ]}
      />

      <SiteFooter />
    </div>
  );
}

// ─── Cross-league game picker ────────────────────────────────────────────────
// For PUL and WUL: prefer an upcoming game within the next 7 days; if none,
// fall back to the most recent final. Returns null when the season has no
// games in either window (e.g. offseason — that's the correct "no slide" case).
//
// Works with both PulGame and WulGame since both have the same shape:
//   { status: 'scheduled'|'final', gameDate: string|null }

import type { PulGame } from '@/lib/pul/data';
import type { WulGame } from '@/lib/wul/data';

/** Shared minimal shape for both PulGame and WulGame. */
type LeagueGame = { status: 'scheduled' | 'final'; gameDate: string | null };

function pickLeagueGameGeneric<T extends LeagueGame>(games: T[]): T | null {
  if (games.length === 0) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sevenDaysLater = new Date(today.getTime() + 7 * 86400_000);

  // Upcoming within next 7 days (soonest first)
  const upcoming = games
    .filter((g) => {
      if (g.status !== 'scheduled' || !g.gameDate) return false;
      const [y, m, d] = g.gameDate.split('-').map(Number);
      const gd = new Date(y, m - 1, d);
      return gd >= today && gd <= sevenDaysLater;
    })
    .sort((a, b) => (a.gameDate ?? '').localeCompare(b.gameDate ?? ''));

  if (upcoming.length > 0) return upcoming[0];

  // Most recent final within the last 7 days. A 7-day window lets a league
  // keep showing its just-played game for a week, then drops off — so once a
  // season ends, the slide disappears rather than lingering on stale results
  // (PUL/WUL ended ~1–2wk ago and should NOT show until next season's data).
  const sevenDaysAgo = new Date(today.getTime() - 7 * 86400_000);
  const recent = games
    .filter((g) => {
      if (g.status !== 'final' || !g.gameDate) return false;
      const [y, m, d] = g.gameDate.split('-').map(Number);
      const gd = new Date(y, m - 1, d);
      return gd >= sevenDaysAgo && gd <= today;
    })
    .sort((a, b) => (b.gameDate ?? '').localeCompare(a.gameDate ?? ''));

  return recent.length > 0 ? recent[0] : null;
}

// Typed wrappers — preserve the concrete return type so JSX props satisfy.
function pickLeagueGame(games: PulGame[]): PulGame | null;
function pickLeagueGame(games: WulGame[]): WulGame | null;
function pickLeagueGame(games: PulGame[] | WulGame[]): PulGame | WulGame | null {
  return pickLeagueGameGeneric(games as PulGame[]);
}

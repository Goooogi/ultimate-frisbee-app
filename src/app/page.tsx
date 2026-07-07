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
import { listPulGames, getPulCurrentSeason } from '@/lib/pul/data';
import { listWulGames, getWulCurrentSeason } from '@/lib/wul/data';
import { AppRail } from '@/components/app-rail';
import { HeroGameCard } from '@/components/home/hero-game-card';
import { HeroCarousel } from '@/components/home/hero-carousel';
import { HeroUsauSlide } from '@/components/home/hero-usau-slide';
import { HeroPulSlide } from '@/components/home/hero-pul-slide';
import { HeroWulSlide } from '@/components/home/hero-wul-slide';
import { HeroWfdfSlide } from '@/components/home/hero-wfdf-slide';
import { getCurrentWfdfEvent } from '@/lib/wfdf/data';
import { teamMeta } from '@/lib/ufa/teams';
import { LeaguesPanel } from '@/components/home/leagues-panel';
import {
  MultiLeagueGridSection,
  UfaTileGrid,
  UsauUpNextCard,
  UsauMajorGrid,
  PulRecentGrid,
  WulRecentGrid,
} from '@/components/home/multi-league-grid-section';
import { StandingsStrip } from '@/components/home/standings-strip';
import {
  PulStandingsSection,
  WulStandingsSection,
  UsauRankingsSection,
} from '@/components/home/league-standings-sections';
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
  const [gamesRes, seasonRes, standingsRes, teamStatsRes, usauRes, pulRes, wulRes, usauMajorsRes, wfdfRes] =
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
      // PUL: upcoming-this-week else most-recent final. Season resolved from the
      // data (newest present) so it self-advances and never queries an empty year.
      (async () => listPulGames({ season: await getPulCurrentSeason() }))(),
      // WUL: same rule.
      (async () => listWulGames({ season: await getWulCurrentSeason() }))(),
      // USAU: recent completed majors (TCT events) with champions, for "Recent results"
      // — 4 to match the other leagues' 4-card rows in that section.
      recentUsauMajorsWithChampions(4),
      // WFDF: current Worlds event — same Wed weekend-cadence flip as USAU
      // (e.g. WMUCC through Tue, then WJUC from Wednesday).
      getCurrentWfdfEvent(),
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

  // WFDF: current Worlds event (getCurrentWfdfEvent applies the same Wed
  // weekend-cadence flip as USAU). WFDF events are sparse, so unlike USAU we
  // only surface it when it's genuinely current — upcoming/in-progress, or it
  // ended within the last ~2 weeks — otherwise a months-old Worlds would linger
  // in the loop. (USAU can headline year-round because its calendar is dense.)
  const wfdfPick = wfdfRes.status === 'fulfilled' ? wfdfRes.value : null;
  const twoWeeksAgoIso = new Date(Date.now() - 14 * 86400_000).toISOString().slice(0, 10);
  const wfdfEvent =
    wfdfPick && (wfdfPick.endDate ?? wfdfPick.startDate ?? '') >= twoWeeksAgoIso
      ? wfdfPick
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

  // For "Recent results": up to 4 cards per league regardless of age (the
  // pickLeagueGame 7-day window is for the hero carousel only — for the
  // results grid we want to show the championship weekend even if the season
  // ended weeks ago). Order: final → semifinals (date desc) → most-recent
  // regular-season games, filling to 4. Neither league has quarterfinals, so
  // the 4th slot is always the latest regular-season game, not a quarter.
  const pulRecentFour = pickPulRecentFour(pulGames);
  const wulRecentFour = pickWulRecentFour(wulGames);

  // ── Build carousel slides (order: UFA → USAU → WFDF → PUL → WUL) ────────
  // Each builder returns null when the league has no current content; null
  // entries are filtered out so offseason leagues simply don't appear.
  //
  // Each slide is paired with a `color` — the dominant hue of its card — so the
  // mobile control bar can tint itself to match the active slide as it rotates
  // (HeroCarousel blends it over the shared dark stadium base). Game slides use
  // the home team's accent (the card's bottom-right color); tournament slides
  // use the league accent that colors their eyebrow/field lines. Keeping the
  // color alongside the node here guarantees the two arrays stay index-aligned
  // through the null-filter below.
  const UFA_HERO_ACCENT = '#FF3D00'; // Field brand coral — UFA's stadium accent
  const USAU_HERO_ACCENT = '#1D5ECC';
  const WFDF_HERO_ACCENT = '#12B3A6';
  const PUL_HERO_ACCENT = '#1EC98B';
  const WUL_HERO_ACCENT = '#F5A623';

  const slideEntries = [
    // UFA slide — always show the existing HeroGameCard (may render EmptyHero
    // in offseason, which is an intentional UFA-only empty state — keep it).
    {
      node: <HeroGameCard key="ufa" game={featured} awayRecord={awayRec} homeRecord={homeRec} />,
      color: featured?.homeTeamID ? teamMeta(featured.homeTeamID).primary : UFA_HERO_ACCENT,
    },
    // USAU — tournament card, null when no current event.
    usauEvent
      ? { node: <HeroUsauSlide key="usau" event={usauEvent} />, color: USAU_HERO_ACCENT }
      : null,
    // WFDF — Worlds tournament card, null in the off-season. Same weekend flip.
    wfdfEvent
      ? { node: <HeroWfdfSlide key="wfdf" event={wfdfEvent} />, color: WFDF_HERO_ACCENT }
      : null,
    // PUL — game card, null when no current/recent game.
    pulFeatured
      ? {
          node: <HeroPulSlide key="pul" game={pulFeatured} />,
          color: pulFeatured.home.accentColor ?? PUL_HERO_ACCENT,
        }
      : null,
    // WUL — game card, null when no current/recent game.
    wulFeatured
      ? {
          node: <HeroWulSlide key="wul" game={wulFeatured} />,
          color: wulFeatured.home.accentColor ?? WUL_HERO_ACCENT,
        }
      : null,
  ].filter((e): e is { node: React.ReactElement; color: string } => e !== null);

  const slides = slideEntries.map((e) => e.node);
  const slideColors = slideEntries.map((e) => e.color);

  return (
    <div className="min-h-screen bg-bg text-ink pb-20 lg:pb-0">
      {/* Global top rail — app switching + logo + account */}
      <AppRail />

      {/* HERO BENTO — carousel on the left, league panel stacked right */}
      <div className="px-5 lg:px-12 pt-6 lg:pt-9 pb-5 lg:pb-6 grid grid-cols-1 lg:grid-cols-[1.55fr_1fr] gap-5">
        <HeroCarousel slides={slides} slideColors={slideColors} />
        <LeaguesPanel />
      </div>

      <StandingsStrip
        standings={standings}
        teamStats={teamStats}
        seasonLabel={`UFA · ${year}`}
      />

      {/* PUL, WUL, and USAU standings / rankings — each section fetches its
          own data and returns null if that league has no data (offseason-safe). */}
      <PulStandingsSection />
      <WulStandingsSection />
      <UsauRankingsSection />

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
          // PUL — up to 4 cards: final, both semifinals, latest regular-season game.
          ...(pulRecentFour.length > 0
            ? [{ leagueKey: 'PUL', content: <PulRecentGrid games={pulRecentFour} /> }]
            : []),
          // WUL — up to 4 cards: final, both semifinals, latest regular-season game.
          ...(wulRecentFour.length > 0
            ? [{ leagueKey: 'WUL', content: <WulRecentGrid games={wulRecentFour} /> }]
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
import { deriveWulPostseasonRounds } from '@/lib/wul/data';

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

// ─── "Recent results" 4-card pickers (PUL / WUL) ─────────────────────────────
// Neither league has quarterfinals — playoffs are 2 semifinals + 1 final. To
// fill each league's row to 4 cards (matching UFA's 4-tile row), we show the
// championship weekend (final + both semis) plus the most recent
// regular-season game from the latest season that has a completed final.
// `round` drives each card's label/emphasis; only 'final' gets the trophy
// treatment, never a bare 'week' game and never a semifinal.

export type PulRecentRound = 'final' | 'semifinal' | 'regular';
export interface PulRecentGame {
  game: PulGame;
  round: PulRecentRound;
}

function pickPulRecentFour(games: PulGame[]): PulRecentGame[] {
  const finals = games.filter((g) => g.status === 'final');
  if (finals.length === 0) return [];

  // Resolve to the latest season that actually has a completed Finals game —
  // guards against a new season's early regular-season games outranking last
  // season's still-most-recent championship weekend.
  const seasonsWithFinal = [...new Set(finals.filter((g) => g.weekLabel === 'finals').map((g) => g.season))];
  if (seasonsWithFinal.length === 0) return [];
  const season = Math.max(...seasonsWithFinal);
  const seasonFinals = finals.filter((g) => g.season === season);

  const byDateDesc = (a: PulGame, b: PulGame) => (b.gameDate ?? '').localeCompare(a.gameDate ?? '');

  const finalGame = seasonFinals.find((g) => g.weekLabel === 'finals') ?? null;
  const semis = seasonFinals.filter((g) => g.weekLabel === 'semifinals').sort(byDateDesc);
  const regular = seasonFinals
    .filter((g) => g.weekLabel !== 'finals' && g.weekLabel !== 'semifinals')
    .sort(byDateDesc);

  const out: PulRecentGame[] = [];
  if (finalGame) out.push({ game: finalGame, round: 'final' });
  for (const g of semis) out.push({ game: g, round: 'semifinal' });
  for (const g of regular) {
    if (out.length >= 4) break;
    out.push({ game: g, round: 'regular' });
  }
  return out.slice(0, 4);
}

export type WulRecentRound = 'final' | 'semifinal' | 'regular';
export interface WulRecentGame {
  game: WulGame;
  round: WulRecentRound;
}

function pickWulRecentFour(games: WulGame[]): WulRecentGame[] {
  const finals = games.filter((g) => g.status === 'final');
  if (finals.length === 0) return [];

  const rounds = deriveWulPostseasonRounds(finals);
  const seasonsWithFinal = [
    ...new Set(finals.filter((g) => rounds.get(g.id) === 'final').map((g) => g.season)),
  ];
  if (seasonsWithFinal.length === 0) return [];
  const season = Math.max(...seasonsWithFinal);
  const seasonFinals = finals.filter((g) => g.season === season);

  const byDateDesc = (a: WulGame, b: WulGame) => (b.gameDate ?? '').localeCompare(a.gameDate ?? '');

  const finalGame = seasonFinals.find((g) => rounds.get(g.id) === 'final') ?? null;
  const semis = seasonFinals.filter((g) => rounds.get(g.id) === 'semifinal').sort(byDateDesc);
  // Everything else: regular season, plus any postseason game deriveWulPostseasonRounds
  // couldn't classify (e.g. 3rd-place) or left unclassified — treated as filler,
  // ordered most-recent first, same as regular season.
  const filler = seasonFinals
    .filter((g) => rounds.get(g.id) !== 'final' && rounds.get(g.id) !== 'semifinal')
    .sort(byDateDesc);

  const out: WulRecentGame[] = [];
  if (finalGame) out.push({ game: finalGame, round: 'final' });
  for (const g of semis) out.push({ game: g, round: 'semifinal' });
  for (const g of filler) {
    if (out.length >= 4) break;
    out.push({ game: g, round: 'regular' });
  }
  return out.slice(0, 4);
}

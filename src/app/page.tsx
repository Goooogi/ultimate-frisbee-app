// The Layout — home page, restructured to the "Home v2" design spec.
// Server component: fetches today's slate + current standings + team-stats in
// parallel and hands shaped data to the home components.
//
// Page order (desktop, per HomeV2 in the design source, restructured so all
// standings live together at the top):
//   1. Nav (AppRail — untouched)
//   2. Full-width hero carousel (UFA → USAU → WFDF → PUL → WUL)
//   3. "Every league, one place." strip
//   4. LEAGUE STANDINGS group — "Top of the league" (4 UFA division cards),
//      USAU Rankings (full-width 4×4 grid of the top 16, aligned to the UFA
//      cards above it), then PUL + WUL standings (two-up row)
//   5. "Up next" — UFA + USAU cards, side by side on desktop
//   6. "Recent results" — UFA/USAU/PUL/WUL cards, 4-across on desktop
//   7. Footer
//
// Any league with no current content is simply omitted from the carousel.

import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import {
  getAllGamesByYears,
  getCurrentGames,
  getStandings,
  getTeamStats,
  currentSeasonYear,
} from '@/lib/ufa/client';
import { gameUiState } from '@/lib/ufa/format';
import { pickTopGame, pickUpcomingGameOfWeek } from '@/lib/ufa/game-of-the-week';
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
import { LeaguesStrip } from '@/components/home/leagues-strip';
import { StandingsStrip } from '@/components/home/standings-strip';
import { RankingsCard } from '@/components/home/rankings-card';
import { UpNextCards } from '@/components/home/up-next-card';
import { RecentResultsCards } from '@/components/home/recent-results-card';
import { PulStandingsSection, WulStandingsSection } from '@/components/home/league-standings-sections';
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
      // — 4 to match the other leagues' 4-row groups in that card.
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

  // Two UFA hero games, shown as SEPARATE carousel slides:
  //  - topGame  → the ongoing story: best LIVE game, else most recent final.
  //  - gotwGame → best UPCOMING marquee matchup (no live override, so the live
  //               game stays on the "Top" slide rather than hijacking this one).
  // If nothing is upcoming, gotwGame is undefined and that slide drops. topGame
  // falls back to games[0] only so the UFA slide never fully disappears mid-
  // season (EmptyHero still renders for a truly empty slate).
  const topGame = pickTopGame(games, standings) ?? games[0];
  const gotwGame = pickUpcomingGameOfWeek(games, standings);

  // Records for a game's two teams (from current standings).
  const recordOf = (slug?: string): string | undefined => {
    if (!slug) return undefined;
    const s = standings.find((row) => row.teamID === slug);
    if (!s) return undefined;
    return s.ties > 0 ? `${s.wins}-${s.losses}-${s.ties}` : `${s.wins}-${s.losses}`;
  };

  // Two derived slices fed to the "Up next" / "Recent results" cards:
  //  - upNext: next 4 games chronologically (Live or Upcoming, soonest first)
  //  - recent: last 4 results (Final, most recent first)
  // We intentionally don't exclude the featured (hero) game — when there's
  // only one upcoming game on the slate, hiding it leaves the row empty.
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

  // For "Recent results": up to 4 rows per league regardless of age (the
  // pickLeagueGame 7-day window is for the hero carousel only — for the
  // results card we want to show the championship weekend even if the season
  // ended weeks ago). Order: final → semifinals (date desc) → most-recent
  // regular-season games, filling to 4. Neither league has quarterfinals, so
  // the 4th slot is always the latest regular-season game, not a quarter.
  const pulRecentFour = pickPulRecentFour(pulGames);
  const wulRecentFour = pickWulRecentFour(wulGames);

  // ── Build carousel slides (order: UFA → USAU → WFDF → PUL → WUL) ────────
  // Each builder returns null when the league has no current content; null
  // entries are filtered out so offseason leagues simply don't appear.
  // Whether the "Top" slide is showing a live game (drives its eyebrow copy).
  const topIsLive = topGame ? gameUiState(topGame).isLive : false;
  // Drop the Game-of-the-week slide if it would just repeat the Top slide's
  // game (e.g. off-week: Top falls back to a final and GotW picked the same, or
  // no upcoming exists at all) — no point showing the identical card twice.
  const showGotw = gotwGame != null && gotwGame.gameID !== topGame?.gameID;

  const slides = [
    // UFA "Top" slide — the ongoing story (live game, else most recent final).
    // Always shown (EmptyHero renders for a truly empty slate). Eyebrow reads
    // "Top game" when live, else falls through to the card's state-derived label.
    <HeroGameCard
      key="ufa-top"
      game={topGame}
      awayRecord={recordOf(topGame?.awayTeamID)}
      homeRecord={recordOf(topGame?.homeTeamID)}
      eyebrow={topIsLive ? 'Top game' : undefined}
    />,
    // UFA "Game of the week" slide — best UPCOMING marquee matchup. Only when
    // it's a distinct game from the Top slide.
    showGotw ? (
      <HeroGameCard
        key="ufa-gotw"
        game={gotwGame}
        awayRecord={recordOf(gotwGame?.awayTeamID)}
        homeRecord={recordOf(gotwGame?.homeTeamID)}
        eyebrow="Game of the week"
      />
    ) : null,
    // USAU — tournament card, null when no current event.
    usauEvent ? <HeroUsauSlide key="usau" event={usauEvent} /> : null,
    // WFDF — Worlds tournament card, null in the off-season. Same weekend flip.
    wfdfEvent ? <HeroWfdfSlide key="wfdf" event={wfdfEvent} /> : null,
    // PUL — game card, null when no current/recent game.
    pulFeatured ? <HeroPulSlide key="pul" game={pulFeatured} /> : null,
    // WUL — game card, null when no current/recent game.
    wulFeatured ? <HeroWulSlide key="wul" game={wulFeatured} /> : null,
  ].filter((s): s is React.ReactElement => s !== null);

  return (
    <div className="min-h-screen bg-bg text-ink pb-20 lg:pb-0">
      {/* Global top rail — app switching + logo + account (untouched) */}
      <AppRail />

      {/* 1. Full-width hero carousel */}
      <div className="px-5 lg:px-10 pt-6 lg:pt-8">
        <HeroCarousel slides={slides} />
      </div>

      {/* 2. "Every league, one place." strip */}
      <div className="px-5 lg:px-10 pt-7">
        {/* Mobile-only section head per the v2 mobile spec — desktop puts the
            headline inside the strip card itself. */}
        <h2 className="lg:hidden font-display italic font-bold text-[26px] leading-[0.95] tracking-[-0.02em] text-ink m-0 mb-3">
          Every league
        </h2>
        <LeaguesStrip />
      </div>

      {/* 3. LEAGUE STANDINGS group — every league's current standing, together,
             in one vertical stack: UFA divisions → USAU rankings → PUL/WUL. */}

      {/* 3a. "Top of the league" — UFA division cards */}
      {standings.length > 0 && (
        <div className="px-5 lg:px-10 pt-9 lg:pt-11">
          <div className="flex items-end justify-between gap-4 mb-4 lg:mb-5">
            <div>
              <span className="block text-[10.5px] font-bold tracking-[0.18em] uppercase text-accent font-sans mb-2">
                UFA · {year}
              </span>
              <h2 className="font-display italic font-bold text-[26px] lg:text-[34px] leading-[0.95] tracking-[-0.02em] text-ink m-0">
                Top of the league
              </h2>
            </div>
            <Link
              href="/teams"
              className="text-[11px] font-bold tracking-[0.12em] uppercase text-muted no-underline inline-flex items-center gap-1.5 hover:text-accent transition-colors whitespace-nowrap pb-[3px]"
            >
              Standings
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3 8H13M13 8L8.5 3.5M13 8L8.5 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
              </svg>
            </Link>
          </div>
          <StandingsStrip standings={standings} teamStats={teamStats} />
        </div>
      )}

      {/* 3b. USAU Rankings — full-width 4×4 grid of the top 16, sitting
             directly below the UFA cards with matching horizontal padding so
             its outer edges line up with the strip above. */}
      <div className="px-5 lg:px-10 pt-5 lg:pt-6">
        <RankingsCard />
      </div>

      {/* 3c. PUL/WUL standings — two-up row */}
      <div className="px-5 lg:px-10 pt-5 lg:pt-6 grid grid-cols-1 lg:grid-cols-2 gap-5">
        <PulStandingsSection />
        <WulStandingsSection />
      </div>

      {/* 4. "Up next" — UFA + USAU cards, side by side on desktop so they
             fill the width instead of stacking narrow in a single column. */}
      <div className="px-5 lg:px-10 pt-9 lg:pt-11 grid grid-cols-1 lg:grid-cols-2 gap-5">
        <UpNextCards ufaGames={upNext} usauEvent={usauUpcomingEvent} />
      </div>

      {/* 5. "Recent results" — UFA/USAU/PUL/WUL cards, 4-across on wide
             screens so the row packs evenly with no lopsided column. */}
      <div className="px-5 lg:px-10 pt-9 lg:pt-11 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <RecentResultsCards
          ufaGames={recent}
          usauMajors={usauMajors}
          pulGames={pulRecentFour}
          wulGames={wulRecentFour}
        />
      </div>

      <div className="pt-9 lg:pt-11">
        <SiteFooter />
      </div>
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

// ─── "Recent results" 4-row pickers (PUL / WUL) ──────────────────────────────
// Neither league has quarterfinals — playoffs are 2 semifinals + 1 final. To
// fill each league's group to 4 rows (matching UFA's 4-row group), we show
// the championship weekend (final + both semis) plus the most recent
// regular-season game from the latest season that has a completed final.
// `round` drives each row's label/emphasis; only 'final' gets the trophy
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

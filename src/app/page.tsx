// The Layout — editorial-bento home page.
// Server component: fetches today's slate + current standings + team-stats in
// parallel and hands shaped data to the home components.

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
import { getToday } from '@/lib/today';
import { HomeNav } from '@/components/home/home-nav';
import { HeroGameCard } from '@/components/home/hero-game-card';
import { PlaybookTile, FantasyTile } from '@/components/home/sub-app-tiles';
import { GameGridSection } from '@/components/home/game-grid-section';
import { StandingsStrip } from '@/components/home/standings-strip';
import { MobileTabBar } from '@/components/home/mobile-tab-bar';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'The Layout · Ultimate Frisbee',
  description:
    'Live UFA scores, the Playbook, and Fantasy — Ultimate Frisbee, three ways.',
};

export default async function HomePage() {
  const today = getToday();
  const year = currentSeasonYear();

  const [gamesRes, seasonRes, standingsRes, teamStatsRes] = await Promise.allSettled([
    getCurrentGames(),
    // Season-wide fetch so "Up next" stays populated between weekends, when
    // the current-week feed flips to all-finals and would otherwise be empty.
    // Cached 5min by the underlying call.
    getAllGamesByYears([year]),
    getStandings(),
    getTeamStats({ year }),
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

  const countLabel = (n: number, noun: string) =>
    `${n} ${n === 1 ? noun : `${noun}s`}`;

  // Derive a week label from the featured game when possible (e.g. "WK 4").
  const weekLabel = featured?.week
    ? featured.week.replace(/^week-?/i, 'Wk ')
    : undefined;

  return (
    <div className="min-h-screen bg-bg text-ink pb-20 lg:pb-0">
      <HomeNav today={today} weekLabel={weekLabel ? `${weekLabel.toUpperCase()}` : undefined} />

      {/* HERO BENTO — primary game on the left, sub-app tiles stacked right */}
      <div className="px-5 lg:px-12 pt-6 lg:pt-9 pb-5 lg:pb-6 grid grid-cols-1 lg:grid-cols-[1.55fr_1fr] gap-5">
        <HeroGameCard game={featured} awayRecord={awayRec} homeRecord={homeRec} />
        <div className="grid grid-rows-[1fr_1fr] gap-5">
          <PlaybookTile />
          <FantasyTile />
        </div>
      </div>

      <GameGridSection
        title="Up next"
        subtitle={upNext.length > 0 ? countLabel(upNext.length, 'game') : undefined}
        games={upNext}
      />

      <GameGridSection
        title="Recent results"
        subtitle={recent.length > 0 ? countLabel(recent.length, 'final') : undefined}
        games={recent}
      />

      <StandingsStrip
        standings={standings}
        teamStats={teamStats}
        seasonLabel={`UFA · ${year}`}
      />

      <MobileTabBar />
    </div>
  );
}

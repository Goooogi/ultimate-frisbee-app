// The Layout — editorial-bento home page.
// Server component: fetches today's slate + current standings + team-stats in
// parallel and hands shaped data to the home components.

import type { Metadata } from 'next';
import {
  getCurrentGames,
  getStandings,
  getTeamStats,
  currentSeasonYear,
} from '@/lib/ufa/client';
import { gameUiState } from '@/lib/ufa/format';
import type { UfaGame, UfaStanding, UfaTeamStat } from '@/lib/ufa/types';
import { getToday } from '@/lib/today';
import { LiveTicker } from '@/components/home/live-ticker';
import { HomeNav } from '@/components/home/home-nav';
import { HeroGameCard } from '@/components/home/hero-game-card';
import { PlaybookTile, FantasyTile } from '@/components/home/sub-app-tiles';
import { TonightSection } from '@/components/home/tonight-section';
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

  const [gamesRes, standingsRes, teamStatsRes] = await Promise.allSettled([
    getCurrentGames(),
    getStandings(),
    getTeamStats({ year }),
  ]);

  const games: UfaGame[] = gamesRes.status === 'fulfilled' ? gamesRes.value : [];
  const standings: UfaStanding[] =
    standingsRes.status === 'fulfilled' ? standingsRes.value : [];
  const teamStats: UfaTeamStat[] =
    teamStatsRes.status === 'fulfilled' ? teamStatsRes.value.stats ?? [] : [];

  // Pick "game of the week" (live first, else upcoming, else first).
  const featured =
    games.find((g) => gameUiState(g).isLive) ??
    games.find((g) => gameUiState(g).isUpcoming) ??
    games[0];

  // Records for the featured game's two teams (from current standings).
  const recordOf = (slug?: string): string | undefined => {
    if (!slug) return undefined;
    const s = standings.find((row) => row.teamID === slug);
    if (!s) return undefined;
    return s.ties > 0 ? `${s.wins}-${s.losses}-${s.ties}` : `${s.wins}-${s.losses}`;
  };
  const awayRec = recordOf(featured?.awayTeamID);
  const homeRec = recordOf(featured?.homeTeamID);

  // The hero takes the featured game; the tonight grid shows the rest.
  const tonightGames = featured
    ? games.filter((g) => g.gameID !== featured.gameID).slice(0, 4)
    : games.slice(0, 4);

  // Derive a week label from the featured game when possible (e.g. "WK 4").
  const weekLabel = featured?.week
    ? featured.week.replace(/^week-?/i, 'Wk ')
    : undefined;

  return (
    <div className="min-h-screen bg-[#F4F2EC] text-[#0E0E0C] pb-20 lg:pb-0">
      <LiveTicker games={games} />
      <HomeNav today={today} weekLabel={weekLabel ? `${weekLabel.toUpperCase()}` : undefined} />

      {/* HERO BENTO — primary game on the left, sub-app tiles stacked right */}
      <div className="px-5 lg:px-12 pt-6 lg:pt-9 pb-5 lg:pb-6 grid grid-cols-1 lg:grid-cols-[1.55fr_1fr] gap-5">
        <HeroGameCard games={games} awayRecord={awayRec} homeRecord={homeRec} />
        <div className="grid grid-rows-[1fr_1fr] gap-5">
          <PlaybookTile />
          <FantasyTile />
        </div>
      </div>

      <TonightSection games={tonightGames} />

      <StandingsStrip
        standings={standings}
        teamStats={teamStats}
        seasonLabel={`UFA · ${year}`}
        weekLabel={weekLabel ? weekLabel.replace(/^Wk /, 'Week ') : undefined}
      />

      <MobileTabBar />
    </div>
  );
}

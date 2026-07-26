import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import {
  getGameById,
  getGameStats,
  getStandings,
  getTeamStats,
  currentSeasonYear,
} from '@/lib/ufa/client';
import type {
  UfaGameStatsResponse,
  UfaStanding,
  UfaTeamStat,
} from '@/lib/ufa/types';
import { GameDetail } from '@/components/game-detail';
import { getUfaSpotlight } from '@/lib/ufa/spotlight';
import { getToday } from '@/lib/today';

interface Props {
  params: { id: string };
}

export const revalidate = 30;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const game = await getGameById(params.id).catch(() => null);
  if (!game) return { title: 'Game not found · The Layout' };
  return {
    title: `${game.awayTeamCity} ${game.awayTeamName} vs ${game.homeTeamCity} ${game.homeTeamName} · The Layout`,
  };
}

export default async function GamePage({ params }: Props) {
  const game = await getGameById(params.id).catch(() => null);
  if (!game) notFound();
  const today = getToday();

  // Pull season-level data for both teams + this game's stat-leader payload in parallel.
  const year = currentSeasonYear();
  const [standingsRes, teamStatsRes, gameStatsRes, spotlightRes] = await Promise.allSettled([
    getStandings(),
    getTeamStats({ year }),
    getGameStats(game.gameID),
    getUfaSpotlight(game, year),
  ]);
  const standings: UfaStanding[] = standingsRes.status === 'fulfilled' ? standingsRes.value : [];
  const teamStats: UfaTeamStat[] = teamStatsRes.status === 'fulfilled' ? (teamStatsRes.value.stats ?? []) : [];
  const gameStats: UfaGameStatsResponse | null =
    gameStatsRes.status === 'fulfilled' ? gameStatsRes.value : null;
  const spotlight =
    spotlightRes.status === 'fulfilled' ? spotlightRes.value : { away: null, home: null };

  const enrichment = {
    awayStanding: standings.find((s) => s.teamID === game.awayTeamID) ?? null,
    homeStanding: standings.find((s) => s.teamID === game.homeTeamID) ?? null,
    awayTeamStat: teamStats.find((t) => t.teamID === game.awayTeamID) ?? null,
    homeTeamStat: teamStats.find((t) => t.teamID === game.homeTeamID) ?? null,
    season: year,
    gameStats,
    spotlight,
  };

  return <GameDetail game={game} today={today} enrichment={enrichment} />;
}

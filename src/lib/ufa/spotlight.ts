// UFA adapter for the pro "Player Spotlight" (players-to-watch / player-of-the-
// game). Resolves the single pick per team from UFA data and returns the
// league-agnostic SpotlightPlayer shape rendered by PlayerSpotlightSection.
//
//   • upcoming/live → season roster stats per team (getAllPlayerStats) →
//     pickPlayerToWatch. UFA is the only league with headshots, so we resolve
//     one headshot for each side's pick.
//   • final         → this game's box score (getGameBoxscore) → pickPlayerOfGame.

import {
  getAllPlayerStats,
  getGameBoxscore,
  getStoredHeadshotUrl,
} from '@/lib/ufa/client';
import type { UfaGame, UfaPlayerStat } from '@/lib/ufa/types';
import { gameUiState } from '@/lib/ufa/format';
import {
  pickPlayerOfGame,
  pickPlayerToWatch,
  type SpotlightPlayer,
  type SeasonInput,
  type GameInput,
} from '@/lib/pro/player-spotlight';

export interface UfaSpotlight {
  away: SpotlightPlayer | null;
  home: SpotlightPlayer | null;
}

/** Read a numeric season/game stat that isn't in the typed interface via the
 *  index signature (UFA rows carry more fields than we type). */
function num(row: Record<string, unknown>, key: string): number {
  const v = row[key];
  return typeof v === 'number' ? v : 0;
}

/** Season roster row → watch input. UFA has season yards (thrown+received) and
 *  completions on the player-stats row (untyped, read defensively). */
function toSeasonInput(p: UfaPlayerStat, headshotUrl: string | null): SeasonInput {
  const yards = num(p, 'yardsThrown') + num(p, 'yardsReceived');
  return {
    name: p.name,
    profileId: p.playerID,
    headshotUrl,
    gamesPlayed: p.gamesPlayed,
    goals: p.goals,
    assists: p.assists,
    blocks: p.blocks,
    plusMinus: p.plusMinus,
    yards: yards > 0 ? yards : null,
    completions: typeof p.completions === 'number' ? p.completions : null,
  };
}

/** Pick the watch player for one team, then resolve that player's headshot. */
async function watchForTeam(teamID: string, year: number): Promise<SpotlightPlayer | null> {
  const rows = await getAllPlayerStats(
    { year, teamID, per: 'total', sort: 'scores', dir: 'desc' },
    { maxPages: 2 },
  ).catch(() => [] as UfaPlayerStat[]);
  // Pick first (no headshots yet), then fetch the single winner's headshot.
  const provisional = pickPlayerToWatch(rows.map((r) => toSeasonInput(r, null)), 'ufa');
  if (!provisional?.profileId) return provisional;
  const headshotUrl = await getStoredHeadshotUrl(provisional.profileId).catch(() => null);
  return { ...provisional, headshotUrl };
}

/** Adapt one side's box rows → game inputs and pick the player of the game. Runs
 *  headshot resolution for the single winner. */
async function potgForSide(
  rows: { playerID: string; firstName: string; lastName: string; stats: import('@/lib/ufa/types').UfaPlayerGameRow | null }[],
): Promise<SpotlightPlayer | null> {
  const inputs: GameInput[] = rows
    .filter((r) => r.stats)
    .map((r) => {
      const s = r.stats!;
      const plusMinus =
        s.goals + s.assists + s.blocks - s.throwaways - s.drops - s.stalls;
      const yards = (s.yardsThrown ?? 0) + (s.yardsReceived ?? 0);
      return {
        name: `${r.firstName} ${r.lastName}`.trim(),
        profileId: r.playerID,
        headshotUrl: null,
        goals: s.goals,
        assists: s.assists,
        blocks: s.blocks,
        plusMinus,
        yards: yards > 0 ? yards : null,
      };
    });
  const pick = pickPlayerOfGame(inputs, 'ufa');
  if (!pick?.profileId) return pick;
  const headshotUrl = await getStoredHeadshotUrl(pick.profileId).catch(() => null);
  return { ...pick, headshotUrl };
}

/**
 * Resolve the spotlight picks for a UFA game. Final games use the box score
 * (player of the game); upcoming/live use season roster stats (players to
 * watch). Fully defensive — any failure yields a null side (the section then
 * hides that half, or the whole section if both are null).
 */
export async function getUfaSpotlight(game: UfaGame, year: number): Promise<UfaSpotlight> {
  const state = gameUiState(game);

  if (state.isFinal) {
    const box = await getGameBoxscore(game.gameID).catch(() => null);
    if (!box) return { away: null, home: null };
    const [away, home] = await Promise.all([potgForSide(box.away), potgForSide(box.home)]);
    return { away, home };
  }

  // Upcoming / live → players to watch from season stats.
  const [away, home] = await Promise.all([
    watchForTeam(game.awayTeamID, year),
    watchForTeam(game.homeTeamID, year),
  ]);
  return { away, home };
}

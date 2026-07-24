// WUL adapter for the pro "Player Spotlight". WUL rosters carry season yards
// (yardsTotal) and box scores carry per-game yards + completions, so the full
// 60/40 watch blend and the yards-aware player-of-the-game score both apply.
// WUL has no headshots → picks render with the initials monogram.

import {
  getWulRoster,
  type WulGame,
  type WulGameBoxscore,
  type WulBoxscoreRow,
  type WulPlayer,
} from '@/lib/wul/data';
import {
  pickPlayerOfGame,
  pickPlayerToWatch,
  type SpotlightPlayer,
} from '@/lib/pro/player-spotlight';

export interface ProSpotlight {
  away: SpotlightPlayer | null;
  home: SpotlightPlayer | null;
}

function rosterToWatch(roster: WulPlayer[]): SpotlightPlayer | null {
  return pickPlayerToWatch(
    roster.map((p) => ({
      name: p.playerName,
      profileId: p.id,
      headshotUrl: null,
      gamesPlayed: p.gamesPlayed,
      goals: p.goals,
      assists: p.assists,
      blocks: p.blocks,
      plusMinus: p.plusMinus,
      yards: p.yardsTotal > 0 ? p.yardsTotal : null,
      // WUL season roster has no completions column → left null.
    })),
    'wul',
  );
}

function boxToPotg(rows: WulBoxscoreRow[]): SpotlightPlayer | null {
  return pickPlayerOfGame(
    rows.map((r) => ({
      name: r.playerName,
      profileId: r.profileId,
      headshotUrl: null,
      goals: r.goals,
      assists: r.assists,
      blocks: r.blocks,
      plusMinus: r.plusMinus,
      yards: r.totalYards > 0 ? r.totalYards : null,
    })),
    'wul',
  );
}

/**
 * Resolve the WUL spotlight. Final → player of the game from the (already
 * fetched) box score; otherwise players to watch from each team's season
 * roster. Defensive: any failure yields null for that side.
 */
export async function getWulSpotlight(game: WulGame, boxscore: WulGameBoxscore): Promise<ProSpotlight> {
  if (game.status === 'final') {
    return { away: boxToPotg(boxscore.away), home: boxToPotg(boxscore.home) };
  }
  const [awayRoster, homeRoster] = await Promise.all([
    getWulRoster(game.away.teamId, game.season).catch(() => [] as WulPlayer[]),
    getWulRoster(game.home.teamId, game.season).catch(() => [] as WulPlayer[]),
  ]);
  return { away: rosterToWatch(awayRoster), home: rosterToWatch(homeRoster) };
}

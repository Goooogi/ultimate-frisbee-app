// PUL adapter for the pro "Player Spotlight". PUL box/roster rows carry no yards
// or completions, so both the watch blend and the player-of-the-game score are
// effectively impact-only (the library treats the missing 0.4 term as 0). No
// headshots exist for PUL, so picks render with the initials monogram.

import { getPulRoster, type PulGame, type PulGameBoxscore, type PulBoxscoreRow, type PulPlayer } from '@/lib/pul/data';
import {
  pickPlayerOfGame,
  pickPlayerToWatch,
  type SpotlightPlayer,
} from '@/lib/pro/player-spotlight';

export interface ProSpotlight {
  away: SpotlightPlayer | null;
  home: SpotlightPlayer | null;
}

function rosterToWatch(roster: PulPlayer[]): SpotlightPlayer | null {
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
      // PUL: no yards / completions → impact-only.
    })),
    'pul',
  );
}

function boxToPotg(rows: PulBoxscoreRow[]): SpotlightPlayer | null {
  return pickPlayerOfGame(
    rows.map((r) => ({
      name: r.playerName,
      profileId: r.profileId,
      headshotUrl: null,
      goals: r.goals,
      assists: r.assists,
      blocks: r.blocks,
      plusMinus: r.plusMinus,
    })),
    'pul',
  );
}

/**
 * Resolve the PUL spotlight. Final → player of the game from the (already
 * fetched) box score; otherwise players to watch from each team's season
 * roster. Defensive: any failure yields null for that side.
 */
export async function getPulSpotlight(game: PulGame, boxscore: PulGameBoxscore): Promise<ProSpotlight> {
  if (game.status === 'final') {
    return { away: boxToPotg(boxscore.away), home: boxToPotg(boxscore.home) };
  }
  const [awayRoster, homeRoster] = await Promise.all([
    getPulRoster(game.away.teamId, game.season).catch(() => [] as PulPlayer[]),
    getPulRoster(game.home.teamId, game.season).catch(() => [] as PulPlayer[]),
  ]);
  return { away: rosterToWatch(awayRoster), home: rosterToWatch(homeRoster) };
}

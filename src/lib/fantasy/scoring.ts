// Fantasy scoring engine — pure, deterministic, league-agnostic.
//
// The whole engine reduces a single per-game stat line + the role the manager
// assigned that player to a point total. Cumulative season score is just the
// sum of per-game scores across a team's rostered players.
//
// Scoring matrix (confirmed with Hunter 2026-06-30):
//
//   Stat                         Offender   Defender
//   ─────────────────────────────────────────────────
//   Goal                            3           2
//   Assist                          3           2
//   Block                           2           5
//   Turnover (throwaway+drop+stall)  −1         −1
//   Yards (thrown + received)     1 pt / 100 yds (decimals), both roles
//
// Design intent: the role a manager assigns *skews* the payout. Defenders are
// rewarded for defensive plays (a block is worth 5 vs 2); offenders for
// offensive production. Turnovers cost a point regardless of role. Yardage is
// role-neutral. Missing yardage (leagues without yard data) contributes 0.

export type FantasyRole = 'offender' | 'defender';

/**
 * The minimal per-game stat line the scoring engine needs. This is a
 * league-agnostic shape: the UFA adapter maps `ufa_game_player_stats` rows into
 * it, and future leagues (WUL/PUL) map their own rows the same way.
 *
 * `turnovers` is a single number — for UFA that's throwaways+drops+stalls,
 * summed by the adapter (there is no single "turnovers" field upstream).
 * `yards` is combined throw + receive yards. Any field may be omitted / 0 for
 * leagues that don't track it (e.g. PUL has no yardage → yards: 0).
 */
export interface FantasyStatLine {
  goals: number;
  assists: number;
  blocks: number;
  turnovers: number;
  /** Combined throwing + receiving yards. */
  yards: number;
}

/** Point values per stat, per role. Single source of truth for the matrix. */
export const SCORING = {
  offender: { goal: 3, assist: 3, block: 2, turnover: -1 },
  defender: { goal: 2, assist: 2, block: 5, turnover: -1 },
  /** Points per yard (role-neutral): 1 point per 100 combined yards. */
  yardsPerPoint: 100,
} as const;

/**
 * Score a single player's single game, given the role the manager assigned.
 * Returns a number that may carry decimals (from the yardage term).
 *
 * Pure: same inputs always yield the same output. No I/O, no clock, no rounding
 * (callers decide display rounding).
 */
export function scoreStatLine(line: FantasyStatLine, role: FantasyRole): number {
  const v = SCORING[role];
  const counting =
    (line.goals ?? 0) * v.goal +
    (line.assists ?? 0) * v.assist +
    (line.blocks ?? 0) * v.block +
    (line.turnovers ?? 0) * v.turnover;
  const yardPoints = (line.yards ?? 0) / SCORING.yardsPerPoint;
  return counting + yardPoints;
}

/**
 * A single scored contribution — one player's one game — carrying enough
 * context to render a breakdown and to sum a roster/week.
 */
export interface ScoredGame {
  playerId: string;
  gameId: string;
  week: string | null;
  role: FantasyRole;
  points: number;
  line: FantasyStatLine;
}

/** Sum a set of scored games into a single total. */
export function sumPoints(games: ScoredGame[]): number {
  return games.reduce((acc, g) => acc + g.points, 0);
}

/**
 * Round a fantasy point value for display. We keep one decimal — enough to show
 * the yardage contribution ("12.3") without noise. Storage keeps full precision.
 */
export function roundPoints(points: number): number {
  return Math.round(points * 10) / 10;
}

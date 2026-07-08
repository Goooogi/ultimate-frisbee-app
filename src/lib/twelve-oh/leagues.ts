/**
 * 12-0 multi-league rating configs — PUL + WUL.
 *
 * The UFA engine (rating.ts) predates multi-league and keeps its named-field
 * shape. PUL and WUL score through this generic dimension-list engine instead:
 * each league declares the stats it actually tracks, a weight per stat, and a
 * baked baseline (per-stat mean/std + 9 raw-score percentile anchors) computed
 * by scripts/backfill-twelve-oh-league.ts over that league's full history.
 *
 * Every league normalizes onto the NBA-2K-style 50–99 scale (rating.ts
 * NORM_TARGET_SCORES: floor = 50, median season = 75, star = 88, elite = 93,
 * greatest ever = 99). Scores are comparable IN MEANING across leagues — a
 * top-5%-all-time season reads ~88 in its own league — while the underlying
 * stats and weights differ per league. PUL/WUL lift only the top end a couple
 * points (LEAGUE_TARGET_SCORES below), leaving floor and median identical.
 *
 * LEAGUE STAT COVERAGE (what the sources actually track)
 * ──────────────────────────────────────────────────────
 * PUL (pul_players, 2023–present):
 *   goals / assists / blocks / turnovers / plus_minus — all seasons.
 *   touches       — reliable 2024+; 2023 values are undertracked (~1.5/game
 *                   vs ~11/game in 2024+), so the backfill ZEROES 2023 touches
 *                   before scoring and the dim is zero-gated (0 → neutral z).
 *   points played — o_points + d_points; 2023 is all zeros (not tracked),
 *                   zero-gated the same way.
 *   No hockey assists, yards, completions, drops-vs-throwaways split, or
 *   callahans (turnovers is the single combined turnover stat).
 *
 * WUL (wul_players, 2022–present):
 *   Everything PUL has, uniformly across all seasons, PLUS total yards,
 *   completed hucks, and callahans. plus_minus can be fractional (.5).
 *
 * WEIGHTS — same philosophy as the UFA engine (see rating.ts):
 *   scoring output (goals/assists/blocks) at 1.0, net impact (+/−) at 0.7,
 *   volume/usage below that, turnovers negative, durability a minor nudge.
 *   `turnovers` carries −0.5 (vs UFA's split −0.5 drops / −0.4 throwaways)
 *   because it is each league's single combined turnover stat.
 */

import { pwlNormalize, type WinCurve } from './rating';

// ─── Types ─────────────────────────────────────────────────────────────────

export type TwelveOhLeague = 'ufa' | 'pul' | 'wul';

export interface LeagueDim {
  /** Stat key in the stats record passed to computeLeagueScore. */
  key: string;
  weight: number;
  /** Clip the value at this max before z-scoring (zero-inflated stats). */
  winsorizeMax?: number;
  /**
   * When true, a value of exactly 0 means "not tracked that season" → the
   * z-score is forced to 0 (neutral) and the baseline mean/std is computed
   * over >0 rows only. Mirrors the UFA pre-2021 yards fix. Only used for
   * stats where a real 0 across a ≥3-GP season is implausible (touches,
   * points played, yards) — never for legitimately-zero stats like callahans.
   */
  gateZero?: boolean;
}

export interface LeagueBaseline {
  playerSeasons: number;
  dims: Record<string, { mean: number; std: number }>;
  /** Raw weighted z-sum at [P0, P50, P75, P90, P95, P99, P99.5, P99.9, P100]. */
  anchors: number[];
}

// ─── Dimension lists ───────────────────────────────────────────────────────

export const PUL_DIMS: LeagueDim[] = [
  { key: 'goals',        weight: 1.0 },
  { key: 'assists',      weight: 1.0 },
  { key: 'blocks',       weight: 1.0 },
  { key: 'plusMinus',    weight: 0.7 },
  { key: 'turnovers',    weight: -0.5 },
  { key: 'touches',      weight: 0.4, gateZero: true },  // 2023 zeroed at backfill
  { key: 'pointsPlayed', weight: 0.2, gateZero: true },  // 2023 not tracked
];

export const WUL_DIMS: LeagueDim[] = [
  { key: 'goals',          weight: 1.0 },
  { key: 'assists',        weight: 1.0 },
  { key: 'blocks',         weight: 1.0 },
  { key: 'plusMinus',      weight: 0.7 },
  { key: 'turnovers',      weight: -0.5 },
  { key: 'yardsTotal',     weight: 0.5, gateZero: true },
  { key: 'hucksCompleted', weight: 0.3 },
  { key: 'touches',        weight: 0.3, gateZero: true },
  { key: 'callahans',      weight: 0.3, winsorizeMax: 10 },
  { key: 'pointsPlayed',   weight: 0.2, gateZero: true },
];

// ─── Baked baselines ───────────────────────────────────────────────────────
// Computed by `npx tsx scripts/backfill-twelve-oh-league.ts <league>` over the
// league's full history; paste the printed block here after each re-run (same
// convention as BAKED_BASELINE in rating.ts). Last baked 2026-07-06.

export const PUL_BAKED_BASELINE: LeagueBaseline = {
  // 1,104 qualifying player-seasons (≥3 GP), PUL 2023-2026.
  playerSeasons: 1104,
  dims: {
    goals: { mean: 3.5507, std: 3.7693 },
    assists: { mean: 3.5444, std: 4.2077 },
    blocks: { mean: 2.6830, std: 2.4740 },
    plusMinus: { mean: 2.9284, std: 7.2145 },
    turnovers: { mean: 6.8496, std: 5.9163 },
    touches: { mean: 62.1731, std: 57.7120 },        // 2024+ only (gateZero)
    pointsPlayed: { mean: 51.3769, std: 21.8988 },   // 2024+ only (gateZero)
  },
  // [P0, P50, P75, P90, P95, P99, P99.5, P99.9, P100]
  anchors: [-5.1653, -0.6436, 1.4583, 4.1227, 5.8320, 9.0811, 10.3303, 13.1888, 13.5782],
};

export const WUL_BAKED_BASELINE: LeagueBaseline = {
  // 888 qualifying player-seasons (≥3 GP), WUL 2022-2026.
  playerSeasons: 888,
  dims: {
    goals: { mean: 4.9279, std: 4.9403 },
    assists: { mean: 4.9358, std: 5.4008 },
    blocks: { mean: 3.9426, std: 3.5777 },
    plusMinus: { mean: 4.3294, std: 9.0405 },
    turnovers: { mean: 9.0743, std: 7.4902 },
    yardsTotal: { mean: 904.8388, std: 705.8045 },
    hucksCompleted: { mean: 1.9865, std: 3.2033 },
    touches: { mean: 88.1387, std: 78.3748 },
    callahans: { mean: 0.2128, std: 0.4872 },        // winsorized at 10
    pointsPlayed: { mean: 74.0484, std: 32.8900 },
  },
  // [P0, P50, P75, P90, P95, P99, P99.5, P99.9, P100]
  anchors: [-5.0386, -0.7462, 1.6897, 4.3888, 6.6469, 12.3195, 13.6184, 18.0543, 23.6440],
};

// ─── Elite-score boost (PUL/WUL only) ────────────────────────────────────────
// Both leagues use the NBA-2K-style 50–99 scale (rating.ts NORM_TARGET_SCORES:
// floor 50, median 75, cap 99). PUL and WUL are much smaller leagues — the spin
// pool is only ~36–47 team-years vs UFA's ~275 — so their stars should read a
// touch more elite to feel rewarding, WITHOUT moving the floor or median (p0/p50
// stay pinned at 50/75). This lifts only the top-end anchors: a top-5% season
// reads 90 (vs UFA 88), a top-1% reads 95 (vs UFA 93). Applied in
// computeLeagueScore via pwlNormalize's optional targets arg; UFA is untouched.
//
//   percentile:  p0  p50  p75  p90  p95  p99  p99.5 p99.9 p100
//   UFA:         50   75   80   85   88   93    95    97    99
//   PUL/WUL:     50   75   80   86   90   95    96    98    99
export const LEAGUE_TARGET_SCORES: readonly number[] = [
  50, 75, 80, 86, 90, 95, 96, 98, 99,
];

// ─── Scoring ───────────────────────────────────────────────────────────────

/** Weighted z-sum over a league's dimension list. Pure, no I/O. */
export function computeLeagueRawScore(
  stats: Record<string, number>,
  dims: LeagueDim[],
  baseline: LeagueBaseline,
): number {
  let raw = 0;
  for (const dim of dims) {
    const b = baseline.dims[dim.key];
    if (!b || b.std === 0) continue;
    let value = stats[dim.key] ?? 0;
    if (dim.gateZero && value === 0) continue; // missing data → neutral
    if (dim.winsorizeMax != null) value = Math.min(value, dim.winsorizeMax);
    raw += dim.weight * ((value - b.mean) / b.std);
  }
  return raw;
}

/** Full 0–100 score for one player-season in a dims/baseline league. */
export function computeLeagueScore(
  stats: Record<string, number>,
  dims: LeagueDim[],
  baseline: LeagueBaseline,
): { playerScore: number; rawScore: number } {
  const rawScore = computeLeagueRawScore(stats, dims, baseline);
  return {
    playerScore: pwlNormalize(rawScore, baseline.anchors, LEAGUE_TARGET_SCORES),
    rawScore,
  };
}

// ─── Per-league win curves ─────────────────────────────────────────────────
// Strength = mean(7 scores) + balance bonus (rating.ts teamRecord). Scores are
// percentile-normalized identically in every league, but the spin+best-pick
// strength distribution shifts with pool structure: fewer team-years and
// smaller rosters mean the best player of a random team-year sits at a higher
// percentile, so PUL/WUL builds run "hotter" than UFA (median strength ~85/84
// vs UFA's ~81) and need their own curves to keep the same record odds.
//
// Derived + verified by scripts/tune-twelve-oh-league-curve.ts (500k-sim MC,
// spin + 1 skip, 2026-07-08). PUL/WUL are tuned "moderately looser" than UFA
// on purpose — small spin pools (~36–47 team-years) should reward a strong
// draft — and this pairs with the LEAGUE_TARGET_SCORES elite boost above.
// Both leagues verify to: 12-0≈4%, 11-1≈7%, 10-2≈16%, 9-3≈23%, 8-4≈25%,
// 7-5≈18%, 6-6≈6%. UFA keeps its own tighter curve (rating.ts).
// Re-run the tuner after each backfill (new seasons shift the distribution).

export const PUL_WIN_CURVE: WinCurve = [
  [40, 0], [82.33, 2], [86.33, 5], [88.76, 6], [89.63, 7],
  [91.77, 8], [92.08, 9], [93.76, 10], [93.83, 11], [95.09, 12],
];

export const WUL_WIN_CURVE: WinCurve = [
  [40, 0], [80.92, 2], [84.92, 5], [87.64, 6], [88.77, 7],
  [91.02, 8], [91.52, 9], [93.31, 10], [93.44, 11], [94.75, 12],
];

/** League-keyed lookup used by the game UI. `undefined` = UFA default curve. */
export function winCurveForLeague(league: TwelveOhLeague): WinCurve | undefined {
  if (league === 'pul') return PUL_WIN_CURVE;
  if (league === 'wul') return WUL_WIN_CURVE;
  return undefined;
}

/**
 * 12-0 rating engine — pure functions, no I/O.
 *
 * DESIGN DECISIONS (read before tuning)
 * ──────────────────────────────────────
 * 1. RAW SEASON TOTALS, NOT PER-GAME RATES
 *    We rate on cumulative season totals rather than per-game averages.
 *    A 16-game elite season (e.g. Ben Jagt 2024) should outrank a 3-game
 *    cameo with equivalent per-game numbers — that's both statistically
 *    sound and intuitively correct for a "build an all-time team" game.
 *    The 3-game minimum filter (enforced by the backfill) prevents true
 *    micro-samples from polluting the baseline.
 *
 * 2. COMPLETION % THRESHOLD (50 completions)
 *    Completion % is the most distorted stat in the dataset (raw std ≈ 35
 *    due to throwers with 1-5 attempts appearing at 100%). We only credit
 *    completion % when the player has ≥ 50 completions in the season.
 *    Below that threshold the z-score is clamped to 0 (neutral), so
 *    non-throwers are neither penalized nor rewarded on this dimension.
 *    50 completions ≈ ~6 completions/game over 8 games — a real thrower.
 *
 * 3. WEIGHTS (justified below)
 *    goals         1.0  — primary scoring output; directly wins points
 *    assists       1.0  — equal to goals; sets up every score
 *    blocks        0.8  — high win-correlation; D-line generator
 *    plus_minus    0.7  — net impact; captures defensive holds too
 *    yards_thrown  0.6  — offensive engine; more than received because
 *                         throwers bear more responsibility for flow
 *    yards_received 0.5 — important but yards_thrown already credits
 *                         the throw; receiver gets partial credit
 *    hockey_assists 0.4 — second assist; valuable but indirect
 *    completion_pct 0.4 — rewards clean throwing, clamped to 0 for
 *                         low-volume players (see threshold above)
 *
 * 4. SCORE NORMALIZATION — PIECEWISE PERCENTILE CURVE (v2)
 *    The v1 linear p5→p95 interpolation caused ~170 players (out of ~4000)
 *    to hit score=100 because the top tail was compressed into a tiny
 *    raw-score range. The new approach:
 *
 *    a) During backfill, compute the raw-score at 9 key percentile thresholds
 *       across the FULL all-time dataset (~9000+ player-seasons with 2012-2025).
 *    b) At runtime, binary-search the raw score against those threshold values
 *       and piecewise-linearly interpolate to the corresponding target score.
 *
 *    Percentile → Target score mapping (the "shape" of the curve):
 *      p0    (min)  →   0
 *      p50   (median) → 38   ← typical player, realistic average
 *      p75           → 55
 *      p90           → 68
 *      p95           → 77
 *      p99           → 87
 *      p99.5         → 92
 *      p99.9         → 96
 *      p100  (max)   → 100
 *
 *    This gives:
 *    - Median season: ~38 (no one is "average" here; everyone's a pro)
 *    - Good starter: 50s
 *    - Star: 68–77 (top 5-10% all-time)
 *    - Elite: 87–92 (top 0.5-1% all-time)
 *    - All-Time Greatest: 96–100 (maybe 1–5 seasons in history)
 *    - 100 = the single greatest season in league history (truly unique)
 *
 *    Why piecewise linear over a sigmoid/exp transform?
 *    - Fully interpretable: you can read off "this player is at p90 = 68"
 *    - Directly configurable: changing a target value changes exactly that
 *      bucket without ripple effects on the rest of the distribution
 *    - Stable across re-backfills: only the raw threshold values shift;
 *      the target score values are design constants baked here in code
 *
 * 5. TEAM → RECORD (v3)
 *    Team strength = mean(7 scores) + small balance bonus.
 *    The bonus rewards balance over one mega-star + 6 scrubs:
 *      +0.5 if min score > 60  (no weak link at all; everyone above solid-starter)
 *      +0.3 if min score > 45  (no slot below league average)
 *      +0.0 otherwise          (at least one weak slot)
 *
 *    Bonus intentionally capped at +0.5 — cannot bridge a full record tier on its own.
 *
 *    Win curve — PIECEWISE LINEAR over [strength → wins] breakpoints:
 *      strength ≤ 36 →  0 wins
 *      strength = 38 →  2 wins   (all-median ≈38 players, pure random picks)
 *      strength = 46 →  4 wins   (above-average contributors)
 *      strength = 54 →  5 wins   (mix of contributors and solid pros)
 *      strength = 62 →  6 wins   (genuinely above-average; solid-pro territory)
 *      strength = 70 →  7 wins   (all Solid Pro ≥68)
 *      strength = 78 →  8 wins   (star-level, p95 ≈77)
 *      strength = 85 →  9 wins   (elite-caliber; requires 5-6 Star+ slots)
 *      strength = 90 → 10 wins   (near-historic; most slots at p99 All-Time Elite)
 *      strength = 94 → 11 wins   (all-time great; only ~19 seasons ≥94 exist ever)
 *      strength ≥ 97 → 12 wins   (PERFECT; ~4 seasons ≥97 in all of 2012-2025)
 *
 *    Why PWL over linear or sigmoid?
 *    A single linear ramp assigns high records too generously (mean 85 → 11 wins).
 *    A sigmoid saturates symmetrically and is harder to tune at the extremes.
 *    PWL is fully interpretable (read the table directly), gentle in the mid
 *    (38→62 = 24 score-points for 4 wins) and brutally steep at the top
 *    (90→97 = only 7 score-points for 2 wins), which matches the design intent.
 *
 *    12-0 analysis (v3): to reach strength=97, you need mean(7 scores) ≥96.5
 *    (the balance bonus of 0.5 only moves the needle if all 7 are already elite).
 *    In the 7905-season dataset, only 4 seasons score ≥97. You must deliberately
 *    hunt the absolute all-time GOATs across many team-years. Random picks
 *    produce mean≈40 → 2-3 wins. The best 7 from one team-year (Empire 2021,
 *    the most stacked in history) hits mean≈79-82 → 8-9 wins at most.
 */

// ─── Baseline ──────────────────────────────────────────────────────────────

/**
 * All-time UFA baseline computed from the full 2012-2025 backfill (≥3 GP).
 * The BAKED_BASELINE here is used by the client (no DB round-trip needed for
 * scoring). Re-bake after each annual backfill by copying from the DB row.
 *
 * PERCENTILE ANCHORS (piecewise normalization curve):
 *   rawAtP0   → target 0   (absolute minimum season)
 *   rawAtP50  → target 38  (median player-season)
 *   rawAtP75  → target 55  (solid contributor)
 *   rawAtP90  → target 68  (very good, top 10%)
 *   rawAtP95  → target 77  (star territory, top 5%)
 *   rawAtP99  → target 87  (elite, top 1%)
 *   rawAtP995 → target 92  (historically great, top 0.5%)
 *   rawAtP999 → target 96  (all-time great, top 0.1%)
 *   rawAtP100 → target 100 (the single greatest season ever)
 *
 * To update: run the backfill, then query:
 *   SELECT * FROM twelve_oh_baseline WHERE id = 1;
 * and paste the values here.
 */
export interface Baseline {
  playerSeasons: number;
  meanGoals: number;       stdGoals: number;
  meanAssists: number;     stdAssists: number;
  meanBlocks: number;      stdBlocks: number;
  meanHockeyAssists: number; stdHockeyAssists: number;
  meanYardsThrown: number; stdYardsThrown: number;
  meanYardsReceived: number; stdYardsReceived: number;
  meanPlusMinus: number;   stdPlusMinus: number;
  meanCompletionPct: number; stdCompletionPct: number; // among completions >= 50 only
  // Piecewise percentile anchors for normalization curve (v2).
  // Each rawAtPXX is the raw weighted z-score at that all-time percentile.
  rawAtP0:   number;   // absolute min
  rawAtP50:  number;   // median
  rawAtP75:  number;
  rawAtP90:  number;
  rawAtP95:  number;
  rawAtP99:  number;
  rawAtP995: number;   // 99.5th
  rawAtP999: number;   // 99.9th
  rawAtP100: number;   // absolute max
  // Legacy fields kept for backfill DB schema compatibility (not used in scoring v2).
  rawScoreMin: number;
  rawScoreMax: number;
  rawScoreP5:  number;
  rawScoreP95: number;
}

/**
 * Seed baseline — values from the full 2012-2025 backfill (9,143 qualifying
 * player-seasons). These are overwritten by the backfill on each run.
 *
 * Percentile anchors are raw weighted z-scores at each threshold over the
 * full all-time distribution. The backfill script prints BAKED_BASELINE
 * update instructions; paste the output here after each run.
 */
export const BAKED_BASELINE: Baseline = {
  // Computed from 7,905 qualifying player-seasons (≥3 GP), full 2012-2025 backfill.
  // Re-run the backfill and paste updated values here annually after new season data.
  playerSeasons: 7905,
  meanGoals: 10.0799,          stdGoals: 10.8179,
  meanAssists: 10.0593,        stdAssists: 11.5731,
  meanBlocks: 5.4515,          stdBlocks: 5.1827,
  meanHockeyAssists: 8.4517,   stdHockeyAssists: 9.0941,
  // Yards baseline excludes pre-2021 seasons (no yards data in API for those years)
  meanYardsThrown: 763.7704,   stdYardsThrown: 947.3343,
  meanYardsReceived: 758.8844, stdYardsReceived: 800.0627,
  meanPlusMinus: 15.1505,      stdPlusMinus: 16.8633,
  // Completion % among completions >= 50 only (real throwers)
  meanCompletionPct: 91.6915,  stdCompletionPct: 4.1329,
  // Piecewise percentile anchors for v2 normalization curve
  rawAtP0:   -5.7665,
  rawAtP50:  -1.4789,
  rawAtP75:   1.0728,
  rawAtP90:   4.3811,
  rawAtP95:   6.5116,
  rawAtP99:  10.4047,
  rawAtP995: 11.8837,
  rawAtP999: 15.0744,
  rawAtP100: 19.7919,
  // Legacy fields (kept for DB schema compat, not used for scoring v2).
  rawScoreMin: -5.7665,
  rawScoreMax: 19.7919,
  rawScoreP5:  -4.2891,
  rawScoreP95:  6.5116,
};

// ─── Normalization curve constants ────────────────────────────────────────

/**
 * Piecewise anchor points: [rawScore threshold, target 0–100 score].
 * The raw thresholds come from BAKED_BASELINE; the target scores are
 * design constants (they define the shape of the curve and should only
 * change if the game-feel target changes — not on every re-backfill).
 *
 * Reading this table:
 *   A player-season at p99 all-time → score 87
 *   A player-season at p95 all-time → score 77
 *   A player-season at p75 all-time → score 55
 *   A player-season at p50 all-time → score 38
 */
const NORM_TARGET_SCORES = [0, 38, 55, 68, 77, 87, 92, 96, 100] as const;

function getRawThresholds(baseline: Baseline): number[] {
  return [
    baseline.rawAtP0,
    baseline.rawAtP50,
    baseline.rawAtP75,
    baseline.rawAtP90,
    baseline.rawAtP95,
    baseline.rawAtP99,
    baseline.rawAtP995,
    baseline.rawAtP999,
    baseline.rawAtP100,
  ];
}

// ─── Weights ───────────────────────────────────────────────────────────────

export const WEIGHTS = {
  goals: 1.0,
  assists: 1.0,
  blocks: 0.8,
  plusMinus: 0.7,
  yardsThrown: 0.6,
  yardsReceived: 0.5,
  hockeyAssists: 0.4,
  completionPct: 0.4,
} as const;

/** Minimum completions to credit the completion % dimension. */
export const COMPLETION_PCT_MIN_COMPLETIONS = 50;

// ─── Input shape ──────────────────────────────────────────────────────────

export interface PlayerSeasonStats {
  goals: number;
  assists: number;
  blocks: number;
  hockeyAssists: number;
  yardsThrown: number;
  yardsReceived: number;
  plusMinus: number;
  completions: number;
  /** String like "92.34" (from UFA API) or already a number. */
  completionPercentage: string | number;
}

// ─── Component z-scores ───────────────────────────────────────────────────

export interface PlayerZScores {
  zGoals: number;
  zAssists: number;
  zBlocks: number;
  zHockeyAssists: number;
  zYardsThrown: number;
  zYardsReceived: number;
  zPlusMinus: number;
  /** 0 when completions < COMPLETION_PCT_MIN_COMPLETIONS */
  zCompletionPct: number;
}

function zscore(value: number, mean: number, std: number): number {
  if (std === 0) return 0;
  return (value - mean) / std;
}

export function computeZScores(
  stats: PlayerSeasonStats,
  baseline: Baseline,
): PlayerZScores {
  const completionPct =
    typeof stats.completionPercentage === 'string'
      ? parseFloat(stats.completionPercentage)
      : stats.completionPercentage;

  const useCompletionPct =
    stats.completions >= COMPLETION_PCT_MIN_COMPLETIONS &&
    isFinite(completionPct);

  return {
    zGoals: zscore(stats.goals, baseline.meanGoals, baseline.stdGoals),
    zAssists: zscore(stats.assists, baseline.meanAssists, baseline.stdAssists),
    zBlocks: zscore(stats.blocks, baseline.meanBlocks, baseline.stdBlocks),
    zHockeyAssists: zscore(
      stats.hockeyAssists,
      baseline.meanHockeyAssists,
      baseline.stdHockeyAssists,
    ),
    zYardsThrown: zscore(
      stats.yardsThrown,
      baseline.meanYardsThrown,
      baseline.stdYardsThrown,
    ),
    zYardsReceived: zscore(
      stats.yardsReceived,
      baseline.meanYardsReceived,
      baseline.stdYardsReceived,
    ),
    zPlusMinus: zscore(stats.plusMinus, baseline.meanPlusMinus, baseline.stdPlusMinus),
    zCompletionPct: useCompletionPct
      ? zscore(completionPct, baseline.meanCompletionPct, baseline.stdCompletionPct)
      : 0,
  };
}

// ─── Raw score (weighted z-sum) ───────────────────────────────────────────

export function computeRawScore(z: PlayerZScores): number {
  return (
    z.zGoals           * WEIGHTS.goals +
    z.zAssists         * WEIGHTS.assists +
    z.zBlocks          * WEIGHTS.blocks +
    z.zPlusMinus       * WEIGHTS.plusMinus +
    z.zYardsThrown     * WEIGHTS.yardsThrown +
    z.zYardsReceived   * WEIGHTS.yardsReceived +
    z.zHockeyAssists   * WEIGHTS.hockeyAssists +
    z.zCompletionPct   * WEIGHTS.completionPct
  );
}

// ─── Normalize raw score → 0–100 (piecewise percentile curve) ────────────

/**
 * Maps rawScore → [0, 100] using piecewise linear interpolation over the
 * all-time percentile anchors baked in BAKED_BASELINE.
 *
 * The raw thresholds (rawAtP0…rawAtP100) come from the baseline and shift
 * when the dataset grows (new backfill). The target scores (NORM_TARGET_SCORES)
 * are design constants defining the curve shape.
 *
 * Concretely:
 *   rawScore ≤ rawAtP0   → 0
 *   rawScore = rawAtP50  → 38
 *   rawScore = rawAtP90  → 68
 *   rawScore = rawAtP99  → 87
 *   rawScore ≥ rawAtP100 → 100
 *
 * The curve is intentionally convex at the top: moving from p95 to p99
 * only adds 10 score points (77→87), while moving from p99 to the true
 * maximum adds 13 more. This makes the ceiling legitimately rare.
 */
export function normalizeScore(rawScore: number, baseline: Baseline): number {
  const thresholds = getRawThresholds(baseline);
  const targets = NORM_TARGET_SCORES;

  // Below the minimum → 0
  if (rawScore <= thresholds[0]) return 0;
  // Above the maximum → 100
  if (rawScore >= thresholds[thresholds.length - 1]) return 100;

  // Binary search for the bracket containing rawScore
  let lo = 0;
  let hi = thresholds.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (rawScore >= thresholds[mid]) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  // Linear interpolation within the bracket [lo, hi]
  const rawRange = thresholds[hi] - thresholds[lo];
  if (rawRange === 0) return targets[lo];
  const frac = (rawScore - thresholds[lo]) / rawRange;
  const result = targets[lo] + frac * (targets[hi] - targets[lo]);

  return Math.max(0, Math.min(100, result));
}

// ─── Full player score (public entry point) ───────────────────────────────

export interface PlayerScoreResult {
  playerScore: number;       // 0–100
  rawScore: number;          // unbounded weighted z-sum
  zScores: PlayerZScores;
}

/**
 * Compute the composite 0–100 player score for one player-season.
 * Pure function: no I/O, deterministic given same inputs.
 *
 * @param stats     Raw season totals from the UFA API.
 * @param baseline  All-time distribution params. Default: BAKED_BASELINE.
 */
export function computePlayerScore(
  stats: PlayerSeasonStats,
  baseline: Baseline = BAKED_BASELINE,
): PlayerScoreResult {
  const zScores = computeZScores(stats, baseline);
  const rawScore = computeRawScore(zScores);
  const playerScore = normalizeScore(rawScore, baseline);
  return { playerScore, rawScore, zScores };
}

// ─── Team record ──────────────────────────────────────────────────────────

export interface TeamRecordResult {
  wins: number;
  losses: number;
  /** Short rationale string for display (e.g. "Elite offense, thin on defense"). */
  rationale: string;
}

/**
 * Given 7 player_scores (0–100 each), compute a deterministic season record.
 *
 * TEAM STRENGTH FORMULA
 * ─────────────────────
 * teamStrength = mean(scores) + balanceBonus
 *
 * balanceBonus (v3 — capped at +0.5 to prevent tier bleed):
 *   +0.5 if lowest score > 60  → no weak link at all (everyone above solid-starter)
 *   +0.3 if lowest score > 45  → no slot below average
 *   +0.0 otherwise             → at least one weak slot
 *
 * The bonus still rewards no-weak-link balance, but is intentionally small.
 * Even the maximum +0.5 cannot push a team across a record boundary on its own —
 * that requires genuinely better players, not roster "balance" alone.
 *
 * WIN CURVE — PIECEWISE LINEAR (v3)
 * ──────────────────────────────────
 * Defined as explicit [strength → wins] breakpoints, linearly interpolated.
 * A linear ramp cannot express "gentle in the mid, brutal at the top."
 * PWL is fully interpretable: you can read off any tier directly from the table.
 *
 * Breakpoints (strength → wins):
 *   ≤ 36 →  0    (floor — extreme scrub roster)
 *     38 →  2    (all-median ≈ 38 players, random picks)
 *     46 →  4    (above-average contributors)
 *     54 →  5    (mix of contributors and solid pros)
 *     62 →  6    (6-6 — genuinely above-average, all solid-pro territory)
 *     70 →  7    (all Solid Pro ≥68)
 *     78 →  8    (star-level, p95 ≈ 77)
 *     85 →  9    (elite-caliber; mean ≥85 requires 5-6 slots at Star or above)
 *     90 → 10    (near-historic; mean ≥90 needs most slots at p99 = All-Time Elite)
 *     94 → 11    (all-time great; 19 seasons ever ≥94 in the full 2012-2025 dataset)
 *     97 → 12    (PERFECT — 4 seasons ever ≥97; requires hunting absolute GOATs)
 *   ≥ 97 → 12    (hard cap)
 *
 * Calibration against the real 7905-season distribution (2012-2025):
 *   - Random 7-player team: mean≈40, strength≈40-41 → 2-3 wins (mode)
 *   - Best 7 from one team-year (e.g. Empire 2021): mean≈79-82 → 8-9 wins
 *   - 11 wins (strength≥94): requires mean≥93.5 — ~19 eligible seasons all-time
 *   - 12 wins (strength≥97): requires mean≥96.5 — ~4 eligible seasons all-time;
 *     impossible by random selection; essentially impossible from one team-year.
 *
 * Why PWL over sigmoid?
 *   A sigmoid saturates symmetrically — you'd need to push the midpoint so
 *   high that mid-range teams get no spread. PWL lets us be generous in the
 *   middle (38→62 covers 4 wins in 24 score-points) and extremely steep at
 *   the very top (90→97 covers only 2 wins in 7 score-points), which is the
 *   correct shape for this distribution.
 */

/** Piecewise breakpoints [strength, wins]. Must be sorted ascending by strength. */
const WIN_CURVE: ReadonlyArray<readonly [number, number]> = [
  [36,  0],
  [38,  2],
  [46,  4],
  [54,  5],
  [62,  6],
  [70,  7],
  [78,  8],
  [85,  9],
  [90, 10],
  [94, 11],
  [97, 12],
] as const;

/** Piecewise linear interpolation over WIN_CURVE. */
function pwlWins(strength: number): number {
  if (strength <= WIN_CURVE[0][0]) return WIN_CURVE[0][1];
  const last = WIN_CURVE[WIN_CURVE.length - 1];
  if (strength >= last[0]) return last[1];

  for (let i = 1; i < WIN_CURVE.length; i++) {
    const [x1, y1] = WIN_CURVE[i];
    const [x0, y0] = WIN_CURVE[i - 1];
    if (strength <= x1) {
      const frac = (strength - x0) / (x1 - x0);
      return y0 + frac * (y1 - y0);
    }
  }
  return last[1];
}

export function teamRecord(scores: number[]): TeamRecordResult {
  if (scores.length === 0) {
    return { wins: 0, losses: 12, rationale: 'No players selected.' };
  }

  const sorted = [...scores].sort((a, b) => a - b);
  const mean = scores.reduce((s, x) => s + x, 0) / scores.length;
  const minScore = sorted[0];

  // Balance bonus — capped at +0.5 so it cannot bridge a full record tier on its own.
  const balanceBonus = minScore > 60 ? 0.5 : minScore > 45 ? 0.3 : 0;
  const strength = mean + balanceBonus;

  const wins = Math.round(Math.max(0, Math.min(12, pwlWins(strength))));
  const losses = 12 - wins;

  const rationale = buildRationale(scores, mean, minScore);

  return { wins, losses, rationale };
}

function buildRationale(scores: number[], mean: number, minScore: number): string {
  const parts: string[] = [];

  // Tier labels aligned to v3 record curve breakpoints.
  // mean ≥93.5 → 11 wins; mean ≥96.5 → 12 wins.
  // "Championship-caliber" now correctly maps to the 9-10 win range.
  if (mean >= 94) {
    parts.push('All-time legendary roster');
  } else if (mean >= 88) {
    parts.push('Historic championship-caliber team');
  } else if (mean >= 82) {
    parts.push('Championship-caliber team');
  } else if (mean >= 75) {
    parts.push('Playoff-contender lineup');
  } else if (mean >= 60) {
    parts.push('Solid professional squad');
  } else if (mean >= 44) {
    parts.push('League-average team');
  } else {
    parts.push('Rebuilding roster');
  }

  // Weak-link flags — calibrated to v2 score scale (median≈38, solid-pro≈68)
  if (minScore < 25 && mean > 55) {
    parts.push('one glaring weak spot');
  } else if (minScore < 38 && mean > 62) {
    parts.push('depth concerns');
  } else if (minScore > 68) {
    parts.push('no weak links');
  }

  // Roster composition characterization
  const eliteCount  = scores.filter((s) => s >= 87).length;  // All-Time Elite, p99+
  const starCount   = scores.filter((s) => s >= 68 && s < 87).length;  // Star/Solid Pro
  const belowAvg    = scores.filter((s) => s < 38).length;  // below league median

  if (eliteCount >= 5) {
    parts.push('historically elite across the board');
  } else if (eliteCount >= 3 && starCount >= 2) {
    parts.push('elite anchors with star support');
  } else if (eliteCount >= 2 && starCount >= 3) {
    parts.push('elite anchors with star support');
  } else if (starCount >= 5) {
    parts.push('star-heavy lineup');
  } else if (eliteCount >= 1 && starCount >= 3) {
    parts.push('star-heavy lineup with an elite anchor');
  } else if (belowAvg >= 3) {
    parts.push('needs more playmakers');
  }

  return parts.join(', ') + '.';
}

// ─── Score label helper ───────────────────────────────────────────────────

/**
 * Human-readable tier label for a player_score.
 *
 * Thresholds updated for v2 distribution (2012-2025 baseline):
 *   ≥96  All-Time Greatest  — top ~0.05% of all seasons (~1-5 ever)
 *   ≥87  All-Time Elite     — top ~1% of all seasons (~90 ever)
 *   ≥77  Star               — top 5%, a clear-cut UFA star in their season
 *   ≥68  Solid Pro          — top 10%, reliable starter at high level
 *   ≥55  Contributor        — top 25%, solid professional
 *   ≥38  League Average     — median tier, respectable pro
 *   ≥20  Fringe Roster      — below average but made a UFA roster
 *   <20  Deep Bench         — bottom of the dataset
 */
export function scoreLabel(score: number): string {
  if (score >= 96) return 'All-Time Greatest';
  if (score >= 87) return 'All-Time Elite';
  if (score >= 77) return 'Star';
  if (score >= 68) return 'Solid Pro';
  if (score >= 55) return 'Contributor';
  if (score >= 38) return 'League Average';
  if (score >= 20) return 'Fringe Roster';
  return 'Deep Bench';
}

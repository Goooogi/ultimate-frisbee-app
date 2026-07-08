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
 *    goals          1.0  — primary scoring output; directly wins points
 *    assists        1.0  — equal to goals; sets up every score
 *    blocks         0.8  — high win-correlation; D-line generator
 *    plus_minus     0.7  — net impact; captures defensive holds too
 *    completion_pct 0.7  — throwing EFFICIENCY; valued above raw yards volume.
 *                          A high-completion thrower is worth more than someone
 *                          who racks up yards while turning it over. Clamped to
 *                          0 for low-volume players (see threshold above).
 *    yards_thrown   0.5  — offensive volume; reduced from 0.6 to reflect that
 *                          efficiency (completion_pct) now outweighs raw volume
 *    yards_received 0.5  — important but yards_thrown already credits
 *                          the throw; receiver gets partial credit
 *    hockey_assists 0.4  — second assist; valuable but indirect
 *    drops         −0.4  — receiving turnover; mirrors hockey_assists in
 *                          magnitude because one unforced drop negates a
 *                          similar amount of positive contribution.
 *                          RAW totals (not rate) for consistency with goals/
 *                          assists — high-usage stars do accumulate more drops,
 *                          but they also accumulate more goals/assists; the net
 *                          effect is correctly a slight penalty for carelessness
 *                          rather than a punishment for volume.
 *    throwaways    −0.4  — throwing turnover; same magnitude as drops.
 *                          Already partially captured by completion_pct for
 *                          high-volume throwers; for low-volume throwers
 *                          (completions < 50) who don't get a completion_pct
 *                          z-score this is the only turnover signal.
 *    callahans     +0.3  — D-block-into-score; worth more than hockey_assists
 *                          (+0.4) in moral weight but far rarer — a 0.3 weight
 *                          on a zero-inflated distribution produces a small
 *                          positive bump for the rare season with 1–2 callahans.
 *                          Winsorized at 10 before z-scoring to prevent an
 *                          outlier single-season from blowing up the distribution.
 *    points_played +0.2  — durability/usage signal; intentionally minor so
 *                          workhorses get only a nudge. A full season (~250 pts)
 *                          vs a short one (~90 pts) produces roughly +0.3 score
 *                          points at this weight — meaningful but not decisive.
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
 *      p50   (median) → 50   ← typical player lands at midpoint of scale
 *      p75           → 64
 *      p90           → 75
 *      p95           → 83
 *      p99           → 91
 *      p99.5         → 94
 *      p99.9         → 97
 *      p100  (max)   → 100
 *
 *    This gives:
 *    - Median season: ~50 (median maps cleanly to midpoint)
 *    - Good starter: 60s
 *    - Star: 75–83 (top 5-10% all-time)
 *    - Elite: 91–94 (top 0.5-1% all-time)
 *    - All-Time Greatest: 97–100 (maybe 1–5 seasons in history)
 *    - 100 = the single greatest season in league history (truly unique)
 *    - ~2-4% of player-seasons reach ≥90 (up from ~1% at old scale)
 *
 *    Why piecewise linear over a sigmoid/exp transform?
 *    - Fully interpretable: you can read off "this player is at p90 = 68"
 *    - Directly configurable: changing a target value changes exactly that
 *      bucket without ripple effects on the rest of the distribution
 *    - Stable across re-backfills: only the raw threshold values shift;
 *      the target score values are design constants baked here in code
 *
 * 5. TEAM → RECORD (v4 — recalibrated 2026-06-07 post yards-fix)
 *    Team strength = mean(7 scores) + small balance bonus.
 *    The bonus rewards balance over one mega-star + 6 scrubs:
 *      +0.5 if min score > 85  (no weak link at all; everyone a solid-pro-plus)
 *      +0.3 if min score > 78  (no slot below the solid-pro line)
 *      +0.0 otherwise          (at least one weak slot)
 *
 *    Bonus intentionally capped at +0.5 — cannot bridge a full record tier on its own.
 *
 *    IMPORTANT: The spin+best-pick mechanic (each of 7 picks takes the best
 *    available player from a random team-year) produces a COMPRESSED strength
 *    distribution compared to random individual picks. On the 2K 50–99 scale
 *    (2026-07-08), UFA strengths span roughly p10≈89, p50≈91, p99.5≈94.5,
 *    max≈97, so the WIN_CURVE spans ~81–95 rather than the full 50–99.
 *
 *    Win curve (UFA) — see WIN_CURVE below for live breakpoints. Verified by
 *    scripts/tune-twelve-oh-league-curve.ts ufa (500k-sim MC, spin + 1 skip):
 *      12-0≈2.2%, 11-1≈4.3%, 10-2≈11%, 9-3≈21.4%, 8-4≈27.8% (modal),
 *      7-5≈24.6%, 6-6≈7.9%. These target odds are unchanged from the pre-2K
 *      scale — only the strength numbers moved when the display scale changed.
 *      PUL/WUL run their own looser curves + boosted scores (leagues.ts).
 *
 *    Why PWL over linear or sigmoid?
 *    A sigmoid saturates symmetrically and is harder to tune at the extremes.
 *    PWL is fully interpretable (read the table directly).
 *
 *    12-0 requires deliberately hunting the absolute all-time GOATs across eras;
 *    the best 7 from any single team-year cannot reach it.
 */

// ─── Baseline ──────────────────────────────────────────────────────────────

/**
 * All-time UFA baseline computed from the full 2012-2025 backfill (≥3 GP).
 * The BAKED_BASELINE here is used by the client (no DB round-trip needed for
 * scoring). Re-bake after each annual backfill by copying from the DB row.
 *
 * PERCENTILE ANCHORS (piecewise normalization curve):
 *   rawAtP0   → target 0   (absolute minimum season)
 *   rawAtP50  → target 50  (median player-season — midpoint of scale)
 *   rawAtP75  → target 64  (solid contributor)
 *   rawAtP90  → target 75  (very good, top 10%)
 *   rawAtP95  → target 83  (star territory, top 5%)
 *   rawAtP99  → target 91  (elite, top 1%)
 *   rawAtP995 → target 94  (historically great, top 0.5%)
 *   rawAtP999 → target 97  (all-time great, top 0.1%)
 *   rawAtP100 → target 100 (the single greatest season ever)
 *
 * To update: run the backfill, then query:
 *   SELECT * FROM twelve_oh_baseline WHERE id = 1;
 * and paste the values here.
 */
export interface Baseline {
  playerSeasons: number;
  meanGoals: number;         stdGoals: number;
  meanAssists: number;       stdAssists: number;
  meanBlocks: number;        stdBlocks: number;
  meanHockeyAssists: number; stdHockeyAssists: number;
  meanYardsThrown: number;   stdYardsThrown: number;
  meanYardsReceived: number; stdYardsReceived: number;
  meanPlusMinus: number;     stdPlusMinus: number;
  meanCompletionPct: number; stdCompletionPct: number; // among completions >= 50 only
  // v3 additions — turnover and usage dimensions
  meanDrops: number;         stdDrops: number;
  meanThrowaways: number;    stdThrowaways: number;
  meanCallahans: number;     stdCallahans: number;    // winsorized at 10 before z-score
  meanPointsPlayed: number;  stdPointsPlayed: number;
  // Piecewise percentile anchors for normalization curve (v2+).
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
  // Legacy fields kept for backfill DB schema compatibility (not used in scoring v2+).
  rawScoreMin: number;
  rawScoreMax: number;
  rawScoreP5:  number;
  rawScoreP95: number;
}

/**
 * Seed baseline — values from the full 2012-2025 backfill (v3, with drops/
 * throwaways/callahans/pointsPlayed). These are overwritten by the backfill
 * on each run.
 *
 * Percentile anchors are raw weighted z-scores at each threshold over the
 * full all-time distribution. The backfill script prints BAKED_BASELINE
 * update instructions; paste the output here after each run.
 *
 * *** PLACEHOLDER — run the backfill and paste updated values here. ***
 */
export const BAKED_BASELINE: Baseline = {
  // Computed from 7,905 qualifying player-seasons (≥3 GP), full 2012-2025 backfill v3.
  // Recalibrated 2026-06-07: pre-2021 yards z-scores forced to 0 (missing-data fix).
  // Mean/std values are unchanged from prior run (same pool, same seasons).
  // Percentile anchors shift because pre-2021 raw scores rose ~0.4–0.9 pts each,
  // lifting the distribution median from −1.36 to −0.82 and expanding the range.
  playerSeasons: 7905,
  meanGoals: 10.0799,          stdGoals: 10.8179,
  meanAssists: 10.0593,        stdAssists: 11.5731,
  meanBlocks: 5.4515,          stdBlocks: 5.1827,
  meanHockeyAssists: 8.4517,   stdHockeyAssists: 9.0941,
  // Yards baseline: computed only over seasons with yards data (2021+, nonzero)
  meanYardsThrown: 763.7704,   stdYardsThrown: 947.3343,
  meanYardsReceived: 758.8844, stdYardsReceived: 800.0627,
  meanPlusMinus: 15.1505,      stdPlusMinus: 16.8633,
  // Completion % among completions >= 50 only (real throwers)
  meanCompletionPct: 91.6915,  stdCompletionPct: 4.1329,
  // v3 additions — raw totals, all years (2012+). Callahans winsorized at 10.
  meanDrops: 1.7275,           stdDrops: 1.9660,
  meanThrowaways: 8.7127,      stdThrowaways: 8.9796,
  meanCallahans: 0.0271,       stdCallahans: 0.1654,
  meanPointsPlayed: 155.5875,  stdPointsPlayed: 87.0792,
  // Piecewise percentile anchors — post yards-fix, 2026-06-07
  rawAtP0:   -6.6196,
  rawAtP50:  -0.8162,
  rawAtP75:   1.5649,
  rawAtP90:   4.7760,
  rawAtP95:   6.8099,
  rawAtP99:  10.5767,
  rawAtP995: 12.2799,
  rawAtP999: 15.2743,
  rawAtP100: 19.4299,
  // Legacy fields (kept for DB schema compat, not used for scoring v3).
  rawScoreMin: -6.6196,
  rawScoreMax: 19.4299,
  rawScoreP5:  -3.8608,
  rawScoreP95:  6.8099,
};

// ─── Normalization curve constants ────────────────────────────────────────

/**
 * Piecewise anchor points: [rawScore threshold, target score].
 * The raw thresholds come from BAKED_BASELINE; the target scores are
 * design constants (they define the shape of the curve and should only
 * change if the game-feel target changes — not on every re-backfill).
 *
 * SCALE — NBA-2K-style 50–99 (adopted 2026-07-08). 50 is the floor (the
 * worst qualifying season), 75 is the median (a solid pro), 99 is the single
 * greatest season ever (capped — no 100s). Most rated players read "good"
 * (70s–80s); only sub-median seasons dip toward the 50s.
 *
 * Reading this table (percentile → overall):
 *   p100 (greatest ever) → 99      p95 (star)        → 88
 *   p99.9 (all-time great) → 97    p90 (solid pro)   → 85
 *   p99.5              → 95         p75 (contributor) → 80
 *   p99  (elite)       → 93         p50 (median)      → 75
 *                                   p0  (floor)       → 50
 */
const NORM_TARGET_SCORES = [50, 75, 80, 85, 88, 93, 95, 97, 99] as const;

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
  blocks: 1.0,         // weighted equal to goals/assists — defense wins games
  plusMinus: 0.7,
  // Throwing EFFICIENCY (completion %) is weighted ABOVE raw throwing volume
  // (yards): a high-completion thrower is more valuable than someone who racks
  // up yards while turning it over. completionPct > yardsThrown.
  completionPct: 0.6,  // only credited at >= COMPLETION_PCT_MIN_COMPLETIONS throws
  yardsThrown: 0.5,
  yardsReceived: 0.5,
  hockeyAssists: 0.4,
  // v3 additions — negative weights penalize turnovers, positive reward usage
  drops: -0.5,         // receiving turnover (negative → more drops = lower score)
  throwaways: -0.4,    // throwing turnover (negative → more throwaways = lower score)
  callahans: 0.3,      // D-block-into-score (rare; z-score winsorized at 10)
  pointsPlayed: 0.2,   // durability/usage signal (minor nudge, not decisive)
} as const;

/** Minimum completions to credit the completion % dimension. */
export const COMPLETION_PCT_MIN_COMPLETIONS = 50;

/**
 * Callahans winsorize cap: clip to this value before z-scoring.
 * In 13 seasons of data, callahans are heavily zero-inflated (median = 0).
 * Winsorizing at 10 prevents a rare multi-callahan season from dominating
 * the std and producing an exploded z-score.
 */
export const CALLAHANS_WINSORIZE_MAX = 10;

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
  // v3 additions — all present in UFA API for every season (2012+)
  drops: number;
  throwaways: number;
  callahans: number;
  pointsPlayed: number;
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
  // v3 additions
  /** Positive z = more drops than average → combined with negative weight → lowers score */
  zDrops: number;
  /** Positive z = more throwaways than average → combined with negative weight → lowers score */
  zThrowaways: number;
  /** Callahans winsorized at CALLAHANS_WINSORIZE_MAX before z-scoring */
  zCallahans: number;
  zPointsPlayed: number;
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

  // Yards data is absent from the UFA API for every season before 2021 —
  // both yardsThrown and yardsReceived come back as 0 for those years.
  // The yards baseline mean/std is computed over 2021+ seasons only (nonzero
  // values), so z-scoring 0 against that mean produces a reliably negative
  // z (~−0.81/−0.95) — a missing-DATA penalty the player did not earn.
  //
  // Fix: when BOTH yards fields are 0, treat yards as not available and
  // force both z-scores to 0 (neutral). This gates precisely on pre-2021
  // seasons (which always have both == 0) while leaving 2021+ seasons that
  // genuinely have yards data to score normally. A 2021+ player who truly
  // threw/received 0 yards in a season with ≥3 GP is essentially impossible.
  const noYardsData = stats.yardsThrown === 0 && stats.yardsReceived === 0;

  // Winsorize callahans before z-scoring to prevent zero-inflated outliers
  // from blowing up the distribution (most players have 0; a rare 5+ season
  // should produce a sensible bump, not a z of 8+).
  const callahansWinsorized = Math.min(stats.callahans, CALLAHANS_WINSORIZE_MAX);

  return {
    zGoals: zscore(stats.goals, baseline.meanGoals, baseline.stdGoals),
    zAssists: zscore(stats.assists, baseline.meanAssists, baseline.stdAssists),
    zBlocks: zscore(stats.blocks, baseline.meanBlocks, baseline.stdBlocks),
    zHockeyAssists: zscore(
      stats.hockeyAssists,
      baseline.meanHockeyAssists,
      baseline.stdHockeyAssists,
    ),
    // Force 0 (neutral) when yards data is absent (pre-2021 seasons).
    // The baseline mean is computed over 2021+ only, so scoring 0 against
    // it would produce a spurious negative z — missing data must not penalize.
    zYardsThrown: noYardsData
      ? 0
      : zscore(stats.yardsThrown, baseline.meanYardsThrown, baseline.stdYardsThrown),
    zYardsReceived: noYardsData
      ? 0
      : zscore(stats.yardsReceived, baseline.meanYardsReceived, baseline.stdYardsReceived),
    zPlusMinus: zscore(stats.plusMinus, baseline.meanPlusMinus, baseline.stdPlusMinus),
    zCompletionPct: useCompletionPct
      ? zscore(completionPct, baseline.meanCompletionPct, baseline.stdCompletionPct)
      : 0,
    // v3 additions — raw totals, consistent with goals/assists treatment
    zDrops: zscore(stats.drops, baseline.meanDrops, baseline.stdDrops),
    zThrowaways: zscore(stats.throwaways, baseline.meanThrowaways, baseline.stdThrowaways),
    zCallahans: zscore(callahansWinsorized, baseline.meanCallahans, baseline.stdCallahans),
    zPointsPlayed: zscore(stats.pointsPlayed, baseline.meanPointsPlayed, baseline.stdPointsPlayed),
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
    z.zCompletionPct   * WEIGHTS.completionPct +
    // v3: negative weights make zDrops/zThrowaways lower the score when positive
    z.zDrops           * WEIGHTS.drops +
    z.zThrowaways      * WEIGHTS.throwaways +
    z.zCallahans       * WEIGHTS.callahans +
    z.zPointsPlayed    * WEIGHTS.pointsPlayed
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
 *   rawScore = rawAtP50  → 50
 *   rawScore = rawAtP90  → 75
 *   rawScore = rawAtP99  → 91
 *   rawScore ≥ rawAtP100 → 100
 *
 * The curve is intentionally convex at the top: moving from p95 to p99
 * only adds 8 score points (83→91), while moving from p99 to the true
 * maximum adds 9 more. This makes the ceiling legitimately rare.
 */
export function normalizeScore(rawScore: number, baseline: Baseline): number {
  return pwlNormalize(rawScore, getRawThresholds(baseline));
}

/**
 * League-agnostic core of normalizeScore: piecewise-linear map of a raw
 * weighted z-sum onto the 0–100 scale via 9 percentile anchor thresholds
 * (raw values at P0/P50/P75/P90/P95/P99/P99.5/P99.9/P100). Shared by the
 * UFA engine above and the PUL/WUL configs in leagues.ts, so every league
 * gets the identical score-distribution shape (median 50, star 83, etc.).
 */
export function pwlNormalize(
  rawScore: number,
  thresholds: number[],
  /**
   * Target score at each percentile anchor. Defaults to the shared
   * NORM_TARGET_SCORES (UFA). PUL/WUL pass a lifted top-end array so their
   * stars "pop" higher without moving the median — see LEAGUE_TARGET_SCORES
   * in leagues.ts. Must be the same length as `thresholds`.
   */
  targets: readonly number[] = NORM_TARGET_SCORES,
): number {

  // Below the minimum → scale floor (50 on the 2K scale)
  if (rawScore <= thresholds[0]) return targets[0];
  // Above the maximum → scale ceiling (99 on the 2K scale)
  if (rawScore >= thresholds[thresholds.length - 1]) return targets[targets.length - 1];

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

  // Clamp to the actual scale bounds (targets are ascending: [floor … ceiling]).
  return Math.max(targets[0], Math.min(targets[targets.length - 1], result));
}

// ─── Full player score (public entry point) ───────────────────────────────

export interface PlayerScoreResult {
  playerScore: number;       // 50–99 (2K-style scale)
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
 *   +0.5 if lowest score > 85  → no weak link at all (everyone a solid-pro-plus)
 *   +0.3 if lowest score > 78  → no slot below the solid-pro line
 *   +0.0 otherwise             → at least one weak slot
 *
 * The bonus still rewards no-weak-link balance, but is intentionally small.
 * Even the maximum +0.5 cannot push a team across a record boundary on its own —
 * that requires genuinely better players, not roster "balance" alone.
 *
 * WIN CURVE — PIECEWISE LINEAR (v4, recalibrated 2026-06-07 post yards-fix)
 * ──────────────────────────────────────────────────────────────────────────
 * Defined as explicit [strength → wins] breakpoints, linearly interpolated.
 * PWL is fully interpretable: you can read off any tier directly from the table.
 *
 * The spin+best-pick mechanic compresses the realistic strength range to ~59–96.
 * After the pre-2021 yards-bias fix the pool mean rose slightly; breakpoints were
 * re-derived from cumulative percentiles of the actual 1M-sim strength distribution.
 *
 * Breakpoints (strength → wins):
 *   ≤ 56   →  0    (floor — below actual mechanic minimum)
 *   65.1   →  6    (very weak build, bottom ~1% of games)
 *   77.1   →  7    (mode — 7-5 is most common, ~35%; median team at strength≈81 gets 7)
 *   82.1   →  8    (8-4 second most common, ~32%)
 *   83.6   →  9    (~19%)
 *   86.9   → 10    (~8%)
 *   87.7   → 11    (~3.4%)
 *   ≥ 92   → 12    (PERFECT — ~0.5%; requires hunting all-era GOATs deliberately)
 *
 * Calibration (1M-sim Monte-Carlo, spin=random TY+best-player mechanic, 7905-season pool):
 *   - Typical build: strength≈81.0, record 7-5
 *   - Best from one team-year (Empire 2021 top-7): mean≈83.8 → 9-3 at most
 *   - 12-0: rounding tip at (87.7+92)/2=89.8 (p99.5); ~0.5%; impossible from one TY.
 *
 * Why PWL over sigmoid?
 *   A sigmoid saturates symmetrically and is harder to tune at the extremes.
 *   PWL lets us read off any tier directly and adjust individual band widths
 *   without affecting the rest of the curve.
 */

/** Piecewise breakpoints [strength, wins]. Must be sorted ascending by strength. */
// Win curve (strength → wins), strength = mean(7 scores) + balance bonus (≤0.5).
// Derived by the rounding-tip method: place each w→w+1 transition at the strength
// quantile matching the target cumulative odds, so the curve reproduces a chosen
// win distribution over the real spin+best-pick mechanic.
//
// History: v5 (2026-06-08) hit 12-0≈2.2% on the old median-50 (0–100) scale.
// 2026-07-08 the display scale moved to NBA-2K-style 50–99 (floor 50, median 75,
// cap 99); strengths rose ~10 pts, so the curve was re-derived at the SAME target
// odds — the 12-0 chance is unchanged, only the strength numbers moved. The live
// breakpoints + verified odds live in the comment on WIN_CURVE below.
export type WinCurve = ReadonlyArray<readonly [number, number]>;

// Re-derived 2026-07-08 for the NBA-2K 50–99 score scale via
// scripts/tune-twelve-oh-league-curve.ts ufa (500k-sim MC, spin + 1 skip).
// Holds the original tight game feel EXACTLY: verified 12-0≈2.2%, 11-1≈4.3%,
// 10-2≈11%, 9-3≈21.4%, 8-4≈27.8%, 7-5≈24.6%, 6-6≈7.9%. Strengths now span
// ~81–95 (mean of 50–99 scores + ≤0.5 balance bonus).
const WIN_CURVE: WinCurve = [
  [40,    0],   // floor (degenerate; below any real strength)
  [81.6,  2],
  [85.6,  5],
  [87.7,  6],   // 6-6 zone (~7.9%)
  [89.66, 7],   // 7-5 zone (~24.6%)
  [91.14, 8],   // 8-4 zone (~27.8%, modal)
  [92.16, 9],   // 9-3 zone (~21.4%)
  [93.16, 10],  // 10-2 zone (~11%)
  [93.77, 11],  // 11-1 zone (~4.3%)
  [94.46, 12],  // 12-0 (~2.2%, deliberate all-era GOAT hunting)
] as const;

/** Piecewise linear interpolation over a win curve. */
function pwlWins(strength: number, curve: WinCurve): number {
  if (strength <= curve[0][0]) return curve[0][1];
  const last = curve[curve.length - 1];
  if (strength >= last[0]) return last[1];

  for (let i = 1; i < curve.length; i++) {
    const [x1, y1] = curve[i];
    const [x0, y0] = curve[i - 1];
    if (strength <= x1) {
      const frac = (strength - x0) / (x1 - x0);
      return y0 + frac * (y1 - y0);
    }
  }
  return last[1];
}

/**
 * @param curve Optional league-specific win curve (leagues.ts). Defaults to
 *              the UFA curve; PUL/WUL pass their own MC-calibrated curves.
 */
export function teamRecord(scores: number[], curve: WinCurve = WIN_CURVE): TeamRecordResult {
  if (scores.length === 0) {
    return { wins: 0, losses: 12, rationale: 'No players selected.' };
  }

  const sorted = [...scores].sort((a, b) => a - b);
  const mean = scores.reduce((s, x) => s + x, 0) / scores.length;
  const minScore = sorted[0];

  // Balance bonus — capped at +0.5 so it cannot bridge a full record tier on
  // its own. Thresholds rescaled to the 2K 50–99 curve (median 75, star 88):
  // 85 ≈ every slot a solid-pro-plus (no weak link), 78 ≈ every slot above the
  // solid-pro line (no slot below average). (Was 72/58 on the median-50 scale.)
  const balanceBonus = minScore > 85 ? 0.5 : minScore > 78 ? 0.3 : 0;
  const strength = mean + balanceBonus;

  const wins = Math.round(Math.max(0, Math.min(12, pwlWins(strength, curve))));
  const losses = 12 - wins;

  const rationale = buildRationale(scores, mean, minScore);

  return { wins, losses, rationale };
}

function buildRationale(scores: number[], mean: number, minScore: number): string {
  const parts: string[] = [];

  // Tier labels on the 2K 50–99 scale (mean of 7 scores ≈ team strength).
  // A championship build means most slots are stars (88+); a rebuild sits
  // near/below the 75 median.
  if (mean >= 94) {
    parts.push('All-time legendary roster');
  } else if (mean >= 92) {
    parts.push('Historic championship-caliber team');
  } else if (mean >= 89) {
    parts.push('Championship-caliber team');
  } else if (mean >= 85) {
    parts.push('Playoff-contender lineup');
  } else if (mean >= 82) {
    parts.push('Solid professional squad');
  } else if (mean >= 77) {
    parts.push('League-average team');
  } else {
    parts.push('Rebuilding roster');
  }

  // Weak-link flags — calibrated to the 2K scale (median 75, solid-pro 85).
  if (minScore < 68 && mean > 80) {
    parts.push('one glaring weak spot');
  } else if (minScore < 75 && mean > 82) {
    parts.push('depth concerns');
  } else if (minScore > 85) {
    parts.push('no weak links');
  }

  // Roster composition characterization
  const eliteCount  = scores.filter((s) => s >= 93).length;  // All-Time Elite, p99+
  const starCount   = scores.filter((s) => s >= 85 && s < 93).length;  // Star/Solid Pro
  const belowAvg    = scores.filter((s) => s < 75).length;  // below league median

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
 * Thresholds on the 2K 50–99 scale (2026-07-08):
 *   ≥97  All-Time Greatest  — top ~0.1% of all seasons (p99.9+, ~1-5 ever)
 *   ≥93  All-Time Elite     — top ~1% of all seasons (p99+, ~90 ever)
 *   ≥88  Star               — top 5% (p95+), a clear-cut star in their season
 *   ≥85  Solid Pro          — top 10% (p90+), reliable starter at high level
 *   ≥80  Contributor        — top 25% (p75+), solid professional
 *   ≥75  League Average     — median tier (p50+), respectable pro
 *   ≥65  Fringe Roster      — below median but made a pro roster
 *   <65  Deep Bench         — bottom of the dataset (floor 50)
 */
export function scoreLabel(score: number): string {
  if (score >= 97) return 'All-Time Greatest';
  if (score >= 93) return 'All-Time Elite';
  if (score >= 88) return 'Star';
  if (score >= 85) return 'Solid Pro';
  if (score >= 80) return 'Contributor';
  if (score >= 75) return 'League Average';
  if (score >= 65) return 'Fringe Roster';
  return 'Deep Bench';
}

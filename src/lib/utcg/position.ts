// UTCG — position deriver.
//
// Ultimate has two functional roles: HANDLERS (throwers who run the offense,
// rack up assists + throwing yards) and CUTTERS (receivers who get open deep,
// rack up goals + receiving yards). Many stars are HYBRIDS who do both.
//
// We derive a card's position purely from its season stat line — no new data.
// The primary signal is THROW SHARE: the fraction of a player's total yardage
// that came from throwing vs. receiving. Validated against ground truth
// (2026-07-20) on high-usage 2021+ seasons:
//   handler  (share ≥ 0.58): Gouchoe-Hanas 0.91–1.12, Janas 0.68–0.82,
//                            Nethercutt 0.75, early Jack Williams
//   cutter   (share ≤ 0.42): Ben Jagt 0.14–0.25, Antoine Davis 0.17–0.42
//   hybrid   (between):      Osgar, McDonnell '24/'25, later Jack Williams
//
// Pre-2021 seasons have no yards data (both yards fields 0). For those we fall
// back to the assists-vs-goals share, which tracks the same handler/cutter axis
// (handlers assist, cutters score) though more coarsely.

export type UtcgPosition = 'handler' | 'cutter' | 'hybrid';

/** Minimal stat shape needed to derive a position (subset of a card). */
export interface PositionStats {
  goals: number;
  assists: number;
  yardsThrown: number;
  yardsReceived: number;
}

// Tuned from the ground-truth validation above. The band [0.42, 0.58] is the
// hybrid zone — wide enough that a genuinely two-way player isn't forced into
// one bucket, narrow enough that clear handlers/cutters land correctly.
const HANDLER_THRESHOLD = 0.58;
const CUTTER_THRESHOLD = 0.42;

/**
 * Derive a card's functional position from its season stats.
 *
 * Uses yardage share when yards data exists (2021+), else assist/goal share.
 * Always returns a concrete position — never null — so every card is playable
 * in the formation grid.
 */
export function derivePosition(stats: PositionStats): UtcgPosition {
  const { goals, assists, yardsThrown, yardsReceived } = stats;

  // Primary: yardage share. Guard the case where receiving yards are negative
  // (the UFA API can report small negatives) by flooring the denominator at 1.
  const hasYards = yardsThrown !== 0 || yardsReceived !== 0;
  if (hasYards) {
    const denom = Math.max(1, yardsThrown + yardsReceived);
    const throwShare = yardsThrown / denom;
    if (throwShare >= HANDLER_THRESHOLD) return 'handler';
    if (throwShare <= CUTTER_THRESHOLD) return 'cutter';
    return 'hybrid';
  }

  // Fallback (pre-2021): assist vs. goal share on the same axis.
  const totalPlays = goals + assists;
  if (totalPlays === 0) return 'hybrid'; // no signal → most flexible slot
  const assistShare = assists / totalPlays;
  if (assistShare >= HANDLER_THRESHOLD) return 'handler';
  if (assistShare <= CUTTER_THRESHOLD) return 'cutter';
  return 'hybrid';
}

/** Whether a card may be played in a given slot type. Hybrids fit anywhere. */
export function fitsSlot(pos: UtcgPosition, slot: 'handler' | 'cutter'): boolean {
  if (pos === 'hybrid') return true;
  return pos === slot;
}

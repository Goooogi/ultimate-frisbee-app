// Starting positions for the five offensive presets.
//
// All formations begin with the disc at the brick (~ y=0.29 for a 20yd-from-EZ
// brick on a 120yd field — endzone is ~0.21 + 0.067 = 0.28). The center handler
// holds the disc; the other six players are pre-stacked.
//
// Players are numbered 0..6:
//   0 = center handler (disc holder at step 0)
//   1, 2 = reset / strike-side handlers
//   3-6 = cutters (positions depend on the formation)

import type { FormationID, PlayerPos } from './types';
import { ENDZONE_YD, BRICK_YD_FROM_EZ, FIELD_H_YD } from './field';

/** Brick mark in normalized y (from own goal line). */
export const BRICK_Y = (ENDZONE_YD + BRICK_YD_FROM_EZ) / FIELD_H_YD; // ≈ 0.375

const handler = (id: number, x: number, y: number, label?: string): PlayerPos => ({
  id,
  role: 'handler',
  x,
  y,
  label,
});
const cutter = (id: number, x: number, y: number, label?: string): PlayerPos => ({
  id,
  role: 'cutter',
  x,
  y,
  label,
});

/** Default starting positions for each preset (after the pull is caught). */
export const PRESETS: Record<Exclude<FormationID, 'custom'>, PlayerPos[]> = {
  // Standard vertical stack — 2 handlers behind the disc, 5 cutters stacked
  // up the middle from just past the handlers to deep.
  vert: [
    handler(0, 0.50, BRICK_Y),
    handler(1, 0.38, BRICK_Y - 0.04),
    cutter(2,  0.50, 0.46),
    cutter(3,  0.50, 0.55),
    cutter(4,  0.50, 0.64),
    cutter(5,  0.50, 0.73),
    cutter(6,  0.50, 0.82),
  ],

  // Horizontal stack — 4 cutters in a line across, 3 handlers behind.
  ho: [
    handler(0, 0.50, BRICK_Y),
    handler(1, 0.36, BRICK_Y - 0.04),
    handler(2, 0.64, BRICK_Y - 0.04),
    cutter(3,  0.18, 0.58),
    cutter(4,  0.39, 0.58),
    cutter(5,  0.61, 0.58),
    cutter(6,  0.82, 0.58),
  ],

  // Hex offense — 7-player hexagonal grid. No "handler line"; everyone roams.
  // Default to the textbook starting hex with the center player on the disc.
  hex: [
    handler(0, 0.50, 0.36),
    cutter(1,  0.27, 0.44),
    cutter(2,  0.73, 0.44),
    cutter(3,  0.50, 0.55),
    cutter(4,  0.27, 0.66),
    cutter(5,  0.73, 0.66),
    cutter(6,  0.50, 0.78),
  ],

  // 2-3 split: 2 handlers back, LEFT side stacks 2 cutters vertically,
  // RIGHT side stacks 3 cutters vertically. (Per Hunter's spec.)
  'split-23': [
    handler(0, 0.45, BRICK_Y),
    handler(1, 0.62, BRICK_Y - 0.05),
    // left vert stack (2 cutters)
    cutter(2,  0.28, 0.52),
    cutter(3,  0.28, 0.66),
    // right vert stack (3 cutters)
    cutter(4,  0.72, 0.50),
    cutter(5,  0.72, 0.62),
    cutter(6,  0.72, 0.74),
  ],

  // 3-2 split: mirror of 2-3.
  'split-32': [
    handler(0, 0.55, BRICK_Y),
    handler(1, 0.38, BRICK_Y - 0.05),
    // left vert stack (3 cutters)
    cutter(2,  0.28, 0.50),
    cutter(3,  0.28, 0.62),
    cutter(4,  0.28, 0.74),
    // right vert stack (2 cutters)
    cutter(5,  0.72, 0.52),
    cutter(6,  0.72, 0.66),
  ],

  // Blank canvas — 7 players parked in a row at midfield so they're visible
  // and reachable on every field type, ready to be dragged into position.
  empty: [
    handler(0, 0.15, 0.50),
    handler(1, 0.27, 0.50),
    handler(2, 0.39, 0.50),
    cutter(3,  0.51, 0.50),
    cutter(4,  0.63, 0.50),
    cutter(5,  0.75, 0.50),
    cutter(6,  0.87, 0.50),
  ],
};

export const PRESET_LABELS: Record<Exclude<FormationID, 'custom'>, string> = {
  vert: 'Vert',
  ho: 'Horizontal',
  hex: 'Hex',
  'split-23': '2-3 split',
  'split-32': '3-2 split',
  empty: 'Empty',
};

/** Picker order — empty last as the "build it yourself" escape hatch. */
export const PRESET_ORDER: Array<Exclude<FormationID, 'custom'>> = [
  'vert',
  'ho',
  'hex',
  'split-23',
  'split-32',
  'empty',
];

/**
 * Default defensive positions for a given offensive formation — straight
 * person-defense, each defender placed slightly upfield of their mark (i.e.
 * between the offender and the attacking endzone). User can drag any defender
 * after creation.
 */
export function seedDefenders(offensive: PlayerPos[]): PlayerPos[] {
  return offensive.map((p) => ({
    id: p.id,
    // Role on the defensive side isn't meaningful for rendering — we keep the
    // counterpart's role so future "who's defending whom" lookups have it.
    role: p.role,
    x: p.x,
    y: Math.min(p.y + 0.04, 0.95),
  }));
}

/**
 * Compress full-field-relative y coords into the upper half (0.5..1.0) so
 * that presets designed for a full field still fit entirely on the visible
 * portion of a half-field play.
 *
 *   y_full = 0   → y_half = 0.5   (midfield, bottom of half-field view)
 *   y_full = 1   → y_half = 1.0   (attacking goal line, top)
 *   y_full = 0.5 → y_half = 0.75
 */
export function remapForHalfField(positions: PlayerPos[]): PlayerPos[] {
  return positions.map((p) => ({
    ...p,
    y: 0.5 + p.y * 0.5,
  }));
}

/** Same y compression for the disc. */
export function remapDiscForHalfField<T extends { x: number; y: number }>(d: T): T {
  return { ...d, y: 0.5 + d.y * 0.5 };
}

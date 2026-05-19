// Field geometry. The SVG viewBox uses real-yardage units so coordinates read
// naturally (e.g., the brick mark is 20yd from the goal line).
//
//   Width   = 70 yd (sideline-to-sideline)
//   Length  = 110 yd total (70 playing field + 25 endzone × 2 = 120 in the
//             rulebook, but the simplified WFDF/USAU diagrams use 70 + 25 + 25
//             which is what most playbook apps draw).
//
// y in normalized coords (0..1) is mapped to SVG-y by an inverse so y=0 is
// the BOTTOM (own goal line, looking up the field) and y=1 is the TOP
// (attacking goal line).

export const FIELD_W_YD = 70;
export const ENDZONE_YD = 25;
export const PLAYFIELD_YD = 70;
export const FIELD_H_YD = PLAYFIELD_YD + ENDZONE_YD * 2; // 120

/** Brick mark, the standard offside-receiving start point — 20yd from EZ. */
export const BRICK_YD_FROM_EZ = 20;

/** Endzone fraction of total length. */
export const ENDZONE_RATIO = ENDZONE_YD / FIELD_H_YD; // ≈ 0.208

/** Convert normalized field coords → SVG coords (in yards). */
export function normToSvg(x: number, y: number): { svgX: number; svgY: number } {
  return {
    svgX: x * FIELD_W_YD,
    svgY: (1 - y) * FIELD_H_YD,
  };
}

/** Convert SVG coords (in yards) → normalized field coords, clamped to [0,1]. */
export function svgToNorm(svgX: number, svgY: number): { x: number; y: number } {
  const x = clamp01(svgX / FIELD_W_YD);
  const y = clamp01(1 - svgY / FIELD_H_YD);
  return { x, y };
}

export function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/** Snap a normalized coord to a small grid (~1.5yd) for cleaner placement. */
export function snapNorm(v: number, gridYd = 1.5): number {
  const total = v < 0.5 ? FIELD_W_YD : FIELD_H_YD; // approximate; works fine for both
  const snapped = Math.round((v * total) / gridYd) * gridYd;
  return clamp01(snapped / total);
}

// ── Field-type geometry ────────────────────────────────────────────────────
// `viewBox` is what the SVG actually renders; `aspect` is the CSS
// aspect-ratio the parent container should use. Coordinates inside players
// remain normalized 0..1 against the FULL field — half-field just clips and
// horizontal-field is the same SVG rotated 90° via CSS so the attacking
// endzone ends up on the right side.

import type { FieldType } from './types';

export interface FieldGeom {
  viewBox: string;
  /** CSS aspect ratio for the field container (e.g. "70 / 120"). */
  aspect: string;
  /** Degrees to rotate the rendered field — non-zero only for horizontal. */
  rotateDeg: number;
}

export const FIELD_GEOM: Record<FieldType, FieldGeom> = {
  full: {
    viewBox: `0 0 ${FIELD_W_YD} ${FIELD_H_YD}`,
    aspect: `${FIELD_W_YD} / ${FIELD_H_YD}`,
    rotateDeg: 0,
  },
  // Show only the upper attacking half — y goes from goal line (top) down
  // to midfield (~halfway through the field height in SVG coords).
  half: {
    viewBox: `0 0 ${FIELD_W_YD} ${FIELD_H_YD / 2}`,
    aspect: `${FIELD_W_YD} / ${FIELD_H_YD / 2}`,
    rotateDeg: 0,
  },
  // Landscape: swap viewBox dimensions and apply a coord transform at render
  // time (see normToFieldSvg). Attacking goal lands on the right.
  horizontal: {
    viewBox: `0 0 ${FIELD_H_YD} ${FIELD_W_YD}`,
    aspect: `${FIELD_H_YD} / ${FIELD_W_YD}`,
    rotateDeg: 0,
  },
};

/** Field-type-aware normalized → SVG coord conversion. */
export function normToFieldSvg(
  x: number,
  y: number,
  fieldType: FieldType,
): { svgX: number; svgY: number } {
  if (fieldType === 'horizontal') {
    // Rotate the vertical-field coord system 90° clockwise:
    //   normalized y (own EZ → attacking EZ) ⇒ svgX (left → right)
    //   normalized x (left sideline → right) ⇒ svgY (top → bottom of landscape)
    return { svgX: y * FIELD_H_YD, svgY: x * FIELD_W_YD };
  }
  return normToSvg(x, y);
}

/** Inverse: SVG coord (yards) back to normalized for the active field type. */
export function fieldSvgToNorm(
  svgX: number,
  svgY: number,
  fieldType: FieldType,
): { x: number; y: number } {
  if (fieldType === 'horizontal') {
    return {
      x: clamp01(svgY / FIELD_W_YD),
      y: clamp01(svgX / FIELD_H_YD),
    };
  }
  return svgToNorm(svgX, svgY);
}

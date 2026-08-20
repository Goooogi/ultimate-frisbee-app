// Round-to-round connector lines for the bracket trees (Hunter, 2026-08-20 —
// larger brackets were hard to trace by vertical alignment alone).
//
// One SVG overlay per bracket grid, drawn behind the cards. Geometry is the
// shared tree layout every league renders: fixed 180px columns, 24px gap
// (gap-x-6), cards absolutely positioned at `positions.get(id) + 32` (the
// 20px label row + 12px margin), card height ≈ 88px → vertical center at +44.
// An elbow runs from each feeder card's right edge to its child's left edge,
// turning at the middle of the column gap. Feeder→child linkage is the same
// sourcesFor the layout engine uses, so lines always agree with positioning
// (orderColumnsByFeeders guarantees they never cross).
//
// Callers pass the SAME columns/positions they render cards from (non-empty
// columns only, engine-adapted BracketNode games). The overlay must be the
// FIRST child of the relative grid container so cards paint above it.

import { sourcesFor, type BracketColumn, type BracketNode } from '@/lib/bracket-tree';

const COL_W = 180;
const COL_GAP = 24;
const TOP_OFFSET = 32;
const CARD_MID = 44;

export function BracketConnectors({
  columns,
  positions,
}: {
  columns: BracketColumn<BracketNode>[];
  positions: Map<string, number>;
}) {
  const paths: string[] = [];
  for (let i = 1; i < columns.length; i++) {
    const prev = columns[i - 1].games;
    const x1 = (i - 1) * (COL_W + COL_GAP) + COL_W;
    const x2 = i * (COL_W + COL_GAP);
    const midX = x1 + COL_GAP / 2;
    for (const g of columns[i].games) {
      const childTop = positions.get(g.id);
      if (childTop == null) continue;
      const y2 = childTop + TOP_OFFSET + CARD_MID;
      for (const s of sourcesFor(g, prev)) {
        const srcTop = positions.get(s.id);
        if (srcTop == null) continue;
        const y1 = srcTop + TOP_OFFSET + CARD_MID;
        paths.push(`M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`);
      }
    }
  }
  if (paths.length === 0) return null;

  return (
    <svg
      className="absolute inset-0 pointer-events-none text-hairline"
      width="100%"
      height="100%"
      aria-hidden="true"
    >
      {paths.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="currentColor" strokeWidth="1.5" />
      ))}
    </svg>
  );
}

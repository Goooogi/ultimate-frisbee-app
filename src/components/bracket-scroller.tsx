'use client';

// Scroll-collapsing shell for the bracket trees (Hunter, 2026-08-20).
//
// Only ~2 rounds fit a phone, and panning a Round-of-32 bracket out to the
// final meant dragging past screens of tree whitespace: later rounds sit at
// their feeders' midpoints, so a semifinal column is two cards ~800px apart.
//
// ESPN-bracket behavior instead: the round at the viewport's LEFT edge always
// reads as a compact list (games stacked at the row pitch), and rounds to its
// right sit at their feeders' midpoints relative to THAT. As the user swipes,
// card positions interpolate between the per-round layouts (collapsedLayouts)
// in lockstep with scrollLeft — the collapse tracks the finger; there is no
// keyframe animation to stutter or land wrong. The bracket's height follows
// the focused round too, so a 32-team bracket stops holding 1,600px of page
// while the user is looking at the semis.
//
// Columns are sized so exactly 2 rounds fit under a 620px container (3 up to
// 980px), with per-round scroll snap; desktop keeps the fixed 180px columns
// and free panning. All per-frame work is imperative DOM writes — card
// transforms, connector path `d`, container height — never a React re-render.
// The server renders the plain scrollLeft-0 tree, so first paint and no-JS
// match today's layout exactly.

import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ROW_PITCH_PX,
  collapsedLayouts,
  sourcesFor,
  type BracketNode,
} from '@/lib/bracket-tree';

const COL_GAP = 24; // gap-x-6
const LABEL_H = 32; // 20px round-label row + 12px margin (mb-3)
const CARD_MID = 44; // vertical center of a card, from its layout position
const DESKTOP_COL_W = 180;
// Slack under the tallest card: breathing room where pb-2 used to sit, and
// keeps a classic (non-overlay) horizontal scrollbar from clipping the cards
// now that the scroller hides vertical overflow.
const BOTTOM_PAD = 16;

export interface ScrollerColumn<T extends BracketNode> {
  key: string;
  label: string;
  games: T[];
}

export function BracketScroller<T extends BracketNode>({
  columns,
  positions,
  renderCard,
  cardLift,
}: {
  /** Non-empty round columns, in the vertical order assignPositions set. */
  columns: ScrollerColumn<T>[];
  /** Base layout from assignPositions (the expanded, scrollLeft-0 tree). */
  positions: Map<string, number>;
  renderCard: (game: T) => ReactNode;
  /** Px a card renders ABOVE its layout position (WFDF's placement tag);
   *  connectors keep aiming at the layout position, same as before. */
  cardLift?: (game: T) => number;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const cardEls = useRef(new Map<string, HTMLDivElement>());
  const pathEls = useRef(new Map<string, SVGPathElement>());
  const [colW, setColW] = useState(DESKTOP_COL_W);

  const layouts = useMemo(() => collapsedLayouts(columns, positions), [columns, positions]);

  // Height per focused round: only columns k.. matter — earlier rounds have
  // scrolled off-screen left, and whatever hangs below this height is hidden
  // by the scroller's overflow-y clip, not given page room.
  const heights = useMemo(
    () =>
      layouts.map((m, k) => {
        let maxTop = 0;
        for (let j = k; j < columns.length; j++) {
          for (const g of columns[j].games) maxTop = Math.max(maxTop, m.get(g.id) ?? 0);
        }
        return maxTop + ROW_PITCH_PX + LABEL_H;
      }),
    [layouts, columns],
  );

  // Feeder→child connector pairs — the same linkage the layouts use, so the
  // elbows always agree with card positions.
  const pairs = useMemo(() => {
    const out: { col: number; childId: string; srcId: string }[] = [];
    for (let i = 1; i < columns.length; i++) {
      for (const g of columns[i].games) {
        for (const s of sourcesFor(g, columns[i - 1].games)) {
          out.push({ col: i, childId: g.id, srcId: s.id });
        }
      }
    }
    return out;
  }, [columns]);

  // 2 rounds in the viewport on phones, 3 on tablets, fixed 180px on desktop.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      if (w >= 980) setColW(DESKTOP_COL_W);
      else if (w >= 620) setColW((w - 2 * COL_GAP) / 3);
      else setColW((w - COL_GAP) / 2);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || columns.length === 0) return;
    const stride = colW + COL_GAP;
    const last = columns.length - 1;
    let raf = 0;

    const apply = () => {
      raf = 0;
      const f = Math.min(Math.max(scroller.scrollLeft / stride, 0), last);
      const k = Math.min(Math.floor(f), Math.max(last - 1, 0));
      const t = last === 0 ? 0 : f - k;
      const from = layouts[k];
      const to = layouts[Math.min(k + 1, last)];
      const posOf = (id: string) => {
        const a = from.get(id) ?? positions.get(id) ?? 0;
        const b = to.get(id) ?? a;
        return a + (b - a) * t;
      };

      // Height eases toward whichever state is TALLER (shrinks late, grows
      // early), so the exiting round's lower cards only clip once the round
      // is nearly off-screen, and an entering round is revealed before it
      // slides in.
      const hFrom = heights[k];
      const hTo = heights[Math.min(k + 1, last)];
      const ht = hTo < hFrom ? t * t : 1 - (1 - t) * (1 - t);
      scroller.style.height = `${hFrom + (hTo - hFrom) * ht + BOTTOM_PAD}px`;

      for (const [id, el] of cardEls.current) {
        el.style.transform = `translateY(${posOf(id) - (positions.get(id) ?? 0)}px)`;
      }

      for (const p of pairs) {
        const el = pathEls.current.get(`${p.childId}|${p.srcId}`);
        if (!el) continue;
        const x1 = (p.col - 1) * stride + colW;
        const y1 = posOf(p.srcId) + LABEL_H + CARD_MID;
        const y2 = posOf(p.childId) + LABEL_H + CARD_MID;
        el.setAttribute('d', `M ${x1} ${y1} H ${x1 + COL_GAP / 2} V ${y2} H ${p.col * stride}`);
      }
    };

    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    apply();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [colW, columns, layouts, heights, pairs, positions]);

  return (
    <div
      ref={scrollerRef}
      className="overflow-x-auto overflow-y-hidden overscroll-x-contain snap-x snap-mandatory lg:snap-none"
      style={{ height: `${(heights[0] ?? ROW_PITCH_PX + LABEL_H) + BOTTOM_PAD}px` }}
    >
      <div
        // Explicit width: a block-level grid sizes to its container and lets
        // the tracks overflow, which left the inset-0 connector SVG spanning
        // only the first viewport — later rounds' elbows clipped away.
        className="grid gap-x-6 relative"
        style={{
          gridTemplateColumns: `repeat(${columns.length}, ${colW}px)`,
          width: `${columns.length * colW + (columns.length - 1) * COL_GAP}px`,
          height: `${heights[0] ?? 0}px`,
        }}
      >
        <svg
          className="absolute inset-0 pointer-events-none text-hairline"
          width="100%"
          height="100%"
          aria-hidden="true"
        >
          {pairs.map((p) => {
            const x1 = (p.col - 1) * (colW + COL_GAP) + colW;
            const y1 = (positions.get(p.srcId) ?? 0) + LABEL_H + CARD_MID;
            const y2 = (positions.get(p.childId) ?? 0) + LABEL_H + CARD_MID;
            const key = `${p.childId}|${p.srcId}`;
            return (
              <path
                key={key}
                ref={(el) => {
                  if (el) pathEls.current.set(key, el);
                  else pathEls.current.delete(key);
                }}
                d={`M ${x1} ${y1} H ${x1 + COL_GAP / 2} V ${y2} H ${p.col * (colW + COL_GAP)}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              />
            );
          })}
        </svg>
        {columns.map((col) => (
          <div key={col.key} className="relative h-full snap-start">
            <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-faint font-tight mb-3 text-center h-[20px]">
              {col.label}
            </div>
            {col.games.map((g) => (
              <div
                key={g.id}
                ref={(el) => {
                  if (el) cardEls.current.set(g.id, el);
                  else cardEls.current.delete(g.id);
                }}
                className="absolute left-0 right-0"
                style={{
                  top: `${(positions.get(g.id) ?? 0) + LABEL_H - (cardLift?.(g) ?? 0)}px`,
                }}
              >
                {renderCard(g)}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

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

import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  const contentRef = useRef<HTMLDivElement | null>(null);
  const cardEls = useRef(new Map<string, HTMLDivElement>());
  const pathEls = useRef(new Map<string, SVGPathElement>());
  const applyRef = useRef<(() => void) | null>(null);
  const [colW, setColW] = useState(DESKTOP_COL_W);

  // Ref callbacks MUST be stable. An inline arrow is a new function every
  // render, so React detaches (calls with null) and re-attaches every card and
  // path on ANY parent re-render — which emptied these maps mid-gesture and
  // left cards frozen at stale transforms until the next scroll event. That
  // was the "shake". Keyed factories are created once and cached.
  const cardRefCbs = useRef(new Map<string, (el: HTMLDivElement | null) => void>());
  const pathRefCbs = useRef(new Map<string, (el: SVGPathElement | null) => void>());

  const cardRef = useCallback((id: string) => {
    let cb = cardRefCbs.current.get(id);
    if (!cb) {
      cb = (el: HTMLDivElement | null) => {
        if (el) cardEls.current.set(id, el);
        else cardEls.current.delete(id);
      };
      cardRefCbs.current.set(id, cb);
    }
    return cb;
  }, []);

  const pathRef = useCallback((key: string) => {
    let cb = pathRefCbs.current.get(key);
    if (!cb) {
      cb = (el: SVGPathElement | null) => {
        if (el) pathEls.current.set(key, el);
        else pathEls.current.delete(key);
      };
      pathRefCbs.current.set(key, cb);
    }
    return cb;
  }, []);

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

  // Everything `apply` reads lives in a ref, so the scroll listener is
  // installed ONCE and never torn down mid-gesture. Re-subscribing on every
  // layouts/heights/pairs identity change (they're useMemo'd on `columns`,
  // which callers rebuild whenever `games` changes identity) was ripping the
  // listener out from under an in-flight fling.
  const stateRef = useRef({ columns, positions, layouts, heights, pairs, colW });
  stateRef.current = { columns, positions, layouts, heights, pairs, colW };

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    let raf = 0;

    const apply = () => {
      raf = 0;
      const el0 = scrollerRef.current;
      const content = contentRef.current;
      if (!el0 || !content) return;
      const { columns, positions, layouts, heights, pairs, colW } = stateRef.current;
      if (columns.length === 0) return;

      const stride = colW + COL_GAP;
      const last = columns.length - 1;
      const f = Math.min(Math.max(el0.scrollLeft / stride, 0), last);
      const k = Math.min(Math.floor(f), Math.max(last - 1, 0));
      const t = last === 0 ? 0 : f - k;
      const from = layouts[k];
      const to = layouts[Math.min(k + 1, last)];
      if (!from || !to) return;
      const posOf = (id: string) => {
        const a = from.get(id) ?? positions.get(id) ?? 0;
        const b = to.get(id) ?? a;
        return a + (b - a) * t;
      };

      // Height eases toward whichever state is TALLER (shrinks late, grows
      // early), so the exiting round's lower cards only clip once the round
      // is nearly off-screen, and an entering round is revealed before it
      // slides in.
      //
      // This is written to the CONTENT wrapper, never to the scroll container.
      // Resizing a `snap-mandatory` scroller from inside its own scroll handler
      // makes the browser re-run snap selection against the new geometry, which
      // is what flung the bracket to a different round mid-swipe.
      const hFrom = heights[k];
      const hTo = heights[Math.min(k + 1, last)];
      const ht = hTo < hFrom ? t * t : 1 - (1 - t) * (1 - t);
      content.style.height = `${hFrom + (hTo - hFrom) * ht}px`;

      for (const [id, el] of cardEls.current) {
        // `top` is (position + LABEL_H - lift) and the target is
        // (posOf + LABEL_H - lift), so the lift cancels and the delta is just
        // the layout movement. Cards absent from `positions` (shouldn't happen,
        // but a stale ref would) fall back to 0 rather than flinging to the top.
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

    applyRef.current = apply;

    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    apply();
    scroller?.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      scroller?.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
    // Mount-only: `apply` reads live values through stateRef.
  }, []);

  // Re-run the imperative pass after any render that could change geometry,
  // WITHOUT re-subscribing the scroll listener. Prune first: a game that left
  // the bracket would otherwise keep a detached node in cardEls forever, and
  // the rAF pass would go on writing transforms to it.
  useLayoutEffect(() => {
    const live = new Set<string>();
    for (const col of columns) for (const g of col.games) live.add(g.id);
    for (const id of cardEls.current.keys()) if (!live.has(id)) cardEls.current.delete(id);
    for (const id of cardRefCbs.current.keys()) if (!live.has(id)) cardRefCbs.current.delete(id);

    const liveKeys = new Set(pairs.map((p) => `${p.childId}|${p.srcId}`));
    for (const k of pathEls.current.keys()) if (!liveKeys.has(k)) pathEls.current.delete(k);
    for (const k of pathRefCbs.current.keys()) if (!liveKeys.has(k)) pathRefCbs.current.delete(k);

    applyRef.current?.();
  }, [colW, columns, layouts, heights, pairs, positions]);

  return (
    <div
      ref={scrollerRef}
      className="overflow-x-auto overflow-y-hidden overscroll-x-contain snap-x snap-mandatory lg:snap-none"
      // Sized to the FIRST layout and left alone from here on. The per-frame
      // collapse resizes the inner content instead; a scroll container that
      // changes height while snapping re-evaluates its snap target and can
      // jump the user to a different round mid-swipe.
      style={{ height: `${(heights[0] ?? ROW_PITCH_PX + LABEL_H) + BOTTOM_PAD}px` }}
    >
      <div
        ref={contentRef}
        // Explicit width: a block-level grid sizes to its container and lets
        // the tracks overflow, which left the inset-0 connector SVG spanning
        // only the first viewport — later rounds' elbows clipped away.
        //
        // The collapse animates THIS element's height, not the scroller's:
        // resizing the snap container itself re-triggers snap selection.
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
                ref={pathRef(key)}
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
                ref={cardRef(g.id)}
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

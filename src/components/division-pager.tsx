'use client';

// DivisionPager (web) — segmented division control + touch-swipe paging
// between divisions. Web port of the mobile app's DivisionPager
// (Hunter, 2026-08-18): one rounded segmented box (raised chip = active
// division) sits BELOW the view tabs (screens render those above this
// component), and the division-scoped content swipes left/right on touch.
//
// LIVE PREVIEW WHILE DRAGGING: content renders through `renderDivision(value)`
// so the pager can mount the incoming division's REAL content beside the
// active one — no blank page tracking the finger. The prev/next neighbors are
// ALWAYS mounted (not on first drag movement — mounting mid-gesture cost a
// jank frame, Hunter 2026-08-19), parked off-screen at ±stride and riding the
// drag translation; a drag frame is then pure transform work, zero React
// mounting. On commit, the active/outgoing pair takes over as two live layers
// (outgoing keeps rendering the old division while it exits) and slides on a
// progress value; onChange fires at release so the incoming layer becomes the
// active render seamlessly. Mounting ceiling is active+2 neighbors — Worlds
// events field 10+ divisions, mounting all of them would be too heavy.
//
// STRIDE = the content width EXCLUDING the edge-bleed gutter (contentWidth()
// below). Parking a neighbor at a bare ±clientWidth (gutter included) or
// leaving the side layers unpadded relative to the active layer both collapse
// the visual gap between two divisions' cards to less than the page's own
// edge margin — half-swiped cards then look like they're touching. Every
// side layer carries the identical px-5 gutter as the active layer, and every
// offset (park position + commit interpolation) uses this same stride, so the
// gap between two divisions' cards at any point in the gesture exactly equals
// the cards' own screen-edge margin (Hunter, 2026-08-19).
//
// Gesture negotiation mirrors the mobile component: only decisively-horizontal
// moves are claimed (vertical page scroll passes through untouched), and a
// touch that starts inside a horizontally-scrollable descendant (bracket
// trees) is left alone — swiping over a bracket pans the bracket.
//
// With 0–1 divisions it renders the single division bare: no tabs, no swipe.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export interface DivisionPagerOption<V extends string> {
  value: V;
  label: string;
}

interface DivisionPagerProps<V extends string> {
  divisions: DivisionPagerOption<V>[];
  active: V | null;
  onChange: (v: V) => void;
  /** Renders one division's content. Called for the active division every
   *  render, and for the NEIGHBOR division while a swipe is in flight — must
   *  be pure-ish and cheap enough to mount mid-gesture. */
  renderDivision: (value: V) => ReactNode;
  /** Layout classes for the swiped content wrapper (e.g. "flex flex-col
   *  gap-8") — screens whose tab sections relied on the page root's flex gap
   *  pass it here, since the pager re-parents them. Applied to every layer
   *  (active/outgoing/incoming) so mid-slide layout matches. */
  contentClassName?: string;
}

// Swipe must travel this fraction of the container (or flick faster than
// FLICK_VELOCITY, px/ms) to commit a division change; less springs back.
const COMMIT_FRACTION = 0.22;
const FLICK_VELOCITY = 0.3;
// Minimum travel before a fast flick counts — guards a jittery tap from
// registering as a page change.
const FLICK_MIN_TRAVEL = 16;
const SLIDE_MS = 280;
const EASE = 'cubic-bezier(0.33, 1, 0.68, 1)'; // ease-out cubic

// Slide/commit distance = the CONTENT width, excluding the edge-bleed
// padding (the "stride" — see the header note). clientWidth includes that
// padding, which would inflate the commit threshold by the gutter (and
// collapse the inter-page gap below the page's own edge margin).
function contentWidth(container: HTMLDivElement): number {
  const cs = getComputedStyle(container);
  return container.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
}

/** True when the touch landed inside a descendant that scrolls horizontally
 *  itself (bracket trees) — that scroller owns the gesture. */
function insideHorizontalScroller(target: EventTarget | null, stop: HTMLElement): boolean {
  let el = target instanceof Element ? target : null;
  while (el && el !== stop) {
    if (el.scrollWidth > el.clientWidth + 1) {
      const ox = getComputedStyle(el).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
    }
    el = el.parentElement;
  }
  return false;
}

export function DivisionPager<V extends string>({
  divisions,
  active,
  onChange,
  renderDivision,
  contentClassName,
}: DivisionPagerProps<V>) {
  const activeIndex = Math.max(0, divisions.findIndex((d) => d.value === active));
  const count = divisions.length;
  const activeValue = divisions[activeIndex]?.value ?? active;

  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const prevRef = useRef<HTMLDivElement>(null);
  const parkedPrevRef = useRef<HTMLDivElement>(null);
  const parkedNextRef = useRef<HTMLDivElement>(null);
  const tabRowRef = useRef<HTMLDivElement>(null);
  const tabFramesRef = useRef<Map<string, { offsetLeft: number; width: number }>>(new Map());

  // Latest values for the touch handlers without re-binding them mid-gesture.
  const stateRef = useRef({ activeIndex, count, divisions, onChange });
  stateRef.current = { activeIndex, count, divisions, onChange };
  const renderRef = useRef(renderDivision);
  renderRef.current = renderDivision;

  const gestureRef = useRef<{
    startX: number;
    startY: number;
    lastX: number;
    lastT: number;
    vx: number;
    claimed: boolean;
    claimOffset: number;
    ignored: boolean;
  } | null>(null);
  const transitioningRef = useRef(false);
  const [transition, setTransition] = useState<{
    prevValue: V;
    dir: 1 | -1;
    fromDx: number;
  } | null>(null);

  // The parked neighbors are ALWAYS mounted (not spun up on first drag
  // movement) so a drag frame is pure transform work — see the header note.
  const prevIndex = activeIndex > 0 ? activeIndex - 1 : null;
  const nextIndex = activeIndex < count - 1 ? activeIndex + 1 : null;
  const parkedPrev = prevIndex != null ? divisions[prevIndex] : null;
  const parkedNext = nextIndex != null ? divisions[nextIndex] : null;

  // Park both neighbors at rest at ±stride, clearing any leftover transform.
  const parkNeighbors = () => {
    const container = containerRef.current;
    if (!container) return;
    const w = contentWidth(container);
    const p = parkedPrevRef.current;
    const n = parkedNextRef.current;
    if (p) {
      p.style.transition = 'none';
      p.style.transform = `translateX(${-w}px)`;
    }
    if (n) {
      n.style.transition = 'none';
      n.style.transform = `translateX(${w}px)`;
    }
  };

  // Re-park on active-division change AND when a commit transition ends. The
  // parked layers are unmounted for the whole transition, so the activeIndex
  // pass runs against null refs; when they remount on transition-end they'd
  // otherwise sit untransformed at translateX(0) — stacked directly over the
  // active division, painting the WRONG division's cards on top of it.
  useLayoutEffect(() => {
    parkNeighbors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, transition]);

  // Park offsets are px values measured at park time — a viewport resize (or
  // the lg breakpoint toggling the gutter) leaves them stale, pulling a
  // neighbor inside the clip where it renders as a phantom second division
  // on desktop. Re-measure whenever the container resizes at rest.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => {
      if (transitioningRef.current || gestureRef.current?.claimed) return;
      parkNeighbors();
    });
    ro.observe(container);
    return () => ro.disconnect();
    // count > 1 gates the container's existence — divisions arrive async, so
    // the observer must attach when the pager goes from bare to paged.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count > 1]);

  // Runs the committed slide: both layers positioned from where the finger
  // left off, then transitioned — outgoing to off-screen, incoming to 0.
  useLayoutEffect(() => {
    if (!transition) return;
    const container = containerRef.current;
    const content = contentRef.current;
    const prev = prevRef.current;
    if (!container || !content || !prev) return;
    const w = contentWidth(container);
    const { dir, fromDx } = transition;
    content.style.transition = 'none';
    prev.style.transition = 'none';
    content.style.transform = `translateX(${fromDx + dir * w}px)`;
    prev.style.transform = `translateX(${fromDx}px)`;
    void content.offsetHeight; // commit start positions before arming the transition
    content.style.transition = `transform ${SLIDE_MS}ms ${EASE}`;
    prev.style.transition = `transform ${SLIDE_MS}ms ${EASE}`;
    content.style.transform = 'translateX(0px)';
    prev.style.transform = `translateX(${-dir * w}px)`;
    const done = window.setTimeout(() => {
      content.style.transition = '';
      content.style.transform = '';
      transitioningRef.current = false;
      setTransition(null);
    }, SLIDE_MS + 40);
    return () => window.clearTimeout(done);
  }, [transition]);

  // Keep the active tab on-screen when it changes (swipe can select a tab
  // that's scrolled out of the row's viewport).
  useEffect(() => {
    const row = tabRowRef.current;
    const frame = activeValue != null ? tabFramesRef.current.get(String(activeValue)) : null;
    if (!row || !frame) return;
    const target = frame.offsetLeft + frame.width / 2 - row.clientWidth / 2;
    row.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  }, [activeValue]);

  const springBack = () => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;
    const w = contentWidth(container);
    const p = parkedPrevRef.current;
    const n = parkedNextRef.current;
    content.style.transition = `transform 200ms ${EASE}`;
    content.style.transform = 'translateX(0px)';
    if (p) {
      p.style.transition = `transform 200ms ${EASE}`;
      p.style.transform = `translateX(${-w}px)`;
    }
    if (n) {
      n.style.transition = `transform 200ms ${EASE}`;
      n.style.transform = `translateX(${w}px)`;
    }
    window.setTimeout(() => {
      content.style.transition = '';
      content.style.transform = '';
      if (p) {
        p.style.transition = '';
        p.style.transform = `translateX(${-w}px)`;
      }
      if (n) {
        n.style.transition = '';
        n.style.transform = `translateX(${w}px)`;
      }
    }, 240);
  };

  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container || transitioningRef.current || stateRef.current.count <= 1) return;
    const t = e.touches[0];
    gestureRef.current = {
      startX: t.clientX,
      startY: t.clientY,
      lastX: t.clientX,
      lastT: e.timeStamp,
      vx: 0,
      claimed: false,
      claimOffset: 0,
      ignored: insideHorizontalScroller(e.target, container),
    };
  };

  const onTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    const content = contentRef.current;
    if (!g || g.ignored || !content) return;
    const t = e.touches[0];
    const dx = t.clientX - g.startX;
    const dy = t.clientY - g.startY;
    if (!g.claimed) {
      // Vertical-dominant movement hands the gesture to the page scroll for good.
      if (Math.abs(dy) > 14 && Math.abs(dy) >= Math.abs(dx)) {
        g.ignored = true;
        return;
      }
      // Any decisively horizontal move claims the gesture — requiring a 1.6×
      // horizontal bias meant a natural, slightly-diagonal thumb swipe never
      // registered (Hunter, 2026-08-18).
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
        g.claimed = true;
        // Measure from the claim point so content doesn't jump on frame one.
        g.claimOffset = dx;
        content.style.transition = 'none';
      } else {
        return;
      }
    }
    const dt = e.timeStamp - g.lastT;
    if (dt > 0) g.vx = (t.clientX - g.lastX) / dt;
    g.lastX = t.clientX;
    g.lastT = e.timeStamp;
    const { activeIndex: i, count: n } = stateRef.current;
    let visual = dx - g.claimOffset;
    // Rubber-band past the first/last division — nothing parked past the end.
    const atStart = i === 0 && visual > 0;
    const atEnd = i === n - 1 && visual < 0;
    if (atStart || atEnd) visual /= 3;
    content.style.transform = `translateX(${visual}px)`;
    // Both parked neighbors ride the same drag translation every frame —
    // pure transform work, no React mount/unmount mid-gesture.
    const container = containerRef.current;
    if (container) {
      const w = contentWidth(container);
      const p = parkedPrevRef.current;
      const nEl = parkedNextRef.current;
      if (p) {
        p.style.transition = 'none';
        p.style.transform = `translateX(${visual - w}px)`;
      }
      if (nEl) {
        nEl.style.transition = 'none';
        nEl.style.transform = `translateX(${visual + w}px)`;
      }
    }
  };

  const onTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    gestureRef.current = null;
    const container = containerRef.current;
    if (!g || !g.claimed || !container) return;
    const { activeIndex: i, count: n, divisions: divs, onChange: change } = stateRef.current;
    const t = e.changedTouches[0];
    const dx = t.clientX - g.startX;
    const w = contentWidth(container);
    const commit = w * COMMIT_FRACTION;
    const goNext =
      i < n - 1 && (dx < -commit || (dx < -FLICK_MIN_TRAVEL && g.vx < -FLICK_VELOCITY));
    const goPrev = i > 0 && (dx > commit || (dx > FLICK_MIN_TRAVEL && g.vx > FLICK_VELOCITY));
    const dir = goNext ? 1 : goPrev ? -1 : 0;
    if (dir === 0) {
      springBack();
      return;
    }
    transitioningRef.current = true;
    setTransition({ prevValue: divs[i].value, dir, fromDx: dx - g.claimOffset });
    change(divs[i + dir].value);
  };

  const onTouchCancel = () => {
    const g = gestureRef.current;
    gestureRef.current = null;
    if (g?.claimed) springBack();
  };

  if (count <= 1) {
    const only = activeValue ?? divisions[0]?.value;
    return only != null ? <>{renderRef.current(only)}</> : null;
  }

  return (
    <div className="flex flex-col gap-2.5">
      {/* Segmented control — one rounded box, active division a raised chip
          inside it. Horizontal-scrolls (never wraps) when 10+ divisions
          overflow; centered when it fits. */}
      <div
        ref={tabRowRef}
        className="flex justify-center overflow-x-auto scrollbar-none pb-2"
      >
        <div className="inline-flex items-center gap-0.5 p-[3px] rounded-card bg-ink/5 flex-shrink-0">
          {divisions.map((d, i) => {
            const isActive = i === activeIndex;
            return (
              <button
                key={d.value}
                ref={(el) => {
                  if (el) {
                    tabFramesRef.current.set(String(d.value), {
                      offsetLeft: el.offsetLeft,
                      width: el.offsetWidth,
                    });
                  }
                }}
                type="button"
                onClick={() => {
                  if (i !== activeIndex) onChange(d.value);
                }}
                role="tab"
                aria-selected={isActive}
                aria-label={`${d.label} division`}
                className={[
                  'px-3.5 py-[5px] rounded-[15px] whitespace-nowrap',
                  'text-[11px] font-bold tracking-[0.06em] uppercase font-tight',
                  'transition-colors cursor-pointer',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  isActive ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink',
                ].join(' ')}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Edge-bleed the TOUCH surface, not the layout: PageShell's px-5 gutter
          left 20px dead strips down both screen edges where a swipe that
          started there never reached this handler at all (Hunter, 2026-08-18).
          The negative margin + equal padding cancel out, so content sits
          exactly where it did — same trick the view-tab rows use. Desktop
          (lg) keeps its own gutter, where there's no touch to catch. */}
      <div
        ref={containerRef}
        className="relative overflow-hidden -mx-5 px-5 lg:mx-0 lg:px-0"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchCancel}
      >
        <div ref={contentRef} className={['will-change-transform', contentClassName ?? ''].join(' ')}>
          {activeValue != null ? renderRef.current(activeValue) : null}
        </div>

        {/* Outgoing division during the commit slide — LIVE render, not a
            snapshot, so scores/skeletons keep painting on the way out. */}
        {transition && (
          <div
            ref={prevRef}
            className={[
              // inset-x-0 resolves against the PADDING box, so this layer must
              // carry the same px-5 as the container or it renders 40px wider
              // than the live content and shifts mid-slide.
              'absolute inset-x-0 top-0 px-5 lg:px-0 pointer-events-none will-change-transform',
              contentClassName ?? '',
            ].join(' ')}
            aria-hidden
          >
            {renderRef.current(transition.prevValue)}
          </div>
        )}

        {/* Parked neighbors — ALWAYS mounted (see header note), riding the
            drag transform every frame so a swipe never has to spin up React
            mid-gesture. Same px-5 gutter as the active layer so the gap
            between two divisions' cards at any point equals the page's own
            edge margin, not zero. Hidden while the commit transition owns
            the prev/content pair above (transition already carries the
            outgoing division; showing both would double-render it). */}
        {!transition && parkedPrev && (
          <div
            ref={parkedPrevRef}
            className={[
              'absolute inset-x-0 top-0 px-5 lg:px-0 pointer-events-none will-change-transform',
              contentClassName ?? '',
            ].join(' ')}
            aria-hidden
          >
            {renderRef.current(parkedPrev.value)}
          </div>
        )}
        {!transition && parkedNext && (
          <div
            ref={parkedNextRef}
            className={[
              'absolute inset-x-0 top-0 px-5 lg:px-0 pointer-events-none will-change-transform',
              contentClassName ?? '',
            ].join(' ')}
            aria-hidden
          >
            {renderRef.current(parkedNext.value)}
          </div>
        )}
      </div>
    </div>
  );
}

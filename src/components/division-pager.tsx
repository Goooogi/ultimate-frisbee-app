'use client';

// DivisionPager (web) — centered division pill tabs + touch-swipe paging
// between divisions. Web port of the mobile app's DivisionPager: the pills sit
// BELOW the view tabs (screens render those above this component), and the
// division-scoped content swipes left/right on touch — it tracks the finger
// during the drag, and a committed swipe slides the outgoing division off
// while the incoming one slides in beside it. Desktop (no touch) just gets
// the centered pills.
//
// Only the active division's content is mounted. The outgoing panel during a
// transition is a snapshot of the previous children element — its props were
// captured before onChange fired, so it keeps rendering the old division's
// data while the slide runs, even though the division param (URL-backed on
// every event page) updates asynchronously.
//
// Gesture negotiation mirrors the mobile component: only decisively-horizontal
// moves are claimed (vertical page scroll passes through untouched), and a
// touch that starts inside a horizontally-scrollable descendant (bracket
// trees) is left alone — swiping over a bracket pans the bracket.
//
// With 0–1 divisions it renders children bare: no pills, no swipe.

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export interface DivisionPagerOption<V extends string> {
  value: V;
  label: string;
}

interface DivisionPagerProps<V extends string> {
  divisions: DivisionPagerOption<V>[];
  active: V | null;
  onChange: (v: V) => void;
  /** Layout classes for the swiped content wrapper (e.g. "flex flex-col
   *  gap-8") — screens whose tab sections relied on the page root's flex gap
   *  pass it here, since the pager re-parents them. Applied to the outgoing
   *  snapshot layer too so mid-slide layout matches. */
  contentClassName?: string;
  children: ReactNode;
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
  contentClassName,
  children,
}: DivisionPagerProps<V>) {
  const activeIndex = Math.max(0, divisions.findIndex((d) => d.value === active));
  const count = divisions.length;

  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const prevRef = useRef<HTMLDivElement>(null);

  // Latest values for the touch handlers without re-binding them mid-gesture.
  const stateRef = useRef({ activeIndex, count, divisions, onChange });
  stateRef.current = { activeIndex, count, divisions, onChange };
  const childrenRef = useRef(children);
  childrenRef.current = children;

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
    prev: ReactNode;
    dir: 1 | -1;
    fromDx: number;
  } | null>(null);

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

  // Slide/commit distance = the CONTENT width, excluding the edge-bleed
  // padding. clientWidth includes that padding, which would inflate the
  // commit threshold by the gutter (and stretch the slide) on mobile.
  const contentWidth = (container: HTMLDivElement) => {
    const cs = getComputedStyle(container);
    return container.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  };

  const springBack = () => {
    const content = contentRef.current;
    if (!content) return;
    content.style.transition = `transform 200ms ${EASE}`;
    content.style.transform = 'translateX(0px)';
    window.setTimeout(() => {
      content.style.transition = '';
      content.style.transform = '';
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
    // Rubber-band past the first/last division.
    if ((i === 0 && visual > 0) || (i === n - 1 && visual < 0)) visual /= 3;
    content.style.transform = `translateX(${visual}px)`;
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
    setTransition({ prev: childrenRef.current, dir, fromDx: dx - g.claimOffset });
    change(divs[i + dir].value);
  };

  const onTouchCancel = () => {
    const g = gestureRef.current;
    gestureRef.current = null;
    if (g?.claimed) springBack();
  };

  if (count <= 1) {
    if (contentClassName) return <div className={contentClassName}>{children}</div>;
    return <>{children}</>;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Centered pill row — wraps on narrow screens rather than scrolling. */}
      <div className="flex flex-wrap justify-center gap-1.5">
        {divisions.map((d, i) => (
          <button
            key={d.value}
            type="button"
            onClick={() => {
              if (i !== activeIndex) onChange(d.value);
            }}
            aria-pressed={i === activeIndex}
            className={[
              'px-3 py-1.5 rounded-full text-[11px] font-bold tracking-[0.06em] uppercase font-tight',
              'transition-colors cursor-pointer border',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              i === activeIndex
                ? 'bg-ink text-surface border-ink'
                : 'bg-transparent text-muted border-hairline hover:text-ink',
            ].join(' ')}
          >
            {d.label}
          </button>
        ))}
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
          {children}
        </div>
        {transition && (
          <div
            ref={prevRef}
            className={[
              // inset-x-0 resolves against the PADDING box, so the snapshot
              // must carry the same px-5 as the container or it renders 40px
              // wider than the live content and shifts mid-slide.
              'absolute inset-x-0 top-0 px-5 lg:px-0 pointer-events-none will-change-transform',
              contentClassName ?? '',
            ].join(' ')}
            aria-hidden
          >
            {transition.prev}
          </div>
        )}
      </div>
    </div>
  );
}

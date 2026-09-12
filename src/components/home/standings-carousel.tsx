'use client';

// Client wrapper for a row of equal-height home cards (UFA division cards,
// "Season complete" cards, "Recent results" cards).
//
//   MOBILE (<sm): a horizontal scroll-snap CAROUSEL — one card per view (~88%
//     width so the next card peeks, hinting swipeability), native touch swipe
//     (no JS animation), with dot indicators that track the scrolled-to card.
//     Keeps a section from stacking every league and eating the whole screen.
//   DESKTOP (sm+): a BALANCED 12-column grid. Columns come from the card count
//     so a row never ends with an empty cell: rows = ceil(n / maxPerRow), then
//     cards split as evenly as possible across those rows (5 → 3+2, 7 → 4+3).
//     Tablet (sm) packs at most 2 per row the same way.
//
// Cards are rendered on the SERVER and passed in as nodes — only the
// scroll/dots chrome is client. Both layouts stretch items, so a card shell
// with `h-full` fills its row: every card in a row (or in the swipe track) is
// the same height regardless of its row count.
//
// The mobile card wrapper must stay a BLOCK (not `flex`): the card shells
// carry no width, so as flex children they size to content — short cards
// shrink to ~55% and long-name cards (WFDF, Recent results) bleed off-screen
// (2026-09-11). `h-full` on the card still resolves because the wrapper is a
// stretched flex item of the track. `min-w-0` is required too: a flex item's
// default min-width is its content's min-content, so a card with long
// non-wrapping names would widen its wrapper past the 88% basis.

import { useRef, useState, useCallback } from 'react';
import type { ReactNode } from 'react';

interface StandingsCarouselProps {
  /** One node per card, pre-rendered by the server component. */
  cards: ReactNode[];
  /** Labels parallel to `cards` — used for dot aria-labels. */
  labels: string[];
  /** Most cards per row on lg+ (default 4). */
  desktopMaxPerRow?: 2 | 3 | 4;
  /** Accessible name for the dot tablist (default "Cards"). */
  ariaLabel?: string;
}

/** Split `n` cards across ceil(n / maxPerRow) rows as evenly as possible,
 *  larger rows first: (5, 4) → [3, 2]; (7, 4) → [4, 3]; (6, 4) → [3, 3]. */
function balancedRowSizes(n: number, maxPerRow: number): number[] {
  if (n <= 0) return [];
  const rows = Math.ceil(n / maxPerRow);
  const base = Math.floor(n / rows);
  const extra = n % rows;
  return Array.from({ length: rows }, (_, i) => base + (i < extra ? 1 : 0));
}

// Literal class strings (never template-built) so Tailwind keeps them.
const SM_SPAN: Record<number, string> = { 1: 'sm:col-span-12', 2: 'sm:col-span-6' };
const LG_SPAN: Record<number, string> = {
  1: 'lg:col-span-12',
  2: 'lg:col-span-6',
  3: 'lg:col-span-4',
  4: 'lg:col-span-3',
};

/** Per-card span classes: sm tier ≤2 per row, lg tier ≤ maxPerRow. */
function spanClassesFor(n: number, maxPerRow: number): string[] {
  const expand = (sizes: number[], map: Record<number, string>): string[] =>
    sizes.flatMap((size) => Array.from({ length: size }, () => map[size]));
  const sm = expand(balancedRowSizes(n, 2), SM_SPAN);
  const lg = expand(balancedRowSizes(n, maxPerRow), LG_SPAN);
  return Array.from({ length: n }, (_, i) => `${sm[i]} ${lg[i]}`);
}

export function StandingsCarousel({
  cards,
  labels,
  desktopMaxPerRow = 4,
  ariaLabel = 'Cards',
}: StandingsCarouselProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(0);
  const count = cards.length;
  const spans = spanClassesFor(count, desktopMaxPerRow);

  // Track which card is centered as the user swipes. We derive the index from
  // scrollLeft / card step rather than IntersectionObserver — simpler, and the
  // scroll-snap makes the math exact at rest.
  const onScroll = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const first = el.children[0] as HTMLElement | undefined;
    if (!first) return;
    // Distance between successive card starts (card width + gap), measured
    // rather than assumed so a gap change can't desync the dots.
    const second = el.children[1] as HTMLElement | undefined;
    const step = second ? second.offsetLeft - first.offsetLeft : first.offsetWidth;
    const idx = Math.round(el.scrollLeft / step);
    setActive(Math.max(0, Math.min(count - 1, idx)));
  }, [count]);

  const scrollToCard = useCallback((idx: number) => {
    const el = trackRef.current;
    if (!el) return;
    const child = el.children[idx] as HTMLElement | undefined;
    if (child) el.scrollTo({ left: child.offsetLeft - el.offsetLeft, behavior: 'smooth' });
  }, []);

  return (
    <>
      {/* ── MOBILE: swipeable scroll-snap carousel ── */}
      {/* A lone card is not a carousel: render it full width so it lines up
          with the page's other single cards (Rankings) instead of sitting at
          the 88% swipe basis, shifted left (Hunter, 2026-09-11). */}
      {count === 1 ? (
        <div className="sm:hidden">{cards[0]}</div>
      ) : (
        <div className="sm:hidden">
          <div
            ref={trackRef}
            onScroll={onScroll}
            className={[
              'flex items-stretch gap-4 overflow-x-auto snap-x snap-mandatory scroll-smooth no-scrollbar',
              // Negative margin + padding so the first/last cards can center with
              // a peek of the neighbour, while the track still bleeds to the
              // section's edges.
              '-mx-5 px-5 pb-1',
            ].join(' ')}
            style={{ scrollbarWidth: 'none' }}
          >
            {cards.map((card, i) => (
              <div key={i} className="snap-center shrink-0 basis-[88%] min-w-0">
                {card}
              </div>
            ))}
          </div>

          {/* Dots — one per card, active tracks the swiped-to card. */}
          {count > 1 && (
            <div className="mt-3 flex items-center justify-center gap-2" role="tablist" aria-label={ariaLabel}>
              {labels.map((label, i) => {
                const on = i === active;
                return (
                  <button
                    key={`${label}-${i}`}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    aria-label={label}
                    onClick={() => scrollToCard(i)}
                    className={[
                      'h-2 rounded-full transition-all duration-200 cursor-pointer',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                      on ? 'w-5 bg-accent' : 'w-2 bg-ink/20 hover:bg-ink/30',
                    ].join(' ')}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── DESKTOP (sm+): balanced grid, items stretch to the row height ── */}
      <div className="hidden sm:grid grid-cols-12 gap-4 lg:gap-5">
        {cards.map((card, i) => (
          <div key={i} className={spans[i]}>
            {card}
          </div>
        ))}
      </div>
    </>
  );
}

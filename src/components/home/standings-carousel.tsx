'use client';

// Client wrapper for the UFA standings division cards.
//
//   MOBILE (<sm): a horizontal scroll-snap CAROUSEL — one division card per
//     view (~88% width so the next card peeks, hinting swipeability), native
//     touch swipe (no JS animation), with dot indicators that track the
//     scrolled-to card. Keeps the section from stacking all 4 divisions and
//     eating the whole screen.
//   DESKTOP (sm+): the original responsive grid, unchanged.
//
// Cards are rendered on the SERVER (StandingsStrip) and passed in as nodes, so
// no team data is fetched client-side — only the scroll/dots chrome is client.

import { useRef, useState, useCallback } from 'react';
import type { ReactNode } from 'react';

interface StandingsCarouselProps {
  /** One node per division, pre-rendered by the server component. */
  cards: ReactNode[];
  /** Division labels, parallel to `cards` — used for dot aria-labels. */
  labels: string[];
  /** Tailwind grid-cols classes for the sm+ desktop grid. */
  desktopColsClass: string;
}

export function StandingsCarousel({ cards, labels, desktopColsClass }: StandingsCarouselProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(0);
  const count = cards.length;

  // Track which card is centered as the user swipes. We derive the index from
  // scrollLeft / card width rather than IntersectionObserver — simpler, and the
  // scroll-snap makes the math exact at rest.
  const onScroll = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const child = el.firstElementChild as HTMLElement | null;
    if (!child) return;
    // Distance between successive card starts = card width + gap.
    const step = child.offsetWidth + 16; // gap-4 = 16px
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
      <div className="sm:hidden">
        <div
          ref={trackRef}
          onScroll={onScroll}
          className={[
            'flex gap-4 overflow-x-auto snap-x snap-mandatory scroll-smooth no-scrollbar',
            // Negative margin + padding so the first/last cards can center with
            // a peek of the neighbour, while the track still bleeds to the
            // section's edges.
            '-mx-5 px-5 pb-1',
          ].join(' ')}
          style={{ scrollbarWidth: 'none' }}
        >
          {cards.map((card, i) => (
            <div key={i} className="snap-center shrink-0 basis-[88%]">
              {card}
            </div>
          ))}
        </div>

        {/* Dots — one per division, active tracks the swiped-to card. */}
        {count > 1 && (
          <div className="mt-3 flex items-center justify-center gap-2" role="tablist" aria-label="Divisions">
            {labels.map((label, i) => {
              const on = i === active;
              return (
                <button
                  key={label}
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

      {/* ── DESKTOP (sm+): original grid ── */}
      <div className={`hidden sm:grid ${desktopColsClass} gap-4 lg:gap-5`}>
        {cards.map((card, i) => (
          <div key={i}>{card}</div>
        ))}
      </div>
    </>
  );
}

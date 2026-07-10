'use client';

// Cross-league hero carousel — wraps any number of slide nodes, rotates
// every 6 s, pauses on hover/focus, respects prefers-reduced-motion.
// Receives slide ReactNodes from the server; only the chrome is a Client
// Component so no league data is fetched client-side.
//
// Chrome per the Home v2 design spec: 42px glass arrows side-centered at
// left-4/right-4 (desktop only — the mobile mockup drops the arrows and
// keeps only the dots, since 42px targets pinch mobile slide padding), dots
// bottom-left (active = 26×9 white pill, inactive = 9px white/40 dot).

import { useEffect, useRef, useState, useCallback } from 'react';
import type { ReactNode } from 'react';

interface HeroCarouselProps {
  slides: ReactNode[];
}

export function HeroCarousel({ slides }: HeroCarouselProps) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = slides.length;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Read prefers-reduced-motion once on mount.
  const prefersReducedRef = useRef(false);
  useEffect(() => {
    prefersReducedRef.current =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const prev = useCallback(() => {
    setActive((a) => (a - 1 + count) % count);
  }, [count]);

  const next = useCallback(() => {
    setActive((a) => (a + 1) % count);
  }, [count]);

  // Auto-advance — clears / restarts when paused, active index, or count changes.
  useEffect(() => {
    if (count <= 1) return;
    if (paused || prefersReducedRef.current) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    intervalRef.current = setInterval(() => {
      setActive((a) => (a + 1) % count);
    }, 5200);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [count, paused]);

  if (count === 0) return null;

  // Fixed height at every breakpoint so all league slides (UFA game card,
  // USAU/WFDF tournament cards, PUL/WUL game cards) occupy an identical box
  // regardless of intrinsic content height. ~372px mobile, ~452px desktop
  // per the design spec.
  const heightClass = 'h-[372px] lg:h-[452px]';

  if (count === 1) {
    return (
      <div className={`relative overflow-hidden rounded-card-lg shadow-lift lg:shadow-hero ${heightClass}`}>
        {slides[0]}
      </div>
    );
  }

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured games across leagues"
      className={`relative overflow-hidden rounded-card-lg shadow-lift lg:shadow-hero ${heightClass}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {/* Slide track */}
      <div className="relative h-full">
        {slides.map((slide, i) => (
          <div
            key={i}
            role="group"
            aria-roledescription="slide"
            aria-label={`Slide ${i + 1} of ${count}`}
            aria-hidden={i !== active}
            className={[
              'absolute inset-0 transition-opacity duration-500',
              i === active ? 'opacity-100' : 'opacity-0 pointer-events-none',
            ].join(' ')}
          >
            {slide}
          </div>
        ))}
      </div>

      {/* Arrows — 42px glass circles, side-centered, desktop only. Layered
          above slide content (z-10); slides keep px-10 desktop padding so
          team/event logos never sit under them. */}
      <div className="hidden sm:block">
        <CarouselArrow side="left" onClick={prev} />
        <CarouselArrow side="right" onClick={next} />
      </div>

      {/* Dots — bottom-left, all breakpoints. */}
      <div className="absolute left-4 sm:left-6 lg:left-10 bottom-4 lg:bottom-6 z-10">
        <CarouselDots slides={slides} active={active} onSelect={setActive} />
      </div>
    </section>
  );
}

function CarouselArrow({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  const isLeft = side === 'left';
  return (
    <button
      aria-label={isLeft ? 'Previous slide' : 'Next slide'}
      onClick={onClick}
      className={[
        'absolute top-1/2 -translate-y-1/2 z-10',
        isLeft ? 'left-4' : 'right-4',
        'flex items-center justify-center flex-shrink-0 rounded-full w-[42px] h-[42px]',
        'bg-white/[0.14] border border-white/[0.28] backdrop-blur-md',
        'text-white/80 hover:text-white hover:bg-white/[0.22]',
        'transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50',
        'cursor-pointer',
      ].join(' ')}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ transform: isLeft ? 'scaleX(-1)' : 'none' }}>
        <path d="M5 3l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function CarouselDots({
  slides,
  active,
  onSelect,
}: {
  slides: ReactNode[];
  active: number;
  onSelect: (i: number) => void;
}) {
  return (
    <div role="tablist" aria-label="Slides" className="flex items-center gap-2">
      {slides.map((_, i) => (
        <button
          key={i}
          role="tab"
          aria-label={`Go to slide ${i + 1}`}
          aria-selected={i === active}
          onClick={() => onSelect(i)}
          className={[
            'rounded-full transition-all duration-300',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60',
            'cursor-pointer',
            i === active
              ? 'w-[26px] h-[9px] bg-white'
              : 'w-[9px] h-[9px] bg-white/40 hover:bg-white/65',
          ].join(' ')}
        />
      ))}
    </div>
  );
}

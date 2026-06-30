'use client';

// Cross-league hero carousel — wraps any number of slide nodes, rotates
// every 6 s, pauses on hover/focus, respects prefers-reduced-motion.
// Receives slide ReactNodes from the server; only the chrome is a Client
// Component so no league data is fetched client-side.

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
    }, 6000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [count, paused]);

  if (count === 0) return null;
  if (count === 1) {
    // Single slide — no chrome needed, render directly.
    return <div className="relative overflow-hidden lg:min-h-[480px]">{slides[0]}</div>;
  }

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured games across leagues"
      className="relative overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {/* Slide track */}
      <div className="relative lg:min-h-[480px]">
        {slides.map((slide, i) => (
          <div
            key={i}
            role="group"
            aria-roledescription="slide"
            aria-label={`Slide ${i + 1} of ${count}`}
            aria-hidden={i !== active}
            className={[
              'transition-opacity duration-500',
              i === active ? 'opacity-100' : 'opacity-0 absolute inset-0 pointer-events-none',
            ].join(' ')}
          >
            {slide}
          </div>
        ))}
      </div>

      {/* Carousel chrome — sits above the slide stack */}
      <div className="absolute bottom-4 left-0 right-0 flex items-center justify-center gap-3 px-4 pointer-events-none z-10">
        {/* Prev */}
        <button
          aria-label="Previous slide"
          onClick={prev}
          className={[
            'pointer-events-auto flex items-center justify-center',
            'w-7 h-7 rounded-full',
            'bg-[rgba(0,0,0,0.35)] border border-[rgba(255,255,255,0.18)]',
            'text-[rgba(255,255,255,0.7)] hover:text-white',
            'transition-colors duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50',
            'cursor-pointer',
          ].join(' ')}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
            <path d="M6.5 2L3.5 5L6.5 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* Dots */}
        <div role="tablist" aria-label="Slides" className="flex items-center gap-1.5 pointer-events-auto">
          {slides.map((_, i) => (
            <button
              key={i}
              role="tab"
              aria-label={`Go to slide ${i + 1}`}
              aria-selected={i === active}
              onClick={() => setActive(i)}
              className={[
                'rounded-full transition-all duration-300',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60',
                'cursor-pointer',
                i === active
                  ? 'w-4 h-[5px] bg-white'
                  : 'w-[5px] h-[5px] bg-[rgba(255,255,255,0.4)] hover:bg-[rgba(255,255,255,0.65)]',
              ].join(' ')}
            />
          ))}
        </div>

        {/* Next */}
        <button
          aria-label="Next slide"
          onClick={next}
          className={[
            'pointer-events-auto flex items-center justify-center',
            'w-7 h-7 rounded-full',
            'bg-[rgba(0,0,0,0.35)] border border-[rgba(255,255,255,0.18)]',
            'text-[rgba(255,255,255,0.7)] hover:text-white',
            'transition-colors duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50',
            'cursor-pointer',
          ].join(' ')}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
            <path d="M3.5 2L6.5 5L3.5 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </section>
  );
}

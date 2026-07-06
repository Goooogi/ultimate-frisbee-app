'use client';

// Cross-league hero carousel — wraps any number of slide nodes, rotates
// every 6 s, pauses on hover/focus, respects prefers-reduced-motion.
// Receives slide ReactNodes from the server; only the chrome is a Client
// Component so no league data is fetched client-side.

import { useEffect, useRef, useState, useCallback } from 'react';
import type { ReactNode } from 'react';

interface HeroCarouselProps {
  slides: ReactNode[];
  /**
   * One dominant hex color per slide (same order/length as `slides`), used to
   * tint the mobile control bar so it matches the active card as it rotates.
   * For game slides this is the home team's accent; for tournament slides the
   * league accent. Falls back to the stadium base when absent/short.
   */
  slideColors?: string[];
}

// Shared dark "stadium" base every hero slide sits on. The mobile control bar
// blends the active slide's color OVER this so it always reads as the same
// family as the card while staying dark enough for the white controls.
const STADIUM_BASE = '#0F1B2E';

/** Parse a 3/6-digit hex to [r,g,b]; null on anything unparseable. */
function hexToRgb(hex: string): [number, number, number] | null {
  const h = hex.trim().replace('#', '');
  const full = h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/**
 * The bar background for the active slide: the slide's color mixed toward the
 * dark stadium base so the bar echoes the card's hue without ever getting light
 * enough to wash out the white arrows/dots. `mix` = share of the slide color.
 */
function barBackground(color: string | undefined): string {
  const rgb = color ? hexToRgb(color) : null;
  if (!rgb) return STADIUM_BASE;
  const base = hexToRgb(STADIUM_BASE)!;
  const mix = 0.4; // enough tint to be clearly on-brand, still dark
  const blended = rgb.map((c, i) => Math.round(c * mix + base[i] * (1 - mix)));
  return `rgb(${blended[0]}, ${blended[1]}, ${blended[2]})`;
}

export function HeroCarousel({ slides, slideColors }: HeroCarouselProps) {
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
    // Single slide — no chrome needed, render directly. Fixed height so it
    // matches the multi-slide track (see HERO_HEIGHT note below).
    return (
      <div className="relative overflow-hidden h-[420px] sm:h-[440px] lg:h-[480px]">
        {slides[0]}
      </div>
    );
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
      {/* Slide track — FIXED height at every breakpoint so all league slides
          (UFA game card, USAU/PUL/WUL tournament cards) occupy an identical
          box regardless of their intrinsic content height. Each slide fills
          this box via h-full on its wrapper below. */}
      <div className="relative h-[420px] sm:h-[440px] lg:h-[480px]">
        {slides.map((slide, i) => (
          <div
            key={i}
            role="group"
            aria-roledescription="slide"
            aria-label={`Slide ${i + 1} of ${count}`}
            aria-hidden={i !== active}
            className={[
              // Every slide is absolutely positioned to fill the fixed-height
              // track; opacity cross-fades between them. (The active one isn't
              // in normal flow either, so a taller slide can't stretch the box.)
              'absolute inset-0 transition-opacity duration-500',
              i === active ? 'opacity-100' : 'opacity-0 pointer-events-none',
            ].join(' ')}
          >
            {slide}
          </div>
        ))}
      </div>

      {/* Carousel chrome. On mobile it sits BELOW the slide in normal flow so
          it never overlaps the slide's own footer CTAs (the bug on short
          mobile slides). On lg+ the slide is tall (480px) so we overlay it at
          the bottom as a floating control. */}
      <div
        style={{ backgroundColor: barBackground(slideColors?.[active]) }}
        className="flex items-center justify-center gap-3 px-4 py-3 transition-colors duration-500 lg:!bg-transparent lg:py-0 lg:px-4 lg:absolute lg:bottom-4 lg:left-0 lg:right-0 lg:pointer-events-none z-10"
      >
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

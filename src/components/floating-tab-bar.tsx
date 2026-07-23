'use client';

// FloatingTabBar — the shared "liquid glass" bottom tab switcher (Instagram-
// style). A frosted, heavily-blurred translucent pill that floats above the
// safe-area on every breakpoint, with a smoothly-sliding accent indicator that
// tracks the active tab. Theme-aware via semantic tokens, so it reads correctly
// on light, dark, and the UTCG navy theme.
//
// Two flavors of consumer:
//   - state-driven (UTCG's internal tabs): pass `activeId` + `onChange`.
//   - route-driven (Games page-nav): pass `href` on each tab; the bar reads
//     the active one from `activeId` (the consumer derives it from pathname).
// Rendering is identical; only how you compute active/navigate differs.

import Link from 'next/link';
import { useLayoutEffect, useRef, useState } from 'react';

export interface FloatingTab {
  id: string;
  label: string;
  /** Route to navigate to (route-driven bars). Omit for state-driven. */
  href?: string;
  /** Icon renderer — receives active state + a size. */
  icon: (props: { active: boolean; size: number }) => React.ReactNode;
  /** "Coming soon" — rendered faint and non-interactive. */
  disabled?: boolean;
}

interface FloatingTabBarProps {
  tabs: FloatingTab[];
  activeId: string;
  /** State-driven bars: called on tap. Route-driven bars omit this (use href). */
  onChange?: (id: string) => void;
  ariaLabel: string;
  /** Cap the pill width so it reads as a deliberate floating control, not a
   *  stretched bar. Default keeps it compact + centered. */
  maxWidthClass?: string;
}

export function FloatingTabBar({
  tabs,
  activeId,
  onChange,
  ariaLabel,
  maxWidthClass = 'max-w-md',
}: FloatingTabBarProps) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Record<string, HTMLElement | null>>({});
  // Position + size of the sliding active indicator, measured from the active
  // item's box so it tracks any tab count / label width.
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null);

  useLayoutEffect(() => {
    const el = itemRefs.current[activeId];
    const wrap = listRef.current;
    if (!el || !wrap) return;
    const measure = () => {
      const e = itemRefs.current[activeId];
      if (!e || !listRef.current) return;
      setPill({ x: e.offsetLeft, w: e.offsetWidth });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [activeId, tabs.length]);

  return (
    <nav
      aria-label={ariaLabel}
      className={[
        'fixed bottom-[max(env(safe-area-inset-bottom),0.75rem)] inset-x-3 z-40 mx-auto',
        maxWidthClass,
        // Apple/Instagram liquid glass: a DARK, heavily-blurred + saturated
        // frost so whatever scrolls behind shows through, tinted, brightened.
        // The glass "material" reads via three stacked edges: a hairline white
        // outer border, an inset top-highlight ring, and a soft deep shadow.
        // A faint top-down gloss overlay (::before) adds the wet sheen.
        'relative isolate rounded-[28px] p-1.5',
        'bg-[rgb(20_22_28/0.55)] supports-[backdrop-filter]:bg-[rgb(20_22_28/0.42)]',
        'backdrop-blur-2xl backdrop-saturate-[1.8] backdrop-brightness-110',
        'border border-white/15 shadow-[0_10px_50px_-10px_rgba(0,0,0,0.6)]',
        'ring-1 ring-inset ring-white/[0.12]',
        // Glossy top sheen — a subtle white gradient over the top third.
        'before:pointer-events-none before:absolute before:inset-0 before:rounded-[28px] before:-z-[1]',
        'before:bg-[linear-gradient(180deg,rgba(255,255,255,0.14),transparent_42%)]',
      ].join(' ')}
    >
      <div ref={listRef} className="relative flex items-stretch justify-around gap-1">
        {/* Sliding active indicator — a translucent frosted-WHITE lozenge (the
            Apple/IG look), not an accent fill. Its own inset highlight + hairline
            edge make it read as raised glass; the active icon/label carry the
            accent instead. Animated between positions. */}
        {pill && (
          <span
            aria-hidden="true"
            className={[
              'absolute top-0 bottom-0 rounded-[22px]',
              'bg-white/[0.14] ring-1 ring-inset ring-white/25',
              'shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_2px_10px_-2px_rgba(0,0,0,0.4)]',
              'motion-safe:transition-all motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.22,0.7,0.25,1)]',
            ].join(' ')}
            style={{ left: pill.x, width: pill.w }}
          />
        )}

        {tabs.map((t) => {
          const active = t.id === activeId;
          const inner = (
            <>
              {/* Icon color is driven here (light tones on the dark glass) so
                  every consumer's icon reads consistently. Icons that render
                  with currentColor inherit this; ones that hardcode their own
                  color keep it (acceptable fallback). */}
              <span className={t.disabled ? 'text-white/30' : active ? 'text-white' : 'text-white/60'}>
                {t.icon({ active, size: 22 })}
              </span>
              <span
                className={[
                  'text-[9px] font-bold tracking-[0.08em] uppercase font-tight leading-none',
                  // The glass is always a dark frost, so use light tones for
                  // legibility regardless of the surrounding app theme.
                  t.disabled ? 'text-white/30' : active ? 'text-white' : 'text-white/55',
                ].join(' ')}
              >
                {t.label}
              </span>
            </>
          );
          const cls = [
            'relative z-[1] flex flex-1 flex-col items-center justify-center gap-1 min-w-[60px] h-[52px] rounded-[20px]',
            'motion-safe:transition-colors motion-safe:duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            t.disabled ? 'cursor-not-allowed select-none' : 'cursor-pointer',
          ].join(' ');

          const setRef = (el: HTMLElement | null) => {
            itemRefs.current[t.id] = el;
          };

          // Disabled ("coming soon") → non-interactive span.
          if (t.disabled) {
            return (
              <span
                key={t.id}
                ref={setRef as React.Ref<HTMLSpanElement>}
                aria-disabled="true"
                aria-label={`${t.label} (coming soon)`}
                className={cls}
              >
                {inner}
              </span>
            );
          }

          // Route-driven (href) → Link; state-driven → button.
          return t.href ? (
            <Link
              key={t.id}
              ref={setRef as React.Ref<HTMLAnchorElement>}
              href={t.href}
              aria-current={active ? 'page' : undefined}
              aria-label={t.label}
              className={cls}
            >
              {inner}
            </Link>
          ) : (
            <button
              key={t.id}
              ref={setRef as React.Ref<HTMLButtonElement>}
              type="button"
              onClick={() => onChange?.(t.id)}
              aria-current={active ? 'page' : undefined}
              aria-label={t.label}
              className={cls}
            >
              {inner}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

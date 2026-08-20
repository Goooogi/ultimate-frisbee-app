'use client';

// FloatingTabBar — the shared bottom tab switcher.
//
// Flat, edge-to-edge bar pinned to the bottom: a solid `surface` fill with a
// single hairline top border, no float / blur / sliding indicator (Hunter,
// 2026-08-20 — replaces the dark "liquid glass" floating pill; it read heavy
// against the app's light editorial pages). The ACTIVE tab is signalled by
// color alone: icon + label go `accent` orange, inactive stay `muted`.
// Theme-aware via semantic tokens, so it reads on light, dark, and UTCG navy.
//
// Two flavors of consumer:
//   - state-driven (UTCG's internal tabs): pass `activeId` + `onChange`.
//   - route-driven (Games page-nav): pass `href` on each tab; the bar reads
//     the active one from `activeId` (the consumer derives it from pathname).
// Rendering is identical; only how you compute active/navigate differs.

import Link from 'next/link';

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
  /** Caps the TAB ROW's width on wide screens so the tabs stay grouped instead
   *  of drifting to the far edges. The bar itself is always edge-to-edge. */
  maxWidthClass?: string;
}

export function FloatingTabBar({
  tabs,
  activeId,
  onChange,
  ariaLabel,
  maxWidthClass = 'max-w-md',
}: FloatingTabBarProps) {
  return (
    <nav
      aria-label={ariaLabel}
      className={[
        // Flat, edge-to-edge, pinned to the bottom. Solid surface fill — no
        // blur/translucency, so nothing scrolls through and the bar stays
        // readable over any page.
        'fixed bottom-0 inset-x-0 z-40',
        'bg-surface border-t border-hairline',
        // Safe-area inset lives on the PADDING, not the offset, so the fill
        // extends under the home indicator instead of leaving a gap below it.
        'pb-[env(safe-area-inset-bottom)]',
      ].join(' ')}
    >
      <div className={`flex items-stretch justify-around gap-1 mx-auto ${maxWidthClass}`}>
        {tabs.map((t) => {
          const active = t.id === activeId;
          const inner = (
            <>
              {/* Icon color is driven here so every consumer's icon reads
                  consistently. Icons that render with currentColor inherit
                  this; ones that hardcode their own color keep it (acceptable
                  fallback). Active = accent orange, the ONLY active signal now
                  that the sliding indicator is gone. */}
              <span className={t.disabled ? 'text-faint' : active ? 'text-accent' : 'text-muted'}>
                {t.icon({ active, size: 22 })}
              </span>
              <span
                className={[
                  'text-[10px] font-bold tracking-[0.08em] uppercase font-tight leading-none whitespace-nowrap',
                  t.disabled ? 'text-faint' : active ? 'text-accent' : 'text-muted',
                ].join(' ')}
              >
                {t.label}
              </span>
            </>
          );
          const cls = [
            // Item geometry matches the mobile app's GlassTabBar: 56px tall,
            // 56px min-width, 3px icon↔label gap (was slimmed to 44/20/2 in an
            // earlier pass — realigned to the app per the parity request).
            'flex flex-1 flex-col items-center justify-center gap-[5px] min-w-[56px] px-2 h-[58px]',
            // Tap feedback: the label/icon flash accent on press, so the tab
            // reads as "clicked" before the route transition lands.
            'active:text-accent [&:active_span]:text-accent',
            'motion-safe:transition-colors motion-safe:duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
            t.disabled ? 'cursor-not-allowed select-none' : 'cursor-pointer',
          ].join(' ');

          // Disabled ("coming soon") → non-interactive span.
          if (t.disabled) {
            return (
              <span
                key={t.id}
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

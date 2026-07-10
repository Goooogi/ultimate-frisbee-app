'use client';

// Mobile-only league dropdown. Replaces the pill-style LeagueTabs on
// <lg screens — built as a <details>/<summary> custom dropdown so we
// own both the trigger width (genuinely content-sized) and the menu
// position (absolute left-0 top-full, directly below the trigger).
// Mirrors the MobileSubAppDropdown idiom in app-rail.tsx.

import { useRef } from 'react';
import { LEAGUES } from '@/lib/data';
import { useLeague } from '@/lib/use-league';

export function MobileLeagueSelect() {
  const [league, setLeague] = useLeague();
  const detailsRef = useRef<HTMLDetailsElement>(null);

  const activeLeague = LEAGUES.find((l) => l.id === league) ?? LEAGUES[0];

  return (
    <details ref={detailsRef} className="relative">
      {/* Trigger — summary with inline-flex gives us genuine content-width.
          list-none + webkit marker removal hide the default disclosure marker.
          Accent dot, label, and chevron are normal inline-flex children —
          no absolute positioning required since we control the layout. */}
      <summary
        aria-label={`League: ${activeLeague.short}. Tap to switch.`}
        className={[
          'list-none [&::-webkit-details-marker]:hidden cursor-pointer',
          'inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-full min-h-[44px]',
          'text-[11px] font-bold tracking-[0.14em] uppercase font-tight',
          'bg-ink/5 text-ink',
          'hover:bg-ink/10 transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        ].join(' ')}
      >
        {/* Accent dot */}
        <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
        {/* Active league label */}
        {activeLeague.short}
        {/* Chevron */}
        <svg
          className="w-3 h-3 text-accent flex-shrink-0"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M3 4.5L6 7.5L9 4.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </summary>

      {/* Dropdown menu — z-[60] clears the rail's z-50.
          absolute left-0 top-full mt-1 anchors it directly below the trigger,
          left-aligned. min-w-[120px] keeps rows comfortable without ballooning. */}
      <div className="absolute left-0 top-full mt-1.5 z-[60] min-w-[140px] bg-surface rounded-card shadow-lift p-1.5">
        {LEAGUES.map((l) => {
          const isActive = l.id === league;
          const isDisabled = l.id === 'intl';

          if (isDisabled) {
            return (
              <span
                key={l.id}
                aria-disabled="true"
                title="Coming soon"
                className={[
                  'flex items-center gap-1.5 px-3 py-2 rounded-full',
                  'text-[11px] font-bold tracking-[0.14em] uppercase font-tight',
                  'text-faint cursor-not-allowed select-none',
                ].join(' ')}
              >
                {/* Spacer aligns with the check glyph on active rows */}
                <span className="w-2.5 flex-shrink-0" aria-hidden="true" />
                {l.short}
                <sup className="text-[7px] font-bold tracking-[0.14em] text-faint ml-0.5 align-super leading-none">
                  SOON
                </sup>
              </span>
            );
          }

          return (
            <button
              key={l.id}
              type="button"
              onClick={() => {
                setLeague(l.id);
                if (detailsRef.current) detailsRef.current.open = false;
              }}
              className={[
                'flex items-center gap-1.5 w-full px-3 py-2.5 rounded-full text-left min-h-[44px]',
                'text-[11px] font-bold tracking-[0.14em] uppercase font-tight',
                'transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                isActive
                  ? 'text-bg bg-ink'
                  : 'text-muted hover:text-ink hover:bg-ink/5',
              ].join(' ')}
            >
              {/* Check glyph on active row; spacer keeps other rows aligned */}
              {isActive ? (
                <svg
                  className="w-2.5 h-2.5 text-accent flex-shrink-0"
                  viewBox="0 0 10 10"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M2 5L4 7L8 3"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <span className="w-2.5 flex-shrink-0" aria-hidden="true" />
              )}
              {l.short}
            </button>
          );
        })}
      </div>
    </details>
  );
}

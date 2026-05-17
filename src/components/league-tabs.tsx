'use client';

// Pill-style segmented control for switching leagues (UFA / USAU / INTL).
// Renders the same look on both themes — CSS variables (bg-surface, bg-accent,
// text-muted, text-ink) handle the light/dark swap. Only UFA is wired up right
// now; the others render as disabled "soon" stubs.

import { LEAGUES, type League } from '@/lib/data';

interface LeagueTabsProps {
  active: League['id'];
  onChange: (id: League['id']) => void;
  /** Slightly tighter padding/font; used in tight mobile rows. */
  compact?: boolean;
}

export function LeagueTabs({ active, onChange, compact = false }: LeagueTabsProps) {
  return (
    <div
      className={[
        'inline-flex rounded-full bg-surface border border-border',
        compact ? 'p-[2px]' : 'p-[3px]',
      ].join(' ')}
    >
      {LEAGUES.map((l) => {
        const on = l.id === active;
        const disabled = l.id !== 'ufa';
        return (
          <button
            key={l.id}
            onClick={() => !disabled && onChange(l.id)}
            disabled={disabled}
            aria-disabled={disabled}
            title={disabled ? 'Coming soon' : undefined}
            className={[
              'rounded-full font-sans font-bold tracking-[0.14em] uppercase transition-all duration-150',
              compact ? 'px-3 py-1.5 text-[10px]' : 'px-4 py-2 text-[11px]',
              disabled
                ? 'bg-transparent text-faint opacity-50 cursor-not-allowed'
                : on
                  ? 'bg-accent text-accent-ink cursor-pointer'
                  : 'bg-transparent text-muted cursor-pointer hover:text-ink',
            ].join(' ')}
          >
            {l.short}
            {disabled && <span className="ml-1.5 text-[8px] tracking-[0.18em]">soon</span>}
            {!disabled && l.count > 0 && (
              <span className={`ml-1.5 tabular ${on ? 'opacity-70' : 'opacity-50'}`}>
                {l.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

'use client';

// Mobile-only league dropdown. Replaces the pill-style LeagueTabs on
// <lg screens — pills crowd the header on phones, a select is denser and
// thumb-friendly. Wired to the same useLeague() hook so it shares state
// with the desktop pills and any other league-aware component.

import { LEAGUES } from '@/lib/data';
import { useLeague } from '@/lib/use-league';

export function MobileLeagueSelect() {
  const [league, setLeague] = useLeague();

  return (
    <div className="relative inline-flex items-center">
      {/* Accent dot — small orange marker to tie the chip into the brand
          palette. Hidden when the active league is the disabled stub. */}
      <span
        aria-hidden="true"
        className="absolute left-2 w-1.5 h-1.5 rounded-full bg-accent"
      />
      <select
        value={league}
        onChange={(e) => setLeague(e.target.value as typeof league)}
        aria-label="Select league"
        className={[
          'appearance-none cursor-pointer',
          // Tighter horizontal padding + min-width so the chip stays
          // compact ("UFA ▾" is ~60px). Left padding leaves room for the
          // accent dot.
          'pl-5 pr-6 py-[6px] rounded-full',
          'text-[11px] font-bold tracking-[0.14em] uppercase font-tight',
          'bg-surface border border-border text-ink',
          'hover:border-accent transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        ].join(' ')}
      >
        {LEAGUES.map((l) => {
          const disabled = l.id === 'intl';
          return (
            <option key={l.id} value={l.id} disabled={disabled}>
              {l.short}
              {disabled ? ' · soon' : ''}
            </option>
          );
        })}
      </select>
      <svg
        className="pointer-events-none absolute right-1.5 w-3 h-3 text-accent"
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
    </div>
  );
}

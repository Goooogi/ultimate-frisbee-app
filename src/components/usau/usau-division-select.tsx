'use client';

// USAU division dropdown — Men / Women / Mixed. Used as a `controls`
// slot on USAU pages (Schedule, Teams, Players) and inline on the
// /scores USAU view. Same pill-style as the year and league selectors.

import { useDivision, type UsauDivision } from '@/lib/use-division';

const OPTIONS: { value: UsauDivision; label: string }[] = [
  { value: 'Men', label: 'Men' },
  { value: 'Women', label: 'Women' },
  { value: 'Mixed', label: 'Mixed' },
];

export function UsauDivisionSelect() {
  const [division, setDivision] = useDivision();
  return (
    <div className="relative inline-flex items-center">
      <select
        value={division}
        onChange={(e) => setDivision(e.target.value as UsauDivision)}
        aria-label="Select division"
        className={[
          'appearance-none cursor-pointer',
          'px-3 py-[6px] pr-7 rounded-full',
          'text-[11px] font-bold tracking-[0.14em] uppercase font-tight',
          'bg-surface border border-border text-ink',
          'hover:border-ink transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        ].join(' ')}
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg
        className="pointer-events-none absolute right-2 w-3 h-3 text-muted"
        viewBox="0 0 12 12"
        fill="none"
        aria-hidden="true"
      >
        <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

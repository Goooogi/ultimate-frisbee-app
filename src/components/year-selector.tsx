'use client';

// Pill-style year dropdown bound to ?year= URL param.
// Works by pushing a new route to let Server Components re-fetch.

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { recentSeasons } from '@/lib/ufa/season';

interface YearSelectorProps {
  currentYear: number;
  count?: number;
}

export function YearSelector({ currentYear, count = 5 }: YearSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const years = recentSeasons(count);

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('year', e.target.value);
    // Reset page when year changes
    params.delete('page');
    router.push(`${pathname}?${params}`);
  }

  return (
    <div className="relative inline-flex items-center">
      <select
        value={currentYear}
        onChange={handleChange}
        aria-label="Select season year"
        className={[
          'appearance-none cursor-pointer',
          'px-3 py-[6px] pr-7 rounded-full',
          'text-[11px] font-bold tracking-[0.14em] uppercase font-tight',
          'bg-surface border border-border text-ink',
          'hover:border-ink transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        ].join(' ')}
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y} Season
          </option>
        ))}
      </select>
      {/* Chevron icon */}
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

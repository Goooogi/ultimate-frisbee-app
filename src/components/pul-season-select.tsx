'use client';

// Season switcher for PUL pages — writes ?season= to the URL.
// Client component (needs useRouter/useSearchParams).

import { useRouter, usePathname, useSearchParams } from 'next/navigation';

interface PulSeasonSelectProps {
  seasons: number[];
  currentSeason: number;
}

export function PulSeasonSelect({ seasons, currentSeason }: PulSeasonSelectProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('season', e.target.value);
    // Reset sort when switching seasons so users always start from a clean slate.
    params.delete('sort');
    params.delete('dir');
    router.push(`${pathname}?${params}`);
  }

  if (seasons.length <= 1) return null;

  return (
    <div className="relative inline-flex items-center">
      <select
        value={currentSeason}
        onChange={handleChange}
        aria-label="Select PUL season"
        className={[
          'appearance-none cursor-pointer',
          'px-3.5 py-[7px] pr-7 rounded-full min-h-[36px]',
          'text-[11px] font-bold tracking-[0.14em] uppercase font-tight',
          'bg-ink/5 text-ink',
          'hover:bg-ink/10 transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        ].join(' ')}
      >
        {seasons.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <svg
        className="pointer-events-none absolute right-2 w-3 h-3 text-muted"
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

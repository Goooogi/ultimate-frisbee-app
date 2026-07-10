'use client';

// Sort field + direction control bound to ?sort= and ?dir= URL params.
// Used by the /players leaderboard.

import { useRouter, usePathname, useSearchParams } from 'next/navigation';

export interface SortOption {
  value: string;
  label: string;
}

interface SortControlProps {
  options: SortOption[];
  currentSort: string;
  currentDir: 'asc' | 'desc';
}

export function SortControl({ options, currentSort, currentDir }: SortControlProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function pushParams(sort: string, dir: 'asc' | 'desc') {
    const params = new URLSearchParams(searchParams.toString());
    params.set('sort', sort);
    params.set('dir', dir);
    params.delete('page');
    router.push(`${pathname}?${params}`);
  }

  function handleSortChange(e: React.ChangeEvent<HTMLSelectElement>) {
    pushParams(e.target.value, currentDir);
  }

  function toggleDir() {
    pushParams(currentSort, currentDir === 'desc' ? 'asc' : 'desc');
  }

  return (
    <div className="inline-flex items-center gap-1.5">
      <div className="relative inline-flex items-center">
        <select
          value={currentSort}
          onChange={handleSortChange}
          aria-label="Sort players by"
          className={[
            'appearance-none cursor-pointer',
            'px-3.5 py-[7px] pr-7 rounded-full min-h-[36px]',
            'text-[11px] font-bold tracking-[0.14em] uppercase font-tight',
            'bg-ink/5 text-ink',
            'hover:bg-ink/10 transition-colors duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          ].join(' ')}
        >
          {options.map((o) => (
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

      {/* Direction toggle */}
      <button
        onClick={toggleDir}
        aria-label={currentDir === 'desc' ? 'Sort ascending' : 'Sort descending'}
        className={[
          'p-[9px] rounded-full cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center',
          'bg-ink/5 text-muted',
          'hover:bg-ink/10 hover:text-ink transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        ].join(' ')}
      >
        <svg
          className="w-3 h-3"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden="true"
          style={{ transform: currentDir === 'asc' ? 'scaleY(-1)' : undefined }}
        >
          <path d="M3 2v8M3 10l-2-2M3 10l2-2M9 10V2M9 2L7 4M9 2l2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}

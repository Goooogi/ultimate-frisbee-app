'use client';

// Team filter dropdown bound to ?team= URL param.
// Sources teams from activeTeams() — only active franchises shown.

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { activeTeams } from '@/lib/ufa/teams';

interface TeamFilterProps {
  currentTeam?: string;
}

export function TeamFilter({ currentTeam = '' }: TeamFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const teams = activeTeams();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString());
    if (e.target.value) {
      params.set('team', e.target.value);
    } else {
      params.delete('team');
    }
    // Reset page when team filter changes
    params.delete('page');
    router.push(`${pathname}?${params}`);
  }

  return (
    <div className="relative inline-flex items-center">
      <select
        value={currentTeam}
        onChange={handleChange}
        aria-label="Filter by team"
        className={[
          'appearance-none cursor-pointer',
          'px-3 py-[6px] pr-7 rounded-full',
          'text-[11px] font-bold tracking-[0.14em] uppercase font-tight',
          'bg-surface border border-border text-ink',
          'hover:border-ink transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        ].join(' ')}
      >
        <option value="">All Teams</option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.city} {t.name}
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

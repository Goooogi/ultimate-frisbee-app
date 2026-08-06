'use client';

// Pill-style year dropdown bound to ?year= URL param.
// Renders via the shared PillSelect primitive (branded popover, not
// the OS-native menu). Pushes a new route on change so Server
// Components re-fetch with the new year.

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { recentSeasons } from '@/lib/ufa/season';
import { PillSelect } from '@/components/pill-select';

interface YearSelectorProps {
  currentYear: number;
  count?: number;
  /** Explicit season list (newest first) — the team page passes the years the
   *  franchise actually played (see teamSeasons); default recentSeasons. */
  years?: number[];
}

export function YearSelector({ currentYear, count = 5, years: yearsProp }: YearSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const years = yearsProp ?? recentSeasons(count);

  function handleChange(year: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('year', String(year));
    // Reset page when year changes
    params.delete('page');
    router.push(`${pathname}?${params}`);
  }

  return (
    <PillSelect
      value={currentYear}
      onChange={handleChange}
      ariaLabel="Select season year"
      options={years.map((y) => ({ value: y, label: `${y} Season` }))}
    />
  );
}

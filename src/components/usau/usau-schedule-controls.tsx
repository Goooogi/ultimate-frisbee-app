'use client';

// Controls for the USAU Schedule page: competition-level filter (default Club)
// + an OPTIONAL gender-division filter that includes an "All divisions" choice.
//
// The schedule lists the full sanctioned calendar for a level, so division
// defaults to "All" (absent ?div) — most upcoming events have no scraped teams
// yet, so there's nothing to attribute a gender to. Picking Men/Women/Mixed
// narrows to events that DO have scraped teams in that division.

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PillSelect } from '@/components/pill-select';
import { UsauLevelSelect } from './usau-level-select';

type DivChoice = 'all' | 'Men' | 'Women' | 'Mixed';

const DIV_OPTIONS: { value: DivChoice; label: string }[] = [
  { value: 'all', label: 'All divisions' },
  { value: 'Men', label: 'Men' },
  { value: 'Women', label: 'Women' },
  { value: 'Mixed', label: 'Mixed' },
];

function parseDivChoice(raw: string | null): DivChoice {
  if (!raw) return 'all';
  const norm = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  return norm === 'Men' || norm === 'Women' || norm === 'Mixed' ? norm : 'all';
}

export function UsauScheduleControls() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = parseDivChoice(searchParams.get('div'));

  const onChange = useCallback(
    (next: DivChoice) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === 'all') params.delete('div');
      else params.set('div', next.toLowerCase());
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <UsauLevelSelect />
      <PillSelect
        value={current}
        onChange={onChange}
        ariaLabel="Select division"
        options={DIV_OPTIONS}
      />
    </div>
  );
}

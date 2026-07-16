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
import { UsauFlightSelect } from './usau-flight-select';
import { UsauSeasonSelect } from './usau-season-select';
import type { CompetitionLevel } from '@/lib/usau/data';

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

export function UsauScheduleControls({ level }: { level?: CompetitionLevel } = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentDiv = parseDivChoice(searchParams.get('div'));

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === null) params.delete(key);
      else params.set(key, value);
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  // Flight is a Triple Crown Tour (Club) concept — only offer it for Club.
  const showFlight = level === 'CLUB';

  return (
    // Season on its OWN row above the other filters (its own line on mobile);
    // on desktop it flows inline to the left of them. The remaining three
    // (level/division/flight) share the row below.
    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
      <UsauSeasonSelect />
      <div className="flex items-center gap-2 flex-wrap">
        <UsauLevelSelect />
        <PillSelect
          value={currentDiv}
          onChange={(next) => setParam('div', next === 'all' ? null : next.toLowerCase())}
          ariaLabel="Select division"
          options={DIV_OPTIONS}
        />
        {showFlight && <UsauFlightSelect />}
      </div>
    </div>
  );
}

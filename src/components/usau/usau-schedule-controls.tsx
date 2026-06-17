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
import { FLIGHTS, FLIGHT_LABELS, parseFlightParam, type Flight } from '@/lib/usau/flights';
import type { CompetitionLevel } from '@/lib/usau/data';

type DivChoice = 'all' | 'Men' | 'Women' | 'Mixed';

const DIV_OPTIONS: { value: DivChoice; label: string }[] = [
  { value: 'all', label: 'All divisions' },
  { value: 'Men', label: 'Men' },
  { value: 'Women', label: 'Women' },
  { value: 'Mixed', label: 'Mixed' },
];

type FlightChoice = 'all' | Flight;

const FLIGHT_OPTIONS: { value: FlightChoice; label: string }[] = [
  { value: 'all', label: 'All flights' },
  ...FLIGHTS.map((f) => ({ value: f, label: FLIGHT_LABELS[f] })),
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
  const currentFlight: FlightChoice = parseFlightParam(searchParams.get('flight')) ?? 'all';

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
    <div className="flex items-center gap-2 flex-wrap">
      <UsauLevelSelect />
      <PillSelect
        value={currentDiv}
        onChange={(next) => setParam('div', next === 'all' ? null : next.toLowerCase())}
        ariaLabel="Select division"
        options={DIV_OPTIONS}
      />
      {showFlight && (
        <PillSelect
          value={currentFlight}
          onChange={(next) => setParam('flight', next === 'all' ? null : next)}
          ariaLabel="Select flight"
          options={FLIGHT_OPTIONS}
        />
      )}
    </div>
  );
}

'use client';

// Controls for the USAU Schedule page: competition-level filter (default Club)
// + the Triple Crown Tour flight filter (Club only).
//
// Season and division selectors were removed for mobile parity (2026-08-16):
// the schedule is future-facing, so the season archive lives on /scores where
// "which season's results" is the question that makes sense, and division
// filtering mostly narrowed nothing on the upcoming calendar.

import { UsauLevelSelect } from './usau-level-select';
import { UsauFlightSelect } from './usau-flight-select';
import type { CompetitionLevel } from '@/lib/usau/data';

export function UsauScheduleControls({ level }: { level?: CompetitionLevel } = {}) {
  // Flight is a Triple Crown Tour (Club) concept — only offer it for Club.
  const showFlight = level === 'CLUB';

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <UsauLevelSelect />
      {showFlight && <UsauFlightSelect />}
    </div>
  );
}

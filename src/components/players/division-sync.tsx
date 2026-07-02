'use client';

// Syncs the nav's USAU division (?div=) to a player's most-recent division on
// a profile page, so the global "Teams" tab lands on the right division (e.g. a
// Mixed player → Mixed club teams). Fires once on mount via router.replace
// (no history entry, no scroll). Renders nothing. Only acts for a real USAU
// division that differs from the current URL — a UFA-only player leaves ?div
// untouched.

import { useEffect, useRef } from 'react';
import { useDivision, parseDivisionParam, type UsauDivision } from '@/lib/use-division';

const VALID = new Set(['Men', 'Women', 'Mixed']);

export function DivisionSync({ division }: { division: string | null }) {
  const [current, setDivision] = useDivision();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    if (!division || !VALID.has(division)) return;
    const target = parseDivisionParam(division.toLowerCase()) as UsauDivision;
    if (target !== current) {
      setDivision(target);
      done.current = true;
    }
    // Only run on mount for this player; deps intentionally minimal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [division]);

  return null;
}

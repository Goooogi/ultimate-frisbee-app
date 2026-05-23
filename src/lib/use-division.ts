'use client';

// USAU gender-division filter state. Lives in the URL as `?div=men|women|mixed`.
// Mirrors useLeague() so server + client agree without an extra fetch.
//
// Division is only meaningful when the active league is USAU. Setting it
// while on the UFA tab is harmless — the param sits in the URL until the
// user switches back to USAU. Component-level filters opt into reading
// it via this hook.

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  DEFAULT_DIVISION,
  parseDivisionParam,
  type UsauDivision,
} from '@/lib/league';

export { DEFAULT_DIVISION, parseDivisionParam, type UsauDivision };

export function useDivision(): [UsauDivision, (next: UsauDivision) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = parseDivisionParam(searchParams.get('div'));

  const setDivision = useCallback(
    (next: UsauDivision) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === DEFAULT_DIVISION) params.delete('div');
      else params.set('div', next.toLowerCase());
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  return [current, setDivision];
}

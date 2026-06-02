'use client';

// USAU competition-level filter state. Lives in the URL as
// `?level=club|college-d1|college-d3|masters|grand-masters`.
// Mirrors useDivision() — same hook shape, same default-omits-from-URL trick.
//
// Only meaningful when the active league is USAU. Defaults to 'CLUB'.

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  DEFAULT_LEVEL,
  parseLevelParam,
  levelToParam,
  type UsauLevel,
} from '@/lib/league';

export { DEFAULT_LEVEL, parseLevelParam, levelToParam, type UsauLevel };

export function useLevel(): [UsauLevel, (next: UsauLevel) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = parseLevelParam(searchParams.get('level'));

  const setLevel = useCallback(
    (next: UsauLevel) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === DEFAULT_LEVEL) params.delete('level');
      else params.set('level', levelToParam(next));
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  return [current, setLevel];
}

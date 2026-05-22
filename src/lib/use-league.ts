'use client';

// League state lives in the URL as `?league=ufa|usau|intl`. This hook
// reads + writes that param using Next.js's router, so tab clicks update
// the URL, the back button is honored, and the active league persists
// across navigation (e.g. from /scores → /teams → /schedule).
//
// Server Components read the same value via params; we keep the source of
// truth identical so client and server can't disagree.

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { LeagueId } from '@/lib/data';
import { DEFAULT_LEAGUE, inferLeagueFromPath, parseLeagueParam } from '@/lib/league';

export { DEFAULT_LEAGUE, parseLeagueParam };

export function useLeague(): [LeagueId, (next: LeagueId) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Precedence: explicit ?league= param > path inference > default.
  // Paths like /usau/teams/123 or /players/{uuid} flip the switcher to
  // USAU without needing a query param on every link.
  const queryLeague = searchParams.get('league');
  const current = queryLeague
    ? parseLeagueParam(queryLeague)
    : (inferLeagueFromPath(pathname) ?? DEFAULT_LEAGUE);

  const setLeague = useCallback(
    (next: LeagueId) => {
      const params = new URLSearchParams(searchParams.toString());
      const inferred = inferLeagueFromPath(pathname);
      // If the path infers a league (e.g. /usau/...), keep an explicit
      // ?league= when the user picks something different so the override
      // sticks. Otherwise strip the param when it matches the default.
      if (next === DEFAULT_LEAGUE && (inferred === null || inferred === DEFAULT_LEAGUE)) {
        params.delete('league');
      } else {
        params.set('league', next);
      }
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  return [current, setLeague];
}

'use client';

// URL-backed view state for tournament event pages (division filter, section
// tab). Hunter's ruling (2026-08-16, mirrored from mobile): drilling into a
// team and coming back — or hard-refreshing — must NOT reset the division/tab
// a user picked. Keeping the state in query params via router.replace gives
// browser back, refresh, and link-sharing all of that for free; `scroll:
// false` keeps in-page switches from jumping, and back-nav scroll restoration
// comes from the browser. Mirrors the useDivision()/useLevel() hook shape.
//
// Callers must render under a Suspense boundary (useSearchParams).
//
// Writes go through NATIVE window.history.replaceState (Next 14.1+ shallow
// routing — useSearchParams stays in sync), NOT router.replace. router.replace
// kicks off an RSC round trip and useSearchParams doesn't reflect the new URL
// until it commits, so two writes inside that window raced: picking a division
// then tapping a section tab rebuilt the query from the STALE params and
// dropped ?div= — the filter reset to the first division (Hunter, 2026-08-20).
// Building from window.location.search + replaceState is synchronous, so
// consecutive writes compose — and filter taps no longer hit the server at all.

import { useCallback } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

export function useViewParam(
  key: string,
): [string | null, (next: string | null) => void] {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const value = searchParams.get(key);

  const setValue = useCallback(
    (next: string | null) => {
      const params = new URLSearchParams(window.location.search);
      if (next == null) params.delete(key);
      else params.set(key, next);
      const qs = params.toString();
      window.history.replaceState(null, '', `${pathname}${qs ? `?${qs}` : ''}`);
    },
    [pathname, key],
  );

  return [value, setValue];
}

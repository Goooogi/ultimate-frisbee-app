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

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export function useViewParam(
  key: string,
): [string | null, (next: string | null) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const value = searchParams.get(key);

  const setValue = useCallback(
    (next: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next == null) params.delete(key);
      else params.set(key, next);
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
    },
    [router, pathname, searchParams, key],
  );

  return [value, setValue];
}

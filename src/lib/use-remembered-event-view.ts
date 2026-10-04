'use client';

// Per-event memory of a tournament page's view (tab / division / level) —
// Hunter, 2026-10-03: opening an event lands on its default (Pools), but coming
// back to one you've been on returns you to where you left off. The URL stays
// the source of truth (useViewParam: shareable, back/refresh keep it); this only
// fills it in when you arrive with none of the view params, e.g. from a
// schedule link. sessionStorage keyed by pathname, most recent first, capped:
// session state by design, same as mobile's screen-view-state — a new visit
// days later starts on the defaults, not a tab chosen last week.
//
// Callers must render under a Suspense boundary (useSearchParams).

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

const STORAGE_KEY = 'the-layout.event-views';
const MAX_ENTRIES = 50;
const VIEW_KEYS = ['tab', 'div', 'level'] as const;

/** pathname → that page's view query ("tab=bracket&div=women"). */
type Views = Record<string, string>;

function readViews(): Views {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '{}') as Views;
  } catch {
    return {}; // storage unavailable (private mode) or corrupt — URL still works
  }
}

function writeViews(views: Views): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(views));
  } catch {
    // storage unavailable — nothing to remember
  }
}

export function useRememberedEventView(): void {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const restored = useRef(false);
  const view = new URLSearchParams(
    VIEW_KEYS.flatMap((k) => {
      const v = searchParams.get(k);
      return v ? [[k, v] as [string, string]] : [];
    }),
  ).toString();

  useEffect(() => {
    if (!restored.current) {
      restored.current = true;
      const saved = view ? null : readViews()[pathname];
      if (saved) {
        // Native replaceState (see useViewParam) — no RSC round trip, and
        // useSearchParams picks it up; the next run stores it as most recent.
        const params = new URLSearchParams(window.location.search);
        for (const [k, v] of new URLSearchParams(saved)) params.set(k, v);
        window.history.replaceState(null, '', `${pathname}?${params.toString()}`);
        return;
      }
    }
    const { [pathname]: _prev, ...rest } = readViews();
    writeViews(Object.fromEntries(Object.entries({ [pathname]: view, ...rest }).slice(0, MAX_ENTRIES)));
  }, [pathname, view]);
}

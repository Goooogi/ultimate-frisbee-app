'use client';

// In-app navigation memory for "smart back" + inner-pane scroll restoration.
//
// Two problems this solves (Hunter, 2026-08-20):
//  1. The breadcrumb back chevron was a fresh <Link> to the bare parent URL,
//     so backing out of a team/game page dropped ?div=/?tab= and re-rendered
//     the event page from scratch (reset to first division, Pools, top).
//     Breadcrumbs now call router.back() when the previous in-app route IS
//     the parent page, restoring the real history entry with its params.
//  2. The app scrolls in a nested overflow-y-auto pane (AppShell), not the
//     body, so the browser's own scroll restoration never applies. Panes
//     save their scrollTop per-URL as they scroll; after a back/forward
//     (popstate — including router.back() above) the remounted pane restores
//     the saved position for the URL it landed on.
//
// All state is module-level and per-tab: `prev/curr` reset on hard reload
// (breadcrumbs then fall back to a plain link nav — correct, there is no
// history to go back to), scroll offsets live in sessionStorage so they
// survive the RSC round trip of a back-nav.

import { useEffect, useLayoutEffect, type RefObject } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

let prev: string | null = null;
let curr: string | null = null;
// URL (pathname+search) a popstate just landed on — panes mounting for this
// URL may restore their saved scroll. Cleared by the next non-pop route
// change so a later fresh visit to the same URL starts at the top.
let popUrl: string | null = null;

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    popUrl = window.location.pathname + window.location.search;
  });
}

/** Previous in-app page (pathname+search), or null right after a reload.
 *
 *  Callers pass their own pathname for two reasons:
 *  - Freshness: the tracker updates one effect pass AFTER a new page renders,
 *    so at mount the freshest previous page is still in `curr` — reading bare
 *    `prev` there returns the page before last.
 *  - Same-path noise: ?div=/?tab= filter switches are router.replace calls on
 *    the SAME page; without skipping same-path entries they'd masquerade as a
 *    back target after a re-render. */
export function previousUrl(currentPath: string): string | null {
  for (const c of [curr, prev]) {
    if (c != null && c.split('?')[0] !== currentPath) return c;
  }
  return null;
}

/** Mounted once in the root layout (under Suspense — reads search params). */
export function NavHistoryTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const qs = searchParams.toString();
  const url = `${pathname}${qs ? `?${qs}` : ''}`;

  useEffect(() => {
    if (url !== curr) {
      prev = curr;
      curr = url;
    }
    if (popUrl != null && popUrl !== url) popUrl = null;
  }, [url]);

  return null;
}

/**
 * Attach to a scroll pane (AppShell's mobile/desktop panes). Saves scrollTop
 * per URL while scrolling; restores it when the pane mounts as the result of
 * a back/forward navigation. `paneId` keys the two breakpoints apart.
 */
export function usePaneScrollRestoration(
  ref: RefObject<HTMLElement | null>,
  paneId: string,
) {
  // Restore BEFORE paint so a back-nav doesn't flash the top of the page.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const url = window.location.pathname + window.location.search;
    if (popUrl !== url) return;
    const saved = sessionStorage.getItem(`pane-scroll:${paneId}:${url}`);
    if (saved) el.scrollTop = parseInt(saved, 10) || 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const key = `pane-scroll:${paneId}:${window.location.pathname}${window.location.search}`;
        sessionStorage.setItem(key, String(el.scrollTop));
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

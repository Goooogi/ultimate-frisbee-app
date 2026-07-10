// "For You" — shared plain constants (safe to import from both the server
// action live-data.ts and the client component; NOT a 'use server' module).

import type { FavoriteLeague } from '@/lib/favorites/data';

/**
 * Feature flag for the "For You" personalized page. HIDDEN for now (2026-07-10):
 * the page is functional but not finished, so all its entry points are gated off
 * while the code stays intact in the background. Flip to `true` to re-expose:
 *   - the hamburger-menu "For You" row (mobile-menu.tsx)
 *   - the favorites onboarding modal (favorites-onboarding-modal.tsx)
 *   - the /for-you route (app/for-you/page.tsx — otherwise redirects home)
 * Backlog item: "Finish the For You page + unhide it."
 */
export const FOR_YOU_ENABLED = false;

/** Human display name per league (wfdf → "Worlds (WFDF)"). */
export const LEAGUE_DISPLAY: Record<FavoriteLeague, string> = {
  ufa: 'UFA',
  usau: 'USAU',
  pul: 'PUL',
  wul: 'WUL',
  wfdf: 'Worlds (WFDF)',
};

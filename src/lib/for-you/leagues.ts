// "For You" — shared plain constants (safe to import from both the server
// action live-data.ts and the client component; NOT a 'use server' module).

import type { FavoriteLeague } from '@/lib/favorites/data';

/**
 * Feature flag for the "For You" personalized page. LIVE (re-enabled 2026-07-16
 * after being hidden 2026-07-10). Gates all four entry points:
 *   - the hamburger-menu "For You" row (mobile-menu.tsx) — shown once the user
 *     has a favorite team
 *   - the favorites onboarding modal (favorites-onboarding-modal.tsx)
 *   - the /for-you route (app/for-you/page.tsx — otherwise redirects home)
 *   - the favorites editor card in Settings (settings/page.tsx)
 * Set back to `false` to hide the whole feature again without deleting code.
 */
export const FOR_YOU_ENABLED = true;

/** Human display name per league (wfdf → "Worlds (WFDF)"). */
export const LEAGUE_DISPLAY: Record<FavoriteLeague, string> = {
  ufa: 'UFA',
  usau: 'USAU',
  pul: 'PUL',
  wul: 'WUL',
  wfdf: 'Worlds (WFDF)',
};

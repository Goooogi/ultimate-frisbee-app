// Name → anchor-profile resolution for linking WFDF roster names.
//
// SERVER-ONLY. Kept out of src/lib/wfdf/data.ts because that module is imported
// (lazily) by the client app-rail for its mega-menu preview; pulling the UFA
// client's `server-only` import into that graph breaks the client bundle. This
// module is only imported from server components (the by-name profile route).
//
// WFDF is not an anchor league (players have no standalone WFDF id), so a WFDF
// roster name links to a profile ONLY when the same human exists in an anchor
// league. USAU is the largest, cheapest-to-query pool (indexed surname lookup)
// and the most likely to contain internationals who also play US club, so we
// resolve against it first, then UFA as a fallback.

import 'server-only';

export interface WfdfAnchorHit {
  /** Anchor id usable directly as /players/[id]. */
  anchorId: string;
  league: 'usau' | 'ufa';
}

export async function resolveWfdfPlayerAnchor(fullName: string): Promise<WfdfAnchorHit | null> {
  const name = fullName.trim();
  if (!name) return null;
  // USAU first — single indexed DB query, largest international overlap.
  const { findUsauPlayerByName } = await import('@/lib/usau/data');
  const usauId = await findUsauPlayerByName(name).catch(() => null);
  if (usauId) return { anchorId: usauId, league: 'usau' };
  // UFA fallback — heavier (season stat dumps), so only when USAU misses.
  const { findUfaPlayerIdByName } = await import('@/lib/wfdf/anchor-ufa');
  const ufaId = await findUfaPlayerIdByName(name).catch(() => null);
  if (ufaId) return { anchorId: ufaId, league: 'ufa' };
  return null;
}

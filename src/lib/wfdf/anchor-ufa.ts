// UFA name → player-id resolver, used as the second-choice anchor when linking
// WFDF roster names to a profile (USAU is tried first in resolveWfdfPlayerAnchor).
//
// Kept in its own module so the WFDF data layer can lazily import the heavy UFA
// client only on the resolver path, not on every WFDF page render.

import { getAllPlayerStats, currentSeasonYear } from '@/lib/ufa/client';
import { namesMatch } from '@/lib/name-match';
import { loadNameAliases } from '@/lib/name-aliases';

/**
 * Find a UFA player id whose name matches `name`, scanning the last three
 * seasons' stat dumps (cached upstream). Returns null on no match.
 */
export async function findUfaPlayerIdByName(name: string): Promise<string | null> {
  const aliases = await loadNameAliases();
  const years = [currentSeasonYear(), currentSeasonYear() - 1, currentSeasonYear() - 2];
  for (const year of years) {
    try {
      const all = await getAllPlayerStats({ year, per: 'total' });
      const hit = all.find((p) => namesMatch(name, p.name, aliases));
      if (hit) return hit.playerID;
    } catch {
      // try the next year
    }
  }
  return null;
}

'use server';

// Server actions for UFA player search.
//
// The upstream UFA API has no name-search param — only year, team, and
// sort. To find a player by partial name we have to walk the entire
// season leaderboard (paged, ~30 rows per page) and filter on this side.
//
// We cap at `getAllPlayerStats`'s default (30 pages × 30 = 900 rows),
// which comfortably covers every player who's logged a 2026 minute. The
// upstream caches each page for 1h via the call() helper, so repeated
// searches within the same hour are cheap.

import { getAllPlayerStats } from '@/lib/ufa/client';
import type { UfaPlayerStat } from '@/lib/ufa/types';

/**
 * Search the year's full UFA leaderboard for players whose name includes
 * the needle (case-insensitive). Returns at most `limit` results, sorted
 * by scores descending so the highest-impact matches come first.
 *
 * Empty / very short queries return [] — let the client keep showing the
 * default top-200 view in that case.
 */
export async function searchUfaPlayers(
  query: string,
  year: number,
  limit = 200,
): Promise<UfaPlayerStat[]> {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];

  try {
    const all = await getAllPlayerStats({ year, per: 'total' });
    return all
      .filter((p) => p.name.toLowerCase().includes(needle))
      .sort((a, b) => (b.scores ?? 0) - (a.scores ?? 0))
      .slice(0, limit);
  } catch {
    return [];
  }
}

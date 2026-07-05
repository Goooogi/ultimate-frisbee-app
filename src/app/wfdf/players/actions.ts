'use server';

// Server action for the WFDF Players hub search. The roster corpus is ~21k
// rows (~4.5MB serialized), far too large to ship to the client for in-browser
// filtering. Instead the hub is search-first and calls this action, which runs
// an indexed ilike() query server-side and returns only the matches.

import { searchRosterPlayers, type WfdfPlayerHubRow } from '@/lib/wfdf/data';

export async function searchWfdfPlayers(query: string): Promise<WfdfPlayerHubRow[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  return searchRosterPlayers(q).catch(() => []);
}

'use server';

// Server actions for Fantasy. Kept tiny + side-effect-only.

import { revalidatePath } from 'next/cache';

/**
 * Revalidate the cached Fantasy pages after a roster write. The leaderboard
 * (`/fantasy`) is ISR-cached (revalidate: 60), so without this a freshly
 * submitted team wouldn't appear on the standings until the cache expired —
 * which read as a "delay" after submitting. Called by the roster builder on a
 * successful save. No auth needed: it only busts a public cache, reveals
 * nothing, and writes nothing.
 */
// Team ids are Postgres UUIDs. Validate before interpolating into a path so a
// malformed/hostile value from this public server action is simply ignored
// rather than used to build an arbitrary revalidation target. (revalidatePath
// can't leak or poison content, but constraining the input costs nothing.)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function revalidateFantasy(teamId?: string): Promise<void> {
  revalidatePath('/fantasy');
  revalidatePath('/fantasy/team');
  // The public team view we redirect to after a save is ISR-cached per-id;
  // bust it so the owner sees their just-saved roster, not a stale copy.
  if (teamId && UUID_RE.test(teamId)) revalidatePath(`/fantasy/team/${teamId}`);
}

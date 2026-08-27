// Per-profile playbook scope preference — which playbook (personal or a
// team) the user last worked in. Stored on profiles.playbook_scope so it
// follows the ACCOUNT across sessions and devices (Hunter, 2026-08-27), not
// just this browser. Callers validate a team id against the user's current
// memberships before applying it; a stale value degrades to the default.

import { createClient } from '@/lib/supabase/client';

export async function loadScopePref(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('profiles')
    .select('playbook_scope')
    .eq('id', user.id)
    .maybeSingle();
  return data?.playbook_scope ?? null;
}

/** Fire-and-forget: a preference write must never block or break the scope
 *  switch itself — a failed save just means the old default next session. */
export function saveScopePref(scope: string): void {
  void (async () => {
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('profiles').update({ playbook_scope: scope }).eq('id', user.id);
    } catch {
      // Best-effort by design — see the doc comment.
    }
  })();
}

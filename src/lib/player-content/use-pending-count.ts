'use client';

// Admin-only count of player_content rows awaiting review (status='pending').
// Powers the red notification dot on the account avatar.
//
// - Only queries when the user is an admin. Non-admins get 0 and never hit the
//   DB. (RLS also gates this: only `is_admin()` can SELECT non-approved rows,
//   so even a forged call returns nothing useful.)
// - HEAD + exact count → transfers a count, not rows. Cheap.
// - Refreshes on mount, every 60s, and when the tab regains focus, so a new
//   submission shows up within ~a minute without any realtime infra.

import { useEffect, useState } from 'react';

const POLL_MS = 60_000;

export function usePendingContentCount(isAdmin: boolean): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isAdmin) {
      setCount(0);
      return;
    }

    let cancelled = false;
    let teardown: (() => void) | undefined;

    // Load the Supabase browser client lazily (dynamic import) so supabase-js
    // stays out of the global nav bundle — only the admin who mounts the
    // account chip ever downloads it.
    (async () => {
      const { createClient } = await import('@/lib/supabase/client');
      if (cancelled) return;
      const supabase = createClient();

      async function refresh() {
        const { count: c, error } = await supabase
          .from('player_content')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending');
        if (!cancelled && !error) setCount(c ?? 0);
      }

      refresh();
      const interval = setInterval(refresh, POLL_MS);
      // Re-check when the admin returns to the tab (cheap, catches new
      // submissions that arrived while they were away).
      const onVisible = () => {
        if (document.visibilityState === 'visible') refresh();
      };
      document.addEventListener('visibilitychange', onVisible);

      teardown = () => {
        clearInterval(interval);
        document.removeEventListener('visibilitychange', onVisible);
      };
      // If the component unmounted while the import was in flight, clean up now.
      if (cancelled) teardown();
    })();

    return () => {
      cancelled = true;
      teardown?.();
    };
  }, [isAdmin]);

  return count;
}

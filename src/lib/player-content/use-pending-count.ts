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
import { createClient } from '@/lib/supabase/client';

const POLL_MS = 60_000;

export function usePendingContentCount(isAdmin: boolean): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isAdmin) {
      setCount(0);
      return;
    }

    const supabase = createClient();
    let cancelled = false;

    async function refresh() {
      const { count: c, error } = await supabase
        .from('player_content')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      if (!cancelled && !error) setCount(c ?? 0);
    }

    refresh();
    const interval = setInterval(refresh, POLL_MS);
    // Re-check when the admin returns to the tab (cheap, catches new submissions
    // that arrived while they were away).
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isAdmin]);

  return count;
}

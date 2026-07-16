'use client';

// Admin-only counts of things awaiting review — pending player_content AND
// new (un-triaged) feedback. Powers the red notification dot + badge on the
// account avatar, and the per-section badges in the admin menu.
//
// - Only queries when the user is an admin. Non-admins get zeros and never hit
//   the DB. (RLS also gates both: only `is_admin()` can SELECT pending content
//   or others' feedback, so even a forged call returns nothing useful.)
// - HEAD + exact count → transfers a count, not rows. Cheap.
// - Refreshes on mount, every 60s, and when the tab regains focus, so a new
//   submission shows up within ~a minute without any realtime infra.

import { useEffect, useState } from 'react';

const POLL_MS = 60_000;

export interface AdminReviewCounts {
  /** player_content rows with status='pending'. */
  content: number;
  /** feedback rows with status='new'. */
  feedback: number;
  /** content + feedback — the single number shown on the avatar badge. */
  total: number;
}

const ZERO: AdminReviewCounts = { content: 0, feedback: 0, total: 0 };

/** Combined admin review counts (pending content + new feedback). */
export function useAdminReviewCounts(isAdmin: boolean): AdminReviewCounts {
  const [counts, setCounts] = useState<AdminReviewCounts>(ZERO);

  useEffect(() => {
    if (!isAdmin) {
      setCounts(ZERO);
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
        const [contentRes, feedbackRes] = await Promise.all([
          supabase
            .from('player_content')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending'),
          supabase
            .from('feedback')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'new'),
        ]);
        if (cancelled) return;
        const content = contentRes.error ? 0 : contentRes.count ?? 0;
        const feedback = feedbackRes.error ? 0 : feedbackRes.count ?? 0;
        setCounts({ content, feedback, total: content + feedback });
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

  return counts;
}

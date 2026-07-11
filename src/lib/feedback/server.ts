import 'server-only';

// Admin-side feedback reads. RLS (feedback_select_admin_or_own) already limits
// a non-admin to their own rows, but the admin PAGE also gates on
// profiles.role === 'admin' server-side before calling these — defence in depth.
// Joins the submitter's profile for a display name in the inbox.

import { createClient } from '@/lib/supabase/server';

export type FeedbackStatus = 'new' | 'read' | 'resolved';

export interface FeedbackItem {
  id: string;
  message: string;
  category: string | null;
  pagePath: string | null;
  status: FeedbackStatus;
  createdAt: string;
  submitterName: string | null;
  submitterHandle: string | null;
}

interface Row {
  id: string;
  message: string;
  category: string | null;
  page_path: string | null;
  status: FeedbackStatus;
  created_at: string;
  profiles: { display_name: string | null; username: string | null } | null;
}

/** All feedback, newest first (new items float via the status/created index).
 *  Capped to avoid the PostgREST 1000-row ceiling; paginate later if needed. */
export async function getAllFeedback(limit = 200): Promise<FeedbackItem[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('feedback')
    .select('id, message, category, page_path, status, created_at, profiles:user_id(display_name, username)')
    // Enums sort by their DEFINITION order in Postgres, so status ASC =
    // new → read → resolved: un-triaged feedback floats to the top.
    .order('status', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;

  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    message: r.message,
    category: r.category,
    pagePath: r.page_path,
    status: r.status,
    createdAt: r.created_at,
    submitterName: r.profiles?.display_name ?? null,
    submitterHandle: r.profiles?.username ?? null,
  }));
}

/** Count of un-triaged ('new') feedback — drives the admin-menu badge. */
export async function getNewFeedbackCount(): Promise<number> {
  const supabase = createClient();
  const { count, error } = await supabase
    .from('feedback')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'new');
  if (error) return 0;
  return count ?? 0;
}

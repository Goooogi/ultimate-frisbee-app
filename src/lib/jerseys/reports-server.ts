import 'server-only';

// Admin-side reads for the jersey reports queue.
//
// This is the ONLY admin surface in the jersey feature — listings are never
// held for approval, so nothing reaches an admin unless a user reported it.
//
// Message threads stay private: a report row is what grants read access, via
// jersey_thread_messages_for_admin(). We never bulk-read jersey_messages here.

import { createClient } from '@/lib/supabase/server';
import type { ReportStatus } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface JerseyReportItem {
  id: string;
  status: ReportStatus;
  reason: string;
  detail: string | null;
  createdAt: string;
  reporter: { id: string; displayName: string | null; username: string | null } | null;
  reportedUser: { id: string; displayName: string | null; username: string | null } | null;
  /** Exactly one of these is set. */
  listing: { id: string; title: string; status: string } | null;
  want: { id: string; teamName: string | null; playerName: string | null } | null;
  threadId: string | null;
}

async function assertAdmin() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if ((profile as { role?: string } | null)?.role !== 'admin') throw new Error('Not authorized');
  return { supabase: supabase as any, user };
}

export async function getJerseyReports(limit = 100): Promise<JerseyReportItem[]> {
  let supabase: any;
  try {
    ({ supabase } = await assertAdmin());
  } catch {
    return [];
  }

  const { data, error } = await supabase
    .from('jersey_reports')
    .select(`
      id, status, reason, detail, created_at, thread_id,
      reporter:profiles!jersey_reports_reporter_id_fkey(id, display_name, username),
      reported:profiles!jersey_reports_reported_user_id_fkey(id, display_name, username),
      jersey_listings(id, title, status),
      jersey_wants(id, team_name, player_name)
    `)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[jerseys] getJerseyReports', error.message);
    return [];
  }

  return ((data ?? []) as any[]).map((r) => ({
    id: String(r.id),
    status: r.status,
    reason: String(r.reason),
    detail: r.detail ?? null,
    createdAt: String(r.created_at),
    reporter: r.reporter
      ? {
          id: String(r.reporter.id),
          displayName: r.reporter.display_name ?? null,
          username: r.reporter.username ?? null,
        }
      : null,
    reportedUser: r.reported
      ? {
          id: String(r.reported.id),
          displayName: r.reported.display_name ?? null,
          username: r.reported.username ?? null,
        }
      : null,
    listing: r.jersey_listings
      ? {
          id: String(r.jersey_listings.id),
          title: String(r.jersey_listings.title),
          status: String(r.jersey_listings.status),
        }
      : null,
    want: r.jersey_wants
      ? {
          id: String(r.jersey_wants.id),
          teamName: r.jersey_wants.team_name ?? null,
          playerName: r.jersey_wants.player_name ?? null,
        }
      : null,
    threadId: r.thread_id ? String(r.thread_id) : null,
  }));
}

export async function getOpenJerseyReportCount(): Promise<number> {
  let supabase: any;
  try {
    ({ supabase } = await assertAdmin());
  } catch {
    return 0;
  }
  const { count } = await supabase
    .from('jersey_reports')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'new');
  return count ?? 0;
}

/**
 * Read a REPORTED thread's messages. Delegates to the SECURITY DEFINER function
 * which re-checks both admin status AND that a report exists — so this cannot
 * be used to browse arbitrary conversations.
 */
export async function getReportedThreadMessages(
  threadId: string,
): Promise<{ id: string; senderId: string; body: string; createdAt: string }[]> {
  let supabase: any;
  try {
    ({ supabase } = await assertAdmin());
  } catch {
    return [];
  }
  const { data, error } = await supabase.rpc('jersey_thread_messages_for_admin', {
    p_thread: threadId,
  });
  if (error) {
    console.error('[jerseys] getReportedThreadMessages', error.message);
    return [];
  }
  return ((data ?? []) as any[]).map((m) => ({
    id: String(m.id),
    senderId: String(m.sender_id),
    body: String(m.body),
    createdAt: String(m.created_at),
  }));
}

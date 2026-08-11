import 'server-only';

// Admin-side reads for the player_content report queue. Mirrors
// src/lib/jerseys/reports-server.ts in structure.
//
// reporter_id references auth.users, not profiles — there is no FK PostgREST
// can embed for reporter identity, so we fetch it with a second .in() query
// keyed by reporter_id instead of a nested select.

import { createClient } from '@/lib/supabase/server';
import { STORAGE_BUCKET } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */

export type PlayerContentReportStatus = 'new' | 'resolved';

export interface PlayerContentReportItem {
  id: string;
  status: PlayerContentReportStatus;
  reason: string;
  createdAt: string;
  reviewedAt: string | null;
  reporter: { id: string; displayName: string | null; username: string | null } | null;
  content: {
    id: string;
    playerDisplayName: string;
    kind: string;
    caption: string | null;
    externalUrl: string | null;
    storagePath: string | null;
    /** Public URL derived from storage_path (image/video kinds); null otherwise. */
    publicUrl: string | null;
  } | null;
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

export async function getPlayerContentReports(limit = 100): Promise<PlayerContentReportItem[]> {
  let supabase: any;
  try {
    ({ supabase } = await assertAdmin());
  } catch {
    return [];
  }

  const { data, error } = await supabase
    .from('player_content_reports')
    .select(`
      id, status, reason, created_at, reviewed_at, reporter_id,
      player_content(id, player_display_name, kind, caption, external_url, storage_path)
    `)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[player-content] getPlayerContentReports', error.message);
    return [];
  }

  const rows = (data ?? []) as any[];
  const reporterIds = [...new Set(rows.map((r) => String(r.reporter_id)))];
  const reporterById = new Map<string, { id: string; displayName: string | null; username: string | null }>();
  if (reporterIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, display_name, username')
      .in('id', reporterIds);
    if (profilesError) {
      console.error('[player-content] getPlayerContentReports reporters', profilesError.message);
    } else {
      for (const p of (profiles ?? []) as any[]) {
        reporterById.set(String(p.id), {
          id: String(p.id),
          displayName: p.display_name ?? null,
          username: p.username ?? null,
        });
      }
    }
  }

  return rows.map((r) => ({
    id: String(r.id),
    status: r.status,
    reason: String(r.reason),
    createdAt: String(r.created_at),
    reviewedAt: r.reviewed_at ?? null,
    reporter: reporterById.get(String(r.reporter_id)) ?? null,
    content: r.player_content
      ? {
          id: String(r.player_content.id),
          playerDisplayName: String(r.player_content.player_display_name),
          kind: String(r.player_content.kind),
          caption: r.player_content.caption ?? null,
          externalUrl: r.player_content.external_url ?? null,
          storagePath: r.player_content.storage_path ?? null,
          publicUrl: r.player_content.storage_path
            ? supabase.storage.from(STORAGE_BUCKET).getPublicUrl(r.player_content.storage_path).data.publicUrl
            : null,
        }
      : null,
  }));
}

export async function getOpenPlayerContentReportCount(): Promise<number> {
  let supabase: any;
  try {
    ({ supabase } = await assertAdmin());
  } catch {
    return 0;
  }
  const { count } = await supabase
    .from('player_content_reports')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'new');
  return count ?? 0;
}

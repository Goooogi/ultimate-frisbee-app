// Server-side helpers for reading player_content rows.
//
// Why server-only: the player profile page is an RSC, so it fetches approved
// content with the SSR Supabase client. RLS already filters by status, but we
// keep an explicit .eq('status', 'approved') here too — defense in depth in
// case the policy is ever loosened.

import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { parseEmbed } from './embed';
import { STORAGE_BUCKET, type PlayerContentItem, type PlayerContentRow, type PlayerKind } from './types';

export async function getApprovedContentForPlayer(
  playerKind: PlayerKind,
  playerRef: string,
): Promise<PlayerContentItem[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('player_content')
    .select('*')
    .eq('player_kind', playerKind)
    .eq('player_ref', playerRef)
    .eq('status', 'approved')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[player-content] approved fetch failed', error);
    return [];
  }
  return (data ?? []).map((row) => hydrate(supabase, row as PlayerContentRow));
}

// Admin-only readers. Even though RLS would return zero rows for non-admins,
// we make the intent explicit so future callers can't accidentally call these
// from an unprotected route. RLS remains the actual enforcement layer.
async function assertAdmin(supabase: SupabaseClient): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (profile?.role !== 'admin') throw new Error('Not authorized');
}

export async function getPendingContent(): Promise<PlayerContentItem[]> {
  const supabase = createClient();
  await assertAdmin(supabase);
  const { data, error } = await supabase
    .from('player_content')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[player-content] pending fetch failed', error);
    return [];
  }
  return (data ?? []).map((row) => hydrate(supabase, row as PlayerContentRow));
}

export async function getRecentReviewedContent(limit = 25): Promise<PlayerContentItem[]> {
  const supabase = createClient();
  await assertAdmin(supabase);
  const { data, error } = await supabase
    .from('player_content')
    .select('*')
    .in('status', ['approved', 'rejected'])
    .order('reviewed_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[player-content] reviewed fetch failed', error);
    return [];
  }
  return (data ?? []).map((row) => hydrate(supabase, row as PlayerContentRow));
}

// ── helpers ──────────────────────────────────────────────────────────────

type SupabaseClient = ReturnType<typeof createClient>;

function hydrate(supabase: SupabaseClient, row: PlayerContentRow): PlayerContentItem {
  let publicUrl: string | null = null;
  if (row.storage_path) {
    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(row.storage_path);
    publicUrl = data.publicUrl;
  }
  const embedUrl = row.external_url ? parseEmbed(row.external_url)?.embedUrl ?? null : null;
  return { ...row, publicUrl, embedUrl };
}

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

/**
 * Approved content for a person known by SEVERAL (kind, ref) pairs across
 * leagues (a unified profile). Content is keyed by (player_kind, player_ref),
 * and a user may have uploaded under any of their league ids — so a profile
 * must union content across ALL of them, else a photo added under one league
 * id vanishes when the profile is opened via another league's url.
 *
 * One query using OR over the (kind,ref) pairs; de-duped by row id and sorted
 * newest-first. Empty input → [].
 */
export async function getApprovedContentForPlayers(
  refs: { kind: PlayerKind; ref: string }[],
): Promise<PlayerContentItem[]> {
  if (refs.length === 0) return [];
  const supabase = createClient();
  // Build an OR of AND(kind,ref) clauses. Values are ids/slugs (no PostgREST
  // metacharacters), but guard anyway by dropping any ref with a comma/paren
  // that would break the filter grammar.
  const safe = refs.filter((r) => r.ref && !/[(),]/.test(r.ref));
  if (safe.length === 0) return [];
  const orExpr = safe
    .map((r) => `and(player_kind.eq.${r.kind},player_ref.eq.${r.ref})`)
    .join(',');
  const { data, error } = await supabase
    .from('player_content')
    .select('*')
    .or(orExpr)
    .eq('status', 'approved')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[player-content] multi-ref approved fetch failed', error);
    return [];
  }
  // Dedupe by row id (a person shouldn't share a row across refs, but be safe).
  const seen = new Set<string>();
  const rows = (data ?? []).filter((r) => {
    const id = (r as PlayerContentRow).id;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return rows.map((row) => hydrate(supabase, row as PlayerContentRow));
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

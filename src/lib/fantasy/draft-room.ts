// Fantasy draft room — client contract (P2, 2026-08-27).
//
// This file is the AGREED INTERFACE between the DB layer (migrations + RPCs,
// built by the backend pass) and the draft-room UI. UI imports ONLY from
// here; the backend pass implements the RPCs these wrappers call and may
// adjust internals but NOT these signatures without updating both sides.
//
// Rules (Hunter, 2026-08-27): snake only; 12 rounds (7 starters 4O/3D + 5
// bench for UFA weekly; event games draft their flex count then bench);
// 60s default pick clock (commissioner-configurable); drafted leagues are
// owner-exclusive (a player belongs to ONE team per contest); the Public
// League stays pick-anyone and never drafts.
//
// Clock model: NO cron. The server stamps current_started_at per pick;
// clients render the countdown from it. When expired, ANY league member's
// client calls resolveDraftClock() — first caller wins, the RPC autopicks
// (queue first, then best-available) for every expired turn; concurrent
// callers no-op. Realtime keeps every open room in sync.

import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

// fantasy_* tables/RPCs are deliberately NOT in the generated
// database.types.ts (repo convention — local interfaces + cast; see
// leagues.ts). Same untyped-client pattern here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>;
function client(): AnyClient {
  return createClient() as unknown as AnyClient;
}

export type DraftStatus = 'scheduled' | 'live' | 'complete';

export interface DraftRef {
  playerLeague: string; // 'ufa' | 'usau' | 'pul' | 'wul' | 'wfdf'
  playerId: string;
  playerName: string;
}

export interface Draft {
  id: string;
  contestId: string;
  status: DraftStatus;
  draftType: 'snake';
  rounds: number;
  pickSeconds: number;
  /** Team ids in round-1 order; snake reverses on even rounds. */
  draftOrder: string[];
  /** 1-based overall pick currently on the clock (or rounds*teams+1 when complete). */
  currentOverall: number;
  /** When the current pick's clock started (ISO); null until live. */
  currentStartedAt: string | null;
  scheduledAt: string | null;
}

export interface DraftPick {
  overall: number;
  round: number;
  teamId: string;
  playerLeague: string;
  playerId: string;
  playerName: string;
  auto: boolean;
}

/** Snake math shared by UI + server (server is authoritative; this mirrors
 *  it for rendering). overall is 1-based. */
export function teamOnClock(draft: Pick<Draft, 'draftOrder' | 'currentOverall'>): string | null {
  const n = draft.draftOrder.length;
  if (n === 0) return null;
  const idx0 = draft.currentOverall - 1;
  const round = Math.floor(idx0 / n); // 0-based
  const pos = idx0 % n;
  return draft.draftOrder[round % 2 === 0 ? pos : n - 1 - pos] ?? null;
}

export function roundOf(overall: number, teamCount: number): number {
  return Math.floor((overall - 1) / Math.max(teamCount, 1)) + 1;
}

// ── RPC wrappers ────────────────────────────────────────────────────────────

function mapDraft(row: Record<string, unknown>): Draft {
  return {
    id: row.id as string,
    contestId: row.contest_id as string,
    status: row.status as DraftStatus,
    draftType: 'snake',
    rounds: row.rounds as number,
    pickSeconds: row.pick_seconds as number,
    draftOrder: (row.draft_order as string[]) ?? [],
    currentOverall: row.current_overall as number,
    currentStartedAt: (row.current_started_at as string | null) ?? null,
    scheduledAt: (row.scheduled_at as string | null) ?? null,
  };
}

function mapPick(row: Record<string, unknown>): DraftPick {
  return {
    overall: row.overall as number,
    round: row.round as number,
    teamId: row.team_id as string,
    playerLeague: row.player_league as string,
    playerId: row.player_id as string,
    playerName: row.player_name as string,
    auto: row.auto as boolean,
  };
}

/** The contest's draft, or null when none is scheduled. Public read. */
export async function getDraft(contestId: string): Promise<Draft | null> {
  const supabase = client();
  const { data, error } = await supabase
    .from('fantasy_drafts')
    .select('*')
    .eq('contest_id', contestId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapDraft(data as Record<string, unknown>) : null;
}

/** All picks so far, overall ascending. Public read (spectatable board). */
export async function getDraftPicks(draftId: string): Promise<DraftPick[]> {
  const supabase = client();
  const { data, error } = await supabase
    .from('fantasy_draft_picks')
    .select('*')
    .eq('draft_id', draftId)
    .order('overall', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(mapPick);
}

/** Commissioner: create/schedule the contest's draft. */
export async function scheduleDraft(input: {
  contestId: string;
  at: string | null; // ISO; null = "manual start whenever"
  pickSeconds?: number;
  rounds?: number;
}): Promise<Draft> {
  const supabase = client();
  const { data, error } = await supabase.rpc('fantasy_schedule_draft', {
    p_contest: input.contestId,
    p_at: input.at,
    p_pick_seconds: input.pickSeconds ?? 60,
    p_rounds: input.rounds ?? 12,
  });
  if (error) throw error;
  return mapDraft(data as Record<string, unknown>);
}

/** Commissioner: go live (shuffles/locks the order server-side). */
export async function startDraft(draftId: string): Promise<Draft> {
  const supabase = client();
  const { data, error } = await supabase.rpc('fantasy_start_draft', { p_draft: draftId });
  if (error) throw error;
  return mapDraft(data as Record<string, unknown>);
}

/** Make the pick for the caller's team (must be on the clock). */
export async function makeDraftPick(draftId: string, player: DraftRef): Promise<DraftPick> {
  const supabase = client();
  const { data, error } = await supabase.rpc('fantasy_make_pick', {
    p_draft: draftId,
    p_player_league: player.playerLeague,
    p_player_id: player.playerId,
    p_player_name: player.playerName,
  });
  if (error) throw error;
  return mapPick(data as Record<string, unknown>);
}

/** Resolve expired clocks (autopick). Any league member may call; returns the
 *  number of autopicks applied (0 = clock wasn't expired / already resolved). */
export async function resolveDraftClock(draftId: string): Promise<number> {
  const supabase = client();
  const { data, error } = await supabase.rpc('fantasy_resolve_clock', { p_draft: draftId });
  if (error) throw error;
  return (data as number) ?? 0;
}

/** Save the caller's private pick queue (ordered). Owner-only via RLS. */
export async function saveDraftQueue(draftId: string, entries: DraftRef[]): Promise<void> {
  const supabase = client();
  const { error } = await supabase.rpc('fantasy_set_queue', {
    p_draft: draftId,
    p_entries: entries,
  });
  if (error) throw error;
}

/** The caller's queue ([] when none). */
export async function getMyDraftQueue(draftId: string): Promise<DraftRef[]> {
  const supabase = client();
  const { data, error } = await supabase
    .from('fantasy_draft_queues')
    .select('entries')
    .eq('draft_id', draftId)
    .maybeSingle();
  if (error) throw error;
  return ((data?.entries ?? []) as DraftRef[]) || [];
}

// ── Realtime ────────────────────────────────────────────────────────────────

/** Subscribe a draft room: fires on every new pick and on draft-row updates
 *  (status/clock advance). Caller refetches via getDraft/getDraftPicks on
 *  events (payloads are notifications, not the source of truth). Returns the
 *  channel; caller must clean up with unsubscribeDraft() on unmount. */
export function subscribeDraft(
  draftId: string,
  onChange: () => void,
): RealtimeChannel {
  const supabase = client();
  // The browser client is a singleton and caches channels by topic. A prior
  // mount's channel (unsubscribed or not) is returned as-is by channel(), and
  // adding .on() to a once-subscribed channel throws — remove any stale
  // instance first so re-entering the room (or a dev double-mount) works.
  const stale = supabase.getChannels().find((c) => c.topic === `realtime:draft:${draftId}`);
  if (stale) supabase.removeChannel(stale);
  return supabase
    .channel(`draft:${draftId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'fantasy_draft_picks', filter: `draft_id=eq.${draftId}` },
      onChange,
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'fantasy_drafts', filter: `id=eq.${draftId}` },
      onChange,
    )
    .subscribe();
}

/** Tear down a room subscription — removeChannel (not bare unsubscribe) so
 *  the singleton client drops its cached instance and the next mount can
 *  subscribe cleanly. */
export function unsubscribeDraft(channel: RealtimeChannel): void {
  client().removeChannel(channel);
}

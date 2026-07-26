'use client';

// UTCG Draft mode — client wrappers over the utcg_draft_* SECURITY DEFINER
// RPCs. Same contract as actions.ts: the server owns every state transition
// (entry fee, candidate deals, pick validation by INDEX into the server-dealt
// set, gauntlet rolls, payouts); these wrappers only shuttle state.
//
// A draft run: pay DRAFT_ENTRY_FEE → 7 slots, each dealt 5 rarity-weighted
// candidates fitting the slot's position (NOT from the user's collection) →
// gauntlet of up to 4 matches vs escalating opponents. Each win banks a
// growing reward (+ a jackpot for 4-0); a loss ends the run but the bank is
// kept. Server constants mirrored here for display only: entry 150, targets
// [77,86,93,97], rewards [70,130,300,600], jackpot 500 (see utcg_draft_play).
// Tuned so a run nets coins ~60-70% of the time long-run (round 3 @ target 93
// is the wall); rebalanced 2026-07-22 (was 76/83/89/94 + 120/220/380/600).

import { createClient } from '@/lib/supabase/client';
import type { FormationKey } from './formations';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RpcClient = { rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }> };
function rpcClient(): RpcClient {
  return createClient() as unknown as RpcClient;
}

// Display-only mirrors of the server constants (utcg_draft_start/_play).
export const DRAFT_ENTRY_FEE = 150;
export const DRAFT_TARGETS = [77, 86, 93, 97] as const;
export const DRAFT_REWARDS = [70, 130, 300, 600] as const;
export const DRAFT_JACKPOT = 500;
export const DRAFT_ROUNDS = 4;

/** One dealt/picked card (server payload — display-ready, no extra fetch). */
export interface DraftCard {
  playerId: string;
  name: string;
  teamSlug: string;
  teamAbbr: string;
  year: number;
  playerScore: number;
  tierRank: number;
  position: 'handler' | 'cutter' | 'hybrid';
  division: string | null;
}

export type DraftStatus = 'drafting' | 'playing' | 'complete';

export interface DraftRun {
  id: string;
  formation: FormationKey;
  status: DraftStatus;
  /** Next slot to pick (0-6) while drafting. */
  slotIdx: number;
  /** Current slot's dealt candidates (empty once playing). */
  deals: DraftCard[];
  /** Picks so far, in slot order. */
  picks: DraftCard[];
  /** Gauntlet matches won (0-4). */
  round: number;
  bank: number;
  payout: number | null;
}

interface RawDraftCard {
  player_id: string;
  name: string;
  team_slug: string;
  team_abbr: string;
  year: number;
  player_score: number;
  tier_rank: number;
  position: 'handler' | 'cutter' | 'hybrid';
  division: string | null;
}

export function mapDraftCard(r: RawDraftCard): DraftCard {
  return {
    playerId: r.player_id,
    name: r.name,
    teamSlug: r.team_slug,
    teamAbbr: r.team_abbr,
    year: r.year,
    playerScore: Number(r.player_score),
    tierRank: r.tier_rank,
    position: r.position,
    division: r.division,
  };
}

export function mapDraftRun(row: Record<string, unknown>): DraftRun {
  return {
    id: String(row.id),
    formation: row.formation as FormationKey,
    status: row.status as DraftStatus,
    slotIdx: Number(row.slot_idx),
    deals: ((row.deals ?? []) as RawDraftCard[]).map(mapDraftCard),
    picks: ((row.picks ?? []) as RawDraftCard[]).map(mapDraftCard),
    round: Number(row.round),
    bank: Number(row.bank),
    payout: row.payout === null || row.payout === undefined ? null : Number(row.payout),
  };
}

/** Result of one gauntlet round (shape returned by utcg_draft_play). */
export interface DraftRoundResult {
  won: boolean;
  round: number;
  bank: number;
  status: DraftStatus;
  payout: number | null;
  opponentStrength: number;
  chem: number;
  strength: number;
  /** Wallet balance after payout — only present when the run completed. */
  coins: number | null;
}

/** Start a run (deducts the entry fee server-side). Throws if one is active. */
export async function startDraft(formation: FormationKey): Promise<DraftRun> {
  const { data, error } = await rpcClient().rpc('utcg_draft_start', { p_formation: formation });
  if (error) throw new Error(error.message);
  return mapDraftRun(data as Record<string, unknown>);
}

/** Pick a candidate by its index in the current deal. */
export async function pickDraftCard(runId: string, index: number): Promise<DraftRun> {
  const { data, error } = await rpcClient().rpc('utcg_draft_pick', { p_run_id: runId, p_index: index });
  if (error) throw new Error(error.message);
  return mapDraftRun(data as Record<string, unknown>);
}

/** Play the next gauntlet match. */
export async function playDraftRound(runId: string): Promise<DraftRoundResult> {
  const { data, error } = await rpcClient().rpc('utcg_draft_play', { p_run_id: runId });
  if (error) throw new Error(error.message);
  const r = data as Record<string, unknown>;
  return {
    won: Boolean(r.won),
    round: Number(r.round),
    bank: Number(r.bank),
    status: r.status as DraftStatus,
    payout: r.payout === null || r.payout === undefined ? null : Number(r.payout),
    opponentStrength: Number(r.opponent_strength),
    chem: Number(r.chem),
    strength: Number(r.strength),
    coins: r.coins === null || r.coins === undefined ? null : Number(r.coins),
  };
}

/** Abandon the active run — banks whatever was already won. */
export async function abandonDraft(runId: string): Promise<{ payout: number; coins: number }> {
  const { data, error } = await rpcClient().rpc('utcg_draft_abandon', { p_run_id: runId });
  if (error) throw new Error(error.message);
  const r = data as Record<string, unknown>;
  return { payout: Number(r.payout), coins: Number(r.coins) };
}

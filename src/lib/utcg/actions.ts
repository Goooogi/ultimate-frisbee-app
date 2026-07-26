'use client';

// UTCG client-side mutations — thin wrappers over the SECURITY DEFINER RPCs.
//
// These are the ONLY way coins/cards change. The RPCs enforce the economy
// server-side (cadence, prices, ownership, odds); the client can't forge a
// pull or a balance. Each caller uses the browser Supabase client so the RPC
// sees the user's auth.uid().

import { createClient } from '@/lib/supabase/client';
import type { CardTier } from './packs';
import type { PackKind } from './packs';
import type { FormationKey } from './formations';

// The generated Database types don't include the utcg_* RPCs (same as the
// twelve_oh_* tables in data.ts). Wrap the browser client in a minimal untyped
// rpc() surface so these callers compile; auth is unaffected.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RpcClient = { rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }> };
function rpcClient(): RpcClient {
  return createClient() as unknown as RpcClient;
}

/** One card pulled from a pack (shape returned by utcg_open_pack). */
export interface PackPull {
  playerId: string;
  name: string;
  teamSlug: string;
  teamAbbr: string;
  year: number;
  playerScore: number;
  tierRank: number;
  isNew: boolean;
}

interface RawPull {
  player_id: string;
  name: string;
  team_slug: string;
  team_abbr: string;
  year: number;
  player_score: number;
  tier_rank: number;
  is_new: boolean;
}

function mapPull(r: RawPull): PackPull {
  return {
    playerId: r.player_id,
    name: r.name,
    teamSlug: r.team_slug,
    teamAbbr: r.team_abbr,
    year: r.year,
    playerScore: Number(r.player_score),
    tierRank: r.tier_rank,
    isNew: r.is_new,
  };
}

/** tier_rank (7..1) → CardTier key, matching packs.ts TIERS order. */
const RANK_TO_TIER: Record<number, CardTier> = {
  7: 'greatest', 6: 'elite', 5: 'star', 4: 'solidPro', 3: 'contributor', 2: 'leagueAvg', 1: 'fringe',
};
export function tierFromRank(rank: number): CardTier {
  return RANK_TO_TIER[rank] ?? 'fringe';
}

export interface WalletState {
  coins: number;
  packsOpened: number;
  matchesPlayed: number;
  bestWins: number;
}

function mapWallet(row: Record<string, unknown>): WalletState {
  return {
    coins: Number(row.coins),
    packsOpened: Number(row.packs_opened),
    matchesPlayed: Number(row.matches_played),
    bestWins: Number(row.best_wins),
  };
}

/** Ensure the caller has a wallet (creates it with starter coins on first call). */
export async function ensureWallet(): Promise<WalletState> {
  const { data, error } = await rpcClient().rpc('utcg_ensure_wallet');
  if (error) throw new Error(error.message);
  return mapWallet(data as Record<string, unknown>);
}

/** Open a pack. Returns the pulls (in draw order). Throws on cooldown / insufficient coins. */
export async function openPack(kind: PackKind): Promise<PackPull[]> {
  const { data, error } = await rpcClient().rpc('utcg_open_pack', { p_kind: kind });
  if (error) throw new Error(error.message);
  return ((data ?? []) as RawPull[]).map(mapPull);
}

/** Sell N duplicate copies of a card back for coins. Returns the updated wallet. */
export async function quicksell(
  playerId: string, teamSlug: string, year: number, qty = 1,
): Promise<WalletState> {
  const { data, error } = await rpcClient().rpc('utcg_quicksell', {
    p_player_id: playerId, p_team_slug: teamSlug, p_year: year, p_qty: qty,
  });
  if (error) throw new Error(error.message);
  return mapWallet(data as Record<string, unknown>);
}

/** One placed card, in slot order (handlers first per the formation). */
export interface SquadCardRef {
  playerId: string;
  teamSlug: string;
  year: number;
}

export interface MatchOutcome extends WalletState {
  wins: number;
  losses: number;
  reward: number;
  /** True when the daily match-reward cap was hit — reward is 0 but the match
   *  still counted (record/best_wins update). Server-enforced. */
  capped: boolean;
  chem: number;
  strength: number;
}

/**
 * Resolve headshot URLs for a set of UFA players (by player_id). Returns a Map
 * playerId → url (only players who have one). Server payloads that carry cards
 * (pack pulls, draft deals) omit headshots so they don't bloat the jsonb, so
 * the client fetches them here from ufa_players — the stored URL is a plain
 * object URL (no image-transform), matching how the collection reads them.
 * Used by both the pack reveal and the draft/gauntlet screens.
 */
export async function getPullHeadshots(playerIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = Array.from(new Set(playerIds));
  if (ids.length === 0) return out;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createClient() as any;
  const { data, error } = await db
    .from('ufa_players')
    .select('id, headshot_url')
    .in('id', ids);
  if (error) return out; // headshots are cosmetic — never block the reveal
  for (const row of (data ?? []) as { id: string; headshot_url: string | null }[]) {
    if (row.headshot_url) out.set(row.id, row.headshot_url);
  }
  return out;
}

/**
 * Submit a completed squad; the SERVER recomputes the record (from DB-truth
 * card scores + verified ownership) and awards coins for the record IT
 * computed — the client cannot forge wins. `formation` is a FormationKey
 * (vert|ho|hex|threeTwo), `cards` = 7 owned card refs in the formation's slot
 * order. KEEP the RPC's formation→slots map (utcg_record_match) in sync with
 * FORMATIONS in formations.ts.
 *
 * Returns the server-authoritative outcome (wins/losses/reward + wallet).
 * Note: the client's own scoreSquad() is only for the instant preview; this
 * result is the source of truth for coins and should be reconciled into the UI.
 */
export async function recordMatch(
  formation: FormationKey,
  cards: SquadCardRef[],
): Promise<MatchOutcome> {
  const payload = cards.map((c) => ({ player_id: c.playerId, team_slug: c.teamSlug, year: c.year }));
  const { data, error } = await rpcClient().rpc('utcg_record_match', {
    p_formation: formation,
    p_cards: payload,
  });
  if (error) throw new Error(error.message);
  const row = data as Record<string, unknown>;
  return {
    ...mapWallet(row),
    wins: Number(row.wins),
    losses: Number(row.losses),
    reward: Number(row.reward),
    capped: Boolean(row.capped),
    chem: Number(row.chem),
    strength: Number(row.strength),
  };
}

// Admin UTCG trading-flags data layer — suspicious pair detection for the
// admin Trading flags tab.
//
// Reads through the utcg_admin_flagged_pairs() SECURITY DEFINER RPC, which is
// guarded (raises 'not authorized' for non-admins) and is the only place
// email from auth.users is exposed here — admins only. The /admin route is
// also gated server-side, so this is defense in depth. Mirrors
// src/lib/admin/roles.ts.

import { createClient } from '@/lib/supabase/server';

export type FlagReason = 'coins' | 'cards' | 'price' | 'new';

export interface FlaggedPair {
  userA: { id: string; email: string; createdAt: string };
  userB: { id: string; email: string; createdAt: string };
  coinsMoved: number;
  cardValueMoved: number;
  transfers: number;
  maxPriceRatio: number | null;
  lastTransferAt: string;
  reasons: FlagReason[];
}

interface RawRow {
  user_a: string;
  user_a_email: string | null;
  user_a_created_at: string;
  user_b: string;
  user_b_email: string | null;
  user_b_created_at: string;
  coins_moved: number;
  card_value_moved: number;
  transfers: number;
  max_price_ratio: number | null;
  last_transfer_at: string;
  reasons: string[] | null;
}

// Not in the generated Database types — cast to a minimal untyped rpc surface
// (same as admin_list_users / utcg_* helpers elsewhere).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedRpc = { rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }> };

/** Suspicious UTCG trading pairs over the last p_days days. Admin-only via the RPC guard. */
export async function getFlaggedPairs(days: number): Promise<FlaggedPair[]> {
  const supabase = createClient() as unknown as UntypedRpc;
  const { data, error } = await supabase.rpc('utcg_admin_flagged_pairs', { p_days: days });
  if (error) throw new Error(error.message);
  return ((data ?? []) as RawRow[]).map((r) => ({
    userA: { id: r.user_a, email: r.user_a_email ?? '(no email)', createdAt: r.user_a_created_at },
    userB: { id: r.user_b, email: r.user_b_email ?? '(no email)', createdAt: r.user_b_created_at },
    coinsMoved: r.coins_moved,
    cardValueMoved: r.card_value_moved,
    transfers: r.transfers,
    maxPriceRatio: r.max_price_ratio,
    lastTransferAt: r.last_transfer_at,
    reasons: (r.reasons ?? []) as FlagReason[],
  }));
}

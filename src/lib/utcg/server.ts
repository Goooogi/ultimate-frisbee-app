import 'server-only';

// UTCG server-side reads for the SIGNED-IN user.
//
// Wallet + owned cards are RLS "read-own", so we must resolve auth via the
// cookie-aware SERVER client (same rationale as fantasy/server.ts — the browser
// client has no cookie context in a Server Component and would read empty).
// The heavy card hydration reuses the isomorphic anon helpers in data.ts.

import { createClient as createServerSupabase } from '@/lib/supabase/server';
import { getCardsByKeys, cardKey, type UtcgCard } from './data';
import { freePackCooldownMs } from './packs';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyQuery = { from: (t: string) => any };
function serverDb() {
  const supabase = createServerSupabase();
  return { supabase, db: supabase as unknown as AnyQuery };
}

export interface UtcgWallet {
  coins: number;
  packsOpened: number;
  matchesPlayed: number;
  bestWins: number;
  freePackReadyInMs: number; // 0 = claimable now
}

export interface OwnedCard {
  card: UtcgCard;
  copies: number;
}

export interface UtcgSnapshot {
  signedIn: boolean;
  /** Auth user id — needed client-side for "my listings / my offers" market
   *  queries (RLS still enforces scope; this just filters). null = signed out. */
  userId: string | null;
  wallet: UtcgWallet | null;
  owned: OwnedCard[];
  /** Active (unfinished) draft run row, raw as stored — the client maps it
   *  with draft.ts mapDraftRun(). null = no run in progress. */
  activeDraftRun: Record<string, unknown> | null;
}

/**
 * Full per-user snapshot: wallet + hydrated owned collection.
 * Returns { signedIn:false } when there is no session (the page then shows the
 * signed-out CTA). Does NOT create a wallet — that happens lazily on first
 * pack open via the RPC — so a signed-in user with no wallet reads as coins 0 /
 * free pack ready.
 */
export async function getUtcgSnapshot(): Promise<UtcgSnapshot> {
  const { supabase, db } = serverDb();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { signedIn: false, userId: null, wallet: null, owned: [], activeDraftRun: null };

  const [{ data: walletRow }, { data: ownedRows }, { data: draftRow }] = await Promise.all([
    db.from('utcg_wallets').select('*').eq('user_id', user.id).maybeSingle(),
    db.from('utcg_owned_cards').select('player_id, team_slug, year, copies').eq('user_id', user.id),
    db
      .from('utcg_draft_runs')
      .select('*')
      .eq('user_id', user.id)
      .neq('status', 'complete')
      .maybeSingle(),
  ]);

  const now = new Date();
  const wallet: UtcgWallet = walletRow
    ? {
        coins: Number(walletRow.coins),
        packsOpened: Number(walletRow.packs_opened),
        matchesPlayed: Number(walletRow.matches_played),
        bestWins: Number(walletRow.best_wins),
        freePackReadyInMs: freePackCooldownMs(
          walletRow.last_free_pack_at ? new Date(walletRow.last_free_pack_at) : null,
          now,
        ),
      }
    : { coins: 0, packsOpened: 0, matchesPlayed: 0, bestWins: 0, freePackReadyInMs: 0 };

  const rows = (ownedRows ?? []) as { player_id: string; team_slug: string; year: number; copies: number }[];
  const keys = rows.map((r) => ({ playerId: r.player_id, teamSlug: r.team_slug, year: r.year }));
  const cards = await getCardsByKeys(keys);

  const owned: OwnedCard[] = rows
    .map((r) => {
      const card = cards.get(cardKey({ playerId: r.player_id, teamSlug: r.team_slug, year: r.year }));
      return card ? { card, copies: Number(r.copies) } : null;
    })
    .filter((x): x is OwnedCard => x !== null)
    // best cards first
    .sort((a, b) => b.card.playerScore - a.card.playerScore);

  return {
    signedIn: true,
    userId: user.id,
    wallet,
    owned,
    activeDraftRun: (draftRow as Record<string, unknown> | null) ?? null,
  };
}

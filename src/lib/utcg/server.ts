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
  /** Recent PvP matches involving this user, newest first. This is how a
   *  DEFENDER finds out they were challenged at all — their squad is played
   *  while they're away, so without this the only signal is a changed balance. */
  pvpMatches: PvpMatchRow[];
  /** Our parked, not-yet-played challenge (with its escrowed stake), if any. */
  openPvpSquad: { chem: number; strength: number; stakedCoins: number; createdAt: string } | null;
}

/** One resolved PvP match, already oriented to THIS user ("us" vs "them")
 *  rather than the raw challenger/defender columns. */
export interface PvpMatchRow {
  id: string;
  /** True when we were the one who entered against a stored squad. */
  wasChallenger: boolean;
  /** Outcome from OUR perspective. */
  result: 'won' | 'lost' | 'draw';
  ourStrength: number;
  theirStrength: number;
  ourChem: number;
  theirChem: number;
  decidedBy: string;
  pot: number;
  /** Coins this match moved for us: +pot/2 on a win, -pot/2 on a loss, 0 draw. */
  coinDelta: number;
  createdAt: string;
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
  if (!user)
    return {
      signedIn: false,
      userId: null,
      wallet: null,
      owned: [],
      activeDraftRun: null,
      pvpMatches: [],
      openPvpSquad: null,
    };

  const [{ data: walletRow }, { data: ownedRows }, { data: draftRow }, { data: pvpRows }, { data: openSquadRow }] =
    await Promise.all([
      db.from('utcg_wallets').select('*').eq('user_id', user.id).maybeSingle(),
      db.from('utcg_owned_cards').select('player_id, team_slug, year, copies').eq('user_id', user.id),
      db
        .from('utcg_draft_runs')
        .select('*')
        .eq('user_id', user.id)
        .neq('status', 'complete')
        .maybeSingle(),
      // RLS already limits this to matches we participated in; the explicit
      // or() keeps the intent readable and lets the indexes do the work.
      db
        .from('utcg_pvp_matches')
        .select('*')
        .or(`challenger_id.eq.${user.id},defender_id.eq.${user.id}`)
        .order('created_at', { ascending: false })
        .limit(20),
      db
        .from('utcg_pvp_squads')
        .select('chem, strength, staked_coins, created_at')
        .eq('user_id', user.id)
        .is('consumed_at', null)
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

  // Re-orient each match to "us vs them" so the UI never has to know whether we
  // were the challenger or the defender.
  const pvpMatches: PvpMatchRow[] = (
    (pvpRows ?? []) as Record<string, unknown>[]
  ).map((m) => {
    const wasChallenger = String(m.challenger_id) === user.id;
    const outcome = String(m.outcome);
    const result: PvpMatchRow['result'] =
      outcome === 'draw' ? 'draw' : (outcome === 'challenger') === wasChallenger ? 'won' : 'lost';
    const pot = Number(m.pot);
    return {
      id: String(m.id),
      wasChallenger,
      result,
      ourStrength: Number(wasChallenger ? m.challenger_strength : m.defender_strength),
      theirStrength: Number(wasChallenger ? m.defender_strength : m.challenger_strength),
      ourChem: Number(wasChallenger ? m.challenger_chem : m.defender_chem),
      theirChem: Number(wasChallenger ? m.defender_chem : m.challenger_chem),
      decidedBy: String(m.decided_by),
      pot,
      coinDelta: result === 'draw' ? 0 : result === 'won' ? pot / 2 : -(pot / 2),
      createdAt: String(m.created_at),
    };
  });

  const openPvpSquad = openSquadRow
    ? {
        chem: Number((openSquadRow as Record<string, unknown>).chem),
        strength: Number((openSquadRow as Record<string, unknown>).strength),
        stakedCoins: Number((openSquadRow as Record<string, unknown>).staked_coins),
        createdAt: String((openSquadRow as Record<string, unknown>).created_at),
      }
    : null;

  return {
    signedIn: true,
    userId: user.id,
    wallet,
    owned,
    activeDraftRun: (draftRow as Record<string, unknown> | null) ?? null,
    pvpMatches,
    openPvpSquad,
  };
}

'use client';

// UTCG Marketplace — client-side wrappers over the utcg_market_* SECURITY
// DEFINER RPCs, plus the read queries that power the browse/my-market screens.
//
// Doctrine (same as actions.ts / draft.ts): the RPCs own every coin/copy move
// (escrow, transfer, refund, the 5% sink); these wrappers only shuttle state.
// Reads go through the browser client so RLS scopes rows to the caller (public
// active listings + own listings; offers only for the two parties).
//
// A "card" is the (playerId, teamSlug, year) identity used everywhere in UTCG;
// listings/offers store just that tuple, and we enrich to full UtcgCards for
// display via getCardsByKeys (same path the collection uses).

import { createClient } from '@/lib/supabase/client';
import { getCardsByKeys, cardKey, type UtcgCard } from './data';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RpcClient = { rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }> };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = { rpc: RpcClient['rpc']; from: (t: string) => any };
function db(): DbClient {
  return createClient() as unknown as DbClient;
}

export type ListingKind = 'sell' | 'trade';
export type ListingStatus = 'active' | 'sold' | 'traded' | 'cancelled';
export type OfferStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn';

/** Card identity tuple (the ownership PK, UFA). */
export interface CardRef {
  playerId: string;
  teamSlug: string;
  year: number;
}

/** A marketplace listing, enriched with its card for display. */
export interface Listing {
  id: string;
  sellerId: string;
  kind: ListingKind;
  askPrice: number | null;
  status: ListingStatus;
  createdAt: string;
  card: UtcgCard;
}

/** A trade offer against a listing, with the offered cards + coins. */
export interface TradeOffer {
  id: string;
  listingId: string;
  offererId: string;
  offerCoins: number;
  status: OfferStatus;
  createdAt: string;
  cards: { ref: CardRef; qty: number; card: UtcgCard | null }[];
}

// ─── Row mappers ────────────────────────────────────────────────────────────

interface RawListing {
  id: string;
  seller_id: string;
  player_id: string;
  team_slug: string;
  year: number;
  kind: ListingKind;
  ask_price: number | null;
  status: ListingStatus;
  created_at: string;
}

interface RawOffer {
  id: string;
  listing_id: string;
  offerer_id: string;
  offer_coins: number;
  status: OfferStatus;
  created_at: string;
}

interface RawOfferCard {
  offer_id: string;
  player_id: string;
  team_slug: string;
  year: number;
  qty: number;
}

/** Enrich a batch of raw listings with their card display data. */
async function hydrateListings(rows: RawListing[]): Promise<Listing[]> {
  if (rows.length === 0) return [];
  const cards = await getCardsByKeys(
    rows.map((r) => ({ playerId: r.player_id, teamSlug: r.team_slug, year: r.year })),
  );
  const out: Listing[] = [];
  for (const r of rows) {
    const card = cards.get(cardKey({ playerId: r.player_id, teamSlug: r.team_slug, year: r.year }));
    if (!card) continue; // card no longer resolvable — skip rather than render a broken tile
    out.push({
      id: r.id,
      sellerId: r.seller_id,
      kind: r.kind,
      askPrice: r.ask_price,
      status: r.status,
      createdAt: r.created_at,
      card,
    });
  }
  return out;
}

// ─── Read queries ───────────────────────────────────────────────────────────

/** All active listings (public market), newest first. RLS returns active rows
 *  + the caller's own. We filter to active here for the browse view. */
export async function getActiveListings(): Promise<Listing[]> {
  const { data, error } = await db()
    .from('utcg_listings')
    .select('id, seller_id, player_id, team_slug, year, kind, ask_price, status, created_at')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return hydrateListings((data ?? []) as RawListing[]);
}

/** The caller's own listings in any status (My Market → Selling). */
export async function getMyListings(userId: string): Promise<Listing[]> {
  const { data, error } = await db()
    .from('utcg_listings')
    .select('id, seller_id, player_id, team_slug, year, kind, ask_price, status, created_at')
    .eq('seller_id', userId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return hydrateListings((data ?? []) as RawListing[]);
}

/** Fetch offers (with their cards) for a set of listing ids. Used for both
 *  "offers on my listings" and "my offers" — RLS scopes visibility. */
export async function getOffersForListings(listingIds: string[]): Promise<Map<string, TradeOffer[]>> {
  const byListing = new Map<string, TradeOffer[]>();
  if (listingIds.length === 0) return byListing;

  const { data: offerRows, error: oErr } = await db()
    .from('utcg_trade_offers')
    .select('id, listing_id, offerer_id, offer_coins, status, created_at')
    .in('listing_id', listingIds)
    .order('created_at', { ascending: false });
  if (oErr) throw new Error(oErr.message);
  const offers = (offerRows ?? []) as RawOffer[];
  if (offers.length === 0) return byListing;

  const { data: cardRows, error: cErr } = await db()
    .from('utcg_trade_offer_cards')
    .select('offer_id, player_id, team_slug, year, qty')
    .in('offer_id', offers.map((o) => o.id));
  if (cErr) throw new Error(cErr.message);
  const offerCards = (cardRows ?? []) as RawOfferCard[];

  const cardMap = await getCardsByKeys(
    offerCards.map((c) => ({ playerId: c.player_id, teamSlug: c.team_slug, year: c.year })),
  );

  const cardsByOffer = new Map<string, TradeOffer['cards']>();
  for (const c of offerCards) {
    const ref = { playerId: c.player_id, teamSlug: c.team_slug, year: c.year };
    const arr = cardsByOffer.get(c.offer_id) ?? [];
    arr.push({ ref, qty: c.qty, card: cardMap.get(cardKey(ref)) ?? null });
    cardsByOffer.set(c.offer_id, arr);
  }

  for (const o of offers) {
    const offer: TradeOffer = {
      id: o.id,
      listingId: o.listing_id,
      offererId: o.offerer_id,
      offerCoins: o.offer_coins,
      status: o.status,
      createdAt: o.created_at,
      cards: cardsByOffer.get(o.id) ?? [],
    };
    const arr = byListing.get(o.listing_id) ?? [];
    arr.push(offer);
    byListing.set(o.listing_id, arr);
  }
  return byListing;
}

/** Offers the caller has MADE (across all listings), for My Market → Offers. */
export async function getMyOffers(userId: string): Promise<TradeOffer[]> {
  const { data, error } = await db()
    .from('utcg_trade_offers')
    .select('id, listing_id, offerer_id, offer_coins, status, created_at')
    .eq('offerer_id', userId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  const offers = (data ?? []) as RawOffer[];
  if (offers.length === 0) return [];

  const { data: cardRows, error: cErr } = await db()
    .from('utcg_trade_offer_cards')
    .select('offer_id, player_id, team_slug, year, qty')
    .in('offer_id', offers.map((o) => o.id));
  if (cErr) throw new Error(cErr.message);
  const offerCards = (cardRows ?? []) as RawOfferCard[];
  const cardMap = await getCardsByKeys(
    offerCards.map((c) => ({ playerId: c.player_id, teamSlug: c.team_slug, year: c.year })),
  );
  const cardsByOffer = new Map<string, TradeOffer['cards']>();
  for (const c of offerCards) {
    const ref = { playerId: c.player_id, teamSlug: c.team_slug, year: c.year };
    const arr = cardsByOffer.get(c.offer_id) ?? [];
    arr.push({ ref, qty: c.qty, card: cardMap.get(cardKey(ref)) ?? null });
    cardsByOffer.set(c.offer_id, arr);
  }
  return offers.map((o) => ({
    id: o.id,
    listingId: o.listing_id,
    offererId: o.offerer_id,
    offerCoins: o.offer_coins,
    status: o.status,
    createdAt: o.created_at,
    cards: cardsByOffer.get(o.id) ?? [],
  }));
}

// ─── Mutations (RPC wrappers) ───────────────────────────────────────────────

/** List a card for sale (price required) or for trade (no price). */
export async function listCard(
  ref: CardRef, kind: ListingKind, askPrice: number | null,
): Promise<void> {
  const { error } = await db().rpc('utcg_market_list', {
    p_player_id: ref.playerId, p_team_slug: ref.teamSlug, p_year: ref.year,
    p_kind: kind, p_ask_price: kind === 'sell' ? askPrice : null,
  });
  if (error) throw new Error(error.message);
}

/** Cancel one of your listings (returns the escrowed card, declines offers). */
export async function cancelListing(listingId: string): Promise<void> {
  const { error } = await db().rpc('utcg_market_cancel', { p_listing_id: listingId });
  if (error) throw new Error(error.message);
}

/** Buy a sell listing. Returns the buyer's new coin balance. */
export async function buyListing(listingId: string): Promise<number> {
  const { data, error } = await db().rpc('utcg_market_buy', { p_listing_id: listingId });
  if (error) throw new Error(error.message);
  return Number((data as { coins: number }).coins);
}

/** Make a trade offer on a trade listing. */
export async function makeOffer(
  listingId: string, cards: { ref: CardRef; qty: number }[], coins: number,
): Promise<void> {
  const { error } = await db().rpc('utcg_market_make_offer', {
    p_listing_id: listingId,
    p_cards: cards.map((c) => ({
      player_id: c.ref.playerId, team_slug: c.ref.teamSlug, year: c.ref.year, qty: c.qty,
    })),
    p_coins: coins,
  });
  if (error) throw new Error(error.message);
}

/** Seller accepts an offer (atomic swap; auto-declines siblings). */
export async function acceptOffer(offerId: string): Promise<void> {
  const { error } = await db().rpc('utcg_market_accept_offer', { p_offer_id: offerId });
  if (error) throw new Error(error.message);
}

/** Seller declines an offer (returns the offerer's escrow). */
export async function declineOffer(offerId: string): Promise<void> {
  const { error } = await db().rpc('utcg_market_decline_offer', { p_offer_id: offerId });
  if (error) throw new Error(error.message);
}

/** Offerer withdraws their own pending offer (returns their escrow). */
export async function withdrawOffer(offerId: string): Promise<void> {
  const { error } = await db().rpc('utcg_market_withdraw_offer', { p_offer_id: offerId });
  if (error) throw new Error(error.message);
}

// ─── Sell price floor (mirror of the SQL quicksell floor) ────────────────────
// The server rejects a sell price below the card's quicksell value; surface the
// same floor in the UI so the seller sees it before submitting. Mirrors
// packs.ts TIERS[].quicksell via the card's tier.
import { quicksellValue } from './packs';
export function sellFloor(card: UtcgCard): number {
  return quicksellValue(card.playerScore);
}

/** The 5% marketplace sink applied to sale proceeds (display helper). */
export const MARKET_SINK_RATE = 0.05;
export function sellerProceeds(price: number): number {
  return price - Math.floor(price * MARKET_SINK_RATE);
}

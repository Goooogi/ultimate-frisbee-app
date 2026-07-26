// UTCG — pack economy + pull odds (pure, shared client/server).
//
// A pack yields N cards drawn by RARITY TIER, not uniformly — that's what makes
// pulling an All-Time Greatest an event. Tiers mirror scoreLabel() bands
// (rating.ts) so the visual rarity of a card matches its pull odds.
//
// Economy (Hunter, 2026-07-20):
//   - FREE pack every 3 days (cadence enforced server-side via wallet.last_free_pack_at).
//   - COINS earned from playing draft matches → spent on store packs.
//   - Duplicates QUICKSELL back to coins so no pull is wasted.
//
// Pull odds are enforced SERVER-SIDE in the open-pack RPC. This module is the
// single source of truth for tier bands, pack contents, prices, and refunds,
// imported by both the RPC-driver and the UI (to show odds / prices).

// ── Rarity tiers (match scoreLabel bands in rating.ts) ──────────────────────
export type CardTier = 'greatest' | 'elite' | 'star' | 'solidPro' | 'contributor' | 'leagueAvg' | 'fringe';

export interface TierDef {
  key: CardTier;
  label: string;
  /** inclusive lower bound on player_score */
  min: number;
  /** coin refund when a duplicate of this tier is quicksold */
  quicksell: number;
}

// Ordered high → low. Upper bound of each tier = min of the one above.
export const TIERS: TierDef[] = [
  { key: 'greatest',    label: 'All-Time Greatest', min: 97, quicksell: 1200 },
  { key: 'elite',       label: 'All-Time Elite',    min: 93, quicksell: 500 },
  { key: 'star',        label: 'Star',              min: 88, quicksell: 175 },
  { key: 'solidPro',    label: 'Solid Pro',         min: 85, quicksell: 80 },
  { key: 'contributor', label: 'Contributor',       min: 80, quicksell: 35 },
  { key: 'leagueAvg',   label: 'League Average',    min: 75, quicksell: 15 },
  { key: 'fringe',      label: 'Fringe',            min: 0,  quicksell: 5 },
];

export function tierForScore(score: number): CardTier {
  for (const t of TIERS) if (score >= t.min) return t.key;
  return 'fringe';
}

export function quicksellValue(score: number): number {
  const key = tierForScore(score);
  return TIERS.find((t) => t.key === key)!.quicksell;
}

// ── Pack definitions ────────────────────────────────────────────────────────
//
// Each pack draws `size` cards. For each card, a tier is rolled from the pack's
// weighted distribution, then a random card of that tier is drawn from the pool.
// A "guarantee" forces at least one card at/above a given tier (the hook).

export type PackKind = 'free' | 'bronze' | 'silver' | 'gold' | 'platinum';

export interface PackDef {
  kind: PackKind;
  name: string;
  size: number;
  price: number;            // coins (0 = free/daily)
  /** per-card tier roll weights (need not sum to 1; normalized at roll time) */
  weights: Record<CardTier, number>;
  /** if set, at least one card is guaranteed at or above this tier */
  guarantee?: CardTier;
  blurb: string;
}

// Weights tuned against the real UFA inventory (7,905 cards: 8 greatest / 72
// elite / 320 star / 394 solidPro / 1,183 contributor / 1,978 avg / 3,950
// fringe). Higher packs shift mass upward and raise the guarantee floor.
// Every pack yields a FULL 7-player squad's worth of cards, so a single open
// gives the player enough to field a lineup (the free pack alone can build a team).
export const PACKS: Record<PackKind, PackDef> = {
  free: {
    kind: 'free', name: 'Weekly Pack', size: 7, price: 0,
    weights: { greatest: 0.2, elite: 1, star: 4, solidPro: 6, contributor: 16, leagueAvg: 30, fringe: 42.8 },
    guarantee: 'contributor',
    blurb: 'One free pack every week — a full 7-card squad. Guaranteed a Contributor or better.',
  },
  bronze: {
    kind: 'bronze', name: 'Bronze Pack', size: 7, price: 500,
    weights: { greatest: 0.2, elite: 1, star: 4, solidPro: 6, contributor: 18, leagueAvg: 34, fringe: 36.8 },
    guarantee: 'contributor',
    blurb: '7 cards. Guaranteed a Contributor or better.',
  },
  silver: {
    kind: 'silver', name: 'Silver Pack', size: 7, price: 1200,
    weights: { greatest: 0.35, elite: 2, star: 7, solidPro: 10, contributor: 24, leagueAvg: 32, fringe: 24.65 },
    guarantee: 'solidPro',
    blurb: '7 cards. Guaranteed a Solid Pro or better — a step up from Bronze.',
  },
  gold: {
    kind: 'gold', name: 'Gold Pack', size: 7, price: 2500,
    weights: { greatest: 0.6, elite: 4, star: 12, solidPro: 15, contributor: 26, leagueAvg: 26, fringe: 16.4 },
    guarantee: 'solidPro',
    blurb: '7 cards. Guaranteed a Solid Pro or better — better Star/Elite odds.',
  },
  platinum: {
    kind: 'platinum', name: 'Platinum Pack', size: 7, price: 5000,
    weights: { greatest: 1.8, elite: 10, star: 26, solidPro: 20, contributor: 24, leagueAvg: 12, fringe: 6.2 },
    guarantee: 'star',
    blurb: '7 cards. Guaranteed a Star or better — best shot at an All-Time card.',
  },
};

export const STORE_ORDER: PackKind[] = ['bronze', 'silver', 'gold', 'platinum'];

// ── Free-pack cadence ───────────────────────────────────────────────────────
export const FREE_PACK_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // every week

/** ms until the next free pack is claimable (0 = claimable now). */
export function freePackCooldownMs(lastFreeAt: Date | null, now: Date): number {
  if (!lastFreeAt) return 0;
  const elapsed = now.getTime() - lastFreeAt.getTime();
  return Math.max(0, FREE_PACK_INTERVAL_MS - elapsed);
}

// ── Match rewards ───────────────────────────────────────────────────────────
//
// Coins earned per draft match, scaling with the record so a better squad pays
// out more — the reason to keep pulling and building. A ~9-3 tops up toward the
// next Bronze; a 12-0 is a jackpot.
export function matchReward(wins: number): number {
  // 0 wins → 20 (participation), 12-0 → 600. Convex so top records feel great.
  const base = 20;
  const perWin = 12;
  const bonus = wins >= 12 ? 300 : wins >= 11 ? 150 : wins >= 10 ? 60 : 0;
  return base + wins * perWin + bonus;
}

// ── Starter grant (new wallet) ──────────────────────────────────────────────
export const STARTER_COINS = 500; // enough for a Bronze pack out of the gate

// ── Tier-roll helper (deterministic given an rng) ───────────────────────────
//
// Rolls a tier from a weight map. `rng` must return [0,1). Kept pure so the
// server RPC and any client preview share identical logic.
export function rollTier(weights: Record<CardTier, number>, rng: () => number): CardTier {
  const entries = TIERS.map((t) => [t.key, weights[t.key] ?? 0] as const);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [key, w] of entries) {
    r -= w;
    if (r < 0) return key as CardTier;
  }
  return 'fringe';
}

// UTCG Rivals — unstaked async PvP with weekly point tiers (pure types +
// display mirrors). Server-authoritative: utcg_rivals_enter / _cancel / _claim
// (migration 20260930200000). Win 3, draw 1, loss 0 — for both sides, so a
// parked squad scores while you're away. Tiers pay untradeable reward packs,
// each claimable once, this ISO week or last.

import type { PackKind } from './packs';

/** Points per Rivals result, for both challenger and parked defender. */
export const RIVALS_POINTS = { win: 3, draw: 1, loss: 0 } as const;

export const RIVALS_TIERS: { tier: number; points: number; pack: PackKind }[] = [
  { tier: 1, points: 6, pack: 'bronze' },
  { tier: 2, points: 15, pack: 'silver' },
  { tier: 3, points: 30, pack: 'gold' },
];

/** Highest tier reached for a points total (0 = none). */
export function rivalsTier(points: number): number {
  return RIVALS_TIERS.filter((t) => points >= t.points).reduce((m, t) => Math.max(m, t.tier), 0);
}

export interface RivalsWeek {
  weekKey: string;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  claimedTier: number;
  /** A squad of ours is parked, waiting for a challenger. */
  openSquad: boolean;
  /** Last week's result while its tiers can still be claimed. */
  lastWeek: { weekKey: string; points: number; claimedTier: number } | null;
}

export function mapRivalsWeek(raw: Record<string, unknown> | null | undefined): RivalsWeek | null {
  if (!raw) return null;
  const lw = raw.last_week as Record<string, unknown> | null;
  return {
    weekKey: String(raw.week_key),
    points: Number(raw.points),
    wins: Number(raw.wins),
    draws: Number(raw.draws),
    losses: Number(raw.losses),
    claimedTier: Number(raw.claimed_tier),
    openSquad: Boolean(raw.open_squad),
    lastWeek: lw
      ? { weekKey: String(lw.week_key), points: Number(lw.points), claimedTier: Number(lw.claimed_tier) }
      : null,
  };
}

export type RivalsOutcome =
  | { status: 'queued'; chem: number; strength: number }
  | {
      status: 'resolved';
      matchId: string;
      /** Whose squad won, from the challenger's (our) perspective. */
      outcome: 'challenger' | 'defender' | 'draw';
      decidedBy: 'strength' | 'chem' | 'mean' | 'draw';
      chem: number;
      strength: number;
      opponentChem: number;
      opponentStrength: number;
      weekPoints: number;
    };

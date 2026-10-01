// UTCG card sinks + collection goals (pure types + display mirrors).
//
// Server-authoritative (migration 20260930190000): SBC board
// (utcg_sbc_submit), collection milestones (utcg_claim_milestone), crafting
// with pack points (utcg_craft_card), pity in utcg_roll_pack. Every reward
// here is untradeable.

import { TIERS, quicksellValue, type PackKind } from './packs';
import type { UtcgCard } from './data';

export const PACK_POINTS_PER_PACK = 25; // bought + free packs only
/** The Nth pack without an All-Time Elite+ card upgrades its last pull. */
export const PITY_PACKS = 40;
export const TEAM_SET_SIZE = 10;
export const TEAM_SET_PACK: PackKind = 'silver';
export const DISTINCT_MILESTONES: { threshold: number; pack: PackKind }[] = [
  { threshold: 25, pack: 'bronze' },
  { threshold: 50, pack: 'silver' },
  { threshold: 100, pack: 'gold' },
  { threshold: 200, pack: 'gold' },
  { threshold: 400, pack: 'platinum' },
];

/** Pack points to craft a card: 2× its quicksell value (utcg_craft_cost). */
export function craftCost(card: UtcgCard): number {
  return 2 * quicksellValue(card.playerScore);
}

/** tier_rank (1 fringe … 7 greatest) for a score, matching utcg_tier_rank. */
export function tierRank(score: number): number {
  return TIERS.length - TIERS.findIndex((t) => score >= t.min);
}

export interface SbcRequirements {
  count: number;
  min_avg?: number;
  min_rank?: number;
  max_rank?: number;
  min_teams?: number;
  max_teams?: number;
  same_team?: boolean;
  min_year?: number;
  max_year?: number;
  rank_at_least?: { rank: number; count: number };
}

export interface Sbc {
  key: string;
  name: string;
  description: string;
  requirements: SbcRequirements;
  /** A pack kind, or 'totw' for the TOTW Upgrade (grants a card, no pack). */
  rewardPack: PackKind | 'totw';
  repeatable: boolean;
  weeklyLimit: number | null;
  completed: boolean;
  doneThisWeek: number;
}

/** Mirror of utcg_sbc_submit's checks — one entry per copy handed in. */
export function sbcMet(req: SbcRequirements, cards: UtcgCard[]): boolean {
  if (cards.length !== req.count) return false;
  const ranks = cards.map((c) => tierRank(c.playerScore));
  const avg = cards.reduce((s, c) => s + c.playerScore, 0) / cards.length;
  const teams = new Set(cards.map((c) => c.teamSlug)).size;
  const years = cards.map((c) => c.year);
  return (
    (req.min_avg === undefined || avg >= req.min_avg) &&
    (req.min_rank === undefined || Math.min(...ranks) >= req.min_rank) &&
    (req.max_rank === undefined || Math.max(...ranks) <= req.max_rank) &&
    (req.min_teams === undefined || teams >= req.min_teams) &&
    (req.max_teams === undefined || teams <= req.max_teams) &&
    (!req.same_team || teams === 1) &&
    (req.min_year === undefined || Math.min(...years) >= req.min_year) &&
    (req.max_year === undefined || Math.max(...years) <= req.max_year) &&
    (req.rank_at_least === undefined ||
      ranks.filter((r) => r >= req.rank_at_least!.rank).length >= req.rank_at_least.count)
  );
}

export interface TeamSetProgress {
  teamSlug: string;
  year: number;
  have: number;
}

export interface CollectionState {
  sbcs: Sbc[];
  distinctCards: number;
  /** 'distinct:25', 'team_set:glory:2022', … */
  milestonesClaimed: string[];
  /** Team-seasons with 5+ distinct players owned (top 12). */
  teamSets: TeamSetProgress[];
  packPoints: number;
  pityCounter: number;
}

export function mapCollectionState(raw: Record<string, unknown> | null): CollectionState | null {
  if (!raw) return null;
  return {
    sbcs: ((raw.sbcs ?? []) as Record<string, unknown>[]).map((s) => ({
      key: String(s.key),
      name: String(s.name),
      description: String(s.description),
      requirements: s.requirements as SbcRequirements,
      rewardPack: s.reward_pack as Sbc['rewardPack'],
      repeatable: Boolean(s.repeatable),
      weeklyLimit: s.weekly_limit === null || s.weekly_limit === undefined ? null : Number(s.weekly_limit),
      completed: Boolean(s.completed),
      doneThisWeek: Number(s.done_this_week),
    })),
    distinctCards: Number(raw.distinct_cards ?? 0),
    milestonesClaimed: ((raw.milestones_claimed ?? []) as string[]).map(String),
    teamSets: ((raw.team_sets ?? []) as Record<string, unknown>[]).map((t) => ({
      teamSlug: String(t.team_slug),
      year: Number(t.year),
      have: Number(t.have),
    })),
    packPoints: Number(raw.pack_points ?? 0),
    pityCounter: Number(raw.pity_counter ?? 0),
  };
}

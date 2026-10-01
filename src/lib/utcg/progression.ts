// UTCG progression — daily/weekly objectives, play streak, season track and
// unopened reward packs (pure types + display mirrors, shared client/server).
//
// The server owns every rule (utcg_on_game_finished, utcg_add_xp,
// utcg_claim_objective — migration 20260930170000). One bounded read,
// utcg_progress_state(), feeds the page; these mirrors are display-only.

import type { PackKind } from './packs';

export const SEASON_XP_PER_LEVEL = 150;
export const SEASON_MAX_LEVEL = 30;
/** XP per finished game, for the first XP_GAMES_PER_DAY games each UTC day. */
export const XP_PER_GAME = 5;
export const XP_GAMES_PER_DAY = 10;
export const MAX_STREAK_FREEZES = 2;

/** Mirror of utcg_season_level_reward: every level pays 20 coins; some add an
 *  untradeable reward pack. */
export function seasonLevelReward(level: number): { coins: number; pack: PackKind | null } {
  const packs: Record<number, PackKind> = { 5: 'bronze', 10: 'silver', 15: 'bronze', 20: 'silver', 25: 'gold', 30: 'gold' };
  return { coins: 20, pack: packs[level] ?? null };
}

/** Mirror of the streak milestones in utcg_on_game_finished. */
export function streakMilestone(days: number): { coins: number; pack: PackKind | null; freeze: boolean } | null {
  if (days === 3) return { coins: 50, pack: null, freeze: false };
  if (days === 7) return { coins: 0, pack: 'bronze', freeze: true };
  if (days === 14) return { coins: 0, pack: 'silver', freeze: true };
  if (days > 0 && days % 30 === 0) return { coins: 0, pack: 'gold', freeze: true };
  return null;
}

/** Squad Battle pay multiplier for the Nth match of the UTC day (1-based);
 *  mirror of utcg_record_match. Matches past 10 pay nothing. */
export function matchPayMultiplier(nth: number): number {
  if (nth <= 3) return 1;
  if (nth <= 6) return 0.5;
  if (nth <= 10) return 0.25;
  return 0;
}

export interface Objective {
  key: string;
  period: 'daily' | 'weekly';
  slot: number;
  label: string;
  target: number;
  progress: number;
  rewardCoins: number;
  rewardXp: number;
  /** Claims go to this period ('d:2026-09-30' / 'w:2026-W40'). */
  periodKey: string;
  completed: boolean;
  claimed: boolean;
}

export interface SeasonProgress {
  id: number;
  name: string;
  startsOn: string;
  /** Exclusive end date (YYYY-MM-DD). */
  endsOn: string;
  xp: number;
  level: number;
}

export interface Streak {
  /** Current streak (0 once it has lapsed beyond the banked freezes). */
  days: number;
  best: number;
  freezes: number;
  playedToday: boolean;
}

export interface RewardPack {
  id: string;
  packKind: PackKind;
  /** Where it came from, e.g. 'season:1:L5', 'streak:7', 'brawl:2026-W40'. */
  source: string;
  grantedAt: string;
}

export interface ProgressState {
  objectives: Objective[];
  season: SeasonProgress | null;
  streak: Streak | null;
  rewardPacks: RewardPack[];
}

export function mapProgressState(raw: Record<string, unknown> | null): ProgressState | null {
  if (!raw) return null;
  const objectives = ((raw.objectives ?? []) as Record<string, unknown>[]).map((o) => ({
    key: String(o.key),
    period: o.period as Objective['period'],
    slot: Number(o.slot),
    label: String(o.label),
    target: Number(o.target),
    progress: Number(o.progress),
    rewardCoins: Number(o.reward_coins),
    rewardXp: Number(o.reward_xp),
    periodKey: String(o.period_key),
    completed: Boolean(o.completed),
    claimed: Boolean(o.claimed),
  }));
  const s = raw.season as Record<string, unknown> | null;
  const k = raw.streak as Record<string, unknown> | null;
  return {
    objectives,
    season: s
      ? {
          id: Number(s.id),
          name: String(s.name),
          startsOn: String(s.starts_on),
          endsOn: String(s.ends_on),
          xp: Number(s.xp),
          level: Number(s.level),
        }
      : null,
    streak: k
      ? { days: Number(k.days), best: Number(k.best), freezes: Number(k.freezes), playedToday: Boolean(k.played_today) }
      : null,
    rewardPacks: ((raw.reward_packs ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      packKind: r.pack_kind as PackKind,
      source: String(r.source),
      grantedAt: String(r.granted_at),
    })),
  };
}

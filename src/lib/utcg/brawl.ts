// UTCG Weekly Brawl + Featured Boss (pure types + display mirrors).
//
// Server-authoritative (utcg_brawl_play / utcg_boss_play, migrations
// 20260930180000 + 181000). The Brawl rule rotates by ISO week; the boss is a
// real UFA team-season's best 7. First win of the week in each pays an
// untradeable reward pack (Brawl: Bronze, Boss: Silver). Plays pay no coins.

import type { PackKind } from './packs';
import type { UtcgCard } from './data';
import { mapRivalsWeek, type RivalsWeek } from './rivals';

export type BrawlRuleKey = 'max_85' | 'one_team' | 'throwback' | 'seven_teams' | 'one_division' | 'new_school';

export const BRAWL_FIRST_WIN_PACK: PackKind = 'bronze';
export const BOSS_FIRST_WIN_PACK: PackKind = 'silver';

/** Mirror of utcg_brawl_check — client-side legality for instant feedback. */
export function brawlSquadLegal(rule: BrawlRuleKey, cards: UtcgCard[]): boolean {
  if (cards.length !== 7) return false;
  const teams = new Set(cards.map((c) => c.teamSlug));
  switch (rule) {
    case 'max_85':
      return cards.every((c) => c.playerScore <= 85);
    case 'one_team':
      return teams.size === 1;
    case 'throwback':
      return cards.every((c) => c.year <= 2019);
    case 'seven_teams':
      return teams.size === 7;
    case 'one_division': {
      const divs = new Set(cards.map((c) => c.division));
      return divs.size === 1 && !divs.has(null);
    }
    case 'new_school':
      return cards.every((c) => c.year >= 2023);
  }
}

export interface BrawlWeek {
  rule: BrawlRuleKey;
  label: string;
  description: string;
  /** Squad strength needed to clear the Brawl this week. */
  target: number;
  plays: number;
  bestStrength: number | null;
  won: boolean;
}

export interface BossCard {
  playerId: string;
  teamSlug: string;
  year: number;
  name: string;
  score: number;
  position: 'handler' | 'cutter' | 'hybrid';
}

export interface BossWeek {
  teamSlug: string;
  teamAbbr: string;
  year: number;
  formation: string;
  cards: BossCard[];
  /** Beat this (strictly) to win. */
  strength: number;
  chem: number;
  plays: number;
  bestStrength: number | null;
  won: boolean;
}

export interface WeeklyState {
  weekKey: string;
  brawl: BrawlWeek;
  boss: BossWeek | null;
  rivals: RivalsWeek | null;
}

export function mapWeeklyState(raw: Record<string, unknown> | null): WeeklyState | null {
  if (!raw) return null;
  const b = raw.brawl as Record<string, unknown>;
  const x = raw.boss as Record<string, unknown> | null;
  return {
    weekKey: String(raw.week_key),
    brawl: {
      rule: b.rule as BrawlRuleKey,
      label: String(b.label),
      description: String(b.description),
      target: Number(b.target),
      plays: Number(b.plays),
      bestStrength: b.best_strength === null || b.best_strength === undefined ? null : Number(b.best_strength),
      won: Boolean(b.won),
    },
    boss: x
      ? {
          teamSlug: String(x.team_slug),
          teamAbbr: String(x.team_abbr),
          year: Number(x.year),
          formation: String(x.formation),
          cards: ((x.cards ?? []) as Record<string, unknown>[]).map((c) => ({
            playerId: String(c.player_id),
            teamSlug: String(c.team_slug),
            year: Number(c.year),
            name: String(c.name),
            score: Number(c.score),
            position: c.position as BossCard['position'],
          })),
          strength: Number(x.strength),
          chem: Number(x.chem),
          plays: Number(x.plays),
          bestStrength: x.best_strength === null || x.best_strength === undefined ? null : Number(x.best_strength),
          won: Boolean(x.won),
        }
      : null,
    rivals: mapRivalsWeek(raw.rivals as Record<string, unknown> | null),
  };
}

/** Result of one Brawl or Boss play. */
export interface WeeklyPlayResult {
  won: boolean;
  strength: number;
  chem: number;
  /** Brawl target or boss strength. */
  bar: number;
  /** Set only on the first win of the week — the reward pack to open. */
  rewardPackId: string | null;
}

// Fantasy GAME registry — the hub's card data. A "game" is the user-facing
// name for a `competition` (see competitions.ts, which owns the DB-facing
// CompetitionId/CompetitionDef and stays the source of truth for scoring
// mode, player pool, etc.). This module adds presentation-only fields the
// hub/game-home pages need: card copy, status, badge, brand mark.
//
// Statuses (Hunter, 2026-08-27): ufa + usau-club-nationals='live' (Club Nats
// activated same day — leagues can form now; drafting is window-gated, see
// draftOpensDate below), usau-college-nationals / pul / wul='coming-soon',
// wfdf-wucc='hidden' (stays test-only until Hunter lifts the flag — mirrors
// competitions.ts' testOnly on wfdf-wucc).

import type { CompetitionId } from './competitions';

export type GameStatus = 'live' | 'coming-soon' | 'hidden';

export interface GameDef {
  id: CompetitionId;
  /** Card + page title ("UFA Fantasy"). */
  name: string;
  /** One-line card description. */
  blurb: string;
  status: GameStatus;
  /** Small pill on the card ("Beta"), if any. */
  badge?: string;
  /** Brand mark in /public. */
  logoSrc: string;
  /** Tailwind-safe accent token for the card's wash/border (existing design
   *  tokens only — no per-game hex values). */
  accent: 'accent' | 'ink';
}

export const GAMES: GameDef[] = [
  {
    id: 'ufa',
    name: 'UFA Fantasy',
    blurb: 'Season-long fantasy for the UFA — draft, set your lineup, outscore your friends.',
    status: 'live',
    badge: 'Beta',
    logoSrc: '/UFA-red.png',
    accent: 'accent',
  },
  {
    id: 'usau-club-nationals',
    name: 'Club Nationals Fantasy',
    blurb: 'One-weekend fantasy for USAU Club Nationals.',
    status: 'live',
    logoSrc: '/USAU-logo.png',
    accent: 'ink',
  },
  {
    id: 'usau-college-nationals',
    name: 'College Nationals Fantasy',
    blurb: 'One-weekend fantasy for USAU College Nationals.',
    status: 'coming-soon',
    logoSrc: '/USAU-logo.png',
    accent: 'ink',
  },
  {
    id: 'pul',
    name: 'PUL Fantasy',
    blurb: 'Season-long fantasy for the Premier Ultimate League.',
    status: 'coming-soon',
    logoSrc: '/PUL.webp',
    accent: 'ink',
  },
  {
    id: 'wul',
    name: 'WUL Fantasy',
    blurb: 'Season-long fantasy for the WUL.',
    status: 'coming-soon',
    logoSrc: '/WUL-logo.jpeg',
    accent: 'ink',
  },
  {
    id: 'wfdf-wucc',
    name: 'WFDF Fantasy',
    blurb: 'Fantasy for WFDF Worlds events.',
    status: 'hidden',
    logoSrc: '/WFDF_Logo.webp',
    accent: 'ink',
  },
];

const BY_ID = new Map(GAMES.map((g) => [g.id, g]));

export function getGame(id: string): GameDef | null {
  return BY_ID.get(id as CompetitionId) ?? null;
}

/** Cards the hub renders — hidden games excluded entirely. */
export function hubGames(): GameDef[] {
  return GAMES.filter((g) => g.status !== 'hidden');
}

/**
 * When drafts open for an event-mode contest: the Saturday strictly before
 * the event's start date (rosters are published by then — Hunter's rule,
 * 2026-08-27). Pure calendar math on a 'YYYY-MM-DD' date; returns the same
 * shape. MIRRORS public.fantasy_draft_earliest_at (migration 20260827100000),
 * which enforces this (at midnight ET) in fantasy_schedule_draft /
 * fantasy_start_draft — keep both in lockstep. Display-only on this side.
 */
export function draftOpensDate(eventStartDate: string): string {
  const [y, m, d] = eventStartDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12)); // noon avoids DST edges
  dt.setUTCDate(dt.getUTCDate() - (dt.getUTCDay() + 1)); // Sat strictly before
  return dt.toISOString().slice(0, 10);
}

/** "Sat, Oct 17" for a 'YYYY-MM-DD' date (calendar date, no timezone). */
export function formatDateOnly(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

// Pure server-safe league-param helpers. No React, no 'use client'.
//
// The hook that wraps these (useLeague) lives in ./use-league.ts and
// imports DEFAULT_LEAGUE + parseLeagueParam from here. Server Components
// (e.g. /teams/page.tsx) can also import directly without dragging in
// the client runtime.

import type { LeagueId } from '@/lib/data';

const VALID: LeagueId[] = ['ufa', 'usau', 'pul', 'intl'];

export const DEFAULT_LEAGUE: LeagueId = 'ufa';

// ─── USAU gender division filter ──────────────────────────────────────
// Persisted as ?div=men|women|mixed in the URL. Defaults to 'men' so
// existing links keep working. We map the URL value to the canonical
// 'Men' | 'Women' | 'Mixed' string that's stored on usau_teams.

export type UsauDivision = 'Men' | 'Women' | 'Mixed';
export const DEFAULT_DIVISION: UsauDivision = 'Men';
const VALID_DIVISIONS: UsauDivision[] = ['Men', 'Women', 'Mixed'];

export function parseDivisionParam(value: string | null | undefined): UsauDivision {
  if (!value) return DEFAULT_DIVISION;
  const normalized = value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
  return (VALID_DIVISIONS as string[]).includes(normalized)
    ? (normalized as UsauDivision)
    : DEFAULT_DIVISION;
}

// ─── USAU competition-level filter ─────────────────────────────────────
// Persisted as ?level=club|college-d1|college-d3|masters|grand-masters in
// the URL. Maps to the canonical enum value stored on usau_teams /
// usau_events.competition_level.
//
// 'club' is the default so existing links continue to land on Club teams.

export type UsauLevel = 'CLUB' | 'COLLEGE_D1' | 'COLLEGE_D3' | 'MASTERS' | 'GRAND_MASTERS';
export const DEFAULT_LEVEL: UsauLevel = 'CLUB';
const LEVEL_FROM_PARAM: Record<string, UsauLevel> = {
  club: 'CLUB',
  'college-d1': 'COLLEGE_D1',
  'college-d3': 'COLLEGE_D3',
  masters: 'MASTERS',
  'grand-masters': 'GRAND_MASTERS',
};
const PARAM_FROM_LEVEL: Record<UsauLevel, string> = {
  CLUB: 'club',
  COLLEGE_D1: 'college-d1',
  COLLEGE_D3: 'college-d3',
  MASTERS: 'masters',
  GRAND_MASTERS: 'grand-masters',
};
const LEVEL_LABELS: Record<UsauLevel, string> = {
  CLUB: 'Club',
  COLLEGE_D1: 'College D-I',
  COLLEGE_D3: 'College D-III',
  MASTERS: 'Masters',
  GRAND_MASTERS: 'Grand Masters',
};

export function parseLevelParam(value: string | null | undefined): UsauLevel {
  if (!value) return DEFAULT_LEVEL;
  return LEVEL_FROM_PARAM[value.toLowerCase()] ?? DEFAULT_LEVEL;
}

export function levelToParam(level: UsauLevel): string {
  return PARAM_FROM_LEVEL[level];
}

export function levelLabel(level: UsauLevel): string {
  return LEVEL_LABELS[level];
}

export const USAU_LEVELS: UsauLevel[] = ['CLUB', 'COLLEGE_D1', 'COLLEGE_D3', 'MASTERS', 'GRAND_MASTERS'];

/**
 * Build the league + division query string, omitting params that match
 * the default so URLs stay clean (`?league=ufa&div=men` collapses to
 * an empty query). Pass `null` for either to drop it entirely.
 */
export function buildLeagueQs(
  league: LeagueId | null | undefined,
  division: UsauDivision | null | undefined,
): string {
  const params = new URLSearchParams();
  if (league && league !== DEFAULT_LEAGUE) params.set('league', league);
  // Division only matters for USAU. Skip it for UFA links.
  if (league === 'usau' && division && division !== DEFAULT_DIVISION) {
    params.set('div', division.toLowerCase());
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function parseLeagueParam(value: string | null | undefined): LeagueId {
  if (!value) return DEFAULT_LEAGUE;
  return (VALID as string[]).includes(value) ? (value as LeagueId) : DEFAULT_LEAGUE;
}

/**
 * Infer the active league from a pathname. USAU-specific routes
 * (/usau/*, /players/{uuid}) imply the USAU tab should be active even if
 * the URL has no `?league=` param. Returns null when the path doesn't
 * pin a league — caller can then fall back to the query param or default.
 */
export function inferLeagueFromPath(pathname: string | null | undefined): LeagueId | null {
  if (!pathname) return null;
  if (pathname.startsWith('/usau/')) return 'usau';
  // /players/{id} — UUID shape could be either a USAU player or a PUL player
  // (both leagues use v4 UUIDs as player ids). We return 'usau' here so the
  // nav tab highlights correctly for the common case; the actual anchor
  // disambiguation (USAU vs PUL) is handled inside getUnifiedPlayerProfile,
  // which tries USAU first and falls back to PUL on a miss. A PUL-uuid link
  // will resolve correctly even though this function returns 'usau'.
  const playerMatch = pathname.match(/^\/players\/([^/?#]+)/);
  if (playerMatch) {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(playerMatch[1])) {
      return 'usau';
    }
  }
  return null;
}

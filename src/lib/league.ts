// Pure server-safe league-param helpers. No React, no 'use client'.
//
// The hook that wraps these (useLeague) lives in ./use-league.ts and
// imports DEFAULT_LEAGUE + parseLeagueParam from here. Server Components
// (e.g. /teams/page.tsx) can also import directly without dragging in
// the client runtime.

import type { LeagueId } from '@/lib/data';

const VALID: LeagueId[] = ['ufa', 'usau', 'intl'];

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
  // /players/{id} — UUID shape implies USAU player; non-UUID is UFA.
  const playerMatch = pathname.match(/^\/players\/([^/?#]+)/);
  if (playerMatch) {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(playerMatch[1])) {
      return 'usau';
    }
  }
  return null;
}

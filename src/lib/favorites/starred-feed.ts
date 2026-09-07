// Starred items — shared shapes + client-safe mappers for the "★ Starred"
// surfaces (home hero carousel, top of For You). The fetching lives in
// starred.ts (a server action); this module is plain so client components
// can import the types and the FeedGame/FeedTournament mapper.
// (Ported from mobile's src/lib/favorites/starred.ts — keep in sync.)

import type { UfaGame } from '@/lib/ufa/types';
import type { PulGame } from '@/lib/pul/data';
import type { WulGame } from '@/lib/wul/data';
import type { UsauEventSummary } from '@/lib/usau/data';
import type { WfdfEventCard } from '@/lib/wfdf/data';
import type { EufEventCard } from '@/lib/euf/data';
import type { FeedGame, FeedTournament } from '@/lib/for-you/live-data';
import { gameUiState } from '@/lib/ufa/format';
import { teamMeta } from '@/lib/ufa/teams';

export type StarredGameItem =
  | { league: 'ufa'; game: UfaGame; sortTs: number }
  | { league: 'pul'; game: PulGame; sortTs: number }
  | { league: 'wul'; game: WulGame; sortTs: number };

export type StarredEventItem =
  | { league: 'usau'; event: UsauEventSummary; sortTs: number }
  | { league: 'wfdf'; event: WfdfEventCard; sortTs: number }
  | { league: 'euf'; event: EufEventCard; sortTs: number };

export interface StarredItems {
  games: StarredGameItem[];
  events: StarredEventItem[];
}

export const EMPTY_STARRED: StarredItems = { games: [], events: [] };

/** Identity key shared with the home page's regular slides, so a star and the
 *  league's own pick of the same game/event never render two cards. */
export function starredGameKey(item: StarredGameItem): string {
  return item.league === 'ufa' ? `ufa:${item.game.gameID}` : `${item.league}:${item.game.id}`;
}
export function starredEventKey(item: StarredEventItem): string {
  return `${item.league}:${item.event.slug}`;
}

function whenLabel(date: Date | null, status: 'upcoming' | 'live' | 'final'): string {
  if (status === 'live') return 'Live';
  if (status === 'final') return 'Final';
  if (!date) return 'TBD';
  const full = date.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  return full.endsWith('12:00 AM') ? date.toLocaleString('en-US', { weekday: 'short' }) : full;
}

function sideName(s: { city: string | null; mascot: string | null; abbrev: string }): string {
  return [s.city, s.mascot].filter(Boolean).join(' ') || s.abbrev;
}

/** Map starred items onto the For You tiles' row shapes. favoriteTeamName is
 *  '' (the tiles hide their "Following …" line when empty) — a star is its own
 *  reason to be here. */
export function starredToFeed(items: StarredItems): { games: FeedGame[]; tournaments: FeedTournament[] } {
  const games: FeedGame[] = items.games.map((item) => {
    if (item.league === 'ufa') {
      const g = item.game;
      const s = gameUiState(g);
      const status = s.isLive ? 'live' : s.isFinal ? 'final' : 'upcoming';
      const date = g.startTimestamp ? new Date(g.startTimestamp) : null;
      return {
        id: `star-ufa-${g.gameID}`,
        league: 'ufa',
        status,
        away: { name: `${g.awayTeamCity} ${g.awayTeamName}`, teamId: g.awayTeamID, score: status === 'upcoming' ? null : g.awayScore, logoUrl: teamMeta(g.awayTeamID).logo ?? null },
        home: { name: `${g.homeTeamCity} ${g.homeTeamName}`, teamId: g.homeTeamID, score: status === 'upcoming' ? null : g.homeScore, logoUrl: teamMeta(g.homeTeamID).logo ?? null },
        when: whenLabel(date, status),
        favoriteTeamName: '',
        sortTs: item.sortTs,
        isPreview: false,
      };
    }
    const g = item.game;
    const status = g.status === 'final' ? 'final' : 'upcoming';
    const date = g.gameDate ? new Date(g.gameDate + 'T00:00:00') : null;
    return {
      id: `star-${item.league}-${g.id}`,
      league: item.league,
      status,
      away: { name: sideName(g.away), teamId: g.away.teamId, score: g.away.score, logoUrl: g.away.logoUrl },
      home: { name: sideName(g.home), teamId: g.home.teamId, score: g.home.score, logoUrl: g.home.logoUrl },
      when: whenLabel(date, status),
      favoriteTeamName: '',
      sortTs: item.sortTs,
      isPreview: false,
    };
  });

  const tournaments: FeedTournament[] = items.events.map((item) => ({
    id: `star-${item.league}-${item.event.slug}`,
    league: item.league,
    name: item.event.name,
    slug: item.event.slug,
    startDate: item.event.startDate,
    placement: null,
    status: 'upcoming',
    favoriteTeamName: '',
    sortTs: item.sortTs,
  }));

  return { games, tournaments };
}

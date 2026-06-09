// League tab definitions — UFA active, USAU/INTL stubbed for season-window
// gating later. Real game/team/player data comes from src/lib/ufa/*.

export type LeagueId = 'ufa' | 'usau' | 'pul' | 'intl';

export interface League {
  id: LeagueId;
  short: string;
  long: string;
  sub: string;
  count: number;
}

export const LEAGUES: League[] = [
  { id: 'ufa',  short: 'UFA',  long: 'UFA',           sub: 'Pro · Regular season',  count: 0 },
  { id: 'usau', short: 'USAU', long: 'USAU Club',     sub: 'Series · Regionals',    count: 0 },
  { id: 'pul',  short: 'PUL',  long: 'PUL',           sub: "Women's pro · Stats",   count: 0 },
  { id: 'intl', short: 'INTL', long: 'International', sub: 'WUCC qualifiers',       count: 0 },
];

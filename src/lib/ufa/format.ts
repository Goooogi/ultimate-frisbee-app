// Pure helpers for deriving UI-ready bits from a UfaGame.

import type { UfaGame } from './types';

export interface GameUiState {
  isUpcoming: boolean;
  isLive: boolean;
  isFinal: boolean;
  hasScore: boolean;
  awayWin: boolean;
  homeWin: boolean;
  isClose: boolean;          // margin ≤ 1 and game has any score
  startDate: Date | null;
}

export function gameUiState(game: UfaGame): GameUiState {
  const status = (game.status ?? '').toLowerCase();
  const isLive = status === 'live' || status === 'in progress' || status === 'inprogress';
  const isFinal = status === 'final' || status === 'completed';
  const isUpcoming = !isLive && !isFinal;
  const hasScore = game.awayScore > 0 || game.homeScore > 0;
  const awayWin = hasScore && game.awayScore > game.homeScore;
  const homeWin = hasScore && game.homeScore > game.awayScore;
  const margin = Math.abs(game.awayScore - game.homeScore);
  const isClose = hasScore && margin <= 1 && (isLive || isFinal);
  const startDate = game.startTimestamp ? new Date(game.startTimestamp) : null;
  return { isUpcoming, isLive, isFinal, hasScore, awayWin, homeWin, isClose, startDate };
}

/** "WED, JUN 1 · 7:00 PM EDT" — designed to match the design's tabular meta strip. */
export function formatStartCompact(game: UfaGame): string {
  const d = game.startTimestamp ? new Date(game.startTimestamp) : null;
  if (!d) return 'TBD';
  const wd = d.toLocaleString('en-US', { weekday: 'short', timeZone: 'America/New_York' }).toUpperCase();
  const md = d
    .toLocaleString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })
    .toUpperCase();
  const time = d.toLocaleString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  });
  const tz = game.startTimezone ?? 'ET';
  return `${wd}, ${md} · ${time} ${tz}`;
}

/** "May 16" — designed for the Final-state meta strip. */
export function formatStartDateShort(game: UfaGame): string {
  const d = game.startTimestamp ? new Date(game.startTimestamp) : null;
  if (!d) return '';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric' });
}

/** Status label in the meta strip: "LIVE" | "UPCOMING" | "FINAL". */
export function statusLabel(state: GameUiState): string {
  if (state.isLive) return 'Live';
  if (state.isFinal) return 'Final';
  return 'Upcoming';
}

/** Right-side meta string for a card: clock-ish on live, time-of-day on upcoming, date on final. */
export function metaRight(game: UfaGame, state: GameUiState): string {
  if (state.isLive) return 'In progress';
  if (state.isFinal) return formatStartDateShort(game);
  return formatStartCompact(game);
}

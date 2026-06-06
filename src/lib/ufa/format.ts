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

// UFA timestamps are ISO strings carrying the GAME's local UTC offset, e.g.
// "2026-06-05T19:00:00-06:00" (7pm MDT). We must render date/time in THAT
// offset — not a hardcoded zone. Earlier this used America/New_York for the
// clock but labeled it with the game's tz abbreviation, so a 7pm MDT game
// showed "9:00 PM MDT". Instead of guessing an IANA zone (DST-ambiguous), we
// apply the explicit offset from the timestamp directly.
const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const WEEKDAYS = ['SUN','MON','TUE','WED','THU','FRI','SAT'];

/** Parse an ISO timestamp's offset (e.g. "-06:00") to minutes (-360). Returns
 *  null for a Z/UTC or missing offset. */
function offsetMinutes(ts: string): number | null {
  const m = ts.match(/([+-])(\d{2}):(\d{2})$/);
  if (!m) return null;
  const sign = m[1] === '-' ? -1 : 1;
  return sign * (parseInt(m[2], 10) * 60 + parseInt(m[3], 10));
}

/** Wall-clock fields of `ts` AS SEEN in its own offset (not the viewer's tz). */
function localParts(ts: string): { wd: string; mon: string; day: number; h12: number; min: number; ampm: string } | null {
  const off = offsetMinutes(ts);
  if (off == null) return null;
  const utc = new Date(ts).getTime();
  if (isNaN(utc)) return null;
  // Shift the UTC instant by the game's offset, then read UTC getters to get
  // the game-local wall clock without involving the viewer's timezone.
  const shifted = new Date(utc + off * 60_000);
  const h = shifted.getUTCHours();
  return {
    wd: WEEKDAYS[shifted.getUTCDay()],
    mon: MONTHS[shifted.getUTCMonth()],
    day: shifted.getUTCDate(),
    h12: h % 12 === 0 ? 12 : h % 12,
    min: shifted.getUTCMinutes(),
    ampm: h < 12 ? 'AM' : 'PM',
  };
}

/** "FRI, JUN 5 · 7:00 PM MDT" — in the game's own timezone. */
export function formatStartCompact(game: UfaGame): string {
  if (!game.startTimestamp) return 'TBD';
  const p = localParts(game.startTimestamp);
  if (!p) return 'TBD';
  const tz = game.startTimezone ?? 'ET';
  const time = `${p.h12}:${String(p.min).padStart(2, '0')} ${p.ampm}`;
  return `${p.wd}, ${p.mon} ${p.day} · ${time} ${tz}`;
}

/** "JUN 5" — date in the game's own timezone, for the Final-state meta strip. */
export function formatStartDateShort(game: UfaGame): string {
  if (!game.startTimestamp) return '';
  const p = localParts(game.startTimestamp);
  if (!p) return '';
  // Title-case the month (e.g. "Jun 5") to match the prior display style.
  const mon = p.mon.charAt(0) + p.mon.slice(1).toLowerCase();
  return `${mon} ${p.day}`;
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

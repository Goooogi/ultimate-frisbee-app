// Pure helpers for deriving UI-ready bits from a UfaGame.

import type { UfaGame } from './types';

export interface GameUiState {
  isUpcoming: boolean;
  isLive: boolean;
  isFinal: boolean;
  /** Cancelled / postponed / suspended — should be hidden from live feeds
   *  (hero carousel, "up next"), not treated as an in-play game. */
  isCancelled: boolean;
  hasScore: boolean;
  awayWin: boolean;
  homeWin: boolean;
  isClose: boolean;          // margin ≤ 1 and game has any score
  startDate: Date | null;
}

/** True when the game hasn't started. UFA sends "Upcoming" (also tolerate
 *  "scheduled"/"pre game" defensively). */
export function isUpcomingStatus(status: string | null | undefined): boolean {
  const s = (status ?? '').toLowerCase().trim();
  return s === '' || s === 'upcoming' || s === 'scheduled' || s === 'pre game' || s === 'pregame';
}

/** True when the game is over. */
export function isFinalStatus(status: string | null | undefined): boolean {
  const s = (status ?? '').toLowerCase().trim();
  return s === 'final' || s === 'completed' || s === 'forfeit';
}

/** True when the game was cancelled / postponed / suspended and should NOT show
 *  as live or upcoming. Matched defensively (both US/UK spellings + variants)
 *  since UFA's status is a free-text phase string, not an enum. CRITICAL: this
 *  must be checked BEFORE isLiveStatus — live is defined by exclusion, so a
 *  cancelled game would otherwise read as "in play" and leak into the hero. */
export function isCancelledStatus(status: string | null | undefined): boolean {
  const s = (status ?? '').toLowerCase().trim();
  return (
    s.includes('cancel') ||   // "Cancelled" / "Canceled"
    s.includes('postpon') ||  // "Postponed"
    s.includes('suspend')     // "Suspended"
  );
}

/** True when the game is in play. UFA has NO literal "Live" status — it sends
 *  the current phase ("First Quarter", "Halftime", "Fourth Quarter",
 *  "Overtime", …). So live = anything that is neither upcoming, final, NOR
 *  cancelled. Defined by exclusion so new/unseen phase strings still read as
 *  live — but cancelled/postponed must be excluded or they masquerade as live. */
export function isLiveStatus(status: string | null | undefined): boolean {
  return !isUpcomingStatus(status) && !isFinalStatus(status) && !isCancelledStatus(status);
}

export function gameUiState(game: UfaGame): GameUiState {
  const isCancelled = isCancelledStatus(game.status);
  const isLive = isLiveStatus(game.status);
  const isFinal = isFinalStatus(game.status);
  const isUpcoming = isUpcomingStatus(game.status);
  const hasScore = game.awayScore > 0 || game.homeScore > 0;
  const awayWin = hasScore && game.awayScore > game.homeScore;
  const homeWin = hasScore && game.homeScore > game.awayScore;
  const margin = Math.abs(game.awayScore - game.homeScore);
  const isClose = hasScore && margin <= 1 && (isLive || isFinal);
  const startDate = game.startTimestamp ? new Date(game.startTimestamp) : null;
  return { isUpcoming, isLive, isFinal, isCancelled, hasScore, awayWin, homeWin, isClose, startDate };
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

/** Compact live-phase label from UFA's status string. UFA's granularity is the
 *  quarter (there is no game clock / time-remaining in the feed), so we surface
 *  the phase: "1st Quarter" → "Q1", "Halftime" → "HALF", "Overtime" → "OT".
 *  Unknown live phases fall back to the raw status, then "LIVE". */
export function livePhaseLabel(status: string | null | undefined): string {
  const s = (status ?? '').toLowerCase().trim();
  const q = s.match(/(first|second|third|fourth|1st|2nd|3rd|4th)\s+quarter/);
  if (q) {
    const map: Record<string, string> = {
      first: 'Q1', '1st': 'Q1', second: 'Q2', '2nd': 'Q2',
      third: 'Q3', '3rd': 'Q3', fourth: 'Q4', '4th': 'Q4',
    };
    return map[q[1]] ?? 'LIVE';
  }
  if (s.includes('halftime') || s === 'half') return 'HALF';
  if (s.includes('overtime') || s === 'ot') return 'OT';
  return status ? status.toUpperCase() : 'LIVE';
}

/** Right-side meta string for a card: live phase (e.g. "Q4") on live,
 *  time-of-day on upcoming, date on final. */
export function metaRight(game: UfaGame, state: GameUiState): string {
  if (state.isLive) return livePhaseLabel(game.status);
  if (state.isFinal) return formatStartDateShort(game);
  return formatStartCompact(game);
}

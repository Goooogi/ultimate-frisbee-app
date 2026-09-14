// Home-page season phase — ONE answer per league to "where is this league in
// its year?", so every home section gates on the same rule instead of five
// ad-hoc notions of "current" (calendar year, newest season in the table,
// newest completed event…).
//
//   in-season  → a game is live, results exist after the last final (a new
//                season has started), or the next game/event is imminent
//                (within UPCOMING_HORIZON_DAYS). "Recent results" shows it.
//   complete   → the last final is decided and within COMPLETE_WINDOW_DAYS.
//                "Season complete" shows it.
//   dormant    → neither. The league drops out of both sections.
//
// A published-but-distant schedule (UFA publishes in January, first game in
// April) deliberately does NOT count as in-season: it would drop the champion
// card months before there is anything to replace it.
//
// Pure functions over data the page already fetches — no I/O here.

import type { UfaGame } from '@/lib/ufa/types';
import { gameUiState } from '@/lib/ufa/format';
import { ufaPlayoffGames } from '@/lib/ufa/game-of-the-week';
import type { PulGame } from '@/lib/pul/data';
import type { WulGame } from '@/lib/wul/data';
import { deriveWulPostseasonRounds } from '@/lib/wul/data';
import type { UsauMajorWithChampions, UpcomingUsauEvent } from '@/lib/usau/data';
import { usauToday } from '@/lib/today';

export type SeasonPhase = 'in-season' | 'complete' | 'dormant';

export interface LeaguePhase {
  phase: SeasonPhase;
  /** yyyy-mm-dd of the decided title game / final, null when none is known. */
  lastFinalDate: string | null;
  /** yyyy-mm-dd of the next scheduled game / event start, null when none. */
  nextDate: string | null;
}

/** "6 months past the final" — Hunter's expiry for a finished season. */
export const COMPLETE_WINDOW_DAYS = 183;
/** How close the next game/event must be to count as in-season. */
export const UPCOMING_HORIZON_DAYS = 14;
// The preview window (how far ahead hero slides / Up next look) is
// SEASON_PREVIEW_DAYS in @/lib/season-windows — wider than this on purpose.

const DAY_MS = 86400_000;

/** Server "now" for the home page. HOME_AS_OF=yyyy-mm-dd overrides it outside
 *  production so a month can be screenshotted without waiting for it. An env
 *  read, not a searchParam — the page stays ISR. */
export function homeNow(): Date {
  const asOf = process.env.HOME_AS_OF;
  if (asOf && process.env.NODE_ENV !== 'production') {
    const d = new Date(`${asOf}T12:00:00Z`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

/** Whole days from one yyyy-mm-dd to another (Eastern dates, see usauToday). */
function daysBetween(fromIso: string, toIso: string): number {
  return (Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / DAY_MS;
}

export interface PhaseSignals {
  lastFinalDate: string | null;
  hasLive: boolean;
  hasResultsAfterFinal: boolean;
  nextDate: string | null;
}

export function resolvePhase(s: PhaseSignals, now: Date): LeaguePhase {
  const base = { lastFinalDate: s.lastFinalDate, nextDate: s.nextDate };
  const today = usauToday(now);
  const nextSoon =
    s.nextDate !== null && daysBetween(today, s.nextDate) <= UPCOMING_HORIZON_DAYS;
  if (s.hasLive || s.hasResultsAfterFinal || nextSoon) return { phase: 'in-season', ...base };
  if (s.lastFinalDate !== null) {
    const age = daysBetween(s.lastFinalDate, today);
    if (age >= 0 && age <= COMPLETE_WINDOW_DAYS) return { phase: 'complete', ...base };
  }
  return { phase: 'dormant', ...base };
}

// ─── UFA ─────────────────────────────────────────────────────────────────────
// `games` may span two seasons (current year + previous year during the
// Jan–Aug fallback): the title game is the newest structural bracket's final.

/** The games of the newest season in `games` (bucketed by UTC year) whose
 *  bracket is decided; [] when none. The home pool can hold two seasons (the
 *  previous-year fallback, or next season's published schedule) and
 *  ufaPlayoffGames' week-count detection only holds within ONE season. */
export function ufaTitleSeasonGames(games: UfaGame[]): UfaGame[] {
  const byYear = new Map<number, UfaGame[]>();
  for (const g of games) {
    const y = g.startTimestamp ? new Date(g.startTimestamp).getUTCFullYear() : NaN;
    if (Number.isNaN(y)) continue;
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push(g);
  }
  for (const y of [...byYear.keys()].sort((a, b) => b - a)) {
    if (ufaPlayoffGames(byYear.get(y)!).length > 0) return byYear.get(y)!;
  }
  return [];
}

export function ufaSeasonPhase(games: UfaGame[], now: Date = new Date()): LeaguePhase {
  const title = ufaPlayoffGames(ufaTitleSeasonGames(games))[0];
  const lastFinalDate = title?.game.startTimestamp ? usauToday(new Date(title.game.startTimestamp)) : null;

  let hasLive = false;
  let hasResultsAfterFinal = false;
  let nextDate: string | null = null;
  for (const g of games) {
    const s = gameUiState(g);
    if (s.isCancelled || !g.startTimestamp) continue;
    const day = usauToday(new Date(g.startTimestamp));
    if (s.isLive) hasLive = true;
    if (s.isFinal && lastFinalDate !== null && day > lastFinalDate) hasResultsAfterFinal = true;
    if (s.isUpcoming && (nextDate === null || day < nextDate)) nextDate = day;
  }
  return resolvePhase({ lastFinalDate, hasLive, hasResultsAfterFinal, nextDate }, now);
}

// ─── PUL / WUL ───────────────────────────────────────────────────────────────
// Neither league has a live status — a game is 'scheduled' or 'final'.

interface DatedGame {
  status: 'scheduled' | 'final';
  gameDate: string | null;
}

function scheduledPhase<T extends DatedGame>(
  games: T[],
  isFinalRound: (g: T) => boolean,
  now: Date,
): LeaguePhase {
  let lastFinalDate: string | null = null;
  for (const g of games) {
    if (g.status !== 'final' || !g.gameDate || !isFinalRound(g)) continue;
    if (lastFinalDate === null || g.gameDate > lastFinalDate) lastFinalDate = g.gameDate;
  }
  let hasResultsAfterFinal = false;
  let nextDate: string | null = null;
  const today = usauToday(now);
  for (const g of games) {
    if (!g.gameDate) continue;
    if (g.status === 'final' && lastFinalDate !== null && g.gameDate > lastFinalDate) {
      hasResultsAfterFinal = true;
    }
    if (g.status === 'scheduled' && g.gameDate >= today && (nextDate === null || g.gameDate < nextDate)) {
      nextDate = g.gameDate;
    }
  }
  return resolvePhase({ lastFinalDate, hasLive: false, hasResultsAfterFinal, nextDate }, now);
}

export function pulSeasonPhase(games: PulGame[], now: Date = new Date()): LeaguePhase {
  return scheduledPhase(games, (g) => g.weekLabel === 'finals', now);
}

export function wulSeasonPhase(games: WulGame[], now: Date = new Date()): LeaguePhase {
  const rounds = deriveWulPostseasonRounds(games);
  return scheduledPhase(games, (g) => rounds.get(g.id) === 'final', now);
}

// ─── USAU ────────────────────────────────────────────────────────────────────

export function isClubNationalsName(name: string): boolean {
  const n = name.toLowerCase();
  if (/u\.?\s?s\.?\s?open|pro[- ]?championship/.test(n)) return false;
  if (/wucc|wmucc|wjuc|worlds?\b/.test(n)) return false;
  return /national championship/.test(n) || /club nationals/.test(n) || /club championship/.test(n);
}

export function isCollegeChampionshipsName(name: string): boolean {
  return /college championships/i.test(name);
}

const COLLEGE_LEVELS = new Set(['COLLEGE_D1', 'COLLEGE_D3']);

/** Club level. `majors` = recentUsauMajorsWithChampions() (newest first, CLUB);
 *  a club major newer than the last Nationals means the next season is on. */
export function usauClubSeasonPhase(
  majors: UsauMajorWithChampions[],
  upcoming: UpcomingUsauEvent[],
  now: Date = new Date(),
): LeaguePhase {
  const nationals = majors.find((m) => isClubNationalsName(m.name)) ?? null;
  const lastFinalDate = nationals?.endDate ?? null;
  const hasResultsAfterFinal =
    nationals !== null && majors.some((m) => (m.endDate ?? '') > (nationals.endDate ?? ''));
  const nextDate =
    upcoming
      .filter((e) => e.competitionLevel === 'CLUB' && e.startDate)
      .map((e) => e.startDate as string)
      .sort()[0] ?? null;
  return resolvePhase({ lastFinalDate, hasLive: false, hasResultsAfterFinal, nextDate }, now);
}

/** College level. `champs` = the College Championships (D-I + D-III) with
 *  champions, newest first. The college season has no "results after" signal
 *  in that list, so an imminent college event is what flips it in-season —
 *  but only a NEXT-season event, or a Championships still to be played (D-I
 *  runs the week after D-III, same season). Fall invitationals carry the
 *  season of the spring whose Championships already finished, and must not
 *  hide its card. */
export function usauCollegeSeasonPhase(
  champs: UsauMajorWithChampions[],
  upcoming: UpcomingUsauEvent[],
  now: Date = new Date(),
): LeaguePhase {
  const lastFinalDate =
    champs.map((c) => c.endDate ?? '').filter(Boolean).sort().reverse()[0] ?? null;
  const champSeason = Math.max(0, ...champs.map((c) => c.season ?? 0));
  const nextDate =
    upcoming
      .filter(
        (e) =>
          e.competitionLevel &&
          COLLEGE_LEVELS.has(e.competitionLevel) &&
          e.startDate &&
          e.season !== null &&
          (e.season > champSeason || isCollegeChampionshipsName(e.name)),
      )
      .map((e) => e.startDate as string)
      .sort()[0] ?? null;
  return resolvePhase({ lastFinalDate, hasLive: false, hasResultsAfterFinal: false, nextDate }, now);
}

// ─── WFDF (per event) ────────────────────────────────────────────────────────

export function wfdfEventPhase(
  event: { startDate: string | null; endDate: string | null },
  now: Date = new Date(),
): LeaguePhase {
  const today = usauToday(now);
  const start = event.startDate;
  const end = event.endDate ?? event.startDate;
  if (!end) return { phase: 'dormant', lastFinalDate: null, nextDate: start };
  const inProgress = start !== null && start <= today && end >= today;
  return resolvePhase(
    {
      lastFinalDate: end < today ? end : null,
      hasLive: inProgress,
      hasResultsAfterFinal: false,
      nextDate: start !== null && start > today ? start : null,
    },
    now,
  );
}

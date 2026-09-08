// "When does this game start?" — powers the hub's Start a League list, which
// orders games by their soonest start and prints the date. Two shapes:
//   • event games (USAU Nationals, WFDF, EUCS) → the resolved event's dates.
//     If this season's event has already ended, look at next season.
//   • season games (UFA, PUL, WUL) → the first game that hasn't been played
//     yet; when the season is over and next season isn't scheduled, TBA.
// Display-only. Nothing here gates creation — the DB draft window does that.
//
// Server-side port of the mobile app's game-dates.ts (altiusapps/
// mobileapp-thelayout · src/lib/fantasy/game-dates.ts): the web hub computes
// this in a Server Component at request time, so there's no react-query hook
// here — just the plain async functions.

import { getGamesByYears, currentSeasonYear } from '@/lib/ufa/client';
import { listPulGames, PUL_CURRENT_SEASON } from '@/lib/pul/data';
import { listWulGames, WUL_CURRENT_SEASON } from '@/lib/wul/data';
import type { CompetitionId } from './competitions';
import { getCompetition } from './competitions';
import { resolveEventForCompetition } from './leagues';
import { GAMES } from './games';
import type { GameDef } from './games';

export interface GameStart {
  /** 'YYYY-MM-DD' of the first game / event start, or null when unknown. */
  startDate: string | null;
  /** 'YYYY-MM-DD' event end (event games only). */
  endDate: string | null;
  /** Human label: the event name for tournaments, "2027 season" for leagues. */
  label: string | null;
  seasonYear: number;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function eventStart(competition: CompetitionId, year: number): Promise<GameStart> {
  const today = todayIso();
  for (const y of [year, year + 1]) {
    const ev = await resolveEventForCompetition(competition, y);
    if (!ev) continue;
    const ended = ev.endDate ? ev.endDate < today : ev.startDate ? ev.startDate < today : false;
    if (ended) continue;
    return { startDate: ev.startDate, endDate: ev.endDate, label: ev.name, seasonYear: y };
  }
  return { startDate: null, endDate: null, label: null, seasonYear: year };
}

async function ufaStart(): Promise<GameStart> {
  const year = currentSeasonYear();
  const today = todayIso();
  for (const y of [year, year + 1]) {
    // One page of 20 is enough: games come back chronologically and we only
    // need the first not-yet-played one.
    const games = await getGamesByYears([y], { limit: 20 }).catch(() => []);
    const upcoming = games
      .map((g) => g.startTimestamp?.slice(0, 10) ?? null)
      .filter((d): d is string => Boolean(d) && (d as string) >= today)
      .sort();
    if (upcoming.length > 0) {
      return { startDate: upcoming[0], endDate: null, label: `${y} season`, seasonYear: y };
    }
  }
  return { startDate: null, endDate: null, label: null, seasonYear: year + 1 };
}

async function leagueStart(
  list: (season: number) => Promise<{ gameDate: string | null }[]>,
  currentSeason: number,
): Promise<GameStart> {
  const today = todayIso();
  for (const y of [currentSeason, currentSeason + 1]) {
    const games = await list(y).catch(() => []);
    const upcoming = games
      .map((g) => g.gameDate)
      .filter((d): d is string => Boolean(d) && (d as string) >= today)
      .sort();
    if (upcoming.length > 0) {
      return { startDate: upcoming[0], endDate: null, label: `${y} season`, seasonYear: y };
    }
  }
  return { startDate: null, endDate: null, label: null, seasonYear: currentSeason + 1 };
}

export async function nextStartForGame(competition: CompetitionId): Promise<GameStart> {
  const def = getCompetition(competition);
  const year = new Date().getFullYear();
  if (!def) return { startDate: null, endDate: null, label: null, seasonYear: year };
  if (def.mode === 'event') return eventStart(competition, year);
  if (competition === 'ufa') return ufaStart();
  if (competition === 'pul') {
    return leagueStart((s) => listPulGames({ season: s }), PUL_CURRENT_SEASON);
  }
  if (competition === 'wul') {
    return leagueStart((s) => listWulGames({ season: s }), WUL_CURRENT_SEASON);
  }
  return { startDate: null, endDate: null, label: null, seasonYear: year };
}

export type GameStartMap = Partial<Record<CompetitionId, GameStart>>;

/** Every hub game's next start, resolved in parallel (one failure never hides
 *  the rest — a failed lookup reads as "Dates TBA"). */
export async function getGameStartDates(games: GameDef[] = GAMES): Promise<GameStartMap> {
  const entries = await Promise.all(
    games.map(async (g) => {
      const start = await nextStartForGame(g.id).catch(
        (): GameStart => ({ startDate: null, endDate: null, label: null, seasonYear: new Date().getFullYear() }),
      );
      return [g.id, start] as const;
    }),
  );
  const out: GameStartMap = {};
  for (const [id, start] of entries) out[id] = start;
  return out;
}

/** Sort games by soonest known start; unknown dates last, registry order
 *  preserved within each group. */
export function sortGamesBySoonest(games: GameDef[], starts: GameStartMap): GameDef[] {
  return games
    .map((g, idx) => ({ g, idx, date: starts[g.id]?.startDate ?? null }))
    .sort((a, b) => {
      if (a.date && b.date) return a.date < b.date ? -1 : a.date > b.date ? 1 : a.idx - b.idx;
      if (a.date) return -1;
      if (b.date) return 1;
      return a.idx - b.idx;
    })
    .map((x) => x.g);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Oct 22–25" · "Oct 31 – Nov 2" · "Apr 3" · "Apr 3, 2027" when not this year. */
export function formatStartRange(start: string | null, end: string | null): string {
  if (!start) return 'Dates TBA';
  const parse = (iso: string): Date => new Date(`${iso}T12:00:00Z`);
  const s = parse(start);
  if (Number.isNaN(s.getTime())) return 'Dates TBA';
  const thisYear = new Date().getFullYear();
  const yearSuffix = s.getUTCFullYear() !== thisYear ? `, ${s.getUTCFullYear()}` : '';
  const sm = MONTHS[s.getUTCMonth()];
  const sd = s.getUTCDate();
  if (!end || end === start) return `${sm} ${sd}${yearSuffix}`;
  const e = parse(end);
  if (Number.isNaN(e.getTime())) return `${sm} ${sd}${yearSuffix}`;
  const em = MONTHS[e.getUTCMonth()];
  const ed = e.getUTCDate();
  return sm === em ? `${sm} ${sd}–${ed}${yearSuffix}` : `${sm} ${sd} – ${em} ${ed}${yearSuffix}`;
}

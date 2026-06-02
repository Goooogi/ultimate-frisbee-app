// Server-side fetchers for the UFA backend.
// Components in app/ use these directly via Server Components; the browser
// (and any future React Native client) goes through /api/ufa/[...path].
//
// Verified upstream constraints (2026-05-14):
//   - max `limit` per request is 30 (35+ returns 400 "Invalid parmeters")
//   - career mode = OMIT the `year` param (sending year=all returns 400)
//   - `teamID` is an integer; pass slug-style IDs through teamInternalID()
//   - the player-stats response includes `total`, so we can paginate ourselves

import 'server-only';
import type {
  UfaBoxscorePlayerRow,
  UfaGame,
  UfaGameBoxscore,
  UfaGameStatsResponse,
  UfaGamesResponse,
  UfaPlayerGameResponse,
  UfaPlayerGameRow,
  UfaPlayerInfo,
  UfaPlayerSeasonResponse,
  UfaPlayerSeasonRow,
  UfaPlayerStat,
  UfaPlayerStatsResponse,
  UfaRosterPlayer,
  UfaRosterReportsResponse,
  UfaStanding,
  UfaTeamStat,
  UfaTeamStatsResponse,
} from './types';
import { teamInternalID } from './teams';

export const UFA_BASE = 'https://www.backend.ufastats.com/web-v1';
const UA = 'Mozilla/5.0 (the-layout)';

/** Upstream caps `limit` at 30 for player-stats / team-stats. */
export const MAX_LIMIT = 30;

/** Games endpoint has a stricter cap: max `limit=20`, and the param is REQUIRED. */
export const MAX_GAMES_LIMIT = 20;

interface CallOpts {
  revalidate: number; // seconds
  tag?: string;
}

async function call<T>(path: string, opts: CallOpts): Promise<T> {
  const res = await fetch(`${UFA_BASE}/${path}`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    next: { revalidate: opts.revalidate, tags: opts.tag ? [opts.tag] : undefined },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`UFA ${path} → HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
  }
  return (await res.json()) as T;
}

function resolveTeamID(teamID: number | string | undefined): number | undefined {
  if (teamID == null) return undefined;
  const n = teamInternalID(teamID);
  return n == null || n === 0 ? undefined : n;
}

// ── Games ────────────────────────────────────────────────────────────────────

/** Today's slate plus near-term upcoming games. Live + Upcoming + recently Final. */
export async function getCurrentGames(): Promise<UfaGame[]> {
  const data = await call<UfaGamesResponse>('games?current=true', { revalidate: 30 });
  return data.games ?? [];
}

/** Single game by gameID. The API has no /games/{id} endpoint; this filters via ?gameID=X. */
export async function getGameById(gameID: string): Promise<UfaGame | null> {
  const path = `games?gameID=${encodeURIComponent(gameID)}`;
  const data = await call<UfaGamesResponse>(path, { revalidate: 30 });
  return data.games?.[0] ?? null;
}

/** First page of games for one or more years, optionally filtered by team (slug or int).
 *  `limit` is required by upstream and capped at 20; we always pass a value. */
export async function getGamesByYears(
  years: number[],
  opts?: { teamID?: number | string; limit?: number; page?: number },
): Promise<UfaGame[]> {
  const params = new URLSearchParams({
    years: years.join(','),
    limit: String(Math.min(opts?.limit ?? MAX_GAMES_LIMIT, MAX_GAMES_LIMIT)),
  });
  const tid = resolveTeamID(opts?.teamID);
  if (tid != null) params.set('teamID', String(tid));
  if (opts?.page) params.set('page', String(opts.page));
  const data = await call<UfaGamesResponse>(`games?${params}`, { revalidate: 300 });
  return data.games ?? [];
}

/** Walk every page and return the union — for full-season schedule views.
 *  Default `maxPages=15` covers ~300 games (plenty for one UFA season + playoffs). */
export async function getAllGamesByYears(
  years: number[],
  opts?: { teamID?: number | string; maxPages?: number },
): Promise<UfaGame[]> {
  const maxPages = opts?.maxPages ?? 15;
  const out: UfaGame[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const params = new URLSearchParams({
      years: years.join(','),
      limit: String(MAX_GAMES_LIMIT),
      page: String(page),
    });
    const tid = resolveTeamID(opts?.teamID);
    if (tid != null) params.set('teamID', String(tid));
    const data = await call<UfaGamesResponse>(`games?${params}`, { revalidate: 300 });
    const rows = data.games ?? [];
    out.push(...rows);
    if (rows.length < MAX_GAMES_LIMIT) break;
  }
  return out;
}

// ── Standings ────────────────────────────────────────────────────────────────

export async function getStandings(): Promise<UfaStanding[]> {
  return call<UfaStanding[]>('standings', { revalidate: 600 });
}

// ── Player stats ─────────────────────────────────────────────────────────────

export interface PlayerStatsQuery {
  /** Specific year, or omit / pass `'career'` for all-time totals. */
  year?: number | 'career';
  per?: 'total' | 'game' | 'points' | 'possessions' | 'minutes';
  sort?: string;
  dir?: 'asc' | 'desc';
  page?: number;
  /** Capped at MAX_LIMIT (30) per upstream rules. */
  limit?: number;
  /** Slug like 'empire' or the integer ID — both work. */
  teamID?: number | string;
}

function buildPlayerStatsQuery(q: PlayerStatsQuery): URLSearchParams {
  const params = new URLSearchParams({ limit: String(Math.min(q.limit ?? 20, MAX_LIMIT)) });
  if (q.year != null && q.year !== 'career') params.set('year', String(q.year));
  if (q.per) params.set('per', q.per);
  if (q.sort) params.set('sort', q.sort);
  if (q.dir) params.set('dir', q.dir);
  if (q.page) params.set('page', String(q.page));
  const tid = resolveTeamID(q.teamID);
  if (tid != null) params.set('teamID', String(tid));
  return params;
}

export async function getPlayerStats(q: PlayerStatsQuery = {}): Promise<UfaPlayerStatsResponse> {
  const params = buildPlayerStatsQuery(q);
  return call<UfaPlayerStatsResponse>(`player-stats?${params}`, { revalidate: 3600 });
}

/**
 * Walks every page of player-stats matching the query and returns the union.
 * Upstream caps each page at 30 rows and reports `total`, so we know when to stop.
 * Cap `maxPages` to keep this from running away (default 30 pages = 900 rows).
 */
export async function getAllPlayerStats(
  q: PlayerStatsQuery = {},
  opts: { maxPages?: number } = {},
): Promise<UfaPlayerStat[]> {
  const maxPages = opts.maxPages ?? 30;
  const limit = Math.min(q.limit ?? MAX_LIMIT, MAX_LIMIT);
  const out: UfaPlayerStat[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const res = await getPlayerStats({ ...q, limit, page });
    const rows = res.stats ?? [];
    out.push(...rows);
    if (rows.length < limit) break;
    if (out.length >= res.total) break;
  }
  return out;
}

/**
 * Walk one year's leaderboard page-by-page until the target player is found
 * or every page is exhausted. Short-circuits on first match — top-ranked
 * players resolve in 1-2 pages instead of paging through the whole league.
 */
async function findPlayerInYear(
  playerID: string,
  year: number | 'career',
  maxPages = 25,
): Promise<UfaPlayerStat | null> {
  for (let page = 1; page <= maxPages; page++) {
    const res = await getPlayerStats({ year, page, limit: MAX_LIMIT });
    const found = res.stats?.find((r) => r.playerID === playerID);
    if (found) return found;
    if (!res.stats || res.stats.length < MAX_LIMIT) return null;
    if (page * MAX_LIMIT >= res.total) return null;
  }
  return null;
}

/**
 * Synthesized player profile across recent seasons + career.
 * Each year's lookup runs in parallel, and within a year we stop paging as soon
 * as the player appears — so a top-25 scorer resolves in one round trip per year.
 *
 * @deprecated Prefer getPlayerSeasons() / getPlayerGameLog() — direct endpoints,
 * no leaderboard pagination needed. Kept for callers that need the leaderboard
 * row's `name` and `teams` fields.
 */
export async function getPlayerProfile(
  playerID: string,
  years: number[],
): Promise<{
  career: UfaPlayerStat | null;
  seasons: Array<{ year: number; row: UfaPlayerStat }>;
} | null> {
  const [career, ...seasonRows] = await Promise.all([
    findPlayerInYear(playerID, 'career'),
    ...years.map((y) => findPlayerInYear(playerID, y)),
  ]);

  const seasons = seasonRows
    .map((row, i) => (row ? { year: years[i], row } : null))
    .filter((s): s is { year: number; row: UfaPlayerStat } => s != null)
    .sort((a, b) => b.year - a.year);

  if (!career && seasons.length === 0) return null;

  return { career, seasons };
}

// ── Player profile (direct endpoints) ────────────────────────────────────────
// Both undocumented; sourced from watchufa.com's player-stats Svelte bundle.
//   /web-v1/roster-stats-for-player?playerID=X
//   /web-v1/roster-game-stats-for-player?playerID=X&year=Y

/** All season rows for a player (one per year × team × regSeason flag). */
export async function getPlayerSeasons(playerID: string): Promise<UfaPlayerSeasonRow[]> {
  const path = `roster-stats-for-player?playerID=${encodeURIComponent(playerID)}`;
  const data = await call<UfaPlayerSeasonResponse>(path, { revalidate: 3600 });
  return data.stats ?? [];
}

/** Per-game breakdown for a player in one specific year. */
export async function getPlayerGameLog(playerID: string, year: number): Promise<UfaPlayerGameRow[]> {
  const path = `roster-game-stats-for-player?playerID=${encodeURIComponent(playerID)}&year=${year}`;
  const data = await call<UfaPlayerGameResponse>(path, { revalidate: 3600 });
  return data.stats ?? [];
}

/**
 * Scrape display name + current team from the watchufa.com player profile page.
 * The UFA API doesn't expose a player-info endpoint; the name lives only in
 * the Drupal HTML. Result is cached for 24h since names rarely change.
 */
export async function getPlayerInfo(playerID: string): Promise<UfaPlayerInfo | null> {
  const url = `https://www.watchufa.com/league/players/${encodeURIComponent(playerID)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
      next: { revalidate: 86400 },
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const html = await res.text();

  const nameMatch = html.match(/audl-player-display-name"[^>]*>\s*([^<]+?)\s*</);
  const teamMatch = html.match(/audl-player-current-team-position"[^>]*>\s*([^<]+?)\s*</);

  if (!nameMatch) return null;
  return {
    playerID,
    name: nameMatch[1].trim(),
    currentTeam: teamMatch ? teamMatch[1].trim() : null,
  };
}

// ── Team stats ───────────────────────────────────────────────────────────────

export interface TeamStatsQuery {
  year: number;
  perGame?: boolean;
  limit?: number;
}

export async function getTeamStats(q: TeamStatsQuery): Promise<UfaTeamStatsResponse> {
  const params = new URLSearchParams({
    year: String(q.year),
    limit: String(Math.min(q.limit ?? 25, MAX_LIMIT)),
  });
  if (q.perGame) params.set('perGame', 'true');
  return call<UfaTeamStatsResponse>(`team-stats?${params}`, { revalidate: 3600 });
}

// ── Per-game stats (single game) ─────────────────────────────────────────────
// Both endpoints are what watchufa.com's game-center uses.
//   /web-v1/game-stats?gameID=X        → team totals + 6 stat-leader categories
//   /web-v1/roster-reports?gameID=X    → roster availability + jersey numbers
//
// For Upcoming games, game-stats returns only { awayTeam, homeTeam } — callers
// should treat the rich fields as optional.

export async function getGameStats(gameID: string): Promise<UfaGameStatsResponse> {
  const path = `game-stats?gameID=${encodeURIComponent(gameID)}`;
  return call<UfaGameStatsResponse>(path, { revalidate: 30 });
}

export async function getGameRoster(gameID: string): Promise<UfaRosterReportsResponse> {
  const path = `roster-reports?gameID=${encodeURIComponent(gameID)}`;
  return call<UfaRosterReportsResponse>(path, { revalidate: 300 });
}

/** Year prefix from a gameID like "2026-05-15-MAD-PIT" → 2026. */
function yearFromGameID(gameID: string): number {
  const m = gameID.match(/^(\d{4})-/);
  return m ? Number(m[1]) : currentSeasonYear();
}

/**
 * Composes a full per-player breakdown for a single game by:
 *   1. fetching the game's roster (roster-reports)
 *   2. for every rostered player on each side, fetching their season game log
 *      (roster-game-stats-for-player) in parallel
 *   3. selecting the row matching this gameID
 *
 * Heavy on the first cold call (~70 fan-out fetches per game) but each
 * per-player game log is cached for an hour, so subsequent calls for any game
 * the same player appeared in resolve from cache.
 *
 * Per-player fetch failures degrade silently (stats = null) — we'd rather show
 * a partial table than fail the whole boxscore on one upstream hiccup.
 */
export async function getGameBoxscore(gameID: string): Promise<UfaGameBoxscore> {
  const year = yearFromGameID(gameID);
  const roster = await getGameRoster(gameID);

  const resolve = async (players: UfaRosterPlayer[]): Promise<UfaBoxscorePlayerRow[]> => {
    const rows = await Promise.all(
      players.map(async (p): Promise<UfaBoxscorePlayerRow> => {
        let stats: UfaPlayerGameRow | null = null;
        try {
          const log = await getPlayerGameLog(p.playerID, year);
          stats = log.find((r) => r.gameID === gameID) ?? null;
        } catch {
          // Soft-fail: log is missing → row shows dashes.
        }
        return {
          playerID: p.playerID,
          firstName: p.firstName,
          lastName: p.lastName,
          jerseyNumber: p.jerseyNumber,
          status: p.status,
          stats,
        };
      }),
    );
    return rows;
  };

  const [away, home] = await Promise.all([resolve(roster.away), resolve(roster.home)]);
  return { gameID, year, away, home };
}

// ── Champions ────────────────────────────────────────────────────────────────

// Game start time as a sortable number; missing timestamps sort last.
function gameTs(g: UfaGame): number {
  return g.startTimestamp ? new Date(g.startTimestamp).getTime() : -Infinity;
}

// The UFA all-star game is a non-competitive exhibition that lands in the
// final weeks of the schedule and must never be mistaken for the title game.
// It shows up as a gameID like "2025-08-23-allstar-game" / "2022-11-12-allstar-game".
function isAllStarGame(g: UfaGame): boolean {
  const id = (g.gameID ?? '').toLowerCase();
  const wk = (g.week ?? '').toLowerCase();
  return id.includes('allstar') || id.includes('all-star') || wk.includes('allstar') || wk.includes('all-star');
}

// Decided Finals only (no ties, no all-star exhibition).
function decidedFinals(games: UfaGame[]): UfaGame[] {
  return games.filter(
    (g) => g.status === 'Final' && g.awayScore !== g.homeScore && !isAllStarGame(g),
  );
}

/**
 * Identify the championship game for one fully-completed season.
 *
 * There is NO single field the UFA API exposes that marks the title game,
 * and the `week` labeling convention has changed every season:
 *   2021  week="championship-weekend"
 *   2022  week="championship-weekend" (+ "playoffs", "week-allstars")
 *   2023  week="semi-finals" / "divisional-champ" / "playoffs" (no "championship")
 *   2024  all "week-N" — no playoff label at all
 *   2025  all "week-N" (+ the all-star game)
 *
 * So we try the strongest marker available, in priority order, and fall
 * back to the structural one (last decided final in the highest week).
 * Returns the championship game, or null if none can be identified.
 */
function findChampionshipGame(games: UfaGame[]): UfaGame | null {
  const finals = decidedFinals(games);
  if (finals.length === 0) return null;

  const latest = (pool: UfaGame[]): UfaGame | null =>
    pool.length === 0 ? null : pool.reduce((a, b) => (gameTs(b) > gameTs(a) ? b : a));

  const weekIs = (g: UfaGame, ...labels: string[]) =>
    labels.includes((g.week ?? '').toLowerCase());

  // (a) Explicit "championship-weekend" label (2021, 2022) — the title game
  //     is the last decided final within it.
  const champWeekend = finals.filter((g) => weekIs(g, 'championship-weekend'));
  if (champWeekend.length > 0) return latest(champWeekend);

  // (b) Other playoff labels (2023). The final is the last decided game
  //     across the playoff-tagged weeks. 'semi-finals' here actually holds
  //     the 2023 final (UFA mislabeled it), so include it.
  const playoffLabeled = finals.filter((g) =>
    weekIs(g, 'semi-finals', 'semifinals', 'divisional-champ', 'playoffs', 'championship', 'final', 'finals'),
  );
  if (playoffLabeled.length > 0) return latest(playoffLabeled);

  // (c) No playoff labels (2024, 2025): the bracket lives in the highest
  //     week number. Take the last decided final inside that top week —
  //     that's the title game (semis are earlier in the same week).
  const weekNum = (g: UfaGame): number => {
    const m = (g.week ?? '').match(/^week-(\d+)$/);
    return m ? parseInt(m[1], 10) : -1;
  };
  const maxWeek = Math.max(...finals.map(weekNum));
  if (maxWeek >= 0) {
    const topWeek = finals.filter((g) => weekNum(g) === maxWeek);
    if (topWeek.length > 0) return latest(topWeek);
  }

  // Last resort: the latest decided final overall.
  return latest(finals);
}

/**
 * UFA champions by year. Returns a map of `year → teamID` (lowercased).
 *
 * Crucially, a champion is awarded ONLY for a season that is actually
 * complete — i.e. has zero remaining Upcoming/Live games. Mid-season the
 * "latest final played" is just a regular-season result, not a title, so
 * awarding it (the previous behavior) produced a bogus "champion" every
 * weekend. In-progress seasons are omitted from the map entirely.
 *
 * For completed seasons the title game is found via `findChampionshipGame`,
 * which copes with UFA's year-to-year `week`-labeling drift.
 */
export async function getUfaChampionsByYear(years: number[]): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  await Promise.all(
    years.map(async (year) => {
      try {
        const games = await getAllGamesByYears([year]);
        if (games.length === 0) return;

        // Gate: season must be over. If any game is still Upcoming or Live,
        // the championship hasn't been played — no champion yet.
        const seasonComplete = !games.some(
          (g) => g.status === 'Upcoming' || g.status === 'Live',
        );
        if (!seasonComplete) return;

        const finalGame = findChampionshipGame(games);
        if (!finalGame) return;

        const winner =
          finalGame.awayScore > finalGame.homeScore
            ? finalGame.awayTeamID
            : finalGame.homeTeamID;
        if (winner) result.set(year, winner.toLowerCase());
      } catch (err) {
        console.error(`getUfaChampionsByYear: failed for ${year}`, err);
      }
    }),
  );
  return result;
}

// ── Season helpers ───────────────────────────────────────────────────────────

/** Current UFA season year. Season runs ~April through August. */
export function currentSeasonYear(now: Date = new Date()): number {
  // Until the next season's schedule is published (typically January), the
  // "current" season is the year we're in.
  return now.getFullYear();
}

/** Default years dropdown — most recent down through 2022 (UFA rebrand window). */
export function recentSeasons(n: number = 5): number[] {
  const cur = currentSeasonYear();
  return Array.from({ length: n }, (_, i) => cur - i);
}

// Re-exports for convenience
export type { UfaGame, UfaPlayerStat, UfaStanding, UfaTeamStat };

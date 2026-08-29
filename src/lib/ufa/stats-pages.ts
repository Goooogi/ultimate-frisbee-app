// Fallback roster source for the per-player boxscore.
//
// WHY THIS EXISTS:
// The primary boxscore path (getGameBoxscore in ./client.ts) seeds from `/web-v1/roster-reports`,
// which covers 142/144 of the 2026 season. The gap is championship-weekend and
// all-star games — `roster-reports` returns `{home:[],away:[]}` for those, which
// left the title game with no player breakdown at all.
//
// The ONLY thing missing for those games is the roster (who dressed, and for
// which side). Every per-player stat is still served by the normal
// `roster-game-stats-for-player` endpoint — yards included — so this module
// supplies just the missing roster and hands off to the existing fan-out. The
// numbers rendered are UFA's own, not computed by us.
//
// `stats-pages/game/{gameID}` is the endpoint watchufa.com's own game center
// uses (found in its React bundle). Its `rostersHome`/`rostersAway` carry names
// and jersey numbers but NO playerID, so names are resolved against
// `player-stats?year=Y` (the season's player index). For the 2026 final that
// resolves 73/73 players with zero ambiguity and zero misses.

import 'server-only';
import { getAllPlayerStats } from './client';
import type { UfaRosterPlayer } from './types';

const STATS_PAGES_BASE = 'https://www.backend.ufastats.com/stats-pages';
const UA = 'Mozilla/5.0 (the-layout)';

interface RawRosterEntry {
  id: number;
  jersey_number: string | number | null;
  player: { first_name?: string; last_name?: string } | null;
}

interface RawStatsPage {
  rostersHome?: RawRosterEntry[] | null;
  rostersAway?: RawRosterEntry[] | null;
}

export interface StatsPagesRoster {
  home: UfaRosterPlayer[];
  away: UfaRosterPlayer[];
}

/** Collapse a name to comparable letters — case, accents, punctuation and
 *  spacing all drift between the two feeds ("Robin Vickers Batzdorf" vs
 *  "Robin Vickers-Batzdorf"). */
function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '');
}

// Resolved name→playerID indexes, keyed by year. Building one costs ~28 paged
// requests, and the fallback fires for every game on a championship weekend, so
// the index is cached for the life of the JS runtime. The in-flight PROMISE is
// cached (not just the result) so concurrent misses share one walk instead of
// each kicking off their own. A failed build is evicted so it can be retried.
const _playerIndexCache = new Map<number, Promise<Map<string, string | null>>>();

/** name → playerID for one season. Names that collide map to null so they're
 *  skipped rather than resolved to the wrong player. */
function playerIndexForYear(year: number): Promise<Map<string, string | null>> {
  const cached = _playerIndexCache.get(year);
  if (cached) return cached;

  const build = getAllPlayerStats({ year, limit: 30 })
    .then((index) => {
      const byName = new Map<string, string | null>();
      for (const p of index) {
        const key = normalizeName(p.name ?? '');
        if (!key) continue;
        byName.set(key, byName.has(key) ? null : p.playerID);
      }
      return byName;
    })
    .catch((err: unknown) => {
      _playerIndexCache.delete(year);
      throw err;
    });

  _playerIndexCache.set(year, build);
  return build;
}

/**
 * Roster for one game from `stats-pages`, with playerIDs resolved by name
 * against the season's player index. Returns null when the endpoint has no
 * roster for the game (2019 is largely uncovered upstream).
 *
 * Players whose name doesn't resolve to exactly one playerID are dropped rather
 * than guessed at — a wrong ID would pull another player's stat line.
 */
export async function getStatsPagesRoster(
  gameID: string,
  year: number,
): Promise<StatsPagesRoster | null> {
  const res = await fetch(`${STATS_PAGES_BASE}/game/${encodeURIComponent(gameID)}`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
  if (!res.ok) return null;

  const data = (await res.json()) as RawStatsPage;
  const rawHome = data.rostersHome ?? [];
  const rawAway = data.rostersAway ?? [];
  if (rawHome.length === 0 && rawAway.length === 0) return null;

  const byName = await playerIndexForYear(year);

  const convert = (rows: RawRosterEntry[]): UfaRosterPlayer[] => {
    const out: UfaRosterPlayer[] = [];
    for (const e of rows) {
      const first = e.player?.first_name ?? '';
      const last = e.player?.last_name ?? '';
      const playerID = byName.get(normalizeName(`${first}${last}`));
      if (!playerID) continue;
      out.push({
        playerID,
        firstName: first,
        lastName: last,
        jerseyNumber: e.jersey_number ?? null,
        notes: null,
        status: null,
        prevStatus: null,
      });
    }
    return out;
  };

  return { home: convert(rawHome), away: convert(rawAway) };
}

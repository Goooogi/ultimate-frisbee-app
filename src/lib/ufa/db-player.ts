// DB-backed UFA player reader — the fast path for the unified player profile.
//
// WHY THIS EXISTS
// The profile assembler used to build its UFA side entirely from the live UFA
// API: one `roster-stats-for-player` call, one `roster-game-stats-for-player`
// call PER SEASON PLAYED (13 for a long career), one `games?years=` fetch per
// season for champion detection, and an HTML scrape of watchufa.com for the
// headshot. That serial fan-out — not the cross-league join — was the bulk of
// the ~1.7s profile load.
//
// Every byte of that data already lives in our own tables (`ufa_games`,
// `ufa_game_player_stats`, `ufa_players`), populated by scripts/sync-ufa.ts and
// backfilled to 2014. This module reads them directly: 3 queries total,
// independent of how many seasons the player has.
//
// PARITY NOTES (verified against the live API on real players)
//   • Season totals are re-aggregated from per-game rows. The API returns
//     separate regSeason/playoff rows which the old code summed; summing our
//     per-game rows yields the identical figure (Ben Jagt 2026: 11 GP, 39G,
//     28A, 4Blk, +65, 158/161 cmp — exact match).
//   • Hucks in 2019 are the ONE intentional difference: the API's season row
//     reports 0/0 (upstream didn't populate the season aggregate that year) but
//     the per-game rows carry real values (league-wide 41/64). Our numbers are
//     strictly more accurate; 2014-2018 have no huck data on either side.
//   • Champion detection mirrors findChampionshipGame() in ./client.ts
//     one-for-one, including the season-completeness gate and the
//     label-priority ladder that copes with UFA's year-to-year `week` drift.
//     Kept in sync deliberately — see the comment on pickChampionshipGame().

import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseUrl, supabaseAnonKey } from '@/lib/supabase/env';
import type { UfaPlayerGameRow } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, 'public', any>;
let _client: AnyClient | null = null;
function supabase(): AnyClient {
  if (_client) return _client;
  _client = createClient(supabaseUrl(), supabaseAnonKey(), { auth: { persistSession: false } });
  return _client;
}

/** One (game, player) stat line joined to its game. */
interface StatRow {
  game_id: string;
  team_id: string;
  is_home: boolean;
  goals: number | null;
  assists: number | null;
  hockey_assists: number | null;
  blocks: number | null;
  callahans: number | null;
  throwaways: number | null;
  drops: number | null;
  stalls: number | null;
  completions: number | null;
  throws_attempted: number | null;
  catches: number | null;
  yards_thrown: number | null;
  yards_received: number | null;
  o_points_played: number | null;
  o_points_scored: number | null;
  d_points_played: number | null;
  d_points_scored: number | null;
  seconds_played: number | null;
  pulls: number | null;
  hucks_completed: number | null;
  hucks_attempted: number | null;
}

interface GameRow {
  id: string;
  year: number;
  week: string | null;
  start_timestamp: string | null;
  status: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  home_score: number | null;
  away_score: number | null;
}

export interface DbUfaSeasonStint {
  year: number;
  /** Team slug (e.g. "empire") — matches ufa_games/ufa_teams ids. */
  teamId: string;
  totals: {
    gamesPlayed: number;
    goals: number;
    assists: number;
    blocks: number;
    plusMinus: number;
    completions: number;
    throwsAttempted: number;
    hucksCompleted: number;
    hucksAttempted: number;
  };
  games: UfaPlayerGameRow[];
}

export interface DbUfaPlayer {
  /** ufa_players.full_name — the display name. */
  name: string | null;
  /** Self-hosted headshot url, or null (caller may fall back to a live scrape). */
  headshotUrl: string | null;
  stints: DbUfaSeasonStint[];
  /** Years this player's team won the title, newest first. */
  championYears: number[];
}

const n = (v: number | null | undefined): number => (typeof v === 'number' ? v : 0);

/** Mirrors isFinalStatus() in ./client.ts — the feed uses several spellings. */
function isFinal(status: string | null): boolean {
  const s = (status ?? '').toLowerCase();
  return s === 'final' || s === 'completed';
}

function isAllStar(g: GameRow): boolean {
  const hay = `${g.id ?? ''} ${g.week ?? ''}`.toLowerCase();
  return hay.includes('allstar') || hay.includes('all-star');
}

function ts(g: GameRow): number {
  return g.start_timestamp ? new Date(g.start_timestamp).getTime() : 0;
}

/**
 * Championship game for ONE fully-completed season.
 *
 * This is a deliberate port of findChampionshipGame() in ./client.ts (which is
 * module-private and operates on the API's UfaGame shape). The label-priority
 * ladder below must stay in step with that function — UFA has changed its
 * `week` convention nearly every season, and the two implementations exist only
 * because they read different sources, not because the rules differ.
 */
function pickChampionshipGame(games: GameRow[]): GameRow | null {
  const finals = games.filter(
    (g) =>
      isFinal(g.status) &&
      g.home_score != null &&
      g.away_score != null &&
      g.home_score !== g.away_score &&
      !isAllStar(g),
  );
  if (finals.length === 0) return null;

  const latest = (pool: GameRow[]): GameRow | null =>
    pool.length === 0 ? null : pool.reduce((a, b) => (ts(b) > ts(a) ? b : a));
  const weekIs = (g: GameRow, ...labels: string[]) =>
    labels.includes((g.week ?? '').toLowerCase());

  // (a) explicit championship-weekend label (2021, 2022)
  const champWeekend = finals.filter((g) => weekIs(g, 'championship-weekend'));
  if (champWeekend.length > 0) return latest(champWeekend);

  // (b) other playoff labels (2023) — 'semi-finals' held the real 2023 final
  const playoffLabeled = finals.filter((g) =>
    weekIs(g, 'semi-finals', 'semifinals', 'divisional-champ', 'playoffs', 'championship', 'final', 'finals'),
  );
  if (playoffLabeled.length > 0) return latest(playoffLabeled);

  // (c) no playoff labels (2024, 2025) — the bracket is in the highest week-N
  const weekNum = (g: GameRow): number => {
    const m = (g.week ?? '').match(/^week-(\d+)$/);
    return m ? parseInt(m[1], 10) : -1;
  };
  const maxWeek = Math.max(...finals.map(weekNum));
  if (maxWeek >= 0) {
    const topWeek = finals.filter((g) => weekNum(g) === maxWeek);
    if (topWeek.length > 0) return latest(topWeek);
  }

  return latest(finals);
}

/**
 * Build the whole UFA side for one player id from our own tables.
 *
 * Three queries regardless of career length:
 *   1. the player row (name + stored headshot)
 *   2. their stat lines joined to games (one round trip, embedded select)
 *   3. every game in the seasons they played (for champion detection)
 *
 * Returns null only when the player id doesn't exist in ufa_players.
 */
export async function getUfaPlayerFromDb(playerID: string): Promise<DbUfaPlayer | null> {
  const db = supabase();

  const [playerRes, statsRes] = await Promise.all([
    db.from('ufa_players').select('id, full_name, headshot_url').eq('id', playerID).maybeSingle(),
    // Embedded join pulls each stat line together with its game in one trip.
    // .range() lifts PostgREST's default 1000-row cap — a 12-season career is
    // ~150 rows today, but the cap silently truncates rather than erroring, so
    // we raise it deliberately (see memory: PostgREST 1000-row cap).
    db
      .from('ufa_game_player_stats')
      .select(
        'game_id, team_id, is_home, goals, assists, hockey_assists, blocks, callahans, ' +
          'throwaways, drops, stalls, completions, throws_attempted, catches, yards_thrown, ' +
          'yards_received, o_points_played, o_points_scored, d_points_played, d_points_scored, ' +
          'seconds_played, pulls, hucks_completed, hucks_attempted, ' +
          'ufa_games!inner(id, year, week, start_timestamp, status, home_team_id, away_team_id, home_score, away_score)',
      )
      .eq('player_id', playerID)
      .range(0, 4999),
  ]);

  const player = playerRes.data as { full_name: string | null; headshot_url: string | null } | null;
  // No player row AND no stats → unknown id. (A player row with no stats is a
  // legitimate state — e.g. a rostered player who never took the field — and
  // must still resolve so the profile renders with a headshot.)
  // Cast through unknown: the generated Database types don't model PostgREST's
  // embedded-resource shape, so supabase-js widens `data` to an error union here.
  const rawRows = (statsRes.data ?? []) as unknown as (StatRow & {
    ufa_games: GameRow | GameRow[];
  })[];
  if (!player && rawRows.length === 0) return null;

  // Normalize the embedded game (PostgREST may hand back an object or a
  // single-element array depending on how it infers the relationship).
  const rows: { stat: StatRow; game: GameRow }[] = [];
  for (const r of rawRows) {
    const g = Array.isArray(r.ufa_games) ? r.ufa_games[0] : r.ufa_games;
    if (g) rows.push({ stat: r as StatRow, game: g });
  }

  // ── Group into (year, team) stints ──────────────────────────────────────
  const byYearTeam = new Map<string, { stat: StatRow; game: GameRow }[]>();
  for (const r of rows) {
    const key = `${r.game.year}|${r.stat.team_id}`;
    const list = byYearTeam.get(key) ?? [];
    list.push(r);
    byYearTeam.set(key, list);
  }

  // ── Champion detection ──────────────────────────────────────────────────
  // Needs EVERY game in each season the player appeared in, not just theirs —
  // the title game may not involve them. One query covering all those years.
  const years = [...new Set(rows.map((r) => r.game.year))].sort((a, b) => b - a);
  const championByYear = new Map<number, string>();
  if (years.length > 0) {
    const { data: seasonGames } = await db
      .from('ufa_games')
      .select('id, year, week, start_timestamp, status, home_team_id, away_team_id, home_score, away_score')
      .in('year', years)
      .range(0, 9999);
    const gamesByYear = new Map<number, GameRow[]>();
    for (const g of (seasonGames ?? []) as GameRow[]) {
      const list = gamesByYear.get(g.year) ?? [];
      list.push(g);
      gamesByYear.set(g.year, list);
    }
    for (const [year, list] of gamesByYear.entries()) {
      // Season-completeness gate: mid-season, the "latest final" is just a
      // regular-season result — crowning it would invent a champion every week.
      if (list.length === 0 || !list.every((g) => isFinal(g.status))) continue;
      const finalGame = pickChampionshipGame(list);
      if (!finalGame) continue;
      const winner =
        n(finalGame.away_score) > n(finalGame.home_score)
          ? finalGame.away_team_id
          : finalGame.home_team_id;
      if (winner) championByYear.set(year, winner.toLowerCase());
    }
  }

  // ── Build stints ────────────────────────────────────────────────────────
  const stints: DbUfaSeasonStint[] = [];
  for (const [key, list] of byYearTeam.entries()) {
    const [yearStr, teamId] = key.split('|');
    const year = Number(yearStr);

    const totals = {
      gamesPlayed: list.length,
      goals: 0,
      assists: 0,
      blocks: 0,
      plusMinus: 0,
      completions: 0,
      throwsAttempted: 0,
      hucksCompleted: 0,
      hucksAttempted: 0,
    };
    const games: UfaPlayerGameRow[] = [];

    for (const { stat: s, game: g } of list) {
      totals.goals += n(s.goals);
      totals.assists += n(s.assists);
      totals.blocks += n(s.blocks);
      totals.completions += n(s.completions);
      totals.throwsAttempted += n(s.throws_attempted);
      totals.hucksCompleted += n(s.hucks_completed);
      totals.hucksAttempted += n(s.hucks_attempted);
      totals.plusMinus +=
        n(s.goals) + n(s.assists) + n(s.blocks) - n(s.throwaways) - n(s.drops) - n(s.stalls);

      games.push({
        // ufa_games.id IS the API's gameID ("2024-05-11-ATX-DAL"); the profile
        // parses it for the date, the opponent, and the /g/{id} link.
        gameID: g.id,
        isHome: s.is_home === true,
        scoreHome: n(g.home_score),
        scoreAway: n(g.away_score),
        assists: n(s.assists),
        goals: n(s.goals),
        hockeyAssists: n(s.hockey_assists),
        completions: n(s.completions),
        throwaways: n(s.throwaways),
        stalls: n(s.stalls),
        throwsAttempted: n(s.throws_attempted),
        catches: n(s.catches),
        drops: n(s.drops),
        blocks: n(s.blocks),
        callahans: n(s.callahans),
        pulls: n(s.pulls),
        // The UFA API splits pulls into ob/recorded/hangtime buckets that our
        // sync doesn't mirror (only the total `pulls` column exists). Nothing on
        // the profile reads them; they're zero-filled to satisfy the row type.
        obPulls: 0,
        recordedPulls: 0,
        recordedPullsHangtime: 0,
        oPointsPlayed: n(s.o_points_played),
        oPointsScored: n(s.o_points_scored),
        dPointsPlayed: n(s.d_points_played),
        dPointsScored: n(s.d_points_scored),
        secondsPlayed: n(s.seconds_played),
        yardsReceived: n(s.yards_received),
        yardsThrown: n(s.yards_thrown),
        hucksCompleted: n(s.hucks_completed),
        hucksAttempted: n(s.hucks_attempted),
      });
    }

    // Sort games chronologically — the profile's log table re-sorts by gameID,
    // but a stable order here keeps the payload deterministic.
    games.sort((a, b) => a.gameID.localeCompare(b.gameID));

    stints.push({ year, teamId, totals, games });
  }

  const championYears = [
    ...new Set(
      stints
        .filter((s) => championByYear.get(s.year) === s.teamId.toLowerCase())
        .map((s) => s.year),
    ),
  ].sort((a, b) => b - a);

  return {
    name: player?.full_name ?? null,
    headshotUrl: player?.headshot_url ?? null,
    stints,
    championYears,
  };
}

/**
 * Resolve a UFA slug by display name, straight from ufa_players.
 *
 * Replaces the old findUfaSlugByName(), which walked up to 3 seasons of the
 * full API leaderboard (thousands of rows) to do the same thing. Applies the
 * same token-subset rule via the caller-supplied matcher so nickname/middle-name
 * handling stays centralized in src/lib/name-match.ts.
 *
 * Narrows with a surname ILIKE first so we compare against a handful of
 * candidates rather than pulling all ~3.6k players over the wire.
 */
export async function findUfaSlugByNameFromDb(
  name: string,
  matches: (a: string, b: string) => boolean,
): Promise<string | null> {
  const surname = name.trim().split(/\s+/).filter(Boolean).pop();
  if (!surname) return null;

  const db = supabase();
  const { data } = await db
    .from('ufa_players')
    .select('id, full_name')
    .ilike('full_name', `%${surname}%`)
    .range(0, 499);

  const rows = (data ?? []) as { id: string; full_name: string | null }[];
  for (const r of rows) {
    if (r.full_name && matches(name, r.full_name)) return r.id;
  }
  return null;
}

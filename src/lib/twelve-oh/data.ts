// 12-0 data layer — public read-only, from Supabase.
//
// The backfill script writes via service role; the app reads via the anon
// publishable key. RLS on twelve_oh_* is world-readable, matching the
// usau_* pattern. Uses @supabase/supabase-js (not @supabase/ssr) because
// no auth cookies are needed — same rationale as usau/data.ts.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { BAKED_BASELINE, type Baseline } from './rating';

// ─── Client ────────────────────────────────────────────────────────────────
// twelve_oh_* tables are not in database.types.ts yet (generated types are
// regenerated after the first backfill run). Until then we use untyped
// SupabaseClient and cast rows explicitly — same approach usau/data.ts uses
// for dynamically-joined relations.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>;

let _client: AnyClient | null = null;

function supabase(): AnyClient {
  if (_client) return _client;
  _client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } },
  );
  return _client;
}

// ─── Internal DB row shapes ─────────────────────────────────────────────────
// twelve_oh_* tables are not yet in database.types.ts. We define local row
// interfaces and cast query results explicitly — same pattern as usau/data.ts
// uses for PostgREST joined relations not present in the generated types.

interface DbPlayerRow {
  player_id: string;
  name: string;
  team_slug: string;
  team_abbr: string;
  year: number;
  games_played: number;
  goals: number;
  assists: number;
  blocks: number;
  hockey_assists: number;
  completion_pct: number | null;
  yards_thrown: number;
  yards_received: number;
  plus_minus: number;
  player_score: number | string;
}

interface DbTeamYearRow {
  team_slug: string;
  team_abbr: string;
  year: number;
  player_count: number;
}

interface DbBaselineRow {
  player_seasons: number;
  mean_goals: number | string;          std_goals: number | string;
  mean_assists: number | string;        std_assists: number | string;
  mean_blocks: number | string;         std_blocks: number | string;
  mean_hockey_assists: number | string; std_hockey_assists: number | string;
  mean_yards_thrown: number | string;   std_yards_thrown: number | string;
  mean_yards_received: number | string; std_yards_received: number | string;
  mean_plus_minus: number | string;     std_plus_minus: number | string;
  mean_completion_pct: number | string; std_completion_pct: number | string;
  // v3 additions
  mean_drops: number | string | null;         std_drops: number | string | null;
  mean_throwaways: number | string | null;    std_throwaways: number | string | null;
  mean_callahans: number | string | null;     std_callahans: number | string | null;
  mean_points_played: number | string | null; std_points_played: number | string | null;
  raw_score_min: number | string;
  raw_score_max: number | string;
  raw_score_p5: number | string;
  raw_score_p95: number | string;
}

// ─── Types ─────────────────────────────────────────────────────────────────

/** One entry in the spin pool — a distinct (team, year) with a roster. */
export interface TwelveOhTeamYear {
  teamSlug: string;
  teamAbbr: string;
  year: number;
  playerCount: number;
}

/** Full player row for the pick screen. */
export interface TwelveOhPlayer {
  playerId: string;
  name: string;
  teamSlug: string;
  teamAbbr: string;
  year: number;
  // Display stats
  gamesPlayed: number;
  goals: number;
  assists: number;
  blocks: number;
  hockeyAssists: number;
  completionPct: number | null;   // null = low-volume thrower
  yardsThrown: number;
  yardsReceived: number;
  plusMinus: number;
  // Rating
  playerScore: number;            // 0–100
}

// ─── Spin pool ─────────────────────────────────────────────────────────────

/**
 * All (team, year) pairs that have a roster in twelve_oh_players.
 * Used by the spin mechanic to draw a random team to pick from.
 *
 * Reads the `twelve_oh_team_years` VIEW (one row per team-year, ~275 rows) —
 * NOT the raw players table. The previous version selected every player row
 * and grouped client-side, but supabase-js caps a select at 1000 rows; with
 * 7900+ rows ordered by year DESC, only the most recent ~2 seasons survived
 * the cap, so the spin only ever landed on 2024–2025. The pre-aggregated view
 * is well under any cap and returns the full 2012–2025 pool.
 */
export async function listTeamYears(): Promise<TwelveOhTeamYear[]> {
  const db = supabase();
  const { data, error } = await db
    .from('twelve_oh_team_years')
    .select('team_slug, team_abbr, year, player_count')
    .order('year', { ascending: false })
    .order('team_slug', { ascending: true });

  if (error) throw error;

  return ((data ?? []) as unknown as DbTeamYearRow[])
    .map((row) => ({
      teamSlug: row.team_slug as string,
      teamAbbr: row.team_abbr as string,
      year: row.year as number,
      playerCount: (row.player_count as number) ?? 0,
    }))
    .filter((ty) => ty.playerCount > 0);
}

// ─── Roster ────────────────────────────────────────────────────────────────

/**
 * All players for a given (teamSlug, year), sorted by player_score descending.
 * This is what the pick screen shows after the spin lands.
 */
export async function getRoster(
  teamSlug: string,
  year: number,
): Promise<TwelveOhPlayer[]> {
  const db = supabase();
  const { data, error } = await db
    .from('twelve_oh_players')
    .select(
      'player_id, name, team_slug, team_abbr, year, ' +
      'games_played, goals, assists, blocks, hockey_assists, ' +
      'completion_pct, yards_thrown, yards_received, plus_minus, ' +
      'player_score',
    )
    .eq('team_slug', teamSlug)
    .eq('year', year)
    .order('player_score', { ascending: false });

  if (error) throw error;

  return ((data ?? []) as unknown as DbPlayerRow[]).map((r) => ({
    playerId: r.player_id,
    name: r.name,
    teamSlug: r.team_slug,
    teamAbbr: r.team_abbr,
    year: r.year,
    gamesPlayed: r.games_played,
    goals: r.goals,
    assists: r.assists,
    blocks: r.blocks,
    hockeyAssists: r.hockey_assists,
    completionPct: r.completion_pct != null ? Number(r.completion_pct) : null,
    yardsThrown: r.yards_thrown,
    yardsReceived: r.yards_received,
    plusMinus: r.plus_minus,
    playerScore: Number(r.player_score),
  }));
}

// ─── Baseline ──────────────────────────────────────────────────────────────

/**
 * Fetch the stored all-time baseline from Supabase.
 * Returns null if the backfill has not been run yet.
 * Callers that just need scoring can use BAKED_BASELINE from rating.ts
 * without a DB round-trip.
 */
export async function getBaseline(): Promise<Baseline | null> {
  const db = supabase();
  const { data, error } = await db
    .from('twelve_oh_baseline')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as DbBaselineRow;
  return {
    playerSeasons: Number(row.player_seasons),
    meanGoals: Number(row.mean_goals),           stdGoals: Number(row.std_goals),
    meanAssists: Number(row.mean_assists),       stdAssists: Number(row.std_assists),
    meanBlocks: Number(row.mean_blocks),         stdBlocks: Number(row.std_blocks),
    meanHockeyAssists: Number(row.mean_hockey_assists),
    stdHockeyAssists: Number(row.std_hockey_assists),
    meanYardsThrown: Number(row.mean_yards_thrown),
    stdYardsThrown: Number(row.std_yards_thrown),
    meanYardsReceived: Number(row.mean_yards_received),
    stdYardsReceived: Number(row.std_yards_received),
    meanPlusMinus: Number(row.mean_plus_minus),  stdPlusMinus: Number(row.std_plus_minus),
    meanCompletionPct: Number(row.mean_completion_pct),
    stdCompletionPct: Number(row.std_completion_pct),
    // v3 additions — fall back to BAKED_BASELINE if DB columns not yet populated
    // (i.e. if this baseline row predates the v3 backfill run).
    meanDrops: row.mean_drops != null ? Number(row.mean_drops) : BAKED_BASELINE.meanDrops,
    stdDrops: row.std_drops != null ? Number(row.std_drops) : BAKED_BASELINE.stdDrops,
    meanThrowaways: row.mean_throwaways != null ? Number(row.mean_throwaways) : BAKED_BASELINE.meanThrowaways,
    stdThrowaways: row.std_throwaways != null ? Number(row.std_throwaways) : BAKED_BASELINE.stdThrowaways,
    meanCallahans: row.mean_callahans != null ? Number(row.mean_callahans) : BAKED_BASELINE.meanCallahans,
    stdCallahans: row.std_callahans != null ? Number(row.std_callahans) : BAKED_BASELINE.stdCallahans,
    meanPointsPlayed: row.mean_points_played != null ? Number(row.mean_points_played) : BAKED_BASELINE.meanPointsPlayed,
    stdPointsPlayed: row.std_points_played != null ? Number(row.std_points_played) : BAKED_BASELINE.stdPointsPlayed,
    rawScoreMin: Number(row.raw_score_min),
    rawScoreMax: Number(row.raw_score_max),
    rawScoreP5: Number(row.raw_score_p5),
    rawScoreP95: Number(row.raw_score_p95),
    // Piecewise normalization anchors are not stored in the DB — fall back to
    // BAKED_BASELINE (updated manually after each backfill run).
    rawAtP0:   BAKED_BASELINE.rawAtP0,
    rawAtP50:  BAKED_BASELINE.rawAtP50,
    rawAtP75:  BAKED_BASELINE.rawAtP75,
    rawAtP90:  BAKED_BASELINE.rawAtP90,
    rawAtP95:  BAKED_BASELINE.rawAtP95,
    rawAtP99:  BAKED_BASELINE.rawAtP99,
    rawAtP995: BAKED_BASELINE.rawAtP995,
    rawAtP999: BAKED_BASELINE.rawAtP999,
    rawAtP100: BAKED_BASELINE.rawAtP100,
  };
}

// ─── Leaderboard (dev / verification tool) ────────────────────────────────

/**
 * Top N players by player_score across all time.
 * Not used by the game UI directly; useful for backfill verification and
 * future leaderboard features.
 */
export async function topPlayers(limit = 25): Promise<TwelveOhPlayer[]> {
  const db = supabase();
  const { data, error } = await db
    .from('twelve_oh_players')
    .select(
      'player_id, name, team_slug, team_abbr, year, ' +
      'games_played, goals, assists, blocks, hockey_assists, ' +
      'completion_pct, yards_thrown, yards_received, plus_minus, ' +
      'player_score',
    )
    .order('player_score', { ascending: false })
    .limit(limit);

  if (error) throw error;

  return ((data ?? []) as unknown as DbPlayerRow[]).map((r) => ({
    playerId: r.player_id,
    name: r.name,
    teamSlug: r.team_slug,
    teamAbbr: r.team_abbr,
    year: r.year,
    gamesPlayed: r.games_played,
    goals: r.goals,
    assists: r.assists,
    blocks: r.blocks,
    hockeyAssists: r.hockey_assists,
    completionPct: r.completion_pct != null ? Number(r.completion_pct) : null,
    yardsThrown: r.yards_thrown,
    yardsReceived: r.yards_received,
    plusMinus: r.plus_minus,
    playerScore: Number(r.player_score),
  }));
}

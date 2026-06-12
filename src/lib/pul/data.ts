// PUL (Premier Ultimate League) data layer — public read-only, from Supabase.
//
// Backfill writes via service role; the app reads via the anon publishable key.
// RLS on pul_* is world-readable — same pattern as usau_* and twelve_oh_*.
// Uses @supabase/supabase-js (not @supabase/ssr) — no auth cookies needed.
//
// pul_* tables are not yet in database.types.ts (regenerate after first backfill).
// We cast rows explicitly via local interfaces — same unknown-cast pattern as
// usau/data.ts and twelve-oh/data.ts.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseUrl, supabaseAnonKey } from '@/lib/supabase/env';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>;

let _client: AnyClient | null = null;

function supabase(): AnyClient {
  if (_client) return _client;
  _client = createClient(
    supabaseUrl(),
    supabaseAnonKey(),
    { auth: { persistSession: false } },
  );
  return _client;
}

// ─── Internal DB row shapes ──────────────────────────────────────────────────

interface DbTeamRow {
  id: string;
  name: string;
  city: string;
  mascot: string;
  logo_url: string | null;
  accent_color: string | null;
}

interface DbPlayerRow {
  id: string;
  player_name: string;
  jersey_number: string;
  pronouns: string | null;
  team_id: string;
  season: number;
  games_played: number;
  goals: number;
  assists: number;
  blocks: number;
  turnovers: number;
  touches: number;
  o_points: number;
  d_points: number;
  plus_minus: number;
}

// ─── Public Types ────────────────────────────────────────────────────────────

export interface PulTeam {
  id: string;           // slug: 'atlanta'
  name: string;         // 'Atlanta Soul'
  city: string;
  mascot: string;
  logoUrl: string | null;
  accentColor: string | null; // e.g. '#87CEEB' from island _accentColor
}

export interface PulPlayer {
  id: string;           // uuid
  playerName: string;
  jerseyNumber: string;
  pronouns: string | null;
  teamId: string;
  season: number;
  gamesPlayed: number;
  goals: number;
  assists: number;
  blocks: number;
  turnovers: number;
  touches: number;
  oPoints: number;
  dPoints: number;
  plusMinus: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Logos only ever come from our own R2 bucket (set by the backfill). Assert the
// prefix before exposing it to an <img src> — defense-in-depth so even a polluted
// DB row (which RLS already prevents) can't point the tag at an arbitrary origin.
const ALLOWED_LOGO_PREFIX = 'https://pub-d284bbb3229c435b8e085787c253db6f.r2.dev/';

function mapTeam(row: DbTeamRow): PulTeam {
  return {
    id: row.id,
    name: row.name,
    city: row.city,
    mascot: row.mascot,
    logoUrl: row.logo_url?.startsWith(ALLOWED_LOGO_PREFIX) ? row.logo_url : null,
    accentColor: row.accent_color ?? null,
  };
}

function mapPlayer(row: DbPlayerRow): PulPlayer {
  return {
    id: row.id,
    playerName: row.player_name,
    jerseyNumber: row.jersey_number,
    pronouns: row.pronouns ?? null,
    teamId: row.team_id,
    season: row.season,
    gamesPlayed: row.games_played,
    goals: row.goals,
    assists: row.assists,
    blocks: row.blocks,
    turnovers: row.turnovers,
    touches: row.touches,
    oPoints: row.o_points,
    dPoints: row.d_points,
    plusMinus: row.plus_minus,
  };
}

// ─── Season constants ──────────────────────────────────────────────────────────

/** The current/latest PUL season. The scrape embeds 2023–2026. */
export const PUL_CURRENT_SEASON = 2026;

/**
 * Distinct seasons that have player data, newest first. Drives the season
 * switcher on PUL pages. Cheap — pul_players is small (~1,300 rows) so a
 * select+dedupe is fine without an RPC.
 */
export async function listPulSeasons(): Promise<number[]> {
  const db = supabase();
  const { data, error } = await db
    .from('pul_players')
    .select('season')
    .order('season', { ascending: false });

  if (error) throw error;

  const seen = new Set<number>();
  for (const row of (data ?? []) as unknown as { season: number }[]) {
    seen.add(row.season);
  }
  return [...seen].sort((a, b) => b - a);
}

// ─── Teams ───────────────────────────────────────────────────────────────────

/** All 13 PUL teams, alphabetical by name. */
export async function listPulTeams(): Promise<PulTeam[]> {
  const db = supabase();
  const { data, error } = await db
    .from('pul_teams')
    .select('id, name, city, mascot, logo_url, accent_color')
    .order('name', { ascending: true });

  if (error) throw error;

  return ((data ?? []) as unknown as DbTeamRow[]).map(mapTeam);
}

/** Single team by slug, or null. */
export async function getPulTeam(teamId: string): Promise<PulTeam | null> {
  const db = supabase();
  const { data, error } = await db
    .from('pul_teams')
    .select('id, name, city, mascot, logo_url, accent_color')
    .eq('id', teamId)
    .maybeSingle();

  if (error) throw error;
  return data ? mapTeam(data as unknown as DbTeamRow) : null;
}

/**
 * Lightweight team list for the GAMES mega-menu preview — name + logo only,
 * ordered by city for a stable grid. Mirrors listTopUsauTeams' role.
 */
export async function listTopPulTeams(): Promise<
  { id: string; name: string; city: string; logoUrl: string | null }[]
> {
  const teams = await listPulTeams();
  return teams
    .slice()
    .sort((a, b) => a.city.localeCompare(b.city))
    .map((t) => ({ id: t.id, name: t.name, city: t.city, logoUrl: t.logoUrl }));
}

// ─── Roster ──────────────────────────────────────────────────────────────────

/**
 * All players for a given team in a season, sorted by (goals + assists) desc.
 * Default season is 2025.
 */
export async function getPulRoster(
  teamId: string,
  season = PUL_CURRENT_SEASON,
): Promise<PulPlayer[]> {
  const db = supabase();
  const { data, error } = await db
    .from('pul_players')
    .select('id, player_name, jersey_number, pronouns, team_id, season, games_played, goals, assists, blocks, turnovers, touches, o_points, d_points, plus_minus')
    .eq('team_id', teamId)
    .eq('season', season)
    .order('goals', { ascending: false });

  if (error) throw error;

  // Secondary sort: goals desc is the DB order; sort assists desc as tiebreak client-side.
  const rows = ((data ?? []) as unknown as DbPlayerRow[]).map(mapPlayer);
  rows.sort((a, b) => {
    const scoreA = a.goals + a.assists;
    const scoreB = b.goals + b.assists;
    if (scoreB !== scoreA) return scoreB - scoreA;
    return a.playerName.localeCompare(b.playerName);
  });
  return rows;
}

// ─── Leaderboard ─────────────────────────────────────────────────────────────

export type PulSortField = 'goals' | 'assists' | 'blocks' | 'plus_minus' | 'o_points' | 'd_points' | 'touches' | 'games_played';

/**
 * All PUL players for a season, optionally sorted.
 * Default: goals desc. Useful for a leaderboard page.
 */
export async function listPulPlayers(opts?: {
  season?: number;
  sortBy?: PulSortField;
  limit?: number;
}): Promise<PulPlayer[]> {
  const db = supabase();
  const sortBy: PulSortField = opts?.sortBy ?? 'goals';
  const season = opts?.season ?? PUL_CURRENT_SEASON;

  const { data, error } = await db
    .from('pul_players')
    .select('id, player_name, jersey_number, pronouns, team_id, season, games_played, goals, assists, blocks, turnovers, touches, o_points, d_points, plus_minus')
    .eq('season', season)
    .order(sortBy, { ascending: false })
    .limit(opts?.limit ?? 500);

  if (error) throw error;

  return ((data ?? []) as unknown as DbPlayerRow[]).map(mapPlayer);
}

// ─── Player profile / career ─────────────────────────────────────────────────

/** One season-stint of a PUL player's career (their row for a given season). */
export interface PulSeasonStint {
  season: number;
  teamId: string;
  player: PulPlayer;
}

/** A PUL player's full career: identity + every season stint, newest first. */
export interface PulPlayerCareer {
  /** The row id used to anchor the profile (most-recent season's row). */
  anchorId: string;
  playerName: string;
  pronouns: string | null;
  stints: PulSeasonStint[];   // newest season first
  career: {
    seasonsPlayed: number;
    gamesPlayed: number;
    goals: number;
    assists: number;
    blocks: number;
    turnovers: number;
    touches: number;
    plusMinus: number;
  };
}

/** Single player row by uuid, or null. */
export async function getPulPlayer(id: string): Promise<PulPlayer | null> {
  const db = supabase();
  const { data, error } = await db
    .from('pul_players')
    .select('id, player_name, jersey_number, pronouns, team_id, season, games_played, goals, assists, blocks, turnovers, touches, o_points, d_points, plus_minus')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data ? mapPlayer(data as unknown as DbPlayerRow) : null;
}

/**
 * Assemble a player's full PUL career by NAME (case-insensitive exact match on
 * the stored player_name). PUL has no canonical player id across seasons — the
 * same human appears as separate rows per season — so name is the join key,
 * same as the cross-league identity model. Returns null if no rows.
 */
export async function getPulPlayerCareerByName(
  playerName: string,
): Promise<PulPlayerCareer | null> {
  const db = supabase();
  const { data, error } = await db
    .from('pul_players')
    .select('id, player_name, jersey_number, pronouns, team_id, season, games_played, goals, assists, blocks, turnovers, touches, o_points, d_points, plus_minus')
    .ilike('player_name', playerName)
    .order('season', { ascending: false });

  if (error) throw error;

  const rows = ((data ?? []) as unknown as DbPlayerRow[]).map(mapPlayer);
  if (rows.length === 0) return null;

  const stints: PulSeasonStint[] = rows.map((p) => ({
    season: p.season,
    teamId: p.teamId,
    player: p,
  }));

  const career = rows.reduce(
    (acc, p) => ({
      seasonsPlayed: acc.seasonsPlayed + 1,
      gamesPlayed: acc.gamesPlayed + p.gamesPlayed,
      goals: acc.goals + p.goals,
      assists: acc.assists + p.assists,
      blocks: acc.blocks + p.blocks,
      turnovers: acc.turnovers + p.turnovers,
      touches: acc.touches + p.touches,
      plusMinus: acc.plusMinus + p.plusMinus,
    }),
    { seasonsPlayed: 0, gamesPlayed: 0, goals: 0, assists: 0, blocks: 0, turnovers: 0, touches: 0, plusMinus: 0 },
  );

  return {
    anchorId: rows[0].id,   // most-recent season's row id
    playerName: rows[0].playerName,
    pronouns: rows.find((r) => r.pronouns)?.pronouns ?? null,
    stints,
    career,
  };
}

/**
 * Find a PUL player's canonical stored name by a candidate name, using the
 * shared cross-league name-match rule (token-subset). Returns the matched
 * stored player_name (so the caller can build a career), or null.
 *
 * Used by the unified cross-league profile to attach a PUL career to a
 * UFA/USAU anchor. Prefilters by surname via ilike, then applies namesMatch.
 */
export async function findPulPlayerNameByName(
  candidate: string,
): Promise<string | null> {
  const tokens = candidate.trim().split(/\s+/);
  const surname = tokens[tokens.length - 1];
  if (!surname) return null;

  const db = supabase();
  const { data, error } = await db
    .from('pul_players')
    .select('player_name')
    .ilike('player_name', `%${surname}%`);

  if (error) throw error;

  const names = [...new Set(((data ?? []) as unknown as { player_name: string }[]).map((r) => r.player_name))];
  // Lazy import to keep this module free of a hard dep cycle at top level.
  const { namesMatch } = await import('@/lib/name-match');
  for (const name of names) {
    if (namesMatch(candidate, name)) return name;
  }
  return null;
}

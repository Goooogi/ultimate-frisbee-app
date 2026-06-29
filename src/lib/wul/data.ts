// WUL (Western Ultimate League) data layer — public read-only, from Supabase.
//
// Mirrors src/lib/pul/data.ts. Ingest writes via direct DB connection
// (usau-scraper/scripts/ingest-wul.py); the app reads via the anon publishable
// key. RLS on wul_* is world-readable — same pattern as pul_*/usau_*.
// Uses @supabase/supabase-js (not @supabase/ssr) — no auth cookies needed.
//
// wul_* tables are not in database.types.ts; we cast rows via local interfaces,
// same approach as pul/data.ts. WUL data is per-game (Western Ultimate Stats
// dashboard CSV export) and carries richer advanced stats than PUL (yards,
// hucks, points-played). +/- can be fractional (.5), so it's `number`.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseUrl, supabaseAnonKey } from '@/lib/supabase/env';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>;

let _client: AnyClient | null = null;
function supabase(): AnyClient {
  if (_client) return _client;
  _client = createClient(supabaseUrl(), supabaseAnonKey(), {
    auth: { persistSession: false },
  });
  return _client;
}

// ─── DB row shapes ───────────────────────────────────────────────────────────

interface DbTeamRow {
  id: string;
  name: string;
  city: string;
  mascot: string;
  abbr: string | null;
  logo_url: string | null;
  accent_color: string | null;
}

interface DbPlayerRow {
  id: string;
  player_name: string;
  jersey_number: string;
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
  callahans: number;
  hucks_completed: number;
  yards_total: number;
}

// ─── Public types ────────────────────────────────────────────────────────────

export interface WulTeam {
  id: string;
  name: string;
  city: string;
  mascot: string;
  abbr: string | null;
  logoUrl: string | null;
  accentColor: string | null;
}

export interface WulPlayer {
  id: string;
  playerName: string;
  jerseyNumber: string;
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
  callahans: number;
  hucksCompleted: number;
  yardsTotal: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Logos live under /public/teams/wul/ (committed assets), so unlike PUL's R2
// bucket there's no remote-origin assertion needed — they're same-origin paths.
function mapTeam(row: DbTeamRow): WulTeam {
  return {
    id: row.id,
    name: row.name,
    city: row.city,
    mascot: row.mascot,
    abbr: row.abbr,
    logoUrl: row.logo_url,
    accentColor: row.accent_color,
  };
}

function mapPlayer(row: DbPlayerRow): WulPlayer {
  return {
    id: row.id,
    playerName: row.player_name,
    jerseyNumber: row.jersey_number,
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
    plusMinus: Number(row.plus_minus),
    callahans: row.callahans,
    hucksCompleted: row.hucks_completed,
    yardsTotal: row.yards_total,
  };
}

const PLAYER_COLS =
  'id, player_name, jersey_number, team_id, season, games_played, goals, assists, blocks, turnovers, touches, o_points, d_points, plus_minus, callahans, hucks_completed, yards_total';

/** Current/latest WUL season the data covers. CSV exports embed 2021–2026. */
export const WUL_CURRENT_SEASON = 2026;

// ─── Teams ───────────────────────────────────────────────────────────────────

export async function listWulTeams(): Promise<WulTeam[]> {
  const db = supabase();
  const { data, error } = await db.from('wul_teams').select('*').order('name');
  if (error) throw error;
  return ((data ?? []) as unknown as DbTeamRow[]).map(mapTeam);
}

export async function getWulTeam(teamId: string): Promise<WulTeam | null> {
  const db = supabase();
  const { data, error } = await db.from('wul_teams').select('*').eq('id', teamId).maybeSingle();
  if (error) throw error;
  return data ? mapTeam(data as unknown as DbTeamRow) : null;
}

// ─── Players ─────────────────────────────────────────────────────────────────

export async function getWulRoster(
  teamId: string,
  season = WUL_CURRENT_SEASON,
): Promise<WulPlayer[]> {
  const db = supabase();
  const { data, error } = await db
    .from('wul_players')
    .select(PLAYER_COLS)
    .eq('team_id', teamId)
    .eq('season', season);
  if (error) throw error;
  const rows = ((data ?? []) as unknown as DbPlayerRow[]).map(mapPlayer);
  rows.sort((a, b) => {
    const sa = a.goals + a.assists;
    const sb = b.goals + b.assists;
    if (sb !== sa) return sb - sa;
    return a.playerName.localeCompare(b.playerName);
  });
  return rows;
}

export async function getWulPlayer(id: string): Promise<WulPlayer | null> {
  const db = supabase();
  const { data, error } = await db.from('wul_players').select(PLAYER_COLS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? mapPlayer(data as unknown as DbPlayerRow) : null;
}

/** Distinct seasons that have WUL data, newest first. */
export async function listWulSeasons(): Promise<number[]> {
  const db = supabase();
  const { data, error } = await db.from('wul_games').select('season');
  if (error) throw error;
  const seen = new Set<number>();
  for (const r of (data ?? []) as unknown as { season: number }[]) seen.add(r.season);
  return [...seen].sort((a, b) => b - a);
}

// ─── Leaderboard ─────────────────────────────────────────────────────────────

export type WulSortField =
  | 'goals'
  | 'assists'
  | 'blocks'
  | 'plus_minus'
  | 'o_points'
  | 'd_points'
  | 'touches'
  | 'games_played'
  | 'hucks_completed'
  | 'yards_total';

/** All WUL players for a season, optionally sorted. Default: goals desc. */
export async function listWulPlayers(opts?: {
  season?: number;
  sortBy?: WulSortField;
  limit?: number;
}): Promise<WulPlayer[]> {
  const db = supabase();
  const sortBy: WulSortField = opts?.sortBy ?? 'goals';
  const season = opts?.season ?? WUL_CURRENT_SEASON;

  const { data, error } = await db
    .from('wul_players')
    .select(PLAYER_COLS)
    .eq('season', season)
    .order(sortBy, { ascending: false })
    .limit(opts?.limit ?? 500);

  if (error) throw error;
  return ((data ?? []) as unknown as DbPlayerRow[]).map(mapPlayer);
}

// ─── Career (cross-season + cross-league) ──────────────────────────────────────

export interface WulSeasonStint {
  season: number;
  teamId: string;
  player: WulPlayer;
}

export interface WulPlayerCareer {
  anchorId: string;
  playerName: string;
  stints: WulSeasonStint[];
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

/** Full WUL career by NAME (case-insensitive). WUL has no cross-season player
 *  id (separate rows per season), so name is the join key — same model as PUL
 *  and the unified cross-league identity. Returns null if no rows. */
export async function getWulPlayerCareerByName(
  playerName: string,
): Promise<WulPlayerCareer | null> {
  const db = supabase();
  const { data, error } = await db
    .from('wul_players')
    .select(PLAYER_COLS)
    .ilike('player_name', playerName)
    .order('season', { ascending: false });
  if (error) throw error;
  const rows = ((data ?? []) as unknown as DbPlayerRow[]).map(mapPlayer);
  if (rows.length === 0) return null;

  const stints: WulSeasonStint[] = rows.map((p) => ({
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
  return { anchorId: rows[0].id, playerName: rows[0].playerName, stints, career };
}

/** Find a WUL player's canonical stored name by a candidate name, using the
 *  shared cross-league token-subset match. Used by the unified profile to
 *  attach a WUL career to a UFA/USAU/PUL anchor. */
export async function findWulPlayerNameByName(candidate: string): Promise<string | null> {
  const tokens = candidate.trim().split(/\s+/);
  const surname = tokens[tokens.length - 1];
  if (!surname) return null;
  const db = supabase();
  const { data, error } = await db
    .from('wul_players')
    .select('player_name')
    .ilike('player_name', `%${surname}%`);
  if (error) throw error;
  const names = [...new Set(((data ?? []) as unknown as { player_name: string }[]).map((r) => r.player_name))];
  const { namesMatch } = await import('@/lib/name-match');
  for (const name of names) {
    if (namesMatch(candidate, name)) return name;
  }
  return null;
}

// ─── Games (scores + schedule) ─────────────────────────────────────────────────

export interface WulGameTeamSide {
  teamId: string;
  abbrev: string;
  city: string | null;
  mascot: string | null;
  logoUrl: string | null;
  accentColor: string | null;
  score: number | null;
}

export interface WulGame {
  id: string;            // '{season}/{date}/{AWAY}-vs-{HOME}'
  season: number;
  weekLabel: string;     // 'regular' | 'post'
  gameDate: string | null;
  status: 'scheduled' | 'final';
  away: WulGameTeamSide;
  home: WulGameTeamSide;
}

interface DbGameRow {
  id: string;
  season: number;
  week_label: string;
  game_date: string | null;
  away_team_id: string;
  home_team_id: string;
  away_abbrev: string;
  home_abbrev: string;
  away_score: number | null;
  home_score: number | null;
  status: string;
}

const GAME_COLS =
  'id, season, week_label, game_date, away_team_id, home_team_id, away_abbrev, home_abbrev, away_score, home_score, status';

function buildSide(
  byId: Map<string, WulTeam>,
  teamId: string,
  abbrev: string,
  score: number | null,
): WulGameTeamSide {
  const t = byId.get(teamId);
  return {
    teamId,
    abbrev,
    city: t?.city ?? null,
    mascot: t?.mascot ?? null,
    logoUrl: t?.logoUrl ?? null,
    accentColor: t?.accentColor ?? null,
    score,
  };
}

function mapGame(r: DbGameRow, byId: Map<string, WulTeam>): WulGame {
  return {
    id: r.id,
    season: r.season,
    weekLabel: r.week_label,
    gameDate: r.game_date,
    status: r.status === 'final' ? 'final' : 'scheduled',
    away: buildSide(byId, r.away_team_id, r.away_abbrev, r.away_score),
    home: buildSide(byId, r.home_team_id, r.home_abbrev, r.home_score),
  };
}

/** All games for a season, chronological (regular before post, then date). */
export async function listWulGames(opts: {
  season: number;
  onlyFinal?: boolean;
}): Promise<WulGame[]> {
  const db = supabase();
  let q = db.from('wul_games').select(GAME_COLS).eq('season', opts.season);
  if (opts.onlyFinal) q = q.eq('status', 'final');
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as unknown as DbGameRow[];

  const teams = await listWulTeams();
  const byId = new Map(teams.map((t) => [t.id, t]));
  const games = rows.map((r) => mapGame(r, byId));

  const weekRank = (label: string) => (label === 'post' ? 1 : 0);
  games.sort((a, b) => {
    const wa = weekRank(a.weekLabel);
    const wb = weekRank(b.weekLabel);
    if (wa !== wb) return wa - wb;
    return (a.gameDate ?? '').localeCompare(b.gameDate ?? '');
  });
  return games;
}

/** One game by id. Returns null if not found. Powers /wul/g/[...id]. */
export async function getWulGame(id: string): Promise<WulGame | null> {
  const db = supabase();
  const { data, error } = await db.from('wul_games').select(GAME_COLS).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const teams = await listWulTeams();
  const byId = new Map(teams.map((t) => [t.id, t]));
  return mapGame(data as unknown as DbGameRow, byId);
}

// ─── Per-game box score ────────────────────────────────────────────────────────

export interface WulBoxscoreRow {
  playerName: string;
  jerseyNumber: string | null;
  goals: number;
  assists: number;
  blocks: number;
  turnovers: number;
  touches: number;
  oPoints: number;
  dPoints: number;
  pointsPlayed: number;
  plusMinus: number;
  totalYards: number;
  completions: number;
  throws: number;
  /** wul_players.id for the SAME season — link target for /players/[id]. */
  profileId: string | null;
}

export interface WulGameBoxscore {
  away: WulBoxscoreRow[];
  home: WulBoxscoreRow[];
}

interface DbGameStatRow {
  team_id: string;
  player_name: string;
  jersey_number: string | null;
  goals: number;
  assists: number;
  blocks: number;
  turnovers: number;
  touches: number;
  o_points: number;
  d_points: number;
  points_played: number;
  plus_minus: number;
  total_yards: number;
  completions: number;
  throws: number;
}

/** Full per-player box score for one game, split into away/home by team_id,
 *  each row carrying profileId (same-season wul_players.id) for /players/[id]
 *  links. Sorted by goals+assists desc, then name. */
export async function getWulGameBoxscore(
  game: Pick<WulGame, 'id' | 'season' | 'away' | 'home'>,
): Promise<WulGameBoxscore> {
  const db = supabase();
  const { data, error } = await db
    .from('wul_game_player_stats')
    .select(
      'team_id, player_name, jersey_number, goals, assists, blocks, turnovers, touches, o_points, d_points, points_played, plus_minus, total_yards, completions, throws',
    )
    .eq('game_id', game.id);
  if (error) throw error;
  const statRows = (data ?? []) as unknown as DbGameStatRow[];
  if (statRows.length === 0) return { away: [], home: [] };

  // Resolve player_name → same-season profile id in one query.
  const names = [...new Set(statRows.map((r) => r.player_name))];
  const { data: profileRows } = await db
    .from('wul_players')
    .select('id, player_name')
    .eq('season', game.season)
    .in('player_name', names);
  const idByName = new Map(
    ((profileRows ?? []) as unknown as { id: string; player_name: string }[]).map((p) => [
      p.player_name.toLowerCase(),
      p.id,
    ]),
  );

  const map = (r: DbGameStatRow): WulBoxscoreRow => ({
    playerName: r.player_name,
    jerseyNumber: r.jersey_number ?? null,
    goals: r.goals,
    assists: r.assists,
    blocks: r.blocks,
    turnovers: r.turnovers,
    touches: r.touches,
    oPoints: r.o_points,
    dPoints: r.d_points,
    pointsPlayed: r.points_played,
    plusMinus: Number(r.plus_minus),
    totalYards: r.total_yards,
    completions: r.completions,
    throws: r.throws,
    profileId: idByName.get(r.player_name.toLowerCase()) ?? null,
  });
  const sortRows = (rows: WulBoxscoreRow[]) =>
    rows.sort((a, b) => {
      const sa = a.goals + a.assists;
      const sb = b.goals + b.assists;
      if (sb !== sa) return sb - sa;
      return a.playerName.localeCompare(b.playerName);
    });

  return {
    away: sortRows(statRows.filter((r) => r.team_id === game.away.teamId).map(map)),
    home: sortRows(statRows.filter((r) => r.team_id === game.home.teamId).map(map)),
  };
}

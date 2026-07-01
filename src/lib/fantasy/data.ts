// Fantasy data layer — reads (public, anon-safe) + writes (owner-gated).
//
// READ functions use the anon publishable key and work from Server Components
// (leaderboard, public team view) with NO session — mirrors wul_*/pul_* reads.
// WRITE functions run client-side, derive owner_id from supabase.auth.getUser()
// (never trust the client), and rely on RLS + the owner_username trigger for
// enforcement. Mirrors src/lib/playbook/data.ts.
//
// fantasy_* tables aren't in database.types.ts (same as wul_*/pul_*), so we
// cast rows via local interfaces.

import { createClient as createSessionClient } from '@/lib/supabase/client';
import { createClient as createAnonClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseUrl, supabaseAnonKey } from '@/lib/supabase/env';
import { scoreStatLine, roundPoints, type FantasyRole } from './scoring';
import { ufaRowToStatLine, type UfaStatRow } from './ufa-adapter';
import { buildWeeks, activeWeek, type WeekGame } from './weeks';
import { moderateName } from '@/lib/moderation';

// fantasy_*/ufa_* tables aren't in database.types.ts (same as wul_*/pul_*), so
// we use untyped clients and cast rows via the local interfaces below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>;

/** Anon client for READ paths that run without a session (Server Components). */
let _anon: AnyClient | null = null;
function anon(): AnyClient {
  if (_anon) return _anon;
  _anon = createAnonClient(supabaseUrl(), supabaseAnonKey(), {
    auth: { persistSession: false },
  });
  return _anon;
}

/** Session-aware browser client (carries the auth cookie), untyped for
 *  fantasy_* access. Used by write paths so auth.getUser() + RLS work. */
function sessionClient(): AnyClient {
  return createSessionClient() as unknown as AnyClient;
}

/** The beta runs the current UFA season. */
export function fantasySeasonYear(now: Date = new Date()): number {
  return now.getFullYear();
}

// ─── Public types ─────────────────────────────────────────────────────────────

export interface FantasyPlayerHit {
  playerId: string;
  fullName: string;
  teamId: string | null;
  teamName: string | null;
}

export interface RosterSlot {
  playerId: string;
  role: FantasyRole;
  fullName: string;
  teamId: string | null;
  teamName: string | null;
}

export interface FantasyTeamView {
  id: string;
  teamName: string;
  /** Owner's display name — the primary public label. */
  ownerDisplayName: string | null;
  /** Owner's unique @handle — shown as a secondary disambiguator / fallback. */
  ownerUsername: string | null;
  seasonYear: number;
  totalPoints: number;
  weeklyPoints: { week: string; points: number }[];
}

export interface LeaderboardRow {
  teamId: string;
  teamName: string;
  ownerDisplayName: string | null;
  ownerUsername: string | null;
  totalPoints: number;
}

// ─── Player search (from our ufa_players DB, not the external API) ────────────

/**
 * Search draftable players by name. Reads ufa_players (populated by the sync),
 * so results carry the exact player_id slugs the roster FK needs and resolve
 * instantly. Joined to ufa_teams for a display team name.
 */
export async function searchDraftablePlayers(
  query: string,
  limit = 20,
): Promise<FantasyPlayerHit[]> {
  const needle = query.trim();
  if (needle.length < 2) return [];
  // Escape ILIKE wildcards so a '%' or '_' in the query is treated as a literal
  // character, not a pattern (prevents accidental match-all / expensive scans).
  const escaped = needle.replace(/[\\%_]/g, (c) => `\\${c}`);

  const { data, error } = await anon()
    .from('ufa_players')
    .select('id, full_name, current_team_id, ufa_teams:current_team_id (name, full_name)')
    .ilike('full_name', `%${escaped}%`)
    .order('full_name')
    .limit(limit);
  if (error) throw error;

  return (data ?? []).map((r: Record<string, unknown>) => {
    const team = r.ufa_teams as { name?: string; full_name?: string } | null;
    return {
      playerId: r.id as string,
      fullName: (r.full_name as string) ?? (r.id as string),
      teamId: (r.current_team_id as string) ?? null,
      teamName: team?.full_name ?? team?.name ?? null,
    };
  });
}

// ─── Week resolution (from ufa_games) ────────────────────────────────────────

/** All UFA games for a season as the minimal shape weeks.ts needs. */
async function seasonWeekGames(year: number, client: AnyClient = anon()): Promise<WeekGame[]> {
  const { data, error } = await client
    .from('ufa_games')
    .select('week, start_timestamp, status')
    .eq('year', year);
  if (error) throw error;
  return (data ?? []).map((g: Record<string, unknown>) => ({
    week: (g.week as string) ?? null,
    startTimestamp: (g.start_timestamp as string) ?? null,
    status: (g.status as string) ?? 'Upcoming',
  }));
}

/**
 * The week a manager is currently setting a lineup for = earliest unlocked week.
 * Returns { week, lockAt, locked } or null if no schedule.
 */
export async function currentFantasyWeek(
  year = fantasySeasonYear(),
  now: Date = new Date(),
): Promise<{ week: string; lockAt: string | null; locked: boolean } | null> {
  const weeks = buildWeeks(await seasonWeekGames(year), now);
  const w = activeWeek(weeks);
  return w ? { week: w.week, lockAt: w.lockAt, locked: w.locked } : null;
}

// ─── Team + roster reads ──────────────────────────────────────────────────────

/** A single team with its season roster (latest week's slots) — public view. */
export async function getFantasyTeam(teamId: string): Promise<FantasyTeamView | null> {
  const { data: team, error } = await anon()
    .from('fantasy_teams')
    .select('id, team_name, owner_display_name, owner_username, season_year')
    .eq('id', teamId)
    .maybeSingle();
  if (error) throw error;
  if (!team) return null;

  const { data: scores } = await anon()
    .from('fantasy_scores')
    .select('week, points')
    .eq('team_id', teamId);

  const weekly = (scores ?? [])
    .map((s: Record<string, unknown>) => ({ week: s.week as string, points: Number(s.points) }))
    .sort((a, b) => a.week.localeCompare(b.week, undefined, { numeric: true }));

  return {
    id: team.id,
    teamName: team.team_name,
    ownerDisplayName: team.owner_display_name ?? null,
    ownerUsername: team.owner_username ?? null,
    seasonYear: team.season_year,
    totalPoints: roundPoints(weekly.reduce((acc, w) => acc + w.points, 0)),
    weeklyPoints: weekly,
  };
}

/** Roster slots for a team + week, joined to player/team names. */
export async function getTeamRoster(teamId: string, week: string): Promise<RosterSlot[]> {
  const { data, error } = await anon()
    .from('fantasy_roster_slots')
    .select('player_id, role, ufa_players:player_id (full_name, current_team_id, ufa_teams:current_team_id (name, full_name))')
    .eq('team_id', teamId)
    .eq('week', week);
  if (error) throw error;

  return (data ?? []).map((r: Record<string, unknown>) => {
    const p = r.ufa_players as
      | { full_name?: string; current_team_id?: string; ufa_teams?: { name?: string; full_name?: string } }
      | null;
    return {
      playerId: r.player_id as string,
      role: r.role as FantasyRole,
      fullName: p?.full_name ?? (r.player_id as string),
      teamId: p?.current_team_id ?? null,
      teamName: p?.ufa_teams?.full_name ?? p?.ufa_teams?.name ?? null,
    };
  });
}

/** The global beta leaderboard: all league_id-NULL teams ranked by total points. */
export async function getLeaderboard(
  year = fantasySeasonYear(),
  limit = 200,
): Promise<LeaderboardRow[]> {
  const { data: teams, error } = await anon()
    .from('fantasy_teams')
    .select('id, team_name, owner_display_name, owner_username')
    .is('league_id', null)
    .eq('season_year', year)
    .limit(limit);
  if (error) throw error;
  if (!teams || teams.length === 0) return [];

  // Sum weekly scores per team. One query for all scores in this team set.
  const ids = teams.map((t: Record<string, unknown>) => t.id as string);
  const { data: scores } = await anon()
    .from('fantasy_scores')
    .select('team_id, points')
    .in('team_id', ids);

  const totals = new Map<string, number>();
  for (const s of scores ?? []) {
    const id = (s as Record<string, unknown>).team_id as string;
    totals.set(id, (totals.get(id) ?? 0) + Number((s as Record<string, unknown>).points));
  }

  return teams
    .map((t: Record<string, unknown>) => ({
      teamId: t.id as string,
      teamName: t.team_name as string,
      ownerDisplayName: (t.owner_display_name as string) ?? null,
      ownerUsername: (t.owner_username as string) ?? null,
      totalPoints: roundPoints(totals.get(t.id as string) ?? 0),
    }))
    .sort((a, b) => b.totalPoints - a.totalPoints);
}

// ─── Writes (client-side; owner derived from session) ────────────────────────

/** The signed-in user's beta team for this season, if any. */
export async function getMyTeam(year = fantasySeasonYear()): Promise<FantasyTeamView | null> {
  const supabase = sessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('fantasy_teams')
    .select('id')
    .eq('owner_id', user.id)
    .is('league_id', null)
    .eq('season_year', year)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return getFantasyTeam(data.id as string);
}

export interface MyProfile {
  displayName: string | null;
  username: string | null;
}

/** The signed-in user's editable public identity (display name + handle). */
export async function getMyProfile(): Promise<MyProfile | null> {
  const supabase = sessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('profiles')
    .select('display_name, username')
    .eq('id', user.id)
    .maybeSingle();
  if (!data) return null;
  return {
    displayName: (data.display_name as string) ?? null,
    username: (data.username as string) ?? null,
  };
}

/** The signed-in user's current public handle (profiles.username), or null. */
export async function getMyUsername(): Promise<string | null> {
  return (await getMyProfile())?.username ?? null;
}

/** profiles.username constraint: lowercase, 3–30 chars, alnum + underscore. */
export const USERNAME_RE = /^[a-z0-9_]{3,30}$/;

/**
 * Is a handle free? Uses the fantasy_handle_available RPC (SECURITY DEFINER,
 * boolean-only). This is required, NOT a nicety: profiles SELECT is
 * authenticated-only, so a direct anon `.eq('username',…)` query reads empty
 * and would always report "available" (broken at signup, before a session).
 * The RPC sees the row and returns only a boolean — no row-data disclosure.
 */
export async function isUsernameAvailable(username: string): Promise<boolean> {
  const u = username.trim().toLowerCase();
  if (!USERNAME_RE.test(u)) return false;
  const { data, error } = await anon().rpc('fantasy_handle_available', { p_handle: u });
  if (error) return false; // fail closed — treat as unavailable on error
  return data === true;
}

/**
 * Set the signed-in user's public handle. RLS lets a user update only their own
 * profile row (profiles_update_own). Throws on format/profanity/taken. This is
 * the user's unique leaderboard identifier — synced onto their teams by trigger.
 */
export async function setMyUsername(username: string): Promise<void> {
  const supabase = sessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');
  const u = username.trim().toLowerCase();
  if (!USERNAME_RE.test(u)) {
    throw new Error('Handle must be 3–30 characters: lowercase letters, numbers, underscores.');
  }
  const bad = moderateName(u, 'Handle');
  if (bad) throw new Error(bad);
  const { error } = await supabase.from('profiles').update({ username: u }).eq('id', user.id);
  if (error) {
    // 23505 = unique_violation (handle taken)
    if ((error as { code?: string }).code === '23505') throw new Error('That handle is taken.');
    throw error;
  }
}

/**
 * Set the signed-in user's display name — the primary public label on the
 * leaderboard. Not unique. Runs the profanity filter. 1–60 chars. The
 * fantasy_resync trigger updates any of the user's teams' denormalized copy.
 */
export async function setDisplayName(name: string): Promise<void> {
  const supabase = sessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');
  const n = name.trim();
  if (n.length < 1 || n.length > 60) throw new Error('Display name must be 1–60 characters.');
  const bad = moderateName(n, 'Display name');
  if (bad) throw new Error(bad);
  const { error } = await supabase.from('profiles').update({ display_name: n }).eq('id', user.id);
  if (error) throw error;
}

/**
 * Create (or return existing) the signed-in user's beta team. owner_id comes
 * from the session; owner_username is force-set by a DB trigger from the
 * profile, so a client value can't stick (defense in depth: we don't send one).
 * Requires the user to have a username first (their leaderboard identity) —
 * the caller (builder) collects one via setMyUsername before calling this.
 */
export async function createMyTeam(
  teamName: string,
  year = fantasySeasonYear(),
): Promise<string> {
  const supabase = sessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  const name = teamName.trim();
  if (name.length < 1 || name.length > 40) throw new Error('Team name must be 1–40 characters.');

  const { data, error } = await supabase
    .from('fantasy_teams')
    .insert({ owner_id: user.id, team_name: name, season_year: year, league_id: null })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export interface RosterInput {
  playerId: string;
  role: FantasyRole;
}

/**
 * Replace a team's roster for a given week with exactly 4 offenders + 3
 * defenders. Refuses to write if the week has already locked (server-side check
 * against the schedule) or the composition is wrong. delete-then-insert per
 * (team, week) so re-saves reconcile cleanly. The caps trigger + is_valid
 * function are the DB backstops; we validate here for a friendly error.
 */
export async function saveRoster(
  teamId: string,
  week: string,
  slots: RosterInput[],
  year = fantasySeasonYear(),
): Promise<void> {
  const supabase = sessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  // Composition guard (mirrors fantasy_roster_is_valid).
  const off = slots.filter((s) => s.role === 'offender').length;
  const def = slots.filter((s) => s.role === 'defender').length;
  if (slots.length !== 7 || off !== 4 || def !== 3) {
    throw new Error('Roster must be exactly 4 offenders and 3 defenders.');
  }
  const uniquePlayers = new Set(slots.map((s) => s.playerId));
  if (uniquePlayers.size !== slots.length) {
    throw new Error('A player can only be rostered once.');
  }

  // Lock guard: don't allow editing a week that has already started.
  const weeks = buildWeeks(await seasonWeekGames(year, supabase), new Date());
  const target = weeks.find((w) => w.week === week);
  if (target?.locked) throw new Error(`${week} is locked — its games have started.`);

  // Ownership is enforced by RLS; we still fail fast client-side.
  // delete-then-insert this (team, week).
  const del = await supabase.from('fantasy_roster_slots').delete().eq('team_id', teamId).eq('week', week);
  if (del.error) throw del.error;

  const rows = slots.map((s) => ({
    team_id: teamId,
    week,
    player_id: s.playerId,
    role: s.role,
  }));
  const ins = await supabase.from('fantasy_roster_slots').insert(rows);
  if (ins.error) throw ins.error;
}

// ─── Scoring preview (client hint) ────────────────────────────────────────────

/**
 * Preview points a player would score in a role, from their season-to-date
 * per-game UFA stats. Pure display aid for the builder's "what this scores"
 * hint — the authoritative cumulative score is computed by the scoring job.
 */
export async function playerSeasonPreview(
  playerId: string,
  role: FantasyRole,
  year = fantasySeasonYear(),
): Promise<number> {
  const { data, error } = await anon()
    .from('ufa_game_player_stats')
    .select('goals, assists, blocks, throwaways, drops, stalls, yards_thrown, yards_received, ufa_games!inner(year)')
    .eq('player_id', playerId)
    .eq('ufa_games.year', year);
  if (error) throw error;

  let total = 0;
  for (const row of data ?? []) {
    total += scoreStatLine(ufaRowToStatLine(row as unknown as UfaStatRow), role);
  }
  return roundPoints(total);
}

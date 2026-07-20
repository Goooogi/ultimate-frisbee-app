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

/** A rostered player + the fantasy points they scored in a given week. */
export interface WeekPlayerScore extends RosterSlot {
  /** Fantasy points this player scored that week (rounded, may be 0 or negative). */
  points: number;
  /** Games this player played in the week (0 = bye/DNP → 0 pts). */
  gamesPlayed: number;
}

/** One week of a team's history: total + per-player breakdown. */
export interface WeekBreakdown {
  week: string;
  totalPoints: number;
  players: WeekPlayerScore[];
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
 * The week a manager is currently setting a lineup for = earliest editable week.
 * Returns { week, lockAt, unlockAt, locked } or null if no schedule. lockAt is
 * the week's first game kickoff (when it locks); unlockAt is the Monday 00:00 ET
 * it (and thus the next week's editing) reopens.
 */
export async function currentFantasyWeek(
  year = fantasySeasonYear(),
  now: Date = new Date(),
): Promise<{ week: string; lockAt: string | null; unlockAt: string | null; locked: boolean } | null> {
  const weeks = buildWeeks(await seasonWeekGames(year), now);
  const w = activeWeek(weeks, now);
  return w ? { week: w.week, lockAt: w.lockAt, unlockAt: w.unlockAt, locked: w.locked } : null;
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

/**
 * Per-player fantasy points for a team in ONE week — the breakdown behind the
 * team's weekly total. Computed on the fly from that week's roster slots + the
 * players' UFA game stats, using the SAME scoring matrix as the scoring job
 * (scoreStatLine via the UFA adapter). A player with no game that week scores 0.
 * Returned sorted by points desc (best performers first).
 */
export async function getTeamWeekBreakdown(
  teamId: string,
  week: string,
  year = fantasySeasonYear(),
): Promise<WeekBreakdown> {
  const roster = await getTeamRoster(teamId, week);
  if (roster.length === 0) return { week, totalPoints: 0, players: [] };

  const playerIds = roster.map((r) => r.playerId);
  // That week's per-player stat lines (a player can appear in multiple games).
  const { data: statRows } = await anon()
    .from('ufa_game_player_stats')
    .select(
      'player_id, goals, assists, blocks, throwaways, drops, stalls, yards_thrown, yards_received, ufa_games!inner(week, year)',
    )
    .in('player_id', playerIds)
    .eq('ufa_games.week', week)
    .eq('ufa_games.year', year);

  // Sum each player's points + games across the week's games.
  const agg = new Map<string, { points: number; games: number }>();
  for (const raw of statRows ?? []) {
    const r = raw as Record<string, unknown>;
    const pid = r.player_id as string;
    const role = roster.find((s) => s.playerId === pid)?.role;
    if (!role) continue; // stat row for a non-rostered player (shouldn't happen via .in)
    const pts = scoreStatLine(ufaRowToStatLine(r as unknown as UfaStatRow), role);
    const cur = agg.get(pid) ?? { points: 0, games: 0 };
    cur.points += pts;
    cur.games += 1;
    agg.set(pid, cur);
  }

  const players: WeekPlayerScore[] = roster
    .map((slot) => {
      const a = agg.get(slot.playerId) ?? { points: 0, games: 0 };
      return { ...slot, points: roundPoints(a.points), gamesPlayed: a.games };
    })
    .sort((a, b) => b.points - a.points);

  const totalPoints = roundPoints(players.reduce((s, p) => s + p.points, 0));
  return { week, totalPoints, players };
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

/**
 * The signed-in user's saved roster for a given week, so the builder can
 * pre-fill their existing picks instead of showing empty search boxes.
 *
 * `week` is the week the builder edits (the current/open week). If that week
 * has no slots yet — e.g. a new week opened and they haven't re-saved — we
 * fall back to the most recent PRIOR week that does have a roster, so the user
 * always sees their last-known lineup to tweak rather than a blank slate.
 * Returns [] when the user has no team / no saved roster at all.
 */
export async function getMyTeamRoster(week: string): Promise<RosterSlot[]> {
  const team = await getMyTeam();
  if (!team) return [];

  // Preferred: this exact week.
  const current = await getTeamRoster(team.id, week);
  if (current.length > 0) return current;

  // Fallback: the latest week that has any slots for this team.
  const { data: weeks } = await anon()
    .from('fantasy_roster_slots')
    .select('week')
    .eq('team_id', team.id);
  const latest = (weeks ?? [])
    .map((r: Record<string, unknown>) => r.week as string)
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0];
  if (!latest) return [];
  return getTeamRoster(team.id, latest);
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
 * Set (or clear) the signed-in user's profile-icon URL — the avatar shown in
 * the nav account chip in place of the initials monogram. Pass null to clear it
 * back to initials. The value is a public storage URL in the `avatars` bucket
 * (upload keyed to the user's own {user_id}/… folder via storage RLS). Writes
 * the user's own profiles row (profiles_update_own RLS).
 */
export async function setAvatarUrl(url: string | null): Promise<void> {
  const supabase = sessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');
  // Only accept a same-project Supabase storage URL (or null). Prevents a
  // caller from pointing the avatar at an arbitrary external/attacker URL.
  if (url !== null) {
    const ok = /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/avatars\//.test(url);
    if (!ok) throw new Error('Invalid avatar URL.');
  }

  // Read the current avatar first so we can delete its storage object after a
  // successful swap — a public-bucket URL never expires, so a replaced/removed
  // photo would otherwise stay publicly reachable forever (privacy).
  const { data: prev } = await supabase
    .from('profiles')
    .select('avatar_url')
    .eq('id', user.id)
    .maybeSingle();
  const prevUrl = prev?.avatar_url ?? null;

  // Setting an uploaded photo clears any picked team-logo icon — the two are
  // mutually exclusive (avatar_icon takes render precedence, so a stale icon
  // would mask the new photo). Clearing the photo (url=null) leaves icon as-is.
  const patch: Record<string, string | null> = { avatar_url: url };
  if (url !== null) patch.avatar_icon = null;
  const { error } = await supabase.from('profiles').update(patch).eq('id', user.id);
  if (error) throw error;

  // Best-effort cleanup of the OLD object (only when it actually changed and
  // was one of ours). Storage RLS still scopes deletion to the user's folder,
  // and a failure here must not fail the avatar change — the column is the
  // source of truth. Path = everything after `/public/avatars/`.
  if (prevUrl && prevUrl !== url) {
    const m = prevUrl.match(/\/storage\/v1\/object\/public\/avatars\/(.+)$/);
    const oldPath = m ? decodeURIComponent(m[1]) : null;
    // Only remove objects under THIS user's folder (defense in depth on top of RLS).
    if (oldPath && oldPath.startsWith(`${user.id}/`)) {
      await supabase.storage.from('avatars').remove([oldPath]).catch(() => {});
    }
  }
}

/**
 * Set (or clear) the signed-in user's profile ICON — a picked team logo /
 * country flag, stored as a compact "<league>:<teamId>" reference (e.g.
 * 'ufa:empire', 'wfdf:USA'), NOT an image URL. Pass null to clear it. Mutually
 * exclusive with the uploaded photo (avatar_url): setting an icon clears the
 * photo, and if that photo was an uploaded storage object it's cleaned up so it
 * doesn't stay publicly reachable. Writes the user's own profiles row
 * (profiles_update_own RLS).
 *
 * `ref` must match "<league>:<id>" where league ∈ {ufa,usau,pul,wul,wfdf} and id
 * is a short slug/code — the same shape enforced by the profiles_avatar_icon_format
 * DB CHECK. Rejects anything else so a caller can't stash arbitrary text here.
 */
export async function setAvatarIcon(ref: string | null): Promise<void> {
  const supabase = sessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');
  if (ref !== null) {
    const ok = /^(ufa|usau|pul|wul|wfdf):[A-Za-z0-9][A-Za-z0-9/_-]{0,79}$/.test(ref);
    if (!ok) throw new Error('Invalid avatar icon.');
  }

  // Read the current photo so we can clean up an uploaded storage object when
  // switching to an icon (the URL column is being cleared out from under it).
  const { data: prev } = await supabase
    .from('profiles')
    .select('avatar_url')
    .eq('id', user.id)
    .maybeSingle();
  const prevUrl = prev?.avatar_url ?? null;

  // Setting an icon clears the photo; clearing the icon (ref=null) leaves the
  // photo untouched so a user can fall back to a previously-uploaded photo.
  const patch: Record<string, string | null> =
    ref !== null ? { avatar_icon: ref, avatar_url: null } : { avatar_icon: null };
  const { error } = await supabase.from('profiles').update(patch).eq('id', user.id);
  if (error) throw error;

  if (ref !== null && prevUrl) {
    const m = prevUrl.match(/\/storage\/v1\/object\/public\/avatars\/(.+)$/);
    const oldPath = m ? decodeURIComponent(m[1]) : null;
    if (oldPath && oldPath.startsWith(`${user.id}/`)) {
      await supabase.storage.from('avatars').remove([oldPath]).catch(() => {});
    }
  }
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

/**
 * Rename the signed-in user's team. Same validation + moderation as
 * createMyTeam's name rule (1–40 chars, moderated). The UPDATE is gated by RLS
 * ("fantasy_teams update own": owner_id = auth.uid() in both USING and
 * WITH CHECK), so a user can only rename a team they own — we pass the id but
 * ownership is enforced at the DB, not trusted from the client. Returns the
 * trimmed name so the caller can reflect it without a refetch.
 */
export async function renameMyTeam(teamId: string, teamName: string): Promise<string> {
  const supabase = sessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  const name = teamName.trim();
  if (name.length < 1 || name.length > 40) throw new Error('Team name must be 1–40 characters.');
  const bad = moderateName(name, 'Team name');
  if (bad) throw new Error(bad);

  const { error, count } = await supabase
    .from('fantasy_teams')
    .update({ team_name: name }, { count: 'exact' })
    .eq('id', teamId)
    .eq('owner_id', user.id);
  if (error) throw error;
  // RLS would have blocked a non-owner (0 rows) — surface it rather than
  // silently reporting success.
  if (count === 0) throw new Error('Could not rename this team.');
  return name;
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

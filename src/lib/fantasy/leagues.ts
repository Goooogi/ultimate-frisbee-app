// Fantasy LEAGUES + CONTESTS data layer.
//
// A "league" is a private group of friends (fantasy_leagues + members). A
// "contest" is that group pointed at one real competition + season
// (fantasy_contests) — one league can run a USAU Club Nationals contest and a
// UFA contest at the same time with independent rosters/scoring.
//
// Same client conventions as data.ts: anon client for public reads (league
// pages and standings are public-view per the fantasy auth boundary), session
// browser client for writes. Membership/invite writes ALL go through SECURITY
// DEFINER RPCs — there is no direct client write path to members or invites,
// and the league invite code is column-REVOKED so it can only be read through
// the commissioner RPC.

import { createClient as createSessionClient } from '@/lib/supabase/client';
import { createClient as createAnonClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseUrl, supabaseAnonKey } from '@/lib/supabase/env';
import { moderateName } from '@/lib/moderation';
import { roundPoints } from './scoring';
import {
  getCompetition,
  parseContestSettings,
  type CompetitionDef,
  type CompetitionId,
  type ContestSettings,
} from './competitions';
import type { FantasyWeek } from './weeks';
import type { LeaderboardRow } from './data';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>;

let _anon: AnyClient | null = null;
function anon(): AnyClient {
  if (_anon) return _anon;
  _anon = createAnonClient(supabaseUrl(), supabaseAnonKey(), {
    auth: { persistSession: false },
  });
  return _anon;
}

function sessionClient(): AnyClient {
  return createSessionClient() as unknown as AnyClient;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FantasyLeagueSummary {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  memberCount: number;
  contestCount: number;
}

export type LeagueRole = 'commissioner' | 'member';

export interface LeagueMember {
  userId: string;
  role: LeagueRole;
  displayName: string | null;
  username: string | null;
  joinedAt: string;
}

export type ContestStatus = 'open' | 'active' | 'complete';

export interface ContestView {
  id: string;
  leagueId: string | null;
  competition: CompetitionId;
  competitionDef: CompetitionDef;
  seasonYear: number;
  name: string;
  status: ContestStatus;
  settings: ContestSettings;
  createdAt: string;
}

export interface ContestPeriod {
  period: string;
  lockAt: string | null;
  unlockAt: string | null;
  gameCount: number | null;
  complete: boolean;
}

// ─── League reads (public) ───────────────────────────────────────────────────

function mapContestRow(r: Record<string, unknown>): ContestView | null {
  const def = getCompetition(r.competition as string);
  if (!def) return null; // unknown competition (newer app rows on older code)
  return {
    id: r.id as string,
    leagueId: (r.league_id as string) ?? null,
    competition: def.id,
    competitionDef: def,
    seasonYear: r.season_year as number,
    name: r.name as string,
    status: (r.status as ContestStatus) ?? 'open',
    settings: parseContestSettings(def, r.settings),
    createdAt: (r.created_at as string) ?? '',
  };
}

/** One league's header info. Public read (invite code is column-locked). */
export async function getLeague(leagueId: string): Promise<FantasyLeagueSummary | null> {
  const { data, error } = await anon()
    .from('fantasy_leagues')
    .select('id, name, owner_id, created_at')
    .eq('id', leagueId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const [{ count: members }, { count: contests }] = await Promise.all([
    anon().from('fantasy_league_members').select('user_id', { count: 'exact', head: true }).eq('league_id', leagueId),
    anon().from('fantasy_contests').select('id', { count: 'exact', head: true }).eq('league_id', leagueId),
  ]);

  return {
    id: data.id as string,
    name: data.name as string,
    ownerId: data.owner_id as string,
    createdAt: data.created_at as string,
    memberCount: members ?? 0,
    contestCount: contests ?? 0,
  };
}

/** All members of a league with their public identity (denormalized). */
export async function getLeagueMembers(leagueId: string): Promise<LeagueMember[]> {
  const { data, error } = await anon()
    .from('fantasy_league_members')
    .select('user_id, role, member_display_name, member_username, joined_at')
    .eq('league_id', leagueId)
    .order('joined_at');
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    userId: r.user_id as string,
    role: (r.role as LeagueRole) ?? 'member',
    displayName: (r.member_display_name as string) ?? null,
    username: (r.member_username as string) ?? null,
    joinedAt: (r.joined_at as string) ?? '',
  }));
}

/** A league's contests, newest first. */
export async function getLeagueContests(leagueId: string): Promise<ContestView[]> {
  const { data, error } = await anon()
    .from('fantasy_contests')
    .select('id, league_id, competition, season_year, name, status, settings, created_at')
    .eq('league_id', leagueId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? [])
    .map((r: Record<string, unknown>) => mapContestRow(r))
    .filter((c: ContestView | null): c is ContestView => c !== null);
}

export async function getContest(contestId: string): Promise<ContestView | null> {
  const { data, error } = await anon()
    .from('fantasy_contests')
    .select('id, league_id, competition, season_year, name, status, settings, created_at')
    .eq('id', contestId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapContestRow(data as Record<string, unknown>) : null;
}

/** The lock schedule for a contest, from the DB lock authority table. */
export async function getContestPeriods(contestId: string): Promise<ContestPeriod[]> {
  const { data, error } = await anon()
    .from('fantasy_contest_periods')
    .select('period, lock_at, unlock_at, game_count, complete')
    .eq('contest_id', contestId)
    .order('lock_at');
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    period: r.period as string,
    lockAt: (r.lock_at as string) ?? null,
    unlockAt: (r.unlock_at as string) ?? null,
    gameCount: (r.game_count as number) ?? null,
    complete: Boolean(r.complete),
  }));
}

/** Period rows in the FantasyWeek shape the roster builder already speaks. */
export function periodsToWeeks(periods: ContestPeriod[], now: Date = new Date()): FantasyWeek[] {
  const nowMs = now.getTime();
  return periods.map((p) => {
    const lock = p.lockAt ? new Date(p.lockAt).getTime() : null;
    const unlock = p.unlockAt ? new Date(p.unlockAt).getTime() : null;
    const locked =
      lock != null && nowMs >= lock && (unlock == null ? true : nowMs < unlock);
    return {
      week: p.period,
      lockAt: p.lockAt,
      unlockAt: p.unlockAt,
      gameCount: p.gameCount ?? 0,
      locked,
      complete: p.complete,
    };
  });
}

/** Contest standings = every team in the contest ranked by summed scores. */
export async function getContestStandings(contestId: string): Promise<LeaderboardRow[]> {
  const { data: teams, error } = await anon()
    .from('fantasy_teams')
    .select('id, team_name, owner_display_name, owner_username')
    .eq('contest_id', contestId)
    .limit(500);
  if (error) throw error;
  if (!teams || teams.length === 0) return [];

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

// ─── My leagues (session) ────────────────────────────────────────────────────

export interface MyLeagueRow {
  leagueId: string;
  name: string;
  role: LeagueRole;
  memberCount: number;
}

/** Leagues the signed-in user belongs to. [] when signed out. */
export async function getMyLeagues(): Promise<MyLeagueRow[]> {
  const supabase = sessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('fantasy_league_members')
    .select('league_id, role, fantasy_leagues:league_id (name)')
    .eq('user_id', user.id)
    .order('joined_at', { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as Record<string, unknown>[];
  if (rows.length === 0) return [];

  // One count query across all my leagues (bounded: a user is in few leagues).
  const ids = rows.map((r) => r.league_id as string);
  const { data: memberRows } = await supabase
    .from('fantasy_league_members')
    .select('league_id')
    .in('league_id', ids)
    .limit(1000);
  const counts = new Map<string, number>();
  for (const m of memberRows ?? []) {
    const id = (m as Record<string, unknown>).league_id as string;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  return rows.map((r) => {
    const lg = r.fantasy_leagues as { name?: string } | null;
    return {
      leagueId: r.league_id as string,
      name: lg?.name ?? 'League',
      role: (r.role as LeagueRole) ?? 'member',
      memberCount: counts.get(r.league_id as string) ?? 1,
    };
  });
}

/** The signed-in user's role in a league, or null if not a member. */
export async function getMyLeagueRole(leagueId: string): Promise<LeagueRole | null> {
  const supabase = sessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('fantasy_league_members')
    .select('role')
    .eq('league_id', leagueId)
    .eq('user_id', user.id)
    .maybeSingle();
  return (data?.role as LeagueRole) ?? null;
}

// ─── League writes (session → SECURITY DEFINER RPCs) ─────────────────────────

/** Create a league; the caller becomes owner + commissioner. Returns league id. */
export async function createLeague(name: string): Promise<string> {
  const n = name.trim();
  if (n.length < 1 || n.length > 60) throw new Error('League name must be 1–60 characters.');
  const bad = moderateName(n, 'League name');
  if (bad) throw new Error(bad);
  const { data, error } = await sessionClient().rpc('fantasy_create_league', { p_name: n });
  if (error) throw error;
  return data as string;
}

/** The league's shareable join code — commissioner-only (RPC enforces). */
export async function getLeagueCode(leagueId: string): Promise<string> {
  const { data, error } = await sessionClient().rpc('fantasy_get_league_code', { p_league: leagueId });
  if (error) throw error;
  return data as string;
}

/** Rotate the join code (invalidates the old link). Commissioner-only. */
export async function regenerateLeagueCode(leagueId: string): Promise<string> {
  const { data, error } = await sessionClient().rpc('fantasy_regenerate_league_code', { p_league: leagueId });
  if (error) throw error;
  return data as string;
}

/** Join a league by its shareable code. Idempotent; returns the league id. */
export async function joinLeagueByCode(code: string): Promise<string> {
  const c = code.trim();
  if (!c) throw new Error('Enter an invite code.');
  const { data, error } = await sessionClient().rpc('fantasy_join_league', { p_code: c });
  if (error) throw error;
  return data as string;
}

/** Create (or refresh) an email invite. Commissioner-only. */
export async function createLeagueInvite(
  leagueId: string,
  email: string,
): Promise<{ token: string; expiresAt: string }> {
  const { data, error } = await sessionClient().rpc('fantasy_create_league_invite', {
    p_league: leagueId,
    p_email: email.trim().toLowerCase(),
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown>;
  return { token: row.token as string, expiresAt: row.expires_at as string };
}

/** What an invite link is for — safe to show pre-auth (league name + email). */
export async function previewLeagueInvite(
  token: string,
): Promise<{ leagueName: string; email: string } | null> {
  const { data, error } = await anon().rpc('fantasy_preview_league_invite', { p_token: token });
  if (error) return null;
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  if (!row) return null;
  return { leagueName: row.league_name as string, email: row.email as string };
}

/** Accept an email invite (binds to the caller's auth email). Returns league id. */
export async function acceptLeagueInvite(token: string): Promise<string> {
  const { data, error } = await sessionClient().rpc('fantasy_accept_league_invite', { p_token: token });
  if (error) throw error;
  return data as string;
}

/** Remove a member (commissioner-only; owner can't be removed). */
export async function removeLeagueMember(leagueId: string, userId: string): Promise<void> {
  const { error } = await sessionClient().rpc('fantasy_remove_league_member', {
    p_league: leagueId,
    p_user: userId,
  });
  if (error) throw error;
}

/** Leave a league (owner can't leave their own league). */
export async function leaveLeague(leagueId: string): Promise<void> {
  const { error } = await sessionClient().rpc('fantasy_leave_league', { p_league: leagueId });
  if (error) throw error;
}

// ─── Contest creation ────────────────────────────────────────────────────────

/**
 * Resolve which real EVENT an event-mode contest points at, so the id is
 * frozen into contest settings at creation (no fragile name-matching later).
 * Returns null when the competition/season has no ingested event yet.
 */
export async function resolveEventForCompetition(
  competition: CompetitionId,
  seasonYear: number,
): Promise<{ eventId: string; name: string; startDate: string | null } | null> {
  if (competition === 'usau-club-nationals' || competition === 'usau-college-nationals') {
    const level = competition === 'usau-club-nationals' ? 'CLUB' : 'COLLEGE_D1';
    // Name patterns vary by year ("USA Ultimate Club Nationals" vs "National
    // Championships" vs "D-I College Championships") — match broadly within the
    // level + season, then prefer the latest-starting (Nationals ends a season).
    const { data, error } = await anon()
      .from('usau_events')
      .select('id, name, start_date')
      .eq('season', seasonYear)
      .eq('competition_level', level)
      .or('name.ilike.%nationals%,name.ilike.%national championships%,name.ilike.%college championships%')
      .order('start_date', { ascending: false })
      .limit(5);
    if (error) throw error;
    // Exclude tune-ups/showcases that merely mention "nationals".
    const hit = (data ?? []).find((r: Record<string, unknown>) => {
      const n = (r.name as string).toLowerCase();
      return !n.includes('tune up') && !n.includes('tune-up') && !n.includes('showcase') && !n.includes('training');
    });
    if (!hit) return null;
    return {
      eventId: hit.id as string,
      name: hit.name as string,
      startDate: (hit.start_date as string) ?? null,
    };
  }
  if (competition === 'wfdf-wucc') {
    const { data, error } = await anon()
      .from('wfdf_events')
      .select('id, name, start_date')
      .eq('year', seasonYear)
      .ilike('season_id', 'wucc%')
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      eventId: data.id as string,
      name: data.name as string,
      startDate: (data.start_date as string) ?? null,
    };
  }
  return null; // season competitions don't bind to a single event
}

/**
 * Create a contest inside a league (commissioner-only via RLS). Settings are a
 * frozen snapshot of the competition defaults (+ the resolved eventId for
 * event-mode competitions). Returns the contest id.
 */
export async function createContest(
  leagueId: string,
  competition: CompetitionId,
  seasonYear: number,
  name?: string,
): Promise<string> {
  const def = getCompetition(competition);
  if (!def) throw new Error('Unknown competition.');

  const supabase = sessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  const settings: Record<string, unknown> = { ...def.defaultSettings };
  if (def.mode === 'event') {
    const ev = await resolveEventForCompetition(competition, seasonYear);
    if (!ev) {
      throw new Error(`${def.label} ${seasonYear} isn't in our database yet — try a different season.`);
    }
    settings.eventId = ev.eventId;
  }

  const contestName = (name?.trim() || `${def.label} ${seasonYear}`).slice(0, 60);
  const bad = moderateName(contestName, 'Contest name');
  if (bad) throw new Error(bad);

  const { data, error } = await supabase
    .from('fantasy_contests')
    .insert({
      league_id: leagueId,
      competition,
      season_year: seasonYear,
      name: contestName,
      status: 'open',
      settings,
      created_by: user.id,
    })
    .select('id')
    .single();
  if (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new Error('This league already has a contest for that competition and season.');
    }
    throw error;
  }
  const contestId = data.id as string;

  // Populate the lock schedule right away so rosters open immediately (the
  // scoring job also refreshes periods, but that only runs on game days).
  const { error: rebuildErr } = await supabase.rpc('fantasy_rebuild_contest_periods', {
    p_contest: contestId,
  });
  if (rebuildErr) {
    // Contest exists; periods will backfill on the next job run. Not fatal.
    console.error('fantasy_rebuild_contest_periods failed', rebuildErr);
  }
  return contestId;
}

/** The global/public contest for a competition + season (league_id NULL,
 *  service-managed — e.g. the beta UFA pool), or null if none exists. */
export async function getGlobalContest(
  competition: CompetitionId,
  seasonYear: number,
): Promise<ContestView | null> {
  const { data, error } = await anon()
    .from('fantasy_contests')
    .select('id, league_id, competition, season_year, name, status, settings, created_at')
    .is('league_id', null)
    .eq('competition', competition)
    .eq('season_year', seasonYear)
    .maybeSingle();
  if (error) throw error;
  return data ? mapContestRow(data as Record<string, unknown>) : null;
}

// ─── Contest team (one per member per contest) ───────────────────────────────

/** The signed-in user's team in a contest, or null. */
export async function getMyContestTeam(
  contestId: string,
): Promise<{ id: string; teamName: string } | null> {
  const supabase = sessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('fantasy_teams')
    .select('id, team_name')
    .eq('owner_id', user.id)
    .eq('contest_id', contestId)
    .maybeSingle();
  if (error) throw error;
  return data ? { id: data.id as string, teamName: data.team_name as string } : null;
}

/** Create the signed-in user's team in a contest (must be a league member —
 *  enforced by RLS). Returns the team id. */
export async function createContestTeam(
  contestId: string,
  teamName: string,
  seasonYear: number,
): Promise<string> {
  const supabase = sessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  const name = teamName.trim();
  if (name.length < 1 || name.length > 40) throw new Error('Team name must be 1–40 characters.');
  const bad = moderateName(name, 'Team name');
  if (bad) throw new Error(bad);

  const { data, error } = await supabase
    .from('fantasy_teams')
    .insert({
      owner_id: user.id,
      contest_id: contestId,
      team_name: name,
      season_year: seasonYear,
      league_id: null,
    })
    .select('id')
    .single();
  if (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new Error('You already have a team in this contest.');
    }
    throw error;
  }
  return data.id as string;
}

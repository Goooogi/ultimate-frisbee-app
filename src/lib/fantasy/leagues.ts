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
import type { DraftRef } from './draft-room';
import type { DraftStatus, DraftType } from './draft-room';

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
  logoUrl: string | null;
  logoIcon: string | null;
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
  leagueId: string;
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
    leagueId: r.league_id as string,
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
    .select('id, name, owner_id, created_at, logo_url, logo_icon')
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
    logoUrl: (data.logo_url as string) ?? null,
    logoIcon: (data.logo_icon as string) ?? null,
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

// ─── Contest team (public, competition-agnostic) ─────────────────────────────

export interface ContestTeamView {
  id: string;
  contestId: string;
  teamName: string;
  ownerDisplayName: string | null;
  ownerUsername: string | null;
  totalPoints: number;
  weeklyPoints: { week: string; points: number }[];
}

/** A team's header + per-period totals, scoped to its contest (any
 *  competition). Used by the public contest-scoped team view. */
export async function getContestTeam(teamId: string): Promise<ContestTeamView | null> {
  const { data: team, error } = await anon()
    .from('fantasy_teams')
    .select('id, contest_id, team_name, owner_display_name, owner_username')
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
    id: team.id as string,
    contestId: team.contest_id as string,
    teamName: team.team_name as string,
    ownerDisplayName: (team.owner_display_name as string) ?? null,
    ownerUsername: (team.owner_username as string) ?? null,
    totalPoints: roundPoints(weekly.reduce((acc, w) => acc + w.points, 0)),
    weeklyPoints: weekly,
  };
}

// ─── My leagues (session) ────────────────────────────────────────────────────

export interface MyLeagueContestRow {
  contestId: string;
  competition: CompetitionId;
  competitionDef: CompetitionDef;
  seasonYear: number;
  name: string;
  status: ContestStatus;
  settings: ContestSettings;
  draft: { status: 'scheduled' | 'live' | 'complete'; type: 'snake' | 'auction'; scheduledAt: string | null } | null;
}

export interface MyLeagueRow {
  leagueId: string;
  name: string;
  role: LeagueRole;
  memberCount: number;
  logoUrl: string | null;
  logoIcon: string | null;
  contests: MyLeagueContestRow[];
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
    .select('league_id, role, fantasy_leagues:league_id (name, logo_url, logo_icon)')
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

  // Fan out to each league's contests, then to each contest's draft — two
  // bounded queries (a user is in few leagues, a league has few contests),
  // so the hub can show a one-glance status chip per league row without a
  // per-row round trip.
  const { data: contestRows } = await supabase
    .from('fantasy_contests')
    .select('id, league_id, competition, season_year, name, status, settings')
    .in('league_id', ids)
    .limit(1000);
  const contestsByLeague = new Map<string, Record<string, unknown>[]>();
  for (const c of contestRows ?? []) {
    const leagueId = (c as Record<string, unknown>).league_id as string;
    const list = contestsByLeague.get(leagueId) ?? [];
    list.push(c as Record<string, unknown>);
    contestsByLeague.set(leagueId, list);
  }

  const contestIds = (contestRows ?? []).map((c) => (c as Record<string, unknown>).id as string);
  const draftsByContest = new Map<string, Record<string, unknown>>();
  if (contestIds.length > 0) {
    const { data: draftRows } = await supabase
      .from('fantasy_drafts')
      .select('contest_id, status, draft_type, scheduled_at')
      .in('contest_id', contestIds)
      .limit(1000);
    for (const d of draftRows ?? []) {
      const row = d as Record<string, unknown>;
      draftsByContest.set(row.contest_id as string, row);
    }
  }

  return rows.map((r) => {
    const lg = r.fantasy_leagues as { name?: string; logo_url?: string | null; logo_icon?: string | null } | null;
    const leagueId = r.league_id as string;
    const contests: MyLeagueContestRow[] = (contestsByLeague.get(leagueId) ?? [])
      .map((c): MyLeagueContestRow | null => {
        const def = getCompetition(c.competition as string);
        if (!def) return null;
        const draftRow = draftsByContest.get(c.id as string);
        return {
          contestId: c.id as string,
          competition: def.id,
          competitionDef: def,
          seasonYear: c.season_year as number,
          name: c.name as string,
          status: (c.status as ContestStatus) ?? 'open',
          settings: parseContestSettings(def, c.settings),
          draft: draftRow
            ? {
                status: draftRow.status as DraftStatus,
                type: (draftRow.draft_type as DraftType) ?? 'snake',
                scheduledAt: (draftRow.scheduled_at as string) ?? null,
              }
            : null,
        };
      })
      .filter((c): c is MyLeagueContestRow => c !== null);

    return {
      leagueId,
      name: lg?.name ?? 'League',
      role: (r.role as LeagueRole) ?? 'member',
      memberCount: counts.get(leagueId) ?? 1,
      logoUrl: lg?.logo_url ?? null,
      logoIcon: lg?.logo_icon ?? null,
      contests,
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

/** Rename a league (commissioner-only; RPC enforces). */
export async function renameLeague(leagueId: string, name: string): Promise<string> {
  const n = name.trim();
  if (n.length < 1 || n.length > 60) throw new Error('League name must be 1–60 characters.');
  const bad = moderateName(n, 'League name');
  if (bad) throw new Error(bad);
  const { error } = await sessionClient().rpc('fantasy_rename_league', {
    p_league: leagueId,
    p_name: n,
  });
  if (error) throw error;
  return n;
}

/** Roster composition for one contest (commissioner-only; RPC enforces).
 *  weekly-stats games pass offenders+defenders, event games pass flex. */
export async function updateContestRoster(
  contestId: string,
  input: { offenders?: number; defenders?: number; flex?: number },
): Promise<void> {
  const { error } = await sessionClient().rpc('fantasy_update_contest_roster', {
    p_contest: contestId,
    p_offenders: input.offenders ?? null,
    p_defenders: input.defenders ?? null,
    p_flex: input.flex ?? null,
  });
  if (error) throw error;
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

// ─── Account-deletion pre-flight (owner → transfer) ──────────────────────────

export interface BlockingLeague {
  leagueId: string;
  leagueName: string;
  otherMemberCount: number;
}

/** Leagues the signed-in user owns that still have other members — deleting
 *  the account would delete these leagues out from under everyone else.
 *  Called before account deletion; [] means nothing blocks it. */
export async function getLeaguesBlockingAccountDeletion(): Promise<BlockingLeague[]> {
  const { data, error } = await sessionClient().rpc('fantasy_leagues_blocking_account_deletion');
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    leagueId: r.league_id as string,
    leagueName: r.league_name as string,
    otherMemberCount: r.other_member_count as number,
  }));
}

/** Hand league ownership to another member (caller must be the current
 *  owner; RPC enforces). Used to unblock account deletion. */
export async function transferLeagueOwnership(leagueId: string, newOwnerId: string): Promise<void> {
  const { error } = await sessionClient().rpc('fantasy_transfer_league_ownership', {
    p_league: leagueId,
    p_new_owner: newOwnerId,
  });
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
): Promise<{ eventId: string; name: string; startDate: string | null; endDate: string | null } | null> {
  if (competition === 'usau-club-nationals' || competition === 'usau-college-nationals') {
    const level = competition === 'usau-club-nationals' ? 'CLUB' : 'COLLEGE_D1';
    // Name patterns vary by year ("USA Ultimate Club Nationals" vs "National
    // Championships" vs "D-I College Championships") — match broadly within the
    // level + season, then prefer the latest-starting (Nationals ends a season).
    const { data, error } = await anon()
      .from('usau_events')
      .select('id, name, start_date, end_date')
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
      endDate: (hit.end_date as string) ?? null,
    };
  }
  if (competition === 'wfdf-wucc') {
    // ANY WFDF event, not just WUCC: the season's soonest event that hasn't
    // ended yet (WJUC, WMUCC, WUGC…). Rosters and teams are keyed per event
    // id, so the draft pool and scoring need no change. The hub's "Play greys
    // out until a startDate exists" rule then activates WFDF on its own as
    // soon as an upcoming event is ingested.
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await anon()
      .from('wfdf_events')
      .select('id, name, start_date, end_date')
      .eq('year', seasonYear)
      .not('start_date', 'is', null)
      .or(`end_date.gte.${today},and(end_date.is.null,start_date.gte.${today})`)
      .order('start_date', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      eventId: data.id as string,
      name: data.name as string,
      startDate: (data.start_date as string) ?? null,
      endDate: (data.end_date as string) ?? null,
    };
  }
  if (competition === 'eucs') {
    const { data, error } = await anon()
      .from('euf_events')
      .select('id, name, start_date, end_date')
      .eq('year', seasonYear)
      .eq('kind', 'eucf')
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (data) {
      return {
        eventId: data.id as string,
        name: data.name as string,
        startDate: (data.start_date as string) ?? null,
        endDate: (data.end_date as string) ?? null,
      };
    }
    // Fallback: kind may be mis-tagged for older rows — match by name.
    const fallback = await anon()
      .from('euf_events')
      .select('id, name, start_date, end_date')
      .eq('year', seasonYear)
      .ilike('name', '%EUCF%')
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (fallback.error) throw fallback.error;
    if (!fallback.data) return null;
    return {
      eventId: fallback.data.id as string,
      name: fallback.data.name as string,
      startDate: (fallback.data.start_date as string) ?? null,
      endDate: (fallback.data.end_date as string) ?? null,
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

// ─── League limits, logo, format (commissioner-only RPCs) ────────────────────

/** Team cap for a contest (commissioner-only). unlimited only applies to
 *  USAU Club Nationals. */
export async function setContestLimits(contestId: string, maxTeams: number, unlimited?: boolean): Promise<void> {
  const { error } = await sessionClient().rpc('fantasy_set_contest_limits', {
    p_contest: contestId,
    p_max_teams: maxTeams,
    p_unlimited: unlimited ?? false,
  });
  if (error) throw error;
}

/** Set a league's logo — a custom uploaded url XOR a stock icon token, never
 *  both (pass the other as null). Commissioner-only. */
export async function setLeagueLogo(leagueId: string, logo: { url: string | null; icon: string | null }): Promise<void> {
  const { error } = await sessionClient().rpc('fantasy_set_league_logo', {
    p_league: leagueId,
    p_url: logo.url,
    p_icon: logo.icon,
  });
  if (error) throw error;
}

/** Set a weekly-stats contest's scoring format (h2h or points). Commissioner-
 *  only; locked once a schedule has been generated. */
export async function setContestFormat(contestId: string, format: 'h2h' | 'points'): Promise<void> {
  const { error } = await sessionClient().rpc('fantasy_set_contest_format', {
    p_contest: contestId,
    p_format: format,
  });
  if (error) throw error;
}

/** Generate the H2H schedule for a contest (needs >=4 teams, >=3 future
 *  periods). Commissioner-only; usually triggered automatically on draft
 *  completion, but exposed for manual/no-draft leagues too. */
export async function generateSchedule(contestId: string): Promise<number> {
  const { data, error } = await sessionClient().rpc('fantasy_generate_schedule', { p_contest: contestId });
  if (error) throw error;
  return (data as number) ?? 0;
}

// ─── H2H matchups + standings ─────────────────────────────────────────────────

export interface Matchup {
  id: string;
  contestId: string;
  period: string;
  stage: 'regular' | 'semifinal' | 'final' | 'third';
  homeTeamId: string;
  awayTeamId: string | null;
  homeSeed: number | null;
  awaySeed: number | null;
  homePoints: number | null;
  awayPoints: number | null;
  winnerTeamId: string | null;
  scored: boolean;
}

export interface H2HStandingRow {
  teamId: string;
  teamName: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  rank: number;
}

function mapMatchup(r: Record<string, unknown>): Matchup {
  return {
    id: r.id as string,
    contestId: r.contest_id as string,
    period: r.period as string,
    stage: r.stage as Matchup['stage'],
    homeTeamId: r.home_team_id as string,
    awayTeamId: (r.away_team_id as string) ?? null,
    homeSeed: (r.home_seed as number) ?? null,
    awaySeed: (r.away_seed as number) ?? null,
    homePoints: r.home_points != null ? Number(r.home_points) : null,
    awayPoints: r.away_points != null ? Number(r.away_points) : null,
    winnerTeamId: (r.winner_team_id as string) ?? null,
    scored: Boolean(r.scored),
  };
}

/** A contest's H2H matchups, optionally scoped to one period. Public read. */
export async function getMatchups(contestId: string, period?: string): Promise<Matchup[]> {
  let q = anon()
    .from('fantasy_matchups')
    .select('id, contest_id, period, stage, home_team_id, away_team_id, home_seed, away_seed, home_points, away_points, winner_team_id, scored')
    .eq('contest_id', contestId)
    .order('period');
  if (period) q = q.eq('period', period);
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(mapMatchup);
}

/** H2H standings for a contest (wins/losses/ties, points for/against, rank).
 *  Public read. */
export async function getH2HStandings(contestId: string): Promise<H2HStandingRow[]> {
  const { data, error } = await anon().rpc('fantasy_h2h_standings', { p_contest: contestId });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    teamId: r.team_id as string,
    teamName: r.team_name as string,
    wins: r.wins as number,
    losses: r.losses as number,
    ties: r.ties as number,
    pointsFor: Number(r.points_for),
    pointsAgainst: Number(r.points_against),
    rank: r.rank as number,
  }));
}

// ─── Ownership / add-drop ──────────────────────────────────────────────────────

export interface TeamPlayer {
  contestId: string;
  teamId: string;
  playerLeague: string;
  playerId: string;
  playerName: string;
  acquiredVia: 'draft' | 'add';
  price: number | null;
  acquiredAt: string;
}

function mapTeamPlayer(r: Record<string, unknown>): TeamPlayer {
  return {
    contestId: r.contest_id as string,
    teamId: r.team_id as string,
    playerLeague: r.player_league as string,
    playerId: r.player_id as string,
    playerName: r.player_name as string,
    acquiredVia: r.acquired_via as 'draft' | 'add',
    price: (r.price as number) ?? null,
    acquiredAt: r.acquired_at as string,
  };
}

/** A contest's ownership ledger (or one team's slice of it). Public read. */
export async function getTeamPlayers(contestId: string, teamId?: string): Promise<TeamPlayer[]> {
  let q = anon()
    .from('fantasy_team_players')
    .select('contest_id, team_id, player_league, player_id, player_name, acquired_via, price, acquired_at')
    .eq('contest_id', contestId);
  if (teamId) q = q.eq('team_id', teamId);
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(mapTeamPlayer);
}

/** Swap a player your team owns for an undrafted player from the season
 *  pool. Drafted weekly-stats contests only; blocked while the current
 *  period's games are in progress. */
export async function addDrop(
  contestId: string,
  drop: DraftRef,
  add: DraftRef,
): Promise<void> {
  const { error } = await sessionClient().rpc('fantasy_add_drop', {
    p_contest: contestId,
    p_drop_league: drop.playerLeague,
    p_drop_id: drop.playerId,
    p_add_league: add.playerLeague,
    p_add_id: add.playerId,
    p_add_name: add.playerName,
  });
  if (error) throw error;
}

// ─── Trades (2026-09-08) ───────────────────────────────────────────────────

export type TradeStatus = 'proposed' | 'accepted' | 'executed' | 'rejected' | 'cancelled' | 'vetoed';

export interface TradeRef {
  playerLeague: string;
  playerId: string;
  playerName: string;
}

export interface Trade {
  id: string;
  contestId: string;
  proposerTeamId: string;
  receiverTeamId: string;
  give: TradeRef[];
  get: TradeRef[];
  note: string | null;
  status: TradeStatus;
  createdBy: string;
  createdAt: string;
  respondedAt: string | null;
  /** When an accepted trade executes unless the commissioner vetoes/approves. */
  executesAt: string | null;
  executedAt: string | null;
}

function mapTrade(r: Record<string, unknown>): Trade {
  return {
    id: r.id as string,
    contestId: r.contest_id as string,
    proposerTeamId: r.proposer_team_id as string,
    receiverTeamId: r.receiver_team_id as string,
    give: (r.give as TradeRef[]) ?? [],
    get: (r.get as TradeRef[]) ?? [],
    note: (r.note as string | null) ?? null,
    status: r.status as TradeStatus,
    createdBy: r.created_by as string,
    createdAt: r.created_at as string,
    respondedAt: (r.responded_at as string | null) ?? null,
    executesAt: (r.executes_at as string | null) ?? null,
    executedAt: (r.executed_at as string | null) ?? null,
  };
}

/** Public: every trade in a contest, newest first. */
export async function getTrades(contestId: string): Promise<Trade[]> {
  const { data, error } = await sessionClient().from('fantasy_trades').select('*').eq('contest_id', contestId).order('created_at', { ascending: false }).limit(200);
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(mapTrade);
}

/** Member: offer `give` (mine) for `get` (theirs). 1–4 players a side. */
export async function proposeTrade(contestId: string, receiverTeamId: string, give: TradeRef[], get: TradeRef[], note?: string): Promise<Trade> {
  const { data, error } = await sessionClient().rpc('fantasy_propose_trade', {
    p_contest: contestId,
    p_receiver_team: receiverTeamId,
    p_give: give,
    p_get: get,
    p_note: note ?? null,
  });
  if (error) throw error;
  return mapTrade(data as Record<string, unknown>);
}

export type TradeAction = 'accept' | 'reject' | 'cancel' | 'veto' | 'approve';

/** accept/reject (receiver) · cancel (proposer) · veto/approve (commissioner). */
export async function respondTrade(tradeId: string, action: TradeAction): Promise<Trade> {
  const { data, error } = await sessionClient().rpc('fantasy_respond_trade', { p_trade: tradeId, p_action: action });
  if (error) throw error;
  return mapTrade(data as Record<string, unknown>);
}

// ─── Waivers / FAAB (2026-09-08) ─────────────────────────────────────────────

export type WaiverMode = 'none' | 'faab';
export type WaiverClaimStatus = 'pending' | 'won' | 'lost' | 'voided' | 'cancelled';

export interface WaiverPlayer {
  contestId: string;
  playerLeague: string;
  playerId: string;
  playerName: string;
  /** When claims on this player resolve (drop time + waiver window). */
  availableAt: string;
}

export interface WaiverClaim {
  id: string;
  contestId: string;
  teamId: string;
  add: TradeRef;
  drop: TradeRef | null;
  bid: number;
  status: WaiverClaimStatus;
  processAt: string;
  createdAt: string;
  resolvedAt: string | null;
}

/** Effective waiver settings for a contest (absent = first-come add/drop). */
export function waiverSettings(settings: ContestSettings): { mode: WaiverMode; budget: number; hours: number } {
  const raw = settings as unknown as Record<string, unknown>;
  return {
    mode: raw.waivers === 'faab' ? 'faab' : 'none',
    budget: typeof raw.faabBudget === 'number' ? (raw.faabBudget as number) : 100,
    hours: typeof raw.waiverHours === 'number' ? (raw.waiverHours as number) : 48,
  };
}

/** Commissioner: waiver mode + FAAB budget + window hours. */
export async function setWaiverSettings(contestId: string, mode: WaiverMode, budget = 100, hours = 48): Promise<void> {
  const { error } = await sessionClient().rpc('fantasy_set_waiver_settings', {
    p_contest: contestId,
    p_mode: mode,
    p_budget: budget,
    p_hours: hours,
  });
  if (error) throw error;
}

/** Public: players currently inside their waiver window. */
export async function getWaiverPlayers(contestId: string): Promise<WaiverPlayer[]> {
  const { data, error } = await anon().from('fantasy_waiver_players').select('*').eq('contest_id', contestId).limit(500);
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    contestId: r.contest_id as string,
    playerLeague: r.player_league as string,
    playerId: r.player_id as string,
    playerName: r.player_name as string,
    availableAt: r.available_at as string,
  }));
}

function mapWaiverClaim(r: Record<string, unknown>): WaiverClaim {
  return {
    id: r.id as string,
    contestId: r.contest_id as string,
    teamId: r.team_id as string,
    add: { playerLeague: r.add_league as string, playerId: r.add_id as string, playerName: r.add_name as string },
    drop: r.drop_id ? { playerLeague: r.drop_league as string, playerId: r.drop_id as string, playerName: (r.drop_name as string) ?? '' } : null,
    bid: Number(r.bid ?? 0),
    status: r.status as WaiverClaimStatus,
    processAt: r.process_at as string,
    createdAt: r.created_at as string,
    resolvedAt: (r.resolved_at as string | null) ?? null,
  };
}

/** My pending claims + everyone's resolved claims (RLS). Newest first. */
export async function getWaiverClaims(contestId: string): Promise<WaiverClaim[]> {
  const { data, error } = await sessionClient().from('fantasy_waiver_claims').select('*').eq('contest_id', contestId).order('created_at', { ascending: false }).limit(200);
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(mapWaiverClaim);
}

/** FAAB dollars already spent by a team. */
export async function getFaabSpent(contestId: string, teamId: string): Promise<number> {
  const { data, error } = await anon().rpc('fantasy_faab_spent', { p_contest: contestId, p_team: teamId });
  if (error) throw error;
  return Number(data ?? 0);
}

/** Place (or replace) a sealed bid. `drop` optional when the roster has room. */
export async function claimWaiver(contestId: string, add: TradeRef, bid: number, drop?: TradeRef | null): Promise<WaiverClaim> {
  const { data, error } = await sessionClient().rpc('fantasy_claim_waiver', {
    p_contest: contestId,
    p_add_league: add.playerLeague,
    p_add_id: add.playerId,
    p_add_name: add.playerName,
    p_bid: bid,
    p_drop_league: drop?.playerLeague ?? null,
    p_drop_id: drop?.playerId ?? null,
  });
  if (error) throw error;
  return mapWaiverClaim(data as Record<string, unknown>);
}

export async function cancelWaiverClaim(claimId: string): Promise<void> {
  const { error } = await sessionClient().rpc('fantasy_cancel_waiver_claim', { p_claim: claimId });
  if (error) throw error;
}

// Multi-league draft + roster operations for CONTEST teams.
//
// The beta's data.ts speaks UFA only (searchDraftablePlayers, saveRoster).
// This module is the contest-aware generalization: which player pool a contest
// drafts from, how a roster is composed, and when it locks all come from the
// ContestView (competition def + frozen settings snapshot).
//
// Player identity per league (fantasy_roster_slots.player_league + player_id):
//   ufa  → ufa_players.id (stable slug)
//   pul  → player_name (the pul_* natural key; name-keyed like player_edges)
//   wul  → player_name (same)
//   usau → usau_players.id (uuid — joins usau_player_event_stats for scoring)
//   wfdf → wfdf_rosters.id (uuid — the roster ROW carries the event stats)
//
// Lock enforcement: fantasy_contest_periods is the DB authority (generic
// trigger). The client check here exists only for a friendly error message.

import { createClient as createSessionClient } from '@/lib/supabase/client';
import { createClient as createAnonClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseUrl, supabaseAnonKey } from '@/lib/supabase/env';
import { scoreStatLine, roundPoints, type FantasyRole } from './scoring';
import type { FantasyPlayerHit } from './data';
import { getContestPeriods, periodsToWeeks, type ContestView } from './leagues';
import type { FantasyPlayerLeague } from './competitions';

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

function escapeIlike(needle: string): string {
  return needle.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Roles valid for a contest mode. */
export type ContestRole = FantasyRole | 'flex';

export interface ContestRosterSlot {
  playerId: string;
  playerLeague: FantasyPlayerLeague;
  role: ContestRole;
  fullName: string;
  teamName: string | null;
}

// ─── Player search per contest ───────────────────────────────────────────────

/** Search the draftable player pool for a contest. */
export async function searchContestPlayers(
  contest: ContestView,
  query: string,
  limit = 20,
): Promise<FantasyPlayerHit[]> {
  const needle = query.trim();
  if (needle.length < 2) return [];
  const pat = `%${escapeIlike(needle)}%`;
  const league = contest.competitionDef.playerLeague;

  if (league === 'ufa') {
    const { data, error } = await anon()
      .from('ufa_players')
      .select('id, full_name, current_team_id, ufa_teams:current_team_id (name, full_name)')
      .ilike('full_name', pat)
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

  if (league === 'pul' || league === 'wul') {
    const table = league === 'pul' ? 'pul_players' : 'wul_players';
    const teamsRel = league === 'pul' ? 'pul_teams' : 'wul_teams';
    const { data, error } = await anon()
      .from(table)
      .select(`player_name, team_id, ${teamsRel}:team_id (name, city, mascot)`)
      .eq('season', contest.seasonYear)
      .ilike('player_name', pat)
      .order('player_name')
      .limit(limit * 2); // room for cross-team dupes before dedup
    if (error) throw error;
    const seen = new Set<string>();
    const hits: FantasyPlayerHit[] = [];
    for (const raw of data ?? []) {
      const r = raw as Record<string, unknown>;
      const name = r.player_name as string;
      if (seen.has(name)) continue;
      seen.add(name);
      const team = r[teamsRel] as { name?: string; city?: string; mascot?: string } | null;
      hits.push({
        playerId: name,
        fullName: name,
        teamId: (r.team_id as string) ?? null,
        teamName: team?.name ?? [team?.city, team?.mascot].filter(Boolean).join(' ') ?? null,
      });
      if (hits.length >= limit) break;
    }
    return hits;
  }

  if (league === 'usau') {
    const eventId = contest.settings.mode === 'event' ? contest.settings.eventId : undefined;
    if (!eventId) return [];
    // Teams entered in the event → their season rosters, name-searched.
    const { data: eventTeams, error: etErr } = await anon()
      .from('usau_event_teams')
      .select('team_id')
      .eq('event_id', eventId)
      .limit(200);
    if (etErr) throw etErr;
    const teamIds = (eventTeams ?? []).map((t: Record<string, unknown>) => t.team_id as string);
    if (teamIds.length === 0) return [];

    const { data, error } = await anon()
      .from('usau_rosters')
      .select('player_id, team_id, usau_players!inner (display_name), usau_teams:team_id (name)')
      .in('team_id', teamIds)
      .eq('season', contest.seasonYear)
      .ilike('usau_players.display_name', pat)
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map((raw: Record<string, unknown>) => {
      const p = raw.usau_players as { display_name?: string } | null;
      const t = raw.usau_teams as { name?: string } | null;
      return {
        playerId: raw.player_id as string,
        fullName: p?.display_name ?? 'Unknown',
        teamId: (raw.team_id as string) ?? null,
        teamName: t?.name ?? null,
      };
    });
  }

  // wfdf — roster rows ARE the player pool for the event.
  const eventId = contest.settings.mode === 'event' ? contest.settings.eventId : undefined;
  if (!eventId) return [];
  const { data, error } = await anon()
    .from('wfdf_rosters')
    .select('id, full_name, team_id, wfdf_teams:team_id (name, country_code)')
    .eq('event_id', eventId)
    .ilike('full_name', pat)
    .order('full_name')
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((raw: Record<string, unknown>) => {
    const t = raw.wfdf_teams as { name?: string; country_code?: string } | null;
    return {
      playerId: raw.id as string,
      fullName: (raw.full_name as string) ?? 'Unknown',
      teamId: (raw.team_id as string) ?? null,
      teamName: t?.name ?? t?.country_code ?? null,
    };
  });
}

// ─── Roster read (public) ────────────────────────────────────────────────────

/** A contest team's roster for one period, with display names resolved. */
export async function getContestTeamRoster(
  contest: ContestView,
  teamId: string,
  period: string,
): Promise<ContestRosterSlot[]> {
  const { data, error } = await anon()
    .from('fantasy_roster_slots')
    .select('player_id, player_league, role')
    .eq('team_id', teamId)
    .eq('week', period);
  if (error) throw error;
  const slots = (data ?? []).map((r: Record<string, unknown>) => ({
    playerId: r.player_id as string,
    playerLeague: r.player_league as FantasyPlayerLeague,
    role: r.role as ContestRole,
  }));
  if (slots.length === 0) return [];

  const ids = slots.map((s) => s.playerId);
  const league = contest.competitionDef.playerLeague;
  const names = new Map<string, { fullName: string; teamName: string | null }>();

  if (league === 'ufa') {
    const { data: rows } = await anon()
      .from('ufa_players')
      .select('id, full_name, ufa_teams:current_team_id (name, full_name)')
      .in('id', ids);
    for (const raw of rows ?? []) {
      const r = raw as Record<string, unknown>;
      const t = r.ufa_teams as { name?: string; full_name?: string } | null;
      names.set(r.id as string, {
        fullName: (r.full_name as string) ?? (r.id as string),
        teamName: t?.full_name ?? t?.name ?? null,
      });
    }
  } else if (league === 'pul' || league === 'wul') {
    const table = league === 'pul' ? 'pul_players' : 'wul_players';
    const teamsRel = league === 'pul' ? 'pul_teams' : 'wul_teams';
    const { data: rows } = await anon()
      .from(table)
      .select(`player_name, ${teamsRel}:team_id (name, city, mascot)`)
      .eq('season', contest.seasonYear)
      .in('player_name', ids);
    for (const raw of rows ?? []) {
      const r = raw as Record<string, unknown>;
      const t = r[teamsRel] as { name?: string; city?: string; mascot?: string } | null;
      names.set(r.player_name as string, {
        fullName: r.player_name as string,
        teamName: t?.name ?? [t?.city, t?.mascot].filter(Boolean).join(' ') ?? null,
      });
    }
  } else if (league === 'usau') {
    const { data: rows } = await anon()
      .from('usau_players')
      .select('id, display_name')
      .in('id', ids);
    for (const raw of rows ?? []) {
      const r = raw as Record<string, unknown>;
      names.set(r.id as string, {
        fullName: (r.display_name as string) ?? 'Unknown',
        teamName: null,
      });
    }
    // Team names via the event's roster mapping (bounded: 7 players).
    const eventId = contest.settings.mode === 'event' ? contest.settings.eventId : undefined;
    if (eventId) {
      const { data: rosterRows } = await anon()
        .from('usau_rosters')
        .select('player_id, usau_teams:team_id (name)')
        .eq('season', contest.seasonYear)
        .in('player_id', ids);
      for (const raw of rosterRows ?? []) {
        const r = raw as Record<string, unknown>;
        const t = r.usau_teams as { name?: string } | null;
        const cur = names.get(r.player_id as string);
        if (cur && t?.name) cur.teamName = t.name;
      }
    }
  } else {
    // wfdf
    const { data: rows } = await anon()
      .from('wfdf_rosters')
      .select('id, full_name, wfdf_teams:team_id (name, country_code)')
      .in('id', ids);
    for (const raw of rows ?? []) {
      const r = raw as Record<string, unknown>;
      const t = r.wfdf_teams as { name?: string; country_code?: string } | null;
      names.set(r.id as string, {
        fullName: (r.full_name as string) ?? 'Unknown',
        teamName: t?.name ?? t?.country_code ?? null,
      });
    }
  }

  return slots.map((s) => {
    const n = names.get(s.playerId);
    return {
      ...s,
      fullName: n?.fullName ?? s.playerId,
      teamName: n?.teamName ?? null,
    };
  });
}

// ─── Roster save (session) ───────────────────────────────────────────────────

export interface ContestRosterInput {
  playerId: string;
  role: ContestRole;
}

/**
 * Replace a contest team's roster for one period. Validates composition
 * against the contest's frozen settings and the period lock (friendly errors);
 * the DB composition + lock triggers are the real enforcement.
 */
export async function saveContestRoster(
  contest: ContestView,
  teamId: string,
  period: string,
  slots: ContestRosterInput[],
): Promise<void> {
  const supabase = sessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  const s = contest.settings;
  if (s.mode === 'weekly-stats') {
    const off = slots.filter((x) => x.role === 'offender').length;
    const def = slots.filter((x) => x.role === 'defender').length;
    if (slots.length !== s.offenders + s.defenders || off !== s.offenders || def !== s.defenders) {
      throw new Error(`Roster must be exactly ${s.offenders} offenders and ${s.defenders} defenders.`);
    }
  } else {
    const flex = slots.filter((x) => x.role === 'flex').length;
    if (slots.length !== s.flex || flex !== s.flex) {
      throw new Error(`Roster must be exactly ${s.flex} players.`);
    }
  }
  const unique = new Set(slots.map((x) => x.playerId));
  if (unique.size !== slots.length) throw new Error('A player can only be rostered once.');

  // Lock check against the period table (the DB trigger is the backstop).
  const weeks = periodsToWeeks(await getContestPeriods(contest.id));
  const target = weeks.find((w) => w.week === period);
  if (!target) throw new Error('This period is not open for rosters yet.');
  if (target.locked) throw new Error('This roster is locked — play has started.');

  const del = await supabase
    .from('fantasy_roster_slots')
    .delete()
    .eq('team_id', teamId)
    .eq('week', period);
  if (del.error) throw del.error;

  const league = contest.competitionDef.playerLeague;
  const rows = slots.map((x) => ({
    team_id: teamId,
    week: period,
    player_id: x.playerId,
    player_league: league,
    role: x.role,
  }));
  const ins = await supabase.from('fantasy_roster_slots').insert(rows);
  if (ins.error) throw ins.error;
}

// ─── Draft preview (weekly-stats leagues only) ───────────────────────────────

/**
 * Season-to-date points a player would score in a role — the builder's
 * "gamble" hint. Uses the leagues' season-aggregate tables (cheap single-row
 * reads). Event-mode competitions return null (no meaningful prior data).
 */
export async function previewContestPlayerPoints(
  contest: ContestView,
  playerId: string,
  role: FantasyRole,
): Promise<number | null> {
  const league = contest.competitionDef.playerLeague;

  if (league === 'ufa') {
    const { data, error } = await anon()
      .from('ufa_game_player_stats')
      .select('goals, assists, blocks, throwaways, drops, stalls, yards_thrown, yards_received, ufa_games!inner(year)')
      .eq('player_id', playerId)
      .eq('ufa_games.year', contest.seasonYear);
    if (error) throw error;
    let total = 0;
    for (const raw of data ?? []) {
      const r = raw as unknown as Record<string, number>;
      total += scoreStatLine(
        {
          goals: r.goals ?? 0,
          assists: r.assists ?? 0,
          blocks: r.blocks ?? 0,
          turnovers: (r.throwaways ?? 0) + (r.drops ?? 0) + (r.stalls ?? 0),
          yards: (r.yards_thrown ?? 0) + (r.yards_received ?? 0),
        },
        role,
      );
    }
    return roundPoints(total);
  }

  if (league === 'pul' || league === 'wul') {
    const table = league === 'pul' ? 'pul_players' : 'wul_players';
    // pul_players has no yardage column at all — only select it for WUL.
    const cols = league === 'wul' ? 'goals, assists, blocks, turnovers, yards_total' : 'goals, assists, blocks, turnovers';
    const { data, error } = await anon()
      .from(table)
      .select(cols)
      .eq('season', contest.seasonYear)
      .eq('player_name', playerId);
    if (error) throw error;
    let total = 0;
    for (const raw of data ?? []) {
      const r = raw as unknown as Record<string, number | null>;
      total += scoreStatLine(
        {
          goals: r.goals ?? 0,
          assists: r.assists ?? 0,
          blocks: r.blocks ?? 0,
          turnovers: r.turnovers ?? 0,
          yards: league === 'wul' ? (r.yards_total as number | null) ?? 0 : 0,
        },
        role,
      );
    }
    return roundPoints(total);
  }

  return null; // event-mode: no pre-event preview
}

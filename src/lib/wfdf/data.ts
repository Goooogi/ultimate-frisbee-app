// WFDF (World Flying Disc Federation "Worlds") data layer — public read-only.
//
// Mirrors src/lib/usau/data.ts but EVENT-CENTRIC: each Worlds event (WMUCC,
// WJUC, WBUC, WWUC…) is a distinct tournament with its own division set. Data
// is ingested from the WFDF results static cache by the wfdf-ingest edge
// function (see memory project_wfdf_results_source) into wfdf_* tables.
//
// wfdf_* tables are NOT in database.types.ts; we cast rows via local interfaces,
// same approach as pul/wul data.ts. Reads use the anon publishable key; RLS on
// wfdf_* is world-readable.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseUrl, supabaseAnonKey } from '@/lib/supabase/env';
import { namesMatch, surnameForPrefilter } from '@/lib/name-match';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

let _client: AnyClient | null = null;
function supabase(): AnyClient {
  if (_client) return _client;
  _client = createClient(supabaseUrl(), supabaseAnonKey(), { auth: { persistSession: false } });
  return _client;
}

// ─── Public shapes ────────────────────────────────────────────────────────────

export interface WfdfEventCard {
  id: string;
  slug: string;
  name: string;
  year: number;
  kind: string;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  isNationalTeams: boolean;
  logoUrl: string | null;
  teamCount: number;
}

export interface WfdfDivision {
  id: string;
  name: string;
  ordering: string | null;
}

export interface WfdfTeamCard {
  id: string;
  name: string;
  abbreviation: string | null;
  countryCode: string | null;
  countryName: string | null;
  flagFile: string | null;
  divisionName: string | null;
  seed: number | null;
  finalStanding: number | null;
  wins: number | null;
  losses: number | null;
  spiritAvg: number | null;
}

export interface WfdfGameRow {
  id: string;
  divisionName: string | null;
  homeTeamId: string | null;
  homeTeam: string | null;
  homeCountry: string | null;
  homeScore: number | null;
  awayTeamId: string | null;
  awayTeam: string | null;
  awayCountry: string | null;
  awayScore: number | null;
  homeSotg: number | null;
  awaySotg: number | null;
  poolName: string | null;
  isBracket: boolean;
  status: string;
  scheduledAt: string | null;
}

export interface WfdfRosterPlayer {
  wfdfPlayerId: number;
  fullName: string;
  jerseyNumber: string | null;
  goals: number | null;
  assists: number | null;
  games: number | null;
  total: number | null;
}

export interface WfdfEventDetail extends WfdfEventCard {
  divisions: WfdfDivision[];
  teams: WfdfTeamCard[];
  games: WfdfGameRow[];
}

export interface WfdfTeamSummary {
  id: string;
  name: string;
  abbreviation: string | null;
  countryCode: string | null;
  countryName: string | null;
  flagFile: string | null;
  divisionName: string | null;
  eventId: string;
  eventName: string;
  eventSlug: string;
  eventYear: number;
  seed: number | null;
  finalStanding: number | null;
  wins: number | null;
  losses: number | null;
  scoresFor: number | null;
  scoresAgainst: number | null;
  spiritAvg: number | null;
  roster: WfdfRosterPlayer[];
  games: WfdfGameRow[];
}

// A player's WFDF appearances, grouped for the unified profile merge.
export interface WfdfPlayerStint {
  teamId: string;
  teamName: string;
  countryCode: string | null;
  divisionName: string | null;
  eventId: string;
  eventName: string;
  eventSlug: string;
  year: number;
  jerseyNumber: string | null;
  goals: number | null;
  assists: number | null;
  isChampion: boolean;
}

// ─── Event list + detail ──────────────────────────────────────────────────────

export async function listEvents(): Promise<WfdfEventCard[]> {
  const db = supabase();
  const { data: events } = await db
    .from('wfdf_events')
    .select('id, slug, name, year, kind, location, start_date, end_date, is_national_teams, logo_url')
    .order('start_date', { ascending: false, nullsFirst: false });
  if (!events || events.length === 0) return [];

  // Team counts in one query.
  const ids = events.map((e: Record<string, unknown>) => e.id as string);
  const { data: teams } = await db.from('wfdf_teams').select('event_id').in('event_id', ids);
  const counts = new Map<string, number>();
  for (const t of teams ?? []) {
    const eid = (t as Record<string, unknown>).event_id as string;
    counts.set(eid, (counts.get(eid) ?? 0) + 1);
  }

  return (events as Record<string, unknown>[]).map((e) => ({
    id: e.id as string,
    slug: e.slug as string,
    name: e.name as string,
    year: e.year as number,
    kind: e.kind as string,
    location: (e.location as string) ?? null,
    startDate: (e.start_date as string) ?? null,
    endDate: (e.end_date as string) ?? null,
    isNationalTeams: !!e.is_national_teams,
    logoUrl: (e.logo_url as string) ?? null,
    teamCount: counts.get(e.id as string) ?? 0,
  }));
}

export async function getEvent(slug: string): Promise<WfdfEventDetail | null> {
  const db = supabase();
  const { data: ev } = await db
    .from('wfdf_events')
    .select('id, slug, name, year, kind, location, start_date, end_date, is_national_teams, logo_url')
    .eq('slug', slug)
    .maybeSingle();
  if (!ev) return null;
  const eventId = ev.id as string;

  const [{ data: divs }, { data: teams }, { data: games }] = await Promise.all([
    db.from('wfdf_divisions').select('id, name, ordering').eq('event_id', eventId).order('ordering'),
    db
      .from('wfdf_teams')
      .select(
        'id, name, abbreviation, country_code, country_name, flag_file, seed, final_standing, wins, losses, spirit_avg, division:division_id(name)',
      )
      .eq('event_id', eventId),
    db
      .from('wfdf_games')
      .select(
        'id, home_score, away_score, home_sotg, away_sotg, pool_name, is_bracket, status, scheduled_at, ' +
          'division:division_id(name), ' +
          'home:home_team_id(id, name, country_code), away:away_team_id(id, name, country_code)',
      )
      .eq('event_id', eventId)
      .order('scheduled_at', { ascending: true, nullsFirst: false }),
  ]);

  return {
    id: eventId,
    slug: ev.slug as string,
    name: ev.name as string,
    year: ev.year as number,
    kind: ev.kind as string,
    location: (ev.location as string) ?? null,
    startDate: (ev.start_date as string) ?? null,
    endDate: (ev.end_date as string) ?? null,
    isNationalTeams: !!ev.is_national_teams,
    logoUrl: (ev.logo_url as string) ?? null,
    teamCount: (teams ?? []).length,
    divisions: (divs ?? []).map((d: Record<string, unknown>) => ({
      id: d.id as string,
      name: d.name as string,
      ordering: (d.ordering as string) ?? null,
    })),
    teams: ((teams ?? []) as Row[]).map(mapTeamCard),
    games: ((games ?? []) as Row[]).map(mapGameRow),
  };
}

// ─── Team detail (with roster) ────────────────────────────────────────────────

export async function getTeam(teamId: string): Promise<WfdfTeamSummary | null> {
  const db = supabase();
  const { data: t } = await db
    .from('wfdf_teams')
    .select(
      'id, name, abbreviation, country_code, country_name, flag_file, seed, final_standing, wins, losses, scores_for, scores_against, spirit_avg, event_id, ' +
        'division:division_id(name), event:event_id(name, slug, year)',
    )
    .eq('id', teamId)
    .maybeSingle<Row>();
  if (!t) return null;

  const [{ data: roster }, { data: games }] = await Promise.all([
    db
      .from('wfdf_rosters')
      .select('wfdf_player_id, full_name, jersey_number, goals, assists, games, total')
      .eq('team_id', teamId)
      .order('total', { ascending: false, nullsFirst: false }),
    db
      .from('wfdf_games')
      .select(
        'id, home_score, away_score, home_sotg, away_sotg, pool_name, is_bracket, status, scheduled_at, ' +
          'division:division_id(name), home:home_team_id(id, name, country_code), away:away_team_id(id, name, country_code)',
      )
      .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
      .order('scheduled_at', { ascending: true, nullsFirst: false }),
  ]);

  const event = t.event as Record<string, unknown> | null;
  const division = t.division as Record<string, unknown> | null;
  return {
    id: t.id as string,
    name: t.name as string,
    abbreviation: (t.abbreviation as string) ?? null,
    countryCode: (t.country_code as string) ?? null,
    countryName: (t.country_name as string) ?? null,
    flagFile: (t.flag_file as string) ?? null,
    divisionName: (division?.name as string) ?? null,
    eventId: t.event_id as string,
    eventName: (event?.name as string) ?? '',
    eventSlug: (event?.slug as string) ?? '',
    eventYear: (event?.year as number) ?? 0,
    seed: (t.seed as number) ?? null,
    finalStanding: (t.final_standing as number) ?? null,
    wins: (t.wins as number) ?? null,
    losses: (t.losses as number) ?? null,
    scoresFor: (t.scores_for as number) ?? null,
    scoresAgainst: (t.scores_against as number) ?? null,
    spiritAvg: (t.spirit_avg as number) ?? null,
    roster: ((roster ?? []) as Row[]).map((r: Row) => ({
      wfdfPlayerId: r.wfdf_player_id as number,
      fullName: r.full_name as string,
      jerseyNumber: (r.jersey_number as string) ?? null,
      goals: (r.goals as number) ?? null,
      assists: (r.assists as number) ?? null,
      games: (r.games as number) ?? null,
      total: (r.total as number) ?? null,
    })),
    games: ((games ?? []) as Row[]).map(mapGameRow),
  };
}

// ─── Cross-league player link (name-matched, all rosters) ─────────────────────

/**
 * Every WFDF appearance for a person, matched by name across all events + teams.
 * Powers the unified player profile's WFDF section. Uses the same
 * surname-prefilter → namesMatch pattern as the other leagues.
 */
export async function getWfdfPlayerStints(displayName: string): Promise<WfdfPlayerStint[]> {
  const surname = surnameForPrefilter(displayName);
  if (!surname) return [];
  const db = supabase();

  // Prefilter by surname (indexed on lower(last_name)) to keep the scan small,
  // then confirm with the full namesMatch rule.
  const { data: hits } = await db
    .from('wfdf_rosters')
    .select(
      'full_name, jersey_number, goals, assists, ' +
        'team:team_id(id, name, country_code, final_standing, division:division_id(name), event:event_id(name, slug, year))',
    )
    .ilike('last_name', `%${surname}%`)
    .limit(400);

  const stints: WfdfPlayerStint[] = [];
  for (const h of (hits ?? []) as Row[]) {
    const row = h;
    if (!namesMatch(displayName, row.full_name as string)) continue;
    const team = row.team as Record<string, unknown> | null;
    if (!team) continue;
    const division = team.division as Record<string, unknown> | null;
    const event = team.event as Record<string, unknown> | null;
    if (!event) continue;
    stints.push({
      teamId: team.id as string,
      teamName: team.name as string,
      countryCode: (team.country_code as string) ?? null,
      divisionName: (division?.name as string) ?? null,
      eventId: '',
      eventName: (event.name as string) ?? '',
      eventSlug: (event.slug as string) ?? '',
      year: (event.year as number) ?? 0,
      jerseyNumber: (row.jersey_number as string) ?? null,
      goals: (row.goals as number) ?? null,
      assists: (row.assists as number) ?? null,
      isChampion: Number(team.final_standing) === 1,
    });
  }
  // Newest first.
  return stints.sort((a, b) => b.year - a.year);
}

// ─── Search ───────────────────────────────────────────────────────────────────

export interface WfdfSearchTeam {
  id: string;
  name: string;
  countryCode: string | null;
  eventName: string;
}

export async function searchWfdfTeams(query: string, limit = 6): Promise<WfdfSearchTeam[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const db = supabase();
  const { data } = await db
    .from('wfdf_teams')
    .select('id, name, country_code, event:event_id(name)')
    .ilike('name', `%${q}%`)
    .limit(limit);
  return (data ?? []).map((t: Record<string, unknown>) => ({
    id: t.id as string,
    name: t.name as string,
    countryCode: (t.country_code as string) ?? null,
    eventName: ((t.event as Record<string, unknown>)?.name as string) ?? '',
  }));
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

function mapTeamCard(t: Row): WfdfTeamCard {
  const division = t.division as Record<string, unknown> | null;
  return {
    id: t.id as string,
    name: t.name as string,
    abbreviation: (t.abbreviation as string) ?? null,
    countryCode: (t.country_code as string) ?? null,
    countryName: (t.country_name as string) ?? null,
    flagFile: (t.flag_file as string) ?? null,
    divisionName: (division?.name as string) ?? null,
    seed: (t.seed as number) ?? null,
    finalStanding: (t.final_standing as number) ?? null,
    wins: (t.wins as number) ?? null,
    losses: (t.losses as number) ?? null,
    spiritAvg: (t.spirit_avg as number) ?? null,
  };
}

function mapGameRow(g: Row): WfdfGameRow {
  const division = g.division as Record<string, unknown> | null;
  const home = g.home as Record<string, unknown> | null;
  const away = g.away as Record<string, unknown> | null;
  return {
    id: g.id as string,
    divisionName: (division?.name as string) ?? null,
    homeTeamId: (home?.id as string) ?? null,
    homeTeam: (home?.name as string) ?? null,
    homeCountry: (home?.country_code as string) ?? null,
    homeScore: (g.home_score as number) ?? null,
    awayTeamId: (away?.id as string) ?? null,
    awayTeam: (away?.name as string) ?? null,
    awayCountry: (away?.country_code as string) ?? null,
    awayScore: (g.away_score as number) ?? null,
    homeSotg: (g.home_sotg as number) ?? null,
    awaySotg: (g.away_sotg as number) ?? null,
    poolName: (g.pool_name as string) ?? null,
    isBracket: !!g.is_bracket,
    status: g.status as string,
    scheduledAt: (g.scheduled_at as string) ?? null,
  };
}

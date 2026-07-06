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

/**
 * The "current" WFDF event for the home hero — mirrors USAU getCurrentEvent()'s
 * weekend cadence EXACTLY so all leagues flip on the same clock:
 *
 *   - Before Wednesday (UTC day 0–2): look BACK — last weekend's just-finished
 *     event headlines (e.g. WMUCC, which ended Jul 4, shows through Tuesday).
 *   - From Wednesday on (UTC day ≥ 3): look FORWARD — the next event headlines
 *     (e.g. WJUC, starting Jul 11, takes over Wednesday).
 *
 * "Ended" is by end_date so a multi-day event stays "now" through its last day.
 * Prefer an event that actually has games ingested; fall back to the nearest by
 * date, then to the most-recent event overall so the slide is never empty.
 */
export async function getCurrentWfdfEvent(): Promise<WfdfEventCard | null> {
  const events = await listEvents();
  if (events.length === 0) return null;

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const lookForward = now.getUTCDay() >= 3; // Wed(3) → flip forward, same as USAU

  const endOf = (e: WfdfEventCard) => e.endDate ?? e.startDate ?? '';
  const startOf = (e: WfdfEventCard) => e.startDate ?? '';

  // Upcoming/now = not yet ended; past = ended before today. Within each bucket,
  // the nearest weekend wins (by start date), matching the USAU sort.
  const upcoming = events
    .filter((e) => endOf(e) >= today)
    .sort((a, b) => startOf(a).localeCompare(startOf(b))); // soonest first
  const past = events
    .filter((e) => endOf(e) < today)
    .sort((a, b) => startOf(b).localeCompare(startOf(a))); // most-recent first

  const ordered = lookForward ? [...upcoming, ...past] : [...past, ...upcoming];

  // Prefer an event with games; else the nearest by date; else newest overall.
  return (
    ordered.find((e) => e.teamCount > 0) ??
    ordered[0] ??
    events[0] ??
    null
  );
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

// ─── League hubs (Teams / Players / Scores across all events) ─────────────────
// WFDF is event-centric, so these hubs group by event rather than presenting a
// single season-long feed. They power the /wfdf/teams, /wfdf/players and
// /wfdf/scores nav pages (the event-scoped hub model).

export interface WfdfTeamHubRow {
  id: string;
  name: string;
  countryCode: string | null;
  flagFile: string | null;
  divisionName: string | null;
  finalStanding: number | null;
  wins: number | null;
  losses: number | null;
  eventSlug: string;
  eventName: string;
  eventYear: number;
}

export interface WfdfEventGroup {
  eventSlug: string;
  eventName: string;
  eventYear: number;
  location: string | null;
}

/** Every WFDF team, tagged with its event, newest event first. Grouped in the UI. */
export async function listAllTeams(): Promise<WfdfTeamHubRow[]> {
  const db = supabase();
  const { data } = await db
    .from('wfdf_teams')
    .select(
      'id, name, country_code, flag_file, final_standing, wins, losses, ' +
        'division:division_id(name), event:event_id(slug, name, year, start_date)',
    )
    .order('name');
  const rows = ((data ?? []) as Row[])
    .map((t) => {
      const ev = t.event as Record<string, unknown> | null;
      const div = t.division as Record<string, unknown> | null;
      if (!ev) return null;
      return {
        id: t.id as string,
        name: t.name as string,
        countryCode: (t.country_code as string) ?? null,
        flagFile: (t.flag_file as string) ?? null,
        divisionName: (div?.name as string) ?? null,
        finalStanding: (t.final_standing as number) ?? null,
        wins: (t.wins as number) ?? null,
        losses: (t.losses as number) ?? null,
        eventSlug: (ev.slug as string) ?? '',
        eventName: (ev.name as string) ?? '',
        eventYear: (ev.year as number) ?? 0,
      } as WfdfTeamHubRow;
    })
    .filter((r): r is WfdfTeamHubRow => r !== null);
  return rows;
}

export interface WfdfPlayerHubRow {
  fullName: string;
  teamId: string;
  teamName: string;
  countryCode: string | null;
  eventSlug: string;
  eventName: string;
  eventYear: number;
  goals: number | null;
  assists: number | null;
}

function mapPlayerHubRow(r: Row): WfdfPlayerHubRow | null {
  const team = r.team as Record<string, unknown> | null;
  if (!team) return null;
  const ev = team.event as Record<string, unknown> | null;
  if (!ev) return null;
  return {
    fullName: r.full_name as string,
    teamId: team.id as string,
    teamName: (team.name as string) ?? '',
    countryCode: (team.country_code as string) ?? null,
    eventSlug: (ev.slug as string) ?? '',
    eventName: (ev.name as string) ?? '',
    eventYear: (ev.year as number) ?? 0,
    goals: (r.goals as number) ?? null,
    assists: (r.assists as number) ?? null,
  };
}

/**
 * Search named roster appearances by player name. Runs an indexed ilike()
 * server-side (via the WFDF players hub server action) so we never ship the full
 * ~21k-row corpus to the client just to filter it. Capped at 500 rows.
 * (Team search lives on the Teams hub; this endpoint is player-name-first.)
 */
export async function searchRosterPlayers(query: string): Promise<WfdfPlayerHubRow[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const db = supabase();
  const { data } = await db
    .from('wfdf_rosters')
    .select(
      'full_name, goals, assists, ' +
        'team:team_id(id, name, country_code, event:event_id(slug, name, year))',
    )
    .ilike('full_name', `%${q}%`)
    .limit(500);
  const seen = new Set<string>();
  const rows: WfdfPlayerHubRow[] = [];
  for (const r of (data ?? []) as Row[]) {
    const mapped = mapPlayerHubRow(r);
    if (!mapped) continue;
    const key = `${mapped.teamId}|${mapped.fullName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(mapped);
  }
  return rows.sort((a, b) => b.eventYear - a.eventYear || a.fullName.localeCompare(b.fullName));
}

/**
 * Per-event roster player counts for the Players hub's pre-search browse state.
 * One head+count query per event, filtered through an inner join on the team's
 * event_id — no full-corpus download, no client shipping.
 */
export async function listEventPlayerTotals(): Promise<
  { slug: string; name: string; year: number; playerCount: number }[]
> {
  const events = await listEvents();
  if (events.length === 0) return [];
  const db = supabase();
  const totals = await Promise.all(
    events.map(async (e) => {
      // wfdf_rosters carries event_id directly, so a head+count query filtered
      // on it is a cheap index scan with no rows sent to the app.
      const { count } = await db
        .from('wfdf_rosters')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', e.id);
      return { slug: e.slug, name: e.name, year: e.year, playerCount: count ?? 0 };
    }),
  );
  return totals.sort((a, b) => b.year - a.year || a.name.localeCompare(b.name));
}

export interface WfdfScoreEventGroup {
  eventSlug: string;
  eventName: string;
  eventYear: number;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  gameCount: number;
  completedCount: number;
  divisions: string[];
}

/**
 * Event-level summary for the Scores/Schedule hub: one card per event with its
 * game counts and division list. Detailed games live on the event page.
 */
export async function listEventScoreSummaries(): Promise<WfdfScoreEventGroup[]> {
  const events = await listEvents();
  if (events.length === 0) return [];
  const db = supabase();

  // Fetch games (division + status) for all events, paging past the 1000 cap.
  // MAX_GAME_ROWS is a hard, compile-time ceiling on the page-walk — it must
  // stay a constant and NEVER be derived from request input (that would let a
  // request amplify into an unbounded run of DB round-trips).
  const MAX_GAME_ROWS = 20_000;
  const gameRows: Row[] = [];
  const PAGE = 1000;
  for (let from = 0; from < MAX_GAME_ROWS; from += PAGE) {
    const { data } = await db
      .from('wfdf_games')
      .select('event_id, status, division:division_id(name)')
      .range(from, from + PAGE - 1);
    const batch = (data ?? []) as Row[];
    gameRows.push(...batch);
    if (batch.length < PAGE) break;
  }

  const byEvent = new Map<string, { total: number; completed: number; divs: Set<string> }>();
  for (const g of gameRows) {
    const eid = g.event_id as string;
    let bucket = byEvent.get(eid);
    if (!bucket) {
      bucket = { total: 0, completed: 0, divs: new Set() };
      byEvent.set(eid, bucket);
    }
    bucket.total += 1;
    if (g.status === 'completed') bucket.completed += 1;
    const dn = (g.division as Record<string, unknown> | null)?.name as string | undefined;
    if (dn) bucket.divs.add(dn);
  }

  return events.map((e) => {
    const b = byEvent.get(e.id);
    return {
      eventSlug: e.slug,
      eventName: e.name,
      eventYear: e.year,
      location: e.location,
      startDate: e.startDate,
      endDate: e.endDate,
      gameCount: b?.total ?? 0,
      completedCount: b?.completed ?? 0,
      divisions: b ? [...b.divs].sort() : [],
    };
  });
}

// ─── Search ───────────────────────────────────────────────────────────────────

export interface WfdfSearchTeam {
  id: string;
  name: string;
  countryCode: string | null;
  eventName: string;
}

// Fuzzy (trigram) team search via the search_wfdf_teams_fuzzy RPC — tolerates
// typos ("bonyard" → Boneyard) and reordering, ranked by similarity.
export async function searchWfdfTeams(query: string, limit = 6): Promise<WfdfSearchTeam[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const db = supabase();
  const { data } = await db.rpc('search_wfdf_teams_fuzzy', { q, lim: limit });
  return ((data ?? []) as Row[]).map((t) => ({
    id: t.id as string,
    name: t.name as string,
    countryCode: (t.country_code as string) ?? null,
    eventName: (t.event_name as string) ?? '',
  }));
}

export interface WfdfSearchPlayer {
  fullName: string;
  teamName: string;
  countryCode: string | null;
  eventName: string;
}

// Fuzzy roster-name search for the global search bar. Deduped by name in the
// RPC. WFDF players have no anchor id, so results route to the by-name resolver.
export async function searchWfdfPlayersForSearch(
  query: string,
  limit = 6,
): Promise<WfdfSearchPlayer[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const db = supabase();
  const { data } = await db.rpc('search_wfdf_players_fuzzy', { q, lim: limit });
  return ((data ?? []) as Row[]).map((p) => ({
    fullName: p.full_name as string,
    teamName: (p.team_name as string) ?? '',
    countryCode: (p.country_code as string) ?? null,
    eventName: (p.event_name as string) ?? '',
  }));
}

export interface WfdfSearchEvent {
  slug: string;
  name: string;
  year: number;
}

// Fuzzy event search ("wmuc"/"worlds" → WMUCC events).
export async function searchWfdfEvents(query: string, limit = 6): Promise<WfdfSearchEvent[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const db = supabase();
  const { data } = await db.rpc('search_wfdf_events_fuzzy', { q, lim: limit });
  return ((data ?? []) as Row[]).map((e) => ({
    slug: e.slug as string,
    name: e.name as string,
    year: e.year as number,
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

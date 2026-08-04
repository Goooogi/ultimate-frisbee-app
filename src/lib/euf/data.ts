// EUF / EUCS (European Ultimate Club Season) data layer — public read-only.
//
// Mirrors src/lib/wfdf/data.ts: EVENT-CENTRIC, since each EUCS stop (EUCF, E2CF,
// Elite Invite, Spring/Summer Tour) is a distinct tournament with its own team
// set. Data is scraped from the Ultiorganizer schedule site by the euf-ingest
// edge function into euf_* tables.
//
// euf_* tables are NOT in database.types.ts; we cast rows via local interfaces,
// same approach as wfdf/pul/wul data.ts. Reads use the anon publishable key;
// RLS on euf_* is world-readable.
//
// Source quirks that leak into this layer (see the euf-ingest header):
//   * Teams are keyed by (division, name) — a club can field an Open AND a
//     Women's team under the same name, so never look one up by name alone.
//   * Player ids are PER-EVENT, so a "player" here is scoped to one event.
//   * Records/placements are NOT published upstream; standings are derived from
//     games by the get_euf_standings RPC.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseUrl, supabaseAnonKey } from '@/lib/supabase/env';

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

export type EufDivision = 'Open' | "Women's" | 'Mixed';
export const EUF_DIVISIONS: EufDivision[] = ['Open', "Women's", 'Mixed'];

// ─── Shapes ──────────────────────────────────────────────────────────────────

export interface EufEventCard {
  id: string;
  slug: string;
  name: string;
  year: number;
  kind: string;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  teamCount: number;
  divisions: EufDivision[];
}

export interface EufStandingRow {
  teamId: string;
  teamName: string;
  division: EufDivision;
  countryName: string | null;
  games: number;
  wins: number;
  losses: number;
  scoresFor: number;
  scoresAgainst: number;
  pointDiff: number;
  /** Derived from the bracket tree (derive_euf_placements) — null on pool-only
   *  events, which have no bracket to place from. */
  finalPlacement: number | null;
}

export interface EufGameCard {
  id: string;
  division: EufDivision;
  roundName: string | null;
  stage: string;
  isBracket: boolean;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeName: string;
  awayName: string;
  homeCountry: string | null;
  awayCountry: string | null;
  homeScore: number | null;
  awayScore: number | null;
  field: string | null;
  startTime: string | null;
  /** Full date+time of the game. Venue-local wall clock stored as UTC (the
   *  source publishes no offset), so it must be READ in UTC — same convention
   *  as the USAU masters ingest. Use `eufGameDate`/`eufGameTime` to format. */
  scheduledAt: string | null;
  status: string;
}

export interface EufRosterPlayer {
  id: string;
  eufPlayerId: number;
  fullName: string;
  jerseyNumber: string | null;
  games: number | null;
  goals: number | null;
  assists: number | null;
  total: number | null;
}

export interface EufTeamDetail {
  id: string;
  name: string;
  division: EufDivision;
  countryName: string | null;
  eventId: string;
  eventName: string;
  eventSlug: string;
  eventYear: number;
}

export interface EufLeaderRow {
  fullName: string;
  teamId: string | null;
  teamName: string | null;
  division: EufDivision;
  countryName: string | null;
  games: number | null;
  goals: number;
  assists: number;
  total: number;
}

// ─── Events ──────────────────────────────────────────────────────────────────

export async function listEvents(): Promise<EufEventCard[]> {
  const { data, error } = await supabase()
    .from('euf_events')
    .select('id, slug, name, year, kind, location, start_date, end_date')
    .order('year', { ascending: false })
    .order('name');
  if (error || !data) return [];

  const ids = (data as Row[]).map((e) => e.id as string);
  if (!ids.length) return [];

  // One extra round-trip for team counts + division sets beats N per-event reads.
  const { data: teams } = await supabase()
    .from('euf_teams')
    .select('event_id, division')
    .in('event_id', ids);

  const counts = new Map<string, number>();
  const divs = new Map<string, Set<string>>();
  for (const t of (teams ?? []) as Row[]) {
    const k = t.event_id as string;
    counts.set(k, (counts.get(k) ?? 0) + 1);
    if (!divs.has(k)) divs.set(k, new Set());
    divs.get(k)!.add(t.division as string);
  }

  return (data as Row[]).map((e) => ({
    id: e.id as string,
    slug: e.slug as string,
    name: e.name as string,
    year: e.year as number,
    kind: e.kind as string,
    location: (e.location as string) ?? null,
    startDate: (e.start_date as string) ?? null,
    endDate: (e.end_date as string) ?? null,
    teamCount: counts.get(e.id as string) ?? 0,
    divisions: EUF_DIVISIONS.filter((d) => divs.get(e.id as string)?.has(d)),
  }));
}

export async function getEvent(slug: string): Promise<EufEventCard | null> {
  const { data, error } = await supabase()
    .from('euf_events')
    .select('id, slug, name, year, kind, location, start_date, end_date')
    .eq('slug', slug)
    .maybeSingle();
  if (error || !data) return null;

  const { data: teams } = await supabase()
    .from('euf_teams')
    .select('division')
    .eq('event_id', (data as Row).id);

  const seen = new Set(((teams ?? []) as Row[]).map((t) => t.division as string));
  const e = data as Row;
  return {
    id: e.id as string,
    slug: e.slug as string,
    name: e.name as string,
    year: e.year as number,
    kind: e.kind as string,
    location: (e.location as string) ?? null,
    startDate: (e.start_date as string) ?? null,
    endDate: (e.end_date as string) ?? null,
    teamCount: (teams ?? []).length,
    divisions: EUF_DIVISIONS.filter((d) => seen.has(d)),
  };
}

// ─── Standings (derived from games — records aren't published upstream) ───────

export async function getStandings(eventSlug: string): Promise<EufStandingRow[]> {
  const { data, error } = await supabase().rpc('get_euf_standings', {
    p_event_slug: eventSlug,
  });
  if (error || !data) return [];
  return (data as Row[]).map((r) => ({
    teamId: r.team_id as string,
    teamName: r.team_name as string,
    division: r.division as EufDivision,
    countryName: (r.country_name as string) ?? null,
    games: (r.games as number) ?? 0,
    wins: (r.wins as number) ?? 0,
    losses: (r.losses as number) ?? 0,
    scoresFor: (r.scores_for as number) ?? 0,
    scoresAgainst: (r.scores_against as number) ?? 0,
    pointDiff: (r.point_diff as number) ?? 0,
    finalPlacement: (r.final_placement as number) ?? null,
  }));
}

// ─── Games ───────────────────────────────────────────────────────────────────

const GAME_SELECT =
  'id, division, round_name, stage, is_bracket, home_team_id, away_team_id, ' +
  'home_score, away_score, field, start_time, scheduled_at, status, ' +
  'home:home_team_id(name, country_name), away:away_team_id(name, country_name)';

function toGameCard(g: Row): EufGameCard {
  const home = (g.home ?? {}) as Row;
  const away = (g.away ?? {}) as Row;
  return {
    id: g.id as string,
    division: g.division as EufDivision,
    roundName: (g.round_name as string) ?? null,
    stage: (g.stage as string) ?? 'other',
    isBracket: Boolean(g.is_bracket),
    homeTeamId: (g.home_team_id as string) ?? null,
    awayTeamId: (g.away_team_id as string) ?? null,
    homeName: (home.name as string) ?? 'TBD',
    awayName: (away.name as string) ?? 'TBD',
    homeCountry: (home.country_name as string) ?? null,
    awayCountry: (away.country_name as string) ?? null,
    homeScore: (g.home_score as number) ?? null,
    awayScore: (g.away_score as number) ?? null,
    field: (g.field as string) ?? null,
    startTime: (g.start_time as string) ?? null,
    scheduledAt: (g.scheduled_at as string) ?? null,
    status: (g.status as string) ?? 'completed',
  };
}

export async function listEventGames(
  eventId: string,
  division?: EufDivision,
): Promise<EufGameCard[]> {
  let q = supabase().from('euf_games').select(GAME_SELECT).eq('event_id', eventId);
  if (division) q = q.eq('division', division);
  // Order by the full instant, not start_time — start_time is a bare
  // time-of-day, so ordering on it interleaves Sunday's 9am with Saturday's.
  const { data, error } = await q
    .order('scheduled_at', { nullsFirst: false })
    .order('start_time', { nullsFirst: false })
    .limit(1000);
  if (error || !data) return [];
  return (data as Row[]).map(toGameCard);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function listTeamGames(teamId: string): Promise<EufGameCard[]> {
  // teamId lands here straight from a URL route param, and .or() takes a raw
  // PostgREST filter string where "," and "." are grammar — so anything but a
  // well-formed uuid could inject extra filter clauses. Guard before building it.
  if (!UUID_RE.test(teamId)) return [];
  // Chronological — this list had no ORDER BY at all, so a team's results came
  // back in arbitrary storage order (a Sunday final could sit above Saturday's
  // pool games).
  const { data, error } = await supabase()
    .from('euf_games')
    .select(GAME_SELECT)
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
    .order('scheduled_at', { nullsFirst: false })
    .order('start_time', { nullsFirst: false })
    .limit(200);
  if (error || !data) return [];
  return (data as Row[]).map(toGameCard);
}

// ─── Teams ───────────────────────────────────────────────────────────────────

export async function getTeam(teamId: string): Promise<EufTeamDetail | null> {
  const { data, error } = await supabase()
    .from('euf_teams')
    .select('id, name, division, country_name, event_id, event:event_id(name, slug, year)')
    .eq('id', teamId)
    .maybeSingle();
  if (error || !data) return null;
  const t = data as Row;
  const ev = (t.event ?? {}) as Row;
  return {
    id: t.id as string,
    name: t.name as string,
    division: t.division as EufDivision,
    countryName: (t.country_name as string) ?? null,
    eventId: t.event_id as string,
    eventName: (ev.name as string) ?? '',
    eventSlug: (ev.slug as string) ?? '',
    eventYear: (ev.year as number) ?? 0,
  };
}

export async function getTeamRoster(teamId: string): Promise<EufRosterPlayer[]> {
  const { data, error } = await supabase()
    .from('euf_rosters')
    .select('id, euf_player_id, full_name, jersey_number, games, goals, assists, total')
    .eq('team_id', teamId)
    .order('total', { ascending: false, nullsFirst: false });
  if (error || !data) return [];
  return (data as Row[]).map((p) => ({
    id: p.id as string,
    eufPlayerId: p.euf_player_id as number,
    fullName: p.full_name as string,
    jerseyNumber: (p.jersey_number as string) ?? null,
    games: (p.games as number) ?? null,
    goals: (p.goals as number) ?? null,
    assists: (p.assists as number) ?? null,
    total: (p.total as number) ?? null,
  }));
}

// ─── Leaders (per-event scoring, from the roster totals) ──────────────────────

export async function getEventLeaders(
  eventId: string,
  division?: EufDivision,
  limit = 50,
): Promise<EufLeaderRow[]> {
  const { data, error } = await supabase()
    .from('euf_rosters')
    .select(
      'full_name, games, goals, assists, total, team_id, team:team_id(name, division, country_name)',
    )
    .eq('event_id', eventId)
    .order('total', { ascending: false, nullsFirst: false })
    .limit(1000);
  if (error || !data) return [];

  return (data as Row[])
    .map((r) => {
      const team = (r.team ?? {}) as Row;
      return {
        fullName: r.full_name as string,
        teamId: (r.team_id as string) ?? null,
        teamName: (team.name as string) ?? null,
        division: team.division as EufDivision,
        countryName: (team.country_name as string) ?? null,
        games: (r.games as number) ?? null,
        goals: (r.goals as number) ?? 0,
        assists: (r.assists as number) ?? 0,
        total: (r.total as number) ?? 0,
      };
    })
    .filter((r) => !division || r.division === division)
    .slice(0, limit);
}

// ─── Global search (trigram-fuzzy RPCs) ──────────────────────────────────────

export interface EufSearchTeam {
  id: string;
  name: string;
  division: string;
  countryName: string | null;
  eventName: string;
  eventSlug: string;
  year: number;
}
export interface EufSearchPlayer {
  fullName: string;
  teamId: string | null;
  teamName: string | null;
  countryName: string | null;
  eventName: string | null;
}
export interface EufSearchEvent {
  id: string;
  name: string;
  slug: string;
  year: number;
}

export async function searchEufTeams(q: string, limit = 8): Promise<EufSearchTeam[]> {
  const { data } = await supabase().rpc('search_euf_teams_fuzzy', { q, lim: limit });
  return ((data ?? []) as Row[]).map((t) => ({
    id: t.id as string,
    name: t.name as string,
    division: t.division as string,
    countryName: (t.country_name as string) ?? null,
    eventName: (t.event_name as string) ?? '',
    eventSlug: (t.event_slug as string) ?? '',
    year: (t.year as number) ?? 0,
  }));
}

export async function searchEufPlayers(q: string, limit = 8): Promise<EufSearchPlayer[]> {
  const { data } = await supabase().rpc('search_euf_players_fuzzy', { q, lim: limit });
  return ((data ?? []) as Row[]).map((p) => ({
    fullName: p.full_name as string,
    teamId: (p.team_id as string) ?? null,
    teamName: (p.team_name as string) ?? null,
    countryName: (p.country_name as string) ?? null,
    eventName: (p.event_name as string) ?? null,
  }));
}

export async function searchEufEvents(q: string, limit = 8): Promise<EufSearchEvent[]> {
  const { data } = await supabase().rpc('search_euf_events_fuzzy', { q, lim: limit });
  return ((data ?? []) as Row[]).map((e) => ({
    id: e.id as string,
    name: e.name as string,
    slug: e.slug as string,
    year: (e.year as number) ?? 0,
  }));
}

// ─── Merged player profile (by name) ─────────────────────────────────────────
// EUF player ids are PER-EVENT, so a "player" here is one NAME and the profile
// is every roster appearance under it. See get_euf_player_profile's comment for
// why name-merge is safe enough on this dataset, and its known limit.

export interface EufPlayerAppearance {
  eventId: string;
  eventName: string;
  eventSlug: string;
  year: number;
  teamId: string;
  teamName: string;
  division: EufDivision;
  countryName: string | null;
  jerseyNumber: string | null;
  games: number | null;
  goals: number | null;
  assists: number | null;
  total: number | null;
  finalPlacement: number | null;
}

export interface EufPlayerProfile {
  fullName: string;
  appearances: EufPlayerAppearance[];
  totals: { events: number; games: number; goals: number; assists: number; points: number };
}

export async function getPlayerProfileByName(name: string): Promise<EufPlayerProfile | null> {
  const { data, error } = await supabase().rpc('get_euf_player_profile', { p_name: name });
  if (error || !data || (data as Row[]).length === 0) return null;

  const rows = data as Row[];
  const appearances: EufPlayerAppearance[] = rows.map((r) => ({
    eventId: r.event_id as string,
    eventName: r.event_name as string,
    eventSlug: r.event_slug as string,
    year: (r.year as number) ?? 0,
    teamId: r.team_id as string,
    teamName: r.team_name as string,
    division: r.division as EufDivision,
    countryName: (r.country_name as string) ?? null,
    jerseyNumber: (r.jersey_number as string) ?? null,
    games: (r.games as number) ?? null,
    goals: (r.goals as number) ?? null,
    assists: (r.assists as number) ?? null,
    total: (r.total as number) ?? null,
    finalPlacement: (r.final_placement as number) ?? null,
  }));

  return {
    fullName: rows[0].full_name as string,
    appearances,
    totals: {
      events: new Set(appearances.map((a) => a.eventId)).size,
      games: appearances.reduce((n, a) => n + (a.games ?? 0), 0),
      goals: appearances.reduce((n, a) => n + (a.goals ?? 0), 0),
      assists: appearances.reduce((n, a) => n + (a.assists ?? 0), 0),
      points: appearances.reduce((n, a) => n + (a.total ?? 0), 0),
    },
  };
}

// ─── Clubs (the identity layer over per-event team rows) ─────────────────────
// A EUF team row is per-EVENT, so a club is the set of rows sharing a name AND
// a division: Grut and SMOG each field Open, Women's and Mixed teams, which are
// different rosters that merely share a club name. 578 rows → 196 club-divisions.
// Matching is EXACT: "Mooncatchers Master" stays its own club, it does not fold
// into Mooncatchers.

export interface EufClubCard {
  key: string;
  name: string;
  division: EufDivision;
  countryName: string | null;
  appearances: number;
  events: number;
  firstYear: number;
  lastYear: number;
  bestPlacement: number | null;
}

export interface EufClubAppearance {
  eventId: string;
  eventName: string;
  eventSlug: string;
  year: number;
  kind: string;
  teamId: string;
  finalPlacement: number | null;
  games: number;
  wins: number;
  losses: number;
  scoresFor: number;
  scoresAgainst: number;
}

export interface EufClubCrossLeagueRow {
  league: 'wfdf' | 'usau';
  refId: string;
  teamName: string;
  countryName: string | null;
  eventName: string;
  eventSlug: string;
  year: number;
  division: string | null;
  placement: number | null;
}

export interface EufClubProfile {
  key: string;
  name: string;
  division: EufDivision;
  countryName: string | null;
  appearances: EufClubAppearance[];
  /** The club's OTHER divisions, for cross-linking between its squad pages. */
  siblingDivisions: EufDivision[];
  totals: { events: number; games: number; wins: number; losses: number; titles: number };
}

export async function listClubs(): Promise<EufClubCard[]> {
  const { data, error } = await supabase().rpc('list_euf_clubs');
  if (error || !data) return [];
  return (data as Row[]).map((c) => ({
    key: c.club_key as string,
    name: c.club_name as string,
    division: c.division as EufDivision,
    countryName: (c.country_name as string) ?? null,
    appearances: (c.appearances as number) ?? 0,
    events: (c.events as number) ?? 0,
    firstYear: (c.first_year as number) ?? 0,
    lastYear: (c.last_year as number) ?? 0,
    bestPlacement: (c.best_placement as number) ?? null,
  }));
}

export async function getClubProfile(
  name: string,
  division: string,
): Promise<EufClubProfile | null> {
  const { data, error } = await supabase().rpc('get_euf_club_profile', {
    p_name: name,
    p_division: division,
  });
  if (error || !data || (data as Row[]).length === 0) return null;

  const rows = data as Row[];
  const appearances: EufClubAppearance[] = rows.map((r) => ({
    eventId: r.event_id as string,
    eventName: r.event_name as string,
    eventSlug: r.event_slug as string,
    year: (r.year as number) ?? 0,
    kind: (r.kind as string) ?? '',
    teamId: r.team_id as string,
    finalPlacement: (r.final_placement as number) ?? null,
    games: (r.games as number) ?? 0,
    wins: (r.wins as number) ?? 0,
    losses: (r.losses as number) ?? 0,
    scoresFor: (r.scores_for as number) ?? 0,
    scoresAgainst: (r.scores_against as number) ?? 0,
  }));

  const clubName = rows[0].club_name as string;
  const clubDivision = rows[0].division as EufDivision;

  // The club's other squads, so a visitor on GRUT Women's can reach GRUT Open.
  const { data: sibs } = await supabase()
    .from('euf_teams')
    .select('division')
    .ilike('name', clubName);
  const siblingDivisions = EUF_DIVISIONS.filter(
    (d) => d !== clubDivision && ((sibs ?? []) as Row[]).some((s) => s.division === d),
  );

  return {
    key: rows[0].club_key as string,
    name: clubName,
    division: clubDivision,
    countryName: (rows[0].country_name as string) ?? null,
    appearances,
    siblingDivisions,
    totals: {
      events: new Set(appearances.map((a) => a.eventId)).size,
      games: appearances.reduce((n, a) => n + a.games, 0),
      wins: appearances.reduce((n, a) => n + a.wins, 0),
      losses: appearances.reduce((n, a) => n + a.losses, 0),
      titles: appearances.filter((a) => a.finalPlacement === 1).length,
    },
  };
}

export async function getClubCrossLeague(
  name: string,
  division: string,
): Promise<EufClubCrossLeagueRow[]> {
  const { data, error } = await supabase().rpc('get_euf_club_cross_league', {
    p_name: name,
    p_division: division,
  });
  if (error || !data) return [];
  return (data as Row[]).map((r) => ({
    league: r.league as 'wfdf' | 'usau',
    refId: r.ref_id as string,
    teamName: r.team_name as string,
    countryName: (r.country_name as string) ?? null,
    eventName: (r.event_name as string) ?? '',
    eventSlug: (r.event_slug as string) ?? '',
    year: (r.year as number) ?? 0,
    division: (r.division as string) ?? null,
    placement: (r.placement as number) ?? null,
  }));
}

// ─── Hub pages (/euf/scores, /euf/players) ───────────────────────────────────
// EUF mirrors WFDF's event-scoped hub shape rather than the shared ?league=
// routes: a EUCS stop is a self-contained tournament, not a rolling fixture
// list. NOTE there is deliberately no /euf/schedule — euf_games.scheduled_at is
// entirely NULL and euf_events has no start_date, so the source gives us a
// time-of-day ("08:30") with no date to hang it on. Every game is already
// completed, so there'd be nothing upcoming to show even if we had dates.

export interface EufEventScoreSummary {
  slug: string;
  name: string;
  year: number;
  kind: string;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  gameCount: number;
  teamCount: number;
  divisions: EufDivision[];
}

export async function listEventScoreSummaries(): Promise<EufEventScoreSummary[]> {
  const events = await listEvents();
  if (!events.length) return [];

  const { data: games } = await supabase()
    .from('euf_games')
    .select('event_id')
    .in(
      'event_id',
      events.map((e) => e.id),
    )
    .limit(5000);

  const counts = new Map<string, number>();
  for (const g of ((games ?? []) as Row[])) {
    const k = g.event_id as string;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  return events.map((e) => ({
    slug: e.slug,
    name: e.name,
    year: e.year,
    kind: e.kind,
    location: e.location,
    startDate: e.startDate,
    endDate: e.endDate,
    gameCount: counts.get(e.id) ?? 0,
    teamCount: e.teamCount,
    divisions: e.divisions,
  }));
}

export interface EufPlayerHubRow {
  fullName: string;
  teamName: string | null;
  countryName: string | null;
  division: EufDivision | null;
  events: number;
  goals: number;
  assists: number;
  points: number;
}

/** Career leaderboard across every EUCS event, one row per NAME (ids are
 *  per-event). Backed by an RPC because the roster corpus is 12k+ rows — well
 *  past PostgREST's 1000-row response cap. */
export async function listTopPlayers(limit = 200): Promise<EufPlayerHubRow[]> {
  const { data, error } = await supabase().rpc('list_euf_top_players', { lim: limit });
  if (error || !data) return [];
  return (data as Row[]).map((p) => ({
    fullName: p.full_name as string,
    teamName: (p.team_name as string) ?? null,
    countryName: (p.country_name as string) ?? null,
    division: (p.division as EufDivision) ?? null,
    events: (p.events as number) ?? 0,
    goals: (p.goals as number) ?? 0,
    assists: (p.assists as number) ?? 0,
    points: (p.points as number) ?? 0,
  }));
}

// ─── Schedule (date-grouped games) ───────────────────────────────────────────

export interface EufScheduleGame extends EufGameCard {
  eventSlug: string;
  eventName: string;
}

export interface EufScheduleDay {
  /** YYYY-MM-DD, the UTC-derived day key (see lib/euf/format-date). */
  date: string;
  games: EufScheduleGame[];
}

export interface EufScheduleEventOption {
  slug: string;
  name: string;
  year: number;
  startDate: string | null;
  endDate: string | null;
}

/**
 * Every game for one event, grouped by day. Event-scoped rather than
 * league-wide-by-date: EUCS runs several tour stops on the SAME weekend, so a
 * flat date feed interleaves unrelated tournaments into one unreadable list.
 * The picker on /euf/schedule chooses which event this reads.
 */
export async function getEventSchedule(eventSlug: string): Promise<EufScheduleDay[]> {
  const ev = await getEvent(eventSlug);
  if (!ev) return [];

  const { data, error } = await supabase()
    .from('euf_games')
    .select(GAME_SELECT)
    .eq('event_id', ev.id)
    .order('scheduled_at', { nullsFirst: false })
    .order('start_time', { nullsFirst: false })
    .limit(1000);
  if (error || !data) return [];

  const byDay = new Map<string, EufScheduleGame[]>();
  for (const row of data as Row[]) {
    const g = toGameCard(row);
    // Bucket in UTC to match how the time renders — see format-date.ts.
    const key = g.scheduledAt ? g.scheduledAt.slice(0, 10) : 'undated';
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push({ ...g, eventSlug: ev.slug, eventName: ev.name });
  }

  return [...byDay.entries()]
    .sort((a, b) => (a[0] === 'undated' ? 1 : b[0] === 'undated' ? -1 : a[0].localeCompare(b[0])))
    .map(([date, games]) => ({ date, games }));
}

/** Events that actually have dated games, newest first — the /euf/schedule
 *  picker. Excludes the dateless registered-but-unplayed stops (e.g. 2026
 *  Summer Tour Bordeaux: 12 teams, 0 games) so the picker can't land on an
 *  event with nothing to show. */
export async function listScheduleEvents(): Promise<EufScheduleEventOption[]> {
  const events = await listEvents();
  return events
    .filter((e) => e.startDate)
    .map((e) => ({
      slug: e.slug,
      name: e.name,
      year: e.year,
      startDate: e.startDate,
      endDate: e.endDate,
    }));
}

// ─── Per-game box scores ─────────────────────────────────────────────────────

export interface EufGameStatLine {
  fullName: string;
  jerseyNumber: string | null;
  teamId: string | null;
  goals: number;
  assists: number;
  total: number;
}

export interface EufGameDetail extends EufGameCard {
  eventId: string;
  eventName: string;
  eventSlug: string;
  eventYear: number;
}

/** One game plus its event context, for /euf/g/[id]. */
export async function getGame(gameId: string): Promise<EufGameDetail | null> {
  if (!UUID_RE.test(gameId)) return null;
  const { data, error } = await supabase()
    .from('euf_games')
    .select(`${GAME_SELECT}, event_id, event:event_id(name, slug, year)`)
    .eq('id', gameId)
    .maybeSingle();
  if (error || !data) return null;
  const g = data as Row;
  const ev = (g.event ?? {}) as Row;
  return {
    ...toGameCard(g),
    eventId: g.event_id as string,
    eventName: (ev.name as string) ?? '',
    eventSlug: (ev.slug as string) ?? '',
    eventYear: (ev.year as number) ?? 0,
  };
}

export async function getGameStats(gameId: string): Promise<EufGameStatLine[]> {
  if (!UUID_RE.test(gameId)) return [];
  const { data, error } = await supabase()
    .from('euf_game_player_stats')
    .select('full_name, jersey_number, team_id, goals, assists, total')
    .eq('game_id', gameId)
    .order('total', { ascending: false });
  if (error || !data) return [];
  return (data as Row[]).map((s) => ({
    fullName: s.full_name as string,
    jerseyNumber: (s.jersey_number as string) ?? null,
    teamId: (s.team_id as string) ?? null,
    goals: (s.goals as number) ?? 0,
    assists: (s.assists as number) ?? 0,
    total: (s.total as number) ?? 0,
  }));
}

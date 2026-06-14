// USAU data layer (read-only, from Supabase).
//
// The scraper writes via service role; the app reads via anon. RLS on
// every usau_* table is "world-readable" so no auth is required to query.
//
// One client for both runtimes: we use @supabase/supabase-js (not @supabase/ssr)
// because USAU reads don't require auth cookies — the anon key + world-readable
// RLS is sufficient. That lets the same file power both Server Components
// (e.g. /usau/events/[slug]) and Client Components (e.g. the sidebar search)
// without dynamic imports or runtime branching.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { namesMatch, surnameForPrefilter } from '@/lib/name-match';
import { supabaseUrl, supabaseAnonKey } from '@/lib/supabase/env';

type DB = SupabaseClient<Database>;

let _client: DB | null = null;

async function supabase(): Promise<DB> {
  if (_client) return _client;
  _client = createClient<Database>(
    supabaseUrl(),
    supabaseAnonKey(),
    { auth: { persistSession: false } },
  );
  return _client;
}

// ─── Events ────────────────────────────────────────────────────────────

export interface UsauEventCard {
  id: string;
  slug: string;
  name: string;
  season: number;
  startDate: string | null; // ISO yyyy-mm-dd
  endDate: string | null;
  city: string | null;
  state: string | null;
  competitionLevel: string;
  /** Number of teams that participated, used as a "size" hint. */
  teamCount: number;
}

export type CompetitionLevel =
  | 'CLUB'
  | 'COLLEGE_D1'
  | 'COLLEGE_D3'
  | 'HS'
  | 'MS'
  | 'YC'
  | 'MASTERS'
  | 'GRAND_MASTERS'
  | 'BEACH'
  | 'OTHER';

/** All scraped USAU events, newest first. */
export async function listEvents(opts?: {
  season?: number;
  competitionLevel?: CompetitionLevel;
  /** Filter to events that have at least one participating team in this
   *  gender division. USAU events themselves aren't tagged by gender —
   *  the division lives on the participating teams. We treat an event
   *  as "in the X division" if any of its teams.gender_division = X. */
  genderDivision?: 'Men' | 'Women' | 'Mixed';
  limit?: number;
}): Promise<UsauEventCard[]> {
  const db = await supabase();
  let q = db
    .from('usau_events')
    .select('id, usau_slug, name, season, start_date, end_date, city, state, competition_level')
    .order('start_date', { ascending: false, nullsFirst: false })
    .order('name', { ascending: true });
  if (opts?.season != null) q = q.eq('season', opts.season);
  if (opts?.competitionLevel) q = q.eq('competition_level', opts.competitionLevel);
  if (opts?.limit) q = q.limit(opts.limit);
  const { data: events, error } = await q;
  if (error) throw error;

  // Pull team counts per event AND collect each event's gender divisions
  // (from the participating teams) so we can both report a count and
  // filter to the requested division. One query covers both.
  const ids = (events ?? []).map((e) => e.id);
  const countByEvent = new Map<string, number>();
  const divisionsByEvent = new Map<string, Set<string>>();
  if (ids.length > 0) {
    const { data: parts } = await db
      .from('usau_event_teams')
      .select('event_id, usau_teams(gender_division)')
      .in('event_id', ids);
    for (const r of (parts ?? []) as Array<{
      event_id: string;
      usau_teams: { gender_division: string | null } | null;
    }>) {
      countByEvent.set(r.event_id, (countByEvent.get(r.event_id) ?? 0) + 1);
      const div = r.usau_teams?.gender_division;
      if (div) {
        if (!divisionsByEvent.has(r.event_id)) divisionsByEvent.set(r.event_id, new Set());
        divisionsByEvent.get(r.event_id)!.add(div);
      }
    }
  }

  const filtered = (events ?? []).filter((e) => {
    if (!opts?.genderDivision) return true;
    const set = divisionsByEvent.get(e.id);
    return set ? set.has(opts.genderDivision) : false;
  });

  return filtered.map((e) => ({
    id: e.id,
    slug: e.usau_slug,
    name: e.name,
    season: e.season,
    startDate: e.start_date,
    endDate: e.end_date,
    city: e.city,
    state: e.state,
    competitionLevel: e.competition_level,
    teamCount: countByEvent.get(e.id) ?? 0,
  }));
}

/**
 * Returns the most relevant tournament for "The Games" view.
 *
 * Tiered preference:
 *   1. A LIVE event (started, not yet ended) — Club or College, whatever's
 *      happening right now. This is the one that should headline.
 *   2. The soonest-upcoming event with games already scraped.
 *   3. The most-recently-completed event with games.
 *
 * We consider any tournament-grade level (Club, College D-I/D-III,
 * Masters, Grand Masters) — these are the ones with real bracket data.
 * HS/MS/Beach are excluded so we don't surface a state HS tournament
 * over a major club event.
 *
 * Returns the slug only; callers fetch the full event via getEvent().
 * The second return value is true when the chosen event has NO games
 * ingested yet — UI can render a "happening now, brackets pending"
 * fallback.
 */
const FLAGSHIP_LEVELS: CompetitionLevel[] = [
  'CLUB',
  'COLLEGE_D1',
  'COLLEGE_D3',
  'MASTERS',
  'GRAND_MASTERS',
];

export async function getCurrentEvent(opts?: {
  /** Filter to events whose participating teams include this division. */
  genderDivision?: 'Men' | 'Women' | 'Mixed';
}): Promise<{ slug: string; hasGames: boolean } | null> {
  const db = await supabase();
  const today = new Date().toISOString().slice(0, 10);
  const sixMonthsBack = new Date(Date.now() - 180 * 86400_000).toISOString().slice(0, 10);
  const sixMonthsForward = new Date(Date.now() + 180 * 86400_000).toISOString().slice(0, 10);

  const { data: windowEvents } = await db
    .from('usau_events')
    .select('id, usau_slug, start_date, end_date, competition_level')
    .in('competition_level', FLAGSHIP_LEVELS)
    .gte('start_date', sixMonthsBack)
    .lte('start_date', sixMonthsForward)
    .order('start_date', { ascending: true });

  type EventRow = {
    id: string;
    usau_slug: string;
    start_date: string | null;
    end_date: string | null;
    competition_level: string | null;
  };
  let events: EventRow[] = (windowEvents ?? []) as EventRow[];

  // Per-event game counts + gender divisions of participating teams.
  const counts = new Map<string, number>();
  const divisionsByEvent = new Map<string, Set<string>>();
  if (events.length > 0) {
    // Games count (for "has games" + ranking).
    const { data: gameCounts } = await db
      .from('usau_games')
      .select('event_id')
      .in('event_id', events.map((e) => e.id));
    for (const g of gameCounts ?? []) {
      counts.set(g.event_id, (counts.get(g.event_id) ?? 0) + 1);
    }
    // Participating divisions, for the optional filter.
    if (opts?.genderDivision) {
      const { data: parts } = await db
        .from('usau_event_teams')
        .select('event_id, usau_teams(gender_division)')
        .in('event_id', events.map((e) => e.id));
      for (const r of (parts ?? []) as Array<{
        event_id: string;
        usau_teams: { gender_division: string | null } | null;
      }>) {
        const div = r.usau_teams?.gender_division;
        if (div) {
          if (!divisionsByEvent.has(r.event_id)) divisionsByEvent.set(r.event_id, new Set());
          divisionsByEvent.get(r.event_id)!.add(div);
        }
      }
      events = events.filter((e) => divisionsByEvent.get(e.id)?.has(opts.genderDivision!) ?? false);
    }
  }

  // Tier 1: live tournament (has started, hasn't ended). Take the soonest-
  // ending one so we focus on what's about to wrap up.
  const live = events
    .filter((e) => (e.start_date ?? '') <= today && (e.end_date ?? e.start_date ?? '') >= today)
    .sort((a, b) => (a.end_date ?? '').localeCompare(b.end_date ?? ''));
  if (live.length > 0) {
    const e = live[0];
    return { slug: e.usau_slug, hasGames: (counts.get(e.id) ?? 0) > 0 };
  }

  // Tier 2: soonest upcoming with games.
  const upcoming = events
    .filter((e) => (e.start_date ?? '') > today && (counts.get(e.id) ?? 0) > 0)
    .sort((a, b) => (a.start_date ?? '').localeCompare(b.start_date ?? ''));
  if (upcoming.length > 0) {
    return { slug: upcoming[0].usau_slug, hasGames: true };
  }

  // Tier 3: most-recent completed with games (search wider if window is empty).
  const completed = events
    .filter((e) => (counts.get(e.id) ?? 0) > 0)
    .sort((a, b) => (b.start_date ?? '').localeCompare(a.start_date ?? ''));
  if (completed.length > 0) {
    return { slug: completed[0].usau_slug, hasGames: true };
  }

  // Final fallback: most-recent flagship event with games anywhere in DB.
  // Apply the division filter via the team-participation join when set.
  const { data: latest } = await db
    .from('usau_events')
    .select('id, usau_slug, start_date')
    .in('competition_level', FLAGSHIP_LEVELS)
    .order('start_date', { ascending: false, nullsFirst: false })
    .limit(80);
  for (const e of latest ?? []) {
    const { count } = await db
      .from('usau_games')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', e.id);
    if ((count ?? 0) === 0) continue;
    if (opts?.genderDivision) {
      // Skip events that don't have the requested division participating.
      const { count: matchCount } = await db
        .from('usau_event_teams')
        .select('team_id, usau_teams!inner(gender_division)', { count: 'exact', head: true })
        .eq('event_id', e.id)
        .eq('usau_teams.gender_division', opts.genderDivision);
      if (!matchCount || matchCount === 0) continue;
    }
    return { slug: e.usau_slug, hasGames: true };
  }
  return null;
}

/**
 * @deprecated Kept as a thin wrapper for any callers still asking only
 * for a slug. New code should use getCurrentEvent() which also reports
 * whether games are ingested.
 */
export async function getCurrentClubEventSlug(): Promise<string | null> {
  const res = await getCurrentEvent();
  return res?.slug ?? null;
}

/**
 * Find a USAU player profile by name using the token-subset match (see
 * src/lib/name-match.ts). Handles "Mitchell McCarthy" ↔ "Robert Mitchell
 * McCarthy" — the surname must match exactly, and the shorter name's
 * given tokens must all appear in the longer name's given tokens.
 *
 * Returns the player_id of the most-active matching row (most roster
 * entries). Returns null if no match. Used by /players/{ufaSlug} to
 * deep-link to the same human's USAU career.
 */
export async function findUsauPlayerByName(name: string): Promise<string | null> {
  const surname = surnameForPrefilter(name);
  if (!surname) return null;
  const db = await supabase();
  // Cheap SQL prefilter: anyone whose display_name *contains* the
  // surname. We then apply the strict token-subset match in JS. The
  // surname filter is conservative — Postgres only returns the small
  // surname-cluster (typically < 30 rows for any given surname).
  const { data: matches } = await db
    .from('usau_players')
    .select('id, display_name')
    .ilike('display_name', `%${surname}%`)
    .limit(500);
  const candidates = (matches ?? []).filter((m) => namesMatch(name, m.display_name));
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].id;
  // Multiple candidate IDs — pick the one with the most rosters (most active).
  const ids = candidates.map((c) => c.id);
  const { data: rosters } = await db
    .from('usau_rosters')
    .select('player_id')
    .in('player_id', ids);
  const counts = new Map<string, number>();
  for (const r of rosters ?? []) {
    counts.set(r.player_id, (counts.get(r.player_id) ?? 0) + 1);
  }
  return ids.sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0))[0];
}

/**
 * USAU Club National Champions by season.
 * Returns a map of `season → { teamId, teamName }`. We look for the
 * `round = 'final'` game inside the National Championship bracket of the
 * Club Nationals event; the team with the higher score is the champion.
 *
 * Since usau_teams has multiple rows per franchise (one per year), the
 * returned teamId is the specific season's row — useful for matching
 * against usau_rosters.team_id directly.
 */
export interface UsauChampion {
  teamId: string;
  teamName: string;
  division: 'Men' | 'Women' | 'Mixed' | null;
}

/**
 * USAU Club National Champions, keyed by season then division.
 *
 * USAU runs Men's, Women's, and Mixed Nationals as one event id — so a
 * single event can have THREE finals (one per division). We resolve the
 * winning team for each, look up its gender_division, and bucket
 * accordingly. Callers can also call championsForSeasonAndDivision() to
 * pluck out a specific (season, division) winner.
 */
export async function getUsauClubChampionsBySeason(): Promise<
  Map<number, Map<string, UsauChampion>>
> {
  const db = await supabase();
  const { data: nationals } = await db
    .from('usau_events')
    .select('id, season, usau_slug')
    .eq('competition_level', 'CLUB')
    .or(
      'usau_slug.ilike.%national-championships%,' +
        'usau_slug.ilike.%club-nationals%,' +
        'usau_slug.ilike.%usa-ultimate-club-championships%',
    )
    .not('usau_slug', 'ilike', '%us-open%');
  const nationalsBySeason = new Map<string, { id: string; season: number }>();
  for (const e of nationals ?? []) {
    nationalsBySeason.set(e.id, { id: e.id, season: e.season });
  }
  if (nationalsBySeason.size === 0) return new Map();

  // Pull every round='final' game at any Nationals event. With Men +
  // Women + Mixed all under one event_id, we expect up to 3 finals per
  // event — one per division.
  const { data: finals } = await db
    .from('usau_games')
    .select(
      'event_id, team_a_id, team_b_id, score_a, score_b, scheduled_at, bracket_name, ' +
        'team_a:usau_teams!team_a_id(name, gender_division), ' +
        'team_b:usau_teams!team_b_id(name, gender_division)',
    )
    .in('event_id', Array.from(nationalsBySeason.keys()))
    .eq('round', 'final');

  type TeamRef = { name: string; gender_division: string | null } | null;
  type Row = {
    event_id: string;
    team_a_id: string | null;
    team_b_id: string | null;
    score_a: number | null;
    score_b: number | null;
    scheduled_at: string | null;
    bracket_name: string | null;
    team_a: TeamRef;
    team_b: TeamRef;
  };

  // season → division → champion
  const result = new Map<number, Map<string, UsauChampion>>();
  for (const g of (finals ?? []) as unknown as Row[]) {
    if (g.score_a == null || g.score_b == null) continue;
    if (g.team_a_id == null || g.team_b_id == null) continue;
    const ev = nationalsBySeason.get(g.event_id);
    if (!ev) continue;

    const aWon = g.score_a > g.score_b;
    const winnerId = aWon ? g.team_a_id : g.team_b_id;
    const winnerName = (aWon ? g.team_a?.name : g.team_b?.name) ?? 'Unknown';
    // Both teams in a final are the same division. Use either side's
    // gender_division — fall back to inferring from the bracket name
    // ("Women's Division Championship") if the team lacks it.
    let division = (aWon ? g.team_a?.gender_division : g.team_b?.gender_division) ?? null;
    if (!division) {
      const b = (g.bracket_name ?? '').toLowerCase();
      if (b.includes('mixed')) division = 'Mixed';
      else if (b.includes("women")) division = 'Women';
      else if (b.includes("men")) division = 'Men';
    }
    if (!division) continue;

    if (!result.has(ev.season)) result.set(ev.season, new Map());
    const seasonMap = result.get(ev.season)!;
    // Multiple final rows for the same (season, division) shouldn't
    // happen, but if they do prefer the latest-scheduled one.
    const existing = seasonMap.get(division);
    if (existing) {
      // Compare schedules to keep the latest.
      const ts = g.scheduled_at ? new Date(g.scheduled_at).getTime() : 0;
      // We don't store scheduled_at on UsauChampion; keep first-write
      // for simplicity unless we explicitly add it. First-write wins.
      void ts;
      continue;
    }
    seasonMap.set(division, {
      teamId: winnerId,
      teamName: winnerName,
      division: division as UsauChampion['division'],
    });
  }
  return result;
}

/** Convenience: just the champion for one (season, division), or null. */
export function championFor(
  champions: Map<number, Map<string, UsauChampion>>,
  season: number,
  division: 'Men' | 'Women' | 'Mixed' | null | undefined,
): UsauChampion | null {
  if (!division) return null;
  return champions.get(season)?.get(division) ?? null;
}

/** Distinct seasons we have any event for, newest first. */
/** Lightweight top-N USAU club teams for the nav mega-menu PREVIEW (id + name
 *  + Nationals placement only), via the top_usau_club_teams RPC — ONE round
 *  trip, no ranking engine. Do NOT use for the real ranked Teams page; that's
 *  listRankedTeams(). */
export async function listTopUsauTeams(opts?: {
  genderDivision?: 'Men' | 'Women' | 'Mixed';
  limit?: number;
}): Promise<Array<{ id: string; name: string; nationalsPlacement: number | null }>> {
  const db = await supabase();
  // Cast: these RPCs are newer than the generated database.types.ts, so the
  // function-name union doesn't include them yet. Regenerate types to drop it.
  // NOTE: must call db.rpc(...) directly (bound) — extracting it into a local
  // `const rpc = db.rpc` detaches `this`, and supabase-js's rpc() then reads
  // `this.rest` → "Cannot read properties of undefined (reading 'rest')".
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rpcDb = db as unknown as { rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: unknown }> };
  const { data, error } = await rpcDb.rpc('top_usau_club_teams', {
    p_gender_division: opts?.genderDivision ?? 'Men',
    p_limit: opts?.limit ?? 16,
  });
  if (error) throw error;
  return ((data ?? []) as Array<{ id: string; name: string; nationals_placement: number | null }>).map(
    (r) => ({ id: r.id, name: r.name, nationalsPlacement: r.nationals_placement }),
  );
}

export async function listSeasons(): Promise<number[]> {
  const db = await supabase();
  // Distinct seasons via the pre-aggregated RPC. The naive
  // `.select('season')` over usau_events hit supabase-js's 1000-row cap —
  // with ~2000+ event rows ordered season-DESC, only the newest ~2-3 seasons
  // survived the cap, so the dropdown showed only 2024–2026 even though we
  // have data back to 2018. The RPC returns one row per distinct season.
  // Call db.rpc(...) DIRECTLY (bound) — a detached `const rpc = db.rpc` loses
  // `this` and supabase-js reads `this.rest` → "reading 'rest'" TypeError.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rpcDb = db as unknown as { rpc: (fn: string) => Promise<{ data: any; error: unknown }> };
  const { data, error } = await rpcDb.rpc('distinct_usau_seasons');
  if (error) throw error;
  return ((data ?? []) as Array<{ season: number }>)
    .map((r) => r.season)
    .sort((a, b) => b - a);
}

// ─── Teams ─────────────────────────────────────────────────────────────

export interface UsauTeamCard {
  id: string;
  name: string;
  state: string | null;
  city: string | null;
  competitionLevel: string | null;
  genderDivision: string | null;
}

// ─── Players ───────────────────────────────────────────────────────────

export interface UsauPlayerCard {
  id: string;
  displayName: string;
  /** A team this player has been rostered on (deduped); used as a hint. */
  primaryTeam: string | null;
}

export interface UsauPlayerListRow {
  /** Anchor player_id — the one with the most roster rows for this name.
   *  Linking here picks up the full cluster via getPlayerProfile(). */
  id: string;
  displayName: string;
  /** Latest team this player played for. */
  latestTeam: string | null;
  latestTeamId: string | null;
  /** Most recent season we've seen them rostered. */
  latestSeason: number | null;
  /** Number of distinct (team, season) stints — used as an "activity"
   *  proxy until we have real cross-event stats. */
  appearances: number;
  /** Years this player won the Club Nationals championship. Empty if none. */
  championYears: number[];
}

/**
 * Top N USAU players by activity (number of distinct team-season stints).
 * Names are deduped so each human appears once even when the scraper
 * inserted multiple player_ids for them. The returned id is the anchor
 * with the most roster rows (richest profile).
 */
export async function listUsauPlayers(opts?: {
  limit?: number;
  season?: number;
  search?: string;
  /** Restrict to players whose team is in this gender division. */
  genderDivision?: 'Men' | 'Women' | 'Mixed';
}): Promise<UsauPlayerListRow[]> {
  const limit = opts?.limit ?? 60;
  const db = await supabase();

  // Pull rosters with their team + season. Two strategies:
  //   1. With a search term: narrow at the SQL layer by first finding
  //      matching player_ids (usau_players ilike), then only fetching
  //      THEIR rosters. Cheap even on a 30k-row table — typical search
  //      returns < 100 player_ids and < 500 rosters.
  //   2. Without search: scan rosters in pages of 1000 (Supabase ceiling)
  //      so a > 1k roster table doesn't silently drop entries.
  type RosterRow = {
    player_id: string;
    season: number;
    team_id: string;
    usau_players: { display_name: string } | null;
    usau_teams: { name: string; gender_division: string | null } | null;
  };
  let rows: RosterRow[] = [];

  if (opts?.search && opts.search.trim().length >= 2) {
    const needle = opts.search.trim();
    const pattern = `%${needle.replace(/[%_]/g, '\\$&')}%`;
    // Step 1: matching player_ids. Supabase caps each select at 1000.
    const { data: matches, error: pErr } = await db
      .from('usau_players')
      .select('id')
      .ilike('display_name', pattern)
      .limit(1000);
    if (pErr) throw pErr;
    const matchIds = (matches ?? []).map((m) => m.id);
    if (matchIds.length === 0) return [];

    // Step 2: rosters for those player_ids. Page in 1000 chunks (Supabase
    // ".in()" has a similar ceiling).
    const CHUNK = 500;
    for (let i = 0; i < matchIds.length; i += CHUNK) {
      const slice = matchIds.slice(i, i + CHUNK);
      let q = db
        .from('usau_rosters')
        .select(
          'player_id, season, team_id, usau_players(display_name), usau_teams!inner(name, gender_division)',
        )
        .in('player_id', slice);
      if (opts?.season != null) q = q.eq('season', opts.season);
      if (opts?.genderDivision) {
        q = q.eq('usau_teams.gender_division', opts.genderDivision);
      }
      const { data, error } = await q;
      if (error) throw error;
      rows = rows.concat((data ?? []) as unknown as RosterRow[]);
    }
  } else {
    const PAGE = 1000;
    let from = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      let q = db
        .from('usau_rosters')
        .select(
          'player_id, season, team_id, usau_players(display_name), usau_teams!inner(name, gender_division)',
        )
        .range(from, from + PAGE - 1);
      if (opts?.season != null) q = q.eq('season', opts.season);
      if (opts?.genderDivision) {
        q = q.eq('usau_teams.gender_division', opts.genderDivision);
      }
      const { data, error } = await q;
      if (error) throw error;
      const page = (data ?? []) as unknown as RosterRow[];
      rows = rows.concat(page);
      if (page.length < PAGE) break;
      from += PAGE;
      if (from > 200_000) break;
    }
  }

  type Row = RosterRow;

  // Fetch champion map once so we can tag list rows in the same loop.
  const championsBySeason = await getUsauClubChampionsBySeason().catch(
    () => new Map<number, Map<string, UsauChampion>>(),
  );

  // Group by lowercased name → aggregate stats across player_id dupes.
  interface Agg {
    anchorId: string;
    anchorCount: number;
    displayName: string;
    latestSeason: number | null;
    latestTeam: string | null;
    latestTeamId: string | null;
    appearances: number;
    perPlayerCount: Map<string, number>;
    championYears: Set<number>;
  }
  const byName = new Map<string, Agg>();
  for (const r of (rows ?? []) as unknown as Row[]) {
    const name = r.usau_players?.display_name;
    if (!name) continue;
    const key = name.toLowerCase();
    // Look up the (season, division) champion — same Nationals event
    // has separate Men/Women/Mixed finals, so we need both keys.
    const div = r.usau_teams?.gender_division ?? null;
    const champ = div ? championsBySeason.get(r.season)?.get(div) : null;
    const isChampStint = !!champ && champ.teamId === r.team_id;
    const existing = byName.get(key);
    if (!existing) {
      const ppc = new Map<string, number>([[r.player_id, 1]]);
      const cy = new Set<number>();
      if (isChampStint) cy.add(r.season);
      byName.set(key, {
        anchorId: r.player_id,
        anchorCount: 1,
        displayName: name,
        latestSeason: r.season,
        latestTeam: r.usau_teams?.name ?? null,
        latestTeamId: r.team_id,
        appearances: 1,
        perPlayerCount: ppc,
        championYears: cy,
      });
    } else {
      const ppc = existing.perPlayerCount;
      const next = (ppc.get(r.player_id) ?? 0) + 1;
      ppc.set(r.player_id, next);
      if (next > existing.anchorCount) {
        existing.anchorCount = next;
        existing.anchorId = r.player_id;
      }
      if (existing.latestSeason == null || r.season > existing.latestSeason) {
        existing.latestSeason = r.season;
        existing.latestTeam = r.usau_teams?.name ?? null;
        existing.latestTeamId = r.team_id;
      }
      existing.appearances += 1;
      if (isChampStint) existing.championYears.add(r.season);
    }
  }

  // Note: when opts.search was provided, the SQL pass above already
  // filtered rosters to just matching player_ids, so no JS filter needed.
  const entries = Array.from(byName.values());

  entries.sort((a, b) => {
    // Prefer most-recently-active first, then by total appearances.
    const sa = a.latestSeason ?? 0;
    const sb = b.latestSeason ?? 0;
    if (sa !== sb) return sb - sa;
    return b.appearances - a.appearances;
  });

  return entries.slice(0, limit).map((e) => ({
    id: e.anchorId,
    displayName: e.displayName,
    latestTeam: e.latestTeam,
    latestTeamId: e.latestTeamId,
    latestSeason: e.latestSeason,
    appearances: e.appearances,
    championYears: Array.from(e.championYears).sort((a, b) => b - a),
  }));
}

// ─── Search ────────────────────────────────────────────────────────────

export interface SearchResult {
  kind: 'team' | 'player' | 'tournament';
  /** team/player → UUID; tournament → usau_slug (the /usau/events/[slug] route). */
  id: string;
  name: string;
  /** Secondary line — team name for a player, state/level for a team,
   *  season + dates for a tournament. */
  hint: string | null;
}

/**
 * One-shot text search across teams + players. Short-circuits on very
 * short queries (UI debounces but we still want a low floor).
 *
 * Dedupe behavior:
 *   - Teams: collapse by lowercased name + competition_level. The schema
 *     currently has one team row per event-participation (so "Revolver"
 *     appears 4 times if it played 4 events). The UI wants one card per
 *     canonical team, so we group here and pick the first row's UUID as
 *     the link target. Real fix is a canonical-team merge job; this is
 *     query-time good enough until then.
 *   - Players: collapse by lowercased display_name. Same rationale —
 *     same human on two different teams is currently two rows, but the
 *     search dropdown should show one entry that opens the unified
 *     profile.
 *
 * Uses Postgres ILIKE — fine at our current scale (220 teams, 5k
 * players). Swap in a tsvector + GIN index when we grow past ~50k rows.
 */
/** Compact date range for search hints, e.g. "Jun 13–14" or "Jun 28".
 *  Input is ISO yyyy-mm-dd (date-only); parse as UTC to avoid tz drift. */
function formatEventDateRange(start: string | null, end: string | null): string | null {
  if (!start) return null;
  const fmt = (iso: string) =>
    new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  const s = fmt(start);
  if (!end || end === start) return s;
  // Same month → "Jun 13–14"; else full "Jun 28 – Jul 1".
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  const e = sameMonth
    ? new Date(end + 'T00:00:00Z').toLocaleDateString('en-US', { day: 'numeric', timeZone: 'UTC' })
    : fmt(end);
  return `${s}–${e}`;
}

export async function search(query: string, limit = 8): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const pattern = `%${q.replace(/[%_]/g, '\\$&')}%`;

  // Pull a generous N from each side (3x the display limit) so dedupe
  // doesn't starve us — if "Revolver" returns 4 rows we still want 6
  // distinct teams in the dropdown.
  const overshoot = limit * 3;
  const db = await supabase();
  const [teamRes, playerRes, eventRes] = await Promise.all([
    db
      .from('usau_teams')
      .select('id, name, state, competition_level')
      .ilike('name', pattern)
      .limit(overshoot),
    db
      .from('usau_players')
      .select('id, display_name, usau_rosters(usau_teams(name))')
      .ilike('display_name', pattern)
      .limit(overshoot),
    db
      .from('usau_events')
      .select('usau_slug, name, season, start_date, end_date')
      .ilike('name', pattern)
      // Newest first so the current season's tournaments surface above old ones.
      .order('start_date', { ascending: false, nullsFirst: false })
      .limit(overshoot),
  ]);

  // ── Dedupe teams by (lower(name), competition_level) ─────────────────
  const teamMap = new Map<string, SearchResult>();
  for (const t of teamRes.data ?? []) {
    const key = `${t.name.toLowerCase()}${t.competition_level ?? ''}`;
    if (teamMap.has(key)) continue;
    const hintParts = [t.state, t.competition_level].filter(Boolean) as string[];
    teamMap.set(key, {
      kind: 'team',
      id: t.id,
      name: t.name,
      hint: hintParts.join(' · ') || null,
    });
  }

  // ── Dedupe players by lower(display_name) ────────────────────────────
  const playerMap = new Map<string, SearchResult>();
  for (const p of playerRes.data ?? []) {
    const key = p.display_name.toLowerCase();
    if (playerMap.has(key)) continue;
    const rosters = (p as { usau_rosters?: { usau_teams: { name: string } | null }[] }).usau_rosters ?? [];
    const team = rosters.find((r) => r.usau_teams)?.usau_teams?.name ?? null;
    playerMap.set(key, {
      kind: 'player',
      id: p.id,
      name: p.display_name,
      hint: team,
    });
  }

  // ── Tournaments: keyed by usau_slug (unique per event). Hint = season +
  //    date range; the route uses the slug, not a UUID. ──────────────────────
  const tournamentMap = new Map<string, SearchResult>();
  for (const e of eventRes.data ?? []) {
    const ev = e as { usau_slug: string; name: string; season: number; start_date: string | null; end_date: string | null };
    if (tournamentMap.has(ev.usau_slug)) continue;
    const dates = formatEventDateRange(ev.start_date, ev.end_date);
    const hintParts = [String(ev.season), dates].filter(Boolean) as string[];
    tournamentMap.set(ev.usau_slug, {
      kind: 'tournament',
      id: ev.usau_slug,
      name: ev.name,
      hint: hintParts.join(' · ') || null,
    });
  }

  const results: SearchResult[] = [
    ...teamMap.values(),
    ...playerMap.values(),
    ...tournamentMap.values(),
  ];

  // Prefix matches first, then alphabetical.
  const lower = q.toLowerCase();
  results.sort((a, b) => {
    const ap = a.name.toLowerCase().startsWith(lower) ? 0 : 1;
    const bp = b.name.toLowerCase().startsWith(lower) ? 0 : 1;
    if (ap !== bp) return ap - bp;
    return a.name.localeCompare(b.name);
  });

  return results.slice(0, limit * 2);
}

// ─── Detail pages: team / player / event ───────────────────────────────

export interface UsauPlayerSummary {
  id: string;
  displayName: string;
  /** Every distinct team this human (matched by lowercased name) has been on,
   *  with the events they played at on that team. */
  teamHistory: Array<{
    teamId: string;
    teamName: string;
    season: number;
    jerseyNumber: string | null;
    /** True if this team won the Club Nationals championship that season. */
    isChampion: boolean;
    events: Array<{
      slug: string;
      name: string;
      season: number;
      startDate: string | null;
      goals: number | null;
      assists: number | null;
      seed: number | null;
      pool: string | null;
    }>;
  }>;
  /** Years this player won the USAU Club National Championship. */
  championYears: number[];
}

/**
 * Build a player profile for the given USAU player id. We look up the
 * row's display name, then UNION across every player row whose
 * lowercased display name matches — that's the v1 cross-team identity.
 *
 * Known limitation: two real humans with the same exact name will merge
 * into one profile. We accept that for v1 (estimated < 2% collision rate
 * on the current dataset). Real fix is a `usau_canonical_players` +
 * `usau_player_identity_links` schema with auto-merge scoring (jersey
 * streak, roster overlap, geo, timeline) and a manual override table.
 * Design doc: ~/.claude/projects/<...>/memory/project_usau_player_identity.md
 */
export async function getPlayerProfile(playerId: string): Promise<UsauPlayerSummary | null> {
  const db = await supabase();
  const { data: anchor, error: anchorErr } = await db
    .from('usau_players')
    .select('id, display_name')
    .eq('id', playerId)
    .maybeSingle();
  if (anchorErr) throw anchorErr;
  if (!anchor) return null;

  // Identity rule (v1): merge every row with the same lowercased name,
  // EXCEPT split when two rows share a season but list different teams
  // (one human cannot roster on two club teams in the same season).
  const { data: namesakes } = await db
    .from('usau_players')
    .select('id, display_name')
    .ilike('display_name', anchor.display_name);
  const candidateIds = (namesakes ?? [])
    .filter((p) => p.display_name.toLowerCase() === anchor.display_name.toLowerCase())
    .map((p) => p.id);

  if (candidateIds.length === 0) {
    return { id: anchor.id, displayName: anchor.display_name, teamHistory: [], championYears: [] };
  }

  // Pull rosters for ALL candidates so we can compute the cluster.
  // gender_division is needed downstream to look up the right (season,
  // division) champion since 3 divisions share the same Nationals event.
  const { data: candidateRosters } = await db
    .from('usau_rosters')
    .select('player_id, team_id, season, jersey_number, usau_teams(name, gender_division)')
    .in('player_id', candidateIds);

  // Union-find: two ids are linked iff they never have (same season,
  // different team). Anchor's connected component = this profile.
  const parent = new Map<string, string>();
  candidateIds.forEach((id) => parent.set(id, id));
  const find = (x: string): string => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)!)!);
      x = parent.get(x)!;
    }
    return x;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  const rostersByPlayer = new Map<string, Array<{ team_id: string; season: number }>>();
  for (const r of candidateRosters ?? []) {
    if (!rostersByPlayer.has(r.player_id)) rostersByPlayer.set(r.player_id, []);
    rostersByPlayer.get(r.player_id)!.push({ team_id: r.team_id, season: r.season });
  }
  for (let i = 0; i < candidateIds.length; i++) {
    for (let j = i + 1; j < candidateIds.length; j++) {
      const ra = rostersByPlayer.get(candidateIds[i]) ?? [];
      const rb = rostersByPlayer.get(candidateIds[j]) ?? [];
      let conflict = false;
      outer: for (const sa of ra) {
        for (const sb of rb) {
          if (sa.season === sb.season && sa.team_id !== sb.team_id) {
            conflict = true;
            break outer;
          }
        }
      }
      if (!conflict) union(candidateIds[i], candidateIds[j]);
    }
  }
  const anchorCluster = find(anchor.id);
  const playerIds = candidateIds.filter((id) => find(id) === anchorCluster);
  const clusterRosters = (candidateRosters ?? []).filter((r) => playerIds.includes(r.player_id));

  // Stats only need this cluster's player ids.
  const { data: statsData } = await db
    .from('usau_player_event_stats')
    .select('player_id, event_id, team_id, goals, assists')
    .in('player_id', playerIds);
  const rosterRes = { data: clusterRosters };
  const statsRes = { data: statsData };

  const teamIds = Array.from(new Set((rosterRes.data ?? []).map((r) => r.team_id)));
  interface ParticipationRow {
    team_id: string;
    event_id: string;
    seed: number | null;
    pool: string | null;
    usau_events: { usau_slug: string; name: string; season: number; start_date: string | null } | null;
  }
  let participationRows: ParticipationRow[] = [];
  if (teamIds.length > 0) {
    const { data } = await db
      .from('usau_event_teams')
      .select('team_id, event_id, seed, pool, usau_events(usau_slug, name, season, start_date)')
      .in('team_id', teamIds);
    participationRows = (data ?? []) as unknown as ParticipationRow[];
  }

  // Build maps for the join.
  const eventsByTeamId = new Map<string, ParticipationRow[]>();
  for (const row of participationRows) {
    if (!eventsByTeamId.has(row.team_id)) eventsByTeamId.set(row.team_id, []);
    eventsByTeamId.get(row.team_id)!.push(row);
  }
  const statsByEvent = new Map<string, { goals: number; assists: number }>();
  for (const s of statsRes.data ?? []) {
    const prev = statsByEvent.get(s.event_id) ?? { goals: 0, assists: 0 };
    statsByEvent.set(s.event_id, {
      goals: prev.goals + (s.goals ?? 0),
      assists: prev.assists + (s.assists ?? 0),
    });
  }

  // Dedupe team-seasons: scraper sometimes writes multiple rows for the
  // same (team, season) human. Collapse into one stint each.
  const stintMap = new Map<string, UsauPlayerSummary['teamHistory'][number]>();
  for (const r of rosterRes.data ?? []) {
    const teamRel = (r as { usau_teams: { name: string } | null }).usau_teams;
    const teamName = teamRel?.name ?? 'Unknown team';
    const key = r.team_id + '|' + r.season;
    const existing = stintMap.get(key);
    if (!existing) {
      stintMap.set(key, {
        teamId: r.team_id,
        teamName,
        season: r.season,
        jerseyNumber: r.jersey_number,
        isChampion: false,
        events: [],
      });
    } else if (!existing.jerseyNumber && r.jersey_number) {
      existing.jerseyNumber = r.jersey_number;
    }
  }

  for (const stint of stintMap.values()) {
    const seenEvents = new Set<string>();
    const events: typeof stint.events = [];
    for (const p of eventsByTeamId.get(stint.teamId) ?? []) {
      const ev = (p as { usau_events: { usau_slug: string; name: string; season: number; start_date: string | null } | null }).usau_events;
      if (!ev || ev.season !== stint.season) continue;
      if (seenEvents.has(p.event_id)) continue;
      seenEvents.add(p.event_id);
      const stats = statsByEvent.get(p.event_id);
      events.push({
        slug: ev.usau_slug,
        name: ev.name,
        season: ev.season,
        startDate: ev.start_date,
        goals: stats?.goals ?? null,
        assists: stats?.assists ?? null,
        seed: p.seed,
        pool: p.pool,
      });
    }
    events.sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''));
    stint.events = events;
  }

  const teamHistory = Array.from(stintMap.values()).sort(
    (a, b) => b.season - a.season || a.teamName.localeCompare(b.teamName),
  );

  // Mark championship stints. Champions are keyed (season → division →
  // winner) since one Nationals event has separate Men/Women/Mixed
  // finals. We pull the stint's team's gender_division and look up the
  // matching division's winner for that year.
  const champions = await getUsauClubChampionsBySeason().catch(
    () => new Map<number, Map<string, UsauChampion>>(),
  );
  // Build a fast (team_id → division) lookup from the rosters we
  // already have, so we don't re-query.
  const divisionByTeamId = new Map<string, string>();
  for (const r of clusterRosters) {
    const tr = (r as { usau_teams: { gender_division: string | null } | null }).usau_teams;
    if (tr?.gender_division) divisionByTeamId.set(r.team_id, tr.gender_division);
  }
  const championYears: number[] = [];
  for (const stint of teamHistory) {
    const div = divisionByTeamId.get(stint.teamId);
    const champ = div ? champions.get(stint.season)?.get(div) : null;
    if (champ && champ.teamId === stint.teamId) {
      stint.isChampion = true;
      championYears.push(stint.season);
    }
  }
  championYears.sort((a, b) => b - a);

  return {
    id: anchor.id,
    displayName: anchor.display_name,
    teamHistory,
    championYears,
  };
}

export interface UsauTeamSummary {
  id: string;
  name: string;
  state: string | null;
  competitionLevel: string | null;
  genderDivision: string | null;
  /**
   * One entry per season this team has played, newest first. Within
   * each season the events are sorted by date (newest first) and the
   * roster is deduped by (player_name, jersey_number) so the same human
   * isn't listed multiple times when the scraper wrote them under
   * multiple player_ids.
   */
  seasons: Array<{
    season: number;
    events: Array<{
      slug: string;
      name: string;
      startDate: string | null;
      seed: number | null;
      pool: string | null;
      finalPlacement: number | null;
    }>;
    roster: Array<{
      playerId: string;
      name: string;
      jerseyNumber: string | null;
    }>;
  }>;
}

export async function getTeam(teamId: string): Promise<UsauTeamSummary | null> {
  const db = await supabase();
  const { data: anchor, error } = await db
    .from('usau_teams')
    .select('id, name, state, competition_level, gender_division')
    .eq('id', teamId)
    .maybeSingle();
  if (error) throw error;
  if (!anchor) return null;

  // Cluster team rows: the scraper writes one usau_teams row per
  // (name, season) instead of one canonical row, so "Johnny Bravo"
  // shows up as 5 separate ids (one per year). Treat any team with the
  // same name + competition_level + gender_division as the same team.
  const { data: clusterTeams } = await db
    .from('usau_teams')
    .select('id, name, state, competition_level, gender_division')
    .ilike('name', anchor.name);
  const teamIds = (clusterTeams ?? [])
    .filter(
      (t) =>
        t.name.toLowerCase() === anchor.name.toLowerCase() &&
        t.competition_level === anchor.competition_level &&
        t.gender_division === anchor.gender_division,
    )
    .map((t) => t.id);
  if (teamIds.length === 0) teamIds.push(anchor.id);

  const [partRes, rosterRes] = await Promise.all([
    db
      .from('usau_event_teams')
      .select('team_id, event_id, seed, pool, final_placement, usau_events(usau_slug, name, season, start_date)')
      .in('team_id', teamIds),
    db
      .from('usau_rosters')
      .select('player_id, team_id, season, jersey_number, usau_players(display_name)')
      .in('team_id', teamIds),
  ]);

  interface PartRow {
    team_id: string;
    event_id: string;
    seed: number | null;
    pool: string | null;
    final_placement: number | null;
    usau_events: { usau_slug: string; name: string; season: number; start_date: string | null } | null;
  }
  interface RosterRow {
    player_id: string;
    team_id: string;
    season: number;
    jersey_number: string | null;
    usau_players: { display_name: string } | null;
  }

  // Group by season.
  const eventsBySeason = new Map<number, UsauTeamSummary['seasons'][number]['events']>();
  const seenEventBySeason = new Map<number, Set<string>>();
  for (const p of (partRes.data ?? []) as unknown as PartRow[]) {
    const ev = p.usau_events;
    if (!ev) continue;
    const seenSet = seenEventBySeason.get(ev.season) ?? new Set<string>();
    if (seenSet.has(p.event_id)) continue;
    seenSet.add(p.event_id);
    seenEventBySeason.set(ev.season, seenSet);
    if (!eventsBySeason.has(ev.season)) eventsBySeason.set(ev.season, []);
    eventsBySeason.get(ev.season)!.push({
      slug: ev.usau_slug,
      name: ev.name,
      startDate: ev.start_date,
      seed: p.seed,
      pool: p.pool,
      finalPlacement: p.final_placement,
    });
  }

  // Roster: dedupe by (season, lowercased name, jersey). When the same
  // human shows up under multiple player_ids in the same season we keep
  // the first one we see — same caveat as the player profile clustering.
  const rosterBySeason = new Map<
    number,
    Map<string, UsauTeamSummary['seasons'][number]['roster'][number]>
  >();
  for (const r of (rosterRes.data ?? []) as unknown as RosterRow[]) {
    const player = r.usau_players;
    if (!player) continue;
    const key = `${player.display_name.toLowerCase()}|${(r.jersey_number ?? '').trim()}`;
    if (!rosterBySeason.has(r.season)) rosterBySeason.set(r.season, new Map());
    const seasonMap = rosterBySeason.get(r.season)!;
    if (!seasonMap.has(key)) {
      seasonMap.set(key, {
        playerId: r.player_id,
        name: player.display_name,
        jerseyNumber: r.jersey_number,
      });
    }
  }

  // Assemble seasons.
  const allSeasons = new Set<number>();
  for (const s of eventsBySeason.keys()) allSeasons.add(s);
  for (const s of rosterBySeason.keys()) allSeasons.add(s);
  const seasons = Array.from(allSeasons)
    .sort((a, b) => b - a)
    .map((season) => {
      const events = (eventsBySeason.get(season) ?? []).slice().sort((a, b) =>
        (b.startDate ?? '').localeCompare(a.startDate ?? ''),
      );
      const roster = Array.from(rosterBySeason.get(season)?.values() ?? []).sort((a, b) => {
        const jersey = (s: string | null) => (s != null ? parseInt(s, 10) : 999);
        const ja = jersey(a.jerseyNumber);
        const jb = jersey(b.jerseyNumber);
        if (!isNaN(ja) && !isNaN(jb) && ja !== jb) return ja - jb;
        return a.name.localeCompare(b.name);
      });
      return { season, events, roster };
    });

  return {
    id: anchor.id,
    name: anchor.name,
    state: anchor.state,
    competitionLevel: anchor.competition_level,
    genderDivision: anchor.gender_division,
    seasons,
  };
}

export interface UsauEventSummary {
  id: string;
  slug: string;
  name: string;
  season: number;
  startDate: string | null;
  endDate: string | null;
  city: string | null;
  state: string | null;
  competitionLevel: string;
  teams: Array<{
    teamId: string;
    teamName: string;
    seed: number | null;
    pool: string | null;
    finalPlacement: number | null;
    /** "Men" | "Women" | "Mixed" | "Open" — used to split mixed-gender events
     *  like College Championships into separate Men's/Women's brackets. */
    genderDivision: string | null;
  }>;
  games: Array<{
    id: string;
    round: string;
    bracketName: string | null;
    teamAId: string | null;
    teamAName: string | null;
    teamBId: string | null;
    teamBName: string | null;
    seedA: number | null;
    seedB: number | null;
    scoreA: number | null;
    scoreB: number | null;
    location: string | null;
    scheduledAt: string | null;
    status: string;
  }>;
}

export async function getEvent(slug: string): Promise<UsauEventSummary | null> {
  const db = await supabase();
  const { data: event, error } = await db
    .from('usau_events')
    .select('id, usau_slug, name, season, start_date, end_date, city, state, competition_level')
    .eq('usau_slug', slug)
    .maybeSingle();
  if (error) throw error;
  if (!event) return null;

  const [partRes, gameRes] = await Promise.all([
    db
      .from('usau_event_teams')
      .select('team_id, seed, pool, final_placement, usau_teams(name, gender_division)')
      .eq('event_id', event.id),
    db
      .from('usau_games')
      .select(
        // usau_games has two FKs to usau_teams (team_a + team_b), so we
        // hint PostgREST with the !<columnName> syntax to disambiguate.
        `id, round, bracket_name, team_a_id, team_b_id,
         seed_a, seed_b, score_a, score_b, location, scheduled_at, status,
         team_a:usau_teams!team_a_id(name),
         team_b:usau_teams!team_b_id(name)`,
      )
      .eq('event_id', event.id),
  ]);

  const teams = (partRes.data ?? []).map((p) => {
    const t = (p as { usau_teams: { name: string; gender_division: string | null } | null }).usau_teams;
    return {
      teamId: p.team_id,
      teamName: t?.name ?? 'Unknown',
      seed: p.seed,
      pool: p.pool,
      finalPlacement: p.final_placement,
      genderDivision: t?.gender_division ?? null,
    };
  });

  const games = (gameRes.data ?? []).map((g) => {
    const ta = (g as { team_a: { name: string } | null }).team_a;
    const tb = (g as { team_b: { name: string } | null }).team_b;
    return {
      id: g.id,
      round: g.round,
      bracketName: g.bracket_name,
      teamAId: g.team_a_id,
      teamAName: ta?.name ?? null,
      teamBId: g.team_b_id,
      teamBName: tb?.name ?? null,
      seedA: g.seed_a,
      seedB: g.seed_b,
      scoreA: g.score_a,
      scoreB: g.score_b,
      location: g.location,
      scheduledAt: g.scheduled_at,
      status: g.status,
    };
  });

  return {
    id: event.id,
    slug: event.usau_slug,
    name: event.name,
    season: event.season,
    startDate: event.start_date,
    endDate: event.end_date,
    city: event.city,
    state: event.state,
    competitionLevel: event.competition_level,
    teams,
    games,
  };
}

/** Quick test: is this id a USAU UUID (vs a UFA player slug like "cdykes")? */
export function looksLikeUsauUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

// ─── Ranked team lists ─────────────────────────────────────────────────

export interface RankedTeam {
  id: string;
  name: string;
  state: string | null;
  competitionLevel: string | null;
  genderDivision: string | null;
  /** Most-recent Nationals placement (1 = champion). null if they didn't
   *  make Nationals that year, in which case we fall back to best
   *  Regionals placement (also nullable). */
  nationalsPlacement: number | null;
  bestRegionalsPlacement: number | null;
  /** The season we used to rank them. */
  season: number;
  /** Slug of the Nationals (or, if absent, Regional) event used. Lets the
   *  UI link back to the event that produced the rank. */
  rankedFromSlug: string | null;
}

/**
 * Teams ranked by their finish at last season's Nationals.
 * Top 16 (or however many made Nationals that year) come first, in
 * placement order. Below them: teams that played that season but didn't
 * make Nationals, ranked by best Regionals placement.
 *
 * @param genderDivision optional filter (e.g. 'Men' for Club Open). When
 *   omitted, returns everything.
 * @param season the season to rank by. Defaults to the most recent season
 *   that has a Nationals event with placement data.
 */
type RankableLevel = 'CLUB' | 'COLLEGE_D1' | 'COLLEGE_D3' | 'MASTERS' | 'GRAND_MASTERS';

// Per-level ILIKE patterns identifying a level's Nationals/Championship event,
// so College's "Championships" doesn't collide with Club's "Nationals".
const CHAMPIONSHIP_NAME_LIKE: Record<RankableLevel, string> = {
  CLUB: '%Nationals%',
  COLLEGE_D1: '%D-I College Championship%',
  COLLEGE_D3: '%D-III College Championship%',
  MASTERS: '%Masters Championship%',
  GRAND_MASTERS: '%Grand Masters Championship%',
};
function championshipNameLikeFor(level: RankableLevel): string {
  return CHAMPIONSHIP_NAME_LIKE[level];
}

/**
 * Fraction of the previous completed season's competing-team count that the
 * IN-PROGRESS season must reach (teams that have played ≥1 game) before we
 * start ranking by the current season instead of the last completed Nationals.
 *
 * Rationale: a single early-season tournament (e.g. one "Tune Up" with 8 teams)
 * isn't enough to rank the whole field. USAU's full field isn't even known
 * until Sectionals. Using the prior season's total team count as a stable,
 * known denominator, we wait until ~80% of that many distinct teams have
 * actually played this season — which naturally trips around Sectionals when
 * the bulk of the field registers and plays.
 *
 * NOTE / FUTURE WORK — USAU RANKING ALGORITHM:
 * Once we cross this threshold we currently still order by entry seed (see the
 * banner in usau-teams-ranked.tsx). The REAL goal is to implement USAU's
 * official ranking algorithm (the rating-based system that weights each game's
 * result by opponent strength and score differential, iterated to convergence)
 * to produce true in-season rankings from game results. When that lands it
 * replaces the seed-ordering AND can supersede this crude threshold with a
 * proper "enough connected results to rate" check. See vault: "USAU rating
 * algorithm formula" in the data-sources memory.
 */
const CURRENT_SEASON_RANK_THRESHOLD = 0.8;

/**
 * Pick the season to rank for a level:
 *   1. If the IN-PROGRESS season (the newest season with ANY events) has had
 *      ≥ CURRENT_SEASON_RANK_THRESHOLD × (prior season's competing-team count)
 *      distinct teams play at least one game, use the in-progress season.
 *   2. Otherwise fall back to the most recent season whose Nationals event has
 *      actually been PLAYED (has participating teams). We can't just take
 *      MAX(season) of Nationals events — USAU schedules next season's Nationals
 *      far in advance, so a future, unplayed event row (0 teams) would win and
 *      render the page empty.
 * Returns null if nothing qualifies.
 */
async function resolveRankableSeason(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  compLevel: RankableLevel,
): Promise<number | null> {
  // Distinct teams that have played ≥1 event in a given (season, level).
  const teamsPlayedInSeason = async (s: number): Promise<number> => {
    const { data } = await db
      .from('usau_event_teams')
      .select('team_id, usau_events!inner(season, competition_level)')
      .eq('usau_events.season', s)
      .eq('usau_events.competition_level', compLevel);
    const ids = new Set<string>();
    for (const r of (data ?? []) as Array<{ team_id: string }>) ids.add(r.team_id);
    return ids.size;
  };

  // Most recent season that has a PLAYED Nationals event (the safe fallback).
  const { data: natsEvents } = await db
    .from('usau_events')
    .select('id, season')
    .eq('competition_level', compLevel)
    .ilike('name', championshipNameLikeFor(compLevel))
    .order('season', { ascending: false })
    .limit(12);

  let completedNatsSeason: number | null = null;
  for (const ev of (natsEvents ?? []) as Array<{ id: string; season: number }>) {
    const { count } = await db
      .from('usau_event_teams')
      .select('team_id', { count: 'exact', head: true })
      .eq('event_id', ev.id);
    if ((count ?? 0) > 0) {
      completedNatsSeason = ev.season;
      break;
    }
  }

  // Newest season with any events at all (the in-progress season, if later).
  const { data: newestEvent } = await db
    .from('usau_events')
    .select('season')
    .eq('competition_level', compLevel)
    .order('season', { ascending: false })
    .limit(1);
  const newestSeason: number | null = newestEvent?.[0]?.season ?? null;

  // If there's a season newer than the last completed Nationals, test the 80%
  // threshold against the prior (completed) season's team count.
  if (
    newestSeason != null &&
    completedNatsSeason != null &&
    newestSeason > completedNatsSeason
  ) {
    const denom = await teamsPlayedInSeason(completedNatsSeason);
    const played = await teamsPlayedInSeason(newestSeason);
    if (denom > 0 && played >= denom * CURRENT_SEASON_RANK_THRESHOLD) {
      return newestSeason;
    }
  }

  // Fall back to the last completed Nationals season (or newest as last resort).
  return completedNatsSeason ?? newestSeason;
}

export async function listRankedTeams(opts?: {
  genderDivision?: 'Men' | 'Women' | 'Mixed';
  competitionLevel?: RankableLevel;
  season?: number;
}): Promise<{ season: number; teams: RankedTeam[] }> {
  const db = await supabase();
  const compLevel: RankableLevel = opts?.competitionLevel ?? 'CLUB';

  // For College championships USAU uses event-name patterns like
  // "D-I College Championships" / "D-III College Championships". The
  // Club Nationals events match a different phrase ("USA Ultimate Club
  // Nationals"). We use a level-specific regex so we don't accidentally
  // pick a different level's event when finding "the most recent
  // Nationals season" for this filter.
  const championshipNameLike = CHAMPIONSHIP_NAME_LIKE;
  // Regionals naming varies the same way: Club regions are named
  // "Mid-Atlantic Regional Championship"; College has "D-I College
  // Regionals", "D-III College Regionals"; Masters/GM use their own
  // qualifier names. We match the level-appropriate phrase plus a
  // generic "Regional" fallback so seed-by-Regionals still works for
  // levels where we don't yet know the exact naming.
  const regionalsNameLike: Record<RankableLevel, string> = {
    CLUB: '%Regional%',
    COLLEGE_D1: '%D-I College Regional%',
    COLLEGE_D3: '%D-III College Regional%',
    MASTERS: '%Masters%Regional%',
    GRAND_MASTERS: '%Grand Masters%Regional%',
  };

  // Decide which season to rank.
  const season =
    opts?.season != null ? opts.season : await resolveRankableSeason(db, compLevel);
  if (season == null) {
    return { season: new Date().getUTCFullYear() - 1, teams: [] };
  }

  // Pull every Nationals + Regionals event for this (season, level).
  const { data: events } = await db
    .from('usau_events')
    .select('id, usau_slug, name')
    .eq('season', season)
    .eq('competition_level', compLevel)
    .or(
      `name.ilike.${championshipNameLike[compLevel]},name.ilike.${regionalsNameLike[compLevel]}`,
    );
  const eventsList = events ?? [];
  // Identify Nationals/Championship events by the level's championship phrase
  // so College's "Championships" doesn't collide with Club's "Nationals".
  const champRegex = new RegExp(
    championshipNameLike[compLevel].replace(/%/g, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    'i',
  );
  const nationalsIds = new Set(
    eventsList.filter((e) => champRegex.test(e.name)).map((e) => e.id),
  );
  const slugById = new Map(eventsList.map((e) => [e.id, e.usau_slug] as const));

  if (eventsList.length === 0) {
    return { season, teams: [] };
  }

  const { data: participations } = await db
    .from('usau_event_teams')
    .select('event_id, team_id, seed, final_placement, usau_teams(id, name, state, competition_level, gender_division)')
    .in('event_id', eventsList.map((e) => e.id));

  type Part = {
    event_id: string;
    team_id: string;
    seed: number | null;
    final_placement: number | null;
    usau_teams: {
      id: string;
      name: string;
      state: string | null;
      competition_level: string | null;
      gender_division: string | null;
    } | null;
  };

  // Aggregate: per team, find best Nationals placement (lowest non-null
  // final_placement at a Nationals event) and best Regionals placement
  // (lowest at a Regional event). Fall back to seed when placement is
  // null — at least it preserves the bracket order we saw.
  const byTeam = new Map<string, {
    team: NonNullable<Part['usau_teams']>;
    natPlacement: number | null;
    natSeed: number | null;
    regPlacement: number | null;
    regSeed: number | null;
  }>();

  for (const row of (participations ?? []) as unknown as Part[]) {
    if (!row.usau_teams) continue;
    const t = row.usau_teams;
    if (opts?.genderDivision && t.gender_division !== opts.genderDivision) continue;

    const isNationals = nationalsIds.has(row.event_id);
    const entry = byTeam.get(t.id) ?? {
      team: t,
      natPlacement: null,
      natSeed: null,
      regPlacement: null,
      regSeed: null,
    };

    if (isNationals) {
      if (row.final_placement != null && (entry.natPlacement == null || row.final_placement < entry.natPlacement)) {
        entry.natPlacement = row.final_placement;
      }
      if (row.seed != null && (entry.natSeed == null || row.seed < entry.natSeed)) {
        entry.natSeed = row.seed;
      }
    } else {
      if (row.final_placement != null && (entry.regPlacement == null || row.final_placement < entry.regPlacement)) {
        entry.regPlacement = row.final_placement;
      }
      if (row.seed != null && (entry.regSeed == null || row.seed < entry.regSeed)) {
        entry.regSeed = row.seed;
      }
    }
    byTeam.set(t.id, entry);
  }

  // Build the ranked list. Three tiers:
  //   1. Made Nationals + has placement → order by placement
  //   2. Made Nationals + no placement (rare; uses seed) → order by seed
  //   3. Didn't make Nationals → order by best Regionals (placement, then seed)
  const ranked = Array.from(byTeam.values())
    .map((e) => {
      const madeNationals = e.natPlacement != null || e.natSeed != null;
      const rankedFromEventId = madeNationals
        ? Array.from(nationalsIds).find((id) =>
            (participations ?? []).some((p) => p.team_id === e.team.id && p.event_id === id),
          )
        : eventsList
            .filter((ev) => !nationalsIds.has(ev.id))
            .find((ev) =>
              (participations ?? []).some(
                (p) => p.team_id === e.team.id && p.event_id === ev.id,
              ),
            )?.id;
      const slug = rankedFromEventId ? slugById.get(rankedFromEventId) ?? null : null;

      return {
        id: e.team.id,
        name: e.team.name,
        state: e.team.state,
        competitionLevel: e.team.competition_level,
        genderDivision: e.team.gender_division,
        nationalsPlacement: e.natPlacement,
        bestRegionalsPlacement: e.regPlacement,
        rankedFromSlug: slug,
        season,
        _tier: madeNationals ? 0 : 1,
        _natSort: e.natPlacement ?? e.natSeed ?? 999,
        _regSort: e.regPlacement ?? e.regSeed ?? 999,
      };
    })
    .sort((a, b) => {
      if (a._tier !== b._tier) return a._tier - b._tier;
      if (a._tier === 0) return a._natSort - b._natSort;
      return a._regSort - b._regSort;
    })
    .map(({ _tier, _natSort, _regSort, ...rest }) => rest);

  return { season, teams: ranked };
}

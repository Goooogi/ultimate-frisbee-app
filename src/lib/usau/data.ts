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

type DB = SupabaseClient<Database>;

let _client: DB | null = null;

async function supabase(): Promise<DB> {
  if (_client) return _client;
  _client = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
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

type CompetitionLevel =
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

  // Pull team counts per event in one query (filtered to the ids we just got).
  const ids = (events ?? []).map((e) => e.id);
  const countByEvent = new Map<string, number>();
  if (ids.length > 0) {
    const { data: parts } = await db
      .from('usau_event_teams')
      .select('event_id')
      .in('event_id', ids);
    for (const r of parts ?? []) {
      countByEvent.set(r.event_id, (countByEvent.get(r.event_id) ?? 0) + 1);
    }
  }

  return (events ?? []).map((e) => ({
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
 * Returns the most relevant club tournament for the "current" view:
 * the soonest-upcoming (or in-progress) event if one exists with games
 * scraped, otherwise the most-recently-completed event. Skips empty
 * placeholder events that have no games + no teams. Returns the slug
 * only; callers can fetch the full event with `getEvent(slug)`.
 */
export async function getCurrentClubEventSlug(): Promise<string | null> {
  const db = await supabase();
  // Fetch a window of recent events (past 6 months + future 6 months) so
  // we can filter out the empty placeholders in JS without a heavy query.
  const today = new Date().toISOString().slice(0, 10);
  const sixMonthsBack = new Date(Date.now() - 180 * 86400_000).toISOString().slice(0, 10);
  const sixMonthsForward = new Date(Date.now() + 180 * 86400_000).toISOString().slice(0, 10);

  const { data: events } = await db
    .from('usau_events')
    .select('id, usau_slug, start_date, end_date')
    .eq('competition_level', 'CLUB')
    .gte('start_date', sixMonthsBack)
    .lte('start_date', sixMonthsForward)
    .order('start_date', { ascending: true });

  if (!events || events.length === 0) {
    // Wider net: latest club event with games.
    const { data: latest } = await db
      .from('usau_events')
      .select('id, usau_slug, start_date')
      .eq('competition_level', 'CLUB')
      .order('start_date', { ascending: false, nullsFirst: false })
      .limit(40);
    for (const e of latest ?? []) {
      const { count } = await db
        .from('usau_games')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', e.id);
      if ((count ?? 0) > 0) return e.usau_slug;
    }
    return null;
  }

  // Filter to events that actually have games (skip empty placeholders).
  const ids = events.map((e) => e.id);
  const { data: gameCounts } = await db
    .from('usau_games')
    .select('event_id')
    .in('event_id', ids);
  const counts = new Map<string, number>();
  for (const g of gameCounts ?? []) {
    counts.set(g.event_id, (counts.get(g.event_id) ?? 0) + 1);
  }
  const withGames = events.filter((e) => (counts.get(e.id) ?? 0) > 0);
  if (withGames.length === 0) {
    // No events in our window have games yet — fall back to most-recent
    // completed tournament across the whole DB.
    const { data: latest } = await db
      .from('usau_events')
      .select('id, usau_slug')
      .eq('competition_level', 'CLUB')
      .lt('start_date', today)
      .order('start_date', { ascending: false, nullsFirst: false })
      .limit(40);
    for (const e of latest ?? []) {
      const { count } = await db
        .from('usau_games')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', e.id);
      if ((count ?? 0) > 0) return e.usau_slug;
    }
    return null;
  }

  // Prefer upcoming/in-progress. Otherwise most-recent completed.
  const upcoming = withGames.find(
    (e) => (e.end_date ?? e.start_date ?? '') >= today,
  );
  if (upcoming) return upcoming.usau_slug;
  return withGames[withGames.length - 1].usau_slug;
}

/**
 * Find a USAU player profile by name (case-insensitive exact match).
 * Returns the player_id of the most-active matching row (most roster
 * entries) so the link goes to a profile with the richest history.
 * Returns null if no match. Used by /players/{ufaSlug} to deep-link to
 * the same human's USAU career when they click the USAU tab.
 */
export async function findUsauPlayerByName(name: string): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const db = await supabase();
  const { data: matches } = await db
    .from('usau_players')
    .select('id, display_name')
    .ilike('display_name', trimmed);
  const candidates = (matches ?? []).filter(
    (m) => m.display_name.toLowerCase() === trimmed.toLowerCase(),
  );
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

/** Distinct seasons we have any event for, newest first. */
export async function listSeasons(): Promise<number[]> {
  const db = await supabase();
  const { data, error } = await db
    .from('usau_events')
    .select('season')
    .order('season', { ascending: false });
  if (error) throw error;
  return Array.from(new Set((data ?? []).map((r) => r.season)));
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

// ─── Search ────────────────────────────────────────────────────────────

export interface SearchResult {
  kind: 'team' | 'player';
  id: string;
  name: string;
  /** Secondary line — team name for a player, state/level for a team. */
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
export async function search(query: string, limit = 8): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const pattern = `%${q.replace(/[%_]/g, '\\$&')}%`;

  // Pull a generous N from each side (3x the display limit) so dedupe
  // doesn't starve us — if "Revolver" returns 4 rows we still want 6
  // distinct teams in the dropdown.
  const overshoot = limit * 3;
  const db = await supabase();
  const [teamRes, playerRes] = await Promise.all([
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

  const results: SearchResult[] = [...teamMap.values(), ...playerMap.values()];

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
    return { id: anchor.id, displayName: anchor.display_name, teamHistory: [] };
  }

  // Pull rosters for ALL candidates so we can compute the cluster.
  const { data: candidateRosters } = await db
    .from('usau_rosters')
    .select('player_id, team_id, season, jersey_number, usau_teams(name)')
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

  return {
    id: anchor.id,
    displayName: anchor.display_name,
    teamHistory,
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
      .select('team_id, seed, pool, final_placement, usau_teams(name)')
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
    const t = (p as { usau_teams: { name: string } | null }).usau_teams;
    return {
      teamId: p.team_id,
      teamName: t?.name ?? 'Unknown',
      seed: p.seed,
      pool: p.pool,
      finalPlacement: p.final_placement,
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
export async function listRankedTeams(opts?: {
  genderDivision?: 'Men' | 'Women' | 'Mixed';
  season?: number;
}): Promise<{ season: number; teams: RankedTeam[] }> {
  const db = await supabase();

  // Find the most recent season with Nationals data (or use the override).
  let season = opts?.season;
  if (season == null) {
    // Pick the newest season we have an event named "...Nationals..." for.
    const { data: seasons } = await db
      .from('usau_events')
      .select('season')
      .ilike('name', '%Nationals%')
      .order('season', { ascending: false })
      .limit(1);
    season = seasons?.[0]?.season;
  }
  if (season == null) {
    return { season: new Date().getUTCFullYear() - 1, teams: [] };
  }

  // Pull every event for that season with name like Nationals, and every
  // event with name like Regional. Build placement maps.
  const { data: events } = await db
    .from('usau_events')
    .select('id, usau_slug, name')
    .eq('season', season)
    .or('name.ilike.%Nationals%,name.ilike.%Regional%');
  const eventsList = events ?? [];
  const nationalsIds = new Set(
    eventsList.filter((e) => /nationals/i.test(e.name)).map((e) => e.id),
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

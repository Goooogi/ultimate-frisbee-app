// sync-ufa: keep the UFA game + per-player-stat tables fresh during live
// weekends, so the fantasy scorer (score-fantasy, pg_cron) has real stats to
// score. Runs on pg_cron on game days, a few minutes BEFORE score-fantasy.
//
// WHY this exists: UFA stats used to be populated ONLY by a manual script
// (scripts/sync-ufa.ts). When nobody ran it, weeks went unscored — every
// fantasy team scored 0 because ufa_game_player_stats was empty for those
// weeks (bit weeks 11–12, 2026). This function is the automation.
//
// SCOPE — recent games only (NOT a full-season backfill). The full 800-player
// fan-out takes minutes and would blow the Edge Function wall-clock (~150s).
// Instead this processes only RECENT games (start within the last `WINDOW_DAYS`)
// that are non-Upcoming, in bounded batches (`MAX_GAMES_PER_RUN`). pg_cron runs
// it hourly on game days, so it catches up across invocations. The manual
// script stays the tool for a full-season (re)baseline.
//
// Per game processed:
//   1. upsert the game row (so score/status/week flip Upcoming→Final)
//   2. roster-reports?gameID=X → the ~50 players on both sides
//   3. roster-game-stats-for-player?playerID=P&year=Y → that player's game log;
//      keep the row matching THIS gameID → one ufa_game_player_stats row
//   4. upsert ufa_players + ufa_game_player_stats
//
// Idempotent: everything upserts on its key; safe to re-run. A blank/malformed
// upstream player id is SKIPPED (never aborts the run — that exact crash is why
// the manual script silently stopped landing stats).
//
// Request body (all optional): { "year": 2026, "windowDays": 14, "maxGames": 12 }
// Auth: verify_jwt off (server-to-server; pg_cron passes the service-role key).

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const UFA_BASE = 'https://www.backend.ufastats.com/web-v1';
const UA = 'Mozilla/5.0 (the-layout fantasy sync)';
const MAX_GAMES_LIMIT = 20; // upstream games page cap
const FETCH_GAP_MS = 150;   // gentle pacing to the UFA backend

// Defaults — tuned so a run stays well under the Edge wall-clock (~150s). The
// real cost is per-PLAYER season-game-log fetches (~50 per game). We therefore
// cap the TOTAL player fetches per run (MAX_PLAYER_FETCHES), not just games, and
// skip Final games that already have their stats (they won't change). A live
// weekend's newly-final / in-progress games are what get processed; the next
// hourly run catches any remainder. ~120 fetches × ~120ms ≈ 15–20s of fetching.
const DEFAULT_WINDOW_DAYS = 14;
const DEFAULT_MAX_GAMES = 12;
const MAX_PLAYER_FETCHES = 120;
// Headshots (watchufa profile-page scrape) are only fetched for players we don't
// already have one for, capped per run so a big first-time sweep never blows the
// wall-clock — subsequent hourly runs finish the rest. Once set, never re-fetched.
const MAX_HEADSHOT_FETCHES = 40;

const WATCHUFA_PLAYER = 'https://www.watchufa.com/league/players';
const HEADSHOT_RE = /src="(https:\/\/[^"]*\/profile-images\/[^"]*_profile\.[A-Za-z]+)"/i;

/** UFA player headshot from the watchufa profile page, or null. Soft-fails so a
 *  missing/blocked page never breaks the sync. */
async function fetchHeadshotUrl(playerID: string): Promise<string | null> {
  try {
    const res = await fetch(`${WATCHUFA_PLAYER}/${encodeURIComponent(playerID)}`, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(HEADSHOT_RE);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function db(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function ufaGet<T>(path: string, attempt = 1): Promise<T> {
  try {
    const res = await fetch(`${UFA_BASE}/${path}`, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}${body ? `: ${body.slice(0, 160)}` : ''}`);
    }
    return (await res.json()) as T;
  } catch (err) {
    if (attempt < 3) {
      await sleep(500 * attempt);
      return ufaGet<T>(path, attempt + 1);
    }
    throw new Error(`UFA ${path} failed after ${attempt} tries: ${(err as Error).message}`);
  }
}

const KNOWN_FINAL = 'Final';
const KNOWN_UPCOMING = 'Upcoming';
function normalizeStatus(raw: string | undefined): string {
  if (!raw) return KNOWN_UPCOMING;
  if (raw === KNOWN_UPCOMING || raw === KNOWN_FINAL) return raw;
  return 'InProgress'; // any non-terminal phase is an in-play game
}

// A per-game/player id we accept as a safe PK. Blank/malformed → caller skips.
function isSafeId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && id.length <= 200 && /^[\w\-./]+$/.test(id);
}

function splitName(full: string): { first: string; last: string } {
  const parts = (full ?? '').trim().split(/\s+/);
  if (parts.length <= 1) return { first: parts[0] ?? '', last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

// ── Wire shapes (subset) ─────────────────────────────────────────────────────
interface ApiGame {
  gameID: string;
  awayTeamID: string;
  homeTeamID: string;
  awayScore: number;
  homeScore: number;
  status: string;
  week?: string;
  startTimestamp?: string;
  locationName?: string;
}
interface ApiRosterPlayer { playerID: string; firstName?: string; lastName?: string }
interface ApiRosterReports { home?: ApiRosterPlayer[]; away?: ApiRosterPlayer[] }
interface ApiPlayerGameRow {
  gameID: string; isHome: boolean;
  goals: number; assists: number; hockeyAssists: number; blocks: number; callahans: number;
  throwaways: number; drops: number; stalls: number; completions: number; throwsAttempted: number;
  catches: number; yardsThrown: number; yardsReceived: number;
  oPointsPlayed: number; oPointsScored: number; dPointsPlayed: number; dPointsScored: number;
  secondsPlayed: number; pulls: number; hucksCompleted: number; hucksAttempted: number;
}

async function fetchGames(year: number): Promise<ApiGame[]> {
  const out: ApiGame[] = [];
  for (let page = 1; page <= 30; page++) {
    const data = await ufaGet<{ games?: ApiGame[] }>(
      `games?years=${year}&limit=${MAX_GAMES_LIMIT}&page=${page}`,
    );
    const rows = data.games ?? [];
    out.push(...rows);
    if (rows.length < MAX_GAMES_LIMIT) break;
    await sleep(FETCH_GAP_MS);
  }
  return out;
}

async function upsert(supabase: SupabaseClient, table: string, rows: Record<string, unknown>[], onConflict: string) {
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + CHUNK), { onConflict });
    if (error) throw new Error(`upsert ${table}: ${error.message}`);
  }
}

function gameRowOf(g: ApiGame, year: number) {
  const status = normalizeStatus(g.status);
  const played = status !== KNOWN_UPCOMING;
  return {
    id: g.gameID,
    year,
    week: g.week ?? null,
    start_timestamp: g.startTimestamp ?? null,
    status,
    home_team_id: g.homeTeamID || null,
    away_team_id: g.awayTeamID || null,
    home_score: played ? g.homeScore : null,
    away_score: played ? g.awayScore : null,
    location_name: g.locationName ?? null,
    updated_at: new Date().toISOString(),
  };
}

async function run(body: { year?: number; windowDays?: number; maxGames?: number }) {
  const supabase = db();
  const now = new Date();
  const year = body.year ?? (now.getUTCMonth() >= 3 ? now.getUTCFullYear() : now.getUTCFullYear() - 1);
  const windowDays = body.windowDays ?? DEFAULT_WINDOW_DAYS;
  const maxGames = body.maxGames ?? DEFAULT_MAX_GAMES;
  const windowStartMs = now.getTime() - windowDays * 86400_000;

  // 1. Season games. Upsert ALL of them (cheap) so schedule/scores/status stay
  //    fresh even for games we don't fan-out stats for this run.
  const games = await fetchGames(year);
  const gameRows = games.filter((g) => isSafeId(g.gameID)).map((g) => gameRowOf(g, year));

  // Make sure every team slug referenced by these games exists (minimal row —
  // the full-season manual sync seeds richer metadata; this is just an FK guard
  // so a brand-new team never breaks the game upsert).
  const teamSlugs = new Set<string>();
  for (const g of games) {
    if (isSafeId(g.homeTeamID)) teamSlugs.add(g.homeTeamID);
    if (isSafeId(g.awayTeamID)) teamSlugs.add(g.awayTeamID);
  }
  if (teamSlugs.size > 0) {
    const { data: existing } = await supabase.from('ufa_teams').select('id').in('id', [...teamSlugs]);
    const have = new Set((existing ?? []).map((r) => (r as { id: string }).id));
    const missing = [...teamSlugs].filter((s) => !have.has(s)).map((slug) => ({
      id: slug,
      name: slug,
      abbr: slug.slice(0, 3).toUpperCase(),
      updated_at: new Date().toISOString(),
    }));
    if (missing.length > 0) await upsert(supabase, 'ufa_teams', missing, 'id');
  }
  if (gameRows.length > 0) await upsert(supabase, 'ufa_games', gameRows, 'id');

  // 2. Recent, non-Upcoming games in the window — candidates for stat sync.
  const candidates = games
    .filter((g) => isSafeId(g.gameID) && normalizeStatus(g.status) !== KNOWN_UPCOMING)
    .filter((g) => {
      const t = g.startTimestamp ? new Date(g.startTimestamp).getTime() : NaN;
      return !Number.isNaN(t) && t >= windowStartMs;
    })
    .sort((a, b) => (b.startTimestamp ?? '').localeCompare(a.startTimestamp ?? ''));

  // Skip Final games that ALREADY have stats — they won't change, so there's no
  // reason to re-fan-out ~50 player logs for them. In-progress games are always
  // (re)processed (scores/stats still moving). This is what keeps steady-state
  // runs cheap: once a weekend's games are scored, nothing re-fetches.
  const candidateIds = candidates.map((g) => g.gameID);
  const haveStats = new Set<string>();
  if (candidateIds.length > 0) {
    const { data: withStats } = await supabase
      .from('ufa_game_player_stats')
      .select('game_id')
      .in('game_id', candidateIds);
    for (const r of withStats ?? []) haveStats.add((r as { game_id: string }).game_id);
  }
  const recent = candidates
    .filter((g) => normalizeStatus(g.status) === 'InProgress' || !haveStats.has(g.gameID))
    .slice(0, maxGames);

  // Players that already have a headshot → never re-scrape. One paged sweep of
  // the (small) set of non-null headshots; cheap vs. re-hitting watchufa.
  const existingHeadshots = new Set<string>();
  {
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data } = await supabase
        .from('ufa_players')
        .select('id')
        .not('headshot_url', 'is', null)
        .range(from, from + PAGE - 1);
      const rows = data ?? [];
      for (const r of rows) existingHeadshots.add((r as { id: string }).id);
      if (rows.length < PAGE) break;
    }
  }

  const gameById = new Map(games.map((g) => [g.gameID, g]));
  let statRowCount = 0;
  let skippedPlayers = 0;
  let playerFetches = 0;      // total upstream game-log fetches this run
  let headshotFetches = 0;    // watchufa profile-page scrapes this run
  let fetchBudgetHit = false; // true once we stop starting new games mid-cap
  const playersSeen = new Set<string>();
  const playerRows: Record<string, unknown>[] = [];
  const statRows: Record<string, unknown>[] = [];

  for (const g of recent) {
    // Stop starting new games once the fetch budget is (nearly) spent — a game
    // needs a full roster's worth of fetches to be useful, so don't begin one we
    // can't finish. The next hourly run resumes with the leftover games.
    if (playerFetches >= MAX_PLAYER_FETCHES) { fetchBudgetHit = true; break; }
    let roster: ApiRosterReports;
    try {
      roster = await ufaGet<ApiRosterReports>(`roster-reports?gameID=${encodeURIComponent(g.gameID)}`);
    } catch (err) {
      console.warn(`[sync-ufa] roster failed for ${g.gameID}: ${(err as Error).message}`);
      continue;
    }
    const rosterPlayers = [...(roster.home ?? []), ...(roster.away ?? [])];

    for (const rp of rosterPlayers) {
      if (!isSafeId(rp.playerID)) { skippedPlayers++; continue; }
      // Fetch this player's season game log ONCE per run (a player can appear in
      // several of this run's recent games — the log already contains all of
      // them, so we cache and reuse it).
      let log: ApiPlayerGameRow[] = playerLogCache.get(rp.playerID) ?? [];
      if (!playerLogCache.has(rp.playerID)) {
        try {
          const data = await ufaGet<{ stats?: ApiPlayerGameRow[] }>(
            `roster-game-stats-for-player?playerID=${encodeURIComponent(rp.playerID)}&year=${year}`,
          );
          log = data.stats ?? [];
        } catch (err) {
          console.warn(`[sync-ufa] game log failed for ${rp.playerID}: ${(err as Error).message}`);
          log = [];
        }
        playerLogCache.set(rp.playerID, log);
        playerFetches++;
        await sleep(FETCH_GAP_MS);
      }

      // player row (infer team from any logged game side)
      if (!playersSeen.has(rp.playerID)) {
        playersSeen.add(rp.playerID);
        let teamId: string | null = null;
        for (const r of log) {
          const lg = gameById.get(r.gameID);
          if (lg) { teamId = r.isHome ? lg.homeTeamID : lg.awayTeamID; if (teamId) break; }
        }
        const full = `${rp.firstName ?? ''} ${rp.lastName ?? ''}`.trim();
        const { first, last } = splitName(full);

        // Headshot: only scrape (watchufa profile page) when we DON'T already
        // have one for this player and we're under the per-run headshot budget.
        // Headshots almost never change, so once set we skip forever. Keeping
        // the field OUT of the upsert row when we don't scrape avoids clobbering
        // an existing headshot_url with null.
        const row: Record<string, unknown> = {
          id: rp.playerID,
          first_name: rp.firstName ?? first,
          last_name: rp.lastName ?? last,
          full_name: full || rp.playerID,
          current_team_id: teamId,
          updated_at: new Date().toISOString(),
        };
        if (headshotFetches < MAX_HEADSHOT_FETCHES && !existingHeadshots.has(rp.playerID)) {
          const url = await fetchHeadshotUrl(rp.playerID);
          headshotFetches++;
          if (url) row.headshot_url = url;
        }
        playerRows.push(row);
      }

      // the stat line for THIS game
      const row = log.find((r) => r.gameID === g.gameID);
      if (!row) continue;
      const sideTeam = row.isHome ? g.homeTeamID : g.awayTeamID;
      statRows.push({
        game_id: g.gameID,
        player_id: rp.playerID,
        team_id: sideTeam || null,
        is_home: row.isHome,
        goals: row.goals ?? 0,
        assists: row.assists ?? 0,
        hockey_assists: row.hockeyAssists ?? 0,
        blocks: row.blocks ?? 0,
        callahans: row.callahans ?? 0,
        throwaways: row.throwaways ?? 0,
        drops: row.drops ?? 0,
        stalls: row.stalls ?? 0,
        completions: row.completions ?? 0,
        throws_attempted: row.throwsAttempted ?? 0,
        catches: row.catches ?? 0,
        yards_thrown: row.yardsThrown ?? 0,
        yards_received: row.yardsReceived ?? 0,
        o_points_played: row.oPointsPlayed ?? 0,
        o_points_scored: row.oPointsScored ?? 0,
        d_points_played: row.dPointsPlayed ?? 0,
        d_points_scored: row.dPointsScored ?? 0,
        seconds_played: row.secondsPlayed ?? 0,
        pulls: row.pulls ?? 0,
        hucks_completed: row.hucksCompleted ?? 0,
        hucks_attempted: row.hucksAttempted ?? 0,
        updated_at: new Date().toISOString(),
      });
      statRowCount++;
    }
  }

  // FK order: players first, then their stat lines.
  if (playerRows.length > 0) await upsert(supabase, 'ufa_players', playerRows, 'id');
  if (statRows.length > 0) await upsert(supabase, 'ufa_game_player_stats', statRows, 'game_id,player_id');

  return {
    year,
    gamesUpserted: gameRows.length,
    recentGamesProcessed: recent.length,
    playerFetches,
    headshotFetches,
    fetchBudgetHit,
    playersUpserted: playerRows.length,
    statRowsUpserted: statRowCount,
    skippedPlayers,
  };
}

// Per-invocation cache: a player logged in >1 recent game shouldn't be fetched
// twice in the same run. Declared at module scope but only ever read/written
// within a single run() (Edge invocations are one-shot).
const playerLogCache = new Map<string, ApiPlayerGameRow[]>();

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), {
      status: 405, headers: { 'Content-Type': 'application/json' },
    });
  }
  playerLogCache.clear();
  let body: { year?: number; windowDays?: number; maxGames?: number } = {};
  try { body = await req.json(); } catch { /* empty ok */ }
  try {
    const result = await run(body);
    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[sync-ufa] failed:', err);
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});

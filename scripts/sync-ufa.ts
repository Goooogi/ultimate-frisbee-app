/**
 * UFA Sync — Fantasy data foundation (Phase 1)
 * ─────────────────────────────────────────────────────────────────────────────
 * Mirrors the live UFA season (backend.ufastats.com) into our normalized
 * Supabase tables so the Fantasy scoring engine reads from our DB, not a
 * fragile per-request fan-out to the external API.
 *
 * WRITES (in FK order):
 *   ufa_teams              — one row per franchise seen this season
 *   ufa_games              — one row per game (schedule + score + week + status)
 *   ufa_players            — one row per player (stable slug id, name, team)
 *   ufa_game_player_stats  — one row per (game, player) stat line
 *
 * DATA SOURCE (verified — see src/lib/ufa/client.ts):
 *   /web-v1/games?years=Y&limit=20&page=N            → schedule + scores + week
 *   /web-v1/player-stats?year=Y&limit=30&page=N      → enumerate players (id + name)
 *   /web-v1/roster-game-stats-for-player?playerID=X&year=Y → per-game stat lines
 *
 * IDEMPOTENT: every table is upserted on its primary/unique key, so a game that
 *   flips Upcoming→Final, or a stat line that gets corrected, reconciles cleanly
 *   on the next run. Safe to re-run anytime.
 *
 * USAGE (from repo root):
 *   npx tsx scripts/sync-ufa.ts            # current season
 *   npx tsx scripts/sync-ufa.ts 2025       # a specific year
 *   npx tsx scripts/sync-ufa.ts 2022 2023 2024 2025 2026   # backfill multiple
 *
 * REQUIRED ENV (.env / .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SECRET_KEY   (service role — bypasses RLS for writes)
 *
 * Designed to also run as the body of a weekly scheduled job (Supabase Edge
 * Function / Vercel Cron) — the fetch + upsert logic is reused; only the env
 * loading below is Node-script-specific.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// ─── dotenv loader (Node-only; mirrors backfill-pul-games.ts) ────────────────
function loadDotEnv(file: string): void {
  const fullPath = resolve(process.cwd(), file);
  if (!existsSync(fullPath)) return;
  for (const line of readFileSync(fullPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}
loadDotEnv('.env.local');
loadDotEnv('.env');

import { createClient } from '@supabase/supabase-js';
// Team metadata (city/name/division/logo per slug) — reuse the curated map.
import { TEAM_META, teamMetaByAbbr } from '../src/lib/ufa/teams';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing env. Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env / .env.local');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// ─── UFA API fetchers (self-contained — no next/server-only) ─────────────────
const UFA_BASE = 'https://www.backend.ufastats.com/web-v1';
const UA = 'Mozilla/5.0 (the-layout fantasy sync)';
const MAX_LIMIT = 30; // player-stats cap
const MAX_GAMES_LIMIT = 20; // games cap

/** Gentle pacing between upstream calls so we don't hammer the UFA backend. */
const FETCH_GAP_MS = 150;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

// Wire shapes (subset of src/lib/ufa/types.ts — only what we persist).
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
interface ApiPlayerStat {
  playerID: string;
  name: string;
  [k: string]: unknown;
}
interface ApiPlayerGameRow {
  gameID: string;
  isHome: boolean;
  goals: number;
  assists: number;
  hockeyAssists: number;
  blocks: number;
  callahans: number;
  throwaways: number;
  drops: number;
  stalls: number;
  completions: number;
  throwsAttempted: number;
  catches: number;
  yardsThrown: number;
  yardsReceived: number;
  oPointsPlayed: number;
  oPointsScored: number;
  dPointsPlayed: number;
  dPointsScored: number;
  secondsPlayed: number;
  pulls: number;
  hucksCompleted: number;
  hucksAttempted: number;
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

async function fetchPlayers(year: number): Promise<ApiPlayerStat[]> {
  const out: ApiPlayerStat[] = [];
  let total = Infinity;
  for (let page = 1; page <= 60; page++) {
    const data = await ufaGet<{ stats?: ApiPlayerStat[]; total: number }>(
      `player-stats?year=${year}&limit=${MAX_LIMIT}&page=${page}`,
    );
    const rows = data.stats ?? [];
    out.push(...rows);
    total = data.total ?? total;
    if (rows.length < MAX_LIMIT || out.length >= total) break;
    await sleep(FETCH_GAP_MS);
  }
  return out;
}

async function fetchPlayerGameLog(playerID: string, year: number): Promise<ApiPlayerGameRow[]> {
  const data = await ufaGet<{ stats?: ApiPlayerGameRow[] }>(
    `roster-game-stats-for-player?playerID=${encodeURIComponent(playerID)}&year=${year}`,
  );
  return data.stats ?? [];
}

// ─── Headshots ───────────────────────────────────────────────────────────────
// UFA is the only league that publishes player headshots — on the watchufa.com
// profile page as <img src=".../profile-images/{playerID}_profile.{ext}"> (ext
// varies png/jpg/jpeg/JPG). We SELF-HOST them: download the original and upload
// a copy to the ufa-headshots Storage bucket, storing OUR public URL (the app
// serves it through the image transform). Self-hosting fixes the watchufa
// hotlink problems: multi-MB originals, slow/flaky third-party CDN, dead URLs.
// ~90% of players have one; the rest return null (UI falls back to a monogram).
const WATCHUFA_PLAYER = 'https://www.watchufa.com/league/players';
const HEADSHOT_RE = /src="(https:\/\/[^"]*\/profile-images\/[^"]*_profile\.[A-Za-z]+)"/i;
const HEADSHOT_BUCKET = 'ufa-headshots';
const HEADSHOT_MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
};

/** Scrape → download → upload to the bucket → return OUR public object URL.
 *  Soft-fails to null at every step so a missing headshot never breaks the sync. */
async function fetchHeadshotUrl(playerID: string): Promise<string | null> {
  let srcUrl: string | null = null;
  try {
    const res = await fetch(`${WATCHUFA_PLAYER}/${encodeURIComponent(playerID)}`, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
    });
    if (!res.ok) return null;
    const m = (await res.text()).match(HEADSHOT_RE);
    srcUrl = m ? m[1] : null;
  } catch {
    return null;
  }
  if (!srcUrl) return null;

  let bytes: Uint8Array;
  try {
    const res = await fetch(srcUrl, { headers: { 'User-Agent': UA } });
    if (!res.ok) return null;
    bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length === 0) return null;
  } catch {
    return null;
  }

  let ext = (srcUrl.split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (ext === 'jpeg') ext = 'jpg';
  const objectPath = `${playerID}.${ext}`;
  const { error } = await db.storage.from(HEADSHOT_BUCKET).upload(objectPath, bytes, {
    contentType: HEADSHOT_MIME[ext] ?? 'image/jpeg',
    upsert: true,
    cacheControl: '31536000',
  });
  if (error) return null;
  return db.storage.from(HEADSHOT_BUCKET).getPublicUrl(objectPath).data.publicUrl;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Fail loud if an API-supplied string PK looks malformed — so a change in the
 *  upstream data shape aborts the run instead of writing garbage to the DB.
 *  Permissive enough for slugs and date-embedded gameIDs. */
function assertSafeId(id: unknown, context: string): asserts id is string {
  if (typeof id !== 'string' || id.length === 0 || id.length > 200 || !/^[\w\-./]+$/.test(id)) {
    throw new Error(`Unexpected ${context} id format: ${JSON.stringify(id)}`);
  }
}

/** Only statuses we understand pass through; anything else is stored as
 *  'Unknown' so downstream scoring never branches on a surprise value.
 *  UFA live phases (e.g. "Second Quarter", "Halftime") all map to InProgress. */
const KNOWN_FINAL = 'Final';
const KNOWN_UPCOMING = 'Upcoming';
function normalizeStatus(raw: string | undefined): string {
  if (!raw) return KNOWN_UPCOMING;
  if (raw === KNOWN_UPCOMING || raw === KNOWN_FINAL) return raw;
  // Any non-terminal phase string the feed sends is an in-play game.
  return 'InProgress';
}

function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

/** chunked upsert so we never exceed PostgREST limits on a single statement. */
async function upsert(table: string, rows: Record<string, unknown>[], onConflict: string) {
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await db.from(table).upsert(slice, { onConflict });
    if (error) throw new Error(`upsert ${table} [${i}..${i + slice.length}]: ${error.message}`);
  }
}

// ─── Sync one season ─────────────────────────────────────────────────────────
async function syncYear(year: number) {
  console.log(`\n━━━ Syncing UFA ${year} ━━━`);

  // 1) Games (also surfaces which team slugs appear this season).
  const games = await fetchGames(year);
  console.log(`  games: ${games.length}`);

  const teamSlugs = new Set<string>();
  for (const g of games) {
    assertSafeId(g.gameID, 'game');
    if (g.awayTeamID) {
      assertSafeId(g.awayTeamID, 'team');
      teamSlugs.add(g.awayTeamID);
    }
    if (g.homeTeamID) {
      assertSafeId(g.homeTeamID, 'team');
      teamSlugs.add(g.homeTeamID);
    }
  }

  // 2) Teams — upsert FIRST so game FKs resolve.
  const teamRows = [...teamSlugs].map((slug) => {
    const m = TEAM_META[slug];
    return {
      id: slug,
      name: m?.name ?? slug,
      city: m?.city ?? null,
      full_name: m ? `${m.city ?? ''} ${m.name ?? ''}`.trim() : slug,
      abbr: m?.abbr ?? slug.slice(0, 3).toUpperCase(),
      division: m?.division ?? null,
      logo_url: m?.logo ?? null,
      updated_at: new Date().toISOString(),
    };
  });
  await upsert('ufa_teams', teamRows, 'id');
  console.log(`  teams: ${teamRows.length}`);

  // 3) Players — enumerate via the season leaderboard, map current team by their
  //    most-recent season row's abbrev (cheap: the leaderboard "name" + the
  //    game logs we fetch next already tell us the team per game).
  const players = await fetchPlayers(year);
  console.log(`  players: ${players.length}`);

  // Players who ALREADY have a self-hosted headshot → skip the download+upload.
  // (The dedicated backfill script migrates existing watchufa URLs; here we only
  // self-host players with no headshot yet, so a full re-sync stays cheap.)
  const alreadyHosted = new Set<string>();
  {
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data } = await db
        .from('ufa_players')
        .select('id')
        .like('headshot_url', `%/${HEADSHOT_BUCKET}/%`)
        .range(from, from + PAGE - 1);
      const rows = data ?? [];
      for (const r of rows) alreadyHosted.add((r as { id: string }).id);
      if (rows.length < PAGE) break;
    }
  }

  // 4) Per-player game logs → stat rows. We also learn each player's team for
  //    this season from the game row's home/away side + the game's team slugs.
  const gameById = new Map(games.map((g) => [g.gameID, g]));
  const playerRows: Record<string, unknown>[] = [];
  const statRows: Record<string, unknown>[] = [];
  let withStats = 0;

  let skippedPlayers = 0;
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    // A single malformed/empty playerID from the upstream feed must NOT abort
    // the whole season sync (it did — the UFA API started returning a blank
    // player id mid-2026, which threw here BEFORE any games/stats were upserted,
    // so weeks 11+ never landed). Skip the bad row and keep going; the games +
    // every other player's stats still sync.
    if (
      typeof p.playerID !== 'string' ||
      p.playerID.length === 0 ||
      p.playerID.length > 200 ||
      !/^[\w\-./]+$/.test(p.playerID)
    ) {
      skippedPlayers++;
      console.warn(`    ! skipping player with bad id: ${JSON.stringify(p.playerID)} (name: ${JSON.stringify(p.name)})`);
      continue;
    }
    const { first, last } = splitName(p.name);

    let log: ApiPlayerGameRow[] = [];
    try {
      log = await fetchPlayerGameLog(p.playerID, year);
    } catch (err) {
      console.warn(`    ! game log failed for ${p.playerID}: ${(err as Error).message}`);
    }

    // Infer this player's primary team from their game logs (the team on the
    // side they played). Falls back to null if no games logged.
    let teamId: string | null = null;
    for (const row of log) {
      const g = gameById.get(row.gameID);
      if (!g) continue;
      const side = row.isHome ? g.homeTeamID : g.awayTeamID;
      if (side) {
        teamId = side;
        break;
      }
    }

    // Self-host the headshot ONLY for players we don't already have one for.
    // Never write headshot_url when we didn't (re)fetch — otherwise a null would
    // clobber an existing self-hosted URL for a player who has no page this run.
    const row: Record<string, unknown> = {
      id: p.playerID,
      first_name: first,
      last_name: last,
      full_name: p.name,
      current_team_id: teamId,
      updated_at: new Date().toISOString(),
    };
    if (!alreadyHosted.has(p.playerID)) {
      const headshotUrl = await fetchHeadshotUrl(p.playerID);
      if (headshotUrl) row.headshot_url = headshotUrl;
    }
    playerRows.push(row);

    for (const row of log) {
      const g = gameById.get(row.gameID);
      if (!g) continue; // stat line for a game we didn't load (different year edge) — skip
      const sideTeam = row.isHome ? g.homeTeamID : g.awayTeamID;
      statRows.push({
        game_id: row.gameID,
        player_id: p.playerID,
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
    }
    if (log.length) withStats++;

    if ((i + 1) % 25 === 0) console.log(`    …player ${i + 1}/${players.length}`);
    await sleep(FETCH_GAP_MS);
  }

  // 5) Games — upsert AFTER teams (FKs), before stats (FKs).
  const gameRows = games.map((g) => {
    const status = normalizeStatus(g.status);
    const played = status !== KNOWN_UPCOMING; // Final or InProgress carry a score
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
  });
  await upsert('ufa_games', gameRows, 'id');

  // 6) Players, then stats (stats FK both games & players).
  await upsert('ufa_players', playerRows, 'id');
  await upsert('ufa_game_player_stats', statRows, 'game_id,player_id');

  console.log(
    `  ✓ ${year}: ${teamRows.length} teams, ${gameRows.length} games, ` +
      `${playerRows.length} players (${withStats} w/ stats), ${statRows.length} stat rows` +
      (skippedPlayers > 0 ? `, ${skippedPlayers} players skipped (bad id)` : ''),
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const argYears = process.argv.slice(2).map(Number).filter((n) => Number.isInteger(n) && n > 2010);
  const years = argYears.length ? argYears : [new Date().getFullYear()];
  console.log(`UFA sync → years: ${years.join(', ')}`);
  // referenced so teamMetaByAbbr import isn't flagged unused; abbr-aliasing may be
  // needed if a future endpoint returns abbrevs instead of slugs.
  void teamMetaByAbbr;
  for (const y of years) {
    await syncYear(y);
  }
  console.log('\nDone.');
}

main().catch((err) => {
  console.error('\nFATAL:', err);
  process.exit(1);
});

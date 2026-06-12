/**
 * PUL Games Backfill — Phase 1 (history load)
 * ─────────────────────────────────────────────────────────────────────────────
 * Loads ALL PUL game history (schedule + scores + per-game box scores) into
 * pul_games and pul_game_player_stats.
 *
 * DATA SOURCE (verified 2026-06-10):
 *   https://pul-stats-hub.pages.dev/schedule         — index of every game URL
 *   https://pul-stats-hub.pages.dev/games/{...}       — one page per game
 *   (same Astro static site the player backfill uses; see backfill-pul.ts)
 *   Parse logic: scripts/lib/pul-games-scrape.ts
 *
 * WHAT IT CAPTURES, per game:
 *   - matchup (season, week, home/away team), date, location
 *   - final score (from the game-page header; null for unplayed games)
 *   - status: 'final' | 'scheduled'
 *   - per-player box score (2023+; 2022 games have a score but no box score)
 *
 * IDEMPOTENT: pul_games is upserted by id ('{season}/{week}/{AWAY}-vs-{HOME}').
 *   Box-score rows are delete-then-insert per game, so re-runs reconcile cleanly
 *   (e.g. a game that flips scheduled→final on a later run gets its score +
 *   box score filled in). Safe to re-run anytime.
 *
 * USAGE (from repo root):
 *   npx tsx scripts/backfill-pul-games.ts
 *
 * REQUIRED ENV (.env.local / .env):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SECRET_KEY   (service role — bypasses RLS for writes)
 *
 * NOT a cron — manual invocation only. Phase 2 (scheduled scraper) is designed
 * separately and reuses scripts/lib/pul-games-scrape.ts.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// ─── dotenv loader (Node-only; mirrors backfill-pul.ts) ──────────────────────

function loadDotEnv(file: string): void {
  const fullPath = resolve(process.cwd(), file);
  if (!existsSync(fullPath)) return;
  const content = readFileSync(fullPath, 'utf-8');
  for (const line of content.split('\n')) {
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
import {
  parseSchedule,
  parseGamePage,
  type ScheduledGame,
} from './lib/pul-games-scrape.js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing env. Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env / .env.local');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
  realtime: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transport: class NoopWS { constructor() { return; } } as any,
  },
});

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE = 'https://pul-stats-hub.pages.dev';
const UA = 'Mozilla/5.0 (the-layout/pul-games-backfill-v1)';
const FETCH_DELAY_MS = 350; // polite delay between game-page fetches

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

async function fetchHtml(path: string): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}${path}`, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
    if (!res.ok) {
      console.error(`  HTTP ${res.status} for ${path}`);
      return null;
    }
    return await res.text();
  } catch (err) {
    console.error(`  Network error for ${path}:`, err);
    return null;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== PUL Games Backfill v1 — schedule + scores + box scores ===\n');

  // ── Step 1: schedule index ────────────────────────────────────────────────
  console.log('Fetching /schedule ...');
  const schedHtml = await fetchHtml('/schedule');
  if (!schedHtml) {
    console.error('Could not fetch /schedule. Aborting.');
    process.exit(1);
  }
  const { games, warnings: schedWarnings } = parseSchedule(schedHtml);
  console.log(`  ${games.length} games found.`);
  for (const w of schedWarnings) console.warn(`  WARN: ${w}`);
  if (games.length === 0) {
    console.error('Schedule parse produced 0 games — aborting (page structure may have changed).');
    process.exit(1);
  }

  const bySeason: Record<number, number> = {};
  for (const g of games) bySeason[g.season] = (bySeason[g.season] ?? 0) + 1;
  console.log('  by season:', bySeason, '\n');

  // ── Step 2: each game page ────────────────────────────────────────────────
  console.log('Fetching game pages...\n');

  interface GameResult {
    game: ScheduledGame;
    status: 'final' | 'scheduled';
    score: string;
    statRows: number;
    failed: boolean;
  }
  const results: GameResult[] = [];
  let totalStatRows = 0;
  let finalCount = 0;
  let scheduledCount = 0;

  for (let i = 0; i < games.length; i++) {
    const g = games[i];
    if (i > 0) await sleep(FETCH_DELAY_MS);
    process.stdout.write(`  [${i + 1}/${games.length}] ${g.id} ... `);

    const gameHtml = await fetchHtml(`/games/${g.id}`);
    if (!gameHtml) {
      console.log('FETCH FAILED');
      results.push({ game: g, status: 'scheduled', score: '—', statRows: 0, failed: true });
      continue;
    }
    const parsed = parseGamePage(gameHtml);
    for (const w of parsed.warnings) console.warn(`\n    WARN [${g.id}]: ${w}`);

    // ── Upsert the game row ──────────────────────────────────────────────────
    const now = new Date().toISOString();
    const { error: gameErr } = await db.from('pul_games').upsert(
      {
        id: g.id,
        season: g.season,
        week_label: g.weekLabel,
        week_num: g.weekNum,
        away_team_id: g.awayTeamId,
        home_team_id: g.homeTeamId,
        away_abbrev: g.awayAbbrev,
        home_abbrev: g.homeAbbrev,
        game_date: parsed.gameDate,
        game_time: null, // not reliably present on the page; reserved
        location: parsed.location,
        away_score: parsed.awayScore,
        home_score: parsed.homeScore,
        status: parsed.status,
        updated_at: now,
      },
      { onConflict: 'id' },
    );
    if (gameErr) {
      console.log(`GAME UPSERT ERROR — ${gameErr.message}`);
      results.push({ game: g, status: parsed.status, score: '—', statRows: 0, failed: true });
      continue;
    }

    // ── Replace box-score rows for this game (delete-then-insert) ─────────────
    const { error: delErr } = await db.from('pul_game_player_stats').delete().eq('game_id', g.id);
    if (delErr) {
      console.log(`STATS DELETE ERROR — ${delErr.message}`);
      results.push({ game: g, status: parsed.status, score: '—', statRows: 0, failed: true });
      continue;
    }

    let statRows = 0;
    if (parsed.playerStats.length > 0) {
      const rows = parsed.playerStats.map((p) => ({
        game_id: g.id,
        team_id: p.teamId,
        player_name: p.playerName,
        jersey_number: p.jerseyNumber,
        goals: p.goals,
        assists: p.assists,
        blocks: p.blocks,
        turnovers: p.turnovers,
        touches: p.touches,
        o_points: p.oPoints,
        d_points: p.dPoints,
        plus_minus: p.plusMinus,
        updated_at: now,
      }));
      const { error: insErr } = await db.from('pul_game_player_stats').insert(rows);
      if (insErr) {
        console.log(`STATS INSERT ERROR — ${insErr.message}`);
        results.push({ game: g, status: parsed.status, score: '—', statRows: 0, failed: true });
        continue;
      }
      statRows = rows.length;
    }

    totalStatRows += statRows;
    if (parsed.status === 'final') finalCount++;
    else scheduledCount++;

    const scoreStr =
      parsed.awayScore !== null && parsed.homeScore !== null
        ? `${parsed.awayScore}-${parsed.homeScore}`
        : parsed.status === 'scheduled'
          ? 'upcoming'
          : '?';
    console.log(`${parsed.status.padEnd(9)} ${scoreStr.padEnd(8)} box=${statRows}`);
    results.push({ game: g, status: parsed.status, score: scoreStr, statRows, failed: false });
  }

  // ── Step 3: summary ────────────────────────────────────────────────────────
  console.log('\n=== SUMMARY ===');
  const failed = results.filter((r) => r.failed);
  console.log(`  games processed:  ${results.length}`);
  console.log(`  final:            ${finalCount}`);
  console.log(`  scheduled:        ${scheduledCount}`);
  console.log(`  box-score rows:   ${totalStatRows}`);
  console.log(`  failures:         ${failed.length}`);
  if (failed.length) {
    console.warn('  FAILED games:');
    for (const r of failed) console.warn(`    ${r.game.id}`);
    console.warn('  Re-run the script to retry (idempotent).');
  }

  // ── Step 4: DB verification ────────────────────────────────────────────────
  console.log('\n=== DB VERIFICATION ===');
  const { count: gameCount } = await db.from('pul_games').select('*', { count: 'exact', head: true });
  console.log(`  pul_games total: ${gameCount}`);
  for (const season of [2022, 2023, 2024, 2025, 2026]) {
    const { count } = await db.from('pul_games').select('*', { count: 'exact', head: true }).eq('season', season);
    const { count: finals } = await db
      .from('pul_games')
      .select('*', { count: 'exact', head: true })
      .eq('season', season)
      .eq('status', 'final');
    console.log(`    ${season}: ${count} games (${finals} final)`);
  }
  const { count: statCount } = await db.from('pul_game_player_stats').select('*', { count: 'exact', head: true });
  console.log(`  pul_game_player_stats total: ${statCount}`);

  // Spot-check: IND @ MIN 2024 wk10 should be 15-20 with 40 box rows.
  const { data: spot } = await db
    .from('pul_games')
    .select('id, away_abbrev, home_abbrev, away_score, home_score, status, game_date, location')
    .eq('id', '2024/week-10/IND-vs-MIN')
    .maybeSingle();
  console.log('\n  Spot-check 2024/week-10/IND-vs-MIN:');
  console.log('   ', spot ? JSON.stringify(spot) : 'NOT FOUND');
  if (spot) {
    const { count: boxRows } = await db
      .from('pul_game_player_stats')
      .select('*', { count: 'exact', head: true })
      .eq('game_id', spot.id);
    console.log(`    box rows: ${boxRows} (expected 40), score ${spot.away_score}-${spot.home_score} (expected 15-20)`);
  }

  console.log('\nPUL Games Backfill v1 complete.');
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});

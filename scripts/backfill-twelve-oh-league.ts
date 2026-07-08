/**
 * 12-0 league backfill — PUL / WUL
 * ─────────────────────────────────────────────────────────────────────────────
 * Populates twelve_oh_players (league='pul'|'wul') and twelve_oh_league_baselines
 * from the season-total tables the league pipelines already maintain
 * (pul_players / wul_players). No external fetches — DB → DB.
 *
 * IDEMPOTENT: deletes the league's rows and re-inserts (same reconcile
 * strategy as backfill-pul-games.ts). Safe to re-run after each ingest.
 *
 * USAGE (run from repo root):
 *   npx tsx scripts/backfill-twelve-oh-league.ts pul
 *   npx tsx scripts/backfill-twelve-oh-league.ts wul
 *
 * REQUIRED ENV VARS (.env / .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY
 *
 * After each run: paste the printed BAKED baseline block into
 * src/lib/twelve-oh/leagues.ts (same convention as the UFA backfill).
 *
 * DATA QUIRKS HANDLED HERE (see leagues.ts header for the full story):
 *   - PUL 2023 touches are undertracked (~1.5/game vs ~11/game 2024+) →
 *     zeroed before scoring; the touches dim is zero-gated so those seasons
 *     score neutral on that dimension. The stored row also carries NULL
 *     touches, so the pick screen shows "—" instead of a misleading number.
 *   - PUL 2023 o_points/d_points are all 0 (not tracked) → pointsPlayed
 *     zero-gated the same way.
 *   - WUL plus_minus can be fractional (.5). Scores use the exact value;
 *     the stored display column is integer, so it's rounded there.
 *   - Baselines for zero-gated dims are computed over >0 values only.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

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
  PUL_DIMS,
  WUL_DIMS,
  LEAGUE_TARGET_SCORES,
  computeLeagueRawScore,
  type LeagueBaseline,
  type LeagueDim,
} from '../src/lib/twelve-oh/leagues.js';
import { pwlNormalize } from '../src/lib/twelve-oh/rating.js';
import { ABBREV_TO_TEAM_ID } from './lib/pul-games-scrape.js';
import { WUL_TEAMS } from '../src/lib/wul/teams.js';

// ─── Config ──────────────────────────────────────────────────────────────────

const MIN_GAMES_PLAYED = 3;
const BACKFILL_VERSION = 1;

/** PUL touches are only reliably tracked from this season onward. */
const PUL_TOUCHES_MIN_SEASON = 2024;

const league = process.argv[2];
if (league !== 'pul' && league !== 'wul') {
  console.error('Usage: npx tsx scripts/backfill-twelve-oh-league.ts <pul|wul>');
  process.exit(1);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    'Missing env vars. Need NEXT_PUBLIC_SUPABASE_URL and ' +
    'SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) in .env / .env.local',
  );
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// PUL team_id → abbr (invert the scrape lib's map).
const PUL_TEAM_ABBR: Record<string, string> = Object.fromEntries(
  Object.entries(ABBREV_TO_TEAM_ID).map(([abbr, id]) => [id, abbr]),
);

// ─── Source row shapes ───────────────────────────────────────────────────────

interface SourceRow {
  id: string;
  player_name: string;
  team_id: string;
  season: number;
  games_played: number;
  goals: number;
  assists: number;
  blocks: number;
  turnovers: number;
  touches: number;
  o_points: number;
  d_points: number;
  plus_minus: number | string;
  // WUL only
  callahans?: number;
  hucks_completed?: number;
  yards_total?: number;
}

/** One qualifying player-season, stats keyed by the league's dim keys. */
interface Candidate {
  row: SourceRow;
  stats: Record<string, number>;
}

// ─── Fetch (paginated — supabase-js caps a select at 1000 rows) ─────────────

async function fetchAllRows(table: string): Promise<SourceRow[]> {
  const PAGE = 1000;
  const rows: SourceRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from(table)
      .select('*')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []) as unknown as SourceRow[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

// ─── Stat extraction per league ──────────────────────────────────────────────

function toStats(row: SourceRow): Record<string, number> {
  const pointsPlayed = (row.o_points ?? 0) + (row.d_points ?? 0);
  const base = {
    goals: row.goals ?? 0,
    assists: row.assists ?? 0,
    blocks: row.blocks ?? 0,
    plusMinus: Number(row.plus_minus ?? 0),
    turnovers: row.turnovers ?? 0,
    pointsPlayed,
  };

  if (league === 'pul') {
    // 2023 touches are undertracked — zero them so the gateZero dim treats
    // those seasons as missing-data-neutral rather than spuriously negative.
    const touches = row.season >= PUL_TOUCHES_MIN_SEASON ? (row.touches ?? 0) : 0;
    return { ...base, touches };
  }

  return {
    ...base,
    touches: row.touches ?? 0,
    yardsTotal: row.yards_total ?? 0,
    hucksCompleted: row.hucks_completed ?? 0,
    callahans: row.callahans ?? 0,
  };
}

// ─── Baseline computation ────────────────────────────────────────────────────

function meanStd(values: number[]): { mean: number; std: number } {
  if (values.length === 0) return { mean: 0, std: 0 };
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance =
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return { mean, std: Math.sqrt(variance) };
}

function computeBaseline(
  candidates: Candidate[],
  dims: LeagueDim[],
): LeagueBaseline {
  const baselineDims: LeagueBaseline['dims'] = {};
  for (const dim of dims) {
    let values = candidates.map((c) => c.stats[dim.key] ?? 0);
    if (dim.gateZero) values = values.filter((v) => v !== 0);
    if (dim.winsorizeMax != null) {
      values = values.map((v) => Math.min(v, dim.winsorizeMax!));
    }
    baselineDims[dim.key] = meanStd(values);
  }
  return {
    playerSeasons: candidates.length,
    dims: baselineDims,
    anchors: [], // filled after raw scores exist
  };
}

/** Raw score value at percentile p (0–100) of a SORTED ascending array. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo]);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const table = league === 'pul' ? 'pul_players' : 'wul_players';
  const dims = league === 'pul' ? PUL_DIMS : WUL_DIMS;

  console.log(`── 12-0 ${league.toUpperCase()} backfill ──`);
  console.log(`Fetching ${table}…`);
  const rows = await fetchAllRows(table);
  console.log(`  ${rows.length} rows`);

  const candidates: Candidate[] = rows
    .filter((r) => (r.games_played ?? 0) >= MIN_GAMES_PLAYED)
    .map((row) => ({ row, stats: toStats(row) }));
  console.log(`  ${candidates.length} qualifying player-seasons (≥${MIN_GAMES_PLAYED} GP)`);

  // Pass 1 — baseline mean/std per dim.
  const baseline = computeBaseline(candidates, dims);

  // Pass 2 — raw scores → percentile anchors → normalized scores.
  const rawScores = candidates.map((c) =>
    computeLeagueRawScore(c.stats, dims, baseline),
  );
  const sorted = [...rawScores].sort((a, b) => a - b);
  baseline.anchors = [0, 50, 75, 90, 95, 99, 99.5, 99.9, 100].map((p) =>
    percentile(sorted, p),
  );

  const scored = candidates.map((c, i) => ({
    ...c,
    rawScore: rawScores[i],
    playerScore: pwlNormalize(rawScores[i], baseline.anchors, LEAGUE_TARGET_SCORES),
  }));

  // Sanity output — calibration targets are design constants (see rating.ts).
  const scoresSorted = scored.map((s) => s.playerScore).sort((a, b) => a - b);
  console.log('\nScore calibration check:');
  for (const p of [50, 75, 90, 95, 99]) {
    console.log(`  p${p}: ${percentile(scoresSorted, p).toFixed(1)}`);
  }
  const top = [...scored].sort((a, b) => b.playerScore - a.playerScore).slice(0, 10);
  console.log('\nTop 10 seasons:');
  for (const t of top) {
    console.log(
      `  ${t.playerScore.toFixed(1).padStart(5)}  ${t.row.player_name}` +
      `  (${t.row.team_id} ${t.row.season})`,
    );
  }

  // Write rows — delete league slice then insert (idempotent reconcile).
  const abbrFor = (teamId: string): string =>
    league === 'pul'
      ? (PUL_TEAM_ABBR[teamId] ?? teamId.slice(0, 3).toUpperCase())
      : (WUL_TEAMS[teamId]?.abbr ?? teamId.slice(0, 3).toUpperCase());

  const dbRows = scored.map((s) => ({
    league,
    player_id: s.row.id,
    team_slug: s.row.team_id,
    team_abbr: abbrFor(s.row.team_id),
    year: s.row.season,
    name: s.row.player_name,
    team_internal_id: 0, // UFA-only concept
    games_played: s.row.games_played,
    goals: s.stats.goals,
    assists: s.stats.assists,
    blocks: s.stats.blocks,
    plus_minus: Math.round(s.stats.plusMinus), // WUL halves rounded for display
    turnovers: s.stats.turnovers,
    touches: s.stats.touches || null,          // 0 (gated/missing) → null
    o_points: s.row.o_points ?? 0,
    d_points: s.row.d_points ?? 0,
    points_played: s.stats.pointsPlayed,
    callahans: s.stats.callahans ?? 0,
    hucks_completed: s.stats.hucksCompleted ?? 0,
    yards_thrown: 0,
    yards_received: s.stats.yardsTotal ?? 0,   // WUL total yards (not split)
    hockey_assists: 0,
    completions: 0,
    completion_pct: null,
    drops: 0,
    player_score: Number(s.playerScore.toFixed(2)),
    backfill_version: BACKFILL_VERSION,
  }));

  console.log(`\nWriting ${dbRows.length} rows to twelve_oh_players (league=${league})…`);
  const del = await db.from('twelve_oh_players').delete().eq('league', league);
  if (del.error) throw del.error;
  for (let i = 0; i < dbRows.length; i += 500) {
    const ins = await db.from('twelve_oh_players').insert(dbRows.slice(i, i + 500));
    if (ins.error) throw ins.error;
  }

  const up = await db.from('twelve_oh_league_baselines').upsert({
    league,
    player_seasons: baseline.playerSeasons,
    payload: baseline,
    computed_at: new Date().toISOString(),
  });
  if (up.error) throw up.error;

  // Print the baked block for leagues.ts.
  const dimLines = dims
    .map((d) => {
      const b = baseline.dims[d.key];
      return `    ${d.key}: { mean: ${b.mean.toFixed(4)}, std: ${b.std.toFixed(4)} },`;
    })
    .join('\n');
  const anchorLine = baseline.anchors.map((a) => a.toFixed(4)).join(', ');
  console.log(`\n── Paste into src/lib/twelve-oh/leagues.ts ──`);
  console.log(
    `export const ${league.toUpperCase()}_BAKED_BASELINE: LeagueBaseline = {\n` +
    `  playerSeasons: ${baseline.playerSeasons},\n` +
    `  dims: {\n${dimLines}\n  },\n` +
    `  // [P0, P50, P75, P90, P95, P99, P99.5, P99.9, P100]\n` +
    `  anchors: [${anchorLine}],\n};`,
  );

  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

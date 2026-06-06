/**
 * 12-0 backfill script — v2
 * ─────────────────────────────────────────────────────────────────────────────
 * Populates twelve_oh_players and twelve_oh_baseline from the live UFA API.
 * IDEMPOTENT: re-runnable at any time (upserts by primary key). Safe to run
 * annually after new-season data appears.
 *
 * USAGE (run from repo root):
 *   npx tsx scripts/backfill-twelve-oh.ts
 *
 * REQUIRED ENV VARS:
 *   NEXT_PUBLIC_SUPABASE_URL       — your project URL
 *   SUPABASE_SERVICE_ROLE_KEY      — service role key (bypasses RLS for writes)
 *
 * The script does NOT use NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY because that
 * key is restricted to read-only by RLS. Service role key must NEVER be
 * exposed to the frontend or committed. Load it from .env.local.
 *
 * YEARS COVERED (v2)
 * ──────────────────
 * 2012-2019 + 2021-2025. Skip 2020 (COVID, no season).
 * Pre-2021 seasons have no yards data (yardsThrown/yardsReceived always 0
 * in API responses). Those seasons get neutral z-scores (0) on the yards
 * dimensions — they are neither penalized nor inflated, just missing those
 * two inputs. The resulting raw scores compare cleanly to post-2021 seasons
 * because the overall mean/std includes both eras.
 *
 * TWO-PASS ALGORITHM
 * ──────────────────
 * Pass 1: Fetch every (team, year) roster from the UFA API. Collect all
 *         player-seasons that meet the ≥3 GP gate. Compute all-time mean/std
 *         for each rated stat.
 * Pass 2: For each player-season, compute z-scores against the all-time baseline,
 *         then compute raw score. From the full raw-score distribution derive the
 *         9 percentile anchors used by the v2 piecewise normalization curve.
 *         Normalize all scores. Upsert into twelve_oh_players.
 *         Also upsert twelve_oh_baseline(id=1).
 *
 * RATE LIMITING
 * ─────────────
 * The UFA API is undocumented and unauthenticated. We add a small delay
 * between team fetches to be a polite guest. The full backfill (~35 teams
 * × 13 years = ~455 requests) takes ~5-8 minutes.
 */

// Load .env / .env.local manually so dotenv is not required as a dep.
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
import { TEAM_META } from '../src/lib/ufa/teams.js';
import {
  computeZScores,
  computeRawScore,
  normalizeScore,
  COMPLETION_PCT_MIN_COMPLETIONS,
  type Baseline,
  type PlayerSeasonStats,
} from '../src/lib/twelve-oh/rating.js';

// ─── Configuration ──────────────────────────────────────────────────────────

/**
 * All UFA years with confirmed data. Skip 2020 (COVID, no season played).
 * 2012-2018 use the older UFA stats API — data exists but yards are absent.
 * Extend each January when the new season data appears.
 */
const BACKFILL_YEARS = [
  2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019,
  // 2020 skipped — COVID season, no games played
  2021, 2022, 2023, 2024, 2025,
];

/** Minimum games played to include a player-season. */
const MIN_GAMES_PLAYED = 3;

/** ms delay between team-year API calls (be a polite guest). */
const INTER_REQUEST_DELAY_MS = 200;

const UFA_BASE = 'https://www.backend.ufastats.com/web-v1';
const UA = 'Mozilla/5.0 (the-layout/backfill)';
const MAX_LIMIT = 30;

// ─── Supabase (service role) ─────────────────────────────────────────────────

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
  realtime: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transport: class NoopWS { constructor() { return; } } as any,
  },
});

// ─── UFA API helpers ─────────────────────────────────────────────────────────

interface UfaPlayerStatRaw {
  playerID: string;
  name: string;
  gamesPlayed: number;
  goals: number;
  assists: number;
  blocks: number;
  hockeyAssists: number;
  completions: number;
  completionPercentage: string;
  yardsThrown: number;
  yardsReceived: number;
  plusMinus: number;
  hucksCompleted: number;
  huckPercentage: string;
  throwaways: number;
  [k: string]: unknown;
}

interface UfaStatsResponse {
  stats: UfaPlayerStatRaw[];
  total: number;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchTeamRoster(
  teamInternalID: number,
  year: number,
): Promise<UfaPlayerStatRaw[]> {
  const out: UfaPlayerStatRaw[] = [];
  for (let page = 1; page <= 20; page++) {
    const params = new URLSearchParams({
      year: String(year),
      teamID: String(teamInternalID),
      per: 'total',
      limit: String(MAX_LIMIT),
      page: String(page),
    });
    const url = `${UFA_BASE}/player-stats?${params}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    if (!res.ok) {
      if (res.status === 404 || res.status === 400) break;
      throw new Error(`UFA API ${url} → HTTP ${res.status}`);
    }
    const data = (await res.json()) as UfaStatsResponse;
    const rows = data.stats ?? [];
    out.push(...rows);
    if (rows.length < MAX_LIMIT) break;
    if (out.length >= data.total) break;
  }
  return out;
}

// ─── Stats helpers ────────────────────────────────────────────────────────────

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function std(xs: number[], m?: number): number {
  if (xs.length < 2) return 1;
  const mu = m ?? mean(xs);
  const variance = xs.reduce((s, x) => s + (x - mu) ** 2, 0) / xs.length;
  return Math.sqrt(variance) || 1;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

// ─── Main ────────────────────────────────────────────────────────────────────

interface CollectedSeason {
  teamSlug: string;
  teamAbbr: string;
  teamInternalId: number;
  year: number;
  raw: UfaPlayerStatRaw;
}

async function main() {
  console.log('=== 12-0 Backfill v2 ===');
  console.log(`Years: ${BACKFILL_YEARS.join(', ')}`);
  console.log(`Min games played: ${MIN_GAMES_PLAYED}`);
  console.log(`Completion % threshold: ${COMPLETION_PCT_MIN_COMPLETIONS} completions`);
  console.log('Pre-2021 seasons: yards z-scores = 0 (no yards data in API)\n');

  // ── PASS 1: Collect all qualifying player-seasons ──────────────────────────
  console.log('PASS 1: Fetching rosters from UFA API...');
  const collected: CollectedSeason[] = [];
  let apiCalls = 0;
  let teamYearsWithData = 0;

  const allTeams = Object.values(TEAM_META);
  for (const team of allTeams) {
    if (!team.internalID || team.internalID === 0) continue;

    for (const year of BACKFILL_YEARS) {
      process.stdout.write(`  ${team.abbr} ${year}... `);
      try {
        const roster = await fetchTeamRoster(team.internalID, year);
        apiCalls++;
        const qualifying = roster.filter((r) => r.gamesPlayed >= MIN_GAMES_PLAYED);
        if (qualifying.length > 0) {
          teamYearsWithData++;
          for (const raw of qualifying) {
            collected.push({
              teamSlug: team.id,
              teamAbbr: team.abbr,
              teamInternalId: team.internalID,
              year,
              raw,
            });
          }
          console.log(`${qualifying.length} players (of ${roster.length} on roster)`);
        } else {
          console.log(`0 qualifying (${roster.length} on roster)`);
        }
      } catch (err) {
        console.log(`SKIP (${(err as Error).message.slice(0, 60)})`);
      }
      await sleep(INTER_REQUEST_DELAY_MS);
    }
  }

  console.log(`\nPass 1 complete: ${collected.length} qualifying player-seasons`);
  console.log(`  from ${apiCalls} API calls across ${teamYearsWithData} team-years with data\n`);

  if (collected.length === 0) {
    console.error('No data collected. Check API connectivity.');
    process.exit(1);
  }

  // ── Compute baseline ───────────────────────────────────────────────────────
  console.log('Computing all-time baseline (mean/std per stat)...');

  // Pre-2021 seasons have yardsThrown=0/undefined from the API.
  // We exclude zero/undefined yards from the yards baseline distribution so
  // those seasons don't drag the mean to 0. The pre-2021 player z-scores
  // for yards will be negative (0 vs a positive mean), but that reflects
  // reality: we simply cannot credit yards we don't have. Importantly, since
  // the baseline is computed over ALL seasons including the zeros, the yards
  // z-scores for pre-2021 players are consistently negative by the same
  // amount — they're not disadvantaged relative to each other.
  //
  // Alternative considered: exclude pre-2021 from the yards baseline entirely
  // (filter yardsThrown > 0 for both mean and std). We do this for the mean
  // only — using only seasons with real yards data so the mean reflects what
  // a "real" yards season looks like. This means pre-2021 players score ~0
  // on yards vs a positive mean, giving a mild negative z. This is correct:
  // we can't know their yards totals, so we give them no credit.
  const goals         = collected.map((c) => c.raw.goals ?? 0);
  const assists       = collected.map((c) => c.raw.assists ?? 0);
  const blocks        = collected.map((c) => c.raw.blocks ?? 0);
  const hockeyAssists = collected.map((c) => c.raw.hockeyAssists ?? 0);
  // Yards baseline: only over seasons that actually have yards data
  const yardsThrown   = collected.map((c) => c.raw.yardsThrown ?? 0).filter((v) => v > 0);
  const yardsReceived = collected.map((c) => c.raw.yardsReceived ?? 0).filter((v) => v > 0);
  const plusMinus     = collected.map((c) => c.raw.plusMinus ?? 0);

  const highVolumeCompPct = collected
    .filter((c) => c.raw.completions >= COMPLETION_PCT_MIN_COMPLETIONS)
    .map((c) => parseFloat(c.raw.completionPercentage))
    .filter(isFinite);

  const mGoals   = mean(goals);   const sGoals   = std(goals, mGoals);
  const mAssists = mean(assists); const sAssists = std(assists, mAssists);
  const mBlocks  = mean(blocks);  const sBlocks  = std(blocks, mBlocks);
  const mHA      = mean(hockeyAssists); const sHA = std(hockeyAssists, mHA);
  const mYT      = mean(yardsThrown);   const sYT = std(yardsThrown, mYT);
  const mYR      = mean(yardsReceived); const sYR = std(yardsReceived, mYR);
  const mPM      = mean(plusMinus);     const sPM = std(plusMinus, mPM);
  const mCP      = mean(highVolumeCompPct); const sCP = std(highVolumeCompPct, mCP);

  console.log(`  goals:          mean=${mGoals.toFixed(2)}, std=${sGoals.toFixed(2)}`);
  console.log(`  assists:        mean=${mAssists.toFixed(2)}, std=${sAssists.toFixed(2)}`);
  console.log(`  blocks:         mean=${mBlocks.toFixed(2)}, std=${sBlocks.toFixed(2)}`);
  console.log(`  hockeyAssists:  mean=${mHA.toFixed(2)}, std=${sHA.toFixed(2)}`);
  console.log(`  yardsThrown:    mean=${mYT.toFixed(2)}, std=${sYT.toFixed(2)} (n=${yardsThrown.length} seasons with yards)`);
  console.log(`  yardsReceived:  mean=${mYR.toFixed(2)}, std=${sYR.toFixed(2)}`);
  console.log(`  plusMinus:      mean=${mPM.toFixed(2)}, std=${sPM.toFixed(2)}`);
  console.log(`  completionPct:  mean=${mCP.toFixed(2)}, std=${sCP.toFixed(2)} (n=${highVolumeCompPct.length} high-vol throwers)\n`);

  // Build interim baseline without percentile anchors (those come from raw scores)
  const baselinePartial: Omit<Baseline,
    'rawAtP0' | 'rawAtP50' | 'rawAtP75' | 'rawAtP90' | 'rawAtP95' |
    'rawAtP99' | 'rawAtP995' | 'rawAtP999' | 'rawAtP100' |
    'rawScoreMin' | 'rawScoreMax' | 'rawScoreP5' | 'rawScoreP95'
  > = {
    playerSeasons: collected.length,
    meanGoals: mGoals,         stdGoals: sGoals,
    meanAssists: mAssists,     stdAssists: sAssists,
    meanBlocks: mBlocks,       stdBlocks: sBlocks,
    meanHockeyAssists: mHA,    stdHockeyAssists: sHA,
    meanYardsThrown: mYT,      stdYardsThrown: sYT,
    meanYardsReceived: mYR,    stdYardsReceived: sYR,
    meanPlusMinus: mPM,        stdPlusMinus: sPM,
    meanCompletionPct: mCP,    stdCompletionPct: sCP,
  };

  // ── PASS 2: Compute raw scores, derive percentile anchors ─────────────────
  console.log('PASS 2: Computing raw scores...');

  const tempBaseline: Baseline = {
    ...baselinePartial,
    // Placeholder anchors (unused in this pass — we compute raw scores directly)
    rawAtP0: 0, rawAtP50: 0, rawAtP75: 0, rawAtP90: 0, rawAtP95: 0,
    rawAtP99: 0, rawAtP995: 0, rawAtP999: 0, rawAtP100: 0,
    rawScoreMin: 0, rawScoreMax: 0, rawScoreP5: 0, rawScoreP95: 0,
  };

  const rawScores: number[] = [];
  const scored = collected.map((c) => {
    const stats: PlayerSeasonStats = {
      goals: c.raw.goals ?? 0,
      assists: c.raw.assists ?? 0,
      blocks: c.raw.blocks ?? 0,
      hockeyAssists: c.raw.hockeyAssists ?? 0,
      // Pre-2021: yardsThrown/yardsReceived are undefined in API → treat as 0.
      // z-score of 0 vs positive mean → slight negative, which is correct
      // (we have no yards data, so no yards credit).
      yardsThrown: c.raw.yardsThrown ?? 0,
      yardsReceived: c.raw.yardsReceived ?? 0,
      plusMinus: c.raw.plusMinus ?? 0,
      completions: c.raw.completions ?? 0,
      completionPercentage: c.raw.completionPercentage ?? '0',
    };
    const zScores = computeZScores(stats, tempBaseline);
    const rawScore = computeRawScore(zScores);
    rawScores.push(rawScore);
    return { c, stats, zScores, rawScore };
  });

  // Compute percentile anchors for the v2 piecewise normalization curve
  const sortedRaw = [...rawScores].sort((a, b) => a - b);
  const n = sortedRaw.length;

  const rawAtP0   = sortedRaw[0];
  const rawAtP50  = percentile(sortedRaw, 50);
  const rawAtP75  = percentile(sortedRaw, 75);
  const rawAtP90  = percentile(sortedRaw, 90);
  const rawAtP95  = percentile(sortedRaw, 95);
  const rawAtP99  = percentile(sortedRaw, 99);
  const rawAtP995 = percentile(sortedRaw, 99.5);
  const rawAtP999 = percentile(sortedRaw, 99.9);
  const rawAtP100 = sortedRaw[n - 1];

  // Legacy fields (kept for DB schema compat)
  const rawMin  = rawAtP0;
  const rawMax  = rawAtP100;
  const rawP5   = percentile(sortedRaw, 5);
  const rawP95  = rawAtP95;

  console.log('\nRaw score distribution:');
  console.log(`  n=${n} qualifying player-seasons`);
  console.log(`  min=${rawMin.toFixed(3)}, max=${rawMax.toFixed(3)}`);
  console.log(`  p50=${rawAtP50.toFixed(3)}, p75=${rawAtP75.toFixed(3)}, p90=${rawAtP90.toFixed(3)}`);
  console.log(`  p95=${rawAtP95.toFixed(3)}, p99=${rawAtP99.toFixed(3)}, p99.5=${rawAtP995.toFixed(3)}, p99.9=${rawAtP999.toFixed(3)}`);

  // Build final baseline with all anchors
  const baseline: Baseline = {
    ...baselinePartial,
    rawAtP0,
    rawAtP50,
    rawAtP75,
    rawAtP90,
    rawAtP95,
    rawAtP99,
    rawAtP995,
    rawAtP999,
    rawAtP100,
    rawScoreMin: rawMin,
    rawScoreMax: rawMax,
    rawScoreP5:  rawP5,
    rawScoreP95: rawP95,
  };

  // ── Upsert twelve_oh_baseline ─────────────────────────────────────────────
  console.log('\nUpserting twelve_oh_baseline...');
  const { error: baselineErr } = await db
    .from('twelve_oh_baseline')
    .upsert(
      {
        id: 1,
        player_seasons: collected.length,
        mean_goals: mGoals,           std_goals: sGoals,
        mean_assists: mAssists,       std_assists: sAssists,
        mean_blocks: mBlocks,         std_blocks: sBlocks,
        mean_hockey_assists: mHA,     std_hockey_assists: sHA,
        mean_yards_thrown: mYT,       std_yards_thrown: sYT,
        mean_yards_received: mYR,     std_yards_received: sYR,
        mean_plus_minus: mPM,         std_plus_minus: sPM,
        mean_completion_pct: mCP,     std_completion_pct: sCP,
        raw_score_min: rawMin,
        raw_score_max: rawMax,
        raw_score_p5: rawP5,
        raw_score_p95: rawP95,
        computed_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );
  if (baselineErr) {
    console.error('Baseline upsert failed:', baselineErr);
    process.exit(1);
  }
  console.log('  Baseline written.\n');

  // ── Normalize scores and upsert twelve_oh_players ─────────────────────────
  console.log('Normalizing scores (v2 piecewise curve)...');

  // Verify the curve gives sensible anchor scores
  console.log('  Curve verification (spot-check against percentile anchors):');
  console.log(`    p50  raw=${rawAtP50.toFixed(3)} → score=${normalizeScore(rawAtP50, baseline).toFixed(1)} (target: 38)`);
  console.log(`    p75  raw=${rawAtP75.toFixed(3)} → score=${normalizeScore(rawAtP75, baseline).toFixed(1)} (target: 55)`);
  console.log(`    p90  raw=${rawAtP90.toFixed(3)} → score=${normalizeScore(rawAtP90, baseline).toFixed(1)} (target: 68)`);
  console.log(`    p95  raw=${rawAtP95.toFixed(3)} → score=${normalizeScore(rawAtP95, baseline).toFixed(1)} (target: 77)`);
  console.log(`    p99  raw=${rawAtP99.toFixed(3)} → score=${normalizeScore(rawAtP99, baseline).toFixed(1)} (target: 87)`);
  console.log(`    p99.5 raw=${rawAtP995.toFixed(3)} → score=${normalizeScore(rawAtP995, baseline).toFixed(1)} (target: 92)`);
  console.log(`    p99.9 raw=${rawAtP999.toFixed(3)} → score=${normalizeScore(rawAtP999, baseline).toFixed(1)} (target: 96)`);
  console.log(`    max  raw=${rawAtP100.toFixed(3)} → score=${normalizeScore(rawAtP100, baseline).toFixed(1)} (target: 100)`);

  console.log('\nUpserting player rows...');
  const BATCH = 200;
  let upserted = 0;

  const rows = scored.map(({ c, zScores, rawScore }) => {
    const playerScore = normalizeScore(rawScore, baseline);
    const completionPctNum = parseFloat(c.raw.completionPercentage);
    const hasCompletionPct =
      c.raw.completions >= COMPLETION_PCT_MIN_COMPLETIONS && isFinite(completionPctNum);
    const huckPctNum = parseFloat(c.raw.huckPercentage as string);

    return {
      player_id: c.raw.playerID,
      team_slug: c.teamSlug,
      year: c.year,
      name: c.raw.name,
      team_abbr: c.teamAbbr,
      team_internal_id: c.teamInternalId,
      games_played: c.raw.gamesPlayed,
      goals: c.raw.goals ?? 0,
      assists: c.raw.assists ?? 0,
      blocks: c.raw.blocks ?? 0,
      hockey_assists: c.raw.hockeyAssists ?? 0,
      completions: c.raw.completions ?? 0,
      completion_pct: hasCompletionPct ? completionPctNum : null,
      yards_thrown: c.raw.yardsThrown ?? 0,
      yards_received: c.raw.yardsReceived ?? 0,
      plus_minus: c.raw.plusMinus ?? 0,
      hucks_completed: c.raw.hucksCompleted ?? 0,
      huck_pct: isFinite(huckPctNum) ? huckPctNum : null,
      turnovers: c.raw.throwaways ?? 0,
      z_goals: zScores.zGoals,
      z_assists: zScores.zAssists,
      z_blocks: zScores.zBlocks,
      z_hockey_assists: zScores.zHockeyAssists,
      z_yards_thrown: zScores.zYardsThrown,
      z_yards_received: zScores.zYardsReceived,
      z_plus_minus: zScores.zPlusMinus,
      z_completion_pct: zScores.zCompletionPct,
      player_score: playerScore,
      backfill_version: 2,
      updated_at: new Date().toISOString(),
    };
  });

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await db
      .from('twelve_oh_players')
      .upsert(batch, { onConflict: 'player_id,team_slug,year' });
    if (error) {
      console.error(`Batch ${i}–${i + batch.length} failed:`, error);
      process.exit(1);
    }
    upserted += batch.length;
    process.stdout.write(`  ${upserted}/${rows.length} rows upserted\r`);
  }
  console.log(`\n  ${upserted} rows upserted.\n`);

  // ── Verification ──────────────────────────────────────────────────────────
  console.log('=== VERIFICATION ===\n');

  // Top 15 all-time by score (should be genuine GOATs across all years)
  const { data: top15 } = await db
    .from('twelve_oh_players')
    .select('name, team_abbr, year, goals, assists, blocks, player_score')
    .order('player_score', { ascending: false })
    .limit(15);

  console.log('Top 15 players by player_score (all-time):');
  console.log('  Rank  Name                        Team  Year  G   A   B   Score');
  console.log('  ────  ──────────────────────────  ────  ────  ──  ──  ──  ─────');
  (top15 ?? []).forEach((p, i) => {
    const rank = String(i + 1).padStart(4);
    const name = (p.name as string).padEnd(26);
    const abbr = (p.team_abbr as string).padEnd(4);
    const yr = String(p.year).padEnd(4);
    const g = String(p.goals).padStart(2);
    const a = String(p.assists).padStart(2);
    const b = String(p.blocks).padStart(2);
    const score = Number(p.player_score).toFixed(1).padStart(5);
    console.log(`  ${rank}  ${name}  ${abbr}  ${yr}  ${g}  ${a}  ${b}  ${score}`);
  });

  // Score distribution from DB
  const { data: distData } = await db
    .from('twelve_oh_players')
    .select('player_score');
  const allScores = (distData ?? []).map((r) => Number(r.player_score)).sort((a, b) => a - b);
  const totalRows = allScores.length;

  console.log('\nScore distribution (from DB):');
  console.log(`  Total rows: ${totalRows}`);
  console.log(`  Min:    ${allScores[0]?.toFixed(1)}`);
  console.log(`  p25:    ${percentile(allScores, 25).toFixed(1)}`);
  console.log(`  Median: ${percentile(allScores, 50).toFixed(1)}  (target: ~38)`);
  console.log(`  p75:    ${percentile(allScores, 75).toFixed(1)}  (target: ~55)`);
  console.log(`  p90:    ${percentile(allScores, 90).toFixed(1)}  (target: ~68)`);
  console.log(`  p95:    ${percentile(allScores, 95).toFixed(1)}  (target: ~77)`);
  console.log(`  p99:    ${percentile(allScores, 99).toFixed(1)}  (target: ~87)`);
  console.log(`  Max:    ${allScores[allScores.length - 1]?.toFixed(1)}`);

  // Ceiling saturation check — the whole point of v2
  const ge99  = allScores.filter((s) => s >= 99).length;
  const ge96  = allScores.filter((s) => s >= 96).length;
  const ge92  = allScores.filter((s) => s >= 92).length;
  const ge87  = allScores.filter((s) => s >= 87).length;
  const ge77  = allScores.filter((s) => s >= 77).length;
  console.log('\nCeiling saturation (key question: how rare is the top?):');
  console.log(`  ≥99 ("near-perfect"):    ${ge99}   (target: 0-1 all-time)`);
  console.log(`  ≥96 (All-Time Greatest): ${ge96}   (target: ~1-5 all-time)`);
  console.log(`  ≥92 (p99.5+ era):        ${ge92}  (target: ~45 all-time)`);
  console.log(`  ≥87 (All-Time Elite):    ${ge87}  (target: ~1% = ~${Math.round(totalRows * 0.01)})`);
  console.log(`  ≥77 (Star):              ${ge77}  (target: ~5% = ~${Math.round(totalRows * 0.05)})`);

  // Felton 2025 check (user's named example — should be Star, not 100)
  const { data: feltonRows } = await db
    .from('twelve_oh_players')
    .select('name, team_abbr, year, goals, assists, blocks, player_score')
    .ilike('name', '%felton%')
    .eq('year', 2025);
  if (feltonRows && feltonRows.length > 0) {
    console.log('\nJake Felton 2025 DET check (should be Star tier, ~68-87):');
    feltonRows.forEach((p) => {
      console.log(`  ${p.name} (${p.team_abbr} ${p.year}): score=${Number(p.player_score).toFixed(1)}, G=${p.goals}, A=${p.assists}, B=${p.blocks}`);
    });
  }

  // ── Win distribution simulations ─────────────────────────────────────────
  console.log('\n=== WIN DISTRIBUTION SIMULATIONS ===\n');

  const { teamRecord } = await import('../src/lib/twelve-oh/rating.js');
  const N_SIM = 10000;

  // (i) Simulation: purely random 7-man teams from the full pool
  console.log(`(i) ${N_SIM} random 7-man teams (players drawn uniformly from full pool):`);
  const winCountsRandom = new Array(13).fill(0);
  for (let sim = 0; sim < N_SIM; sim++) {
    const team: number[] = [];
    for (let slot = 0; slot < 7; slot++) {
      team.push(allScores[Math.floor(Math.random() * allScores.length)]);
    }
    const { wins } = teamRecord(team);
    winCountsRandom[wins]++;
  }
  console.log('  Wins  Count   Pct  Bar');
  winCountsRandom.forEach((count, wins) => {
    const pct = ((count / N_SIM) * 100).toFixed(1);
    const barLen = Math.round(count / N_SIM * 40);
    const bar = '█'.repeat(barLen);
    console.log(`   ${String(wins).padStart(2)}  ${String(count).padStart(5)}  ${pct.padStart(5)}%  ${bar}`);
  });
  const pctRandom12 = ((winCountsRandom[12] / N_SIM) * 100).toFixed(2);
  console.log(`\n  12-0 rate: ${winCountsRandom[12]}/${N_SIM} = ${pctRandom12}%  (target: ~0%)`);

  // (ii) Simulation: best 7 from a single random team-year (the original exploit)
  // Build team-year roster map from the local scored data
  console.log(`\n(ii) ${N_SIM} simulations of "pick best 7 from one random team-year":`);

  // Group player scores by team-year
  const teamYearMap = new Map<string, number[]>();
  for (const { c, rawScore } of scored) {
    const key = `${c.teamSlug}:${c.year}`;
    const normalizedScore = normalizeScore(rawScore, baseline);
    if (!teamYearMap.has(key)) teamYearMap.set(key, []);
    teamYearMap.get(key)!.push(normalizedScore);
  }
  const teamYearEntries = [...teamYearMap.entries()].filter(([, scores]) => scores.length >= 7);
  console.log(`  (${teamYearEntries.length} team-years with ≥7 qualifying players)`);

  const winCountsExploit = new Array(13).fill(0);
  for (let sim = 0; sim < N_SIM; sim++) {
    const [, tyScores] = teamYearEntries[Math.floor(Math.random() * teamYearEntries.length)];
    const sorted7 = [...tyScores].sort((a, b) => b - a).slice(0, 7);
    const { wins } = teamRecord(sorted7);
    winCountsExploit[wins]++;
  }
  console.log('  Wins  Count   Pct  Bar');
  winCountsExploit.forEach((count, wins) => {
    const pct = ((count / N_SIM) * 100).toFixed(1);
    const barLen = Math.round(count / N_SIM * 40);
    const bar = '█'.repeat(barLen);
    console.log(`   ${String(wins).padStart(2)}  ${String(count).padStart(5)}  ${pct.padStart(5)}%  ${bar}`);
  });
  const pctExploit12 = ((winCountsExploit[12] / N_SIM) * 100).toFixed(2);
  console.log(`\n  12-0 rate: ${winCountsExploit[12]}/${N_SIM} = ${pctExploit12}%  (target: very low, << 1%)`);

  // Find the actual best possible team-year (to set expectation ceiling)
  let bestTY = '';
  let bestMean = 0;
  for (const [key, tyScores] of teamYearEntries) {
    const top7 = [...tyScores].sort((a, b) => b - a).slice(0, 7);
    const m = top7.reduce((s, x) => s + x, 0) / 7;
    if (m > bestMean) { bestMean = m; bestTY = key; }
  }
  const [bestSlug, bestYear] = bestTY.split(':');
  console.log(`\n  Best single team-year: ${bestSlug} ${bestYear} — top-7 mean score ${bestMean.toFixed(1)}`);
  const { wins: bestWins } = teamRecord([...teamYearMap.get(bestTY)!].sort((a, b) => b - a).slice(0, 7));
  console.log(`  Their record with top-7: ${bestWins}-${12 - bestWins}`);

  // ── BAKED_BASELINE update instructions ─────────────────────────────────────
  console.log('\n=== UPDATE rating.ts BAKED_BASELINE ===');
  console.log('Paste these values into src/lib/twelve-oh/rating.ts BAKED_BASELINE:');
  console.log(`  playerSeasons: ${collected.length},`);
  console.log(`  meanGoals: ${mGoals.toFixed(4)},          stdGoals: ${sGoals.toFixed(4)},`);
  console.log(`  meanAssists: ${mAssists.toFixed(4)},      stdAssists: ${sAssists.toFixed(4)},`);
  console.log(`  meanBlocks: ${mBlocks.toFixed(4)},        stdBlocks: ${sBlocks.toFixed(4)},`);
  console.log(`  meanHockeyAssists: ${mHA.toFixed(4)},     stdHockeyAssists: ${sHA.toFixed(4)},`);
  console.log(`  meanYardsThrown: ${mYT.toFixed(4)},       stdYardsThrown: ${sYT.toFixed(4)},`);
  console.log(`  meanYardsReceived: ${mYR.toFixed(4)},     stdYardsReceived: ${sYR.toFixed(4)},`);
  console.log(`  meanPlusMinus: ${mPM.toFixed(4)},         stdPlusMinus: ${sPM.toFixed(4)},`);
  console.log(`  meanCompletionPct: ${mCP.toFixed(4)},     stdCompletionPct: ${sCP.toFixed(4)},`);
  console.log(`  rawAtP0:   ${rawAtP0.toFixed(4)},`);
  console.log(`  rawAtP50:  ${rawAtP50.toFixed(4)},`);
  console.log(`  rawAtP75:  ${rawAtP75.toFixed(4)},`);
  console.log(`  rawAtP90:  ${rawAtP90.toFixed(4)},`);
  console.log(`  rawAtP95:  ${rawAtP95.toFixed(4)},`);
  console.log(`  rawAtP99:  ${rawAtP99.toFixed(4)},`);
  console.log(`  rawAtP995: ${rawAtP995.toFixed(4)},`);
  console.log(`  rawAtP999: ${rawAtP999.toFixed(4)},`);
  console.log(`  rawAtP100: ${rawAtP100.toFixed(4)},`);
  console.log(`  rawScoreMin: ${rawMin.toFixed(4)},`);
  console.log(`  rawScoreMax: ${rawMax.toFixed(4)},`);
  console.log(`  rawScoreP5: ${rawP5.toFixed(4)},`);
  console.log(`  rawScoreP95: ${rawP95.toFixed(4)},`);
  console.log('\nBackfill v2 complete.');
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});

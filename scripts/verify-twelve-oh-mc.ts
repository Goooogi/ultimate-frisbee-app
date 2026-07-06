/**
 * 12-0 Monte-Carlo verification — realistic spin+1-skip mechanic
 * ───────────────────────────────────────────────────────────────
 * Simulates 1M+ realistic team builds to verify win-record odds match
 * the design targets after a weights re-backfill.
 *
 * MECHANIC (mirrors actual game logic):
 *   7 picks. Each pick:
 *     1. Spin a random team-year (~275 eligible team-years with ≥7 players)
 *     2. Take the best available player from that team-year
 *        ("available" = not already on the current team this sim)
 *     3. Once per team-build, the player may skip a spin whose best
 *        available score < 85. That team-year is discarded; a fresh spin fires.
 *   Result: teamRecord([7 scores])
 *
 * USAGE:
 *   npx tsx scripts/verify-twelve-oh-mc.ts
 *
 * Reads live player_score data from Supabase (service role).
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
import { teamRecord } from '../src/lib/twelve-oh/rating.js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
  realtime: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transport: class NoopWS { constructor() { return; } } as any,
  },
});

// ── Targets ──────────────────────────────────────────────────────────────────
// Design targets after 2026-06-07 recalibration.
const TARGETS: Record<number, string> = {
  12: '0.4–0.8%  (≈0.5%)',
  11: '3–4%',
  10: '8–9%',
   9: '~18%',
   8: '~30%',
   7: '~35%',
};

// Mechanic constants
const PICKS_PER_TEAM = 7;
const SKIP_THRESHOLD = 85;   // skip a spin if best available < this (once per build)
const N_SIM          = 1_000_000;

async function main() {
  console.log('=== 12-0 Monte-Carlo Verification (realistic spin+1-skip) ===\n');

  // ── Fetch all player scores from DB (paginated — Supabase caps at 1000/page) ─
  console.log('Fetching player scores from Supabase (paginated)...');
  const PAGE_SIZE = 1000;
  const allRows: { player_id: string; team_slug: string; year: number; name: string; player_score: number; blocks: number; goals: number; assists: number }[] = [];
  let pageFrom = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data: page, error } = await db
      .from('twelve_oh_players')
      .select('player_id, team_slug, year, name, player_score, blocks, goals, assists')
      .eq('league', 'ufa') // this script verifies the UFA curve; PUL/WUL → tune-twelve-oh-league-curve.ts
      .order('player_score', { ascending: false })
      .range(pageFrom, pageFrom + PAGE_SIZE - 1);
    if (error) {
      console.error('DB fetch failed:', error);
      process.exit(1);
    }
    if (!page || page.length === 0) break;
    allRows.push(...page as typeof allRows);
    if (page.length < PAGE_SIZE) break;
    pageFrom += PAGE_SIZE;
  }
  const rows = allRows;
  console.log(`  Fetched ${rows.length} player-seasons.\n`);

  // ── Build team-year map ───────────────────────────────────────────────────
  // key: "teamSlug:year" → array of { playerId, score, name }
  // Sorted descending by score so best-available is always index 0.
  interface PlayerEntry { playerId: string; score: number; name: string; blocks: number; goals: number; assists: number; }
  const teamYearMap = new Map<string, PlayerEntry[]>();

  for (const r of rows) {
    const key = `${r.team_slug}:${r.year}`;
    if (!teamYearMap.has(key)) teamYearMap.set(key, []);
    teamYearMap.get(key)!.push({
      playerId: String(r.player_id),
      score: Number(r.player_score),
      name: String(r.name),
      blocks: Number(r.blocks ?? 0),
      goals: Number(r.goals ?? 0),
      assists: Number(r.assists ?? 0),
    });
  }

  // Sort each team-year desc by score and filter to ≥7 players
  const teamYears: PlayerEntry[][] = [];
  for (const [, players] of teamYearMap) {
    players.sort((a, b) => b.score - a.score);
    if (players.length >= 7) teamYears.push(players);
  }
  const nTY = teamYears.length;
  console.log(`Team-years with ≥7 qualifying players: ${nTY}\n`);

  // ── Helper: pick best available from a team-year ──────────────────────────
  // Returns the highest-scored player not already on the team (by playerId+year).
  // Since the list is sorted desc, we scan linearly (rarely more than a few picks
  // from the same team-year in one sim, so this is fast).
  function bestAvailable(ty: PlayerEntry[], usedIds: Set<string>, tyIdx: number): PlayerEntry | null {
    for (const p of ty) {
      // Key includes team-year index to allow the same player from a different
      // team-year (they played for multiple teams across seasons).
      const uid = `${tyIdx}:${p.playerId}`;
      if (!usedIds.has(uid)) return p;
    }
    return null; // all players on this team-year already picked (very rare with 7 picks)
  }

  // ── Monte-Carlo ───────────────────────────────────────────────────────────
  console.log(`Running ${N_SIM.toLocaleString()} simulations...`);
  const winCounts = new Int32Array(13);
  const progressStep = N_SIM / 20; // print progress every 5%

  for (let sim = 0; sim < N_SIM; sim++) {
    const teamScores: number[] = [];
    const usedIds = new Set<string>(); // playerId:teamYearIndex
    let skipUsed = false;              // one skip allowed per team-build

    for (let pick = 0; pick < PICKS_PER_TEAM; pick++) {
      // Spin: pick a random team-year
      let tyIdx = Math.floor(Math.random() * nTY);
      let ty = teamYears[tyIdx];

      const ba = bestAvailable(ty, usedIds, tyIdx);
      const bestScore = ba?.score ?? 0;

      // Apply skip if:
      //   - skip not yet used this build
      //   - best available on this spin is < threshold
      if (!skipUsed && bestScore < SKIP_THRESHOLD) {
        skipUsed = true;
        // Re-spin once
        tyIdx = Math.floor(Math.random() * nTY);
        ty = teamYears[tyIdx];
      }

      // Take best available from (possibly re-spun) team-year
      const picked = bestAvailable(ty, usedIds, tyIdx);
      if (!picked) {
        // Degenerate: team-year exhausted (extremely rare). Fall back to random score.
        teamScores.push(Math.random() * 40 + 20);
      } else {
        usedIds.add(`${tyIdx}:${picked.playerId}`);
        teamScores.push(picked.score);
      }
    }

    const { wins } = teamRecord(teamScores);
    winCounts[wins]++;

    if (sim % progressStep === 0 && sim > 0) {
      process.stdout.write(`  ${((sim / N_SIM) * 100).toFixed(0)}%\r`);
    }
  }
  console.log('  100% — done.    \n');

  // ── Results table ─────────────────────────────────────────────────────────
  console.log('Per-record win distribution over', N_SIM.toLocaleString(), 'simulations:');
  console.log('');
  console.log('  Wins  Count       Pct       Target            Status');
  console.log('  ────  ──────────  ────────  ────────────────  ──────');

  const targets_map: Record<number, [number, number]> = {
    12: [0.004, 0.008],
    11: [0.030, 0.040],
    10: [0.080, 0.090],
     9: [0.165, 0.195],
     8: [0.270, 0.330],
     7: [0.320, 0.380],
  };

  for (let w = 12; w >= 0; w--) {
    const count = winCounts[w];
    const pct = count / N_SIM;
    const pctStr = (pct * 100).toFixed(3) + '%';
    const target = TARGETS[w] ?? '—';
    const range = targets_map[w];
    let status = '';
    if (range) {
      if (pct >= range[0] && pct <= range[1]) {
        status = 'OK';
      } else if (pct < range[0]) {
        status = `LOW (target min ${(range[0] * 100).toFixed(1)}%)`;
      } else {
        status = `HIGH (target max ${(range[1] * 100).toFixed(1)}%)`;
      }
    }
    console.log(
      `   ${String(w).padStart(2)}  ${String(count).padStart(10)}  ${pctStr.padStart(8)}  ${target.padEnd(16)}  ${status}`
    );
  }

  const rate12 = (winCounts[12] / N_SIM) * 100;
  console.log(`\n12-0 rate: ${winCounts[12].toLocaleString()}/${N_SIM.toLocaleString()} = ${rate12.toFixed(4)}%`);

  if (rate12 < 0.3) {
    console.log('  *** WARNING: 12-0 rate is BELOW 0.3% — WIN_CURVE top end is too steep. Suggest nudging [87,11] and [91,12].');
  } else if (rate12 > 1.0) {
    console.log('  *** WARNING: 12-0 rate is ABOVE 1.0% — WIN_CURVE top end is too lenient. Suggest raising [91,12] threshold.');
  } else {
    console.log('  12-0 rate is within acceptable range (0.3–1.0%).');
  }

  // ── Best possible team (all-time top 7 by score, one per team-year slot) ─
  console.log('\n=== Best-possible team analysis ===\n');

  // Find top-7 all-time scores (globally unique player seasons, not constrained to one TY)
  const allSorted = rows.slice().sort((a, b) => Number(b.player_score) - Number(a.player_score));
  const top7 = allSorted.slice(0, 7);
  const top7Scores = top7.map((r) => Number(r.player_score));
  const top7Mean = top7Scores.reduce((s, x) => s + x, 0) / 7;
  const { wins: bestWins, losses: bestLosses, rationale: bestRationale } = teamRecord(top7Scores);

  console.log('Top 7 all-time player-seasons (unconstrained):');
  top7.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.name} (${r.team_slug} ${r.year}) — score ${Number(r.player_score).toFixed(1)}, G=${r.goals}, A=${r.assists}, B=${r.blocks}`);
  });
  console.log(`\n  Mean score: ${top7Mean.toFixed(2)}`);
  console.log(`  Record:     ${bestWins}-${bestLosses} (${bestRationale})`);
  console.log(`  12-0 achievable: ${bestWins === 12 ? 'YES' : 'NO — check WIN_CURVE ceiling'}`);

  // ── Block-heavy player check ──────────────────────────────────────────────
  console.log('\n=== Block-heavy player check (Jeff Babbitt) ===\n');
  console.log('Should have risen vs prior run due to blocks weight 0.8→1.0:');

  const { data: babbittRows } = await db
    .from('twelve_oh_players')
    .select('name, team_abbr, year, goals, assists, blocks, player_score')
    .eq('league', 'ufa')
    .ilike('name', '%babbitt%')
    .order('player_score', { ascending: false })
    .limit(5);

  if (babbittRows && babbittRows.length > 0) {
    babbittRows.forEach((p) => {
      console.log(`  ${p.name} (${p.team_abbr} ${p.year}): score=${Number(p.player_score).toFixed(1)}, G=${p.goals}, A=${p.assists}, B=${p.blocks}`);
    });
  } else {
    console.log('  No Babbitt rows found — check name spelling or DB data.');
  }

  // Also show top-10 by blocks (should show a block-heavy player rose)
  console.log('\nTop 10 seasons by blocks in DB (with scores):');
  const { data: topBlockers } = await db
    .from('twelve_oh_players')
    .select('name, team_abbr, year, blocks, goals, assists, player_score')
    .eq('league', 'ufa')
    .order('blocks', { ascending: false })
    .limit(10);

  if (topBlockers) {
    topBlockers.forEach((p, i) => {
      console.log(`  ${i + 1}. ${p.name} (${p.team_abbr} ${p.year}): B=${p.blocks}, G=${p.goals}, A=${p.assists}, score=${Number(p.player_score).toFixed(1)}`);
    });
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('MC failed:', err);
  process.exit(1);
});

/**
 * Tune WIN_CURVE by testing candidate breakpoints against 1M MC sims.
 * Loads all player scores, runs the mechanic, reports distribution.
 * Modify CANDIDATE_CURVE to test different breakpoints.
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
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false }, realtime: { transport: class NoopWS { constructor() { return; } } as any } }
);

// ── CANDIDATE CURVE — modify this to tune ─────────────────────────────────
// Based on actual strength distribution:
// min=56.79, p10=75.9, p50=81.4, p95=87.5, p99.5=90.4, max=95.1
// Target: 7-5≈35%, 8-4≈30%, 9-3≈18%, 10-2≈8.5%, 11-1≈3.5%, 12-0≈0.5%
// Using target band boundaries: 7-5 top=79.8, 8-4 top=82.9, 9-3 top=85.1,
//   10-2 top=86.5, 11-1 top=87.5, 12-0 threshold=90.4
// Breakpoints derived from actual 1M-sim strength distribution:
// min=56.79, p4.5≈74, p39.5≈80.3, p69.5≈83.4, p87.5≈85.8, p96≈87.85, p99.5=90.41
// Midpoint rule: rounding tip between W and W+1 at (breakpoint_W + breakpoint_{W+1})/2
//   6→7 midpoint: (65+83)/2=74.0 at p4.5 ✓
//   7→8 midpoint: (78.6+82)/2=80.3 at p39.5 ✓
//   8→9 midpoint: (82+84.7)/2=83.35 at p69.5 ✓
//   9→10 midpoint: (84.7+86.9)/2=85.8 at p87.5 ✓
//  10→11 midpoint: (86.9+88.8)/2=87.85 at p96 ✓
//  11→12 midpoint: (88.8+92)/2=90.4 at p99.5 ✓
// v2: shift 7→8 midpoint from (78.6+82)/2=80.3 to (78+82)/2=80.0
// to trim 7-5 from 38% toward 35%
const CANDIDATE_CURVE: ReadonlyArray<readonly [number, number]> = [
  [56,    0],   // absolute floor
  [65,    6],   // entry
  [78,    7],   // 7-5 zone — midpoint (78+82)/2=80.0 at ~p37
  [82,    8],   // 8-4 zone
  [84.7,  9],   // 9-3 zone
  [86.9, 10],   // 10-2 zone
  [88.8, 11],   // 11-1 zone
  [92,   12],   // 12-0: top ~0.5%
] as const;

// ── MC constants ──────────────────────────────────────────────────────────
const SKIP_THRESHOLD = 85;
const PICKS = 7;
const N_SIM = 1_000_000;

const TARGETS: Record<number, [number, number]> = {
  12: [0.004, 0.008],
  11: [0.030, 0.040],
  10: [0.080, 0.090],
   9: [0.165, 0.195],
   8: [0.270, 0.330],
   7: [0.320, 0.380],
};

const TARGET_LABELS: Record<number, string> = {
  12: '0.4–0.8%',
  11: '3–4%',
  10: '8–9%',
   9: '~18%',
   8: '~30%',
   7: '~35%',
};

function pwlWins(strength: number, curve: typeof CANDIDATE_CURVE): number {
  if (strength <= curve[0][0]) return curve[0][1];
  const last = curve[curve.length - 1];
  if (strength >= last[0]) return last[1];
  for (let i = 1; i < curve.length; i++) {
    const [x1, y1] = curve[i];
    const [x0, y0] = curve[i - 1];
    if (strength <= x1) {
      const frac = (strength - x0) / (x1 - x0);
      return y0 + frac * (y1 - y0);
    }
  }
  return last[1];
}

function teamStrength(scores: number[]): number {
  const mn = scores.reduce((s, x) => s + x, 0) / scores.length;
  const minS = Math.min(...scores);
  const bonus = minS > 60 ? 0.5 : minS > 45 ? 0.3 : 0;
  return mn + bonus;
}

async function main() {
  console.log('=== WIN_CURVE Tuner ===\n');
  console.log('Candidate curve:');
  for (const [s, w] of CANDIDATE_CURVE) {
    console.log(`  strength=${s} → ${w} wins`);
  }
  console.log();

  const PAGE_SIZE = 1000;
  const allRows: { player_id: string; team_slug: string; year: number; player_score: number }[] = [];
  let pageFrom = 0;
  while (true) {
    const { data: page } = await db
      .from('twelve_oh_players')
      .select('player_id, team_slug, year, player_score')
      .range(pageFrom, pageFrom + PAGE_SIZE - 1);
    if (!page || page.length === 0) break;
    allRows.push(...page as typeof allRows);
    if (page.length < PAGE_SIZE) break;
    pageFrom += PAGE_SIZE;
  }
  console.log(`Fetched ${allRows.length} rows`);

  interface PE { playerId: string; score: number; }
  const teamYearMap = new Map<string, PE[]>();
  for (const r of allRows) {
    const key = `${r.team_slug}:${r.year}`;
    if (!teamYearMap.has(key)) teamYearMap.set(key, []);
    teamYearMap.get(key)!.push({ playerId: String(r.player_id), score: Number(r.player_score) });
  }
  const teamYears: PE[][] = [];
  for (const [, players] of teamYearMap) {
    players.sort((a, b) => b.score - a.score);
    if (players.length >= 7) teamYears.push(players);
  }
  console.log(`${teamYears.length} team-years\n`);

  function bestAvail(ty: PE[], usedIds: Set<string>, tyIdx: number): PE | null {
    for (const p of ty) {
      if (!usedIds.has(`${tyIdx}:${p.playerId}`)) return p;
    }
    return null;
  }

  const nTY = teamYears.length;
  const winCounts = new Int32Array(13);
  const progressStep = N_SIM / 20;
  const allStrengths: number[] = [];

  process.stdout.write('Running sims: ');
  for (let sim = 0; sim < N_SIM; sim++) {
    const teamScores: number[] = [];
    const usedIds = new Set<string>();
    let skipUsed = false;
    for (let pick = 0; pick < PICKS; pick++) {
      let tyIdx = Math.floor(Math.random() * nTY);
      let ty = teamYears[tyIdx];
      const ba = bestAvail(ty, usedIds, tyIdx);
      if (!skipUsed && (ba?.score ?? 0) < SKIP_THRESHOLD) {
        skipUsed = true;
        tyIdx = Math.floor(Math.random() * nTY);
        ty = teamYears[tyIdx];
      }
      const picked = bestAvail(ty, usedIds, tyIdx);
      if (!picked) { teamScores.push(35); } else {
        usedIds.add(`${tyIdx}:${picked.playerId}`);
        teamScores.push(picked.score);
      }
    }
    const strength = teamStrength(teamScores);
    allStrengths.push(strength);
    const wins = Math.round(Math.max(0, Math.min(12, pwlWins(strength, CANDIDATE_CURVE))));
    winCounts[wins]++;
    if (sim % progressStep === 0 && sim > 0) process.stdout.write(`${((sim / N_SIM) * 100).toFixed(0)}% `);
  }
  console.log('done\n');

  // Output actual strength percentiles from 1M sims
  allStrengths.sort((a, b) => a - b);
  const nS = allStrengths.length;
  function sp(pct: number): number {
    const idx = (pct / 100) * (nS - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return allStrengths[lo];
    const frac = idx - lo;
    return allStrengths[lo] * (1 - frac) + allStrengths[hi] * frac;
  }
  console.log('Actual strength distribution (1M sims, ascending):');
  for (const p of [5, 10, 20, 30, 35, 40, 50, 60, 65, 70, 75, 80, 83, 85, 90, 91.5, 95, 97, 98, 98.5, 99, 99.5, 99.7, 99.9]) {
    console.log(`  p${p}: ${sp(p).toFixed(3)}`);
  }
  console.log(`  max: ${allStrengths[nS-1].toFixed(3)}`);
  console.log();

  // Cumulative above each threshold
  console.log('Teams above key thresholds:');
  for (const threshold of [88, 89, 90, 90.5, 91, 91.5, 92, 93]) {
    const count = allStrengths.filter(s => s >= threshold).length;
    console.log(`  strength >= ${threshold}: ${count} (${(count/N_SIM*100).toFixed(3)}%)`);
  }
  console.log();

  console.log('Results vs targets:');
  console.log('  Wins  Count       Pct       Target     Status');
  for (let w = 12; w >= 0; w--) {
    const count = winCounts[w];
    const pct = count / N_SIM;
    const pctStr = (pct * 100).toFixed(3) + '%';
    const range = TARGETS[w];
    const tLabel = TARGET_LABELS[w] ?? '—';
    let status = '';
    if (range) {
      if (pct >= range[0] && pct <= range[1]) status = 'OK ✓';
      else if (pct < range[0]) status = `LOW (min ${(range[0]*100).toFixed(1)}%)`;
      else status = `HIGH (max ${(range[1]*100).toFixed(1)}%)`;
    }
    console.log(`   ${String(w).padStart(2)}  ${String(count).padStart(10)}  ${pctStr.padStart(8)}  ${tLabel.padEnd(10)} ${status}`);
  }
}

main().catch(console.error);

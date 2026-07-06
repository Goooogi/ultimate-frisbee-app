/**
 * Derive + verify a per-league 12-0 WIN_CURVE (PUL / WUL).
 * ─────────────────────────────────────────────────────────────────────────────
 * Scores are percentile-normalized identically in every league, but the
 * spin+best-pick strength distribution still shifts with roster size and pool
 * structure, so each league gets its own curve (leagues.ts).
 *
 * METHOD (same rounding-tip approach as the UFA v4/v5 curves — see rating.ts):
 *   1. MC-sim the real mechanic (7 picks, spin random team-year, take best
 *      available, one skip when best < 85) over the league's live pool.
 *   2. From the strength distribution, place each win transition's "rounding
 *      tip" (where round(pwlWins) crosses w→w+1, i.e. pwl = w+0.5) at the
 *      strength quantile matching the target cumulative odds.
 *   3. Chain breakpoints downward from bp_12 (midpoint rule: adjacent
 *      breakpoints differ by 1 win, so the tip is their midpoint).
 *   4. Re-sim with the derived curve and print the verified distribution.
 *
 * TARGET ODDS — the UFA v5 game feel (rating.ts WIN_CURVE comment):
 *   12-0≈2.2%, 11-1≈4.3%, 10-2≈11%, 9-3≈21.5%, 8-4≈27.7%, 7-5≈24.7%, 6-6≈7.9%
 *
 * USAGE:
 *   npx tsx scripts/tune-twelve-oh-league-curve.ts <pul|wul>
 *
 * Paste the printed curve into src/lib/twelve-oh/leagues.ts.
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
import { teamRecord, type WinCurve } from '../src/lib/twelve-oh/rating.js';

const league = process.argv[2];
if (league !== 'pul' && league !== 'wul') {
  console.error('Usage: npx tsx scripts/tune-twelve-oh-league-curve.ts <pul|wul>');
  process.exit(1);
}

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  (process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY)!,
  { auth: { persistSession: false } },
);

// ── Constants ───────────────────────────────────────────────────────────────

const PICKS_PER_TEAM = 7;
const SKIP_THRESHOLD = 85;
const N_SIM = 500_000;
const MIN_ROSTER = 7;

/** Target cumulative odds P(wins ≥ w) — UFA v5 game feel. */
const TARGET_CUM: ReadonlyArray<readonly [number, number]> = [
  [12, 0.022],
  [11, 0.065],
  [10, 0.175],
  [9, 0.39],
  [8, 0.667],
  [7, 0.914],
  [6, 0.993],
];

// ── Pool + mechanic ─────────────────────────────────────────────────────────

interface PlayerEntry { playerId: string; score: number }

async function fetchPool(): Promise<PlayerEntry[][]> {
  const PAGE = 1000;
  const rows: { player_id: string; team_slug: string; year: number; player_score: number }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('twelve_oh_players')
      .select('player_id, team_slug, year, player_score')
      .eq('league', league)
      .order('player_id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data as typeof rows));
    if (!data || data.length < PAGE) break;
  }

  const map = new Map<string, PlayerEntry[]>();
  for (const r of rows) {
    const key = `${r.team_slug}:${r.year}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push({ playerId: String(r.player_id), score: Number(r.player_score) });
  }
  const pool: PlayerEntry[][] = [];
  for (const [, players] of map) {
    players.sort((a, b) => b.score - a.score);
    if (players.length >= MIN_ROSTER) pool.push(players);
  }
  return pool;
}

function simStrengths(pool: PlayerEntry[][], n: number): Float64Array {
  const strengths = new Float64Array(n);
  const nTY = pool.length;

  for (let sim = 0; sim < n; sim++) {
    const scores: number[] = [];
    const used = new Set<string>();
    let skipUsed = false;

    for (let pick = 0; pick < PICKS_PER_TEAM; pick++) {
      let tyIdx = Math.floor(Math.random() * nTY);
      let ty = pool[tyIdx];
      let best = ty.find((p) => !used.has(`${tyIdx}:${p.playerId}`));

      if (!skipUsed && (best?.score ?? 0) < SKIP_THRESHOLD) {
        skipUsed = true;
        tyIdx = Math.floor(Math.random() * nTY);
        ty = pool[tyIdx];
        best = ty.find((p) => !used.has(`${tyIdx}:${p.playerId}`));
      }

      if (best) {
        used.add(`${tyIdx}:${best.playerId}`);
        scores.push(best.score);
      } else {
        scores.push(20 + Math.random() * 40); // degenerate, extremely rare
      }
    }

    // Same strength formula as teamRecord: mean + balance bonus.
    const mean = scores.reduce((s, x) => s + x, 0) / scores.length;
    const min = Math.min(...scores);
    strengths[sim] = mean + (min > 72 ? 0.5 : min > 58 ? 0.3 : 0);
  }
  return strengths;
}

function quantile(sorted: Float64Array, p: number): number {
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo]);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`=== 12-0 ${league.toUpperCase()} win-curve tuner ===\n`);
  const pool = await fetchPool();
  console.log(`Team-years with ≥${MIN_ROSTER} players: ${pool.length}`);

  console.log(`Simulating ${N_SIM.toLocaleString()} builds…`);
  const strengths = simStrengths(pool, N_SIM);
  const sorted = Float64Array.from(strengths).sort();

  console.log('Strength distribution:');
  for (const p of [0, 0.1, 0.5, 0.9, 0.95, 0.99, 0.995, 1]) {
    console.log(`  p${(p * 100).toFixed(1).padStart(5)}: ${quantile(sorted, p).toFixed(2)}`);
  }

  // Derive breakpoints: tip(w→w+1) = strength quantile at P(wins ≥ w+1),
  // then chain from bp_12 downward (midpoint rule).
  const tip: Record<number, number> = {};
  for (const [w, cum] of TARGET_CUM) {
    tip[w - 1] = quantile(sorted, 1 - cum); // tip into w
  }
  // Anchor bp_12 at the middle of the target ≥12 mass, then chain down.
  const bp: Record<number, number> = {};
  bp[12] = quantile(sorted, 1 - 0.022 / 2);
  for (let w = 11; w >= 5; w--) {
    bp[w] = 2 * tip[w] - bp[w + 1];
  }
  // Monotonicity guard (low-end chain can fold on tight distributions).
  for (let w = 11; w >= 5; w--) {
    if (bp[w] >= bp[w + 1]) bp[w] = bp[w + 1] - 0.5;
  }

  const curve: WinCurve = [
    [40, 0],
    [Math.min(quantile(sorted, 0.001), bp[5] - 4), 2],
    ...( [5, 6, 7, 8, 9, 10, 11, 12] as const).map(
      (w) => [Number(bp[w].toFixed(2)), w] as const,
    ),
  ];

  // Verify with a fresh sim through the real teamRecord().
  console.log('\nVerifying derived curve with a fresh sim…');
  const verify = simStrengths(pool, N_SIM);
  const winCounts = new Int32Array(13);
  for (let i = 0; i < verify.length; i++) {
    // strength already includes the balance bonus; teamRecord expects raw
    // scores, so interpolate directly here instead.
    winCounts[winsFromCurve(verify[i], curve)]++;
  }
  console.log('\n  Wins  Pct       Target');
  const targetPct: Record<number, string> = {
    12: '2.2%', 11: '4.3%', 10: '11%', 9: '21.5%', 8: '27.7%', 7: '24.7%', 6: '7.9%',
  };
  for (let w = 12; w >= 4; w--) {
    const pct = ((winCounts[w] / N_SIM) * 100).toFixed(2) + '%';
    console.log(`   ${String(w).padStart(2)}  ${pct.padStart(8)}  ${targetPct[w] ?? '—'}`);
  }

  const lines = curve.map(([s, w]) => `  [${s}, ${w}],`).join('\n');
  console.log(`\n── Paste into src/lib/twelve-oh/leagues.ts ──`);
  console.log(`export const ${league.toUpperCase()}_WIN_CURVE: WinCurve = [\n${lines}\n];`);

  // Sanity: is 12-0 reachable at all from this pool's best 7?
  const allScores = pool.flat().map((p) => p.score).sort((a, b) => b - a);
  const top7 = allScores.slice(0, 7);
  const top7Record = teamRecord(top7, curve);
  console.log(
    `\nBest-possible 7 (scores ${top7.map((s) => s.toFixed(0)).join(', ')}) → ` +
    `${top7Record.wins}-${top7Record.losses}`,
  );
}

function winsFromCurve(strength: number, curve: WinCurve): number {
  if (strength <= curve[0][0]) return curve[0][1];
  const last = curve[curve.length - 1];
  if (strength >= last[0]) return Math.round(last[1]);
  for (let i = 1; i < curve.length; i++) {
    if (strength <= curve[i][0]) {
      const [x0, y0] = curve[i - 1];
      const [x1, y1] = curve[i];
      return Math.round(y0 + ((strength - x0) / (x1 - x0)) * (y1 - y0));
    }
  }
  return Math.round(last[1]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

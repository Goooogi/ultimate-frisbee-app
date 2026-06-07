/**
 * Analyze team strength distribution under the realistic spin+1-skip mechanic.
 * Used to calibrate WIN_CURVE breakpoints after a re-backfill.
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

const SKIP_THRESHOLD = 85;
const PICKS = 7;
const N_SIM = 1_000_000;

async function main() {
  // Paginate all rows
  const PAGE_SIZE = 1000;
  const allRows: { player_id: string; team_slug: string; year: number; player_score: number }[] = [];
  let pageFrom = 0;
  while (true) {
    const { data: page } = await db
      .from('twelve_oh_players')
      .select('player_id, team_slug, year, player_score')
      .order('player_score', { ascending: false })
      .range(pageFrom, pageFrom + PAGE_SIZE - 1);
    if (!page || page.length === 0) break;
    allRows.push(...page as typeof allRows);
    if (page.length < PAGE_SIZE) break;
    pageFrom += PAGE_SIZE;
  }
  console.log(`Fetched ${allRows.length} rows`);

  // Build team-year map
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

  // Simulate and collect team strengths (mean + balance bonus)
  function balanceBonus(minScore: number): number {
    if (minScore > 60) return 0.5;
    if (minScore > 45) return 0.3;
    return 0;
  }

  function bestAvail(ty: PE[], usedIds: Set<string>, tyIdx: number): PE | null {
    for (const p of ty) {
      if (!usedIds.has(`${tyIdx}:${p.playerId}`)) return p;
    }
    return null;
  }

  const nTY = teamYears.length;
  const strengths: number[] = [];

  for (let sim = 0; sim < N_SIM; sim++) {
    const teamScores: number[] = [];
    const usedIds = new Set<string>();
    let skipUsed = false;

    for (let pick = 0; pick < PICKS; pick++) {
      let tyIdx = Math.floor(Math.random() * nTY);
      let ty = teamYears[tyIdx];
      const ba = bestAvail(ty, usedIds, tyIdx);
      const bestScore = ba?.score ?? 0;
      if (!skipUsed && bestScore < SKIP_THRESHOLD) {
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

    const mn = teamScores.reduce((s, x) => s + x, 0) / teamScores.length;
    const minS = Math.min(...teamScores);
    strengths.push(mn + balanceBonus(minS));
  }

  strengths.sort((a, b) => a - b);

  function pct(sorted: number[], p: number): number {
    const idx = (p / 100) * (sorted.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] * (idx - lo > 0 ? 0 : 1) + sorted[hi] * (idx - lo);
  }

  console.log('Team strength distribution (mean+bonus) over 1M sims:');
  for (const p of [5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 97, 98, 99, 99.5, 99.9]) {
    console.log(`  p${p}: ${pct(strengths, p).toFixed(2)}`);
  }
  console.log(`  max: ${strengths[strengths.length - 1].toFixed(2)}`);
  console.log(`  min: ${strengths[0].toFixed(2)}`);
  console.log();

  // For each target win%, what strength cutoff does it map to?
  // 12-0 @ 0.5% means the top 0.5% of teams should get 12 wins.
  // → strength at p99.5 = the threshold for 12 wins
  const targets: [number, number][] = [
    [0.5,  12],
    [3.5,  11],
    [8.5,  10],
    [18.0,  9],
    [30.0,  8],
    [35.0,  7],
  ];

  console.log('Implied WIN_CURVE breakpoints (strength → wins) for target odds:');
  console.log('  (using cumulative from top — p99.5 → 12-0 means top 0.5% get 12 wins)');
  let cumPct = 0;
  for (const [targetPct, wins] of targets) {
    const bandTop = cumPct;
    cumPct += targetPct;
    const midPct = bandTop + targetPct / 2;
    const strengthAtMid = pct(strengths, 100 - midPct);
    const strengthAtBandTop = bandTop === 0 ? strengths[strengths.length - 1] : pct(strengths, 100 - bandTop);
    const strengthAtBandBot = pct(strengths, 100 - cumPct);
    console.log(`  wins=${wins}: target ${targetPct}% → band strength ${strengthAtBandBot.toFixed(1)}–${strengthAtBandTop.toFixed(1)}, midpoint ${strengthAtMid.toFixed(1)}`);
  }
}

main().catch(console.error);

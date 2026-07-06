/**
 * Quick strength histogram — find the actual distribution of team strengths
 * under the spin+1-skip mechanic so we can calibrate WIN_CURVE.
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
const N_SIM = 200_000;

async function main() {
  const PAGE_SIZE = 1000;
  const allRows: { player_id: string; team_slug: string; year: number; player_score: number }[] = [];
  let pageFrom = 0;
  while (true) {
    const { data: page } = await db
      .from('twelve_oh_players')
      .select('player_id, team_slug, year, player_score')
      .eq('league', 'ufa')
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
  const strengths: number[] = [];

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
    const mn = teamScores.reduce((s, x) => s + x, 0) / teamScores.length;
    const minS = Math.min(...teamScores);
    const bonus = minS > 60 ? 0.5 : minS > 45 ? 0.3 : 0;
    strengths.push(mn + bonus);
  }

  strengths.sort((a, b) => a - b);
  const n = strengths.length;

  function p(pct: number): number {
    const idx = (pct / 100) * (n - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return strengths[lo];
    const frac = idx - lo;
    return strengths[lo] * (1 - frac) + strengths[hi] * frac;
  }

  console.log(`Strength distribution over ${N_SIM.toLocaleString()} sims (sorted ascending):`);
  console.log(`  min:   ${p(0).toFixed(2)}`);
  console.log(`  p10:   ${p(10).toFixed(2)}`);
  console.log(`  p20:   ${p(20).toFixed(2)}`);
  console.log(`  p30:   ${p(30).toFixed(2)}`);
  console.log(`  p40:   ${p(40).toFixed(2)}`);
  console.log(`  p50:   ${p(50).toFixed(2)}  ← median team`);
  console.log(`  p60:   ${p(60).toFixed(2)}`);
  console.log(`  p65:   ${p(65).toFixed(2)}`);
  console.log(`  p70:   ${p(70).toFixed(2)}`);
  console.log(`  p75:   ${p(75).toFixed(2)}`);
  console.log(`  p80:   ${p(80).toFixed(2)}`);
  console.log(`  p85:   ${p(85).toFixed(2)}`);
  console.log(`  p90:   ${p(90).toFixed(2)}`);
  console.log(`  p95:   ${p(95).toFixed(2)}`);
  console.log(`  p97:   ${p(97).toFixed(2)}`);
  console.log(`  p98:   ${p(98).toFixed(2)}`);
  console.log(`  p99:   ${p(99).toFixed(2)}`);
  console.log(`  p99.5: ${p(99.5).toFixed(2)}`);
  console.log(`  max:   ${p(100).toFixed(2)}`);
  console.log();

  // Cumulative breakdown: what % of teams fall in each record-target bucket
  // 7-5 target 35% = p0..p35 (bottom 35%), 8-4 30% = p35..p65, etc.
  // from BOTTOM: 7-5=35%, 8-4=30%, 9-3=18%, 10-2=8.5%, 11-1=3.5%, 12-0=0.5%
  // from BOTTOM cumulative: 7-5 = p0-35, 8-4 = p35-65, 9-3=p65-83, 10-2=p83-91.5, 11-1=p91.5-95, 12-0=p99.5+
  // Remaining 5% = misc records below 7-5 or above 12-0
  console.log('Target band boundaries for win curve:');
  console.log(`  7-5 top boundary (p35):        ${p(35).toFixed(2)}`);
  console.log(`  8-4 top boundary (p65):        ${p(65).toFixed(2)}`);
  console.log(`  9-3 top boundary (p83):        ${p(83).toFixed(2)}`);
  console.log(`  10-2 top boundary (p91.5):     ${p(91.5).toFixed(2)}`);
  console.log(`  11-1 top boundary (p95):       ${p(95).toFixed(2)}`);
  console.log(`  12-0 threshold (p99.5):        ${p(99.5).toFixed(2)}`);
  console.log();
  console.log('Implied breakpoints (each record maps to the midpoint of its band):');
  console.log(`  strength=${p(17.5).toFixed(1)} → 7 wins  (band p0-35, mid p17.5)`);
  console.log(`  strength=${p(50).toFixed(1)} → 8 wins  (band p35-65, mid p50)`);
  console.log(`  strength=${p(74).toFixed(1)} → 9 wins  (band p65-83, mid p74)`);
  console.log(`  strength=${p(87.25).toFixed(1)} → 10 wins (band p83-91.5, mid p87.25)`);
  console.log(`  strength=${p(93.25).toFixed(1)} → 11 wins (band p91.5-95, mid p93.25)`);
  console.log(`  strength=${p(99.75).toFixed(1)} → 12 wins (top 0.5%, mid p99.75)`);
}

main().catch(console.error);

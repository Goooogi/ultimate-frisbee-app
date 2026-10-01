/**
 * 12-0 + UTCG season-add orchestrator
 * ─────────────────────────────────────────────────────────────────────────────
 * After each league's championship, add that season's player cards to
 * twelve_oh_players — scored against the league's FROZEN baseline so existing
 * ratings (and owned UTCG card tiers) never move — then refresh the UTCG card
 * pool + Champion/Finalist boosts. Run MANUALLY after each league's
 * championship (WUL/PUL ~late June, UFA ~September); safe to run any time —
 * a season already present, or not yet finished, is skipped.
 *
 * A league's current-year season is DONE when all of:
 *   - today ≥ the league's earliest plausible season end (EARLIEST_END)
 *   - its last game is ≥ SETTLE_DAYS old (stat corrections land first)
 *   - twelve_oh_players has no rows for (league, year)
 *
 * USAGE (repo root):
 *   npx tsx scripts/add-new-seasons.ts                     # auto: every league
 *   npx tsx scripts/add-new-seasons.ts --league ufa --season 2026 [--dry-run]
 *
 * ENV: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY).
 *
 * Not automated: re-tuning the 12-0 win curves (tuner output is code
 * constants) — the run prints a reminder when it adds a season.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { spawnSync } from 'child_process';

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

type League = 'ufa' | 'pul' | 'wul';

interface LeagueConfig {
  league: League;
  gamesTable: string;
  seasonCol: string;
  dateCol: string;
  /** MM-DD — no championship is decided before this date. */
  earliestEnd: string;
}

const LEAGUES: LeagueConfig[] = [
  { league: 'wul', gamesTable: 'wul_games', seasonCol: 'season', dateCol: 'game_date', earliestEnd: '06-20' },
  { league: 'pul', gamesTable: 'pul_games', seasonCol: 'season', dateCol: 'game_date', earliestEnd: '07-01' },
  { league: 'ufa', gamesTable: 'ufa_games', seasonCol: 'year', dateCol: 'start_timestamp', earliestEnd: '09-01' },
];

const SETTLE_DAYS = 14;

const arg = (name: string): string | null => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] ?? null : null;
};
const ONLY_LEAGUE = arg('--league') as League | null;
const FORCE_SEASON = arg('--season') ? Number(arg('--season')) : null;
const DRY_RUN = process.argv.includes('--dry-run');

if (ONLY_LEAGUE && !LEAGUES.some((l) => l.league === ONLY_LEAGUE)) {
  console.error('--league must be ufa, pul or wul');
  process.exit(1);
}
if (FORCE_SEASON !== null && (!ONLY_LEAGUE || !Number.isInteger(FORCE_SEASON))) {
  console.error('--season needs --league and a 4-digit year');
  process.exit(1);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function seasonDone(cfg: LeagueConfig, year: number, today: Date): Promise<string | null> {
  if (today < new Date(`${year}-${cfg.earliestEnd}T00:00:00Z`)) return `before ${cfg.earliestEnd}`;

  const { data: last, error } = await db
    .from(cfg.gamesTable)
    .select(cfg.dateCol)
    .eq(cfg.seasonCol, year)
    .order(cfg.dateCol, { ascending: false })
    .limit(1);
  if (error) throw error;
  const lastDate = (last?.[0] as unknown as Record<string, string> | undefined)?.[cfg.dateCol];
  if (!lastDate) return 'no games';
  const settled = new Date(new Date(lastDate).getTime() + SETTLE_DAYS * 86_400_000);
  if (today < settled) return `last game ${lastDate.slice(0, 10)}, settling until ${settled.toISOString().slice(0, 10)}`;

  const { count, error: cErr } = await db
    .from('twelve_oh_players')
    .select('player_id', { count: 'exact', head: true })
    .eq('league', cfg.league)
    .eq('year', year);
  if (cErr) throw cErr;
  if ((count ?? 0) > 0) return `already has ${count} cards`;
  return null;
}

function addSeason(league: League, year: number): void {
  const args =
    league === 'ufa'
      ? ['--yes', 'tsx@4', 'scripts/backfill-twelve-oh.ts', '--season', String(year)]
      : ['--yes', 'tsx@4', 'scripts/backfill-twelve-oh-league.ts', league, '--season', String(year)];
  if (DRY_RUN) args.push('--dry-run');
  const res = spawnSync('npx', args, { stdio: 'inherit' });
  if (res.status !== 0) throw new Error(`${league} ${year} season add failed (exit ${res.status})`);
}

async function main(): Promise<void> {
  const today = new Date();
  const added: string[] = [];

  for (const cfg of LEAGUES) {
    if (ONLY_LEAGUE && cfg.league !== ONLY_LEAGUE) continue;
    const year = FORCE_SEASON ?? today.getUTCFullYear();
    if (FORCE_SEASON === null) {
      const notYet = await seasonDone(cfg, year, today);
      if (notYet) {
        console.log(`${cfg.league} ${year}: skip (${notYet})`);
        continue;
      }
    }
    console.log(`\n${cfg.league} ${year}: adding season${DRY_RUN ? ' (dry run)' : ''}…`);
    addSeason(cfg.league, year);
    added.push(`${cfg.league} ${year}`);
  }

  if (!DRY_RUN && added.some((a) => a.startsWith('ufa'))) {
    const { error } = await db.rpc('refresh_utcg_card_pool');
    if (error) throw error;
    console.log('\nUTCG card pool + Champion/Finalist boosts refreshed.');
  }
  if (!DRY_RUN && added.length > 0) {
    console.log(
      `\nAdded: ${added.join(', ')}. Reminder: re-run the 12-0 win-curve tuner ` +
      '(scripts/tune-twelve-oh-league-curve.ts) and paste the curves.',
    );
  }
  if (added.length === 0) console.log('\nNothing to add.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

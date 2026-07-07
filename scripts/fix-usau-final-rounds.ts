/**
 * Fix mis-classified championship finals in usau_games
 * ─────────────────────────────────────────────────────────────────────────────
 * USAU labels the title game "First Place" (stage) inside a "1st Place"
 * bracket — the ultirzr ingest's old classifyRound only knew the word
 * "final", so every ultirzr-ingested title game landed as round='other'.
 * Result: ~190 events (club regionals, masters, GM, college) with a
 * 1st-place bracket but no round='final' game → no champion banner, no
 * final column in the bracket tree. (The classifier is fixed as of
 * 2026-07-07; this script repairs the historical rows.)
 *
 * PROMOTION RULES (conservative — only promote what we can prove):
 *   1. Semi-winners rule: within one (event_id, bracket_name) 1st-place
 *      group, an 'other'-round game whose BOTH teams are winners of that
 *      group's completed semis is the title game. Team-based matching keeps
 *      this safe even when two genders share a bracket_name (a Men's title
 *      game can never pair two Women's semi winners).
 *   2. Lone-game rule: a 1st-place group with NO semis and exactly ONE game
 *      (round='other') is a single-game final.
 *   Anything else (e.g. "Round 1" games inside the champ bracket, groups
 *   with unfinished semis) is left untouched and logged.
 *
 * IDEMPOTENT: re-running finds no remaining candidates (matched games are
 * already round='final').
 *
 * USAGE (from repo root):  npx tsx scripts/fix-usau-final-rounds.ts [--dry-run]
 * ENV: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEY
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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const DRY_RUN = process.argv.includes('--dry-run');

interface GameRow {
  id: string;
  event_id: string;
  bracket_name: string | null;
  round: string;
  status: string;
  team_a_id: string | null;
  team_b_id: string | null;
  score_a: number | null;
  score_b: number | null;
  scheduled_at: string | null;
}

/** Page through all games in 1st-place-named brackets (PostgREST caps a
 *  single response at 1000 rows — never trust an unbounded select). */
async function loadFirstPlaceGames(): Promise<GameRow[]> {
  const PAGE = 1000;
  const rows: GameRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('usau_games')
      .select('id, event_id, bracket_name, round, status, team_a_id, team_b_id, score_a, score_b, scheduled_at')
      .or('bracket_name.ilike.%1st place%,bracket_name.ilike.%first place%')
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as GameRow[]));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

function winnerOf(g: GameRow): string | null {
  if (g.status !== 'final' || g.score_a == null || g.score_b == null) return null;
  if (g.score_a === g.score_b) return null;
  return g.score_a > g.score_b ? g.team_a_id : g.team_b_id;
}

async function main() {
  const games = await loadFirstPlaceGames();
  console.log(`Loaded ${games.length} games in 1st-place brackets`);

  // Group by (event, bracket)
  const groups = new Map<string, GameRow[]>();
  for (const g of games) {
    const k = `${g.event_id}::${g.bracket_name ?? ''}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(g);
  }

  const promoteIds: string[] = [];
  let groupsWithFinal = 0;
  let promotedBySemis = 0;
  let promotedLone = 0;
  let skippedAmbiguous = 0;

  for (const [, gs] of groups) {
    if (gs.some((g) => g.round === 'final')) {
      groupsWithFinal++;
      continue;
    }
    const semis = gs.filter((g) => g.round === 'semi');
    const others = gs.filter((g) => g.round === 'other');

    if (semis.length > 0) {
      const semiWinners = new Set(semis.map(winnerOf).filter((x): x is string => !!x));
      const matches = others.filter(
        (g) =>
          g.team_a_id && g.team_b_id &&
          semiWinners.has(g.team_a_id) && semiWinners.has(g.team_b_id),
      );
      if (matches.length >= 1) {
        // Multiple matches can only happen with 4+ semis (two genders sharing
        // a bracket name) — each match is that gender's title game.
        promoteIds.push(...matches.map((g) => g.id));
        promotedBySemis += matches.length;
      } else if (others.length > 0) {
        skippedAmbiguous++;
      }
    } else if (gs.length === 1 && others.length === 1) {
      promoteIds.push(others[0].id);
      promotedLone++;
    } else if (others.length > 0) {
      skippedAmbiguous++;
    }
  }

  console.log(`Groups already having a final: ${groupsWithFinal}`);
  console.log(`Promote via semi-winners rule: ${promotedBySemis}`);
  console.log(`Promote via lone-game rule:    ${promotedLone}`);
  console.log(`Groups skipped (ambiguous):    ${skippedAmbiguous}`);
  console.log(`Total games to promote:        ${promoteIds.length}`);

  if (DRY_RUN) {
    console.log('[dry-run] no writes performed');
    return;
  }

  // Update in chunks (avoid URL-length blowups on huge .in() lists)
  const CHUNK = 100;
  let updated = 0;
  for (let i = 0; i < promoteIds.length; i += CHUNK) {
    const slice = promoteIds.slice(i, i + CHUNK);
    const { error, count } = await db
      .from('usau_games')
      .update({ round: 'final' }, { count: 'exact' })
      .in('id', slice);
    if (error) throw error;
    updated += count ?? slice.length;
  }
  console.log(`Updated ${updated} games → round='final'`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

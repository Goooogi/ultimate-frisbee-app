/**
 * Backfill last weekend's stale/duplicated club finals
 * ─────────────────────────────────────────────────────────────────────────────
 * Context: events that ended BEFORE the new 2-day trailing sync-live-events
 * window existed lost their late-reported (Sunday-evening) finals, and several
 * also carry dual-pipeline duplicate rows (HTML sync-event-details rows keyed
 * on an encrypted usau_game_id, PLUS ultirzr rows keyed on a numeric id — the
 * two never dedupe against each other). See the "dual-pipeline game IDs" note.
 *
 * This script, for a hand-picked list of affected events:
 *   1. Re-fetches the COMPLETE event tree from ultirzr by EventId and upserts
 *      every game (same logic the ingest edge fn uses: numeric usau_event_game_id
 *      key, group-prefixed bracket names, First-Place→final classification).
 *   2. AFTER a successful ultirzr upsert that produced a completed championship
 *      final, deletes the event's stale HTML rows (usau_game_id IS NOT NULL).
 *      The delete is GATED on the ultirzr set being complete — if no completed
 *      champ final exists post-ingest, the HTML rows are LEFT ALONE and the
 *      event is flagged for manual review (never lose data to a bad clean-up).
 *
 * This is a one-off operator cleanup (NOT a cron) for a known, bounded list.
 * The permanent fix is the widened sync-live-events window (already deployed).
 *
 * USAGE (from repo root):  npx tsx scripts/backfill-last-weekend-finals.ts [--dry-run]
 * ENV: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEY
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

function loadDotEnv(file: string): void {
  const p = resolve(process.cwd(), file);
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[k]) process.env[k] = v;
  }
}
loadDotEnv('.env.local');
loadDotEnv('.env');

import { createClient } from '@supabase/supabase-js';

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
if (!SUPA_URL || !KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const db = createClient(SUPA_URL, KEY, { auth: { persistSession: false } });
const DRY = process.argv.includes('--dry-run');

// The affected events, by our usau_slug. Diagnosed 2026-07-07 (stale champ
// finals and/or duplicate finals from the dual-pipeline overlap).
const SLUGS = [
  'eugene-summer-solstice-2026',
  'Summer-Bash-2026',
  '2026-antlerlock',
  '2026-pro-elite-challenge-east',
  'club-terminus-2026',
  'motown-throwdown-2026',
];

// The edge function owns the canonical ingest. Rather than duplicate its ~700
// lines here, we drive it: it already re-fetches by search and upserts. We call
// it per (division, page) but ONLY for the pages our target events sit on. To
// keep it simple and avoid re-walking hundreds of unrelated events, we instead
// invoke the deployed function with an explicit eventId list is NOT supported —
// so we re-ingest via the smallest page span that covers our targets per div.
//
// Simpler + safer: call the deployed ingest for each club division across the
// page(s) containing our targets. We discover the page per target first.

const ULTIRZR = 'https://www.ultirzr.app/api/v1';
const DIVISIONS: Array<{ label: string; api: string }> = [
  { label: 'Club - Men', api: 'mens-club' },
  { label: 'Club - Women', api: 'womens-club' },
  { label: 'Club - Mixed', api: 'mixed-club' },
];

async function ultirzrSearchPageFor(year: number, divisionLabel: string, targetNames: Set<string>): Promise<Set<number>> {
  const pages = new Set<number>();
  const first = await fetch(`${ULTIRZR}/events/search?year=${year}&division=${encodeURIComponent(divisionLabel)}&page=1`, { headers: { Accept: 'application/json' } }).then((r) => r.json());
  const totalPages = first.pages ?? 1;
  for (let p = 1; p <= totalPages; p++) {
    const data = p === 1 ? first : await fetch(`${ULTIRZR}/events/search?year=${year}&division=${encodeURIComponent(divisionLabel)}&page=${p}`, { headers: { Accept: 'application/json' } }).then((r) => r.json());
    for (const h of data.hits ?? []) {
      if (targetNames.has(String(h.EventName).toLowerCase())) pages.add(p);
    }
    await new Promise((r) => setTimeout(r, 400)); // polite
  }
  return pages;
}

async function invokeIngest(year: number, apiDiv: string, page: number): Promise<{ games: number }> {
  const res = await fetch(`${SUPA_URL}/functions/v1/ingest-from-ultirzr`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ year, division: apiDiv, page, maxPages: 1 }),
  });
  const j = await res.json();
  return { games: j?.result?.games ?? 0 };
}

async function main() {
  // Resolve our target events + their ultirzr event names.
  const { data: events } = await db
    .from('usau_events')
    .select('id, usau_slug, name')
    .in('usau_slug', SLUGS);
  const targets = events ?? [];
  console.log(`Targets: ${targets.length} events`);
  const targetNames = new Set(targets.map((e) => e.name.toLowerCase()));

  const YEAR = 2026;

  // 1. Re-ingest: for each division, find the pages holding our targets and
  //    ingest just those pages (idempotent upsert; touches other events on the
  //    same page too, but harmlessly re-writes identical rows).
  if (!DRY) {
    for (const div of DIVISIONS) {
      const pages = await ultirzrSearchPageFor(YEAR, div.label, targetNames);
      for (const p of pages) {
        const { games } = await invokeIngest(YEAR, div.api, p);
        console.log(`  ingest ${div.api} page ${p}: ${games} games`);
        await new Promise((r) => setTimeout(r, 800));
      }
    }
  } else {
    console.log('[dry-run] skipping re-ingest');
  }

  // 2. Per event: verify the ultirzr set now has a completed championship final,
  //    and only THEN delete stale HTML rows. Otherwise leave + flag.
  for (const e of targets) {
    const { count: ultirzrFinal } = await db
      .from('usau_games')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', e.id)
      .is('usau_game_id', null)
      .eq('round', 'final')
      .eq('status', 'final')
      .or('bracket_name.ilike.%championship%,bracket_name.ilike.%1st%,bracket_name.ilike.%sunday%,bracket_name.ilike.%first place%');

    const { count: htmlRows } = await db
      .from('usau_games')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', e.id)
      .not('usau_game_id', 'is', null);

    if ((ultirzrFinal ?? 0) >= 1) {
      if (DRY) {
        console.log(`  [dry-run] ${e.usau_slug}: would delete ${htmlRows} stale HTML rows (ultirzr final present)`);
      } else if ((htmlRows ?? 0) > 0) {
        const { error } = await db.from('usau_games').delete().eq('event_id', e.id).not('usau_game_id', 'is', null);
        if (error) { console.error(`  ${e.usau_slug}: delete failed: ${error.message}`); continue; }
        console.log(`  ${e.usau_slug}: deleted ${htmlRows} stale HTML rows ✓`);
      } else {
        console.log(`  ${e.usau_slug}: clean (no HTML rows) ✓`);
      }
    } else {
      console.log(`  ⚠ ${e.usau_slug}: ultirzr set still has NO completed champ final — LEFT HTML rows intact, needs manual review`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

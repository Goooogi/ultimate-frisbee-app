/**
 * PUL Backfill — v3  (Phase 1: manual island-JSON multi-season rewrite)
 * ─────────────────────────────────────────────────────────────────────────────
 * Seeds pul_teams (13 teams + R2 logo probes + accent_color) and upserts
 * pul_players across ALL embedded seasons (2023–2026) by parsing the Astro
 * island JSON from the per-team stats pages.
 *
 * DATA SOURCE:
 *   https://pul-stats-hub.pages.dev/teams/{DisplayName}/?season=2026
 *   One static Astro page (~550 KB) per team. The ?season= param is IGNORED
 *   server-side — the HTML always embeds every season. ONE fetch per team
 *   yields all history. Parse logic lives in scripts/lib/pul-scrape.ts.
 *
 * ISLAND PAIRING (see pul-scrape.ts for full explanation):
 *   Each per-season roster island is immediately followed by a config island
 *   that carries the season year. Islands with "seasons"/"seasonsList" are
 *   the all-time island — skipped.
 *
 * STALE-ROW STRATEGY (per-team, per scraped-season):
 *   Before inserting fresh rows we DELETE existing pul_players rows for
 *   (team_id, season IN <scraped_seasons>). This keeps re-runs idempotent
 *   without wiping seasons we didn't scrape (e.g. a later expansion team
 *   that appears mid-season). A failure mid-loop only affects that team;
 *   re-running the script recovers cleanly.
 *
 * STAT KEY AVAILABILITY:
 *   2026/2025/2024: goals, assists, blocks, turnovers, touches, gamesPlayed,
 *                   offensePoints→o_points, defensePoints→d_points, +/-→plus_minus,
 *                   pronouns (when present), _accentColor
 *   2023:           goals, assists, blocks, turnovers, touches, gamesPlayed,
 *                   +/-→plus_minus, _accentColor
 *                   (o_points/d_points stored as 0; no pronouns in island)
 *
 * USAGE (run from repo root):
 *   npx tsx scripts/backfill-pul.ts
 *
 * REQUIRED ENV VARS:
 *   NEXT_PUBLIC_SUPABASE_URL  — project URL
 *   SUPABASE_SECRET_KEY       — service role key (bypasses RLS for writes)
 *
 * IDEMPOTENT: safe to re-run. Each (team × scraped seasons) is delete-then-insert.
 * NOT a cron — manual invocation only. Phase 2 will add the edge function + cron.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// ─── dotenv loader (Node-only; not in the shared lib) ─────────────────────────

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
import { parseTeamPage } from './lib/pul-scrape.js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    'Missing env vars. Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env / .env.local',
  );
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
  // Disable realtime WebSocket for a Node script.
  realtime: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transport: class NoopWS { constructor() { return; } } as any,
  },
});

// ─── Constants ────────────────────────────────────────────────────────────────

const PUL_TEAM_BASE  = 'https://pul-stats-hub.pages.dev/teams/';
const UA             = 'Mozilla/5.0 (the-layout/pul-backfill-v3)';
const FETCH_DELAY_MS = 400; // polite delay between team page fetches

const R2_BASE = 'https://pub-d284bbb3229c435b8e085787c253db6f.r2.dev/assets/teams';

// ─── Team definitions ─────────────────────────────────────────────────────────

interface TeamDef {
  id:          string; // R2/DB slug (pul_teams primary key)
  displayName: string; // exact URL segment: /teams/{displayName}/
  name:        string;
  city:        string;
  mascot:      string;
}

const TEAM_DEFS: TeamDef[] = [
  { id: 'atlanta',      displayName: 'Atlanta Soul',         name: 'Atlanta Soul',         city: 'Atlanta',       mascot: 'Soul' },
  { id: 'austin',       displayName: 'Austin Torch',         name: 'Austin Torch',         city: 'Austin',        mascot: 'Torch' },
  { id: 'columbus',     displayName: 'Columbus Pride',       name: 'Columbus Pride',       city: 'Columbus',      mascot: 'Pride' },
  { id: 'dc',           displayName: 'DC Shadow',            name: 'DC Shadow',            city: 'Washington',    mascot: 'Shadow' },
  { id: 'indy',         displayName: 'Indy Red',             name: 'Indy Red',             city: 'Indianapolis',  mascot: 'Red' },
  { id: 'la',           displayName: 'LA Astra',             name: 'LA Astra',             city: 'Los Angeles',   mascot: 'Astra' },
  { id: 'milwaukee',    displayName: 'Milwaukee Monarchs',   name: 'Milwaukee Monarchs',   city: 'Milwaukee',     mascot: 'Monarchs' },
  { id: 'minnesota',    displayName: 'Minnesota Strike',     name: 'Minnesota Strike',     city: 'Minnesota',     mascot: 'Strike' },
  { id: 'nashville',    displayName: 'Nashville NightShade', name: 'Nashville NightShade', city: 'Nashville',     mascot: 'NightShade' },
  { id: 'newyork',      displayName: 'New York Gridlock',    name: 'New York Gridlock',    city: 'New York',      mascot: 'Gridlock' },
  { id: 'philadelphia', displayName: 'Philadelphia Surge',   name: 'Philadelphia Surge',   city: 'Philadelphia',  mascot: 'Surge' },
  { id: 'portland',     displayName: 'Portland Rising',      name: 'Portland Rising',      city: 'Portland',      mascot: 'Rising' },
  { id: 'raleigh',      displayName: 'Raleigh Radiance',     name: 'Raleigh Radiance',     city: 'Raleigh',       mascot: 'Radiance' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

async function fetchTeamPage(displayName: string): Promise<string | null> {
  // ?season= param is ignored server-side — the static HTML embeds all seasons.
  // We include it anyway for cache-key hygiene / future proofing.
  const url = `${PUL_TEAM_BASE}${encodeURIComponent(displayName)}/?season=2026`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
    });
    if (!res.ok) {
      console.error(`  HTTP ${res.status} for ${displayName} — ${url}`);
      return null;
    }
    return await res.text();
  } catch (err) {
    console.error(`  Network error fetching ${displayName}:`, err);
    return null;
  }
}

// ─── R2 logo probe ────────────────────────────────────────────────────────────

async function probeLogoUrl(slugCandidates: string[]): Promise<string | null> {
  for (const slug of slugCandidates) {
    const url = `${R2_BASE}/${slug}.png`;
    try {
      const res = await fetch(url, { method: 'HEAD' });
      if (res.ok) return url;
    } catch {
      // network error — treat as missing
    }
  }
  return null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== PUL Backfill v3 — multi-season island parse ===\n');

  // ── Step 1: Probe R2 logos ─────────────────────────────────────────────────
  console.log('Probing R2 for team logos...');

  const logoBySlug = new Map<string, string | null>();
  const NY_CANDIDATES = ['newyork', 'ny', 'gridlock'];

  for (const team of TEAM_DEFS) {
    const candidates = team.id === 'newyork' ? NY_CANDIDATES : [team.id];
    const url = await probeLogoUrl(candidates);
    logoBySlug.set(team.id, url);
    if (team.id === 'newyork') {
      const found = url ? url.split('/').pop()!.replace('.png', '') : 'NONE';
      console.log(`  ${team.name}: logo slug = ${found} → ${url ?? 'null'}`);
    } else {
      console.log(`  ${team.name}: ${url ? 'OK' : 'null'}`);
    }
  }

  // ── Step 2: Fetch + parse each team page ──────────────────────────────────
  // We collect accent colors here; pul_teams upsert happens after.
  console.log('\nFetching team roster pages...\n');

  interface TeamResult {
    team:         TeamDef;
    seasonsFound: number[];
    totalRows:    number;
    accentColor:  string | null;
    failed:       boolean;
    warnings:     string[];
  }

  const results: TeamResult[] = [];
  let grandTotal = 0;

  for (let i = 0; i < TEAM_DEFS.length; i++) {
    const team = TEAM_DEFS[i];
    if (i > 0) await sleep(FETCH_DELAY_MS);

    process.stdout.write(`  [${i + 1}/${TEAM_DEFS.length}] ${team.name} ... `);

    const html = await fetchTeamPage(team.displayName);
    if (!html) {
      console.log('FETCH FAILED');
      results.push({ team, seasonsFound: [], totalRows: 0, accentColor: null, failed: true, warnings: [] });
      continue;
    }

    const parsed = parseTeamPage(html, team.id);

    if (parsed.seasonsFound.length === 0) {
      console.log(`PARSE FAILED — 0 seasons found (${(html.length / 1024).toFixed(0)} KB page)`);
      results.push({ team, seasonsFound: [], totalRows: 0, accentColor: null, failed: true, warnings: parsed.warnings });
      continue;
    }

    // ── Delete stale rows for the seasons we're about to insert ──────────────
    // We only delete the specific seasons we scraped so we don't accidentally
    // wipe a season for a team that hasn't been scraped yet this run.
    const { error: delErr } = await db
      .from('pul_players')
      .delete()
      .eq('team_id', team.id)
      .in('season', parsed.seasonsFound);

    if (delErr) {
      console.log(`DELETE ERROR — ${delErr.message}`);
      results.push({ team, seasonsFound: parsed.seasonsFound, totalRows: 0, accentColor: null, failed: true, warnings: parsed.warnings });
      continue;
    }

    // ── Insert all season rows in one shot ────────────────────────────────────
    const now = new Date().toISOString();
    const playerRows: Record<string, unknown>[] = [];

    for (const season of parsed.seasonsFound) {
      const players = parsed.seasonPlayers.get(season) ?? [];
      for (const p of players) {
        playerRows.push({
          player_name:   p.playerName,
          jersey_number: p.jerseyNumber ?? '',
          pronouns:      p.pronouns ?? null,
          team_id:       team.id,
          season,
          games_played:  p.gamesPlayed,
          goals:         p.goals,
          assists:       p.assists,
          blocks:        p.blocks,
          turnovers:     p.turnovers,
          touches:       p.touches,
          o_points:      p.oPoints,
          d_points:      p.dPoints,
          plus_minus:    p.plusMinus,
          updated_at:    now,
        });
      }
    }

    // Insert in one shot — typical team is ~30 players × 4 seasons = ~120 rows, well within limits.
    const { error: insertErr } = await db
      .from('pul_players')
      .insert(playerRows);

    if (insertErr) {
      console.log(`INSERT ERROR — ${insertErr.message}`);
      results.push({ team, seasonsFound: parsed.seasonsFound, totalRows: 0, accentColor: null, failed: true, warnings: parsed.warnings });
      continue;
    }

    const seasonStr  = parsed.seasonsFound.join(',');
    const totalRows  = playerRows.length;
    grandTotal      += totalRows;

    console.log(`${totalRows} rows  seasons=[${seasonStr}]`);

    // Emit any parse warnings
    for (const w of parsed.warnings) {
      console.warn(`    WARN: ${w}`);
    }

    results.push({
      team,
      seasonsFound: parsed.seasonsFound,
      totalRows,
      accentColor: parsed.accentColor,
      failed: false,
      warnings: parsed.warnings,
    });
  }

  // ── Step 3: Seed pul_teams (with accent_color now populated) ─────────────
  console.log('\nSeeding pul_teams...');

  const accentBySlug = new Map(results.map((r) => [r.team.id, r.accentColor]));

  const teamRows = TEAM_DEFS.map((t) => ({
    id:           t.id,
    name:         t.name,
    city:         t.city,
    mascot:       t.mascot,
    logo_url:     logoBySlug.get(t.id) ?? null,
    accent_color: accentBySlug.get(t.id) ?? null,
    updated_at:   new Date().toISOString(),
  }));

  const { error: teamsErr } = await db
    .from('pul_teams')
    .upsert(teamRows, { onConflict: 'id' });

  if (teamsErr) {
    console.error('pul_teams upsert failed:', teamsErr);
    process.exit(1);
  }
  console.log(`  ${teamRows.length} teams seeded.`);

  // ── Step 4: Summary ───────────────────────────────────────────────────────
  console.log('\n=== SUMMARY ===\n');
  console.log('  Team                     Rows   Seasons              Warnings');
  console.log('  ───────────────────────  ─────  ───────────────────  ────────');

  const failedTeams: string[] = [];
  for (const r of results) {
    if (r.failed) {
      failedTeams.push(r.team.displayName);
      console.log(`  ${r.team.name.padEnd(23)}  FAILED`);
      continue;
    }
    const name     = r.team.name.padEnd(23);
    const rows     = String(r.totalRows).padStart(5);
    const seasons  = `[${r.seasonsFound.join(',')}]`.padEnd(20);
    const warnStr  = r.warnings.length > 0 ? String(r.warnings.length) : '—';
    console.log(`  ${name}  ${rows}  ${seasons}  ${warnStr}`);
  }

  console.log(`\n  TOTAL rows inserted: ${grandTotal}`);
  console.log(`  (expected ~1,200–1,500 across 13 teams × ~3-4 seasons)`);

  if (failedTeams.length > 0) {
    console.warn(`\n  FAILED teams (${failedTeams.length}): ${failedTeams.join(', ')}`);
    console.warn('  Re-run the script to retry failed teams.');
  } else {
    console.log('\n  All teams fetched and inserted successfully.');
  }

  // ── Step 5: Spot-check Minnesota Strike — multi-season ───────────────────
  console.log('\n=== SPOT-CHECK: Minnesota Strike — multi-season ===\n');

  for (const season of [2023, 2024, 2025, 2026]) {
    const { data: rows } = await db
      .from('pul_players')
      .select('player_name, jersey_number, pronouns, goals, assists, blocks, turnovers, touches, o_points, d_points, plus_minus, games_played')
      .eq('team_id', 'minnesota')
      .eq('season', season)
      .order('touches', { ascending: false })
      .limit(3);

    console.log(`  ── Season ${season} (top 3 by touches) ──`);
    for (const p of (rows ?? [])) {
      const pron = p.pronouns ? `  [${p.pronouns}]` : '';
      console.log(
        `    ${String(p.player_name).padEnd(30)} #${String(p.jersey_number).padStart(2)}` +
        `  GP=${p.games_played}  G=${p.goals}  A=${p.assists}  B=${p.blocks}` +
        `  TO=${p.turnovers}  TCH=${p.touches}  O=${p.o_points}  D=${p.d_points}  +/-=${p.plus_minus}${pron}`,
      );
    }
    console.log('');
  }

  // Specific player checks
  console.log('  ── Makella Daley (verify distinct stats per year) ──');
  const { data: daleyRows } = await db
    .from('pul_players')
    .select('season, goals, assists, touches, o_points, d_points')
    .eq('team_id', 'minnesota')
    .ilike('player_name', '%makella%')
    .order('season', { ascending: true });
  for (const r of (daleyRows ?? [])) {
    const expected2026 = r.season === 2026
      ? ` (expect ~4G/6A/205t)` : r.season === 2023 ? ` (expect ~3G/2A/5t)` : '';
    console.log(`    ${r.season}: G=${r.goals} A=${r.assists} TCH=${r.touches} O=${r.o_points} D=${r.d_points}${expected2026}`);
  }

  console.log('\n  ── Steph Wood 2026 ──');
  const { data: stephRows } = await db
    .from('pul_players')
    .select('season, goals, assists, touches, plus_minus, pronouns')
    .eq('team_id', 'minnesota')
    .eq('season', 2026)
    .ilike('player_name', '%wood%')
    .limit(1);
  const steph = stephRows?.[0];
  if (steph) {
    const ok = steph.goals === 8 && steph.assists === 12 && steph.touches === 120;
    console.log(`    G=${steph.goals} A=${steph.assists} TCH=${steph.touches} +/-=${steph.plus_minus} pronouns=${steph.pronouns ?? 'null'}`);
    console.log(`    Expected G=8 A=12 TCH=120 → ${ok ? 'PASS' : 'MISMATCH'}`);
  } else {
    console.warn('    Steph Wood 2026 not found.');
  }

  // ── Step 6: DB verification ───────────────────────────────────────────────
  console.log('\n=== DB VERIFICATION ===\n');

  const { count: teamCount } = await db
    .from('pul_teams')
    .select('*', { count: 'exact', head: true });
  console.log(`  pul_teams: ${teamCount} (expected 13)`);

  // Per-season counts
  for (const season of [2023, 2024, 2025, 2026]) {
    const { count } = await db
      .from('pul_players')
      .select('*', { count: 'exact', head: true })
      .eq('season', season);
    console.log(`  pul_players season=${season}: ${count} rows`);
  }

  const { count: totalCount } = await db
    .from('pul_players')
    .select('*', { count: 'exact', head: true });
  console.log(`  pul_players TOTAL: ${totalCount}`);

  // Pronouns populated check
  const { count: pronounsCount } = await db
    .from('pul_players')
    .select('*', { count: 'exact', head: true })
    .not('pronouns', 'is', null);
  console.log(`  pul_players with pronouns set: ${pronounsCount}`);

  // Accent color populated check
  const { count: accentCount } = await db
    .from('pul_teams')
    .select('*', { count: 'exact', head: true })
    .not('accent_color', 'is', null);
  console.log(`  pul_teams with accent_color set: ${accentCount}`);

  // Anon read check (simulates the app client)
  const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (ANON_KEY && SUPABASE_URL) {
    const anonDb = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false },
      realtime: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        transport: class NoopWS { constructor() { return; } } as any,
      },
    });
    const { data: anonRows, error: anonErr } = await anonDb
      .from('pul_players')
      .select('player_name, goals')
      .eq('team_id', 'minnesota')
      .eq('season', 2026)
      .limit(3);
    if (anonErr) {
      console.warn(`  Anon read check FAILED: ${anonErr.message}`);
    } else {
      console.log(`  Anon read check: OK (${anonRows?.length ?? 0} sample rows returned)`);
    }
  } else {
    console.log('  Anon read check: skipped (no NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY set)');
  }

  console.log('\nPUL Backfill v3 complete.');
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});

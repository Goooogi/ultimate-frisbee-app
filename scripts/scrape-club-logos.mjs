/**
 * USAU CLUB logo scraper + manifest rebuilder.
 * ─────────────────────────────────────────────────────────────────────────────
 * Sibling of scrape-college-logos.mjs, but for the CLUB divisions (Men / Mixed /
 * Women). Unlike college, USAU's club team pages serve a RELIABLE crest in the
 * /assets/TeamLogos/ slot (real logos, not generic patches), so we DON'T apply
 * the aggressive college junk-filename gate — just the size + content-type gate.
 *
 * We had ~129 club logos already (added by hand in an early commit, no script);
 * this is the first saved club scraper. It:
 *   1. targets the top N teams PER DIVISION for a season, ranked by best (lowest)
 *      seed the team has held that season (strongest teams first),
 *   2. NEVER overwrites a crest already on disk (manual/prior wins),
 *   3. pulls each team page, extracts the /assets/TeamLogos/ src,
 *   4. downloads keepers to public/usau-logos/<gender>/<slug>.<ext>,
 *   5. rebuilds src/lib/usau/team-logos.json from the whole /usau-logos tree.
 *
 * Serial + paced + WAF-aware (HARD STOP on 403), same discipline as the college
 * scraper and the roster backfill. OPERATOR-RUN ONLY — never a cron.
 *
 * USAGE (from repo root):
 *   node scripts/scrape-club-logos.mjs                 # scrape top 200/div (2026) + rebuild
 *   DRY=1 node scripts/scrape-club-logos.mjs           # plan only, no downloads
 *   REBUILD_ONLY=1 node scripts/scrape-club-logos.mjs  # just rebuild manifest from disk
 *   TOP=100 node scripts/scrape-club-logos.mjs         # cap at 100 per division
 *   SEASON=2025 node scripts/scrape-club-logos.mjs     # different season
 *   GAP=12 node scripts/scrape-club-logos.mjs          # gentler pace (seconds)
 *
 * ENV: NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (from .env).
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync, statSync } from 'fs';
import { resolve, join } from 'path';

function loadEnv(f) {
  if (!existsSync(f)) return;
  for (const l of readFileSync(f, 'utf-8').split('\n')) {
    const t = l.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv('.env.local');
loadEnv('.env');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!SUPABASE_URL || !ANON) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  process.exit(1);
}
const REST = `${SUPABASE_URL}/rest/v1`;
const USAU = 'https://play.usaultimate.org';
const UA = 'Mozilla/5.0 (the-layout logo pull)';

const GAP = Number(process.env.GAP ?? 8) * 1000;
const DRY = process.env.DRY === '1';
const REBUILD_ONLY = process.env.REBUILD_ONLY === '1';
const TOP = Number(process.env.TOP ?? 200); // per division
const SEASON = Number(process.env.SEASON ?? 2026);
const MAX_BYTES = 3_000_000; // 3MB ceiling (no giant files)
const MIN_BYTES = 700; // below this = almost certainly a blank/placeholder
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const LOGO_DIR = resolve('public/usau-logos');
const MANIFEST = resolve('src/lib/usau/team-logos.json');

const toSlug = (name) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function rest(path) {
  const r = await fetch(`${REST}/${path}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  });
  if (!r.ok) throw new Error(`REST ${path} → ${r.status}: ${await r.text()}`);
  return r.json();
}

/** Rebuild team-logos.json from every file under public/usau-logos/. */
function rebuildManifest() {
  const entries = {};
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const walk = (dir, prefixParts) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        const seg = name === 'college' ? 'College' : cap(name);
        walk(full, [...prefixParts, seg]);
      } else if (/\.(png|jpe?g|webp|svg)$/i.test(name)) {
        const slug = name.replace(/\.(png|jpe?g|webp|svg)$/i, '');
        const key = [...prefixParts, slug].join('/');
        const publicPath = full.slice(full.indexOf('/usau-logos'));
        entries[key] = publicPath;
      }
    }
  };
  walk(LOGO_DIR, []);
  const sorted = Object.fromEntries(Object.keys(entries).sort().map((k) => [k, entries[k]]));
  writeFileSync(MANIFEST, JSON.stringify(sorted, null, 2) + '\n');
  console.log(`manifest: ${Object.keys(sorted).length} entries → ${MANIFEST}`);
}

if (REBUILD_ONLY) {
  rebuildManifest();
  process.exit(0);
}

/**
 * Build the target list: top TOP teams per gender division for SEASON, ranked by
 * best (lowest) seed held that season. One target per (gender, slug) — a team
 * plays multiple events but needs one logo; we keep the row with the best seed
 * and a resolvable per-event URL id.
 */
async function buildTargets() {
  // event_teams for the season's CLUB teams, with seed + url id, joined to the
  // persistent team for name/gender. Page through (PostgREST caps at 1000).
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const batch = await fetch(
      `${REST}/usau_event_teams?select=seed,usau_event_team_url_id,` +
        `usau_events!inner(season),usau_teams!inner(name,gender_division,competition_level)` +
        `&usau_event_team_url_id=not.is.null` +
        `&usau_teams.competition_level=eq.CLUB` +
        `&usau_events.season=eq.${SEASON}`,
      {
        headers: {
          apikey: ANON,
          Authorization: `Bearer ${ANON}`,
          Range: `${from}-${to}`,
          Prefer: 'count=exact',
        },
      },
    ).then(async (r) => {
      if (!r.ok) throw new Error(`event_teams ${r.status}: ${await r.text()}`);
      return r.json();
    });
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }

  // Reduce to best target per (gender, slug).
  const best = new Map(); // key -> { gender, slug, name, seed, urlId }
  for (const r of rows) {
    const t = r.usau_teams;
    if (!t?.name || !t.gender_division) continue;
    const gender = t.gender_division; // Men | Women | Mixed
    const slug = toSlug(t.name);
    const key = `${gender}/${slug}`;
    const seed = r.seed ?? 9999;
    const prev = best.get(key);
    if (!prev || seed < prev.seed) {
      best.set(key, { gender, slug, name: t.name, seed, urlId: r.usau_event_team_url_id });
    }
  }

  // Split by gender, sort by seed asc, cap at TOP.
  const byGender = { Men: [], Women: [], Mixed: [] };
  for (const v of best.values()) (byGender[v.gender] ??= []).push(v);
  const targets = [];
  for (const g of Object.keys(byGender)) {
    const list = byGender[g].sort((a, b) => a.seed - b.seed).slice(0, TOP);
    targets.push(...list);
    console.log(`  ${g}: ${byGender[g].length} teams → taking top ${list.length}`);
  }
  return targets;
}

async function main() {
  console.log(`Club logo scrape — season=${SEASON} top=${TOP}/div gap=${GAP / 1000}s dry=${DRY}`);
  const targets = await buildTargets();
  console.log(`total targets: ${targets.length}`);

  let scraped = 0;
  let skippedExisting = 0;
  let noLogo = 0;
  let failed = 0;

  for (const { gender, slug, name, urlId } of targets) {
    const dir = join(LOGO_DIR, gender.toLowerCase());
    // Crest already on disk (any extension)? → never overwrite.
    const existing = ['png', 'jpg', 'jpeg', 'webp', 'svg'].some((e) =>
      existsSync(join(dir, `${slug}.${e}`)),
    );
    if (existing) {
      skippedExisting++;
      continue;
    }

    if (DRY) {
      console.log(`  ? ${gender}/${slug} — would fetch "${name}"`);
      continue;
    }

    // Fetch the team page, extract the logo src.
    const enc = encodeURIComponent(urlId);
    let html;
    try {
      const res = await fetch(`${USAU}/events/teams/?EventTeamId=${enc}`, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(25000),
      });
      if (res.status === 403) {
        console.error('  🛑 403 WAF block — stopping. Re-run later to resume (existing files are skipped).');
        break;
      }
      html = await res.text();
    } catch (e) {
      failed++;
      console.warn(`  ! ${gender}/${slug} fetch failed: ${e.message}`);
      await sleep(GAP);
      continue;
    }

    const m = html.match(/src="(\/assets\/TeamLogos\/[^"]+)"/i);
    if (!m) {
      noLogo++;
      console.log(`  - ${gender}/${slug} — no logo on page`);
      await sleep(GAP);
      continue;
    }
    const logoUrl = m[1];
    const fname = logoUrl.split('/').pop();

    // Download + size/type gate (no filename junk-gate — club slot is reliable).
    try {
      const img = await fetch(`${USAU}${logoUrl}`, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(25000),
      });
      if (!img.ok) throw new Error(`HTTP ${img.status}`);
      const ct = img.headers.get('content-type') ?? '';
      if (!/image\//.test(ct) || /gif/.test(ct)) throw new Error(`bad content-type ${ct}`);
      const buf = Buffer.from(await img.arrayBuffer());
      if (buf.length < MIN_BYTES) throw new Error(`too small (${buf.length}b)`);
      if (buf.length > MAX_BYTES) throw new Error(`too big (${buf.length}b)`);
      const ext = (fname.match(/\.(png|jpe?g|webp|svg)$/i)?.[1] ?? 'png').toLowerCase();
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${slug}.${ext}`), buf);
      scraped++;
      console.log(`  ✓ ${gender}/${slug} ← ${fname} (${buf.length}b)`);
    } catch (e) {
      failed++;
      console.warn(`  ! ${gender}/${slug} download skipped: ${e.message}`);
    }
    await sleep(GAP);
  }

  console.log(
    `\nscraped=${scraped} skippedExisting=${skippedExisting} noLogo=${noLogo} failed=${failed}`,
  );
  rebuildManifest();
  console.log('Done. Review public/usau-logos/{men,mixed,women}/ and remove any that slipped through.');
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});

/**
 * USAU COLLEGE logo scraper + manifest rebuilder.
 * ─────────────────────────────────────────────────────────────────────────────
 * USAU college team pages expose an /assets/TeamLogos/ image, but unlike the club
 * divisions the college slot is inconsistent: some are real crests, many are junk
 * (generic patches, cropped jersey numbers, random "Screen_Shot" uploads). So we:
 *   1. pull each 2026 college team's logo src,
 *   2. auto-SKIP obvious junk by filename + size,
 *   3. NEVER overwrite a manually-curated crest already on disk (manual wins),
 *   4. save keepers to public/usau-logos/college/<gender>/<slug>.<ext>,
 *   5. rebuild src/lib/usau/team-logos.json from the whole /usau-logos tree.
 *
 * Serial + paced + WAF-aware (hard stop on 403), same discipline as the roster
 * backfill. Operator-run only.
 *
 * USAGE (from repo root):
 *   node scripts/scrape-college-logos.mjs            # scrape + rebuild manifest
 *   DRY=1 node scripts/scrape-college-logos.mjs       # plan only, no downloads
 *   REBUILD_ONLY=1 node scripts/scrape-college-logos.mjs  # just rebuild manifest from disk
 *   GAP=15 node scripts/scrape-college-logos.mjs      # gentler pace
 *   EVENTS="2026-D-I-College-Championships,2026-D-III-College-Championships" \
 *     node scripts/scrape-college-logos.mjs           # scope to specific event slugs (Nationals only)
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
const MAX_BYTES = 3_000_000; // 3MB ceiling (no giant files)
const MIN_BYTES = 700; // below this = almost certainly a blank/placeholder
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const LOGO_DIR = resolve('public/usau-logos');
const MANIFEST = resolve('src/lib/usau/team-logos.json');

const toSlug = (name) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Filenames that scream "not a real crest".
const JUNK_RE = /(screen[_-]?shot|crop|patch|placeholder|default|image\d*|unnamed|photo|_crop|jersey|number|logo\d{6,})/i;

async function rest(path) {
  const r = await fetch(`${REST}/${path}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  });
  if (!r.ok) throw new Error(`REST ${path} → ${r.status}`);
  return r.json();
}

/** Rebuild team-logos.json from every file under public/usau-logos/. */
function rebuildManifest() {
  const entries = {};
  const walk = (dir, prefixParts) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        // Directory name becomes a key segment, Title-cased for gender/college.
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
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  walk(LOGO_DIR, []);
  // Stable sort for a clean diff.
  const sorted = Object.fromEntries(Object.keys(entries).sort().map((k) => [k, entries[k]]));
  writeFileSync(MANIFEST, JSON.stringify(sorted, null, 2) + '\n');
  console.log(`manifest: ${Object.keys(sorted).length} entries → ${MANIFEST}`);
}

if (REBUILD_ONLY) {
  rebuildManifest();
  process.exit(0);
}

async function main() {
  console.log(`College logo scrape — gap=${GAP / 1000}s dry=${DRY}`);

  // Optionally scope to specific event slugs (e.g. Nationals only) to keep the
  // request count well under the USAU WAF threshold. Without EVENTS, targets
  // every 2026 college team with a resolved URL.
  const eventSlugs = (process.env.EVENTS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  let eventIdFilter = '';
  if (eventSlugs.length) {
    const evs = await rest(
      `usau_events?select=id&usau_slug=in.(${eventSlugs.join(',')})`,
    );
    const ids = evs.map((e) => e.id);
    if (!ids.length) {
      console.error(`No events matched slugs: ${eventSlugs.join(', ')}`);
      process.exit(1);
    }
    eventIdFilter = `&event_id=in.(${ids.join(',')})`;
    console.log(`scoped to ${ids.length} event(s): ${eventSlugs.join(', ')}`);
  }

  // College teams with a resolved per-event URL id. competition_level lives on
  // usau_teams, so we join via event_teams.
  const rows = await rest(
    `usau_event_teams?select=usau_event_team_id,usau_teams!inner(name,gender_division,competition_level)` +
      `&usau_event_team_url_id=not.is.null` +
      `&usau_teams.competition_level=in.(COLLEGE_D1,COLLEGE_D3)` +
      eventIdFilter,
  );

  // Dedupe to one target per (gender, slug) — a team plays multiple events but
  // needs one logo. Prefer any row (they share the same crest).
  const targets = new Map();
  for (const r of rows) {
    const t = r.usau_teams;
    if (!t?.name || !t.gender_division) continue;
    const gender = t.gender_division; // Men | Women
    const slug = toSlug(t.name);
    const key = `${gender}/${slug}`;
    if (!targets.has(key)) {
      targets.set(key, { gender, slug, name: t.name, eventTeamId: r.usau_event_team_id });
    }
  }
  console.log(`college teams (unique): ${targets.size}`);

  let scraped = 0;
  let skippedJunk = 0;
  let skippedExisting = 0;
  let noLogo = 0;

  for (const { gender, slug, name, eventTeamId } of targets.values()) {
    const dir = join(LOGO_DIR, 'college', gender.toLowerCase());
    // Manual/previous crest already on disk (any extension)? → never overwrite.
    const existing = ['png', 'jpg', 'jpeg', 'webp', 'svg'].some((e) =>
      existsSync(join(dir, `${slug}.${e}`)),
    );
    if (existing) {
      skippedExisting++;
      console.log(`  = ${gender}/${slug} (have it, skip)`);
      continue;
    }

    if (DRY) {
      console.log(`  ? ${gender}/${slug} — would fetch ${name}`);
      continue;
    }

    // Fetch the team page, extract the logo src.
    const enc = encodeURIComponent(eventTeamId);
    let html;
    try {
      const res = await fetch(`${USAU}/events/teams/?EventTeamId=${enc}`, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(25000),
      });
      if (res.status === 403) {
        console.error('  🛑 403 WAF block — stopping.');
        break;
      }
      html = await res.text();
    } catch (e) {
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

    if (JUNK_RE.test(fname)) {
      skippedJunk++;
      console.log(`  x ${gender}/${slug} — junk filename (${fname})`);
      await sleep(GAP);
      continue;
    }

    // Download + size gate.
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
      console.warn(`  ! ${gender}/${slug} download skipped: ${e.message}`);
    }
    await sleep(GAP);
  }

  console.log(
    `\nscraped=${scraped} skippedJunk=${skippedJunk} skippedExisting=${skippedExisting} noLogo=${noLogo}`,
  );
  rebuildManifest();
  console.log('Done. Review public/usau-logos/college/ and remove any that slipped through.');
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});

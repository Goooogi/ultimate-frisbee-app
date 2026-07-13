/**
 * Self-host UFA player headshots into Supabase Storage.
 * ─────────────────────────────────────────────────────────────────────────────
 * We previously stored watchufa.com hotlink URLs in ufa_players.headshot_url.
 * Those are full-resolution camera originals (some 4.5 MB!) served off a
 * third-party CDN — slow, flaky, and they can vanish if watchufa changes them.
 *
 * This downloads each player's current headshot from watchufa and uploads it to
 * the `ufa-headshots` Storage bucket as `{playerID}.{ext}`, then repoints
 * ufa_players.headshot_url at OUR public object URL. The APP renders it through
 * Supabase's image transform (?width=200&…) → ~6 KB, CDN-cached — so we never
 * resize here; we just self-host the original once and let the transform shrink
 * it on serve.
 *
 * IDEMPOTENT: re-running re-fetches from watchufa and upserts (overwrites) the
 * stored object + url, so it self-heals if a source image changed.
 *
 * USAGE (repo root):
 *   npx tsx scripts/backfill-ufa-headshots.ts            # all players with a
 *                                                          watchufa hotlink URL
 *   npx tsx scripts/backfill-ufa-headshots.ts --all      # also (re)scrape the
 *                                                          watchufa page for
 *                                                          players missing a url
 *
 * REQUIRED ENV (.env / .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SECRET_KEY   (service role — bypasses RLS + Storage policies)
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

function loadDotEnv(file: string): void {
  const full = resolve(process.cwd(), file);
  if (!existsSync(full)) return;
  for (const line of readFileSync(full, 'utf-8').split('\n')) {
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

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error('Missing env: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY');
  process.exit(1);
}
const db = createClient(URL, KEY, { auth: { persistSession: false } });

const BUCKET = 'ufa-headshots';
const UA = 'Mozilla/5.0 (Macintosh) Chrome/120';
const HEADSHOT_RE = /src="(https:\/\/[^"]*\/profile-images\/[^"]*_profile\.[A-Za-z]+)"/i;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
};

/** Scrape a player's watchufa profile page for the headshot src (extension varies). */
async function scrapeHeadshotUrl(playerID: string): Promise<string | null> {
  try {
    const res = await fetch(`https://www.watchufa.com/league/players/${encodeURIComponent(playerID)}`, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
    });
    if (!res.ok) return null;
    const m = (await res.text()).match(HEADSHOT_RE);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/** Download `srcUrl`, upload to the bucket as {playerID}.{ext}, return the
 *  public OBJECT url (no transform params — the app adds those at render). */
async function selfHost(playerID: string, srcUrl: string): Promise<string | null> {
  let ext = (srcUrl.split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (ext === 'jpeg') ext = 'jpg';
  const contentType = MIME[ext] ?? 'image/jpeg';
  const objectPath = `${playerID}.${ext}`;

  let buf: Buffer;
  try {
    const res = await fetch(srcUrl, { headers: { 'User-Agent': UA } });
    if (!res.ok) return null;
    buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) return null;
  } catch {
    return null;
  }

  const { error } = await db.storage.from(BUCKET).upload(objectPath, buf, {
    contentType,
    upsert: true,
    cacheControl: '31536000', // 1yr — image content is immutable per player+ext
  });
  if (error) {
    console.warn(`    ! upload failed ${playerID}: ${error.message}`);
    return null;
  }
  return db.storage.from(BUCKET).getPublicUrl(objectPath).data.publicUrl;
}

async function main() {
  const scrapeMissing = process.argv.includes('--all');

  // Players to process: those with an existing (watchufa) headshot_url, plus —
  // when --all — those without one (we'll scrape their page first).
  const { data: players, error } = await db
    .from('ufa_players')
    .select('id, headshot_url')
    .order('id', { ascending: true });
  if (error) { console.error(error); process.exit(1); }

  const alreadyHosted = (u: string | null) =>
    !!u && u.includes(`/storage/v1/object/public/${BUCKET}/`);

  const work = (players ?? []).filter((p) => {
    if (alreadyHosted(p.headshot_url)) return false; // already self-hosted
    if (p.headshot_url) return true;                 // has a watchufa url to fetch
    return scrapeMissing;                            // no url → only if --all
  });

  console.log(`Players to self-host: ${work.length}${scrapeMissing ? ' (incl. scrape-missing)' : ''}`);

  let hosted = 0, done = 0, skipped = 0;
  for (const p of work) {
    let src = p.headshot_url as string | null;
    if (!src || !src.includes('watchufa')) {
      src = await scrapeHeadshotUrl(p.id);
      await sleep(120);
    }
    if (!src) { skipped++; done++; continue; }

    const publicUrl = await selfHost(p.id, src);
    if (publicUrl) {
      await db.from('ufa_players').update({ headshot_url: publicUrl }).eq('id', p.id);
      hosted++;
    } else {
      skipped++;
    }
    done++;
    if (done % 25 === 0) console.log(`  ${done}/${work.length}  (${hosted} hosted, ${skipped} skipped)`);
    await sleep(80);
  }
  console.log(`Done: ${hosted} self-hosted, ${skipped} skipped, of ${work.length}.`);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });

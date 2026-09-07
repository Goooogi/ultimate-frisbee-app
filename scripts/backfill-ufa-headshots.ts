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
 *   npx tsx scripts/backfill-ufa-headshots.ts --only=ehawkins,jsmith
 *                                                        # heal just these player
 *                                                          ids (implies --all for
 *                                                          them, so null rows are
 *                                                          re-scraped). Use to fix
 *                                                          a newly-synced player
 *                                                          without a full pass.
 *   npx tsx scripts/backfill-ufa-headshots.ts --all --recheck
 *                                                        # also re-scrape players
 *                                                          previously found to have
 *                                                          NO upstream image (run
 *                                                          after UFA adds photos).
 *   --concurrency=N (default 8)  parallel workers
 *   --gap=MS        (default 0)  per-worker pause, if watchufa pushes back
 *
 * Images are downscaled to 400px on the long edge with macOS `sips` before
 * upload (~3.4 MB → ~40 KB). We do NOT use Supabase's image-transform endpoint:
 * it bills per unique ORIGIN image (100/cycle on Pro), so a full pass would
 * blow the quota — the app serves these stored objects plain.
 *
 * REQUIRED ENV (.env / .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SECRET_KEY   (service role — bypasses RLS + Storage policies)
 */

import { readFileSync, existsSync, writeFileSync, unlinkSync } from 'fs';
import { resolve, join } from 'path';
import { tmpdir } from 'os';
import { execFileSync } from 'child_process';
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
/** Long-edge px for the stored object. The app renders a ~176px (retina) avatar
 *  box, so 400 is plenty and lands ~40 KB instead of ~3.4 MB. */
const RENDER_MAX_PX = 400;
const UA = 'Mozilla/5.0 (Macintosh) Chrome/120';
const HEADSHOT_RE = /src="(https:\/\/[^"]*\/profile-images\/[^"]*_profile\.[A-Za-z]+)"/i;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
};

// Resilient fetch: watchufa is a flaky Drupal site, so a single transient
// failure (timeout, connection reset, momentary 5xx) must NOT permanently leave
// a player headshot-less. Retry a few times with backoff and a hard timeout,
// mirroring the API client's resilience. Returns null only after all tries.
const FETCH_TIMEOUT_MS = 20_000;
const FETCH_TRIES = 4;
async function fetchWithRetry(url: string, init: RequestInit, label: string): Promise<Response | null> {
  for (let attempt = 1; attempt <= FETCH_TRIES; attempt++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      // 404 = the resource genuinely isn't there; don't waste retries on it.
      if (res.status === 404) return res;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      if (attempt < FETCH_TRIES) {
        await sleep(500 * attempt);
        continue;
      }
      console.warn(`    ! ${label} failed after ${attempt} tries: ${(err as Error).message}`);
      return null;
    }
  }
  return null;
}

/** Scrape a player's watchufa profile page for the headshot src (extension varies). */
async function scrapeHeadshotUrl(playerID: string): Promise<string | null> {
  const res = await fetchWithRetry(
    `https://www.watchufa.com/league/players/${encodeURIComponent(playerID)}`,
    { headers: { 'User-Agent': UA, Accept: 'text/html' } },
    `scrape ${playerID}`,
  );
  if (!res || !res.ok) return null;
  const m = (await res.text()).match(HEADSHOT_RE);
  return m ? m[1] : null;
}

/** Downscale to RENDER_MAX_PX on the long edge via macOS `sips` (no npm dep, no
 *  Supabase image-transform quota — that endpoint bills PER UNIQUE ORIGIN IMAGE
 *  at 100/cycle on Pro, so rendering ~900 players through it would blow the cap).
 *  Returns the original buffer unchanged if sips is unavailable or fails, so a
 *  non-macOS run still self-hosts (just at full size). */
function downscale(buf: Buffer, ext: string): { buf: Buffer; ext: string } {
  const tmp = join(tmpdir(), `ufa-hs-${process.pid}-${Math.random().toString(36).slice(2)}.${ext}`);
  try {
    writeFileSync(tmp, buf);
    execFileSync(
      'sips',
      ['-Z', String(RENDER_MAX_PX), '-s', 'format', 'jpeg', '-s', 'formatOptions', '80', tmp, '--out', tmp],
      { stdio: 'ignore' },
    );
    const out = readFileSync(tmp);
    // sips re-encodes to JPEG regardless of the input container, so the stored
    // extension must follow or the Content-Type lies about the bytes.
    return out.length > 0 ? { buf: out, ext: 'jpg' } : { buf, ext };
  } catch {
    return { buf, ext };
  } finally {
    try { unlinkSync(tmp); } catch { /* already gone */ }
  }
}

/** Download `srcUrl`, downscale, upload to the bucket as {playerID}.{ext},
 *  return the public OBJECT url (served plain — the app adds no transform). */
async function selfHost(playerID: string, srcUrl: string): Promise<string | null> {
  let ext = (srcUrl.split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (ext === 'jpeg') ext = 'jpg';

  const res = await fetchWithRetry(srcUrl, { headers: { 'User-Agent': UA } }, `download ${playerID}`);
  if (!res || !res.ok) return null;
  let buf: Buffer;
  try {
    buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) return null;
  } catch {
    return null;
  }

  // Upstream originals are ~3.4 MB 2400x3000 camera files. We serve the stored
  // object DIRECTLY to a ~176px avatar box, so shipping the original wasted
  // ~99% of the bytes on every card and profile render.
  ({ buf, ext } = downscale(buf, ext));
  const contentType = MIME[ext] ?? 'image/jpeg';
  const objectPath = `${playerID}.${ext}`;

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
  // --only=id1,id2 heals just those player ids (and implies --all for them so a
  // null headshot_url is re-scraped). Useful for a freshly-synced player whose
  // row post-dates the last full backfill (e.g. mid-season stat sync).
  const onlyArg = process.argv.find((a) => a.startsWith('--only='));
  const onlyIds = onlyArg
    ? new Set(onlyArg.slice('--only='.length).split(',').map((s) => s.trim()).filter(Boolean))
    : null;
  const scrapeMissing = process.argv.includes('--all') || onlyIds !== null;

  // Players to process: those with an existing (watchufa) headshot_url, plus —
  // when --all — those without one (we'll scrape their page first).
  //
  // MUST paginate: PostgREST caps a single select at 1000 rows, and the table
  // has ~2000 players. Without this, the back half of the roster (by id) was
  // INVISIBLE to the backfill and could never be healed — the real reason so
  // many headshots stayed null no matter how often we re-ran.
  const players: { id: string; headshot_url: string | null; headshot_checked_at: string | null }[] = [];
  {
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await db
        .from('ufa_players')
        .select('id, headshot_url, headshot_checked_at')
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) { console.error(error); process.exit(1); }
      const rows = (data ?? []) as typeof players;
      players.push(...rows);
      if (rows.length < PAGE) break;
    }
  }
  console.log(`Loaded ${players.length} players total.`);

  const alreadyHosted = (u: string | null) =>
    !!u && u.includes(`/storage/v1/object/public/${BUCKET}/`);

  // --recheck re-examines players we've already determined have no upstream
  // image (e.g. after UFA adds photos mid-season). Default skips them.
  const recheck = process.argv.includes('--recheck');
  // --recompress re-downloads and re-stores players we ALREADY self-hosted, to
  // shrink the full-res originals uploaded before downscaling existed.
  const recompress = process.argv.includes('--recompress');

  const work = (players ?? []).filter((p) => {
    if (onlyIds && !onlyIds.has(p.id)) return false; // --only= restricts the set
    if (alreadyHosted(p.headshot_url) && !recompress) return false; // already self-hosted
    if (p.headshot_url) return true;                 // has a watchufa url to fetch
    if (!scrapeMissing) return false;                // no url → only if --all/--only
    // Null url AND already checked = no image upstream. Re-scraping these every
    // run is what starved the budget and left later ids permanently unvisited.
    return recheck || onlyIds !== null || !p.headshot_checked_at;
  });

  console.log(`Players to self-host: ${work.length}${scrapeMissing ? ' (incl. scrape-missing)' : ''}`);

  // Pacing: watchufa rate-limits/drops connections when hit rapidly in bulk —
  // that throttling (not per-request flakiness) is what left ~half of a 500-player
  // run still missing even WITH per-request retries, since the whole IP was
  // throttled during the burst. Space requests out and jitter them so we stay
  // under the limiter. Slower, but it converges in one pass. `--fast` opts back
  // into the old aggressive cadence when you know the site is healthy.
  // Bounded concurrency. The old code was fully serial with a 400ms gap between
  // players, and each real headshot costs ~1.7s to download (~3.4 MB) plus the
  // upload — so a full pass needed HOURS and in practice completed ~2 players in
  // 20 minutes, never reaching ids late in the alphabet. Measured page fetches
  // run ~170ms with no throttling, so a modest pool is safe; --gap re-adds
  // pacing if watchufa ever starts pushing back.
  const conc = Number(process.argv.find((a) => a.startsWith('--concurrency='))?.split('=')[1]) || 8;
  const gapMs = Number(process.argv.find((a) => a.startsWith('--gap='))?.split('=')[1]) || 0;

  let hosted = 0, done = 0, skipped = 0, noImage = 0;
  const nowIso = () => new Date().toISOString();
  let cursor = 0;

  async function worker() {
    for (;;) {
      const i = cursor++;
      if (i >= work.length) return;
      const p = work[i];

      let src = p.headshot_url as string | null;
      if (!src || !src.includes('watchufa')) src = await scrapeHeadshotUrl(p.id);

      if (!src) {
        // No image upstream — stamp the check so future runs skip this player.
        await db.from('ufa_players').update({ headshot_checked_at: nowIso() }).eq('id', p.id);
        noImage++; skipped++;
      } else {
        const publicUrl = await selfHost(p.id, src);
        if (publicUrl) {
          await db
            .from('ufa_players')
            .update({ headshot_url: publicUrl, headshot_checked_at: nowIso() })
            .eq('id', p.id);
          hosted++;
        } else {
          // Transient failure (throttle, upload error): leave checked_at NULL so
          // a re-run retries this player rather than writing it off.
          skipped++;
        }
      }

      done++;
      if (done % 50 === 0) {
        console.log(`  ${done}/${work.length}  (${hosted} hosted, ${noImage} no-image, ${skipped - noImage} failed)`);
      }
      if (gapMs) await sleep(gapMs);
    }
  }

  await Promise.all(Array.from({ length: Math.min(conc, work.length) }, worker));

  const failed = skipped - noImage;
  console.log(`Done: ${hosted} self-hosted, ${noImage} no upstream image, ${failed} failed, of ${work.length}.`);
  if (failed > 0) {
    console.log(`Note: ${failed} transient failures left unstamped — re-run to retry just those.`);
  }
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });

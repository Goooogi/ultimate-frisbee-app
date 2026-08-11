// sync-live-events: re-ingests data for tournaments happening now (or in the
// next 24h, since brackets often go up the night before). Runs on a short
// pg_cron schedule so we pick up fresh games/scores as USAU publishes them.
//
// ── Fan-out architecture (2026-06-12 rewrite) ───────────────────────────────
// PREVIOUS design awaited sync-event-details for each live event SEQUENTIALLY.
// Each detail call takes ~90s (3 divisions × throttled page fetches), so on a
// busy summer weekend (16 live events) the orchestrator blew past the edge
// function ~150s walltime limit and was KILLED every run — writing nothing.
// (That's why Colorado Summer Solstice 2026 Part 1 and others never appeared:
// the loop never reached them, and every run's withRunLogging completion never
// fired — scrape_runs rows stayed open with completed_at=null.)
//
// NOW: the orchestrator only DISPATCHES one sync-event-details invocation per
// live event — fire-and-forget. Each child runs as its own independent edge
// function with its own ~150s budget, in parallel. The orchestrator awaits only
// that each request was accepted by the functions gateway (a short cap), then
// returns in a few seconds. No single invocation does heavy work, so nothing
// hits the walltime limit regardless of how many events are live.
//
// Idempotent: each child upserts teams/games. Optional request body:
//   { dryRun?: boolean, divisions?: string[] }

import { supabase, withRunLogging } from '../_shared/supabase.ts';

const FLAGSHIP_LEVELS = [
  'CLUB',
  'COLLEGE_D1',
  'COLLEGE_D3',
  'MASTERS',
  'GRAND_MASTERS',
  'GREAT_GRAND_MASTERS',
  // BEACH was missing → beach events (Chicago Beach: Legends and Masters,
  // Jones Beach 2026, weekend of 2026-08-08) sat in the app with 0 games.
  'BEACH',
];

// How long to wait for a child invocation to be ACCEPTED before moving on. We
// are NOT waiting for the child's ~90s of work — only for the functions gateway
// to acknowledge the request so we know it launched. If a child takes longer
// than this just to accept, we abort the wait (the child still runs) and record
// it as dispatched.
const DISPATCH_ACCEPT_TIMEOUT_MS = 4000;

/**
 * Max sync-event-details children in flight at once.
 *
 * WHY THIS EXISTS: this function used to `Promise.all` over the WHOLE event
 * list, so every matching event became a concurrent child. The window is wide
 * (7 days ahead + 2 days trailing), and on a busy June weekend that measured
 * **46 events** — i.e. ~46 parallel streams of USAU page fetches. Each child
 * fetches 3 divisions with a 5s floor between requests (_shared/http.ts).
 *
 * That burst pattern is exactly what has rate-limited our egress IP before:
 *  - _shared/http.ts raised its floor 2s → 5s because "USAU started
 *    rate-limiting our cloud IP";
 *  - scripts/backfill-college-rosters.sh exists specifically because "the
 *    deployed dispatcher fans out per-team IN PARALLEL — that's the exact burst
 *    pattern that got our Deno egress IP rate-limited";
 *  - 2026-07-29/30: a *serial* 12s backfill still got tarpitted at ~275
 *    requests, and a 20s run hit transient 500/504s.
 *
 * Capping concurrency is what makes a SHORTER cron interval safe: it bounds the
 * instantaneous request rate no matter how many events are in the window.
 * Events beyond the cap are not dropped — they roll to the next firing via the
 * rotating offset below, and every write is an idempotent upsert.
 */
const MAX_CONCURRENT_CHILDREN = 8;

/**
 * Events per firing. With a rotating start offset this walks the full list
 * across successive runs, so a 45-event weekend is fully covered in ~3 firings
 * instead of one 45-wide burst.
 */
const EVENTS_PER_RUN = 16;

interface RequestBody {
  dryRun?: boolean;
  divisions?: ('Men' | 'Women' | 'Mixed')[];
  /** Override the per-run slice size (defaults to EVENTS_PER_RUN). */
  limit?: number;
  /** Override concurrency (defaults to MAX_CONCURRENT_CHILDREN). */
  concurrency?: number;
}

/**
 * Run `tasks` with at most `limit` in flight. Plain worker-pool: N workers each
 * pull the next index until the list is exhausted. Preserves result order.
 */
async function pooled<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<{ slug: string; dispatched: boolean; note?: string }>,
): Promise<{ slug: string; dispatched: boolean; note?: string }[]> {
  const out: { slug: string; dispatched: boolean; note?: string }[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker),
  );
  return out;
}

function stringifyErr(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object') {
    const o = err as Record<string, unknown>;
    return [o.message, o.code && `(${o.code})`, o.details && `— ${o.details}`]
      .filter(Boolean)
      .join(' ') || JSON.stringify(err);
  }
  return String(err);
}

/**
 * Dispatch a sync-event-details invocation WITHOUT waiting for it to finish.
 * Resolves once the request is accepted (or the short accept-timeout elapses).
 * The child keeps running as its own edge function regardless.
 */
async function dispatchEventDetails(
  slug: string,
  divisions: string[],
): Promise<{ slug: string; dispatched: boolean; note?: string }> {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DISPATCH_ACCEPT_TIMEOUT_MS);

  try {
    // Kick off the request. We deliberately do NOT await full completion —
    // once the gateway has the request, the child invocation is running.
    const res = await fetch(`${url}/functions/v1/sync-event-details`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, divisions }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    // Cancel the body stream so the socket closes cleanly; don't block on it.
    res.body?.cancel().catch(() => {});
    return { slug, dispatched: true };
  } catch (err) {
    clearTimeout(timer);
    // AbortError = the child took >accept-timeout to respond. Expected and fine
    // — the invocation was still launched; we just stopped waiting on it.
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { slug, dispatched: true, note: 'accept-timeout (still running)' };
    }
    return { slug, dispatched: false, note: stringifyErr(err) };
  }
}

async function run(body: RequestBody) {
  const db = supabase();
  const divisions = body.divisions ?? ['Men', 'Women', 'Mixed'];
  const today = new Date().toISOString().slice(0, 10);
  // LOOKAHEAD window: pick up events starting within the next 7 days, not just
  // "live or starting tomorrow". USAU publishes pools / seeds / the schedule
  // up to ~a week before an event (e.g. Pro Elite Challenge West's Pools A–D
  // seeded days before the Sat games), and this function dispatches
  // sync-event-details = teams + pools + games. So a 7-day lookahead surfaces
  // those pools as soon as they're posted rather than only on game day. Runs
  // are idempotent (upserts), and a pre-event details page is a light fetch.
  const lookahead = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);
  // TRAILING window: keep re-scraping an event for 2 days AFTER it ends. USAU
  // often reports the Sunday-evening final (and other late results) after our
  // last live pass while the tournament was in-window; without this tail the
  // event drops out the moment end_date passes and those finals are never
  // captured (this is exactly how Glazed Daze 2026 lost its championship game).
  // Re-scraping the same slug via the same HTML pipeline just upserts the
  // now-complete bracket over the existing rows — no duplication. Cheap: only a
  // handful of events sit in a 2-day trailing window at once, and a settled
  // event's schedule page is one light fetch per division.
  const trailing = new Date(Date.now() - 2 * 86400_000).toISOString().slice(0, 10);

  // start_date ≤ today+7d AND end_date ≥ today-2d → live now, starting within a
  // week, or ended within the last 2 days (catch late-reported finals).
  const { data: events, error } = await db
    .from('usau_events')
    .select('id, usau_slug, name, competition_level, start_date, end_date')
    .in('competition_level', FLAGSHIP_LEVELS)
    .lte('start_date', lookahead)
    .gte('end_date', trailing)
    .order('start_date', { ascending: true });
  if (error) throw new Error(`load live events: ${stringifyErr(error)}`);

  // ── Pre-start throttle (2026-08-06) ──────────────────────────────────────
  // "A pre-event details page is a light fetch" stopped being true: children
  // now average ~60s (per-game dedupe round-trips, bigger pages), and on the
  // Thursday before a 9-event weekend the full 3-minute cadence piled up ~950
  // child runs in 6 hours — enough sustained DB load that GoTrue's /token
  // calls hit "couldn't start a new transaction" / 504s and the mobile app
  // hung on the boot auth gate. Events that haven't STARTED barely change
  // (pools/seeds post once), so they join only every fifth firing (~15 min).
  // Live and trailing events keep the full cadence — game-day freshness is
  // untouched.
  const preStartDue = Math.floor(Date.now() / 60_000 / 3) % 5 === 0;
  const eventList = (events ?? []).filter(
    (e) => (e.start_date as string) <= today || preStartDue,
  );

  // ── Slice this firing's share of the window ──────────────────────────────
  // Rather than dispatching the whole list at once (see MAX_CONCURRENT_CHILDREN
  // for why that burst is dangerous), take a rotating window of `perRun` events.
  // The offset advances with wall-clock time so successive cron firings cover
  // different slices and the full list is walked every ceil(total/perRun) runs.
  // Ordering is stable (start_date asc from the query), so the rotation is
  // deterministic and no event can be starved.
  const perRun = Math.max(1, body.limit ?? EVENTS_PER_RUN);
  const concurrency = Math.max(1, body.concurrency ?? MAX_CONCURRENT_CHILDREN);

  let slice = eventList;
  let offset = 0;
  if (eventList.length > perRun) {
    const slots = Math.ceil(eventList.length / perRun);
    // One slot per firing; 15-min cron → the tick index rotates every 15 min.
    // Using epoch-minutes keeps this stateless (no cursor table to maintain).
    const tick = Math.floor(Date.now() / 60_000 / 15);
    offset = (tick % slots) * perRun;
    slice = [...eventList.slice(offset), ...eventList.slice(0, offset)].slice(0, perRun);
  }

  if (body.dryRun) {
    return {
      rowsProcessed: 0,
      result: {
        dryRun: true,
        windowCount: eventList.length,
        perRun,
        concurrency,
        offset,
        dispatching: slice.length,
        events: slice.map((e) => e.usau_slug),
      },
    };
  }

  // Dispatch this slice with BOUNDED concurrency. Each child runs in its own
  // invocation with its own walltime budget — the orchestrator never does the
  // heavy work, it just paces how many children exist at once.
  const dispatches = await pooled(slice, concurrency, (e) =>
    dispatchEventDetails(e.usau_slug, divisions),
  );

  const launched = dispatches.filter((d) => d.dispatched);
  const failed = dispatches.filter((d) => !d.dispatched);

  return {
    rowsProcessed: 0, // orchestrator writes nothing itself — children do
    result: {
      liveEvents: eventList.length,
      windowCount: eventList.length,
      perRun,
      concurrency,
      offset,
      dispatched: launched.length,
      failedToDispatch: failed.length,
      details: dispatches,
    },
  };
}

Deno.serve(async (req) => {
  let body: RequestBody = {};
  try {
    if (req.headers.get('content-type')?.includes('application/json')) {
      body = await req.json();
    }
  } catch {
    /* empty body OK */
  }

  try {
    const res = await withRunLogging(
      'sync-live-events',
      body as Record<string, unknown>,
      () => run(body),
    );
    return Response.json({ ok: true, ...res });
  } catch (err) {
    const message = stringifyErr(err);
    console.error('[sync-live-events] failed:', message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
});

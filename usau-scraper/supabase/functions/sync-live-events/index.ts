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

const FLAGSHIP_LEVELS = ['CLUB', 'COLLEGE_D1', 'COLLEGE_D3', 'MASTERS', 'GRAND_MASTERS'];

// How long to wait for a child invocation to be ACCEPTED before moving on. We
// are NOT waiting for the child's ~90s of work — only for the functions gateway
// to acknowledge the request so we know it launched. If a child takes longer
// than this just to accept, we abort the wait (the child still runs) and record
// it as dispatched.
const DISPATCH_ACCEPT_TIMEOUT_MS = 4000;

interface RequestBody {
  dryRun?: boolean;
  divisions?: ('Men' | 'Women' | 'Mixed')[];
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
  const tomorrow = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);

  // start_date ≤ tomorrow AND end_date ≥ today → currently live or starting soon
  const { data: events, error } = await db
    .from('usau_events')
    .select('id, usau_slug, name, competition_level, start_date, end_date')
    .in('competition_level', FLAGSHIP_LEVELS)
    .lte('start_date', tomorrow)
    .gte('end_date', today)
    .order('start_date', { ascending: true });
  if (error) throw new Error(`load live events: ${stringifyErr(error)}`);

  const eventList = events ?? [];
  if (body.dryRun) {
    return {
      rowsProcessed: 0,
      result: { dryRun: true, count: eventList.length, events: eventList.map((e) => e.usau_slug) },
    };
  }

  // Dispatch all children concurrently. Each runs in its own invocation with
  // its own walltime budget — the orchestrator never does the heavy work.
  const dispatches = await Promise.all(
    eventList.map((e) => dispatchEventDetails(e.usau_slug, divisions)),
  );

  const launched = dispatches.filter((d) => d.dispatched);
  const failed = dispatches.filter((d) => !d.dispatched);

  return {
    rowsProcessed: 0, // orchestrator writes nothing itself — children do
    result: {
      liveEvents: eventList.length,
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

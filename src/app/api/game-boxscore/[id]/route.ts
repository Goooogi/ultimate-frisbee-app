// Lazy boxscore endpoint — fans out to roster-game-stats-for-player for every
// rostered player in this game. Called from the GameBoxscore client component
// when the user expands "Full player breakdown".
//
// Cached at the route level for 5 min; per-player game logs are independently
// cached for 1h by getPlayerGameLog, so warm calls resolve from the inner cache.
//
// Because a single cold call fans out to ~70 upstream UFA fetches, this route
// guards abuse three ways before doing that work:
//   1. Strict gameID validation — reject anything that isn't a real UFA id.
//   2. Best-effort per-IP rate limiting (per serverless instance).
//   3. In-flight coalescing — concurrent requests for the same uncached id
//      share one upstream fan-out instead of each spawning their own.

import { NextResponse } from 'next/server';
import { getGameBoxscore } from '@/lib/ufa/client';

export const revalidate = 300;

interface Ctx {
  params: { id: string };
}

// UFA gameIDs look like "2026-05-15-MAD-PIT" (date prefix + team abbrs), with
// an occasional slug suffix like "2025-08-23-allstar-game". Anchor on the
// date-and-teams shape and keep the charset tight.
const GAME_ID_RE = /^\d{4}-\d{2}-\d{2}-[A-Za-z0-9-]{1,40}$/;

// Best-effort in-memory limiter. Not shared across serverless instances, so
// this is a speed bump for the cheap "loop over distinct ids from one client"
// abuse vector, not a hard global quota.
const RATE_LIMIT = 30; // requests
const RATE_WINDOW_MS = 60_000; // per minute per IP
const hits = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  // Opportunistic cleanup so the map can't grow unbounded.
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (v.every((t) => now - t >= RATE_WINDOW_MS)) hits.delete(k);
    }
  }
  return recent.length > RATE_LIMIT;
}

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

// Coalesce concurrent cold requests for the same id into one fan-out.
const inFlight = new Map<string, Promise<Awaited<ReturnType<typeof getGameBoxscore>>>>();

export async function GET(req: Request, { params }: Ctx) {
  const id = params.id;

  if (!GAME_ID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid game id' }, { status: 400 });
  }

  if (isRateLimited(clientIp(req))) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': '60' } },
    );
  }

  try {
    let pending = inFlight.get(id);
    if (!pending) {
      pending = getGameBoxscore(id);
      inFlight.set(id, pending);
      // Clear the shared entry once the fetch settles (success OR error). The
      // .catch here only swallows the rejection on this bookkeeping chain so it
      // doesn't surface as an unhandledRejection — the real error still
      // propagates to the caller through `await pending` below.
      void pending.finally(() => inFlight.delete(id)).catch(() => {});
    }
    const boxscore = await pending;
    return NextResponse.json(boxscore, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

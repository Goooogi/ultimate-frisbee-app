// sync-event-rosters-dispatch: fan-out driver for roster scraping.
//
// Roster scraping for a whole event in one invocation can take ~28 min (one
// throttled fetch + many DB writes per team) and blows the edge ~150s walltime
// limit, getting killed mid-run. This dispatcher instead fires ONE
// `sync-event-rosters { slug, teamId }` invocation PER TEAM — fire-and-forget,
// each in its own walltime budget, in parallel. The dispatcher returns in a few
// seconds. (Same pattern as sync-live-events.)
//
// Request body: { slug: string, includeResolved?: boolean }
//   - By default only teams that have a resolved URL AND no roster yet for the
//     event's season are dispatched (idempotent re-run friendly).
//   - includeResolved=true re-scrapes every resolved team (force refresh).

import { supabase } from '../_shared/supabase.ts';

const DISPATCH_ACCEPT_TIMEOUT_MS = 4000;

/**
 * Max concurrent sync-event-rosters children, and max team scrapes launched per
 * cron firing (across ALL events in the window).
 *
 * WHY: this dispatcher used to `Promise.all` over every unrostered team in an
 * event, and loop that over every live event. Measured worst case on a busy
 * weekend: **413 team dispatches in one firing, 109 concurrent from a single
 * event**. Each child fetches its own USAU team page.
 *
 * That is precisely the burst that has burned us before —
 * scripts/backfill-college-rosters.sh exists *because* "the deployed dispatcher
 * fans out per-team IN PARALLEL — that's the exact burst pattern that got our
 * Deno egress IP rate-limited". Operator backfills run ONE request at a time
 * with a 12-20s gap; this cron was firing hundreds at once.
 *
 * The idempotent already-rostered filter hides this in steady state (a settled
 * event dispatches 0), but a NEW event weekend has every team unrostered, so
 * the full burst fires.
 *
 * Nothing is dropped: leftovers are picked up on the next firing (every 15 min,
 * Thu-Sun) because the filter re-computes what still needs a roster.
 */
const MAX_CONCURRENT_TEAMS = 6;
const MAX_TEAMS_PER_RUN = 40;
/**
 * Max teams a SINGLE event may launch in one firing. Without this, one large
 * event (measured: 109 teams) eats the entire per-run budget and starves the
 * other ~17 events in the window for hours. Capping each event's share spreads
 * the same 40 dispatches across ~5 events per firing instead of 1, so every
 * event makes progress each run.
 */
const MAX_TEAMS_PER_EVENT_PER_RUN = 8;

/**
 * Run `items` through `fn` with at most `limit` in flight. Preserves order.
 */
async function pooled<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
}

interface RequestBody {
  /** One event by slug (manual). Omit for LIVE mode: process every flagship
   *  event currently in its date window (used by the roster cron). */
  slug?: string;
  /** Re-scrape teams that already have a roster this season (force refresh). */
  includeResolved?: boolean;
}

// Mirror sync-live-events' "what's live" definition exactly.
const FLAGSHIP_LEVELS = [
  'CLUB',
  'COLLEGE_D1',
  'COLLEGE_D3',
  'MASTERS',
  'GRAND_MASTERS',
  'GREAT_GRAND_MASTERS',
];

function stringifyErr(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object') {
    const o = err as Record<string, unknown>;
    return [o.message, o.code && `(${o.code})`, o.details && `— ${o.details}`]
      .filter(Boolean).join(' ') || JSON.stringify(err);
  }
  return String(err);
}

/** Fire sync-event-rosters for one team without waiting for it to finish. */
async function dispatchTeam(slug: string, teamId: string): Promise<{ teamId: string; dispatched: boolean; note?: string }> {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DISPATCH_ACCEPT_TIMEOUT_MS);
  try {
    const res = await fetch(`${url}/functions/v1/sync-event-rosters`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, teamId }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    res.body?.cancel().catch(() => {});
    return { teamId, dispatched: true };
  } catch (err) {
    clearTimeout(timer);
    // AbortError = child took >accept-timeout to respond; it's still running.
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { teamId, dispatched: true, note: 'accept-timeout (still running)' };
    }
    return { teamId, dispatched: false, note: stringifyErr(err) };
  }
}

/** AWAIT resolve-event-team-urls for one event (fast ~10s) so URLs exist
 *  before we fan out per-team roster scrapes. Best-effort: a failure here just
 *  means fewer teams have resolved URLs this run; next run picks them up. */
async function resolveEventUrls(slug: string): Promise<void> {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return;
  try {
    await fetch(`${url}/functions/v1/resolve-event-team-urls`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug }),
    });
  } catch (err) {
    console.warn(`[roster-dispatch] resolve failed for ${slug}:`, stringifyErr(err));
  }
}

interface EventDispatchResult {
  slug: string;
  season: number;
  teamsToScrape: number;
  /** Teams left for a later firing because the per-run budget ran out. */
  deferred?: number;
  dispatched: number;
  failedToDispatch: number;
}

/** Resolve URLs (best-effort) then fan out one roster scrape per team that
 *  still needs one for the season. Returns a per-event summary. */
async function dispatchEvent(
  db: ReturnType<typeof supabase>,
  eventId: string,
  slug: string,
  season: number,
  includeResolved: boolean,
  /** Max teams this event may launch this run (global budget remainder). */
  budget: number = Number.MAX_SAFE_INTEGER,
): Promise<EventDispatchResult> {
  await resolveEventUrls(slug);

  const { data: parts, error: ptErr } = await db
    .from('usau_event_teams')
    .select('team_id')
    .eq('event_id', eventId)
    .not('usau_event_team_url_id', 'is', null);
  if (ptErr) throw new Error(`load event_teams: ${stringifyErr(ptErr)}`);
  let teamIds = (parts ?? []).map((p) => p.team_id as string);
  if (teamIds.length === 0) {
    return { slug, season, teamsToScrape: 0, deferred: 0, dispatched: 0, failedToDispatch: 0 };
  }

  // Idempotent: skip teams that already have a roster this season.
  if (!includeResolved) {
    const { data: haveRoster } = await db
      .from('usau_rosters')
      .select('team_id')
      .eq('season', season)
      .in('team_id', teamIds);
    const done = new Set((haveRoster ?? []).map((r) => r.team_id as string));
    teamIds = teamIds.filter((id) => !done.has(id));
  }

  // Bound BOTH the per-run count (global budget) and the in-flight concurrency.
  // Teams beyond the budget are simply left for the next firing — the
  // already-rostered filter above re-computes the remainder each time.
  //
  // SHUFFLE before slicing: the DB query above has no ORDER BY, so Postgres
  // returns teamIds in a stable-ish but arbitrary storage order. A large
  // event (40+ teams) blows through MAX_TEAMS_PER_EVENT_PER_RUN every firing,
  // and without a shuffle the SAME ~8 front-of-list teams win the slice every
  // single time — teams past that position starve indefinitely (confirmed:
  // "2026 Elite Select Challenge" dispatched only 11 of 47 teams across 4+
  // days of cron firings; Chain Lightning and 35 others never got a single
  // scrape attempt). Shuffling gives every unrostered team a fair chance each
  // firing, so a large event's roster completes over a few runs instead of
  // never finishing (Hunter, 2026-08-20).
  for (let i = teamIds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [teamIds[i], teamIds[j]] = [teamIds[j], teamIds[i]];
  }
  const totalNeeded = teamIds.length;
  const allowance = Math.max(0, Math.min(budget, MAX_TEAMS_PER_EVENT_PER_RUN));
  const slice = allowance >= totalNeeded ? teamIds : teamIds.slice(0, allowance);
  const dispatches = await pooled(slice, MAX_CONCURRENT_TEAMS, (id) => dispatchTeam(slug, id));
  const launched = dispatches.filter((d) => d.dispatched).length;
  return {
    slug, season,
    teamsToScrape: totalNeeded,
    deferred: totalNeeded - slice.length,
    dispatched: launched,
    failedToDispatch: dispatches.length - launched,
  };
}

async function run(body: RequestBody) {
  const db = supabase();
  const includeResolved = !!body.includeResolved;
  const slug = body.slug?.trim();

  // ── Single-event mode (manual) ──────────────────────────────────────────
  if (slug) {
    const { data: event, error: evErr } = await db
      .from('usau_events')
      .select('id, season')
      .eq('usau_slug', slug)
      .maybeSingle();
    if (evErr) throw new Error(`load event: ${stringifyErr(evErr)}`);
    if (!event) throw new Error(`event '${slug}' not found`);
    const r = await dispatchEvent(db, event.id, slug, event.season, includeResolved);
    return { rowsProcessed: 0, result: { mode: 'event', ...r } };
  }

  // ── Live mode (cron): flagship events in (or about to enter) their window ─
  // Rosters/pools/seeds get published on USAU up to ~a week before an event
  // starts, so we scrape a LOOKAHEAD window: start_date ≤ today + 7 days AND
  // end_date ≥ today. This picks up pools/teams a week out (e.g. Pro Elite
  // Challenge West's Sat pools seeded days before the event) rather than only
  // once the event is live. (Live scores still come from sync-live-events,
  // which keeps its tighter same-day window.)
  const today = new Date().toISOString().slice(0, 10);
  const lookahead = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);
  const { data: events, error: evErr } = await db
    .from('usau_events')
    .select('id, usau_slug, season')
    .in('competition_level', FLAGSHIP_LEVELS)
    .lte('start_date', lookahead)
    .gte('end_date', today)
    .order('start_date', { ascending: true });
  if (evErr) throw new Error(`load live events: ${stringifyErr(evErr)}`);

  const live = events ?? [];
  const perEvent: EventDispatchResult[] = [];
  // Global per-run budget shared across ALL events in the window. Without this,
  // 18 events x ~100 unrostered teams would still launch 400+ scrapes in one
  // firing even with per-event concurrency capped. Remaining teams are picked up
  // by the next cron firing (every 15 min Thu-Sun).
  let budgetLeft = MAX_TEAMS_PER_RUN;
  // Sequential across events (each only fires fast resolve + fan-out, no heavy
  // work) so we respect the source with one event's resolve at a time.
  for (const e of live) {
    if (budgetLeft <= 0) {
      // Out of budget: record the event as fully deferred WITHOUT calling
      // resolveEventUrls (which is itself a USAU request).
      perEvent.push({ slug: e.usau_slug, season: e.season, teamsToScrape: 0, deferred: 0, dispatched: 0, failedToDispatch: 0 });
      continue;
    }
    try {
      const r = await dispatchEvent(db, e.id, e.usau_slug, e.season, includeResolved, budgetLeft);
      budgetLeft -= r.dispatched;
      perEvent.push(r);
    } catch (err) {
      perEvent.push({ slug: e.usau_slug, season: e.season, teamsToScrape: 0, deferred: 0, dispatched: 0, failedToDispatch: 0 });
      console.error(`[roster-dispatch] ${e.usau_slug} failed:`, stringifyErr(err));
    }
  }

  return {
    rowsProcessed: 0,
    result: {
      mode: 'live',
      liveEvents: live.length,
      maxTeamsPerRun: MAX_TEAMS_PER_RUN,
      maxTeamsPerEventPerRun: MAX_TEAMS_PER_EVENT_PER_RUN,
      maxConcurrentTeams: MAX_CONCURRENT_TEAMS,
      totalDispatched: perEvent.reduce((s, r) => s + r.dispatched, 0),
      totalDeferred: perEvent.reduce((s, r) => s + (r.deferred ?? 0), 0),
      perEvent,
    },
  };
}

Deno.serve(async (req) => {
  let body: RequestBody = {};
  try {
    if (req.headers.get('content-type')?.includes('application/json')) body = await req.json();
  } catch { /* empty ok */ }

  try {
    // No run-logging wrapper needed — children log their own rows; this just dispatches.
    const res = await run(body);
    return Response.json({ ok: true, ...res.result });
  } catch (err) {
    const message = stringifyErr(err);
    console.error('[sync-event-rosters-dispatch] failed:', message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
});

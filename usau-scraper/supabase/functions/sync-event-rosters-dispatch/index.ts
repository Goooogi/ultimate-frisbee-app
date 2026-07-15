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
    return { slug, season, teamsToScrape: 0, dispatched: 0, failedToDispatch: 0 };
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

  const dispatches = await Promise.all(teamIds.map((id) => dispatchTeam(slug, id)));
  const launched = dispatches.filter((d) => d.dispatched).length;
  return {
    slug, season,
    teamsToScrape: teamIds.length,
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
  // Sequential across events (each only fires fast resolve + fan-out, no heavy
  // work) so we respect the source with one event's resolve at a time.
  for (const e of live) {
    try {
      perEvent.push(await dispatchEvent(db, e.id, e.usau_slug, e.season, includeResolved));
    } catch (err) {
      perEvent.push({ slug: e.usau_slug, season: e.season, teamsToScrape: 0, dispatched: 0, failedToDispatch: 0 });
      console.error(`[roster-dispatch] ${e.usau_slug} failed:`, stringifyErr(err));
    }
  }

  return {
    rowsProcessed: 0,
    result: {
      mode: 'live',
      liveEvents: live.length,
      totalDispatched: perEvent.reduce((s, r) => s + r.dispatched, 0),
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

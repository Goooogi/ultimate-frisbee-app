// sync-event-everything: end-to-end ingest for ONE event slug.
//
// Pipeline (sequential, idempotent):
//   1. resolve-event-team-urls — fetch the event's schedule page, write
//      base64 EventTeamIds into usau_event_teams.usau_event_team_url_id.
//      Skips participations that already have a url_id.
//   2. sync-event-rosters — for each participation with a url_id, fetch
//      the team page and write rosters + per-event goals/assists.
//
// This is the function `pg_cron` should call once per event we care
// about. It composes the two existing functions so we keep their
// single-purpose design but offer one entry point for the common case.
//
// Request body:
//   { slug: string }      // required: event slug (e.g. "2025-usau-pro-championships")
//
// Use ingest-from-ultirzr first to create the event + games rows; this
// wrapper assumes the event already exists and only fills in player
// data via the USAU team-page scraper.

import { supabase, withRunLogging } from '../_shared/supabase.ts';

interface RequestBody {
  slug?: string;
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

/** Invoke another Edge Function by HTTP. We use service-role auth so the
 *  callee sees this as a privileged caller, matching how pg_cron will
 *  invoke it. */
async function invokeFunction(name: string, body: Record<string, unknown>): Promise<unknown> {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required');

  const res = await fetch(`${url}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    // non-JSON response (HTML error page etc.)
  }
  if (!res.ok) {
    const summary =
      parsed && typeof parsed === 'object' && 'error' in parsed
        ? (parsed as { error: unknown }).error
        : text.slice(0, 300);
    throw new Error(`${name} → HTTP ${res.status}: ${stringifyErr(summary)}`);
  }
  return parsed;
}

async function run(body: RequestBody) {
  const slug = body.slug?.trim();
  if (!slug) throw new Error('slug is required');

  const db = supabase();

  // Verify the event exists before we start invoking downstream functions.
  // Cheap pre-check + lets us return a clearer error.
  const { data: event, error } = await db
    .from('usau_events')
    .select('id, usau_slug, name')
    .ilike('usau_slug', slug)
    .maybeSingle();
  if (error) throw new Error(`load event: ${stringifyErr(error)}`);
  if (!event) {
    throw new Error(`event '${slug}' not found — run ingest-from-ultirzr first`);
  }

  // Stage 1: resolve url_ids. Pass the slug exactly so resolver only
  // touches this event (skipping its bulk-scan logic).
  const resolveResp = await invokeFunction('resolve-event-team-urls', {
    slug: event.usau_slug,
    limit: 1,
  }) as {
    ok: boolean;
    resolvedTotal?: number;
    skippedTotal?: number;
    perEvent?: Array<{ slug: string; resolved: number; skipped: number; error?: string }>;
  };

  const resolveSummary = resolveResp.perEvent?.[0] ?? null;
  // resolver may have updated the slug if the original 404'd — use the
  // slug it returned so the roster step hits the same event.
  const slugAfterResolve = resolveSummary?.slug ?? event.usau_slug;

  // Stage 2: rosters. Skipped if no participations have url_ids (e.g. the
  // schedule page was unscrapeable). We surface the resolver's stats
  // either way so the caller can see what happened.
  let rosterResp: {
    ok: boolean;
    teams?: number;
    players?: number;
    stats?: { goals: number; assists: number };
    error?: string;
  } | null = null;
  let rosterError: string | null = null;
  try {
    rosterResp = await invokeFunction('sync-event-rosters', {
      slug: slugAfterResolve,
    }) as typeof rosterResp;
  } catch (err) {
    rosterError = stringifyErr(err);
  }

  const rowsProcessed =
    (resolveResp.resolvedTotal ?? 0) +
    (rosterResp?.teams ?? 0) +
    (rosterResp?.players ?? 0);

  return {
    rowsProcessed,
    result: {
      slug: slugAfterResolve,
      resolve: {
        resolved: resolveSummary?.resolved ?? 0,
        skipped: resolveSummary?.skipped ?? 0,
        ...(resolveSummary?.error ? { error: resolveSummary.error } : {}),
      },
      roster: rosterError
        ? { error: rosterError }
        : {
            teams: rosterResp?.teams ?? 0,
            players: rosterResp?.players ?? 0,
            goals: rosterResp?.stats?.goals ?? 0,
            assists: rosterResp?.stats?.assists ?? 0,
          },
    },
  };
}

Deno.serve(async (req) => {
  let body: RequestBody = {};
  try {
    if (req.headers.get('content-type')?.includes('application/json')) {
      body = await req.json();
    } else {
      const url = new URL(req.url);
      if (url.searchParams.get('slug')) body.slug = url.searchParams.get('slug')!;
    }
  } catch {
    // empty body OK
  }

  try {
    const res = await withRunLogging(
      'sync-event-everything',
      body as Record<string, unknown>,
      () => run(body),
    );
    return Response.json({ ok: true, ...res });
  } catch (err) {
    const message = stringifyErr(err);
    console.error('[sync-event-everything] failed:', message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
});

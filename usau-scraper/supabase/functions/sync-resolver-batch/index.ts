// sync-resolver-batch: invokes resolve-event-team-urls for one tiny batch
// of unresolved events. Designed for pg_cron to call repeatedly so we can
// process backlog overnight without breaching Edge Function CPU limits
// (resolver is bursty — slug-variant probes plus 5s throttled fetches).
//
// One invocation processes `limit` events (default 2). The resolver
// function itself stops touching new events once its internal loop
// exhausts the limit, so this is just a thin scheduler wrapper.

import { supabase, withRunLogging } from '../_shared/supabase.ts';

interface RequestBody {
  limit?: number;
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
  try { parsed = JSON.parse(text); } catch { /* non-JSON */ }
  if (!res.ok) {
    const summary = parsed && typeof parsed === 'object' && 'error' in parsed
      ? (parsed as { error: unknown }).error
      : text.slice(0, 300);
    throw new Error(`${name} → HTTP ${res.status}: ${stringifyErr(summary)}`);
  }
  return parsed;
}

async function run(body: RequestBody) {
  const limit = body.limit ?? 2;
  const db = supabase();

  // Skip the call entirely if there's nothing to resolve — keeps the
  // run-log clean and avoids wasted Edge Function invocations once we
  // drain the backlog.
  const { count, error } = await db
    .from('usau_event_teams')
    .select('*', { count: 'exact', head: true })
    .is('usau_event_team_url_id', null);
  if (error) throw new Error(`count unresolved: ${stringifyErr(error)}`);
  if (!count || count === 0) {
    return { rowsProcessed: 0, result: { remaining: 0, skipped: true } };
  }

  const resp = await invokeFunction('resolve-event-team-urls', { limit }) as {
    ok: boolean;
    events?: number;
    resolvedTotal?: number;
    skippedTotal?: number;
    error?: string;
  };

  return {
    rowsProcessed: resp.resolvedTotal ?? 0,
    result: {
      remainingBefore: count,
      eventsProcessed: resp.events ?? 0,
      resolved: resp.resolvedTotal ?? 0,
      skipped: resp.skippedTotal ?? 0,
      ...(resp.error ? { error: resp.error } : {}),
    },
  };
}

Deno.serve(async (req) => {
  let body: RequestBody = {};
  try {
    if (req.headers.get('content-type')?.includes('application/json')) {
      body = await req.json();
    }
  } catch { /* empty body OK */ }

  try {
    const res = await withRunLogging(
      'sync-resolver-batch',
      body as Record<string, unknown>,
      () => run(body),
    );
    return Response.json({ ok: true, ...res });
  } catch (err) {
    const message = stringifyErr(err);
    console.error('[sync-resolver-batch] failed:', message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
});

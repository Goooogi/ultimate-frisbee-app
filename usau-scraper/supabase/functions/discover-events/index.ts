// discover-events: orchestrates multi-year tournament discovery.
//
// For each requested year:
//   1. Invoke sync-events with that year → walks USAU's calendar at
//      /events/tournament/?Year={year} and upserts every listed tournament
//      into usau_events.
//   2. After that completes, classify every event in that season against the
//      current usau_event_templates rows (keyword + season-window rules) and
//      stamp template_key on rows that match a flagship family.
//
// USAU's calendar page is the authoritative source for what events exist —
// we no longer guess slugs. Templates are now classifiers, not URL builders.
//
// Request body:
//   {
//     years?: number[]    // default: [currentYear, currentYear - 1]
//     ingest?: boolean    // if true, also calls sync-event-details for each
//                         // event matching a flagship template (one call per
//                         // event, all 3 divisions). default: false.
//   }

import { BASE_URL, classifyEventTemplate, type EventTemplate } from '../_shared/parse.ts';
import { supabase, withRunLogging } from '../_shared/supabase.ts';

interface RequestBody {
  years?: number[];
  ingest?: boolean;
}

function stringifyErr(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object') {
    const obj = err as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof obj.message === 'string') parts.push(obj.message);
    if (typeof obj.code === 'string') parts.push(`(${obj.code})`);
    if (typeof obj.details === 'string') parts.push(`— ${obj.details}`);
    return parts.length > 0 ? parts.join(' ') : JSON.stringify(err);
  }
  return String(err);
}

async function invokeFunction(name: string, body: Record<string, unknown>): Promise<unknown> {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required');

  const res = await fetch(`${url}/functions/v1/${name}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    throw new Error(`${name} → HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  return parsed;
}

async function run(body: RequestBody) {
  const db = supabase();
  const now = new Date();
  const years = body.years && body.years.length > 0
    ? body.years
    : [now.getUTCFullYear(), now.getUTCFullYear() - 1];
  const ingest = !!body.ingest;

  // Load current templates once — classifier reuses them for every event.
  const { data: templateRows, error: tmplErr } = await db
    .from('usau_event_templates')
    .select('key, display_name, competition_level, match_rules, is_flagship');
  if (tmplErr) throw new Error(`load templates: ${stringifyErr(tmplErr)}`);
  const templates: EventTemplate[] = (templateRows ?? []).map((r) => ({
    key: r.key as string,
    display_name: r.display_name as string,
    competition_level: r.competition_level as string | null,
    match_rules: r.match_rules as EventTemplate['match_rules'],
    is_flagship: r.is_flagship as boolean | undefined,
  }));

  const perYear: Array<{
    year: number;
    syncOk: boolean;
    eventsFromSync: number;
    classified: number;
    flagshipNewlyTagged: number;
    ingestQueued: number;
    error?: string;
  }> = [];

  for (const year of years) {
    let syncOk = false;
    let eventsFromSync = 0;
    let classified = 0;
    let flagshipNewlyTagged = 0;
    let ingestQueued = 0;
    let yearError: string | undefined;

    try {
      // Step 1: walk USAU's calendar for this year. sync-events handles the
      // upsert; we just read the count back.
      // withRunLogging flattens its T directly into the response — sync-events
      // returns { rowsProcessed, result: { events, seasons, year } }, and
      // withRunLogging returns just the T (result). At the HTTP layer the
      // wrapper spreads { ok: true, ...res } where res.events/.seasons/.year
      // land at the top level. So we read events at the top level too.
      const syncResp = await invokeFunction('sync-events', { year }) as {
        ok?: boolean;
        events?: number;
        seasons?: number[];
        year?: number;
        error?: string;
      };
      syncOk = !!syncResp.ok;
      eventsFromSync = syncResp.events ?? 0;
      if (!syncOk) {
        throw new Error(`sync-events year=${year}: ${syncResp.error ?? 'unknown'}`);
      }
    } catch (err) {
      yearError = stringifyErr(err);
      perYear.push({ year, syncOk, eventsFromSync, classified, flagshipNewlyTagged, ingestQueued, error: yearError });
      continue;
    }

    // Step 2: classify every event in this season. We re-classify even already-
    // classified events so that template-rule changes propagate. Templates are
    // small (~20 rows); event scans per season are <250 rows. Cheap.
    const { data: events, error: evErr } = await db
      .from('usau_events')
      .select('id, usau_slug, name, start_date, template_key')
      .eq('season', year);
    if (evErr) {
      yearError = `load events for ${year}: ${stringifyErr(evErr)}`;
      perYear.push({ year, syncOk, eventsFromSync, classified, flagshipNewlyTagged, ingestQueued, error: yearError });
      continue;
    }

    const updates: Array<{ id: string; template_key: string | null }> = [];
    const newlyTaggedSlugs: string[] = [];
    for (const e of events ?? []) {
      const key = classifyEventTemplate(
        { name: e.name, usau_slug: e.usau_slug, start_date: e.start_date },
        templates,
      );
      // Only push an update if the value actually changes (avoids a write storm).
      if (key !== (e.template_key as string | null)) {
        updates.push({ id: e.id as string, template_key: key });
        if (key && !e.template_key) newlyTaggedSlugs.push(e.usau_slug as string);
      }
      if (key) classified++;
    }

    // Apply updates in batches of 200 (PostgREST request size limit comfortable).
    for (let i = 0; i < updates.length; i += 200) {
      const batch = updates.slice(i, i + 200);
      // Build a single CASE-based update via per-row upserts. usau_slug has a
      // unique constraint; using upsert on id stays clean.
      for (const u of batch) {
        const { error: upErr } = await db
          .from('usau_events')
          .update({ template_key: u.template_key })
          .eq('id', u.id);
        if (upErr) {
          console.error(`[discover-events] update id=${u.id}:`, stringifyErr(upErr));
        }
      }
    }
    flagshipNewlyTagged = newlyTaggedSlugs.length;

    // Step 3 (optional): fire sync-event-details for newly-tagged flagship events
    // so we don't have to wait for the next sync-live-events tick. We do not
    // re-ingest already-tagged events here — they're either in their date window
    // (sync-live-events will pick them up) or static historical data.
    if (ingest && newlyTaggedSlugs.length > 0) {
      for (const slug of newlyTaggedSlugs) {
        try {
          await invokeFunction('sync-event-details', {
            slug,
            divisions: ['Men', 'Women', 'Mixed'],
          });
          ingestQueued++;
        } catch (err) {
          console.error(`[discover-events] ingest ${slug}:`, stringifyErr(err));
        }
      }
    }

    perYear.push({ year, syncOk, eventsFromSync, classified, flagshipNewlyTagged, ingestQueued });
  }

  const totalClassified = perYear.reduce((s, p) => s + p.classified, 0);
  const totalNew = perYear.reduce((s, p) => s + p.flagshipNewlyTagged, 0);
  return {
    rowsProcessed: totalClassified,
    result: {
      years,
      templates: templates.length,
      totalClassified,
      totalFlagshipNewlyTagged: totalNew,
      perYear,
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
      const yearsQ = url.searchParams.get('years');
      if (yearsQ) {
        body.years = yearsQ.split(',')
          .map((y) => parseInt(y.trim(), 10))
          .filter((y) => !isNaN(y));
      }
      const ingestQ = url.searchParams.get('ingest');
      if (ingestQ) body.ingest = ingestQ === 'true' || ingestQ === '1';
    }
  } catch {
    /* empty body OK */
  }

  try {
    const res = await withRunLogging(
      'discover-events',
      body as Record<string, unknown>,
      () => run(body),
    );
    return Response.json({ ok: true, ...res });
  } catch (err) {
    const message = stringifyErr(err);
    console.error('[discover-events] failed:', message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
});

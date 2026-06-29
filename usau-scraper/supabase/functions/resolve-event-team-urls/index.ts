// resolve-event-team-urls: for each event, fetch its USAU schedule page,
// pull every EventTeamId href (base64 per-event id), match by team name
// against our usau_event_teams rows, and write usau_event_team_url_id.
//
// Why this exists: ingest-from-ultirzr populates usau_event_teams with
// the persistent NUMERIC team id (e.g. 39463). USAU's team-page URL
// (where rosters live) takes the base64 per-event id (e.g.
// "TrJn0gcQQr4O2+tAt35FJlI2q5fW8qROOFxvNWZKBtE="). They're different.
//
// Request body:
//   { season?: number,        // filter to one season
//     limit?: number,         // cap number of events processed (default 50)
//     skipResolved?: boolean, // skip events where ALL participations
//                             //   already have a url_id (default true)
//     slug?: string }         // process exactly one event by slug
//
// Idempotent: re-running won't overwrite existing values. Polite: 2s
// between USAU fetches via the shared http helper.

import { fetchHtml } from '../_shared/http.ts';
import { eventScheduleUrlVariants, extractTeamNameAndSeed } from '../_shared/parse.ts';
import { supabase, withRunLogging } from '../_shared/supabase.ts';

interface RequestBody {
  season?: number;
  limit?: number;
  skipResolved?: boolean;
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

/** Parse every EventTeamId link out of a schedule page's HTML, returning a
 *  map of normalized team name → base64 url id. Same team can appear
 *  multiple times in bracket/pool blocks; we keep the first occurrence. */
function extractEventTeamIdsByName(html: string): Map<string, string> {
  const map = new Map<string, string>();
  // Match <a href="...EventTeamId=XXX...">Team Name (3)</a>
  const re = /<a[^>]*href="[^"]*EventTeamId=([^"&]+)[^"]*"[^>]*>([^<]+)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const urlId = decodeURIComponent(m[1]);
    const { name } = extractTeamNameAndSeed(m[2]);
    const key = name.toLowerCase().trim();
    if (!key) continue;
    if (!map.has(key)) map.set(key, urlId);
  }
  return map;
}

/** Generate plausible slug variants. ultirzr sometimes derives slugs in
 *  ways that don't match USAU's URL (e.g. "Men's" → "men-s" instead of
 *  "mens"). Try the primary first, then fall through alternates. */
function slugVariants(slug: string): string[] {
  const variants = new Set<string>();
  variants.add(slug);
  variants.add(slug.replace(/-s-/g, 's-'));     // men-s-regional → mens-regional
  variants.add(slug.replace(/-s$/, 's'));        // …-men-s → …-mens
  variants.add(slug.replace(/-s-/g, 's-').replace(/-s$/, 's'));
  return Array.from(variants);
}

async function resolveOneEvent(
  db: ReturnType<typeof supabase>,
  eventUuid: string,
  slug: string,
  competitionLevel: string | null,
): Promise<{ resolved: number; skipped: number; error?: string; usedSlug?: string }> {
  const urlLevel: 'Club' | 'College' = competitionLevel?.startsWith('COLLEGE') ? 'College' : 'Club';

  // Load all unresolved participations + each team's gender_division.
  // A single event can host multiple genders (e.g. Nationals has Men's,
  // Women's, Mixed divisions all under one event_id) — we need to try
  // each gender's schedule URL separately.
  const { data: parts, error: loadErr } = await db
    .from('usau_event_teams')
    .select('team_id, usau_teams(name, gender_division)')
    .eq('event_id', eventUuid)
    .is('usau_event_team_url_id', null);
  if (loadErr) {
    return { resolved: 0, skipped: 0, error: `load participations: ${stringifyErr(loadErr)}` };
  }

  type Part = {
    team_id: string;
    usau_teams: { name: string; gender_division: string | null } | null;
  };
  const partsByGender = new Map<string, Part[]>();
  for (const p of (parts ?? []) as unknown as Part[]) {
    const g = p.usau_teams?.gender_division ?? 'Men';
    if (!partsByGender.has(g)) partsByGender.set(g, []);
    partsByGender.get(g)!.push(p);
  }
  // Make sure 'Men' is tried first for slug-detection so the canonical
  // updated slug (if we discover a working variant) gets persisted from
  // the most common case.
  const genderOrder = (['Men', 'Women', 'Mixed', 'Open'] as const).filter((g) => partsByGender.has(g));
  if (genderOrder.length === 0) return { resolved: 0, skipped: 0 };

  let totalResolved = 0;
  let totalSkipped = 0;
  let lastUsedSlug: string | null = null;

  for (const gender of genderOrder) {
    const genderParts = partsByGender.get(gender) ?? [];
    if (genderParts.length === 0) continue;

    // Map "Mixed/Open" → gender code USAU uses in its URL. USAU's college
    // pages use "Men" / "Women", club pages use "Men"/"Women"/"Mixed".
    const urlGender: 'Men' | 'Women' | 'Mixed' =
      gender === 'Women' ? 'Women' : gender === 'Mixed' ? 'Mixed' : 'Men';

    let html: string | null = null;
    let usedSlug: string | null = null;
    outer: for (const candidate of slugVariants(slug)) {
      for (const url of eventScheduleUrlVariants(candidate, urlGender, urlLevel)) {
        try {
          html = await fetchHtml(url);
          usedSlug = candidate;
          break outer;
        } catch (err) {
          const msg = stringifyErr(err);
          if (/HTTP 404/.test(msg) || /404 /.test(msg)) continue;
          // Non-404 = real error; bubble out
          return { resolved: totalResolved, skipped: totalSkipped, error: msg };
        }
      }
    }
    if (!html || !usedSlug) {
      // No schedule page for this gender — count as skipped.
      totalSkipped += genderParts.length;
      continue;
    }
    lastUsedSlug = usedSlug;

    // Persist the working slug only once if it changed.
    if (usedSlug !== slug) {
      const { error: updErr } = await db
        .from('usau_events')
        .update({ usau_slug: usedSlug })
        .eq('id', eventUuid);
      if (updErr) {
        console.error(`[resolver] failed to update slug ${slug} → ${usedSlug}: ${stringifyErr(updErr)}`);
      }
    }

    const byName = extractEventTeamIdsByName(html);
    if (byName.size === 0) {
      totalSkipped += genderParts.length;
      continue;
    }

    for (const p of genderParts) {
      const name = p.usau_teams?.name;
      if (!name) {
        totalSkipped++;
        continue;
      }
      const lookupKey = name.toLowerCase().replace(/\s+/g, ' ').trim();
      const urlId = byName.get(lookupKey);
      if (!urlId) {
        totalSkipped++;
        continue;
      }
      const { error: updErr } = await db
        .from('usau_event_teams')
        .update({ usau_event_team_url_id: urlId })
        .eq('event_id', eventUuid)
        .eq('team_id', p.team_id);
      if (updErr) {
        totalSkipped++;
        continue;
      }
      totalResolved++;
    }
  }

  return { resolved: totalResolved, skipped: totalSkipped, usedSlug: lastUsedSlug ?? undefined };
}

async function run(body: RequestBody) {
  const db = supabase();
  const limit = body.limit ?? 50;
  const skipResolved = body.skipResolved ?? true;

  // First, find every event-id that has at least one unresolved participation.
  // PostgREST doesn't do subqueries directly, so we ask for distinct event_ids
  // off usau_event_teams where url_id is null. That guarantees every event
  // we touch has real work to do.
  let unresolvedQuery = db
    .from('usau_event_teams')
    .select('event_id, usau_events!inner(id, usau_slug, season, competition_level, start_date)')
    .is('usau_event_team_url_id', null);
  if (body.season) unresolvedQuery = unresolvedQuery.eq('usau_events.season', body.season);
  if (body.slug) unresolvedQuery = unresolvedQuery.ilike('usau_events.usau_slug', body.slug);
  const { data: unresolvedRows, error } = await unresolvedQuery;
  if (error) throw new Error(`load events: ${stringifyErr(error)}`);

  type EventRow = {
    id: string;
    usau_slug: string;
    season: number;
    start_date: string | null;
    competition_level: string | null;
  };
  const seen = new Map<string, EventRow>();
  for (const row of unresolvedRows ?? []) {
    const ev = (row as { usau_events: EventRow | null }).usau_events;
    if (ev && !seen.has(ev.id)) seen.set(ev.id, ev);
  }
  // Sort newest first then take the limit.
  const events = Array.from(seen.values())
    .sort((a, b) => (b.start_date ?? '').localeCompare(a.start_date ?? ''))
    .slice(0, limit);

  if (events.length === 0) {
    return { rowsProcessed: 0, result: { events: 0, resolvedTotal: 0 } };
  }

  const perEvent: Array<{
    slug: string;
    season: number;
    resolved: number;
    skipped: number;
    error?: string;
  }> = [];

  for (const e of events) {
    // No need for the per-event count check anymore — we already filtered.
    if (!skipResolved) {
      // future: support force-rerun
    }
    const result = await resolveOneEvent(db, e.id, e.usau_slug, e.competition_level);
    perEvent.push({
      slug: result.usedSlug ?? e.usau_slug,
      season: e.season,
      resolved: result.resolved,
      skipped: result.skipped,
      ...(result.error ? { error: result.error } : {}),
    });
  }

  const resolvedTotal = perEvent.reduce((s, r) => s + r.resolved, 0);
  const skippedTotal = perEvent.reduce((s, r) => s + r.skipped, 0);

  return {
    rowsProcessed: resolvedTotal,
    result: {
      events: perEvent.length,
      resolvedTotal,
      skippedTotal,
      perEvent,
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
      if (url.searchParams.get('season')) body.season = parseInt(url.searchParams.get('season')!, 10);
      if (url.searchParams.get('limit')) body.limit = parseInt(url.searchParams.get('limit')!, 10);
      if (url.searchParams.get('slug')) body.slug = url.searchParams.get('slug')!;
    }
  } catch {
    // empty body OK
  }

  try {
    const res = await withRunLogging(
      'resolve-event-team-urls',
      body as Record<string, unknown>,
      () => run(body),
    );
    return Response.json({ ok: true, ...res });
  } catch (err) {
    const message = stringifyErr(err);
    console.error('[resolve-event-team-urls] failed:', message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
});

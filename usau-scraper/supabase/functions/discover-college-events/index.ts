// discover-college-events: enumerate college event slugs from USAU's calendar.
//
// College events do NOT appear in the default (Club-centric) tournament
// calendar view, and the ?Year= GET param is a no-op from our Edge IP (USAU
// always returns its "current" state from a cold ViewState). The only reliable
// way to list college events is the calendar's Competition Level filter, which
// is an ASP.NET form postback (btnSubmit + drpCompetitionLevelId), NOT a GET
// param.
//
// drpCompetitionLevelId values (from the live <select>, probed 2026-06-03):
//   27 = College - Men, 28 = College - Women, 4 = College - Mixed
//
// Mechanism (two round-trips):
//   1. GET /events/tournament/ → capture fresh __VIEWSTATE/__VIEWSTATEGENERATOR/
//      __EVENTVALIDATION via parseHiddenFields().
//   2. POST same URL with the hidden fields + drpCompetitionLevelId + btnSubmit
//      → parse the resulting gvPastEvents table for college slugs.
//   3. If a "Next" pager appears, walk it (postForm loop), carrying fresh
//      ViewState from each response.
//
// Request body: { competitionLevelId: 27 | 28 | 4, dryRun?: boolean }
//   dryRun=true (default) returns the slug list WITHOUT writing usau_events.
//   Run dryRun first to confirm the postback filter actually works from our IP
//   before committing any DB writes.

import { fetchHtml, postForm } from '../_shared/http.ts';
import { parseHiddenFields } from '../_shared/aspnet.ts';
import {
  BASE_URL,
  parseHtml,
  SELECTORS,
  extractEventSlug,
  parseDateRange,
  classifyCompetitionGroup,
} from '../_shared/parse.ts';
import { supabase, withRunLogging } from '../_shared/supabase.ts';

const CALENDAR_URL = `${BASE_URL}/events/tournament/`;
const PAST_GRID_ID = 'CT_HP_Mid_1_gvPastEvents';
const MAX_PAGES = 40; // max pages PARSED per invocation. With gapMs=2000 (the
                      // backfill default below), ~35 pages × 2s ≈ 70s — under the
                      // Edge ~150s limit — so one call walks a gender's FULL
                      // history (2026→2021) without chunked re-walks.
const DEFAULT_GAP_MS = 2000; // light browsing for the discovery walk (a few calls
                             // total, not the sustained roster bursts that need 5s).

interface DiscoveredEvent {
  usau_slug: string;
  name: string;
  season: number;
  start_date: string | null;
  end_date: string | null;
  // competition_level is derived from the competition-group cell text via
  // classifyCompetitionGroup() so D-I vs D-III is distinguished correctly
  // (the dropdown ID alone can't tell them apart).
  competition_level: ReturnType<typeof classifyCompetitionGroup>['competition_level'];
}

interface RequestBody {
  competitionLevelId?: 27 | 28 | 4;
  dryRun?: boolean;
  /** 1-based result page to begin PARSING at (caller drives chunked windows). */
  startPage?: number;
  /** How many pages to parse this invocation (default 3, capped at MAX_PAGES). */
  pageCount?: number;
  /** Throttle gap (ms) between USAU fetches during the PARSE phase. Default
   *  2000 for these light, one-off discovery walks. */
  gapMs?: number;
  /** Faster gap (ms) for the no-parse ADVANCE phase (clicking "Next" to reach
   *  a deep startPage without reading data). Default 700. */
  advanceGapMs?: number;
}

// Form fields the calendar filter expects, minus the hidden ViewState fields
// (which are merged in per request). __EVENTTARGET is empty for a button click;
// for a pager click it's the pager's postback target.
function filterFields(competitionLevelId: number, eventTarget = '', includeSubmit = true) {
  const f: Record<string, string> = {
    __EVENTTARGET: eventTarget,
    __EVENTARGUMENT: '',
    'CT_HP_Mid_1$drpCompetitionLevelId': String(competitionLevelId),
    'CT_HP_Mid_1$drpEventTypeId': '0', // -- ALL --
  };
  if (includeSubmit) f['CT_HP_Mid_1$btnSubmit'] = 'Search';
  return f;
}

function parseEvents(html: string, seen: Set<string>): DiscoveredEvent[] {
  const $ = parseHtml(html);
  const out: DiscoveredEvent[] = [];

  $(`#${PAST_GRID_ID} tr`).each((_, el) => {
    const $row = $(el);
    if ($row.children('td').length === 0) return; // header row

    const $link = $row.find(SELECTORS.tournamentList.name).first();
    const name = $link.text().trim();
    const href = $link.attr('href') ?? '';
    if (!name || !href) return;

    const slug = extractEventSlug(href);
    if (!slug) return;
    const key = slug.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);

    const datesText = $row.find(SELECTORS.tournamentList.dates).text();
    const { start, end } = parseDateRange(datesText);

    // Competition group cell carries the "D-III College - Men" style label that
    // lets classifyCompetitionGroup distinguish D-I from D-III.
    const groups: string[] = [];
    $row.find(SELECTORS.tournamentList.competitionGroups).each((__, li) => {
      const txt = $(li).text().replace(/\s*\[\d+\]\s*$/, '').trim();
      if (txt) groups.push(txt);
    });
    const headline = groups[0] ?? '';
    const classifierInput = headline ? `${headline} ${name}` : name;
    const { competition_level } = classifyCompetitionGroup(classifierInput);

    const season = start
      ? parseInt(start.slice(0, 4), 10)
      : end
        ? parseInt(end.slice(0, 4), 10)
        : new Date().getUTCFullYear();

    out.push({
      usau_slug: slug,
      name,
      season,
      start_date: start,
      end_date: end,
      // Force COLLEGE_* — we asked USAU for a college-filtered list, so even if
      // the group cell is sparse, classify to a college level (D-III if the
      // text says so, else D-I).
      competition_level:
        competition_level === 'COLLEGE_D3' ? 'COLLEGE_D3' : 'COLLEGE_D1',
    });
  });

  return out;
}

function findPagerNext(html: string): string | null {
  const $ = parseHtml(html);
  const $grid = $(`#${PAST_GRID_ID}`);
  let target: string | null = null;
  $grid.find('a').each((_, el) => {
    if (!/^next\b/i.test($(el).text().trim())) return;
    const href = $(el).attr('href') ?? '';
    const m = href.match(/javascript:__doPostBack\('([^']+)'\s*,\s*'([^']*)'\)/i);
    if (m) {
      target = m[1];
      return false;
    }
  });
  return target;
}

async function run(body: RequestBody) {
  const competitionLevelId = body.competitionLevelId ?? 27;
  const dryRun = body.dryRun ?? true; // default SAFE: discover without writing
  // Chunking: USAU's pager is sequential ASP.NET postback state — you can't
  // jump to page N, you must click "Next" from page 1. To stay under the Edge
  // ~150s wall-clock limit we process a bounded window per invocation:
  //   - walk (cheaply, no parse) up to `startPage`
  //   - then parse `pageCount` pages and stop
  // The caller drives successive windows (startPage 1, 1+pageCount, ...) until
  // a response reports `reachedEnd: true`. Results are NEWEST-first, so deeper
  // pages = older seasons.
  const startPage = Math.max(1, body.startPage ?? 1);
  const pageCount = Math.max(1, Math.min(body.pageCount ?? 3, MAX_PAGES));
  const gapMs = body.gapMs ?? DEFAULT_GAP_MS;
  // Faster gap for the no-parse advance phase (just clicking "Next" to reach
  // a deep startPage). Defaults to 700ms; the parse phase stays at gapMs.
  const advanceGapMs = body.advanceGapMs ?? 700;
  if (![27, 28, 4].includes(competitionLevelId)) {
    throw new Error('competitionLevelId must be 27 (Men), 28 (Women), or 4 (Mixed)');
  }

  // Round 1 — GET to capture a fresh ViewState.
  const page1 = await fetchHtml(CALENDAR_URL, { gapMs });
  const hidden1 = parseHiddenFields(page1);

  // Round 2 — POST the competition-level filter + Search → page 1 of results.
  let currentHtml = await postForm(CALENDAR_URL, {
    ...hidden1,
    ...filterFields(competitionLevelId),
  }, { gapMs });

  const seen = new Set<string>();
  const events: DiscoveredEvent[] = [];
  let page = 1; // we're now on result page 1
  let reachedEnd = false;
  let pagesParsed = 0;

  // Advance (without parsing) to startPage. The advance phase only clicks
  // "Next" to move the pager — it doesn't read data — so it uses a faster gap
  // (advanceGapMs) to keep deep startPages under the Edge wall-clock limit.
  // The parse phase below keeps the politer `gapMs`.
  while (page < startPage) {
    const nextTarget = findPagerNext(currentHtml);
    if (!nextTarget) { reachedEnd = true; break; }
    const fields = parseHiddenFields(currentHtml);
    currentHtml = await postForm(CALENDAR_URL, {
      ...fields,
      ...filterFields(competitionLevelId, nextTarget, /* includeSubmit */ false),
    }, { gapMs: advanceGapMs });
    page++;
  }

  // Parse up to pageCount pages from startPage onward.
  while (!reachedEnd && pagesParsed < pageCount) {
    const more = parseEvents(currentHtml, seen);
    events.push(...more);
    pagesParsed++;
    const nextTarget = findPagerNext(currentHtml);
    if (!nextTarget) { reachedEnd = true; break; }
    if (pagesParsed >= pageCount) break; // window done; more pages remain
    const fields = parseHiddenFields(currentHtml);
    currentHtml = await postForm(CALENDAR_URL, {
      ...fields,
      ...filterFields(competitionLevelId, nextTarget, /* includeSubmit */ false),
    }, { gapMs });
    page++;
  }
  const pages = page;

  if (!dryRun && events.length > 0) {
    const db = supabase();
    const seasons = Array.from(new Set(events.map((e) => e.season)));
    await db
      .from('usau_seasons')
      .upsert(seasons.map((y) => ({ year: y })), { onConflict: 'year', ignoreDuplicates: true });

    // Case-insensitive collision guard. usau_events has a unique index on
    // lower(usau_slug) in ADDITION to the usau_slug constraint. onConflict
    // targets usau_slug (case-sensitive), so an incoming slug whose lower()
    // form already exists under different casing would attempt an INSERT and
    // violate the lower() index, failing the whole batch (e.g.
    // angel-city-shootout-2022 vs a stored variant). Since discovery only
    // writes stubs, simply DROP any incoming event already present case-
    // insensitively — the existing row stands.
    const { data: existing } = await db
      .from('usau_events')
      .select('usau_slug')
      .limit(100000);
    const seenLower = new Set(
      (existing ?? []).map((r) => (r.usau_slug as string).toLowerCase()),
    );
    const fresh = events.filter((e) => !seenLower.has(e.usau_slug.toLowerCase()));

    if (fresh.length > 0) {
      const rows = fresh.map((e) => ({
        usau_slug: e.usau_slug,
        name: e.name,
        season: e.season,
        start_date: e.start_date,
        end_date: e.end_date,
        competition_level: e.competition_level,
        url: `${BASE_URL}/events/${e.usau_slug}/`,
      }));
      const { error } = await db
        .from('usau_events')
        .upsert(rows, { onConflict: 'usau_slug', ignoreDuplicates: true });
      if (error) throw error;
    }
  }

  return {
    rowsProcessed: dryRun ? 0 : events.length,
    result: {
      competitionLevelId,
      dryRun,
      startPage,
      pageCount,
      pagesParsed,
      lastPage: pages,      // result page number we ended on
      reachedEnd,           // true → no more pages; caller stops paginating
      totalEvents: events.length,
      bySeasonLevel: events.reduce<Record<string, number>>((acc, e) => {
        const k = `${e.season}:${e.competition_level}`;
        acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      }, {}),
      events: events.map((e) => ({
        usau_slug: e.usau_slug,
        season: e.season,
        start_date: e.start_date,
        competition_level: e.competition_level,
      })),
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
      'discover-college-events',
      body as Record<string, unknown>,
      () => run(body),
    );
    return Response.json({ ok: true, ...res });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[discover-college-events] failed:', message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
});

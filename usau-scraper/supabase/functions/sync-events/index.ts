// sync-events: scrape USAU tournament calendar and upsert into usau_events.
//
// Source: https://play.usaultimate.org/events/tournament/ (one HTML page,
// two stacked tables: upcoming + past). Selectors verified 2026-05-19, see
// docs/selectors.md.
//
// Per row we capture: usau_slug, name, season (derived from start date),
// city, state, dates, and a derived (competition_level, gender_division)
// from the bulleted competition-groups column. Events typically list
// multiple groups (e.g. an HS state championship has Boys + Girls). For v1
// we pick the FIRST listed group as the headline classification — a future
// table will model the one-to-many relationship if we need it.
//
// Pagination: the "Current/Upcoming Events" table is paginated (~10 pages of
// 25 rows each) via ASP.NET __doPostBack.  We walk all pages by re-extracting
// the "Next 25 »" postback target and carrying the fresh VIEWSTATE from each
// response.  The "Past Events" table is NOT paginated here — page 1 only.

import { fetchHtml, postForm } from '../_shared/http.ts';
import { parseHiddenFields, extractNextPostback } from '../_shared/aspnet.ts';
import {
  BASE_URL,
  parseHtml,
  SELECTORS,
  assertNonEmpty,
  classifyCompetitionGroup,
  extractEventSlug,
  parseDateRange,
} from '../_shared/parse.ts';
import { supabase, withRunLogging } from '../_shared/supabase.ts';

// Safety cap: USAU currently has ~10 upcoming pages.  If "Next" detection
// breaks and we never see a terminal page the cap prevents an infinite loop.
const MAX_UPCOMING_PAGES = 15;

// GridView id for the upcoming events table.
const UPCOMING_GRID_ID = 'CT_HP_Mid_1_gvCurrentUpcomingEvents';

interface ParsedEvent {
  usau_slug: string;
  name: string;
  season: number;
  start_date: string | null;
  end_date: string | null;
  city: string | null;
  state: string | null;
  competition_level: ReturnType<typeof classifyCompetitionGroup>['competition_level'];
  gender_division: ReturnType<typeof classifyCompetitionGroup>['gender_division'];
  url: string;
  competition_groups: string[];
}

/**
 * Parse tournament rows from `html` using `rowSelector` to scope which rows
 * to read.  On page 1 we pass the combined upcoming+past selector so both
 * tables are harvested.  On subsequent postback pages we pass only the
 * upcoming-grid selector — the past grid is also present but we deliberately
 * ignore it to avoid re-parsing historical rows we already have from page 1.
 *
 * `seen` is a shared Set<string> passed in by the caller so deduplication
 * works across all pages in a single run.
 */
function parseRows(
  html: string,
  rowSelector: string,
  seen: Set<string>,
): ParsedEvent[] {
  const $ = parseHtml(html);
  const events: ParsedEvent[] = [];

  $(rowSelector).each((_, el) => {
    const $row = $(el);

    // Skip header rows (which contain only <th> cells).
    if ($row.children('td').length === 0) return;

    const $link = $row.find(SELECTORS.tournamentList.name).first();
    const name = $link.text().trim();
    const href = $link.attr('href') ?? '';
    if (!name || !href) return;

    const slug = extractEventSlug(href);
    // Dedupe case-INSENSITIVELY: usau_events has a unique index on
    // lower(usau_slug), and USAU sometimes lists the same event with
    // different slug casing across pages (e.g. "Intergalactic-Championships"
    // vs "intergalactic-championships"). Keying the Set on the raw slug would
    // let both through and the batch upsert would then violate the lower()
    // unique index, failing the whole run.
    if (!slug) return;
    const slugKey = slug.toLowerCase();
    if (seen.has(slugKey)) return;
    seen.add(slugKey);

    const datesText = $row.find(SELECTORS.tournamentList.dates).text();
    const { start, end } = parseDateRange(datesText);

    // Competition groups: each <li> in the 5th column is "Group Label [N]"
    // where N is the team count. We grab the label, strip the count.
    const groups: string[] = [];
    $row.find(SELECTORS.tournamentList.competitionGroups).each((__, li) => {
      const txt = $(li).text().replace(/\s*\[\d+\]\s*$/, '').trim();
      if (txt) groups.push(txt);
    });

    // USAU's calendar competition-group bullet is often a bare "Men's Open"
    // for D-I/D-III events — they put the division qualifier in the event
    // NAME, not the group label. So we feed both into the classifier
    // (group label first for specificity, name as fallback context).
    const headline = groups[0] ?? '';
    const classifierInput = headline ? `${headline} ${name}` : name;
    const { competition_level, gender_division } = classifyCompetitionGroup(classifierInput);

    const season = start
      ? parseInt(start.slice(0, 4), 10)
      : end
        ? parseInt(end.slice(0, 4), 10)
        : new Date().getUTCFullYear();

    events.push({
      usau_slug: slug,
      name,
      season,
      start_date: start,
      end_date: end,
      city: $row.find(SELECTORS.tournamentList.city).text().trim() || null,
      state: $row.find(SELECTORS.tournamentList.state).text().trim() || null,
      competition_level,
      gender_division,
      url: href.startsWith('http') ? href : `${BASE_URL}${href}`,
      competition_groups: groups,
    });
  });

  return events;
}

async function run(opts: { year?: number } = {}) {
  // The default tournament page shows the current view (upcoming + recent past).
  // Passing ?Year={n} switches it to that year's full calendar (past events only
  // once the year has passed). Verified working back to at least 2015.
  const url = opts.year
    ? `${BASE_URL}/events/tournament/?Year=${opts.year}`
    : `${BASE_URL}/events/tournament/`;

  // ---- Page 1 — GET ----
  // Parse BOTH tables on page 1 (same behavior as before pagination was added).
  const page1Html = await fetchHtml(url);
  const seen = new Set<string>();
  const allEvents: ParsedEvent[] = parseRows(
    page1Html,
    SELECTORS.tournamentList.rows, // combined upcoming + past selector
    seen,
  );

  // ---- Pages 2..N of Upcoming — POST ----
  // Only walk further pages when we're on the live calendar (no ?Year=).
  // Historical year pages are single-page past-events tables; there is
  // nothing to paginate.
  let upcomingPages = 1;

  if (!opts.year) {
    let currentHtml = page1Html;

    while (upcomingPages < MAX_UPCOMING_PAGES) {
      // Re-extract hidden fields and the "Next" link from the most-recently
      // fetched HTML.  VIEWSTATE changes every round-trip — must use fresh values.
      const hiddenFields = parseHiddenFields(currentHtml);
      const nextPostback = extractNextPostback(currentHtml, UPCOMING_GRID_ID);

      if (!nextPostback) {
        // No "Next" link found — we're on the last page of upcoming events.
        console.log(`[sync-events] upcoming pagination complete at page ${upcomingPages}`);
        break;
      }

      console.log(
        `[sync-events] fetching upcoming page ${upcomingPages + 1} ` +
          `(target=${nextPostback.target})`,
      );

      let pageHtml: string;
      try {
        pageHtml = await postForm(url, {
          ...hiddenFields,
          __EVENTTARGET: nextPostback.target,
          __EVENTARGUMENT: nextPostback.argument,
        });
      } catch (err) {
        // Postback failed.  Log and stop paginating — we still have everything
        // gathered so far, which we'll upsert below (partial success).
        const msg = err instanceof Error ? err.message : String(err);
        console.error(
          `[sync-events] postback failed on page ${upcomingPages + 1}: ${msg}. ` +
            `Stopping pagination; upserting ${allEvents.length} events gathered so far.`,
        );
        break;
      }

      // From postback pages we parse ONLY the upcoming grid, not the past grid
      // (which is also present but whose pager we must not accidentally advance).
      const upcomingOnlySelector = `#${UPCOMING_GRID_ID} tr`;
      const pageEvents = parseRows(pageHtml, upcomingOnlySelector, seen);
      upcomingPages++;

      if (pageEvents.length === 0) {
        // Postback returned a page with 0 upcoming rows — treat as last page.
        console.log(
          `[sync-events] page ${upcomingPages} returned 0 upcoming rows — stopping pagination.`,
        );
        break;
      }

      allEvents.push(...pageEvents);
      currentHtml = pageHtml;
    }

    if (upcomingPages >= MAX_UPCOMING_PAGES) {
      console.warn(
        `[sync-events] hit MAX_UPCOMING_PAGES cap (${MAX_UPCOMING_PAGES}). ` +
          'If USAU has more pages, increase the cap.',
      );
    }
  }

  assertNonEmpty(allEvents, 1, 'sync-events tournament list');

  console.log(
    `[sync-events] parsed ${allEvents.length} events across ` +
      `${upcomingPages} upcoming page(s).`,
  );

  const db = supabase();

  // Ensure every season we encountered exists in usau_seasons so the FK
  // constraint passes. Cheap: tiny upsert with at most a handful of years.
  const seasons = Array.from(new Set(allEvents.map((e) => e.season)));
  const { error: seasonErr } = await db
    .from('usau_seasons')
    .upsert(seasons.map((y) => ({ year: y })), { onConflict: 'year', ignoreDuplicates: true });
  if (seasonErr) throw seasonErr;

  // Reconcile slug casing against existing rows. usau_events has TWO unique
  // indexes: a constraint on usau_slug (case-sensitive, what onConflict uses)
  // AND a unique index on lower(usau_slug) (case-insensitive). USAU sometimes
  // lists an event with different casing than what we already stored (e.g.
  // calendar says "Intergalactic-Championships" but the DB has
  // "intergalactic-championships"). The case-sensitive onConflict wouldn't
  // match, so the upsert would attempt an INSERT and then violate the lower()
  // index, failing the whole batch. Fix: for any incoming slug whose lower()
  // form already exists, rewrite it to the STORED casing so the upsert UPDATEs
  // the existing row instead. (We keep the stored casing because app URLs +
  // sync-event-details calls reference the exact stored slug.)
  // Fetch all existing slugs (the table is small, <1k rows) and index them by
  // their lowercase form. PostgREST can't filter on lower(usau_slug) directly,
  // and the table is tiny, so a full scan of the slug column is simplest and
  // robust against large/odd incoming sets.
  const { data: existing, error: existErr } = await db
    .from('usau_events')
    .select('usau_slug')
    .limit(100000); // override PostgREST's default 1k cap so no stored slug is missed
  if (existErr) throw existErr;
  const storedByLower = new Map<string, string>();
  for (const row of existing ?? []) {
    storedByLower.set((row.usau_slug as string).toLowerCase(), row.usau_slug as string);
  }

  // gender_division on usau_events isn't a column yet — it's only relevant
  // for the schedule-page scraper later. We strip it from the row payload
  // here so it doesn't confuse the upsert; classifying it at scrape-time is
  // still useful for the future per-division event link table.
  const rows = allEvents.map((e) => ({
    // Use the stored casing when a case-variant of this slug already exists.
    usau_slug: storedByLower.get(e.usau_slug.toLowerCase()) ?? e.usau_slug,
    name: e.name,
    season: e.season,
    start_date: e.start_date,
    end_date: e.end_date,
    city: e.city,
    state: e.state,
    competition_level: e.competition_level,
    url: e.url,
    last_scraped_at: new Date().toISOString(),
    last_scraped_status: 'ok',
  }));

  const { error } = await db.from('usau_events').upsert(rows, {
    onConflict: 'usau_slug',
    ignoreDuplicates: false,
  });
  if (error) throw error;

  return {
    rowsProcessed: allEvents.length,
    result: {
      events: allEvents.length,
      upcomingPages,
      seasons,
      year: opts.year ?? null,
    },
  };
}

interface RequestBody {
  year?: number;
}

Deno.serve(async (req) => {
  let body: RequestBody = {};
  try {
    if (req.headers.get('content-type')?.includes('application/json')) {
      body = await req.json();
    } else {
      const url = new URL(req.url);
      const yearQ = url.searchParams.get('year');
      if (yearQ) {
        const y = parseInt(yearQ, 10);
        if (!isNaN(y)) body.year = y;
      }
    }
  } catch {
    /* empty body OK */
  }

  try {
    const res = await withRunLogging(
      'sync-events',
      body as Record<string, unknown>,
      () => run(body),
    );
    return Response.json({ ok: true, ...res });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[sync-events] failed:', message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
});

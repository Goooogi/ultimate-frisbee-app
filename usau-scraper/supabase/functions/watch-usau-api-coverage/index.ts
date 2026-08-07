// watch-usau-api-coverage: is USAU's new site far enough along to migrate to?
//
// BACKGROUND. usaultimate.org (the NEW site) is WordPress with an open JSON API:
//   GET /wp-json/usau/v1/results/{event_id}/{group_id}
//   GET /wp-json/usau/v1/team-info/{event_id}/{event_team_id}
// It's strictly better than what we scrape — rosters + per-event stats in ONE
// request (vs our ~28min/event throttled HTML crawl), blocks/turnovers we don't
// collect at all, precomputed pool standings, live flags, and an AUTHORITATIVE
// `round` label that would delete our single worst class of data bug.
//
// ⚠️ BUT it only serves events USAU has built a new-site PAGE for. As of
// 2026-08-02: ONE page (the U.S. Open, which hosts both YCC and ICC) out of 227
// calendar rows. Other tournaments running the same weekend return games with
// EMPTY TEAM NAMES — present in their backend, not published.
//
// So the gate is EDITORIAL, not technical, and there is nothing worth building
// until the ratio climbs. THIS FUNCTION IS THAT TRIGGER. It is deliberately
// tiny: two GETs a week, count links, record the ratio.
//
// ⚠️ event_id is IGNORED by the API — group_id alone selects the data
// (/results/999999/19752 == /results/14549/19752). The unit of ingest is the
// GROUP (≈ one division at one event), not the event.
//
// Request body: { probeGroups?: boolean }  — probeGroups=false skips the API
// probes and only counts calendar links (fewer requests).

// ⚠️ Helpers are INLINED rather than imported from ../_shared. This function is
// deployed standalone via the Supabase MCP/API, whose bundler does NOT resolve
// parent-relative paths (`../_shared/...` → "Module not found"). Other functions
// in this repo are deployed with the CLI, which does. If you ever move this to a
// CLI deploy, switch back to the shared imports.
import { createClient } from 'npm:@supabase/supabase-js@2';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/17.0 Safari/605.1.15';

let lastRequestAt = 0;
async function throttle(gapMs = 2500) {
  const wait = Math.max(0, lastRequestAt + gapMs - Date.now());
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

async function fetchHtml(url: string, gapMs = 2500): Promise<string> {
  await throttle(gapMs);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

function db() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  return createClient(url, key, { auth: { persistSession: false } });
}

const CALENDARS: { source: 'club' | 'college'; url: string }[] = [
  { source: 'club', url: 'https://usaultimate.org/club/schedule/' },
  { source: 'college', url: 'https://usaultimate.org/college/schedule/' },
];

const API_BASE = 'https://usaultimate.org/wp-json/usau/v1';

interface CoverageRow {
  source: 'club' | 'college';
  total_rows: number;
  new_site_rows: number;
  play_site_rows: number;
  new_event_pages: string[];
  live_group_ids: number[];
  notes: string | null;
}

/**
 * Count tournament rows on a calendar page and split them by where they link.
 *
 * The calendar renders `<tr class="tournament ...">` per event/division. A row
 * linking to play.usaultimate.org is HTML-scrape-only; one linking to a
 * usaultimate.org page is potentially API-reachable.
 */
function analyzeCalendar(html: string): {
  total: number;
  newSite: number;
  playSite: number;
  pages: string[];
} {
  const rows = html.match(/<tr class="tournament[^"]*">[\s\S]*?<\/tr>/g) ?? [];
  const pages = new Set<string>();
  let newSite = 0;
  let playSite = 0;

  for (const row of rows) {
    const hrefs = [...row.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    // A row can repeat its link per division cell; classify the row once.
    const hasPlay = hrefs.some((h) => h.includes('play.usaultimate.org'));
    const newOnes = hrefs.filter(
      (h) => h.includes('usaultimate.org') && !h.includes('play.usaultimate.org'),
    );
    if (newOnes.length > 0) {
      newSite++;
      for (const u of newOnes) pages.add(u);
    } else if (hasPlay) {
      playSite++;
    }
  }

  return { total: rows.length, newSite, playSite, pages: [...pages] };
}

/** Pull the widget ids an event page embeds. These are what the API is keyed on. */
function extractGroupIds(html: string): number[] {
  const ids = new Set<number>();
  for (const m of html.matchAll(/data-group-id="(\d+)"/g)) ids.add(Number(m[1]));
  return [...ids];
}

/**
 * Does this group actually serve usable data?
 *
 * Presence of games is NOT enough — historical/unpublished groups return games
 * with empty team names, which are worthless to us. "Live" here means at least
 * one game carries a real home_team.
 */
async function groupIsLive(groupId: number): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/results/1/${groupId}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return false;
    const data = await res.json();
    const games: { home_team?: string }[] = data?.games ?? [];
    return games.some((g) => (g.home_team ?? '').trim().length > 0);
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  let probeGroups = true;
  try {
    const body = await req.json();
    if (body && typeof body.probeGroups === 'boolean') probeGroups = body.probeGroups;
  } catch {
    // no body — keep defaults
  }

  const client = db();
  const { data: run } = await client
    .from('usau_scrape_runs')
    .insert({ job_name: 'watch-usau-api-coverage', metadata: { probeGroups } })
    .select('id')
    .single();

  try {
    const rows: CoverageRow[] = [];

    for (const cal of CALENDARS) {
      const html = await fetchHtml(cal.url);
      const { total, newSite, playSite, pages } = analyzeCalendar(html);

      // For each new-site event page, collect its group ids and check which
      // actually serve named data.
      const liveGroups: number[] = [];
      if (probeGroups) {
        for (const page of pages.slice(0, 10)) {
          try {
            const eventHtml = await fetchHtml(page);
            for (const gid of extractGroupIds(eventHtml)) {
              if (await groupIsLive(gid)) liveGroups.push(gid);
              await new Promise((r) => setTimeout(r, 600));
            }
          } catch (err) {
            console.log(`[coverage] could not read ${page}: ${err}`);
          }
        }
      }

      rows.push({
        source: cal.source,
        total_rows: total,
        new_site_rows: newSite,
        play_site_rows: playSite,
        new_event_pages: pages,
        live_group_ids: liveGroups,
        notes: null,
      });
    }

    const { error } = await client.from('usau_api_coverage').insert(rows);
    if (error) throw new Error(error.message);

    const totalRows = rows.reduce((s, r) => s + r.total_rows, 0);
    const totalNew = rows.reduce((s, r) => s + r.new_site_rows, 0);
    const totalGroups = rows.reduce((s, r) => s + r.live_group_ids.length, 0);
    const pct = totalRows > 0 ? Math.round((totalNew / totalRows) * 1000) / 10 : 0;

    console.log(
      `[coverage] ${totalNew}/${totalRows} rows on the new site (${pct}%), ${totalGroups} live groups`,
    );

    if (run?.id) {
      await client
        .from('usau_scrape_runs')
        .update({ completed_at: new Date().toISOString(), rows_processed: rows.length })
        .eq('id', run.id);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        pct_new_site: pct,
        total_rows: totalRows,
        new_site_rows: totalNew,
        live_groups: totalGroups,
        by_source: rows.map((r) => ({
          source: r.source,
          total: r.total_rows,
          new_site: r.new_site_rows,
          play_site: r.play_site_rows,
          pages: r.new_event_pages.length,
          live_groups: r.live_group_ids.length,
        })),
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[watch-usau-api-coverage] failed: ${msg}`);
    if (run?.id) {
      await client
        .from('usau_scrape_runs')
        .update({ completed_at: new Date().toISOString(), error: msg })
        .eq('id', run.id);
    }
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

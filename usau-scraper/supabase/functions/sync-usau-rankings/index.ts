// sync-usau-rankings: scrape USAU's official published team rankings and
// upsert them into usau_rankings, matched to our usau_teams where possible.
//
// Why this exists: the app shows a ranked USAU Teams view. Until now that view
// ordered teams by Nationals placement / entry seed (an approximation). USAU
// publishes an official weekly power-rating Top-20 per division at a plain GET
// page (unlike the WAF-blocked event POST form), so we scrape the real numbers.
//
// Source: GET /teams/events/team_rankings/?RankSet={SET}
//   RankSet ∈ Club-Men | Club-Women | Club-Mixed | College-Men | College-Women
//   HTML table cols: Rank, Team (link), Power Rating, Gender Division,
//   Competition Division, City, State, Club Region, Club Section, Wins, Losses
//
// What it writes: usau_rankings rows keyed (season, week, division, team_id).
//   - `division` stores the RankSet key ('Club-Men' etc.) — unambiguous for reads.
//   - `team_id` is matched to usau_teams by normalized name within the RankSet's
//     (gender_division, competition_level). Unmatched teams are SKIPPED for the
//     FK-constrained row but reported in stats.unmatched so we can improve the
//     match table over time. (usau_team_id is unpopulated in our data, so we
//     match on name — see project_usau_team_id_unpopulated.)
//
// Request body (all optional):
//   { season?: number,          // default: current calendar year
//     week?: number,            // default: ISO-ish week number of now (UTC)
//     rankSets?: string[],      // subset of RankSets to scrape (default: all 5)
//     dryRun?: boolean }        // parse + match, skip DB writes
//
// Cron: intended to run weekly (Sunday night) via pg_cron → this function.

import { supabase, withRunLogging } from '../_shared/supabase.ts';
import { fetchHtml, postForm } from '../_shared/http.ts';
import { parseHtml, rankingsUrl } from '../_shared/parse.ts';
import { parseHiddenFields, extractViewAllPostback } from '../_shared/aspnet.ts';

/**
 * Fetch the FULL rankings table for a RankSet, not just the default first page.
 *
 * The page is an ASP.NET GridView that shows 20 rows per page (~200+ teams
 * across ~12 pages) with a single "View All" postback that expands them all
 * onto one response. We:
 *   1. GET page 1 (confirmed reachable from the cloud IP — see WAF notes).
 *   2. Extract the hidden form fields (__VIEWSTATE etc.) + the View All target.
 *   3. POST "View All" back → one response with every team.
 * Both requests go through the shared 5s-throttled client, so this is paced.
 *
 * If there's no View All link, or the postback fails (e.g. a WAF block on the
 * cloud-IP POST that the GET doesn't trigger), we fall back to page 1's ~20
 * rows and log it — a partial result beats a hard failure, and the stats make
 * the fallback visible.
 */
async function fetchAllRankingsHtml(rankSet: string): Promise<string> {
  const url = rankingsUrl(rankSet);
  const page1 = await fetchHtml(url);

  const viewAll = extractViewAllPostback(page1);
  if (!viewAll) {
    console.log(`[sync-usau-rankings] ${rankSet}: no "View All" link — using page 1 only`);
    return page1;
  }

  const hidden = parseHiddenFields(page1);
  try {
    const full = await postForm(url, {
      ...hidden,
      __EVENTTARGET: viewAll.target,
      __EVENTARGUMENT: viewAll.argument,
    });
    return full;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[sync-usau-rankings] ${rankSet}: "View All" postback failed (${msg}) — falling back to page 1`,
    );
    return page1;
  }
}

interface RequestBody {
  season?: number;
  week?: number;
  rankSets?: string[];
  dryRun?: boolean;
}

// RankSet → (gender_division, competition_level) used to scope the team match.
const RANK_SETS: Record<string, { gender: string; level: string }> = {
  'Club-Men': { gender: 'Men', level: 'CLUB' },
  'Club-Women': { gender: 'Women', level: 'CLUB' },
  'Club-Mixed': { gender: 'Mixed', level: 'CLUB' },
  'College-Men': { gender: 'Men', level: 'COLLEGE_D1' },
  'College-Women': { gender: 'Women', level: 'COLLEGE_D1' },
};

interface RankRow {
  rank: number;
  teamName: string;
  rating: number | null;
  city: string | null;
  state: string | null;
  region: string | null;
  section: string | null;
  wins: number | null;
  losses: number | null;
}

/** NFD-strip diacritics, lowercase, drop non-alphanumerics, collapse space.
 *  Mirrors src/lib/name-match.ts normalizeName so app-side and scraper-side
 *  matching agree. */
function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toInt(s: string): number | null {
  const n = parseInt(s.replace(/[^0-9-]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

/** Parse the rankings table out of one RankSet page.
 *
 *  Two DISTINCT column layouts exist (verified against live HTML 2026-07):
 *   - Club   (11 cols): Rank, Team, Rating, GenderDiv, CompDiv, City, State,
 *                       Region, Section, Wins, Losses
 *   - College(10 cols): Rank, Team, Rating, Level, GenderDiv, CompDiv,
 *                       Region, Section, Wins, Losses   ← no City/State
 *  We branch on the cell count so both parse correctly. Data rows alternate
 *  class="row" / class="alt" (10 each = the Top-20), so we select BOTH. */
function parseRankings(html: string): RankRow[] {
  const $ = parseHtml(html);
  const out: RankRow[] = [];

  $('tr.row, tr.alt').each((_i, tr) => {
    const tds = $(tr).find('td');
    const n = tds.length;
    if (n < 10) return;
    const cell = (i: number) => $(tds[i]).text().trim();

    const rank = toInt(cell(0));
    const teamName = cell(1);
    if (rank == null || !teamName) return;

    // Trailing columns (Region, Section, Wins, Losses) are the LAST four in
    // both layouts — index from the end so the City/State gap in College
    // doesn't shift them. City/State only exist in the 11-col Club layout.
    const isClub = n >= 11;
    out.push({
      rank,
      teamName,
      rating: toInt(cell(2)),
      city: isClub ? cell(5) || null : null,
      state: isClub ? cell(6) || null : null,
      region: cell(n - 4) || null,
      section: cell(n - 3) || null,
      wins: toInt(cell(n - 2)),
      losses: toInt(cell(n - 1)),
    });
  });

  // Order by rank so downstream logging/reads are stable regardless of the
  // row/alt interleaving in the DOM.
  out.sort((a, b) => a.rank - b.rank);
  return out;
}

type TeamRow = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
};

/** Build a name → team[] index for one (gender, level) scope. */
async function loadTeamIndex(
  gender: string,
  level: string,
): Promise<Map<string, TeamRow[]>> {
  const db = supabase();
  const idx = new Map<string, TeamRow[]>();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('usau_teams')
      .select('id, name, city, state')
      .eq('gender_division', gender)
      .eq('competition_level', level)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as TeamRow[];
    for (const t of rows) {
      const key = normalizeName(t.name);
      if (!idx.has(key)) idx.set(key, []);
      idx.get(key)!.push(t);
    }
    if (rows.length < PAGE) break;
  }
  return idx;
}

/** Resolve a ranking row to a usau_teams.id. Match on normalized name; when
 *  several teams share a name, disambiguate by state then city. Null if none. */
function matchTeam(row: RankRow, idx: Map<string, TeamRow[]>): string | null {
  const candidates = idx.get(normalizeName(row.teamName));
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].id;

  const st = (row.state ?? '').toLowerCase();
  const byState = candidates.filter((c) => (c.state ?? '').toLowerCase() === st);
  const pool = byState.length > 0 ? byState : candidates;
  if (pool.length === 1) return pool[0].id;

  const city = (row.city ?? '').toLowerCase();
  const byCity = pool.filter((c) => (c.city ?? '').toLowerCase() === city);
  if (byCity.length === 1) return byCity[0].id;

  // Ambiguous — take the first deterministically (id-sorted) rather than guess.
  return pool[0].id;
}

/** ISO week number (1–53) for a date, UTC. */
function isoWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // nearest Thursday
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const diff = date.getTime() - firstThursday.getTime();
  return 1 + Math.round(diff / (7 * 86400000));
}

interface RankSetStat {
  rankSet: string;
  parsed: number;
  matched: number;
  unmatched: string[];
  written: number;
}

async function run(body: RequestBody): Promise<{
  rowsProcessed: number;
  result: { season: number; week: number; dryRun: boolean; sets: RankSetStat[] };
}> {
  const now = new Date();
  const season = body.season ?? now.getUTCFullYear();
  const week = body.week ?? isoWeek(now);
  const dryRun = body.dryRun === true;
  const sets = (body.rankSets && body.rankSets.length > 0
    ? body.rankSets
    : Object.keys(RANK_SETS)
  ).filter((s) => s in RANK_SETS);

  const db = supabase();
  const stats: RankSetStat[] = [];
  const scrapedAt = new Date().toISOString();

  for (const rankSet of sets) {
    const { gender, level } = RANK_SETS[rankSet];
    const html = await fetchAllRankingsHtml(rankSet);
    const rows = parseRankings(html);
    // Sanity guard (scraper convention): a RankSet page always has a Top-20
    // table. Zero rows means the selectors drifted or the page changed —
    // throw rather than upsert nothing (or, worse, let a silent no-op look
    // like success). Never overwrites good data with a bad scrape.
    if (rows.length === 0) {
      throw new Error(
        `sync-usau-rankings: parsed 0 rows for RankSet=${rankSet} — selectors may have drifted`,
      );
    }
    const idx = await loadTeamIndex(gender, level);

    // Store EVERY ranked team, keyed on rank — the ranking's own identity.
    // team_id is now OPTIONAL: we link it when a confident match exists, else
    // leave it null (the row still carries the team's name/city/state). This
    // fixes the old drops — a team with no usau_teams row, or one that collided
    // with a duplicate usau_teams id, used to be skipped entirely, leaving gaps
    // in the rank sequence. rank is unique within (season, week, division), so
    // two ranked rows can NEVER collide on the upsert key anymore.
    //
    // We still avoid pointing two DIFFERENT ranks at the same team_id (which
    // would misrender as one team appearing twice): the FIRST (lowest) rank
    // keeps the link; a later rank that resolves to an already-linked team_id
    // is stored with team_id = null (name only). This only happens when
    // usau_teams duplication makes distinct teams' names normalize alike — rare,
    // and null-linking is strictly better than dropping the team.
    const upserts: Record<string, unknown>[] = [];
    const unmatched: string[] = [];
    const linkedTeamIds = new Set<string>();
    let matched = 0;
    for (const r of rows) {
      let teamId: string | null = matchTeam(r, idx);
      if (teamId && linkedTeamIds.has(teamId)) {
        // Another rank already owns this team_id — keep the ranking, drop the
        // (ambiguous) link rather than the team.
        teamId = null;
      }
      if (teamId) {
        linkedTeamIds.add(teamId);
        matched++;
      } else {
        unmatched.push(r.teamName);
      }
      upserts.push({
        season,
        week,
        division: rankSet,
        rank: r.rank,
        team_id: teamId,
        team_name: r.teamName,
        city: r.city,
        state: r.state,
        rating: r.rating,
        wins: r.wins,
        losses: r.losses,
        region: r.region,
        conference: r.section,
        scraped_at: scrapedAt,
      });
    }

    let written = 0;
    if (!dryRun && upserts.length > 0) {
      const { error } = await db
        .from('usau_rankings')
        .upsert(upserts, { onConflict: 'season,week,division,rank' });
      if (error) throw error;
      written = upserts.length;
    }

    stats.push({
      rankSet,
      parsed: rows.length,
      matched,
      unmatched,
      written,
    });
  }

  const rowsProcessed = stats.reduce((n, s) => n + s.written, 0);
  return { rowsProcessed, result: { season, week, dryRun, sets: stats } };
}

function stringifyErr(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object') {
    const o = err as Record<string, unknown>;
    return typeof o.message === 'string' ? o.message : JSON.stringify(err);
  }
  return String(err);
}

Deno.serve(async (req) => {
  // POST-only. The cron invokes this with POST + JSON body; rejecting other
  // methods stops a bare GET (from any client, since verify_jwt=false) from
  // triggering a full 5-division scrape as a side effect.
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  let body: RequestBody = {};
  try {
    if (req.headers.get('content-type')?.includes('application/json')) {
      body = await req.json();
    } else {
      const url = new URL(req.url);
      const season = url.searchParams.get('season');
      const week = url.searchParams.get('week');
      // Guard against NaN — parseInt('abc') is NaN, which would slip past the
      // `?? default` fallback in run() and reach the int-not-null DB columns.
      if (season) {
        const s = parseInt(season, 10);
        if (Number.isFinite(s)) body.season = s;
      }
      if (week) {
        const w = parseInt(week, 10);
        if (Number.isFinite(w)) body.week = w;
      }
      if (url.searchParams.get('dryRun') === 'true') body.dryRun = true;
    }
  } catch {
    // empty body OK
  }

  try {
    const res = await withRunLogging(
      'sync-usau-rankings',
      body as Record<string, unknown>,
      () => run(body),
    );
    return Response.json({ ok: true, ...res });
  } catch (err) {
    const message = stringifyErr(err);
    console.error('[sync-usau-rankings] failed:', message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
});

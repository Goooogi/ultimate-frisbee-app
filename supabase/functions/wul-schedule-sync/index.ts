// wul-schedule-sync — WUL's published schedule → wul_games (2026-09-13).
//
// The league publishes each season's schedule on its site months before
// opening day (2026's went up 2025-12-16 for a March 14 start) as a Google
// Sheet embedded in westernultimateleague.com/{season}-schedule. Google serves
// a published sheet as CSV, so this is plain HTTP — unlike the stats, which
// need a real browser (the wul-ingest GitHub Action, ingest-wul.py).
//
// Each run (daily, pg_cron — see 20260913150000_wul_schedule.sql):
//   1. For this year and next, fetch /{season}-schedule. 404 = not published.
//   2. Read every sheet embedded on the page as CSV; the one that parses into
//      games is the schedule (the other is the standings table).
//   3. Unplayed games → status 'scheduled', using ingest-wul.py's id and
//      away/home convention, so the stats scrape's final lands on the same row.
//      Finals are never touched. A scheduled row that is no longer on the sheet
//      (moved or cancelled) is deleted.
// On failure: 500 + a Resend email (a daily job, so at most one a day).
//
// Auth: deployed with verify_jwt OFF like its siblings — the cron's key is a
// new-style sb_secret key, not a JWT, so the gateway check would reject it.
// Instead the caller's bearer must work as a secret key against the Auth admin
// API before anything runs; otherwise anyone could trigger the failure email
// and hammer the league's site through us.
//
// Secrets (set via supabase secrets): RESEND_API, SEND_EMAIL.
// Auto-injected by Supabase: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const SITE = 'https://westernultimateleague.com';
const UA = 'Mozilla/5.0 (the-layout/wul-schedule-sync)';
const ALERT_TO = 'huntermay@altiusapps.com';
// A final between the same two teams within this many days of a sheet game is
// that game, played on a date the sheet never caught up with. The same pair can
// meet a week apart, so this stays well under 7.
const DATE_DRIFT_DAYS = 3;
// Postseason slots before the matchups are known ("TBD", "Winner Semi 1").
const PLACEHOLDER_RE = /\b(tbd|tba|winner|loser|seed)\b/i;

function db(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function fetchText(url: string): Promise<{ status: number; text: string }> {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  return { status: res.status, text: await res.text() };
}

/** CSV links for every Google Sheet embedded on /{season}-schedule, or null
 *  while that season's page isn't published. */
async function sheetCsvUrls(season: number): Promise<string[] | null> {
  const { status, text } = await fetchText(`${SITE}/${season}-schedule?format=json`);
  if (status === 404) return null;
  if (status !== 200) throw new Error(`HTTP ${status} for /${season}-schedule`);
  const html = String(JSON.parse(text).mainContent ?? '');
  const embeds = html.matchAll(/src="(https:\/\/docs\.google\.com\/spreadsheets\/d\/e\/[^"]+?\/pubhtml[^"]*)"/g);
  return [...embeds].map((m) => {
    const u = new URL(m[1].replaceAll('&amp;', '&'));
    const csv = new URL(u.origin + u.pathname.replace(/\/pubhtml$/, '/pub'));
    const gid = u.searchParams.get('gid');
    if (gid) csv.searchParams.set('gid', gid);
    csv.searchParams.set('single', 'true');
    csv.searchParams.set('output', 'csv');
    return csv.toString();
  });
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') cell += c;
      else if (text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((v) => v.trim()));
}

interface SheetGame {
  date: string;        // 'YYYY-MM-DD'
  time: string | null; // as published, e.g. '4pm PT'
  away: string;        // team names as published: away @ home
  home: string;
  post: boolean;
}

/** The schedule sheet lays each game over two rows:
 *    "Sat, 3/14" | | | Bay Area Falcons      | | ▶ | 14 | Watch the Game!
 *    "4pm PT"    | | @ | San Diego Super Bloom | | ▶ | 22 |
 *  under "Week N" headers. Dates carry no year — it's the page's season. */
function parseSchedule(rows: string[][], season: number): SheetGame[] {
  const games: SheetGame[] = [];
  let post = false;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const next = rows[i + 1] ?? [];
    const md = /(\d{1,2})\/(\d{1,2})$/.exec(row[0] ?? '');
    if (md && row[3] && next[2] === '@' && next[3]) {
      const month = Number(md[1]);
      const day = Number(md[2]);
      const d = new Date(Date.UTC(season, month - 1, day));
      if (d.getUTCMonth() === month - 1 && d.getUTCDate() === day) {
        games.push({
          date: d.toISOString().slice(0, 10),
          time: /\d{1,2}(:\d{2})?\s*[ap]m/i.test(next[0] ?? '') ? next[0] : null,
          away: row[3],
          home: next[3],
          post,
        });
      }
      i++;
      continue;
    }
    // A lone header cell: "Week 3" stays regular season; one naming the
    // postseason starts the post rows.
    const header = row[0] ?? '';
    if (header && row.slice(1).every((v) => v === '') && /champ|semi|final|playoff|post/i.test(header)) {
      post = true;
    }
  }
  return games;
}

interface Team { id: string; abbr: string }
interface ExistingGame {
  id: string;
  status: string;
  away_team_id: string;
  home_team_id: string;
  game_date: string | null;
  game_time: string | null;
  week_label: string;
}
interface SeasonResult { season: number; published: boolean; onSheet: number; inserted: number; updated: number; deleted: number }

const dayDiff = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;

async function syncSeason(
  supabase: SupabaseClient,
  season: number,
  sheet: SheetGame[],
  teams: Map<string, Team>,
): Promise<SeasonResult> {
  const team = (name: string): Team | null => {
    const t = teams.get(name.toLowerCase());
    if (t) return t;
    if (PLACEHOLDER_RE.test(name)) return null;
    throw new Error(`Unknown WUL team "${name}" on the ${season} schedule — add it to wul_teams (and ingest-wul.py NAME_TO_SLUG).`);
  };

  // One season is ~40 rows, far under the 1000-row response cap.
  const { data, error } = await supabase
    .from('wul_games')
    .select('id, status, away_team_id, home_team_id, game_date, game_time, week_label')
    .eq('season', season);
  if (error) throw error;
  const existing = new Map(((data ?? []) as ExistingGame[]).map((r) => [r.id, r]));
  const finals = [...existing.values()].filter((r) => r.status === 'final');

  const keep = new Set<string>();
  const inserts: Record<string, unknown>[] = [];
  let updated = 0;
  const now = new Date().toISOString();

  for (const g of sheet) {
    const a = team(g.away);
    const b = team(g.home);
    if (!a || !b) continue;
    // ingest-wul.py: the stats source has no home/away, so the alphabetically
    // first slug is "away". Same here, or the final would land on another row.
    const [away, home] = a.id < b.id ? [a, b] : [b, a];
    const id = `${season}/${g.date}/${away.abbr}-vs-${home.abbr}`;
    const alreadyPlayed = finals.some(
      (f) => f.id === id || (
        f.away_team_id === away.id && f.home_team_id === home.id &&
        f.game_date != null && dayDiff(f.game_date, g.date) <= DATE_DRIFT_DAYS
      ),
    );
    if (alreadyPlayed) continue;
    keep.add(id);

    const weekLabel = g.post ? 'post' : 'regular';
    const row = existing.get(id);
    if (!row) {
      inserts.push({
        id, season, week_label: weekLabel, game_date: g.date, game_time: g.time,
        away_team_id: away.id, home_team_id: home.id, away_abbrev: away.abbr, home_abbrev: home.abbr,
        away_score: null, home_score: null, status: 'scheduled', updated_at: now,
      });
    } else if (row.game_time !== g.time || row.week_label !== weekLabel) {
      // eq('status', 'scheduled'): a final that lands between the read above
      // and this write is never downgraded.
      const { error: upErr } = await supabase
        .from('wul_games')
        .update({ game_time: g.time, week_label: weekLabel, updated_at: now })
        .eq('id', id)
        .eq('status', 'scheduled');
      if (upErr) throw upErr;
      updated++;
    }
  }

  if (inserts.length > 0) {
    const { error: insErr } = await supabase
      .from('wul_games')
      .upsert(inserts, { onConflict: 'id', ignoreDuplicates: true });
    if (insErr) throw insErr;
  }

  const stale = [...existing.values()]
    .filter((r) => r.status === 'scheduled' && !keep.has(r.id))
    .map((r) => r.id);
  if (stale.length > 0) {
    const { error: delErr } = await supabase
      .from('wul_games')
      .delete()
      .in('id', stale)
      .eq('status', 'scheduled');
    if (delErr) throw delErr;
  }

  return { season, published: true, onSheet: sheet.length, inserted: inserts.length, updated, deleted: stale.length };
}

async function runSync(supabase: SupabaseClient): Promise<SeasonResult[]> {
  const { data: teamRows, error } = await supabase.from('wul_teams').select('id, name, abbr');
  if (error) throw error;
  const teams = new Map<string, Team>();
  for (const t of (teamRows ?? []) as { id: string; name: string; abbr: string | null }[]) {
    if (!t.abbr) throw new Error(`wul_teams.${t.id} has no abbr — game ids need it.`);
    teams.set(t.name.toLowerCase(), { id: t.id, abbr: t.abbr });
  }

  // This year's schedule and next year's (published around December).
  const year = new Date().getUTCFullYear();
  const results: SeasonResult[] = [];
  for (const season of [year, year + 1]) {
    const urls = await sheetCsvUrls(season);
    if (!urls) {
      results.push({ season, published: false, onSheet: 0, inserted: 0, updated: 0, deleted: 0 });
      continue;
    }
    let games: SheetGame[] = [];
    for (const url of urls) {
      const { status, text } = await fetchText(url);
      if (status !== 200) throw new Error(`HTTP ${status} for the ${season} schedule sheet ${url}`);
      const parsed = parseSchedule(parseCsv(text), season);
      if (parsed.length > games.length) games = parsed;
    }
    if (games.length === 0) {
      throw new Error(`/${season}-schedule is published but no embedded sheet parsed into games — the sheet layout may have changed.`);
    }
    results.push(await syncSeason(supabase, season, games, teams));
  }
  return results;
}

async function sendAlert(errorMessage: string): Promise<boolean> {
  const apiKey = Deno.env.get('RESEND_API');
  const from = Deno.env.get('SEND_EMAIL');
  if (!apiKey || !from) {
    console.error('Cannot send alert — RESEND_API / SEND_EMAIL not set.');
    return false;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `The Layout <${from}>`,
      to: ALERT_TO,
      subject: '⚠️ WUL schedule sync failed',
      text:
        'The wul-schedule-sync edge function failed.\n\n' +
        `Error:\n${errorMessage}\n\n` +
        `Source: ${SITE}/{season}-schedule (a Google Sheet embedded on the page). ` +
        'A page or sheet layout change there is the most likely cause.',
    }),
  });
  if (!res.ok) console.error('Resend alert failed:', res.status, await res.text());
  return res.ok;
}

/** True when the bearer is a secret/service-role key for this project: only
 *  those can call the Auth admin API. */
async function callerHoldsSecretKey(req: Request): Promise<boolean> {
  const url = Deno.env.get('SUPABASE_URL');
  const key = /^Bearer\s+(\S+)$/i.exec(req.headers.get('Authorization') ?? '')?.[1];
  if (!url || !key) return false;
  const caller = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await caller.auth.admin.listUsers({ page: 1, perPage: 1 });
  return !error;
}

Deno.serve(async (req) => {
  if (!(await callerHoldsSecretKey(req))) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  try {
    const seasons = await runSync(db());
    return Response.json({ ok: true, seasons });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[wul-schedule-sync] failed:', message);
    const alertSent = await sendAlert(message);
    return Response.json({ ok: false, error: message, alertSent }, { status: 500 });
  }
});

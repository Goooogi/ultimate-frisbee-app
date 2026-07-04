// Legacy WFDF ingest — Ultiorganizer HTML (2022-2024 events, no static cache).
//
// These events run the old Ultiorganizer platform: server-rendered HTML at
// {base}/?view=X&season=SEASON. We parse three views:
//   - view=games  → games (team names + scores, grouped by division → pool/round)
//   - view=teams  → team roster of the event (team_id + name + country)
//   - view=teamcard&team=N → per-team named roster (BEST-EFFORT: 500s on some events)
//
// Games reference teams by NAME ONLY (no id), so we build teams from view=teams
// (which has ids + countries) and match games to them by normalized name.
//
// See memory project_wfdf_results_source for the full contract.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

const UA = 'Mozilla/5.0 (the-layout/wfdf-ingest)';
const ROSTER_CONCURRENCY = 5;
const FETCH_DELAY_MS = 150;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchHtml(url: string): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
      if (res.status >= 500) return null; // Ultiorganizer 500s are permanent (broken view)
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (attempt === 1) throw err;
      await sleep(600);
    }
  }
  return null;
}

// ── Tiny HTML helpers (no DOM in Deno edge; regex over server-rendered tables) ─

// Named HTML entities that show up in international team/player names.
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  agrave: 'à', egrave: 'è', igrave: 'ì', ograve: 'ò', ugrave: 'ù',
  acirc: 'â', ecirc: 'ê', icirc: 'î', ocirc: 'ô', ucirc: 'û',
  atilde: 'ã', otilde: 'õ', ntilde: 'ñ', Ntilde: 'Ñ',
  auml: 'ä', euml: 'ë', iuml: 'ï', ouml: 'ö', uuml: 'ü',
  Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß',
  ccedil: 'ç', Ccedil: 'Ç', aring: 'å', Aring: 'Å',
  oslash: 'ø', Oslash: 'Ø', aelig: 'æ', AElig: 'Æ',
};

function decode(s: string): string {
  return s
    // Numeric entities (decimal + hex), e.g. &#39; &#xE9;
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    // Named entities.
    .replace(/&([a-zA-Z]+);/g, (m, name) => NAMED_ENTITIES[name] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}
function stripTags(s: string): string {
  return decode(s.replace(/<[^>]+>/g, ' '));
}
function cellsOf(tr: string): string[] {
  return [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)]
    .map((m) => stripTags(m[1]))
    .filter((c) => c.length > 0);
}
function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// ── Division / round context tracking ────────────────────────────────────────
// The games page is a flat stream of headers + game rows. We walk it top-to-
// bottom, updating "current division" and "current pool/round" from header
// markers, and attach each game to that context.

const DIVISION_RE =
  /(Great Grand Master (?:Mixed|Open|Women'?s)|Grand Master (?:Mixed|Open|Women'?s)|Master (?:Mixed|Open|Women'?s)|Mixed|Open|Women'?s|Men)/;

function classifyRound(label: string): { pool: string | null; bracket: boolean } {
  const l = label.toLowerCase();
  if (/pool\s+[a-z]/.test(l)) {
    const m = label.match(/Pool\s+[A-Z]/i);
    return { pool: m ? m[0] : label, bracket: false };
  }
  if (/final|semi|quarter|playoff|placement|bracket|round of|\d+(st|nd|rd|th)\s*place|position/.test(l)) {
    return { pool: label, bracket: true };
  }
  return { pool: label || null, bracket: false };
}

export interface LegacyTeam {
  wfdfTeamId: number;
  name: string;
  country: string | null;
}
export interface LegacyGame {
  division: string;
  poolName: string | null;
  isBracket: boolean;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
}

// ── Parse view=teams → teams (id + name + country) ───────────────────────────
export function parseTeams(html: string): LegacyTeam[] {
  const out: LegacyTeam[] = [];
  const seen = new Set<number>();
  // Each team is a row with a teamcard link and a country cell.
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => m[1]);
  for (const r of rows) {
    const link = r.match(/view=teamcard&(?:amp;)?team=(\d+)[^>]*>\s*([^<]+?)\s*</);
    if (!link) continue;
    const id = Number(link[1]);
    if (seen.has(id)) continue;
    seen.add(id);
    const cells = cellsOf(r);
    // cells: [team_name, country, "Roster Scoreboard Games"]
    const country = cells.length >= 2 ? cells[1] : null;
    out.push({ wfdfTeamId: id, name: decode(link[2]), country: country || null });
  }
  return out;
}

// ── Parse view=games → games with division + pool/round context ──────────────
// Games sit in tables whose <th> header carries division + round, e.g. "Master
// Open Pool C" / "Master Mixed Playoff (9-16)". Ultiorganizer nests layout
// tables, so matching <table>…</table> is unreliable (a non-greedy match stops
// at the first </table>, which is often an inner nav table). Instead we walk
// the flat sequence of <th> headers and <tr> game rows in DOCUMENT ORDER: a
// division-shaped <th> sets the current context; each following game <tr>
// inherits it. Non-division <th> (plain column headers) are ignored.
// A score cell may carry an inline spirit value, e.g. "15 (11)". Extract the
// leading integer only; null if the cell isn't a score.
function scoreOf(cell: string): number | null {
  const m = cell.match(/^(\d{1,2})(?:\s*\(\d+\))?$/);
  return m ? Number(m[1]) : null;
}

export function parseGames(html: string): LegacyGame[] {
  const games: LegacyGame[] = [];
  let division = '';
  let pool: string | null = null;
  let bracket = false;

  // Walk each <tr> in document order. A <tr> whose <th> holds a division name is
  // a section header (sets context); every other <tr> is a candidate game row.
  // (The division header <th> lives INSIDE a <tr>, so we must inspect per-row —
  // not scan <th>/<tr> as separate tokens, which mis-nests.)
  for (const trm of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const tr = trm[1];
    const thm = tr.match(/<th[^>]*>([\s\S]*?)<\/th>/);
    if (thm) {
      const htext = stripTags(thm[1]);
      const dm = htext.match(DIVISION_RE);
      if (dm && htext.length < 48 && !/\d{1,2}\s*-\s*\d{1,2}/.test(htext)) {
        division = dm[0];
        const c = classifyRound(htext.slice(dm.index! + dm[0].length).trim());
        pool = c.pool;
        bracket = c.bracket;
      }
      continue;
    }
    if (!division) continue;
    const cells = cellsOf(tr);
    for (let i = 0; i + 3 < cells.length; i++) {
      const a = scoreOf(cells[i + 1]);
      const b = scoreOf(cells[i + 3]);
      if (cells[i + 2] === '-' && a !== null && b !== null) {
        const home = cells[i];
        const away = cells[i + 4] ?? '';
        if (home && away && !/^\d+$/.test(home) && !/^\d+$/.test(away)) {
          games.push({
            division,
            poolName: pool,
            isBracket: bracket,
            home: decode(home),
            away: decode(away),
            homeScore: a,
            awayScore: b,
          });
        }
        break;
      }
    }
  }
  return games;
}

// ── Parse view=teamcard → roster (best-effort) ───────────────────────────────
export interface LegacyRosterPlayer {
  fullName: string;
  jersey: string | null;
  goals: number | null;
  assists: number | null;
  games: number | null;
  total: number | null;
}
export function parseRoster(html: string): LegacyRosterPlayer[] {
  // Roster rows: [#, Name, Games, Assists, Goals, Total] (each Name has a
  // playercard link). Column order confirmed on WJUC-2024.
  const out: LegacyRosterPlayer[] = [];
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => m[1]);
  for (const r of rows) {
    if (!/playercard/.test(r)) continue;
    const cells = cellsOf(r);
    // Find the name (the cell that is a person name, via the playercard link text).
    const nameM = r.match(/view=playercard&(?:amp;)?[^>]*>\s*([A-Za-z][^<]+?)\s*</);
    if (!nameM) continue;
    const fullName = decode(nameM[1]);
    // Numeric cells after the name: games, assists, goals, total (in that order).
    const nums = cells.filter((c) => /^\d+$/.test(c)).map(Number);
    // The first cell is usually the jersey #; the trailing 4 are GP/A/G/Total.
    const jersey = /^\d{1,3}$/.test(cells[0] ?? '') && cells[0] !== fullName ? cells[0] : null;
    const tail = nums.slice(-4);
    const [gp, a, g, total] = tail.length === 4 ? tail : [null, null, null, null];
    out.push({
      fullName,
      jersey,
      games: gp ?? null,
      assists: a ?? null,
      goals: g ?? null,
      total: total ?? null,
    });
  }
  return out;
}

// ── Main legacy ingest ───────────────────────────────────────────────────────

export interface LegacyIngestConfig {
  base: string; // https://results.wfdf.sport/wmucc-2022
  season: string; // WMUCC2022
  name: string; // "WMUCC 2022"
  year: number;
  kind: string;
  isNational: boolean;
}

export interface LegacyResult {
  season: string;
  event: string;
  divisions: number;
  teams: number;
  rosterPlayers: number;
  games: number;
  rostersReachable: boolean;
}

export async function ingestLegacy(
  supabase: SupabaseClient,
  cfg: LegacyIngestConfig,
): Promise<LegacyResult> {
  const base = cfg.base.replace(/\/$/, '');
  const url = (view: string, extra = '') =>
    `${base}/?view=${view}&season=${encodeURIComponent(cfg.season)}${extra}`;

  // 1. Fetch the two core views.
  const [teamsHtml, gamesHtml] = await Promise.all([
    fetchHtml(url('teams')),
    fetchHtml(url('games')),
  ]);
  if (!teamsHtml && !gamesHtml) throw new Error('legacy: both teams + games views empty');

  const teams = teamsHtml ? parseTeams(teamsHtml) : [];
  const games = gamesHtml ? parseGames(gamesHtml) : [];

  // Distinct divisions come from the games (they carry the division context).
  const divisionNames = [...new Set(games.map((g) => g.division).filter(Boolean))];
  // Fallback: if games had no division headers, derive a single "Open" bucket.
  if (divisionNames.length === 0) divisionNames.push('Open');

  // 2. Upsert event.
  const { data: eventRow, error: evErr } = await supabase
    .from('wfdf_events')
    .upsert(
      {
        season_id: cfg.season,
        slug: cfg.season,
        name: cfg.name,
        year: cfg.year,
        kind: cfg.kind,
        is_national_teams: cfg.isNational,
        source_origin: base,
        static_base: null,
        last_scraped_at: new Date().toISOString(),
        last_scraped_status: 'ok-legacy',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'season_id' },
    )
    .select('id')
    .single();
  if (evErr) throw evErr;
  const eventId = eventRow.id as string;

  // 3. Divisions.
  const divRows = divisionNames.map((n, i) => ({
    event_id: eventId,
    wfdf_series_id: i + 1, // synthetic (legacy has no series ids in this view)
    name: n,
    ordering: String.fromCharCode(65 + i),
  }));
  await supabase.from('wfdf_divisions').upsert(divRows, { onConflict: 'event_id,wfdf_series_id' });
  const { data: divs } = await supabase
    .from('wfdf_divisions')
    .select('id, name')
    .eq('event_id', eventId);
  const divUuidByName = new Map<string, string>((divs ?? []).map((d: any) => [d.name, d.id]));

  // 4. Teams. Legacy view=teams is alphabetical (no per-division split), so a
  //    team's division is inferred from the games it appears in.
  const teamDivision = new Map<string, string>(); // normName → division
  for (const g of games) {
    if (!teamDivision.has(normName(g.home))) teamDivision.set(normName(g.home), g.division);
    if (!teamDivision.has(normName(g.away))) teamDivision.set(normName(g.away), g.division);
  }
  // Some teams only appear in view=teams (no games) — default their division to
  // the first one. Build the full team set from BOTH sources, keyed by name.
  const teamByNorm = new Map<string, LegacyTeam>();
  for (const t of teams) teamByNorm.set(normName(t.name), t);
  // Add game-only teams (no id) with a synthetic negative id so the row exists.
  let synthetic = -1;
  for (const g of games) {
    for (const nm of [g.home, g.away]) {
      if (!teamByNorm.has(normName(nm))) {
        teamByNorm.set(normName(nm), { wfdfTeamId: synthetic--, name: nm, country: null });
      }
    }
  }

  const teamRows = [...teamByNorm.values()].map((t) => ({
    event_id: eventId,
    wfdf_team_id: t.wfdfTeamId,
    division_id: divUuidByName.get(teamDivision.get(normName(t.name)) ?? divisionNames[0]) ?? null,
    name: t.name,
    country_name: t.country,
    country_code: t.country ? countryCode(t.country) : null,
    updated_at: new Date().toISOString(),
  }));
  if (teamRows.length) {
    await supabase.from('wfdf_teams').upsert(teamRows, { onConflict: 'event_id,wfdf_team_id' });
  }
  const { data: teamDb } = await supabase
    .from('wfdf_teams')
    .select('id, name, wfdf_team_id')
    .eq('event_id', eventId);
  const teamUuidByNorm = new Map<string, string>(
    (teamDb ?? []).map((t: any) => [normName(t.name), t.id]),
  );
  const teamUuidByWfdf = new Map<number, string>(
    (teamDb ?? []).map((t: any) => [t.wfdf_team_id, t.id]),
  );

  // 5. Games — match team names to uuids; derive division uuid.
  const gameRows = games.map((g, i) => ({
    event_id: eventId,
    wfdf_game_id: i + 1, // synthetic per-event game id (legacy games have no id)
    division_id: divUuidByName.get(g.division) ?? null,
    home_team_id: teamUuidByNorm.get(normName(g.home)) ?? null,
    away_team_id: teamUuidByNorm.get(normName(g.away)) ?? null,
    home_score: g.homeScore,
    away_score: g.awayScore,
    pool_name: g.poolName,
    is_bracket: g.isBracket,
    status: 'completed',
    updated_at: new Date().toISOString(),
  }));
  for (let i = 0; i < gameRows.length; i += 500) {
    await supabase.from('wfdf_games').upsert(gameRows.slice(i, i + 500), {
      onConflict: 'event_id,wfdf_game_id',
    });
  }

  // 5b. Derive team records (W/L + points for/against) from the games — legacy
  //     view=teams gives no standings, but we can compute them from scores.
  const rec = new Map<string, { w: number; l: number; pf: number; pa: number; g: number }>();
  const bump = (nm: string, gf: number, ga: number) => {
    const k = normName(nm);
    const r = rec.get(k) ?? { w: 0, l: 0, pf: 0, pa: 0, g: 0 };
    r.g += 1;
    r.pf += gf;
    r.pa += ga;
    if (gf > ga) r.w += 1;
    else if (ga > gf) r.l += 1;
    rec.set(k, r);
  };
  for (const g of games) {
    bump(g.home, g.homeScore, g.awayScore);
    bump(g.away, g.awayScore, g.homeScore);
  }
  const recUpdates = [...teamByNorm.values()]
    .map((t) => ({ t, r: rec.get(normName(t.name)) }))
    .filter((x) => x.r && teamUuidByWfdf.get(x.t.wfdfTeamId));
  await Promise.all(
    recUpdates.map(({ t, r }) =>
      supabase
        .from('wfdf_teams')
        .update({
          games: r!.g,
          wins: r!.w,
          losses: r!.l,
          scores_for: r!.pf,
          scores_against: r!.pa,
          updated_at: new Date().toISOString(),
        })
        .eq('id', teamUuidByWfdf.get(t.wfdfTeamId)!),
    ),
  );

  // 6. Best-effort rosters via view=teamcard&team=N (500s on some events → skip).
  let rosterPlayers = 0;
  let rostersReachable = false;
  const realTeams = teams.filter((t) => t.wfdfTeamId > 0);
  for (let i = 0; i < realTeams.length; i += ROSTER_CONCURRENCY) {
    const batch = realTeams.slice(i, i + ROSTER_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (t) => {
        const teamUuid = teamUuidByWfdf.get(t.wfdfTeamId);
        if (!teamUuid) return 0;
        let html: string | null = null;
        try {
          html = await fetchHtml(url('teamcard', `&team=${t.wfdfTeamId}`));
        } catch {
          return 0;
        }
        if (!html) return 0; // 500 → this event's rosters are unavailable
        const roster = parseRoster(html);
        if (roster.length === 0) return 0;
        const rows = roster.map((p, idx) => ({
          team_id: teamUuid,
          event_id: eventId,
          wfdf_player_id: idx + 1, // synthetic per-team player index
          full_name: p.fullName,
          first_name: p.fullName.split(' ')[0] ?? null,
          last_name: p.fullName.split(' ').slice(1).join(' ') || null,
          jersey_number: p.jersey,
          goals: p.goals,
          assists: p.assists,
          callahans: null,
          total: p.total,
          games: p.games,
        }));
        const { error } = await supabase
          .from('wfdf_rosters')
          .upsert(rows, { onConflict: 'team_id,wfdf_player_id' });
        return error ? 0 : rows.length;
      }),
    );
    const batchTotal = results.reduce((a, b) => a + b, 0);
    if (batchTotal > 0) rostersReachable = true;
    rosterPlayers += batchTotal;
    await sleep(FETCH_DELAY_MS);
  }

  return {
    season: cfg.season,
    event: cfg.name,
    divisions: divRows.length,
    teams: teamRows.length,
    rosterPlayers,
    games: gameRows.length,
    rostersReachable,
  };
}

// Minimal country-name → 3-letter code (legacy view=teams gives full names).
// Covers the common WFDF nations; unknowns fall back to the first 3 letters.
const COUNTRY_CODES: Record<string, string> = {
  'united states of america': 'USA', 'united states': 'USA', usa: 'USA',
  canada: 'CAN', australia: 'AUS', 'great britain': 'GBR',
  'united kingdom': 'GBR', japan: 'JPN', germany: 'GER', france: 'FRA',
  netherlands: 'NED', belgium: 'BEL', colombia: 'COL', 'south africa': 'RSA',
  italy: 'ITA', spain: 'ESP', 'new zealand': 'NZL', switzerland: 'SUI',
  austria: 'AUT', sweden: 'SWE', finland: 'FIN', norway: 'NOR',
  denmark: 'DEN', ireland: 'IRL', poland: 'POL', 'czech republic': 'CZE',
  czechia: 'CZE', china: 'CHN', india: 'IND', indonesia: 'INA',
  philippines: 'PHI', singapore: 'SGP', mexico: 'MEX', brazil: 'BRA',
  chile: 'CHI', argentina: 'ARG', 'hong kong': 'HKG', 'south korea': 'KOR',
  israel: 'ISR', ukraine: 'UKR', portugal: 'POR',
};
function countryCode(name: string): string | null {
  const c = COUNTRY_CODES[name.toLowerCase().trim()];
  if (c) return c;
  const clean = name.replace(/[^A-Za-z ]/g, '').trim();
  return clean ? clean.slice(0, 3).toUpperCase() : null;
}

// EUCS / EUF Ultiorganizer HTML parsers.
//
// Source: https://eucs-schedule.ultimatefederation.eu/?view=X&season=SEASON
// There is NO JSON API (`?view=json` returns 200 with an empty body), so every
// view below is server-rendered HTML parsed with regex (no DOM in Deno edge).
//
// Views used:
//   ?view=games&season=S&filter=tournaments&group=all → games (scores + rounds)
//   ?view=teams&season=S&list=allteams               → team list (name+country)
//   ?view=teamcard&team=N                            → division + roster totals
//   ?view=gameplay&game=N                            → per-game box score
//
// NOT used: ?view=allplayers — it IGNORES the season param and returns a global
// 600-row truncated list, identical for every event. Rosters come from teamcard.

export type Division = 'Open' | "Women's" | 'Mixed';
export type Stage =
  | 'pool' | 'crossover' | 'bracket'
  | 'quarterfinal' | 'semifinal' | 'final' | 'placement' | 'other';

// Named entities seen in European team/player names. Ultiorganizer emits these
// unescaped in places (e.g. "KFUM &Ouml;rebro Frisbee").
const ENTITIES: Record<string, string> = {
  amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  agrave: 'à', egrave: 'è', igrave: 'ì', ograve: 'ò', ugrave: 'ù',
  acirc: 'â', ecirc: 'ê', icirc: 'î', ocirc: 'ô', ucirc: 'û',
  atilde: 'ã', otilde: 'õ', ntilde: 'ñ', Ntilde: 'Ñ',
  auml: 'ä', euml: 'ë', iuml: 'ï', ouml: 'ö', uuml: 'ü',
  Auml: 'Ä', Euml: 'Ë', Iuml: 'Ï', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß',
  ccedil: 'ç', Ccedil: 'Ç', aring: 'å', Aring: 'Å',
  oslash: 'ø', Oslash: 'Ø', aelig: 'æ', AElig: 'Æ',
  scaron: 'š', Scaron: 'Š', zcaron: 'ž', Zcaron: 'Ž',
  ccaron: 'č', Ccaron: 'Č', rcaron: 'ř', Rcaron: 'Ř',
};

export function decode(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, n) => ENTITIES[n] ?? m)
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const stripTags = (s: string) => decode(s.replace(/<[^>]+>/g, ' '));

const cellsOf = (tr: string) =>
  [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)]
    .map((m) => stripTags(m[1]))
    .filter((c) => c !== '');

// The page wraps its nav/menu in <tr>s too — skip anything carrying chrome classes.
const isChrome = (tr: string) =>
  /class='(?:menu|nav|season|guides|subnav|topheader|navigation)/.test(tr);

const DIVISION_RE = /^(Mixed|Open|Women)\b/;

const toDivision = (raw: string): Division =>
  raw === 'Women' ? "Women's" : (raw as Division);

/** Section headers are "<Division> <Round>", e.g. "Open Bracket 1-8 Finals". */
export function parseSectionHeader(
  text: string,
): { division: Division; round: string; stage: Stage; isBracket: boolean } | null {
  const m = text.match(DIVISION_RE);
  if (!m) return null;
  const round = text.slice(m[0].length).trim();
  const l = round.toLowerCase();
  // Order matters: "Bracket 1-8 Semifinals" contains BOTH "semi" and "final",
  // and "…Finals" contains "final" — so semi/quarter must be tested first.
  const stage: Stage = /semi/.test(l)
    ? 'semifinal'
    : /quarter/.test(l)
    ? 'quarterfinal'
    : /final/.test(l)
    ? 'final'
    : /placement/.test(l)
    ? 'placement'
    : /crossover/.test(l)
    ? 'crossover'
    : /bracket/.test(l)
    ? 'bracket'
    : /pool/.test(l)
    ? 'pool'
    : 'other';
  return {
    division: toDivision(m[1]),
    round: round || 'Pool',
    stage,
    isBracket: stage !== 'pool' && stage !== 'other',
  };
}

export interface ParsedGame {
  eufGameId: number | null;
  division: Division;
  round: string;
  stage: Stage;
  isBracket: boolean;
  time: string | null;
  field: string | null;
  /** ISO date (YYYY-MM-DD) of the day this game was played, from the
   *  "<h3>Sat 20.9.2025</h3>" header that precedes each day's rows. */
  date: string | null;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  forfeit: boolean;
}

/**
 * Day headers look like "<h3>Sat 20.9.2025 <a …></a></h3>" — D.M.YYYY, so the
 * FIRST number is the day and the second the month (not US order). Returns an
 * ISO date, or null when the header carries no parseable date (some events emit
 * a bare "<h3>Bracket</h3>").
 */
export function parseDayHeader(h3: string): string | null {
  const m = h3.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const day = Number(d);
  const month = Number(mo);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * The games view is a flat stream of section headers + game rows; we walk it
 * top-to-bottom carrying the current (division, round) context.
 */
export function parseGames(html: string): ParsedGame[] {
  const out: ParsedGame[] = [];
  let ctx: ReturnType<typeof parseSectionHeader> = null;
  let day: string | null = null;

  // Walk <h3> day headers and <tr> game rows TOGETHER in document order: the
  // date lives only in the header that precedes each day's block, so matching
  // <tr> alone (as this did before) threw the date away. One combined regex
  // keeps the two interleaved without a second positional pass.
  for (const m of html.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>|<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    if (m[1] !== undefined) {
      const parsed = parseDayHeader(stripTags(m[1]));
      // Keep the previous day when a header carries no date (e.g. "<h3>Bracket</h3>")
      // rather than blanking it for every row that follows.
      if (parsed) day = parsed;
      continue;
    }
    const tr = m[2];
    if (isChrome(tr)) continue;
    const cells = cellsOf(tr);

    if (cells.length === 1) {
      const hdr = parseSectionHeader(cells[0]);
      if (hdr) ctx = hdr;
      continue;
    }
    if (!ctx) continue;

    // Row shape: [time, field, home, "11 (9)", "-", "15 (9)", away, ...]
    const sep = cells.indexOf('-');
    if (sep < 1 || !cells[sep + 1]) continue;
    const hs = cells[sep - 1].match(/^(\d+)/);
    const as = cells[sep + 1].match(/^(\d+)/);
    const home = cells[sep - 2];
    const away = cells[sep + 2];
    if (!hs || !as || !home || !away) continue;

    // Forfeits have no gameplay page at all — keep the result, flag the row.
    const gid = tr.match(/view=gameplay&amp;game=(\d+)/)?.[1];

    out.push({
      eufGameId: gid ? Number(gid) : null,
      division: ctx.division,
      round: ctx.round,
      stage: ctx.stage,
      isBracket: ctx.isBracket,
      time: cells.find((c) => /^\d{1,2}:\d{2}$/.test(c)) ?? null,
      field: cells.find((c) => /^Field\b/i.test(c)) ?? null,
      date: day,
      home,
      away,
      homeScore: Number(hs[1]),
      awayScore: Number(as[1]),
      forfeit: !gid,
    });
  }
  return out;
}

export interface ParsedTeamRef {
  eufTeamId: number;
  name: string;
  country: string | null;
}

/** ?view=teams&list=allteams → id + name + country (NO division; see teamcard). */
export function parseTeamList(html: string): ParsedTeamRef[] {
  const out: ParsedTeamRef[] = [];
  for (const m of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const tr = m[1];
    if (isChrome(tr)) continue;
    const id = tr.match(/view=teamcard&amp;team=(\d+)/)?.[1];
    if (!id) continue;
    const cells = cellsOf(tr);
    if (!cells.length) continue;
    out.push({
      eufTeamId: Number(id),
      name: cells[0],
      country: cells[1] ?? null,
    });
  }
  return out;
}

export interface ParsedRosterPlayer {
  eufPlayerId: number;
  jersey: string | null;
  name: string;
  games: number | null;
  assists: number | null;
  goals: number | null;
  total: number | null;
}

/**
 * ?view=teamcard&team=N → the team's division + its roster with event totals.
 *
 * The "<Name> (Open|Women|Mixed)" header is the ONLY authoritative team→division
 * signal: the teams list has no division column, and a club can enter an Open and
 * a Women's team under the same name AND country (3SB, GRUT, Bristol @ EUCF25).
 */
export function parseTeamcard(html: string): {
  name: string | null;
  division: Division | null;
  players: ParsedRosterPlayer[];
} {
  const headers = [...html.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/g)].map((m) =>
    stripTags(m[1]),
  );
  const hit = headers
    .map((h) => h.match(/^(.+?)\s*\((Open|Women|Mixed)\)\s*$/))
    .find(Boolean);

  const players: ParsedRosterPlayer[] = [];
  for (const m of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const tr = m[1];
    if (isChrome(tr)) continue;
    const pid = tr.match(/view=playercard&amp;series=\d+&amp;player=(\d+)/)?.[1];
    if (!pid) continue;
    const cells = cellsOf(tr);
    const name = cells.find((c) => /[a-zA-Z]/.test(c) && !/^\d+$/.test(c));
    if (!name) continue;
    // Row shape: [#, Name, Games, Assists, Goals, Total] — read numbers from the
    // right so a missing jersey number can't shift the stat columns.
    const nums = cells.filter((c) => /^\d+$/.test(c));
    const at = (back: number) =>
      nums.length >= back ? Number(nums[nums.length - back]) : null;
    players.push({
      eufPlayerId: Number(pid),
      jersey: /^\d+$/.test(cells[0]) ? cells[0] : null,
      name,
      games: at(4),
      assists: at(3),
      goals: at(2),
      total: at(1),
    });
  }

  return {
    name: hit ? hit[1].trim() : null,
    division: hit ? toDivision(hit[2]) : null,
    players,
  };
}

export interface ParsedStatLine {
  jersey: string | null;
  name: string;
  assists: number;
  goals: number;
  total: number;
}

/**
 * ?view=gameplay&game=N → two box-score blocks (home then away), each preceded
 * by an "Ast." header row. Returns them in document order.
 *
 * Coverage caveat: box-score goals reconcile exactly to the final score in
 * ~91% of games; the remainder are upstream scorekeeping gaps, not parse errors.
 */
export function parseGameplay(html: string): ParsedStatLine[][] {
  const blocks: ParsedStatLine[][] = [];
  let current: ParsedStatLine[] | null = null;

  for (const m of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const tr = m[1];
    if (isChrome(tr)) continue;
    const cells = cellsOf(tr);
    if (cells.some((c) => /^Ast\.?$/i.test(c))) {
      current = [];
      blocks.push(current);
      continue;
    }
    if (!current) continue;
    // [#, Name, Ast., Goals, Tot.]
    if (
      cells.length >= 5 &&
      /^\d+$/.test(cells[0]) &&
      /[a-zA-Z]/.test(cells[1]) &&
      /^\d+$/.test(cells[2]) &&
      /^\d+$/.test(cells[3])
    ) {
      current.push({
        jersey: cells[0],
        name: cells[1],
        assists: Number(cells[2]),
        goals: Number(cells[3]),
        total: Number(cells[4] ?? 0),
      });
    }
  }
  return blocks.filter((b) => b.length > 0);
}

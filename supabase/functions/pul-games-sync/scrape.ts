/**
 * PUL games scrape library — schedule index + per-game box scores.
 *
 * ⚠️  SYNCED COPY of scripts/lib/pul-games-scrape.ts. Edge deploys take inline
 *     files and can't reach into scripts/, so this is a verbatim copy. If you
 *     change the canonical lib, re-copy it here and redeploy:
 *       cp scripts/lib/pul-games-scrape.ts supabase/functions/pul-games-sync/scrape.ts
 *
 * Pure/portable: no dotenv, no process.exit, no Node-only imports. The only I/O
 * is whatever `fetchHtml` the caller injects — edge-safe.
 *
 * ─── Data source (verified 2026-06-10 against pul-stats-hub.pages.dev) ───────
 *
 * /schedule
 *   One static page, ~600 KB, listing EVERY game 2022–2026 (~170 games). Each
 *   game is a link: /games/{season}/{weekLabel}/{AWAY}-vs-{HOME}
 *     weekLabel ∈ { 'week-N', 'semifinals', 'finals' }
 *   The schedule island also carries matchup metadata records with keys:
 *     away, home, awayAbbrev, homeAbbrev, gameDate (M/D/YYYY), gameTime,
 *     location  — but NO score (scores live on the game page).
 *   We treat the GAME-LINK URLs as the authoritative game list (the inline
 *   island records are partial in the static HTML) and enrich each with the
 *   matching metadata record when present.
 *
 * /games/{...}
 *   PLAYED game  → header score block (two big font-display numbers split by an
 *                  en-dash) + two box-score islands (one per team) with full
 *                  per-player stat records. Marker text: "Results".
 *   UNPLAYED game → marker text "Upcoming", 0 box-score islands, no score block.
 *
 * IMPORTANT: the final score is taken from the HEADER, never computed from the
 * sum of player goals — they legitimately differ (Callahans, untracked scorers;
 * e.g. IND-MIN 2024 wk10 header 15–20 vs goal sums 14/17).
 *
 * away_/home_ ordering everywhere follows the {AWAY}-vs-{HOME} URL convention.
 */

// ─── Abbrev → pul_teams.id map ─────────────────────────────────────────────
// URL/box-score abbrevs → DB team slugs. MED = Medellín Revolution (2022 only).

export const ABBREV_TO_TEAM_ID: Record<string, string> = {
  ATL: 'atlanta',
  ATX: 'austin',
  COL: 'columbus',
  DC: 'dc',
  IND: 'indy',
  LA: 'la',
  MED: 'medellin',
  MIN: 'minnesota',
  MKE: 'milwaukee',
  NSH: 'nashville',
  NY: 'newyork',
  PHL: 'philadelphia',
  POR: 'portland',
  RAL: 'raleigh',
};

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ScheduledGame {
  /** Stable id = the stats-hub path slug, e.g. '2024/week-10/IND-vs-MIN'. */
  id: string;
  season: number;
  weekLabel: string; // 'week-7' | 'semifinals' | 'finals'
  weekNum: number | null;
  awayAbbrev: string;
  homeAbbrev: string;
  awayTeamId: string;
  homeTeamId: string;
}

export interface GamePlayerStat {
  teamId: string;
  playerName: string;
  jerseyNumber: string;
  goals: number;
  assists: number;
  blocks: number;
  turnovers: number;
  touches: number;
  oPoints: number;
  dPoints: number;
  plusMinus: number;
}

export interface ParsedGamePage {
  status: 'scheduled' | 'final';
  awayScore: number | null;
  homeScore: number | null;
  /** ISO date (YYYY-MM-DD) from the game header, or null. */
  gameDate: string | null;
  location: string | null;
  playerStats: GamePlayerStat[];
  warnings: string[];
}

// ─── HTML entity unescaping (shared shape with pul-scrape.ts) ───────────────

export function unescapeHtml(raw: string): string {
  return raw
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([\da-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

// ─── Astro prop value extraction (shared shape with pul-scrape.ts) ──────────

function getPropString(obj: string, key: string): string | null {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`"${escapedKey}":\\[0,"((?:[^"\\\\]|\\\\.)*)"`);
  const m = obj.match(re);
  if (!m) return null;
  return m[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

function getPropNumber(obj: string, key: string): number | null {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`"${escapedKey}":\\[0,(-?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)`);
  const m = obj.match(re);
  if (!m) return null;
  const n = Number(m[1]);
  return isFinite(n) ? n : null;
}

// ─── Schedule parse ─────────────────────────────────────────────────────────

const GAME_LINK_RE = /\/games\/(\d{4})\/([a-z0-9-]+)\/([A-Z]+)-vs-([A-Z]+)/g;

/** weekLabel → week number (null for playoff rounds). */
function weekNumFromLabel(label: string): number | null {
  const m = label.match(/^week-(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

/** Convert the source 'M/D/YYYY' to ISO 'YYYY-MM-DD'. Null on anything else. */
function toIsoDate(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, mo, d, y] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/**
 * Parse the /schedule page into a de-duplicated list of games.
 *
 * The authoritative game list is the /games/* link URLs (complete + stable).
 * Date / location are NOT taken from here — the static schedule HTML only
 * inlines a couple of game records — they're read per-game in parseGamePage().
 */
export function parseSchedule(html: string): { games: ScheduledGame[]; warnings: string[] } {
  const warnings: string[] = [];
  const decoded = unescapeHtml(html);

  const seen = new Set<string>();
  const games: ScheduledGame[] = [];
  const re = new RegExp(GAME_LINK_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(decoded)) !== null) {
    const [, seasonStr, weekLabel, awayAbbrev, homeAbbrev] = m;
    const id = `${seasonStr}/${weekLabel}/${awayAbbrev}-vs-${homeAbbrev}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const awayTeamId = ABBREV_TO_TEAM_ID[awayAbbrev];
    const homeTeamId = ABBREV_TO_TEAM_ID[homeAbbrev];
    if (!awayTeamId || !homeTeamId) {
      warnings.push(`Unknown team abbrev in ${id} (away=${awayAbbrev} home=${homeAbbrev}) — skipped`);
      continue;
    }

    games.push({
      id,
      season: parseInt(seasonStr, 10),
      weekLabel,
      weekNum: weekNumFromLabel(weekLabel),
      awayAbbrev,
      homeAbbrev,
      awayTeamId,
      homeTeamId,
    });
  }

  if (games.length === 0) {
    warnings.push('parseSchedule found 0 games — page structure may have changed.');
  }
  return { games, warnings };
}

// ─── Game page parse ────────────────────────────────────────────────────────

const ISLAND_RE = /<astro-island\b[^>]*\sprops="([^"]*)"[^>]*>/g;
// A single player record object inside a box-score island.
const RECORD_RE = /\[0,(\{(?:[^{}]|\{[^{}]*\})*\})\]/g;

/**
 * Extract the header final score: two large font-display score numbers split by
 * an en-dash span. Returns [awayScore, homeScore] in URL order (header renders
 * away-left / home-right, same as the URL), or null if no score block.
 *
 * The discriminator is the en-dash SEPARATOR span between the two numbers —
 * `<span ...>–</span>` flanked by two number spans. We anchor on that so the
 * page's other font-display elements (e.g. the "PUL Stats Hub" wordmark) don't
 * cause a false/partial match. Both score spans carry `tabular`-ish sizing
 * classes (text-4xl/5xl/6xl); we match a number span, the dash span, a number
 * span, allowing arbitrary class attributes.
 */
function extractHeaderScore(decoded: string): [number, number] | null {
  const m = decoded.match(
    /<span[^>]*\btext-(?:4xl|5xl|6xl)\b[^>]*>\s*(\d{1,2})\s*<\/span>\s*<span[^>]*>\s*[–-]\s*<\/span>\s*<span[^>]*\btext-(?:4xl|5xl|6xl)\b[^>]*>\s*(\d{1,2})\s*<\/span>/,
  );
  if (!m) return null;
  return [parseInt(m[1], 10), parseInt(m[2], 10)];
}

/** Parse one player record from a box-score island. Null if not a player row. */
function parsePlayerRecord(rec: string, warnings: string[]): GamePlayerStat | null {
  const rawPlayerField = getPropString(rec, 'player');
  if (!rawPlayerField) return null;
  // Column-definition objects have accessorKey but no real player value.
  if (rec.includes('"accessorKey":[0,') && !rawPlayerField) return null;

  const teamAbbrev = getPropString(rec, 'teamAbbrev');
  const teamId = teamAbbrev ? ABBREV_TO_TEAM_ID[teamAbbrev] : undefined;
  if (!teamId) {
    if (teamAbbrev) warnings.push(`Unknown teamAbbrev "${teamAbbrev}" in box score — skipped`);
    return null;
  }

  // "player" = "NN Name" — split leading jersey digits from the name.
  const jerseyMatch = rawPlayerField.match(/^(\d+)\s+(.+)$/);
  const jerseyNumber = jerseyMatch ? jerseyMatch[1] : '';
  const playerName = jerseyMatch ? jerseyMatch[2].trim() : rawPlayerField.trim();
  if (!playerName) return null;

  const stat: GamePlayerStat = {
    teamId,
    playerName,
    jerseyNumber,
    goals: getPropNumber(rec, 'goals') ?? 0,
    assists: getPropNumber(rec, 'assists') ?? 0,
    blocks: getPropNumber(rec, 'blocks') ?? 0,
    turnovers: getPropNumber(rec, 'turnovers') ?? 0,
    touches: getPropNumber(rec, 'touches') ?? 0,
    oPoints: getPropNumber(rec, 'offensePoints') ?? 0,
    dPoints: getPropNumber(rec, 'defensePoints') ?? 0,
    plusMinus: getPropNumber(rec, '+/-') ?? 0,
  };

  const nums = [
    stat.goals, stat.assists, stat.blocks, stat.turnovers, stat.touches,
    stat.oPoints, stat.dPoints, stat.plusMinus,
  ];
  if (nums.some((n) => isNaN(n))) {
    warnings.push(`NaN stat for "${playerName}" — skipped`);
    return null;
  }
  return stat;
}

/**
 * Parse a /games/* page.
 *
 * Status:
 *   - UNPLAYED game → carries an "Upcoming" marker and no header score block →
 *     status 'scheduled', null scores, no box score.
 *   - PLAYED game → no "Upcoming" marker; has a header score block. status
 *     'final'. Per-player box scores are present 2023+ and ABSENT for 2022
 *     (older pages render the score + recap but no box-score islands), so the
 *     presence of box scores does NOT gate the final decision — only the
 *     score block / absence of "Upcoming" does.
 */
export function parseGamePage(html: string): ParsedGamePage {
  const warnings: string[] = [];
  const decoded = unescapeHtml(html);

  // Collect box-score player records (box-score islands carry "player").
  const playerStats: GamePlayerStat[] = [];
  const seen = new Set<string>(); // (teamId|name) dedupe within a game
  let im: RegExpExecArray | null;
  const islandRe = new RegExp(ISLAND_RE.source, 'g');
  while ((im = islandRe.exec(html)) !== null) {
    const props = unescapeHtml(im[1]);
    if (!props.includes('"player":[0,')) continue;
    let rm: RegExpExecArray | null;
    const recRe = new RegExp(RECORD_RE.source, 'g');
    while ((rm = recRe.exec(props)) !== null) {
      const rec = rm[1];
      if (!rec.includes('"player":[0,')) continue;
      const stat = parsePlayerRecord(rec, warnings);
      if (!stat) continue;
      const key = `${stat.teamId}|${stat.playerName.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      playerStats.push(stat);
    }
  }

  const gameDate = extractGameDate(decoded);
  const location = extractLocation(decoded);

  const score = extractHeaderScore(decoded);
  const isUpcoming = /\bUpcoming\b/.test(decoded) && !score;

  if (isUpcoming) {
    return { status: 'scheduled', awayScore: null, homeScore: null, gameDate, location, playerStats: [], warnings };
  }

  // Played. Score from the header is authoritative (never goal sums — they
  // legitimately differ via Callahans / untracked scorers).
  if (!score) {
    warnings.push('No "Upcoming" marker and no header score block — ambiguous; storing as scheduled.');
    return { status: 'scheduled', awayScore: null, homeScore: null, gameDate, location, playerStats: [], warnings };
  }
  return { status: 'final', awayScore: score[0], homeScore: score[1], gameDate, location, playerStats, warnings };
}

/** Pull the first M/D/YYYY date from the game header → ISO, or null. */
function extractGameDate(decoded: string): string | null {
  const m = decoded.match(/\b(\d{1,2}\/\d{1,2}\/\d{4})\b/);
  return m ? toIsoDate(m[1]) : null;
}

/** Pull a venue name (…Stadium/Field/Park/Complex/Center/Sportsplex) or null. */
function extractLocation(decoded: string): string | null {
  const m = decoded.match(/>([^<>]*(?:Stadium|Field|Park|Complex|Center|Sportsplex)[^<>]*)</);
  return m ? m[1].trim() : null;
}

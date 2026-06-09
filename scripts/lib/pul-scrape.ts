/**
 * PUL scrape library — shared between the CLI backfill (Phase 1) and the
 * edge function cron (Phase 2).
 *
 * All logic here is pure/portable: no dotenv, no process.exit, no Node-only
 * imports. The only I/O is the single `fetchHtml` function injected by the
 * caller — this makes the parse logic testable and edge-function safe.
 *
 * ─── Island structure (verified against Minnesota Strike, 2026-06-08) ────────
 *
 * The Astro static page (~550 KB) always embeds ALL seasons regardless of the
 * ?season= URL param (which is ignored server-side). One fetch per team yields
 * all history.
 *
 * There are ~11 <astro-island> tags. We classify each by its decoded props:
 *
 *   ROSTER island   — props contain "player":[0,  but NOT "seasons":[0, or
 *                     "seasonsList". One per season in the page.
 *   CONFIG island   — immediately follows each roster island; props contain
 *                     "gameLinkSeason" and exactly ONE 4-digit year.
 *   ALL-TIME island — contains "seasons":[0, AND "seasonsList" → SKIP.
 *
 * Island pairing (Minnesota): [0,1] [3,4] [5,6] [7,8]
 *   roster[0] → config[1] → 2026
 *   roster[3] → config[4] → 2025
 *   roster[5] → config[6] → 2024
 *   roster[7] → config[8] → 2023
 *
 * Teams with fewer seasons (e.g. expansion teams) will have fewer roster+config
 * island pairs — that is expected and handled gracefully.
 *
 * ─── Per-season stat key availability ────────────────────────────────────────
 *
 * 2026/2025/2024: full stat set
 *   player, number, pronouns, team, teamAbbrev, _accentColor,
 *   goals, assists, secondaryAssists, blocks, turnovers, touches,
 *   throws, catches, offensePoints, defensePoints, possessionsInitiated,
 *   throwerErrors, receiverErrors, throwGainTotal, throwGainAvg,
 *   catchGainTotal, catchGainAvg, +/-, totalPoints, gamesPlayed
 *
 * 2023: reduced set (no pronouns, no offensePoints/defensePoints, no
 *   throws/catches/secondary/gain fields)
 *   player, team, teamAbbrev, _accentColor,
 *   goals, assists, blocks, turnovers, touches, +/-, totalPoints, gamesPlayed
 *
 * DB columns o_points / d_points map to offensePoints / defensePoints.
 * They are left at 0 for 2023 rows (island does not emit them).
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParsedPlayer {
  playerName:   string;
  jerseyNumber: string | null;
  pronouns:     string | null;
  gamesPlayed:  number;
  goals:        number;
  assists:      number;
  blocks:       number;
  turnovers:    number;
  touches:      number;
  oPoints:      number;   // offensePoints — 0 when not present (2023)
  dPoints:      number;   // defensePoints — 0 when not present (2023)
  plusMinus:    number;
}

export interface ParsedTeamPage {
  /** Accent color hex string taken from the first player record (e.g. "#87CEEB"). */
  accentColor:    string | null;
  /** season → player rows for that season */
  seasonPlayers:  Map<number, ParsedPlayer[]>;
  /** Seasons found, in document order (most-recent first) */
  seasonsFound:   number[];
  /** Warnings accumulated during parse */
  warnings:       string[];
}

// ─── HTML entity unescaping ───────────────────────────────────────────────────

/**
 * Unescape HTML entities used by Astro in props="" attributes.
 * Handles: &quot; &#x27; &amp; &lt; &gt; &nbsp; numeric decimal/hex.
 */
export function unescapeHtml(raw: string): string {
  return raw
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([\da-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

// ─── Island extraction ────────────────────────────────────────────────────────

const ISLAND_RE = /<astro-island\b[^>]*\sprops="([^"]*)"[^>]*>/g;

/** Extract decoded props strings for every <astro-island> in document order. */
function extractIslands(html: string): string[] {
  const results: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(ISLAND_RE.source, 'g');
  while ((m = re.exec(html)) !== null) {
    results.push(unescapeHtml(m[1]));
  }
  return results;
}

/** True if this island contains per-season roster player records (not the all-time island). */
function isRosterIsland(props: string): boolean {
  return (
    props.includes('"player":[0,') &&
    !props.includes('"seasons":[0,') &&
    !props.includes('"seasonsList"')
  );
}

/**
 * Extract the single 4-digit season year from a config island's props.
 * Config islands follow each roster island and contain "gameLinkSeason".
 * Returns null if no unambiguous year is found.
 */
function extractConfigYear(props: string): number | null {
  if (!props.includes('gameLinkSeason')) return null;
  const years = props.match(/\b(202\d)\b/g);
  if (!years) return null;
  const unique = [...new Set(years)];
  return unique.length === 1 ? parseInt(unique[0], 10) : null;
}

// ─── Astro prop value extraction ──────────────────────────────────────────────

/**
 * Extract a string value from Astro's tagged prop format: "key":[0,"value"]
 * Returns null if key absent or value is not a string.
 */
function getPropString(obj: string, key: string): string | null {
  // Escape key for regex (handle +/-)
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`"${escapedKey}":\\[0,"((?:[^"\\\\]|\\\\.)*)"`);
  const m = obj.match(re);
  if (!m) return null;
  // Unescape backslash-escaped quotes in the value (Astro encodes " as \")
  return m[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

/**
 * Extract a numeric value from Astro's tagged prop format: "key":[0,123]
 * Returns null if key absent or value is not a finite number.
 */
function getPropNumber(obj: string, key: string): number | null {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`"${escapedKey}":\\[0,(-?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)`);
  const m = obj.match(re);
  if (!m) return null;
  const n = Number(m[1]);
  return isFinite(n) ? n : null;
}

// ─── Player record extraction ─────────────────────────────────────────────────

// Extract individual player record objects from within a roster island's props.
// The Astro format is: {"data":[1,[[0,{RECORD}],[0,{RECORD}]...]]}
// We match the outermost single-depth objects that contain "player":[0,
const RECORD_RE = /\[0,(\{(?:[^{}]|\{[^{}]*\})*\})\]/g;

/**
 * Parse all player records from a roster island's decoded props string.
 * Returns [records, accentColor].
 */
function parseRosterIsland(
  props: string,
  season: number,
  teamId: string,
  warnings: string[],
): { players: ParsedPlayer[]; accentColor: string | null } {
  const rawPlayers: ParsedPlayer[] = [];
  let accentColor: string | null = null;

  const re = new RegExp(RECORD_RE.source, 'g');
  let m: RegExpExecArray | null;

  while ((m = re.exec(props)) !== null) {
    const rec = m[1];
    // Only process records that are player records
    if (!rec.includes('"player":[0,')) continue;
    // Skip the column-definition objects (they have "header":[0, but no playerName pattern)
    if (rec.includes('"accessorKey":[0,') && !getPropString(rec, 'player')) continue;

    const rawPlayerField = getPropString(rec, 'player');
    if (!rawPlayerField) continue;

    // Capture accent color from first record seen
    if (!accentColor) {
      accentColor = getPropString(rec, '_accentColor');
    }

    // "player" field = "NN Name" — split leading jersey digits from name.
    // Pattern: optional leading digits (jersey), then the name.
    // Handles: "01 Greta Friedrichs", "02 Stephanie \"Steph\" Wood", "00 Alicia Carr"
    const jerseyMatch = rawPlayerField.match(/^(\d+)\s+(.+)$/);
    const jerseyNumber = jerseyMatch ? jerseyMatch[1] : null;
    const playerName   = jerseyMatch ? jerseyMatch[2].trim() : rawPlayerField.trim();

    if (!playerName) {
      warnings.push(`[${teamId}] season=${season} — empty player name in record, skipping`);
      continue;
    }

    // Extract stats with defaults. All-zeros is valid (player on roster, didn't play).
    const goals      = getPropNumber(rec, 'goals')      ?? 0;
    const assists    = getPropNumber(rec, 'assists')     ?? 0;
    const blocks     = getPropNumber(rec, 'blocks')      ?? 0;
    const turnovers  = getPropNumber(rec, 'turnovers')   ?? 0;
    const touches    = getPropNumber(rec, 'touches')     ?? 0;
    const gamesPlayed = getPropNumber(rec, 'gamesPlayed') ?? 0;
    // offensePoints / defensePoints — absent in 2023, default 0
    const oPoints    = getPropNumber(rec, 'offensePoints') ?? 0;
    const dPoints    = getPropNumber(rec, 'defensePoints') ?? 0;
    // +/- key contains special chars — use the string key name directly
    const plusMinus  = getPropNumber(rec, '+/-') ?? 0;
    const pronouns   = getPropString(rec, 'pronouns');

    // Guard: skip rows where ANY stat is NaN (not the same as 0)
    if (
      isNaN(goals) || isNaN(assists) || isNaN(blocks) || isNaN(turnovers) ||
      isNaN(touches) || isNaN(gamesPlayed) || isNaN(oPoints) || isNaN(dPoints) ||
      isNaN(plusMinus)
    ) {
      warnings.push(
        `[${teamId}] season=${season} — NaN in stats for "${playerName}", skipping`,
      );
      continue;
    }

    rawPlayers.push({
      playerName,
      jerseyNumber,
      pronouns,
      gamesPlayed,
      goals,
      assists,
      blocks,
      turnovers,
      touches,
      oPoints,
      dPoints,
      plusMinus,
    });
  }

  // Deduplicate within this (team, season) by player name (case-insensitive).
  // Confirmed: Philadelphia Surge had the Lisa Dang dupe in v1. Keep first occurrence.
  const seen  = new Set<string>();
  const players: ParsedPlayer[] = [];
  for (const p of rawPlayers) {
    const key = p.playerName.toLowerCase();
    if (seen.has(key)) {
      warnings.push(
        `[${teamId}] season=${season} — duplicate player name, keeping first: "${p.playerName}"`,
      );
      continue;
    }
    seen.add(key);
    players.push(p);
  }

  return { players, accentColor };
}

// ─── Main parse entry point ───────────────────────────────────────────────────

/**
 * Parse an Astro team page HTML string into per-season player records.
 *
 * Algorithm:
 *   1. Extract all <astro-island> props in document order.
 *   2. Walk the list: when a roster island is found, look ahead for the next
 *      config island to determine its season year.
 *   3. Parse each roster island's player records.
 *   4. Skip islands with no unambiguous season assignment (log warning).
 *   5. Skip the all-time island (contains "seasons"/"seasonsList").
 *
 * The ?season= URL param is ignored by the server — this function extracts
 * all embedded seasons from a single HTML fetch.
 */
export function parseTeamPage(html: string, teamId: string): ParsedTeamPage {
  const warnings: string[] = [];
  const islands = extractIslands(html);

  const seasonPlayers = new Map<number, ParsedPlayer[]>();
  const seasonsFound:  number[] = [];
  let   accentColor:   string | null = null;

  for (let i = 0; i < islands.length; i++) {
    const props = islands[i];
    if (!isRosterIsland(props)) continue;

    // Find the season year from the next config island
    let season: number | null = null;
    for (let j = i + 1; j < islands.length && j <= i + 3; j++) {
      const candidate = extractConfigYear(islands[j]);
      if (candidate !== null) {
        season = candidate;
        break;
      }
    }

    if (season === null) {
      warnings.push(
        `[${teamId}] Roster island[${i}] — could not assign season from following islands, skipping`,
      );
      continue;
    }

    const { players, accentColor: islandColor } = parseRosterIsland(
      props, season, teamId, warnings,
    );

    if (!accentColor && islandColor) {
      accentColor = islandColor;
    }

    if (players.length === 0) {
      warnings.push(
        `[${teamId}] season=${season} — roster island[${i}] parsed 0 players`,
      );
    }

    seasonPlayers.set(season, players);
    seasonsFound.push(season);
  }

  return { accentColor, seasonPlayers, seasonsFound, warnings };
}

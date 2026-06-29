// Shared parsing utilities for USAU pages.
//
// Selectors verified against live HTML on 2026-05-19. When you update them,
// also update docs/selectors.md so the human-readable mirror stays in sync.

import { load, type CheerioAPI } from 'npm:cheerio@1.0.0';

export const BASE_URL = 'https://play.usaultimate.org';

export function parseHtml(html: string): CheerioAPI {
  return load(html);
}

// ============================================================
// SELECTORS — verified 2026-05-19
// ============================================================

export const SELECTORS = {
  // Tournament calendar — two tables stacked (upcoming + past).
  // Both share the same column layout.
  tournamentList: {
    // Combined selector hits rows in either table; we skip header rows
    // (which use <th>) by checking td.length > 0 at parse time.
    rows: '#CT_HP_Mid_1_gvCurrentUpcomingEvents tr, #CT_HP_Mid_1_gvPastEvents tr',
    name: 'td:nth-child(2) a',
    city: 'td:nth-child(3)',
    state: 'td:nth-child(4)',
    competitionGroups: 'td:nth-child(5) li',
    dates: 'td:nth-child(6)',
  },

  // Event schedule page — /events/{slug}/schedule/{Gender}/Club-{Gender}/
  // Pools are <h3> headings followed by global_table standings.
  // Bracket sections are <h3> + nested <h4> rounds + bracket_game divs.
  schedule: {
    h1: 'h1',
    poolHeading: 'h3',
    poolTable: 'table.global_table',
    bracketGame: 'div.bracket_game',
    bracketGameId: '.gameID_area a',
    bracketHomeTeam: '[data-type="game-team-home"] a',
    bracketHomeScore: '[data-type="game-score-home"]',
    bracketAwayTeam: '[data-type="game-team-away"] a',
    bracketAwayScore: '[data-type="game-score-away"]',
    bracketLocation: '.location',
    bracketStatus: '.game-status',
    bracketDate: '.date',
  },

  // Rankings page — /teams/events/team_rankings/?RankSet={code}
  rankings: {
    row: '#CT_Main_0_gvList tr',
    rank: 'td:nth-child(1)',
    teamLink: 'td:nth-child(2) a',
    rating: 'td:nth-child(3)',
    level: 'td:nth-child(4)',
    gender: 'td:nth-child(5)',
    division: 'td:nth-child(6)',
    region: 'td:nth-child(7)',
    conference: 'td:nth-child(8)',
    wins: 'td:nth-child(9)',
    losses: 'td:nth-child(10)',
  },

  // Team page — /teams/events/Eventteam/?EventTeamId={id}
  team: {
    divisionH2: 'h2',
    nameH4: 'h4',
    rosterRow: '#CT_Main_0_ucTeamDetails_gvList tr',
    goalsRow: '#CT_Right_1_gvListGoals tr',
    assistsRow: '#CT_Right_1_gvListAssists tr',
  },
};

// ============================================================
// URL builders
// ============================================================

export function eventUrl(slug: string): string {
  return `${BASE_URL}/events/${slug}/`;
}

/**
 * Schedule page for one gender division at an event.
 *
 * USAU uses two different path formats and they are NOT consistent across
 * event types:
 *   - Club events use hyphenated:    /schedule/Men/Club-Men/
 *   - College Champs uses unhyphenated:  /schedule/Men/CollegeMen/
 * Older College Regionals events have used the hyphenated form too. To
 * avoid guessing wrong, callers should try `eventScheduleUrlVariants()`
 * which returns both forms in order.
 *
 * @param gender capitalized division ("Men", "Women", "Mixed")
 * @param level  competition level ("Club", "College")
 */
export function eventScheduleUrl(
  slug: string,
  gender: 'Men' | 'Women' | 'Mixed',
  level: 'Club' | 'College' = 'Club',
): string {
  return `${BASE_URL}/events/${slug}/schedule/${gender}/${level}-${gender}/`;
}

/**
 * Both URL forms USAU uses for the schedule page, in the order to try.
 * The hyphenated form covers Club + older College events; the
 * unhyphenated form covers newer College championships (verified 2026).
 */
export function eventScheduleUrlVariants(
  slug: string,
  gender: 'Men' | 'Women' | 'Mixed',
  level: 'Club' | 'College' = 'Club',
): string[] {
  const hyphenated = `${BASE_URL}/events/${slug}/schedule/${gender}/${level}-${gender}/`;
  const compact = `${BASE_URL}/events/${slug}/schedule/${gender}/${level}${gender}/`;
  // For College: prefer compact since current championships use it.
  // For Club: prefer hyphenated.
  return level === 'College' ? [compact, hyphenated] : [hyphenated, compact];
}

export function teamUrlByEventTeamId(eventTeamId: string): string {
  return `${BASE_URL}/teams/events/Eventteam/?EventTeamId=${encodeURIComponent(eventTeamId)}`;
}

export function rankingsUrl(rankSet: string): string {
  return `${BASE_URL}/teams/events/team_rankings/?RankSet=${encodeURIComponent(rankSet)}`;
}

// ============================================================
// Extractors
// ============================================================

/** Parse "/events/2025-USAU-Pro-Championships/" → "2025-USAU-Pro-Championships". */
export function extractEventSlug(href: string): string | null {
  const m = href.match(/\/events\/([^/?#]+)/);
  return m ? m[1] : null;
}

/** Parse "?EventTeamId=ABC%3d&..." → "ABC=" (decoded). */
export function extractEventTeamId(href: string): string | null {
  const m = href.match(/EventTeamId=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Parse "?TeamId=ABC%3d&..." → "ABC=" (decoded). */
export function extractTeamId(href: string): string | null {
  const m = href.match(/TeamId=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Parse "?EventGameId=ABC%3d&..." → "ABC=" (decoded). */
export function extractEventGameId(href: string): string | null {
  const m = href.match(/EventGameId=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/** "Revolver (1)" → { name: "Revolver", seed: 1 }. */
export function extractTeamNameAndSeed(raw: string): { name: string; seed: number | null } {
  const trimmed = raw.trim();
  const m = trimmed.match(/^(.+?)\s*\((\d+)\)\s*$/);
  if (m) return { name: m[1].trim(), seed: parseInt(m[2], 10) };
  return { name: trimmed, seed: null };
}

/** Parse "May 22, 2026 - May 25, 2026" → ["2026-05-22", "2026-05-25"]. */
export function parseDateRange(s: string): { start: string | null; end: string | null } {
  const trimmed = s.trim();
  if (!trimmed) return { start: null, end: null };
  const parts = trimmed.split(/\s*[-–]\s*/);
  const start = parseDate(parts[0]);
  const end = parts[1] ? parseDate(parts[1]) : start;
  return { start, end };
}

function parseDate(s: string): string | null {
  const trimmed = s.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

// ============================================================
// Sanity check — protect existing data from selector drift
// ============================================================

export function assertNonEmpty<T>(rows: T[], minExpected = 1, context = '') {
  if (rows.length < minExpected) {
    throw new Error(
      `Parser returned ${rows.length} rows (expected >= ${minExpected}). ` +
        `Selectors likely drifted. Context: ${context}`,
    );
  }
}

// ============================================================
// Competition-group classification
// ============================================================

/** Classify a competition-group label (e.g. "Club - Men", "College - Women",
 *  "High School Boys", "Masters - Mixed") into our enum buckets. */
export function classifyCompetitionGroup(label: string): {
  competition_level:
    | 'CLUB'
    | 'COLLEGE_D1'
    | 'COLLEGE_D3'
    | 'HS'
    | 'MS'
    | 'YC'
    | 'MASTERS'
    | 'GRAND_MASTERS'
    | 'BEACH'
    | 'OTHER';
  gender_division: 'Men' | 'Women' | 'Mixed' | 'Open' | null;
} {
  const t = label.toLowerCase();
  let gender: 'Men' | 'Women' | 'Mixed' | 'Open' | null = null;
  if (/\bmixed\b/.test(t)) gender = 'Mixed';
  else if (/\b(women|girls)\b/.test(t)) gender = 'Women';
  else if (/\b(men|boys|open)\b/.test(t)) gender = 'Men';

  // Order matters: more specific labels first. "Beach Masters - Men" must
  // resolve as BEACH (the venue/format is the dominant filter), and
  // "High School - Boys D-III" must resolve as HS (not COLLEGE_D3).
  let level: ReturnType<typeof classifyCompetitionGroup>['competition_level'] = 'OTHER';
  if (t.includes('beach')) level = 'BEACH';
  else if (t.includes('high school')) level = 'HS';
  else if (t.includes('middle school')) level = 'MS';
  else if (t.includes('youth club')) level = 'YC';
  else if (t.includes('grand master')) level = 'GRAND_MASTERS';
  else if (t.includes('master')) level = 'MASTERS';
  else if (t.includes('college') || /\bd-i\b/.test(t) || /\bd-iii\b/.test(t)) {
    level = /\bd-iii\b/.test(t) || /\bd3\b/.test(t) ? 'COLLEGE_D3' : 'COLLEGE_D1';
  } else if (t.includes('club')) level = 'CLUB';

  return { competition_level: level, gender_division: gender };
}

// ============================================================
// Flagship-event template classification
// ============================================================

/**
 * A keyword classifier rule, as stored in usau_event_templates.match_rules.
 *
 * Semantics:
 *  - keywords: ALL must appear in the normalized event text (AND).
 *  - anyKeywords: at least ONE must appear (OR). Optional.
 *  - excludeKeywords: NONE may appear (NOR). Optional.
 *  - monthMin/monthMax: event start_date month must fall within inclusive range.
 *    Optional. If event has no start_date, the month check is skipped.
 *
 * Matching uses word-boundary regex (so "d-i" doesn't match "d-iii", and
 * "mid-atlantic" matches both "mid-atlantic" and "mid atlantic"). All input
 * (event name and rule keywords) is normalized: lowercased, hyphens/apostrophes/
 * underscores collapsed to spaces, double quotes (CMS export quirks) collapsed
 * to spaces, runs of whitespace collapsed to single space.
 */
export interface TemplateMatchRules {
  keywords?: string[];
  anyKeywords?: string[];
  excludeKeywords?: string[];
  monthMin?: number;
  monthMax?: number;
}

export interface EventTemplate {
  key: string;
  display_name: string;
  competition_level: string | null;
  match_rules: TemplateMatchRules | null;
  is_flagship?: boolean;
}

/** Normalize a string for keyword matching:
 *  - lowercase
 *  - collapse `-`, `'`, `"`, `_` to spaces
 *  - collapse whitespace to single space
 *  - trim
 */
export function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/['"_\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Escape a string for use inside a RegExp. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Test whether `phrase` appears in `text` at word boundaries.
 *  `text` and `phrase` must both already be normalized.
 *  Allows an optional trailing `s` on the last word of the phrase so
 *  "national" matches both "national" and "nationals", "championship"
 *  matches "championships", "regional" matches "regionals", etc. USAU
 *  event names mix singular and plural for the same flagship family. */
function containsPhrase(text: string, phrase: string): boolean {
  const normalized = normalizeForMatch(phrase);
  if (!normalized) return false;
  // Append `s?` at the very end so plurals match. We only apply this to the
  // tail of the phrase — earlier tokens stay exact to avoid surprise matches.
  const re = new RegExp(`\\b${escapeRegex(normalized)}s?\\b`);
  return re.test(text);
}

/** Returns true if every rule predicate is satisfied. */
function ruleMatches(
  rule: TemplateMatchRules,
  normalizedText: string,
  startMonth: number | null,
): boolean {
  if (rule.monthMin != null && rule.monthMax != null && startMonth != null) {
    if (startMonth < rule.monthMin || startMonth > rule.monthMax) return false;
  }
  if (rule.keywords && rule.keywords.length > 0) {
    for (const kw of rule.keywords) {
      if (!containsPhrase(normalizedText, kw)) return false;
    }
  }
  if (rule.anyKeywords && rule.anyKeywords.length > 0) {
    const anyHit = rule.anyKeywords.some((kw) => containsPhrase(normalizedText, kw));
    if (!anyHit) return false;
  }
  if (rule.excludeKeywords && rule.excludeKeywords.length > 0) {
    for (const kw of rule.excludeKeywords) {
      if (containsPhrase(normalizedText, kw)) return false;
    }
  }
  return true;
}

/**
 * Classify an event against a list of templates. Returns the first matching
 * template's key, or null if no template matches. Templates are evaluated in
 * the order provided — put more-specific rules first if order matters.
 *
 * Matches against the union of (event name + slug, normalized) so quirks like
 * "Women's" vs "women-s" vs "womens" all line up.
 */
export function classifyEventTemplate(
  event: { name?: string | null; usau_slug?: string | null; start_date?: string | null },
  templates: EventTemplate[],
): string | null {
  const parts: string[] = [];
  if (event.name) parts.push(event.name);
  if (event.usau_slug) parts.push(event.usau_slug);
  if (parts.length === 0) return null;
  const text = normalizeForMatch(parts.join(' '));

  let startMonth: number | null = null;
  if (event.start_date) {
    const m = event.start_date.match(/^\d{4}-(\d{2})-/);
    if (m) startMonth = parseInt(m[1], 10);
  }

  for (const tmpl of templates) {
    if (!tmpl.match_rules) continue;
    if (ruleMatches(tmpl.match_rules, text, startMonth)) return tmpl.key;
  }
  return null;
}


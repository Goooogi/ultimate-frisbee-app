// sync-event-details: scrape one event's schedule page and upsert teams,
// per-event participation, and games.
//
// Request body: { slug: string, divisions?: ('Men' | 'Mixed' | 'Women')[] }
// Defaults to all three divisions — sync-event-details quietly skips
// divisions that aren't part of the event (404 on the schedule page).
//
// Per division:
//   1. Fetch /events/{slug}/schedule/{Gender}/Club-{Gender}/. 404 → skip.
//   2. Parse pool standings + bracket games via verified selectors.
//   3. Resolve each EventTeamId to a usau_teams row (creating one if new).
//   4. Upsert usau_event_teams (per-event participation with seed/pool).
//   5. Upsert usau_games keyed on usau_game_id when present.
//
// If the parent event doesn't exist in usau_events yet, we create a stub
// row so test events (e.g. 2025-USAU-Pro-Championships) can be scraped
// directly without first running sync-events.

import { fetchHtml } from '../_shared/http.ts';
import {
  BASE_URL,
  parseHtml,
  SELECTORS,
  eventScheduleUrlVariants,
  extractEventGameId,
  extractEventTeamId,
  extractTeamNameAndSeed,
} from '../_shared/parse.ts';
import { supabase, withRunLogging } from '../_shared/supabase.ts';
import { tzForState, localWallTimeToUtcIso, dateOnlyIso } from '../_shared/tz.ts';

function stringifyErr(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object') {
    const obj = err as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof obj.message === 'string') parts.push(obj.message);
    if (typeof obj.code === 'string') parts.push(`(${obj.code})`);
    if (typeof obj.details === 'string') parts.push(`— ${obj.details}`);
    return parts.length > 0 ? parts.join(' ') : JSON.stringify(err);
  }
  return String(err);
}

// Render any error shape to a useful string. Supabase PostgrestError objects
// don't inherit Error — they're plain objects with .message/.code/.details.
function formatErr(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object') {
    const obj = err as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof obj.message === 'string') parts.push(obj.message);
    if (typeof obj.code === 'string') parts.push(`(${obj.code})`);
    if (typeof obj.details === 'string') parts.push(`— ${obj.details}`);
    if (typeof obj.hint === 'string') parts.push(`hint: ${obj.hint}`);
    if (parts.length > 0) return parts.join(' ');
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

type Division = 'Men' | 'Mixed' | 'Women';
type GameRound = 'pool' | 'prequarter' | 'quarter' | 'semi' | 'final' | 'placement' | 'consolation' | 'other';
type GameStatus = 'scheduled' | 'in_progress' | 'final' | 'forfeit' | 'cancelled';

interface ParsedTeam {
  eventTeamId: string;
  displayName: string;
  seed: number | null;
}

interface ParsedPoolRow {
  poolName: string;
  eventTeamId: string;
  wins: number | null;
  losses: number | null;
}

interface ParsedGame {
  usau_game_id: string | null;
  usau_event_game_id: string | null;
  round: GameRound;
  bracket_name: string | null;
  /** null = TBD slot (bracket game whose feeder hasn't finished — "W of
   *  Semifinals G2"). Only bracket games may carry null sides; pool rows
   *  always have both teams. */
  home_event_team_id: string | null;
  away_event_team_id: string | null;
  home_seed: number | null;
  away_seed: number | null;
  score_home: number | null;
  score_away: number | null;
  location: string | null;
  scheduled_at: string | null;
  status: GameStatus;
}

// ────────────────────────────────────────────────────────────
// Round + status mapping
// ────────────────────────────────────────────────────────────

function classifyRound(h4Label: string | null, h3Label: string | null): GameRound {
  // USAU's actual bracket labels (verified 2026 — Colorado Summer Solstice):
  //   h3 (bracket section): "Championship Bracket", "3rd Place", "5th Place",
  //                         "7th Place", "9th Place", "Consolation"
  //   h4 (round):           "1st Place", "1st Semis", "1st Quarters",
  //                         "Pre-Quarters", "3rd", "5th", "5th semis", "9th semis"
  // The gold-medal game is labeled "1st Place" (NOT "Final"), and placement
  // finals are bare ordinals ("3rd", "5th"). The old classifier looked for the
  // word "final"/"third place" and mis-tagged all of these as 'other'.
  const h3 = (h3Label ?? '').toLowerCase().trim();
  const h4 = (h4Label ?? '').toLowerCase().trim();
  const t = `${h3} ${h4}`;

  // Order matters. Check the most specific round words first.
  // Pre-quarters BEFORE quarters ("pre-quarters" contains "quarter").
  if (t.includes('prequarter') || t.includes('pre-quarter') || t.includes('pre quarter')) {
    return 'prequarter';
  }
  if (t.includes('semi')) return 'semi';
  if (t.includes('quarter')) return 'quarter';
  if (t.includes('consolation')) return 'consolation';

  // The championship gold-medal game: h4 "1st place" / "final" inside the
  // Championship bracket (and not a semi/quarter, already handled above).
  const isChampSection = h3.includes('championship') || h3.includes('1st place') || h3 === '';
  if (isChampSection && (h4.includes('1st place') || h4.includes('final') || h4 === '1st')) {
    return 'final';
  }

  // Placement finals: any "Nth Place" section, or a bare ordinal h4 round
  // ("3rd", "5th", "7th", "9th", "11th", …). These are the placement bracket's
  // deciding game. USAU also spells ordinals out ("Third Place", "Seventh
  // Place" — seen at PEC West 2026), so match word ordinals too.
  if (
    /\b\d+(st|nd|rd|th)\s+place\b/.test(t) ||  // "3rd place", "13th place"
    /\b(second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fifteenth|seventeenth)\s+place\b/.test(t) ||
    /placement/.test(t) ||
    /^\d+(st|nd|rd|th)$/.test(h4)              // bare "3rd", "5th", "9th"
  ) {
    return 'placement';
  }

  // Any other "final"-ish label not caught above.
  if (t.includes('final')) return 'final';

  return 'other';
}

function classifyStatus(raw: string | null): GameStatus {
  if (!raw) return 'scheduled';
  const t = raw.toLowerCase().trim();
  if (t.includes('final')) return 'final';
  if (t.includes('forfeit')) return 'forfeit';
  if (t.includes('cancel')) return 'cancelled';
  if (t.includes('progress') || t.includes('live')) return 'in_progress';
  return 'scheduled';
}

function parseScore(s: string | null): number | null {
  if (!s) return null;
  const m = s.trim().match(/^(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

// ── Timezone handling ────────────────────────────────────────────────────────
// USAU prints all schedule times in the VENUE'S LOCAL zone, with no offset on
// the page. The runtime is UTC, so naively parsing "9:00 AM" yields 09:00Z =
// 3 AM local — wrong by the offset. We derive the venue zone from the event's
// US state and convert the local wall-clock time to the correct UTC instant
// (DST-aware via Intl — see _shared/tz.ts, shared with ingest-from-ultirzr).
// When the state/zone is unknown we DROP the time and keep date-only
// (midnight UTC) rather than store a wrong instant.

/**
 * Parse a bracket `.date` cell ("6/14/2026 9:00 AM" — local venue time) into a
 * correct UTC ISO using the event timezone. Falls back to date-only when the
 * time or zone is missing/unknown so we never store a wrong instant.
 */
function parseSchedDate(s: string | null, tz: string | null): string | null {
  if (!s) return null;
  const t = s.trim();
  // "M/D/YYYY h:mm AM" (time optional)
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})\s*(AM|PM))?$/i);
  if (!m) {
    // Unknown format — let JS try, but only keep the date (drop time-of-day).
    const d = new Date(t);
    if (isNaN(d.getTime())) return null;
    return dateOnlyIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const month = parseInt(m[1], 10);
  const day = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  if (!m[4] || !tz) return dateOnlyIso(year, month, day);
  let h = parseInt(m[4], 10);
  const min = parseInt(m[5], 10);
  const ampm = m[6].toUpperCase();
  if (ampm === 'PM' && h < 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return localWallTimeToUtcIso(year, month, day, h, min, tz) ?? dateOnlyIso(year, month, day);
}

/**
 * Pool game schedule cells: date like "Fri 5/22" (no year) + time "8:30 AM"
 * in the venue's local zone. Converts to a correct UTC instant via `tz`; falls
 * back to date-only when time/zone is missing. Year is the current year (rare
 * year-boundary events are an accepted v1 limitation).
 */
function combineDateTimeMaybe(dateText: string, timeText: string, tz: string | null): string | null {
  if (!dateText) return null;
  const md = dateText.match(/(\d{1,2})\/(\d{1,2})/);
  if (!md) return null;
  const month = parseInt(md[1], 10);
  const day = parseInt(md[2], 10);
  const year = new Date().getUTCFullYear();
  const mt = timeText ? timeText.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i) : null;
  if (!mt || !tz) return dateOnlyIso(year, month, day);
  let h = parseInt(mt[1], 10);
  const min = parseInt(mt[2], 10);
  const ampm = mt[3].toUpperCase();
  if (ampm === 'PM' && h < 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return localWallTimeToUtcIso(year, month, day, h, min, tz) ?? dateOnlyIso(year, month, day);
}

// ────────────────────────────────────────────────────────────
// Schedule page parser
// ────────────────────────────────────────────────────────────

interface ScheduleParse {
  teams: ParsedTeam[];
  poolPlacements: ParsedPoolRow[];
  games: ParsedGame[];
}

function parseSchedule(html: string, tz: string | null): ScheduleParse {
  const $ = parseHtml(html);
  const teamsByEventTeamId = new Map<string, ParsedTeam>();
  const poolPlacements: ParsedPoolRow[] = [];
  const games: ParsedGame[] = [];

  // Track the latest h3 (bracket section) and h4 (round) seen as we walk
  // the document in order. Bracket games inherit whichever heading was
  // most recently emitted before them.
  let currentH3: string | null = null;
  let currentH4: string | null = null;

  // The schedule page mixes pool tables and brackets. Walk the document
  // in document order so we associate each piece with its heading.
  $('h1, h3, h4, table.global_table, div.bracket_game').each((_, el) => {
    const $el = $(el);
    const tag = el.type === 'tag' ? (el as { name: string }).name : '';

    if (tag === 'h3') {
      currentH3 = $el.text().trim();
      currentH4 = null;
      return;
    }
    if (tag === 'h4') {
      currentH4 = $el.text().trim();
      return;
    }

    if (tag === 'table') {
      // The schedule page has two table shapes:
      //
      //   1. Pool standings — class="global_table", under an <h3>Pool X</h3>.
      //      3 cols: team link, W-L, tiebreak.
      //   2. Pool games — class="global_table scores_table", with the pool
      //      name in a <thead><tr><th colspan="8">Pool A Schedule & Scores</th>
      //      (no separate <h3>). 8 cols: Date, Time, Field, Team 1, Team 2,
      //      Score, Status, Options.
      //
      // Discriminate by class. Standings tables come after a Pool X <h3>,
      // schedule tables carry their pool name in the table thead.
      const classAttr = ($el.attr('class') ?? '').toLowerCase();
      const isScheduleTable = classAttr.includes('scores_table');

      if (!isScheduleTable) {
        if (!currentH3 || !/^pool\b/i.test(currentH3)) return;
        const poolName = currentH3.trim();
        // === Standings table (existing logic) ===
        $el.find('tr').each((__, tr) => {
          const $tr = $(tr);
          const $cells = $tr.children('td');
          if ($cells.length === 0) return; // header row
          const $teamLink = $cells.eq(0).find('a').first();
          const href = $teamLink.attr('href') ?? '';
          const eventTeamId = extractEventTeamId(href);
          if (!eventTeamId) return;

          const { name, seed } = extractTeamNameAndSeed($teamLink.text());
          if (!teamsByEventTeamId.has(eventTeamId)) {
            teamsByEventTeamId.set(eventTeamId, { eventTeamId, displayName: name, seed });
          }

          // W-L cell formatted "3 - 0"
          const wlText = $cells.eq(1).text().trim();
          const wlMatch = wlText.match(/^(\d+)\s*[-–]\s*(\d+)$/);
          poolPlacements.push({
            poolName,
            eventTeamId,
            wins: wlMatch ? parseInt(wlMatch[1], 10) : null,
            losses: wlMatch ? parseInt(wlMatch[2], 10) : null,
          });
        });
      } else {
        // === Pool games table ===
        // Structure (verified 2026-05-25 against D-I Championships):
        //   <table class="global_table scores_table">
        //     <thead><tr><th colspan="8">Pool A Schedule & Scores</th></tr></thead>
        //     <tbody>
        //       <tr> ...column headers (Date/Time/Field/Team 1/Team 2/Score/Status/Options)...
        //       <tr data-game="404957"> ...8 td cells per game row...
        //     </tbody>
        //   </table>
        //
        // Pool name comes from the thead colspan caption, NOT from a
        // preceding <h3> (all schedule tables sit after the last pool
        // standings heading on this page).
        const captionText = $el.find('thead th[colspan]').first().text().trim();
        const captionMatch = captionText.match(/^(Pool\s+\S+)/i);
        const poolName = captionMatch ? captionMatch[1].trim() : null;
        if (!poolName) return; // unrecognized table shape

        $el.find('tbody tr').each((__, tr) => {
          const $tr = $(tr);
          const $cells = $tr.children('td');
          if ($cells.length < 7) return; // column header row (uses <th>) or malformed

          const dateText = $cells.eq(0).text().trim();
          const timeText = $cells.eq(1).text().trim();
          const fieldText = $cells.eq(2).text().trim();

          const $homeLink = $cells.eq(3).find('a').first();
          const $awayLink = $cells.eq(4).find('a').first();
          const homeEventTeamId = extractEventTeamId($homeLink.attr('href') ?? '');
          const awayEventTeamId = extractEventTeamId($awayLink.attr('href') ?? '');
          if (!homeEventTeamId || !awayEventTeamId) return; // TBD slot

          const home = extractTeamNameAndSeed($homeLink.text());
          const away = extractTeamNameAndSeed($awayLink.text());

          // Collect teams (don't overwrite existing entries since the
          // standings table is parsed first with the same data).
          if (!teamsByEventTeamId.has(homeEventTeamId)) {
            teamsByEventTeamId.set(homeEventTeamId, {
              eventTeamId: homeEventTeamId,
              displayName: home.name,
              seed: home.seed,
            });
          }
          if (!teamsByEventTeamId.has(awayEventTeamId)) {
            teamsByEventTeamId.set(awayEventTeamId, {
              eventTeamId: awayEventTeamId,
              displayName: away.name,
              seed: away.seed,
            });
          }

          // Score: "15 - 11" → 15, 11. Empty/blank when not yet played.
          const scoreText = $cells.eq(5).text().trim();
          const scoreMatch = scoreText.match(/^(\d+)\s*[-–]\s*(\d+)$/);
          const scoreHome = scoreMatch ? parseInt(scoreMatch[1], 10) : null;
          const scoreAway = scoreMatch ? parseInt(scoreMatch[2], 10) : null;

          const rawStatus = $cells.eq(6).text().trim() || null;

          // Prefer the data-game attribute on the row (numeric internal
          // game id). Fall back to parsing the match-report link's
          // EventGameId param in the Options cell.
          const dataGame = $tr.attr('data-game')?.trim() ?? '';
          const $matchLink = $cells.find('a[href*="match_report"]').first();
          const usau_event_game_id =
            dataGame ||
            extractEventGameId($matchLink.attr('href') ?? '');

          const scheduled_at = combineDateTimeMaybe(dateText, timeText, tz);

          games.push({
            usau_game_id: null,
            usau_event_game_id,
            round: 'pool',
            bracket_name: poolName,
            home_event_team_id: homeEventTeamId,
            away_event_team_id: awayEventTeamId,
            home_seed: home.seed,
            away_seed: away.seed,
            score_home: scoreHome,
            score_away: scoreAway,
            location: fieldText || null,
            scheduled_at,
            status: classifyStatus(rawStatus),
          });
        });
      }
      return;
    }

    if (tag === 'div') {
      // bracket_game
      const $game = $el;
      const id = $game.attr('id') ?? '';
      const usau_game_id = id.startsWith('game') ? id.slice(4) : id || null;

      const $matchLink = $game.find(SELECTORS.schedule.bracketGameId).first();
      const usau_event_game_id = extractEventGameId($matchLink.attr('href') ?? '');

      const $homeA = $game.find(SELECTORS.schedule.bracketHomeTeam).first();
      const $awayA = $game.find(SELECTORS.schedule.bracketAwayTeam).first();
      const homeEventTeamId = extractEventTeamId($homeA.attr('href') ?? '');
      const awayEventTeamId = extractEventTeamId($awayA.attr('href') ?? '');
      // TBD slots ("W of Semifinals G2") have no team link. Keep the game
      // anyway when it has a stable id — dropping it made finals/placement
      // finals invisible until both feeders finished, and an event that
      // stopped being re-scraped (outside the live window) lost its final
      // forever. A TBD side is stored as a null team id; the next scrape
      // after the feeder finishes fills it in via the same usau_game_id
      // upsert. Games with NO id and any TBD side are still skipped — we
      // have no safe dedupe key for those.
      if ((!homeEventTeamId || !awayEventTeamId) && !usau_game_id) return;

      const home = extractTeamNameAndSeed($homeA.text());
      const away = extractTeamNameAndSeed($awayA.text());
      if (homeEventTeamId && !teamsByEventTeamId.has(homeEventTeamId)) {
        teamsByEventTeamId.set(homeEventTeamId, {
          eventTeamId: homeEventTeamId,
          displayName: home.name,
          seed: home.seed,
        });
      }
      if (awayEventTeamId && !teamsByEventTeamId.has(awayEventTeamId)) {
        teamsByEventTeamId.set(awayEventTeamId, {
          eventTeamId: awayEventTeamId,
          displayName: away.name,
          seed: away.seed,
        });
      }

      const scoreHome = parseScore($game.find(SELECTORS.schedule.bracketHomeScore).first().text());
      const scoreAway = parseScore($game.find(SELECTORS.schedule.bracketAwayScore).first().text());
      const location = $game.find(SELECTORS.schedule.bracketLocation).first().text().trim() || null;
      const rawStatus = $game.find(SELECTORS.schedule.bracketStatus).first().text().trim() || null;
      const rawDate = $game.find(SELECTORS.schedule.bracketDate).first().text().trim() || null;

      games.push({
        usau_game_id,
        usau_event_game_id,
        round: classifyRound(currentH4, currentH3),
        bracket_name: currentH3,
        home_event_team_id: homeEventTeamId,
        away_event_team_id: awayEventTeamId,
        home_seed: home.seed,
        away_seed: away.seed,
        score_home: scoreHome,
        score_away: scoreAway,
        location,
        scheduled_at: parseSchedDate(rawDate, tz),
        status: classifyStatus(rawStatus),
      });
    }
  });

  return {
    teams: Array.from(teamsByEventTeamId.values()),
    poolPlacements,
    games,
  };
}

// ────────────────────────────────────────────────────────────
// Upserts
// ────────────────────────────────────────────────────────────

/**
 * Look up or create a usau_teams row for an EventTeamId. The team's
 * usau_event_team_ids array accumulates every per-event ID we've ever
 * seen so the same physical squad at multiple events maps to one row.
 *
 * For v1 we treat each EventTeamId as its own loose identity unless we
 * have other reason to merge (e.g. a future sync-team-details that finds
 * the persistent TeamId). That means "Revolver" at 2024 Pro Champs and
 * "Revolver" at 2025 Pro Champs will be two rows for now.
 */
async function resolveTeam(
  db: ReturnType<typeof supabase>,
  team: ParsedTeam,
  competitionLevel: 'CLUB' | 'COLLEGE_D1' | 'COLLEGE_D3',
  genderDivision: Division,
): Promise<string> {
  // Has any team row already claimed this EventTeamId?
  const { data: existing, error: lookupErr } = await db
    .from('usau_teams')
    .select('id')
    .contains('usau_event_team_ids', [team.eventTeamId])
    .maybeSingle();
  if (lookupErr && lookupErr.code !== 'PGRST116') throw lookupErr;
  if (existing) return existing.id;

  const { data: created, error: insertErr } = await db
    .from('usau_teams')
    .insert({
      name: team.displayName,
      usau_event_team_ids: [team.eventTeamId],
      competition_level: competitionLevel,
      gender_division: genderDivision,
      last_scraped_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (insertErr) throw insertErr;
  return created.id;
}

async function ensureEvent(
  db: ReturnType<typeof supabase>,
  slug: string,
): Promise<string> {
  const { data: existing } = await db
    .from('usau_events')
    .select('id')
    .eq('usau_slug', slug)
    .maybeSingle();
  if (existing) return existing.id;

  // Stub the event row from the slug. We don't know dates/city/etc. yet —
  // sync-events will fill those in later if the event ever appears on the
  // tournament calendar. Season defaults to the year embedded in the slug.
  const yearMatch = slug.match(/^(\d{4})-/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : new Date().getUTCFullYear();

  // Make sure the season row exists (FK target).
  await db.from('usau_seasons').upsert({ year }, { onConflict: 'year', ignoreDuplicates: true });

  const { data: created, error } = await db
    .from('usau_events')
    .insert({
      usau_slug: slug,
      name: slug.replace(/-/g, ' '),
      season: year,
      url: `${BASE_URL}/events/${slug}/`,
      last_scraped_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error) throw error;
  return created.id;
}

// ────────────────────────────────────────────────────────────
// Per-division sync
// ────────────────────────────────────────────────────────────

async function syncDivision(
  db: ReturnType<typeof supabase>,
  eventUUID: string,
  slug: string,
  division: Division,
  competitionLevel: 'CLUB' | 'COLLEGE_D1' | 'COLLEGE_D3',
  tz: string | null,
): Promise<{
  teams: number;
  games: number;
  skipped: boolean;
}> {
  // USAU's URL uses "Club" or "College" in the path, and the College
  // championship pages use a compact "CollegeMen" form (no hyphen) while
  // older events use "College-Men". Try both variants.
  const urlLevel: 'Club' | 'College' = competitionLevel === 'CLUB' ? 'Club' : 'College';
  let html: string | null = null;
  let url = '';
  for (const candidate of eventScheduleUrlVariants(slug, division, urlLevel)) {
    try {
      html = await fetchHtml(candidate);
      url = candidate;
      break;
    } catch (err) {
      const message = formatErr(err);
      if (/HTTP 404/.test(message) || /404 /.test(message)) {
        continue;
      }
      throw err;
    }
  }
  if (!html) {
    // Both variants 404'd — this division isn't part of the event.
    return { teams: 0, games: 0, skipped: true };
  }

  const { teams, poolPlacements, games } = parseSchedule(html, tz);
  if (teams.length === 0) {
    // Page exists but has no parseable teams — could mean draft schedule,
    // selector drift, or genuinely empty. Don't write anything; let the
    // caller see the zero count.
    return { teams: 0, games: 0, skipped: true };
  }

  // Resolve every EventTeamId to a usau_teams uuid.
  const teamUUIDByEventTeamId = new Map<string, string>();
  for (const t of teams) {
    try {
      const id = await resolveTeam(db, t, competitionLevel, division);
      teamUUIDByEventTeamId.set(t.eventTeamId, id);
    } catch (err) {
      throw new Error(`resolveTeam failed for ${t.displayName}: ${stringifyErr(err)}`);
    }
  }

  // Per-event participation. Aggregate seed from teams[] + pool from
  // poolPlacements so each team gets one row even if the seed and pool
  // info come from different sources.
  const seedByTeam = new Map<string, number | null>();
  for (const t of teams) seedByTeam.set(t.eventTeamId, t.seed);
  const poolByTeam = new Map<string, string>();
  for (const p of poolPlacements) {
    if (!poolByTeam.has(p.eventTeamId)) poolByTeam.set(p.eventTeamId, p.poolName);
  }

  const eventTeamRows = teams.map((t) => ({
    event_id: eventUUID,
    team_id: teamUUIDByEventTeamId.get(t.eventTeamId)!,
    usau_event_team_id: t.eventTeamId,
    seed: seedByTeam.get(t.eventTeamId) ?? null,
    pool: poolByTeam.get(t.eventTeamId) ?? null,
  }));

  // usau_event_teams has a composite PK (event_id, team_id). Use that
  // for ON CONFLICT — the `usau_event_team_id` column has a regular
  // (non-unique) index so it can't be used as a conflict target.
  const { error: etErr } = await db
    .from('usau_event_teams')
    .upsert(eventTeamRows, { onConflict: 'event_id,team_id', ignoreDuplicates: false });
  if (etErr) throw new Error(`usau_event_teams upsert: ${stringifyErr(etErr)}`);

  // Games. We pick the upsert key based on whether usau_game_id is present.
  // When present, key on it (idempotent re-runs). When absent (rare for
  // bracket games, possible for unscheduled placement matches), fall back
  // to natural-key matching via a manual look-then-insert.
  const gamesWithIds = games.filter((g) => g.usau_game_id);
  const gamesWithoutIds = games.filter((g) => !g.usau_game_id);

  if (gamesWithIds.length > 0) {
    const rows = gamesWithIds.map((g) => ({
      event_id: eventUUID,
      usau_game_id: g.usau_game_id,
      usau_event_game_id: g.usau_event_game_id,
      round: g.round,
      bracket_name: g.bracket_name,
      // TBD bracket slots carry null team ids until the feeder game
      // finishes; the id-keyed upsert fills them in on a later pass.
      team_a_id: (g.home_event_team_id && teamUUIDByEventTeamId.get(g.home_event_team_id)) || null,
      team_b_id: (g.away_event_team_id && teamUUIDByEventTeamId.get(g.away_event_team_id)) || null,
      seed_a: g.home_seed,
      seed_b: g.away_seed,
      score_a: g.score_home,
      score_b: g.score_away,
      location: g.location,
      scheduled_at: g.scheduled_at,
      status: g.status,
      source_url: url,
    }));
    const { error: gErr } = await db
      .from('usau_games')
      .upsert(rows, { onConflict: 'usau_game_id', ignoreDuplicates: false });
    if (gErr) throw new Error(`usau_games upsert: ${stringifyErr(gErr)}`);
  }

  // Fallback path: insert one at a time, checking for duplicates first.
  // Pool games end up here (they don't expose usau_game_id on the
  // schedule table), as do atypical placement games.
  //
  // Dedupe preference:
  //   1. By usau_event_game_id when present — unique per match report.
  //      Safer than the team-pair match for repeat matchups.
  //   2. Fall back to (event_id, round, team_a_id, team_b_id) when no
  //      EventGameId is on the source row.
  for (const g of gamesWithoutIds) {
    // parseSchedule never emits an id-less game with a TBD side (no safe
    // dedupe key), so both teams resolve here; the guard is belt-and-braces.
    if (!g.home_event_team_id || !g.away_event_team_id) continue;
    const teamA = teamUUIDByEventTeamId.get(g.home_event_team_id)!;
    const teamB = teamUUIDByEventTeamId.get(g.away_event_team_id)!;
    let existing: { id: string } | null = null;
    if (g.usau_event_game_id) {
      const { data } = await db
        .from('usau_games')
        .select('id')
        .eq('event_id', eventUUID)
        .eq('usau_event_game_id', g.usau_event_game_id)
        .maybeSingle();
      existing = data ?? null;
    }
    if (!existing) {
      const { data } = await db
        .from('usau_games')
        .select('id')
        .eq('event_id', eventUUID)
        .eq('round', g.round)
        .eq('team_a_id', teamA)
        .eq('team_b_id', teamB)
        .maybeSingle();
      existing = data ?? null;
    }
    const row = {
      event_id: eventUUID,
      usau_game_id: null,
      usau_event_game_id: g.usau_event_game_id,
      round: g.round,
      bracket_name: g.bracket_name,
      team_a_id: teamA,
      team_b_id: teamB,
      seed_a: g.home_seed,
      seed_b: g.away_seed,
      score_a: g.score_home,
      score_b: g.score_away,
      location: g.location,
      scheduled_at: g.scheduled_at,
      status: g.status,
      source_url: url,
    };
    if (existing) {
      await db.from('usau_games').update(row).eq('id', existing.id);
    } else {
      await db.from('usau_games').insert(row);
    }
  }

  return { teams: teams.length, games: games.length, skipped: false };
}

// ────────────────────────────────────────────────────────────
// Entry point
// ────────────────────────────────────────────────────────────

interface RequestBody {
  slug?: string;
  divisions?: Division[];
}

async function run(body: RequestBody) {
  const slug = body.slug?.trim();
  if (!slug) throw new Error('Request body must include { slug }');

  const divisions: Division[] = body.divisions?.length
    ? body.divisions
    : ['Men', 'Women', 'Mixed'];

  const db = supabase();
  const eventUUID = await ensureEvent(db, slug);

  // Look up the event's competition level so the schedule URL hits the
  // right USAU path (College vs Club). ensureEvent stubs new rows as CLUB
  // by default; College events should already exist via sync-events
  // (calendar discovery) with the right level, so this lookup picks that up.
  const { data: eventRow } = await db
    .from('usau_events')
    .select('competition_level, state')
    .eq('id', eventUUID)
    .maybeSingle();
  // Venue timezone (for converting USAU's local schedule times → UTC). Derived
  // from the event's US state; null when unknown ("TBD"/missing) → times are
  // stored date-only rather than at a wrong instant.
  const tz = tzForState(eventRow?.state as string | null | undefined);
  // College events (D-I AND D-III) use the "College" URL path; everything else
  // uses "Club". Previously only COLLEGE_D1 was recognized, so COLLEGE_D3 events
  // fell back to CLUB → built Club-Men schedule URLs → 404 → 0 rows scraped.
  const rawLevel = eventRow?.competition_level;
  const competitionLevel: 'CLUB' | 'COLLEGE_D1' | 'COLLEGE_D3' =
    rawLevel === 'COLLEGE_D1' || rawLevel === 'COLLEGE_D3' ? rawLevel : 'CLUB';

  const perDivision: Record<string, { teams: number; games: number; skipped: boolean }> = {};
  let totalTeams = 0;
  let totalGames = 0;

  for (const div of divisions) {
    perDivision[div] = await syncDivision(db, eventUUID, slug, div, competitionLevel, tz);
    totalTeams += perDivision[div].teams;
    totalGames += perDivision[div].games;
  }

  // Mark the event as freshly scraped.
  await db
    .from('usau_events')
    .update({
      last_scraped_at: new Date().toISOString(),
      last_scraped_status: 'ok',
    })
    .eq('id', eventUUID);

  return {
    rowsProcessed: totalTeams + totalGames,
    result: { slug, eventID: eventUUID, perDivision },
  };
}

Deno.serve(async (req) => {
  let body: RequestBody = {};
  try {
    if (req.headers.get('content-type')?.includes('application/json')) {
      body = await req.json();
    } else {
      const url = new URL(req.url);
      const qSlug = url.searchParams.get('slug');
      if (qSlug) body.slug = qSlug;
    }
  } catch {
    // empty body OK if slug is in query
  }

  try {
    const res = await withRunLogging('sync-event-details', { slug: body.slug ?? null }, () =>
      run(body),
    );
    return Response.json({ ok: true, ...res });
  } catch (err) {
    const message = formatErr(err);
    console.error('[sync-event-details] failed:', message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
});


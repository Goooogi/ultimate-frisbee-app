// USAU data layer (read-only, from Supabase).
//
// The scraper writes via service role; the app reads via anon. RLS on
// every usau_* table is "world-readable" so no auth is required to query.
//
// One client for both runtimes: we use @supabase/supabase-js (not @supabase/ssr)
// because USAU reads don't require auth cookies — the anon key + world-readable
// RLS is sufficient. That lets the same file power both Server Components
// (e.g. /usau/events/[slug]) and Client Components (e.g. the sidebar search)
// without dynamic imports or runtime branching.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { namesMatch, surnameForPrefilter } from '@/lib/name-match';
import { supabaseUrl, supabaseAnonKey } from '@/lib/supabase/env';
import { flightForName, FLIGHT_LABELS, type Flight } from '@/lib/usau/flights';
import { usauTeamLogo } from '@/lib/usau/team-logo';
import { statesForEventName } from '@/lib/usau/regions';

type DB = SupabaseClient<Database>;

let _client: DB | null = null;

async function supabase(): Promise<DB> {
  if (_client) return _client;
  _client = createClient<Database>(
    supabaseUrl(),
    supabaseAnonKey(),
    { auth: { persistSession: false } },
  );
  return _client;
}

// ─── Qualifying-event classifier (for player-identity clustering) ────────
//
// A "qualifying" event is one where a team's roster reliably reflects a real
// commitment — the official Series (Sectionals → Regionals → Nationals) plus
// the marquee invite tournaments where no one guests (TCT Pro Championships,
// U.S. Open). These are the events that let us conclude "two different teams,
// same season+track ⇒ two different people." Minor/fun tournaments are excluded
// because players guest on other teams there (not an identity signal).
//
// USAU exposes no structured event-type (event_type is uniformly 'other'), so
// we classify by name. Order/guards matter: "Championship"/"Nationals" appear
// in BOTH true Nationals ("USA Ultimate Club/College Championships") and invite
// events ("TCT Pro Championships", "U.S. Open Club Championships"), and warmups
// ("...at Nationals", "Nationals Tune Up") must not match.
export function isQualifyingSeriesEvent(rawName: string | null | undefined): boolean {
  if (!rawName) return false;
  const n = rawName.toLowerCase();

  // Warmups / non-competitive that happen to contain series words.
  if (/(tune up|tune-up|at nationals|warm ?up)/.test(n)) return false;

  // Official series stages by name.
  if (/sectional/.test(n)) return true;
  if (/regional/.test(n)) return true;
  if (/super qualifier/.test(n)) return true; // Masters/Grand-Masters series

  // Marquee invite tournaments where rosters are trustworthy (no guesting).
  if (/u\.?s\.? open/.test(n)) return true;
  if (/tct pro champ|pro championship|usau pro champ/.test(n)) return true;

  // True Nationals — anchored by "USA Ultimate", the College Championships
  // forms, or "Club Nationals". Guard against invite/HS/worlds/beach that also
  // carry "championship"/"nationals".
  const isNationalsName =
    /club nationals/.test(n) ||
    /club championship/.test(n) ||
    /college championship/.test(n) ||
    /usa ultimate national championship/.test(n) ||
    (/usa ultimate/.test(n) && /nationals/.test(n));
  const disqualified =
    /state championship/.test(n) ||
    /high school|\bhs\b/.test(n) ||
    /world|\(icc\)|- icc|\(ycc\)|wucc|wmucc|wjuc/.test(n) ||
    /beach/.test(n);
  if (isNationalsName && !disqualified) return true;

  return false;
}

// ─── Events ────────────────────────────────────────────────────────────

export interface UsauEventCard {
  id: string;
  slug: string;
  name: string;
  season: number;
  startDate: string | null; // ISO yyyy-mm-dd
  endDate: string | null;
  city: string | null;
  state: string | null;
  competitionLevel: string;
  /** Number of teams that participated, used as a "size" hint. */
  teamCount: number;
  /** Canonical USAU event page URL (e.g. play.usaultimate.org/events/{slug}). */
  url: string | null;
  /** Curated Triple Crown Tour flight, or null if unclassified. See flights.ts. */
  flight: Flight | null;
}

export type CompetitionLevel =
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

/** All scraped USAU events, newest first. */
export async function listEvents(opts?: {
  season?: number;
  competitionLevel?: CompetitionLevel;
  /** Filter to events that have at least one participating team in this
   *  gender division. USAU events themselves aren't tagged by gender —
   *  the division lives on the participating teams. We treat an event
   *  as "in the X division" if any of its teams.gender_division = X. */
  genderDivision?: 'Men' | 'Women' | 'Mixed';
  /** Filter to events curated into these Triple Crown Tour flights (see
   *  flights.ts). Flight is a hand-maintained code map, not a USAU-published
   *  tournament field. Empty/undefined ⇒ all flights (no filter). Multiple ⇒
   *  events matching ANY of them. */
  flights?: Flight[];
  limit?: number;
}): Promise<UsauEventCard[]> {
  const db = await supabase();
  let q = db
    .from('usau_events')
    .select('id, usau_slug, name, season, start_date, end_date, city, state, competition_level, url')
    .order('start_date', { ascending: false, nullsFirst: false })
    .order('name', { ascending: true });
  if (opts?.season != null) q = q.eq('season', opts.season);
  if (opts?.competitionLevel) q = q.eq('competition_level', opts.competitionLevel);
  if (opts?.limit) q = q.limit(opts.limit);
  const { data: events, error } = await q;
  if (error) throw error;

  // Pull team counts per event AND collect each event's gender divisions
  // (from the participating teams) so we can both report a count and
  // filter to the requested division. One query covers both.
  const ids = (events ?? []).map((e) => e.id);
  const countByEvent = new Map<string, number>();
  const divisionsByEvent = new Map<string, Set<string>>();
  if (ids.length > 0) {
    const { data: parts } = await db
      .from('usau_event_teams')
      .select('event_id, usau_teams(gender_division)')
      .in('event_id', ids);
    for (const r of (parts ?? []) as Array<{
      event_id: string;
      usau_teams: { gender_division: string | null } | null;
    }>) {
      countByEvent.set(r.event_id, (countByEvent.get(r.event_id) ?? 0) + 1);
      const div = r.usau_teams?.gender_division;
      if (div) {
        if (!divisionsByEvent.has(r.event_id)) divisionsByEvent.set(r.event_id, new Set());
        divisionsByEvent.get(r.event_id)!.add(div);
      }
    }
  }

  const flightSet = opts?.flights && opts.flights.length > 0 ? new Set(opts.flights) : null;
  const filtered = (events ?? []).filter((e) => {
    if (opts?.genderDivision) {
      const set = divisionsByEvent.get(e.id);
      if (!(set && set.has(opts.genderDivision))) return false;
    }
    if (flightSet) {
      const f = flightForName(e.name);
      if (!f || !flightSet.has(f)) return false;
    }
    return true;
  });

  return filtered.map((e) => ({
    id: e.id,
    slug: e.usau_slug,
    name: e.name,
    season: e.season,
    startDate: e.start_date,
    endDate: e.end_date,
    city: e.city,
    state: e.state,
    competitionLevel: e.competition_level,
    teamCount: countByEvent.get(e.id) ?? 0,
    url: e.url ?? null,
    flight: flightForName(e.name),
  }));
}

/**
 * Returns the most relevant tournament for "The Games" view.
 *
 * Ultimate runs on a weekly tournament cadence — events play Fri–Sun, then the
 * week is dead until the next weekend. So the headline follows the weekend, not
 * the literal "is anything live this second" question:
 *
 *   • Sun / Mon / Tue  → show LAST weekend's tournament (the just-finished one).
 *     Fans are still digesting results; the next event hasn't earned the spot.
 *   • Wed / Thu / Fri / Sat → show the UPCOMING weekend's tournament (preview).
 *     By Wednesday attention has shifted to who's playing this weekend.
 *
 * The cutover is Wednesday 00:00 in the server's local time.
 *
 * Within whichever side we pick, ties (multiple events the same weekend) break
 * by FLIGHT_RANK — the marquee flight (Pro Elite Challenge) headlines over a
 * co-scheduled local tournament. If the preferred side has no event, we fall
 * back to the other side, then to the most-recent event that actually has games
 * so the page is never empty.
 *
 * We consider any tournament-grade level (Club, College D-I/D-III,
 * Masters, Grand Masters) — these are the ones with real bracket data.
 * HS/MS/Beach are excluded so we don't surface a state HS tournament
 * over a major club event.
 *
 * Returns the slug only; callers fetch the full event via getEvent().
 * `hasGames` is false when the chosen event has NO games ingested yet — UI
 * can render a "happening soon, brackets pending" fallback. (Note: the final
 * fallback only ever returns events that DO have games.)
 */
const FLAGSHIP_LEVELS: CompetitionLevel[] = [
  'CLUB',
  'COLLEGE_D1',
  'COLLEGE_D3',
  'MASTERS',
  'GRAND_MASTERS',
];

// Headline importance — higher wins when several events share a weekend. This
// is a SUPERSET of the TCT flight tiers, because the true pinnacle events
// (Nationals, World Championships) sit ABOVE the regular-season flights but
// aren't "flights" in USAU's TCT taxonomy at all. Ordering (high → low):
//
//   PINNACLE (rank 10) — season/world championships, the top of the sport:
//     • Club Nationals / Club Championships
//     • World Club Championships (WUCC) and World Masters Club Champs (WMUCC)
//     • College Nationals (D-I/D-III Championships)
//   These outrank a same-weekend Pro Elite Challenge (Hunter: WMUCC is above
//   everything but Club Nationals / Club Worlds).
//
//   Then the TCT flights: triple-crown 5 > pro 4 > elite 3 > select 2 > classic 1.
//   Unclassified local tournaments → 0 (lose every tie).
const FLIGHT_RANK: Record<Flight, number> = {
  'triple-crown': 5,
  pro: 4,
  elite: 3,
  select: 2,
  classic: 1,
};

const PINNACLE_RANK = 10;

/** True for the sport's pinnacle championships — season Nationals + Worlds.
 *  Name-based (like flightForName) so it survives year-to-year slug drift.
 *  WMUCC/WUCC are World events USAU lists but does not classify as a flight. */
function isPinnacleEventName(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = name
    .toLowerCase()
    .replace(/[.,()\-/&]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // World championships (club, masters, junior) — WUCC / WMUCC / WJUC and the
  // spelled-out "world ... club championship" forms.
  if (/\bw[mj]?ucc\b/.test(n)) return true;
  if (n.includes('world') && n.includes('club') && n.includes('championship')) return true;
  if (n.includes('world masters') || n.includes('world ultimate club')) return true;
  // USA Ultimate season Nationals — Club + College. Guard out warmups/HS/state.
  const isNationals =
    n.includes('club nationals') ||
    n.includes('college championship') ||
    (n.includes('club championship') && !n.includes('open')) ||
    (n.includes('usa ultimate') && n.includes('nationals'));
  const disqualified =
    n.includes('at nationals') || n.includes('tune up') ||
    n.includes('high school') || n.includes('state championship');
  return isNationals && !disqualified;
}

/** Headline priority — higher = more prominent. Pinnacle events top the scale,
 *  then TCT flights, then unclassified (0). */
function flightRankForName(name: string | null | undefined): number {
  if (isPinnacleEventName(name)) return PINNACLE_RANK;
  const f = flightForName(name);
  return f ? FLIGHT_RANK[f] : 0;
}

export async function getCurrentEvent(opts?: {
  /** Filter to events whose participating teams include this division. */
  genderDivision?: 'Men' | 'Women' | 'Mixed';
  /** Restrict to ONE competition level (e.g. 'MASTERS'). Default: all flagship levels. */
  competitionLevel?: CompetitionLevel;
}): Promise<{ slug: string; hasGames: boolean } | null> {
  const db = await supabase();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  // The weekend rule only looks one weekend back or forward, so a tight window
  // is all we need — and it keeps the per-event count + division queries below
  // well clear of PostgREST's 1000-row response cap (a ±180d window spans 450+
  // events / 1300+ games, which silently truncates and drops events to "0
  // games"). The DB-wide fallback at the end of this function still covers any
  // gap when nothing falls inside the window.
  const windowBack = new Date(now.getTime() - 45 * 86400_000).toISOString().slice(0, 10);
  const windowForward = new Date(now.getTime() + 45 * 86400_000).toISOString().slice(0, 10);

  // One explicit level filters exactly; otherwise any flagship level headlines.
  const levelFilter = opts?.competitionLevel
    ? [opts.competitionLevel]
    : FLAGSHIP_LEVELS;

  const { data: windowEvents } = await db
    .from('usau_events')
    .select('id, usau_slug, name, start_date, end_date, competition_level')
    .in('competition_level', levelFilter)
    .gte('start_date', windowBack)
    .lte('start_date', windowForward)
    .order('start_date', { ascending: true });

  type EventRow = {
    id: string;
    usau_slug: string;
    name: string | null;
    start_date: string | null;
    end_date: string | null;
    competition_level: string | null;
  };
  let events: EventRow[] = (windowEvents ?? []) as EventRow[];

  // Per-event game counts + gender divisions of participating teams.
  const counts = new Map<string, number>();
  const divisionsByEvent = new Map<string, Set<string>>();
  if (events.length > 0) {
    const eventIds = events.map((e) => e.id);

    // Games count (for "has games" + ranking). PostgREST caps a single response
    // at 1000 rows, so we page through with .range() until a short page tells us
    // we're done — otherwise a busy window silently undercounts and events get
    // mis-flagged as having no games.
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data: page } = await db
        .from('usau_games')
        .select('event_id, id')
        .in('event_id', eventIds)
        .order('id', { ascending: true }) // stable order so paged ranges don't skip/overlap
        .range(from, from + PAGE - 1);
      const rows = page ?? [];
      for (const g of rows) {
        counts.set(g.event_id, (counts.get(g.event_id) ?? 0) + 1);
      }
      if (rows.length < PAGE) break;
    }

    // Participating divisions, for the optional filter. Team rows are far fewer
    // than games, but page defensively for the same cap reason.
    if (opts?.genderDivision) {
      for (let from = 0; ; from += PAGE) {
        const { data: page } = await db
          .from('usau_event_teams')
          .select('event_id, team_id, usau_teams(gender_division)')
          .in('event_id', eventIds)
          // Composite key (event_id, team_id) → order by both for a total order
          // so paged ranges don't skip/overlap.
          .order('event_id', { ascending: true })
          .order('team_id', { ascending: true })
          .range(from, from + PAGE - 1);
        const rows = (page ?? []) as Array<{
          event_id: string;
          team_id: string;
          usau_teams: { gender_division: string | null } | null;
        }>;
        for (const r of rows) {
          const div = r.usau_teams?.gender_division;
          if (div) {
            if (!divisionsByEvent.has(r.event_id)) divisionsByEvent.set(r.event_id, new Set());
            divisionsByEvent.get(r.event_id)!.add(div);
          }
        }
        if (rows.length < PAGE) break;
      }
      events = events.filter((e) => divisionsByEvent.get(e.id)?.has(opts.genderDivision!) ?? false);
    }
  }

  // Weekend cadence: before Wednesday we look back at last weekend; from
  // Wednesday on we look forward to the next weekend. We use getUTCDay() so the
  // cutover and the past/upcoming date split below share one clock — `today`
  // and event start/end dates are all compared as UTC calendar dates.
  const lookForward = now.getUTCDay() >= 3; // Wed(3) → Sat(6)

  const endOf = (e: EventRow) => e.end_date ?? e.start_date ?? '';

  // Quantize a start date to its tournament WEEKEND (the Saturday of the
  // Fri–Sun span) so co-scheduled events group together even when their
  // start days differ (a Fri-start flagship vs a Sat-start local), letting
  // flight break the tie within the weekend.
  const weekendKey = (d: string | null): string => {
    if (!d) return '';
    const dt = new Date(d + 'T00:00:00Z');
    if (isNaN(dt.getTime())) return d;
    const dow = dt.getUTCDay();
    // Sunday belongs to the weekend that began the day before; Thu/Fri (and
    // rare mid-week starts) roll forward to the coming Saturday.
    dt.setUTCDate(dt.getUTCDate() + (dow === 0 ? -1 : 6 - dow));
    return dt.toISOString().slice(0, 10);
  };

  // "Highest flight of the nearest WEEKEND": the closest weekend to now wins
  // first, and flight only breaks ties among that weekend's events. So last
  // weekend's Pro Elite Challenge headlines over a 5-week-old College
  // Championships, while a marquee event still out-headlines a co-scheduled
  // local tournament.
  const byWeekendThenFlight = (recentFirst: boolean) => (a: EventRow, b: EventRow) => {
    const wCmp = recentFirst
      ? weekendKey(b.start_date).localeCompare(weekendKey(a.start_date))
      : weekendKey(a.start_date).localeCompare(weekendKey(b.start_date));
    if (wCmp !== 0) return wCmp;
    const fCmp = flightRankForName(b.name) - flightRankForName(a.name);
    if (fCmp !== 0) return fCmp;
    return recentFirst
      ? (b.start_date ?? '').localeCompare(a.start_date ?? '')
      : (a.start_date ?? '').localeCompare(b.start_date ?? '');
  };

  // The preferred bucket differs by direction:
  //   • Looking BACK (Sun–Tue): events that have STARTED (start_date ≤
  //     today) — NOT events that have ENDED. "Last weekend's tournament"
  //     must include one still finishing today: on the Sunday of a Sat–Sun
  //     flagship, an ended-only bucket ranked a Saturday-only local
  //     (Pioneer Valley Pool Party, ended 7/11) over the live Pro Elite
  //     Challenge West (ends 7/12), because flight only breaks ties WITHIN
  //     a bucket.
  //   • Looking FORWARD (Wed–Sat): events that haven't finished (end ≥
  //     today) — keeps a live Saturday tournament ahead of next weekend's
  //     calendar entries.
  const preferred = lookForward
    ? events.filter((e) => endOf(e) >= today).sort(byWeekendThenFlight(false))
    : events
        .filter((e) => (e.start_date ?? '') !== '' && (e.start_date ?? '') <= today)
        .sort(byWeekendThenFlight(true));
  const preferredIds = new Set(preferred.map((e) => e.id));
  const rest = events
    .filter((e) => !preferredIds.has(e.id))
    .sort(byWeekendThenFlight(!lookForward));

  // Preferred side first, then the other side as a graceful fallback (e.g. early
  // in a season there is no "last weekend"; at season's end no "next weekend").
  const ordered = [...preferred, ...rest];

  // Prefer an in-window event that actually has games. Only if NONE do (e.g. the
  // upcoming weekend's brackets aren't scraped yet) fall through to the best
  // gameless pick so the preview still shows "brackets pending"; the DB-wide
  // fallback below then guarantees the page is never truly empty.
  const withGames = ordered.find((e) => (counts.get(e.id) ?? 0) > 0);
  if (withGames) {
    return { slug: withGames.usau_slug, hasGames: true };
  }
  if (ordered.length > 0) {
    return { slug: ordered[0].usau_slug, hasGames: false };
  }

  // Final fallback: most-recent flagship event with games anywhere in DB.
  // Apply the division filter via the team-participation join when set.
  const { data: latest } = await db
    .from('usau_events')
    .select('id, usau_slug, start_date')
    .in('competition_level', levelFilter)
    .order('start_date', { ascending: false, nullsFirst: false })
    .limit(80);
  for (const e of latest ?? []) {
    const { count } = await db
      .from('usau_games')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', e.id);
    if ((count ?? 0) === 0) continue;
    if (opts?.genderDivision) {
      // Skip events that don't have the requested division participating.
      const { count: matchCount } = await db
        .from('usau_event_teams')
        .select('team_id, usau_teams!inner(gender_division)', { count: 'exact', head: true })
        .eq('event_id', e.id)
        .eq('usau_teams.gender_division', opts.genderDivision);
      if (!matchCount || matchCount === 0) continue;
    }
    return { slug: e.usau_slug, hasGames: true };
  }
  return null;
}

/**
 * The next UPCOMING flagship event — for the home "Up next" card.
 *
 * getCurrentEvent() runs a look-back/look-forward weekend cadence tuned for the
 * hero + "recent results" slots: Sun–Tue it deliberately returns LAST weekend's
 * (now-finished) event. That's wrong for "Up next", which must always look
 * FORWARD — otherwise the USAU "Up next" card vanishes for half of every week
 * once last weekend's tournaments end.
 *
 * Only "flighted"-grade events qualify — the ones worth previewing: a recognized
 * TCT flight (Pro/Elite/Select/Classic/Triple-Crown), a pinnacle championship,
 * OR any Masters/College event (championships + regionals, which are the
 * division equivalent of a flagship). Unclassified local CLUB tournaments (MOB
 * Invite, Filling the Void, …) are skipped so the card jumps to the next event
 * that actually matters (e.g. Select Flight Invite over a co-scheduled local).
 *
 * Among qualifying events it picks the NEAREST UPCOMING WEEKEND, and within it
 * the HIGHEST FLIGHT. An event still in progress today counts as "upcoming"
 * (end_date ≥ today) so a live Sat–Sun event stays in "Up next" through its
 * final day. Returns the slug + hasGames, mirroring getCurrentEvent(); callers
 * fetch the full event via getEvent().
 */
export async function getNextUpcomingEvent(opts?: {
  genderDivision?: 'Men' | 'Women' | 'Mixed';
  competitionLevel?: CompetitionLevel;
}): Promise<{ slug: string; hasGames: boolean } | null> {
  const db = await supabase();
  const today = new Date().toISOString().slice(0, 10);
  // Look ~120d ahead: far enough to always find the next flagship weekend even
  // in a sparse stretch, tight enough to stay clear of the 1000-row cap.
  const windowForward = new Date(Date.now() + 120 * 86400_000)
    .toISOString()
    .slice(0, 10);

  const levelFilter = opts?.competitionLevel ? [opts.competitionLevel] : FLAGSHIP_LEVELS;

  // Upcoming = not yet ended (end_date ≥ today), so a live event stays here
  // through its last day. Order soonest-first.
  const { data: rows } = await db
    .from('usau_events')
    .select('id, usau_slug, name, start_date, end_date, competition_level')
    .in('competition_level', levelFilter)
    .gte('end_date', today)
    .lte('start_date', windowForward)
    .order('start_date', { ascending: true });

  type Row = {
    id: string;
    usau_slug: string;
    name: string | null;
    start_date: string | null;
    end_date: string | null;
    competition_level: string | null;
  };
  let events = (rows ?? []) as Row[];

  // Keep only "flighted"-grade events. A plain CLUB tournament qualifies ONLY if
  // it maps to a real TCT flight or is a pinnacle championship; Masters, Grand
  // Masters, and College events always qualify (their championships + regionals
  // are the division equivalent of a flagship). This drops unclassified local
  // CLUB tournaments so "Up next" surfaces the next event that matters.
  const isFlighted = (e: Row): boolean => {
    if (e.competition_level !== 'CLUB') return true; // Masters/GM/College always
    return flightForName(e.name) !== null || isPinnacleEventName(e.name);
  };
  events = events.filter(isFlighted);
  if (events.length === 0) return null;

  // Optional division filter: keep only events with a participating team in the
  // requested gender division.
  if (opts?.genderDivision) {
    const ids = events.map((e) => e.id);
    const withDiv = new Set<string>();
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data: page } = await db
        .from('usau_event_teams')
        .select('event_id, usau_teams!inner(gender_division)')
        .in('event_id', ids)
        .eq('usau_teams.gender_division', opts.genderDivision)
        .range(from, from + PAGE - 1);
      const pageRows = page ?? [];
      for (const r of pageRows) withDiv.add((r as { event_id: string }).event_id);
      if (pageRows.length < PAGE) break;
    }
    events = events.filter((e) => withDiv.has(e.id));
    if (events.length === 0) return null;
  }

  // Quantize each start to its tournament WEEKEND (the Saturday of the Fri–Sun
  // span) so a Fri-start flagship and a Sat-start local on the same weekend
  // group together — otherwise "earliest start_date" would isolate the Friday
  // events and miss a higher-flight Saturday event on the same weekend.
  const weekendKey = (d: string | null): string => {
    if (!d) return '';
    const dt = new Date(d + 'T00:00:00Z');
    if (isNaN(dt.getTime())) return d;
    const dow = dt.getUTCDay();
    dt.setUTCDate(dt.getUTCDate() + (dow === 0 ? -1 : 6 - dow));
    return dt.toISOString().slice(0, 10);
  };

  // Nearest upcoming weekend = the earliest weekend present. Restrict to that
  // weekend's events, then pick the highest flight (Select > local), tie-broken
  // by soonest start.
  const nearestWeekendKey = events
    .map((e) => weekendKey(e.start_date))
    .filter(Boolean)
    .sort()[0];
  const nearestWeekend = events.filter((e) => weekendKey(e.start_date) === nearestWeekendKey);
  nearestWeekend.sort((a, b) => {
    const fCmp = flightRankForName(b.name) - flightRankForName(a.name);
    if (fCmp !== 0) return fCmp;
    return (a.start_date ?? '').localeCompare(b.start_date ?? '');
  });
  const pick = nearestWeekend[0];

  const { count } = await db
    .from('usau_games')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', pick.id);
  return { slug: pick.usau_slug, hasGames: (count ?? 0) > 0 };
}

export interface UpcomingUsauEvent {
  slug: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  /** TCT flight display label ("Pro Flight", "Select Flight", …) when the event
   *  maps to one; null for pinnacle/Masters/College events (still listed). */
  flightLabel: string | null;
}

/**
 * The next N UPCOMING flighted USAU events — for the home "Up next" card, which
 * lists several upcoming tournaments rather than one event's pool games.
 *
 * Same "flighted-grade" filter as getNextUpcomingEvent (a plain CLUB event needs
 * a real TCT flight or pinnacle status; Masters/GM/College always qualify), so
 * unclassified local tournaments are excluded. Ordered by tournament WEEKEND
 * ascending (soonest first), and within a weekend by flight DESCENDING (the
 * marquee event leads its weekend). An in-progress event (end_date ≥ today)
 * still counts as upcoming so it stays listed through its final day.
 */
export async function listNextUpcomingEvents(limit = 5): Promise<UpcomingUsauEvent[]> {
  const db = await supabase();
  const today = new Date().toISOString().slice(0, 10);
  const windowForward = new Date(Date.now() + 120 * 86400_000).toISOString().slice(0, 10);

  const { data: rows } = await db
    .from('usau_events')
    .select('id, usau_slug, name, start_date, end_date, competition_level')
    .in('competition_level', FLAGSHIP_LEVELS)
    .gte('end_date', today)
    .lte('start_date', windowForward)
    .order('start_date', { ascending: true });

  type Row = {
    id: string;
    usau_slug: string;
    name: string | null;
    start_date: string | null;
    end_date: string | null;
    competition_level: string | null;
  };
  const events = ((rows ?? []) as Row[]).filter((e) =>
    e.competition_level !== 'CLUB'
      ? true
      : flightForName(e.name) !== null || isPinnacleEventName(e.name),
  );

  // Quantize to the tournament weekend (Saturday of the Fri–Sun span) so a
  // Fri-start flagship and a Sat-start event on the same weekend group together.
  const weekendKey = (d: string | null): string => {
    if (!d) return '';
    const dt = new Date(d + 'T00:00:00Z');
    if (isNaN(dt.getTime())) return d;
    const dow = dt.getUTCDay();
    dt.setUTCDate(dt.getUTCDate() + (dow === 0 ? -1 : 6 - dow));
    return dt.toISOString().slice(0, 10);
  };

  // Sort: nearest weekend first; within a weekend, highest flight first, then
  // soonest start, then name for stability.
  events.sort((a, b) => {
    const wk = weekendKey(a.start_date).localeCompare(weekendKey(b.start_date));
    if (wk !== 0) return wk;
    const fl = flightRankForName(b.name) - flightRankForName(a.name);
    if (fl !== 0) return fl;
    const st = (a.start_date ?? '').localeCompare(b.start_date ?? '');
    if (st !== 0) return st;
    return (a.name ?? '').localeCompare(b.name ?? '');
  });

  return events.slice(0, limit).map((e) => {
    const flight = flightForName(e.name);
    return {
      slug: e.usau_slug,
      name: e.name ?? e.usau_slug,
      startDate: e.start_date,
      endDate: e.end_date,
      flightLabel: flight ? FLIGHT_LABELS[flight] : null,
    };
  });
}

/**
 * @deprecated Kept as a thin wrapper for any callers still asking only
 * for a slug. New code should use getCurrentEvent() which also reports
 * whether games are ingested.
 */
export async function getCurrentClubEventSlug(): Promise<string | null> {
  const res = await getCurrentEvent();
  return res?.slug ?? null;
}

/**
 * Find a USAU player profile by name using the token-subset match (see
 * src/lib/name-match.ts). Handles "Mitchell McCarthy" ↔ "Robert Mitchell
 * McCarthy" — the surname must match exactly, and the shorter name's
 * given tokens must all appear in the longer name's given tokens.
 *
 * Returns the player_id of the most-active matching row (most roster
 * entries). Returns null if no match. Used by /players/{ufaSlug} to
 * deep-link to the same human's USAU career.
 */
export async function findUsauPlayerByName(name: string): Promise<string | null> {
  const surname = surnameForPrefilter(name);
  if (!surname) return null;
  const db = await supabase();
  // Cheap SQL prefilter: anyone whose display_name *contains* the
  // surname. We then apply the strict token-subset match in JS. The
  // surname filter is conservative — Postgres only returns the small
  // surname-cluster (typically < 30 rows for any given surname).
  const { data: matches } = await db
    .from('usau_players')
    .select('id, display_name')
    .ilike('display_name', `%${surname}%`)
    .limit(500);
  const candidates = (matches ?? []).filter((m) => namesMatch(name, m.display_name));
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].id;
  // Multiple candidate IDs — pick the one with the most rosters (most active).
  const ids = candidates.map((c) => c.id);
  const { data: rosters } = await db
    .from('usau_rosters')
    .select('player_id')
    .in('player_id', ids);
  const counts = new Map<string, number>();
  for (const r of rosters ?? []) {
    counts.set(r.player_id, (counts.get(r.player_id) ?? 0) + 1);
  }
  return ids.sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0))[0];
}

/**
 * USAU Club National Champions by season.
 * Returns a map of `season → { teamId, teamName }`. We look for the
 * `round = 'final'` game inside the National Championship bracket of the
 * Club Nationals event; the team with the higher score is the champion.
 *
 * Since usau_teams has multiple rows per franchise (one per year), the
 * returned teamId is the specific season's row — useful for matching
 * against usau_rosters.team_id directly.
 */
export interface UsauChampion {
  teamId: string;
  teamName: string;
  division: 'Men' | 'Women' | 'Mixed' | null;
}

/**
 * USAU Club National Champions, keyed by season then division.
 *
 * USAU runs Men's, Women's, and Mixed Nationals as one event id — so a
 * single event can have THREE finals (one per division). We resolve the
 * winning team for each, look up its gender_division, and bucket
 * accordingly. Callers can also call championsForSeasonAndDivision() to
 * pluck out a specific (season, division) winner.
 */
export async function getUsauClubChampionsBySeason(): Promise<
  Map<number, Map<string, UsauChampion>>
> {
  const db = await supabase();
  const { data: nationals } = await db
    .from('usau_events')
    .select('id, season, usau_slug')
    .eq('competition_level', 'CLUB')
    .or(
      'usau_slug.ilike.%national-championships%,' +
        'usau_slug.ilike.%club-nationals%,' +
        'usau_slug.ilike.%usa-ultimate-club-championships%',
    )
    .not('usau_slug', 'ilike', '%us-open%');
  const nationalsBySeason = new Map<string, { id: string; season: number }>();
  for (const e of nationals ?? []) {
    nationalsBySeason.set(e.id, { id: e.id, season: e.season });
  }
  if (nationalsBySeason.size === 0) return new Map();

  // Pull every round='final' game at any Nationals event. With Men +
  // Women + Mixed all under one event_id, we expect up to 3 finals per
  // event — one per division.
  const { data: finals } = await db
    .from('usau_games')
    .select(
      'event_id, team_a_id, team_b_id, score_a, score_b, scheduled_at, bracket_name, ' +
        'team_a:usau_teams!team_a_id(name, gender_division), ' +
        'team_b:usau_teams!team_b_id(name, gender_division)',
    )
    .in('event_id', Array.from(nationalsBySeason.keys()))
    .eq('round', 'final');

  type TeamRef = { name: string; gender_division: string | null } | null;
  type Row = {
    event_id: string;
    team_a_id: string | null;
    team_b_id: string | null;
    score_a: number | null;
    score_b: number | null;
    scheduled_at: string | null;
    bracket_name: string | null;
    team_a: TeamRef;
    team_b: TeamRef;
  };

  // season → division → champion
  const result = new Map<number, Map<string, UsauChampion>>();
  for (const g of (finals ?? []) as unknown as Row[]) {
    if (g.score_a == null || g.score_b == null) continue;
    if (g.team_a_id == null || g.team_b_id == null) continue;
    const ev = nationalsBySeason.get(g.event_id);
    if (!ev) continue;

    const aWon = g.score_a > g.score_b;
    const winnerId = aWon ? g.team_a_id : g.team_b_id;
    const winnerName = (aWon ? g.team_a?.name : g.team_b?.name) ?? 'Unknown';
    // Both teams in a final are the same division. Use either side's
    // gender_division — fall back to inferring from the bracket name
    // ("Women's Division Championship") if the team lacks it.
    let division = (aWon ? g.team_a?.gender_division : g.team_b?.gender_division) ?? null;
    if (!division) {
      const b = (g.bracket_name ?? '').toLowerCase();
      if (b.includes('mixed')) division = 'Mixed';
      else if (b.includes("women")) division = 'Women';
      else if (b.includes("men")) division = 'Men';
    }
    if (!division) continue;

    if (!result.has(ev.season)) result.set(ev.season, new Map());
    const seasonMap = result.get(ev.season)!;
    // Multiple final rows for the same (season, division) shouldn't
    // happen, but if they do prefer the latest-scheduled one.
    const existing = seasonMap.get(division);
    if (existing) {
      // Compare schedules to keep the latest.
      const ts = g.scheduled_at ? new Date(g.scheduled_at).getTime() : 0;
      // We don't store scheduled_at on UsauChampion; keep first-write
      // for simplicity unless we explicitly add it. First-write wins.
      void ts;
      continue;
    }
    seasonMap.set(division, {
      teamId: winnerId,
      teamName: winnerName,
      division: division as UsauChampion['division'],
    });
  }
  return result;
}

export interface UsauNationalsMedal {
  year: number;
  place: 1 | 2 | 3;
}

/**
 * True ONLY for the season's National Championships — the pinnacle Series event.
 * Purpose-built for medal derivation because it must catch every historical
 * naming variant ("USA Ultimate National Championships", "…Club Championships",
 * "Club Nationals") while rejecting the many other events that also carry
 * "Championship": Regionals/Sectionals, US Open, Pro Championships, Worlds, HS.
 * (isPinnacleEventName misses "National Championships" — singular "national" —
 * which cost real titles, so we don't reuse it here.)
 */
function isNationalsChampionshipName(name: string): boolean {
  const n = name.toLowerCase();
  if (/regional|sectional|conference/.test(n)) return false;
  if (/u\.?\s?s\.?\s?open|pro[- ]?championship|pro[- ]?elite|tune ?up|warm ?up|\binvite\b/.test(n))
    return false;
  if (/wucc|wmucc|wjuc|worlds?\b/.test(n)) return false;
  if (/high school|middle school|\byouth\b|state championship/.test(n)) return false;
  return (
    /national championship/.test(n) ||
    /club nationals/.test(n) ||
    /club championship/.test(n) ||
    /college championship/.test(n) ||
    /masters championship/.test(n)
  );
}

/**
 * A team's National Championship podium finishes, one per season.
 *   1st = won the Nationals final
 *   2nd = lost the Nationals final
 *   3rd = WON the 3rd-place game (the game between the two teams that lost the
 *         National Championship SEMIS). The loser of that game is 4th → no medal.
 *
 * Bracket-aware on purpose: USAU runs many placement brackets at Nationals
 * (Fifth Place, Pro Flight Play-In, 13th Place…) that each have their own
 * semis/finals — a loss there is NOT a podium finish. Podium is derived ONLY
 * from the main "Championship" bracket, so e.g. a team that lost the main
 * quarters and then the 5th-place-bracket semi does not get bronze.
 *
 * Matched by team name + gender division (usau_team_id is unpopulated, so a
 * franchise is name+division+level). Games bucketed by played-year with a
 * name-year guard to survive corrupt legacy events. 3rd needs the 3rd-place
 * game to be ingested; absent, no bronze rather than a wrong one.
 */
export async function getTeamNationalsMedals(
  teamName: string,
  genderDivision: string | null,
  competitionLevel: string | null,
): Promise<UsauNationalsMedal[]> {
  if (!teamName || !competitionLevel) return [];
  const db = await supabase();

  // Nationals events for this competition level. The DB filter must be tight:
  // a broad '%championship%' matches every Regional/Sectional Championship
  // (thousands of rows) and would silently truncate at PostgREST's 1000-row
  // cap — dropping older Nationals events (this bit us: pre-2023 titles
  // vanished). These patterns match only Nationals-shaped names; the JS
  // classifier below then drops the few stragglers (US Open / Pro Champs).
  const { data: events } = await db
    .from('usau_events')
    .select('id, season, name')
    .eq('competition_level', competitionLevel as CompetitionLevel)
    .or(
      'name.ilike.%national championship%,' +
        'name.ilike.%club nationals%,' +
        'name.ilike.%club championship%,' +
        'name.ilike.%college championship%,' +
        'name.ilike.%masters championship%',
    );
  const bySeason = new Map<string, { season: number; name: string }>();
  for (const e of (events ?? []) as Array<{ id: string; season: number; name: string }>) {
    if (isNationalsChampionshipName(e.name)) bySeason.set(e.id, { season: e.season, name: e.name });
  }
  if (bySeason.size === 0) return [];

  // We need the National Championship bracket (final + semis) PLUS the separate
  // 3rd-place game (a placement game between the two semi losers, labeled
  // "Third Place" / "WUCC Qualification" / etc.). Scoping to just these keeps
  // the result small — fetching every bracket game across ~12 Nationals events
  // would risk the PostgREST 1000-row cap (pool play alone is ~24 games/event).
  const { data: games } = await db
    .from('usau_games')
    .select(
      'event_id, round, bracket_name, scheduled_at, score_a, score_b, ' +
        'team_a:usau_teams!team_a_id(name, gender_division), ' +
        'team_b:usau_teams!team_b_id(name, gender_division)',
    )
    .in('event_id', Array.from(bySeason.keys()))
    .or(
      // The top bracket is named inconsistently across years — "Championship",
      // "Championship Bracket", "First/1st Place Bracket" — so fetch all of
      // them. `round.eq.placement`/`qualification` bring in the 3rd-place game.
      'bracket_name.ilike.%championship%,' +
        'bracket_name.ilike.%first place%,' +
        'bracket_name.ilike.%1st place%,' +
        'round.eq.placement,' +
        'bracket_name.ilike.%qualification%',
    );

  type TeamRef = { name: string; gender_division: string | null } | null;
  type Row = {
    event_id: string;
    round: string;
    bracket_name: string | null;
    scheduled_at: string | null;
    score_a: number | null;
    score_b: number | null;
    team_a: TeamRef;
    team_b: TeamRef;
  };

  const wantName = teamName.trim().toLowerCase();
  const wantDiv = genderDivision ?? null;
  const nameOf = (t: TeamRef): string => (t ? t.name.trim().toLowerCase() : '');
  const isThisTeam = (t: TeamRef): boolean => !!t && nameOf(t) === wantName;
  const inDivision = (t: TeamRef): boolean =>
    !!t && (wantDiv == null || t.gender_division == null || t.gender_division === wantDiv);
  const decisive = (g: Row): boolean =>
    g.score_a != null && g.score_b != null && g.score_a !== g.score_b;
  const winnerOf = (g: Row): TeamRef => (g.score_a! > g.score_b! ? g.team_a : g.team_b);
  const loserOf = (g: Row): TeamRef => (g.score_a! > g.score_b! ? g.team_b : g.team_a);
  // The MAIN (gold-medal) bracket. USAU names it inconsistently across years:
  // "Championship" / "Championship Bracket" / "Men's Division Championship"
  // (2021+, 2016, 2024) AND "First Place Bracket" / "1st Place Bracket" (2017,
  // 2018, 2022) — the latter has a trailing space in some rows. The lower
  // placement brackets are always ordinal ("Fifth Place", "13th Place", "Pro
  // Flight Play-In", "WUCC Qualification") — never "championship" or the exact
  // top-of-bracket "first/1st place" phrase. Guard consolation just in case.
  const isChampBracket = (g: Row): boolean => {
    const b = (g.bracket_name ?? '').trim().toLowerCase();
    if (b.includes('consolation')) return false;
    return b.includes('championship') || b.includes('first place') || b.includes('1st place');
  };

  // Bucket games by the year they were actually PLAYED (scheduled_at), not the
  // event's season field. Some legacy events lack a year in the name and merge
  // multiple years of Nationals under one event id (e.g. a "USA Ultimate
  // National Championships" row with games from 2014, 2016 AND 2017) — bucketing
  // by scheduled year splits those back into the correct seasons. Falls back to
  // the event season when a game has no scheduled_at.
  const yearOf = (g: Row): number | null => {
    const ev = bySeason.get(g.event_id);
    if (!ev) return null;
    let y = ev.season;
    if (g.scheduled_at) {
      const sy = new Date(g.scheduled_at).getUTCFullYear();
      if (Number.isFinite(sy)) y = sy;
    }
    // Guard against corrupt legacy events that lack a year in their name and
    // merge multiple seasons under one id with inconsistent dates: only trust a
    // game's year if the event name actually contains it. Well-formed Nationals
    // events always carry the year ("2025 USA Ultimate Club Nationals"); the
    // corrupt no-year "USA Ultimate National Championships" row is dropped.
    return ev.name.includes(String(y)) ? y : null;
  };
  const byYear = new Map<number, Row[]>();
  for (const g of (games ?? []) as unknown as Row[]) {
    const y = yearOf(g);
    if (y == null) continue;
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push(g);
  }

  const best = new Map<number, 1 | 2 | 3>();
  const note = (season: number, place: 1 | 2 | 3) => {
    const cur = best.get(season);
    if (cur == null || place < cur) best.set(season, place);
  };

  for (const [season, allYearGames] of byYear) {
    // Same-year contamination guard. Legacy slug collisions pull the mid-season
    // U.S. Open (played Aug) into the Nationals event alongside the real
    // Nationals bracket (played Sep–Oct) — both carry a "championship"/"first
    // place" bracket, so naïvely we'd read TWO finals for one year (e.g. 2022
    // Mixed: a bogus U.S. Open "AMP 14-12 NOISE" beside the true Nationals
    // "Seattle Mixtape 14-12 NOISE"). Nationals ends the season, so the REAL
    // title bracket is the one owning the LATEST-dated champ final. Keep only
    // that bracket_name's games for this year+division.
    const champAll = allYearGames.filter(
      (g) => isChampBracket(g) && decisive(g) && inDivision(g.team_a) && inDivision(g.team_b),
    );
    const finals = champAll.filter((g) => g.round === 'final' && g.scheduled_at);
    let evGames = allYearGames;
    if (finals.length > 1) {
      const latest = finals.reduce((a, b) =>
        new Date(a.scheduled_at!) >= new Date(b.scheduled_at!) ? a : b,
      );
      const keepBracket = (latest.bracket_name ?? '').trim().toLowerCase();
      evGames = allYearGames.filter(
        (g) => (g.bracket_name ?? '').trim().toLowerCase() === keepBracket || !isChampBracket(g),
      );
    }

    // Championship-bracket games in THIS team's division only. USAU's placement
    // brackets (Fifth Place, Pro Flight Play-In, 13th Place…) also have their
    // own semis/finals — a loss there is NOT a podium finish, so they're
    // excluded by isChampBracket.
    const champ = evGames.filter(
      (g) => isChampBracket(g) && decisive(g) && inDivision(g.team_a) && inDivision(g.team_b),
    );

    // 1st / 2nd — the championship final.
    const finalG = champ.find((g) => g.round === 'final');
    if (finalG) {
      if (isThisTeam(winnerOf(finalG))) note(season, 1);
      else if (isThisTeam(loserOf(finalG))) note(season, 2);
    }

    // 3rd — losing a Championship-bracket semifinal.
    //
    // When USAU stages a 3rd-place game between the two semi losers, only its
    // WINNER is 3rd (the loser is 4th). But many Nationals (and every year with
    // no bronze-medal game, e.g. 2023 Mixed) leave the two semi losers to TIE
    // for 3rd — both take a bronze, matching USAU's official final standings.
    const semiLosers = champ.filter((g) => g.round === 'semi').map(loserOf);
    if (semiLosers.some(isThisTeam) && semiLosers.length >= 2) {
      const other = semiLosers.find((t) => !isThisTeam(t));
      const otherName = other ? nameOf(other) : '';
      // The 3rd-place game: the (post-semi) BRACKET game whose two teams are
      // exactly this team + the other semi loser. Found by team pairing, so the
      // bracket label ("Third Place" / "WUCC Qualification") doesn't matter.
      // Must NOT count a pool-play meeting between the same two teams as a
      // "3rd-place game" (they often played earlier in pools, e.g. 2022 Mixed
      // XIST bt Drag'n Thrust in Pool A) — that would wrongly deny the loser a
      // tied-3rd bronze. Restrict to placement/qualification/champ games.
      const isBracketGame = (g: Row): boolean => {
        const b = (g.bracket_name ?? '').toLowerCase();
        return (
          g.round === 'placement' ||
          b.includes('place') ||
          b.includes('qualification') ||
          isChampBracket(g)
        );
      };
      const thirdGame = otherName
        ? evGames.find(
            (g) =>
              decisive(g) &&
              isBracketGame(g) &&
              !(isChampBracket(g) && g.round === 'semi') &&
              ((nameOf(g.team_a) === wantName && nameOf(g.team_b) === otherName) ||
                (nameOf(g.team_b) === wantName && nameOf(g.team_a) === otherName)),
          )
        : undefined;
      if (thirdGame) {
        // A 3rd-place game was played → only its winner medals (loser is 4th).
        if (isThisTeam(winnerOf(thirdGame))) note(season, 3);
      } else {
        // No 3rd-place game → the semi losers tie for 3rd; both medal.
        note(season, 3);
      }
    }
  }

  return [...best.entries()]
    .map(([year, place]) => ({ year, place }))
    .sort((a, b) => b.year - a.year);
}

// ─── Recent USAU Majors with Champions ─────────────────────────────────────

export interface UsauMajorWithChampions {
  slug: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  flight: Flight | null;
  champions: Array<{
    division: 'Men' | 'Women' | 'Mixed';
    teamName: string;
    teamId: string;
    /** True when the "winner" was derived from best pool-play record rather
     *  than a bracket final (pool-play-only events with no bracket). The card
     *  labels these "Pool leader" instead of "Champion". */
    viaPoolRecord?: boolean;
  }>;
}

/**
 * Returns up to `limit` recently-completed USAU TCT/major events (those where
 * `flightForName(name) !== null`), newest first, each enriched with the
 * champion(s) derived from round='final' games.
 *
 * Events with no scraped finals are omitted (we can't show a champion for them).
 */
export async function recentUsauMajorsWithChampions(limit = 3): Promise<UsauMajorWithChampions[]> {
  const db = await supabase();
  const today = new Date().toISOString().slice(0, 10);

  // 1. Pull the most-recent completed CLUB events. Scan wide (300 ≈ a bit over
  // a full season of the club calendar): flight-named majors are a small
  // fraction of it, and early in the club season a short scan only reaches ONE
  // completed major — the home "Recent results" row wants up to 4, which means
  // reaching back through last season's majors (Nationals, Pro Champs, US Open…)
  // until this season catches up. Single indexed query; rows are tiny.
  const { data: events } = await db
    .from('usau_events')
    .select('id, usau_slug, name, start_date, end_date')
    .eq('competition_level', 'CLUB')
    .lt('end_date', today)
    .order('end_date', { ascending: false, nullsFirst: false })
    .limit(300);

  // 2. Filter to named flights (TCT majors only).
  const majorEvents = ((events ?? []) as Array<{
    id: string;
    usau_slug: string;
    name: string;
    start_date: string | null;
    end_date: string | null;
  }>).filter((e) => flightForName(e.name) !== null);

  if (majorEvents.length === 0) return [];

  const eventIds = majorEvents.map((e) => e.id);

  // 3. Fetch all round='final' games for these events.
  const { data: finals } = await db
    .from('usau_games')
    .select(
      'event_id, team_a_id, team_b_id, score_a, score_b, scheduled_at, bracket_name, ' +
        'team_a:usau_teams!team_a_id(name, gender_division), ' +
        'team_b:usau_teams!team_b_id(name, gender_division)',
    )
    .in('event_id', eventIds)
    .eq('round', 'final');

  type TeamRef = { name: string; gender_division: string | null } | null;
  type Row = {
    event_id: string;
    team_a_id: string | null;
    team_b_id: string | null;
    score_a: number | null;
    score_b: number | null;
    scheduled_at: string | null;
    bracket_name: string | null;
    team_a: TeamRef;
    team_b: TeamRef;
  };

  // 4. Group champions by event_id.
  const championsByEvent = new Map<
    string,
    Array<{ division: 'Men' | 'Women' | 'Mixed'; teamName: string; teamId: string; viaPoolRecord?: boolean }>
  >();
  // `${eventId}|${division}` pairs already settled by a bracket final — used to
  // skip the pool-record fallback for divisions that DID play a bracket.
  const decidedKeys = new Set<string>();
  for (const g of (finals ?? []) as unknown as Row[]) {
    if (g.score_a == null || g.score_b == null) continue;
    if (g.team_a_id == null || g.team_b_id == null) continue;

    const aWon = g.score_a > g.score_b;
    const winnerId = aWon ? g.team_a_id : g.team_b_id;
    const winnerName = (aWon ? g.team_a?.name : g.team_b?.name) ?? 'Unknown';

    let division = (aWon ? g.team_a?.gender_division : g.team_b?.gender_division) ?? null;
    if (!division) {
      const b = (g.bracket_name ?? '').toLowerCase();
      if (b.includes('mixed')) division = 'Mixed';
      else if (b.includes('women')) division = 'Women';
      else if (b.includes('men')) division = 'Men';
    }
    if (!division) continue;

    if (!championsByEvent.has(g.event_id)) championsByEvent.set(g.event_id, []);
    // Avoid duplicate divisions.
    const existing = championsByEvent.get(g.event_id)!;
    if (existing.some((c) => c.division === division)) continue;
    existing.push({ division: division as 'Men' | 'Women' | 'Mixed', teamName: winnerName, teamId: winnerId });
    decidedKeys.add(`${g.event_id}|${division}`);
  }

  // 4b. Pool-record fallback — same rule as the /scores tab. Divisions that
  // never played a bracket (pool-play-only, e.g. an event whose Women's bracket
  // isn't scraped yet) get the unique best-pool-record team as de-facto winner,
  // badged "Pool leader". Skips divisions already decided by a bracket final.
  const poolWinners = await bestPoolRecordWinners(db, eventIds, decidedKeys);
  for (const w of poolWinners) {
    if (!championsByEvent.has(w.eventId)) championsByEvent.set(w.eventId, []);
    championsByEvent.get(w.eventId)!.push({
      division: w.division,
      teamName: w.teamName,
      teamId: w.teamId,
      viaPoolRecord: true,
    });
  }

  // 5. Build results — only events with at least one champion.
  const DIV_ORDER: Record<string, number> = { Men: 0, Women: 1, Mixed: 2 };
  const results: UsauMajorWithChampions[] = [];
  for (const e of majorEvents) {
    const champions = championsByEvent.get(e.id);
    if (!champions || champions.length === 0) continue;
    results.push({
      slug: e.usau_slug,
      name: e.name,
      startDate: e.start_date,
      endDate: e.end_date,
      flight: flightForName(e.name),
      champions: champions.sort(
        (a, b) => (DIV_ORDER[a.division] ?? 9) - (DIV_ORDER[b.division] ?? 9),
      ),
    });
    if (results.length >= limit) break;
  }

  return results;
}

/**
 * Recent USAU tournaments for the /scores?league=usau landing: the last ~14
 * days (≈ 2 weekends) of FLAGSHIP tournaments, each enriched with per-division
 * champions.
 *
 * Selection (per Hunter):
 *   • FLAGSHIP only — ranked-flight events (Pro Elite, Elite-Select, Select
 *     Flight, Nationals, US Open, …). We deliberately DON'T show the long tail
 *     of local summer invites; team-count doesn't distinguish them (locals run
 *     14-35 teams too), and they aren't results people track.
 *   • FINISHED only — a card appears only once the tournament has ≥1 division
 *     champion (a decided final). In-progress/unscraped events are omitted.
 *   • Newest weekend first, then higher flight first within a weekend, capped
 *     at `limit`.
 *
 * Champion detection is corrected vs. the older per-event helper: USAU
 * sometimes labels BOTH a semifinal and the title game round='final' in the
 * same championship bracket, so we keep the LATEST-scheduled final per
 * (event, division) rather than whichever row we happen to see first.
 */
export async function recentUsauTournamentCards(
  now: Date = new Date(),
  limit = 200,
  competitionLevel: CompetitionLevel = 'CLUB',
  /** Optional Triple Crown Tour flight filter (Club only) — mirrors /schedule.
   *  Only events whose name maps to ONE OF these flights are returned. Empty ⇒
   *  all flights. */
  flights: Flight[] = [],
): Promise<UsauMajorWithChampions[]> {
  const db = await supabase();
  const today = now.toISOString().slice(0, 10);

  // The 10 most recent COMPLETED events at this level that actually have
  // games — no date window. A "last 2 weeks" window (the original rule) left
  // sparse calendars (Masters/GM play a handful of weekends a year, College
  // in summer, everyone in the offseason) with an empty scores page while
  // /schedule clearly had data. A fixed count keeps the page populated
  // year-round: in-season it reads the same as before, offseason it shows
  // the final tournaments of the season. The games inner-join keeps
  // result-less catalog shells from wasting one of the 10 slots.
  // Show 10 recent events normally. When filtering to a single flight, fetch a
  // wider candidate pool first (flight is a name-derived tag, not a column, so
  // it's filtered in JS below) — otherwise a 10-event window that happens to
  // contain few of the requested flight would show an almost-empty scores page.
  const RECENT_EVENT_COUNT = 10;
  const hasFlightFilter = flights.length > 0;
  const FETCH_COUNT = hasFlightFilter ? 120 : RECENT_EVENT_COUNT;
  const { data: events } = await db
    .from('usau_events')
    .select('id, usau_slug, name, start_date, end_date, usau_games!inner(id)')
    .eq('competition_level', competitionLevel)
    .lt('end_date', today)
    .order('end_date', { ascending: false, nullsFirst: false })
    .limit(1, { foreignTable: 'usau_games' })
    .limit(FETCH_COUNT);

  // ALL events at the level (not just ranked-flight flagships), ordered by
  // flight status below. Flight tags exist only on marquee events today, so
  // most sort to the bottom (no flight) — that's expected until more get tagged.
  const allRecent = ((events ?? []) as Array<{
    id: string;
    usau_slug: string;
    name: string;
    start_date: string | null;
    end_date: string | null;
  }>);
  // Apply the flight filter (name-derived) here, then cap to the display count.
  // Without a flight, keep the original 10 most-recent. Multiple flights ⇒ match
  // ANY of them.
  const flightSet = hasFlightFilter ? new Set(flights) : null;
  const recent = (
    flightSet
      ? allRecent.filter((e) => {
          const f = flightForName(e.name);
          return f != null && flightSet.has(f);
        })
      : allRecent
  ).slice(0, RECENT_EVENT_COUNT);
  if (recent.length === 0) return [];

  const eventIds = recent.map((e) => e.id);

  type TeamRef = { name: string; gender_division: string | null } | null;
  type Row = {
    event_id: string;
    team_a_id: string | null;
    team_b_id: string | null;
    score_a: number | null;
    score_b: number | null;
    scheduled_at: string | null;
    bracket_name: string | null;
    team_a: TeamRef;
    team_b: TeamRef;
  };

  // round='final' games for all these events, with scheduling to break the
  // semi-vs-final ambiguity, and bracket_name to drop placement brackets. Now
  // that we include EVERY club event in the window (not just flagships), page
  // through — a busy 2-weekend window can exceed PostgREST's 1000-row cap and
  // would otherwise silently drop finals.
  const PAGE = 1000;
  const finals: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data: page } = await db
      .from('usau_games')
      .select(
        'id, event_id, team_a_id, team_b_id, score_a, score_b, scheduled_at, bracket_name, ' +
          'team_a:usau_teams!team_a_id(name, gender_division), ' +
          'team_b:usau_teams!team_b_id(name, gender_division)',
      )
      .in('event_id', eventIds)
      .eq('round', 'final')
      .order('id', { ascending: true }) // stable order so paged ranges don't skip/overlap
      .range(from, from + PAGE - 1);
    const rows = (page ?? []) as unknown as Row[];
    finals.push(...rows);
    if (rows.length < PAGE) break;
  }

  // Keep the latest-scheduled decided final per (event, division), skipping
  // placement brackets (13th/17th place etc. also carry round='final').
  const best = new Map<
    string,
    { teamName: string; teamId: string; scheduledAt: string }
  >();
  for (const g of finals) {
    if (g.score_a == null || g.score_b == null || g.score_a === g.score_b) continue;
    if (g.team_a_id == null || g.team_b_id == null) continue;
    const b = (g.bracket_name ?? '').toLowerCase();
    if (/\b\d+(st|nd|rd|th)\b/.test(b) && !b.includes('1st')) continue; // drop 5th/13th/17th…
    if (b.includes('consolation') || b.includes('placement')) continue;

    const aWon = g.score_a > g.score_b;
    const winnerId = aWon ? g.team_a_id : g.team_b_id;
    const winnerName = (aWon ? g.team_a?.name : g.team_b?.name) ?? 'Unknown';
    let division = (aWon ? g.team_a?.gender_division : g.team_b?.gender_division) ?? null;
    if (!division) {
      if (b.includes('mixed')) division = 'Mixed';
      else if (b.includes('women')) division = 'Women';
      else if (b.includes('men')) division = 'Men';
    }
    if (!division) continue;

    const key = `${g.event_id}|${division}`;
    const sched = g.scheduled_at ?? '';
    const prev = best.get(key);
    if (!prev || sched > prev.scheduledAt) {
      best.set(key, { teamName: winnerName, teamId: winnerId, scheduledAt: sched });
    }
  }

  const championsByEvent = new Map<
    string,
    Array<{ division: 'Men' | 'Women' | 'Mixed'; teamName: string; teamId: string; viaPoolRecord?: boolean }>
  >();
  for (const [key, v] of best) {
    const [eventId, division] = key.split('|');
    if (!championsByEvent.has(eventId)) championsByEvent.set(eventId, []);
    championsByEvent
      .get(eventId)!
      .push({ division: division as 'Men' | 'Women' | 'Mixed', teamName: v.teamName, teamId: v.teamId });
  }

  // ── Pool-record fallback ────────────────────────────────────────────────
  // Some events (esp. lower-flight, pool-play-only weekends) never played a
  // bracket, so no (event, division) shows up in `best`. For those, the team
  // with the best pool-play record is the de-facto winner. We only declare one
  // when there's a UNIQUE best record — a tie for first in a pool-only format
  // has no clear champion, so we skip rather than guess.
  const decidedKeys = new Set(best.keys()); // `${eventId}|${division}` already won via bracket
  const poolWinners = await bestPoolRecordWinners(db, eventIds, decidedKeys);
  for (const w of poolWinners) {
    if (!championsByEvent.has(w.eventId)) championsByEvent.set(w.eventId, []);
    championsByEvent.get(w.eventId)!.push({
      division: w.division,
      teamName: w.teamName,
      teamId: w.teamId,
      viaPoolRecord: true,
    });
  }

  const DIV_ORDER: Record<string, number> = { Men: 0, Women: 1, Mixed: 2 };
  const results: UsauMajorWithChampions[] = [];
  for (const e of recent) {
    // Show every event in the window — including those with no champion yet
    // (no bracket final and no unique pool leader). Champions may be empty; the
    // card renders the event header with no winner row in that case.
    const champions = championsByEvent.get(e.id) ?? [];
    results.push({
      slug: e.usau_slug,
      name: e.name,
      startDate: e.start_date,
      endDate: e.end_date,
      flight: flightForName(e.name),
      champions: champions.sort((a, b) => (DIV_ORDER[a.division] ?? 9) - (DIV_ORDER[b.division] ?? 9)),
    });
  }

  // Ordering:
  //  - No flight filter → FLIGHT status first (marquee events float to the top),
  //    then recency. Untagged events fall to the bottom, most-recent-first.
  //  - Flight filter active → the user already chose the tier(s), so tier
  //    ordering is noise. Order purely by DATE (newest weekend first).
  results.sort((a, b) => {
    if (!hasFlightFilter) {
      const tier = flightRankForName(b.name) - flightRankForName(a.name);
      if (tier !== 0) return tier;
    }
    return (b.endDate ?? '').localeCompare(a.endDate ?? '');
  });
  return results.slice(0, limit);
}

/**
 * For (event, division) pairs with NO decided bracket final, derive the
 * de-facto winner from best pool-play record. Returns one winner per pair,
 * ONLY when the top record is unique (no tie for first) — a pool-only tie has
 * no clear champion. `decidedKeys` holds the `${eventId}|${division}` pairs
 * already settled by a bracket, which we skip.
 */
async function bestPoolRecordWinners(
  db: Awaited<ReturnType<typeof supabase>>,
  eventIds: string[],
  decidedKeys: Set<string>,
): Promise<Array<{ eventId: string; division: 'Men' | 'Women' | 'Mixed'; teamName: string; teamId: string }>> {
  type TeamRef = { name: string; gender_division: string | null } | null;
  type Row = {
    event_id: string;
    team_a_id: string | null;
    team_b_id: string | null;
    score_a: number | null;
    score_b: number | null;
    team_a: TeamRef;
    team_b: TeamRef;
  };

  // Pull all pool-play games across the candidate events, with each side's team
  // name + division for grouping and display. Page through — across every club
  // event in a 2-weekend window, pool games easily exceed PostgREST's 1000-row
  // cap, which would silently truncate records.
  //
  // Detect pool games by BRACKET NAME ("Pool A", "Pool Apple", …), NOT by
  // round='pool'. The ultirzr ingest tags pool games round='other' (its
  // classifyRound has no pool case), so ~90% of pool games in the DB are
  // round='other' — filtering on round would miss them and make round-robin
  // events read as "Results pending" even though the event page (which keys on
  // bracket_name) correctly shows a pool leader. Matching bracket_name keeps
  // the card and the event page in agreement.
  const PAGE = 1000;
  const poolGames: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data: page } = await db
      .from('usau_games')
      .select(
        'id, event_id, team_a_id, team_b_id, score_a, score_b, ' +
          'team_a:usau_teams!team_a_id(name, gender_division), ' +
          'team_b:usau_teams!team_b_id(name, gender_division)',
      )
      .in('event_id', eventIds)
      .ilike('bracket_name', 'pool%')
      .order('id', { ascending: true }) // stable order so paged ranges don't skip/overlap
      .range(from, from + PAGE - 1);
    const rows = (page ?? []) as unknown as Row[];
    poolGames.push(...rows);
    if (rows.length < PAGE) break;
  }

  // (eventId|division) → normalized team NAME → { wins, losses, name, teamId }.
  // ROBUSTNESS (dual-pipeline dedup, same as usau-event-detail's poolRecords):
  // the HTML + ultirzr ingest can create TWO team_ids for the same real team in
  // one event, so keying by team_id makes one team read as two identical rows →
  // a false tie that hides the pool winner (e.g. Brute Squad 6-0 twice → no
  // Women's champ). We (1) dedup games by matchup+score and (2) tally by
  // NORMALIZED NAME so duplicate team_ids collapse into one team.
  const norm = (n: string | null | undefined) => (n ?? '').trim().toLowerCase();
  const records = new Map<string, Map<string, { wins: number; losses: number; name: string; teamId: string }>>();
  const seenGameKeys = new Set<string>();

  const bump = (
    groupKey: string,
    teamId: string,
    name: string,
    won: boolean,
  ) => {
    if (!records.has(groupKey)) records.set(groupKey, new Map());
    const g = records.get(groupKey)!;
    const nk = norm(name);
    const r = g.get(nk) ?? { wins: 0, losses: 0, name, teamId };
    if (won) r.wins += 1;
    else r.losses += 1;
    g.set(nk, r);
  };

  for (const g of poolGames) {
    if (g.score_a == null || g.score_b == null || g.score_a === g.score_b) continue;
    if (g.team_a_id == null || g.team_b_id == null) continue;
    // Division comes from the teams (pool games are single-division); require
    // both sides agree, else skip.
    const div = g.team_a?.gender_division ?? g.team_b?.gender_division ?? null;
    if (div !== 'Men' && div !== 'Women' && div !== 'Mixed') continue;
    const groupKey = `${g.event_id}|${div}`;
    if (decidedKeys.has(groupKey)) continue; // bracket already settled this one

    // Dedup: one row per (event + division + unordered matchup + unordered
    // score). A repeat of the same result from the other pipeline is dropped.
    const na = norm(g.team_a?.name);
    const nb = norm(g.team_b?.name);
    if (!na || !nb) continue;
    const pair = [na, nb].sort();
    const scores = [g.score_a, g.score_b].sort((x, y) => x - y);
    const gkey = `${groupKey}|${pair[0]}|${pair[1]}|${scores[0]}|${scores[1]}`;
    if (seenGameKeys.has(gkey)) continue;
    seenGameKeys.add(gkey);

    const aWon = g.score_a > g.score_b;
    bump(groupKey, g.team_a_id, g.team_a?.name ?? 'Unknown', aWon);
    bump(groupKey, g.team_b_id, g.team_b?.name ?? 'Unknown', !aWon);
  }

  const winners: Array<{ eventId: string; division: 'Men' | 'Women' | 'Mixed'; teamName: string; teamId: string }> = [];
  for (const [groupKey, teamMap] of records) {
    const [eventId, division] = groupKey.split('|');
    const standings = Array.from(teamMap.values())
      .sort((a, b) => b.wins - a.wins || a.losses - b.losses);
    if (standings.length === 0) continue;
    const top = standings[0];
    // Unique best record only — a tie for the top win/loss line is ambiguous.
    const tiedForFirst = standings.filter(
      (s) => s.wins === top.wins && s.losses === top.losses,
    ).length;
    if (tiedForFirst > 1) continue;
    winners.push({
      eventId,
      division: division as 'Men' | 'Women' | 'Mixed',
      teamName: top.name,
      teamId: top.teamId,
    });
  }
  return winners;
}

/** Distinct seasons we have any event for, newest first. */
/** Lightweight top-N USAU club teams for the nav mega-menu PREVIEW (id + name
 *  + Nationals placement only), via the top_usau_club_teams RPC — ONE round
 *  trip, no ranking engine. Do NOT use for the real ranked Teams page; that's
 *  listRankedTeams(). */
export async function listTopUsauTeams(opts?: {
  genderDivision?: 'Men' | 'Women' | 'Mixed';
  limit?: number;
}): Promise<Array<{ id: string; name: string; nationalsPlacement: number | null }>> {
  const db = await supabase();
  // Cast: these RPCs are newer than the generated database.types.ts, so the
  // function-name union doesn't include them yet. Regenerate types to drop it.
  // NOTE: must call db.rpc(...) directly (bound) — extracting it into a local
  // `const rpc = db.rpc` detaches `this`, and supabase-js's rpc() then reads
  // `this.rest` → "Cannot read properties of undefined (reading 'rest')".
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rpcDb = db as unknown as { rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: unknown }> };
  const { data, error } = await rpcDb.rpc('top_usau_club_teams', {
    p_gender_division: opts?.genderDivision ?? 'Men',
    p_limit: opts?.limit ?? 16,
  });
  if (error) throw error;
  return ((data ?? []) as Array<{ id: string; name: string; nationals_placement: number | null }>).map(
    (r) => ({ id: r.id, name: r.name, nationalsPlacement: r.nationals_placement }),
  );
}

export async function listSeasons(): Promise<number[]> {
  const db = await supabase();
  // Distinct seasons via the pre-aggregated RPC. The naive
  // `.select('season')` over usau_events hit supabase-js's 1000-row cap —
  // with ~2000+ event rows ordered season-DESC, only the newest ~2-3 seasons
  // survived the cap, so the dropdown showed only 2024–2026 even though we
  // have data back to 2018. The RPC returns one row per distinct season.
  // Call db.rpc(...) DIRECTLY (bound) — a detached `const rpc = db.rpc` loses
  // `this` and supabase-js reads `this.rest` → "reading 'rest'" TypeError.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rpcDb = db as unknown as { rpc: (fn: string) => Promise<{ data: any; error: unknown }> };
  const { data, error } = await rpcDb.rpc('distinct_usau_seasons');
  if (error) throw error;
  return ((data ?? []) as Array<{ season: number }>)
    .map((r) => r.season)
    .sort((a, b) => b - a);
}

// ─── Teams ─────────────────────────────────────────────────────────────

export interface UsauTeamCard {
  id: string;
  name: string;
  state: string | null;
  city: string | null;
  competitionLevel: string | null;
  genderDivision: string | null;
}

// ─── Players ───────────────────────────────────────────────────────────

export interface UsauPlayerCard {
  id: string;
  displayName: string;
  /** A team this player has been rostered on (deduped); used as a hint. */
  primaryTeam: string | null;
}

export interface UsauPlayerListRow {
  /** Anchor player_id — the one with the most roster rows for this name.
   *  Linking here picks up the full cluster via getPlayerProfile(). */
  id: string;
  displayName: string;
  /** Latest team this player played for. */
  latestTeam: string | null;
  latestTeamId: string | null;
  /** Most recent season we've seen them rostered. */
  latestSeason: number | null;
  /** Number of distinct (team, season) stints — used as an "activity"
   *  proxy until we have real cross-event stats. */
  appearances: number;
  /** Years this player won the Club Nationals championship. Empty if none. */
  championYears: number[];
}

/**
 * Top N USAU players by activity (number of distinct team-season stints).
 * Names are deduped so each human appears once even when the scraper
 * inserted multiple player_ids for them. The returned id is the anchor
 * with the most roster rows (richest profile).
 */
export async function listUsauPlayers(opts?: {
  limit?: number;
  season?: number;
  search?: string;
  /** Restrict to players whose team is in this gender division. */
  genderDivision?: 'Men' | 'Women' | 'Mixed';
  /** Restrict to players whose team is at this competition level (CLUB, MASTERS…). */
  competitionLevel?: CompetitionLevel;
}): Promise<UsauPlayerListRow[]> {
  const limit = opts?.limit ?? 60;
  const db = await supabase();

  // Pull rosters with their team + season. Two strategies:
  //   1. With a search term: narrow at the SQL layer by first finding
  //      matching player_ids (usau_players ilike), then only fetching
  //      THEIR rosters. Cheap even on a 30k-row table — typical search
  //      returns < 100 player_ids and < 500 rosters.
  //   2. Without search: scan rosters in pages of 1000 (Supabase ceiling)
  //      so a > 1k roster table doesn't silently drop entries.
  type RosterRow = {
    player_id: string;
    season: number;
    team_id: string;
    usau_players: { display_name: string } | null;
    usau_teams: { name: string; gender_division: string | null } | null;
  };
  let rows: RosterRow[] = [];

  if (opts?.search && opts.search.trim().length >= 2) {
    const needle = opts.search.trim();
    const pattern = `%${needle.replace(/[%_]/g, '\\$&')}%`;
    // Step 1: matching player_ids. Supabase caps each select at 1000.
    const { data: matches, error: pErr } = await db
      .from('usau_players')
      .select('id')
      .ilike('display_name', pattern)
      .limit(1000);
    if (pErr) throw pErr;
    const matchIds = (matches ?? []).map((m) => m.id);
    if (matchIds.length === 0) return [];

    // Step 2: rosters for those player_ids. Page in 1000 chunks (Supabase
    // ".in()" has a similar ceiling).
    const CHUNK = 500;
    for (let i = 0; i < matchIds.length; i += CHUNK) {
      const slice = matchIds.slice(i, i + CHUNK);
      let q = db
        .from('usau_rosters')
        .select(
          'player_id, season, team_id, usau_players(display_name), usau_teams!inner(name, gender_division)',
        )
        .in('player_id', slice);
      if (opts?.season != null) q = q.eq('season', opts.season);
      if (opts?.genderDivision) {
        q = q.eq('usau_teams.gender_division', opts.genderDivision);
      }
      if (opts?.competitionLevel) {
        q = q.eq('usau_teams.competition_level', opts.competitionLevel);
      }
      const { data, error } = await q;
      if (error) throw error;
      rows = rows.concat((data ?? []) as unknown as RosterRow[]);
    }
  } else {
    const PAGE = 1000;
    let from = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      let q = db
        .from('usau_rosters')
        .select(
          'player_id, season, team_id, usau_players(display_name), usau_teams!inner(name, gender_division)',
        )
        .range(from, from + PAGE - 1);
      if (opts?.season != null) q = q.eq('season', opts.season);
      if (opts?.genderDivision) {
        q = q.eq('usau_teams.gender_division', opts.genderDivision);
      }
      if (opts?.competitionLevel) {
        q = q.eq('usau_teams.competition_level', opts.competitionLevel);
      }
      const { data, error } = await q;
      if (error) throw error;
      const page = (data ?? []) as unknown as RosterRow[];
      rows = rows.concat(page);
      if (page.length < PAGE) break;
      from += PAGE;
      if (from > 200_000) break;
    }
  }

  type Row = RosterRow;

  // Fetch champion map once so we can tag list rows in the same loop.
  // The champion source is Club Nationals, so only tag when we're listing
  // Club (or unfiltered) players — a Masters/College team that happens to
  // share a club champion's name must not inherit the badge.
  const isClubScope = !opts?.competitionLevel || opts.competitionLevel === 'CLUB';
  const championsBySeason = isClubScope
    ? await getUsauClubChampionsBySeason().catch(
        () => new Map<number, Map<string, UsauChampion>>(),
      )
    : new Map<number, Map<string, UsauChampion>>();

  // Group by lowercased name → aggregate stats across player_id dupes.
  interface Agg {
    anchorId: string;
    anchorCount: number;
    displayName: string;
    latestSeason: number | null;
    latestTeam: string | null;
    latestTeamId: string | null;
    appearances: number;
    perPlayerCount: Map<string, number>;
    championYears: Set<number>;
  }
  const byName = new Map<string, Agg>();
  for (const r of (rows ?? []) as unknown as Row[]) {
    const name = r.usau_players?.display_name;
    if (!name) continue;
    const key = name.toLowerCase();
    // Look up the (season, division) champion — same Nationals event
    // has separate Men/Women/Mixed finals, so we need both keys.
    const div = r.usau_teams?.gender_division ?? null;
    const champ = div ? championsBySeason.get(r.season)?.get(div) : null;
    const isChampStint = !!champ && champ.teamId === r.team_id;
    const existing = byName.get(key);
    if (!existing) {
      const ppc = new Map<string, number>([[r.player_id, 1]]);
      const cy = new Set<number>();
      if (isChampStint) cy.add(r.season);
      byName.set(key, {
        anchorId: r.player_id,
        anchorCount: 1,
        displayName: name,
        latestSeason: r.season,
        latestTeam: r.usau_teams?.name ?? null,
        latestTeamId: r.team_id,
        appearances: 1,
        perPlayerCount: ppc,
        championYears: cy,
      });
    } else {
      const ppc = existing.perPlayerCount;
      const next = (ppc.get(r.player_id) ?? 0) + 1;
      ppc.set(r.player_id, next);
      if (next > existing.anchorCount) {
        existing.anchorCount = next;
        existing.anchorId = r.player_id;
      }
      if (existing.latestSeason == null || r.season > existing.latestSeason) {
        existing.latestSeason = r.season;
        existing.latestTeam = r.usau_teams?.name ?? null;
        existing.latestTeamId = r.team_id;
      }
      existing.appearances += 1;
      if (isChampStint) existing.championYears.add(r.season);
    }
  }

  // Note: when opts.search was provided, the SQL pass above already
  // filtered rosters to just matching player_ids, so no JS filter needed.
  const entries = Array.from(byName.values());

  entries.sort((a, b) => {
    // Prefer most-recently-active first, then by total appearances.
    const sa = a.latestSeason ?? 0;
    const sb = b.latestSeason ?? 0;
    if (sa !== sb) return sb - sa;
    return b.appearances - a.appearances;
  });

  return entries.slice(0, limit).map((e) => ({
    id: e.anchorId,
    displayName: e.displayName,
    latestTeam: e.latestTeam,
    latestTeamId: e.latestTeamId,
    latestSeason: e.latestSeason,
    appearances: e.appearances,
    championYears: Array.from(e.championYears).sort((a, b) => b - a),
  }));
}

// ─── Search ────────────────────────────────────────────────────────────

// SearchResult + resultHref live in ./search-nav (no supabase dependency) so
// the global nav search components can import them without pulling this whole
// data layer + supabase-js into the client bundle. Imported here for internal
// use (the search() query builds SearchResult[]) and re-exported for the
// server-side consumers that already import them from this module.
import { resultHref } from './search-nav';
import type { SearchResult } from './search-nav';
export { resultHref };
export type { SearchResult };

/** Prominence weight for a USAU team (higher = more prominent), from its
 *  competition level AND name. Adult club > college > youth. Many youth teams
 *  are mis-tagged as competition_level='CLUB' in the source data (e.g.
 *  "Colorado Cutthroat U-20 Boys", "... Academy", "Youth Club"), so we also
 *  detect youth markers in the NAME and demote them — otherwise a query like
 *  "Colorado" buries real clubs under U-17/U-20/Academy noise. We demote (not
 *  drop) youth so they still appear, just below senior teams. */
const YOUTH_NAME_RE = /\b(u-?\d{2}|under[- ]?\d{2}|youth|academy|middle school|high school|boys|girls|hs|ms)\b/i;
export function usauTeamProminence(name: string, level: string | null | undefined): number {
  if (YOUTH_NAME_RE.test(name)) return 0; // youth-by-name — lowest, below everything
  switch (level) {
    case 'CLUB':
    case 'MASTERS':
    case 'GRAND_MASTERS':
      return 3; // adult club — most prominent
    case 'COLLEGE_D1':
    case 'COLLEGE_D3':
      return 2; // college
    default:
      return 1; // HS / MS / beach / other
  }
}

/**
 * One-shot text search across teams + players. Short-circuits on very
 * short queries (UI debounces but we still want a low floor).
 *
 * Dedupe behavior:
 *   - Teams: collapse by lowercased name + competition_level. The schema
 *     currently has one team row per event-participation (so "Revolver"
 *     appears 4 times if it played 4 events). The UI wants one card per
 *     canonical team, so we group here and pick the first row's UUID as
 *     the link target. Real fix is a canonical-team merge job; this is
 *     query-time good enough until then.
 *   - Players: collapse by lowercased display_name. Same rationale —
 *     same human on two different teams is currently two rows, but the
 *     search dropdown should show one entry that opens the unified
 *     profile.
 *
 * Uses Postgres ILIKE — fine at our current scale (220 teams, 5k
 * players). Swap in a tsvector + GIN index when we grow past ~50k rows.
 */
/** Compact date range for search hints, e.g. "Jun 13–14" or "Jun 28".
 *  Input is ISO yyyy-mm-dd (date-only); parse as UTC to avoid tz drift. */
function formatEventDateRange(start: string | null, end: string | null): string | null {
  if (!start) return null;
  const fmt = (iso: string) =>
    new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  const s = fmt(start);
  if (!end || end === start) return s;
  // Same month → "Jun 13–14"; else full "Jun 28 – Jul 1".
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  const e = sameMonth
    ? new Date(end + 'T00:00:00Z').toLocaleDateString('en-US', { day: 'numeric', timeZone: 'UTC' })
    : fmt(end);
  return `${s}–${e}`;
}

export async function search(query: string, limit = 8): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  // Pull a generous N from each side (3x the display limit) so dedupe
  // doesn't starve us — if "Revolver" returns 4 rows we still want 6
  // distinct teams in the dropdown.
  const overshoot = limit * 3;
  const db = await supabase();
  // Fuzzy (trigram) search via RPCs — tolerant of typos + word reordering,
  // ranked by similarity server-side. Falls back to substring matches too
  // (the RPC ORs ilike with word_similarity).
  // The new fuzzy RPCs aren't in the generated database.types.ts yet, so the
  // typed client rejects the names + return types — cast the client to a loose
  // rpc surface for these three calls.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rpc = (db as any).rpc.bind(db);
  const [teamRes, playerRes, eventRes] = await Promise.all([
    rpc('search_usau_teams_fuzzy', { q, lim: overshoot }),
    rpc('search_usau_players_fuzzy', { q, lim: overshoot }),
    rpc('search_usau_events_fuzzy', { q, lim: overshoot }),
  ]);

  type TeamRow = { id: string; name: string; state: string | null; competition_level: string | null; gender_division: string | null };
  type PlayerRow = { id: string; display_name: string };
  type EventRow = { usau_slug: string; name: string; season: number; start_date: string | null; end_date: string | null };

  // ── Dedupe teams by (lower(name), competition_level) ─────────────────
  // RPC returns rows already ranked by score; first occurrence wins.
  const teamMap = new Map<string, SearchResult>();
  for (const t of (teamRes.data ?? []) as TeamRow[]) {
    const key = `${t.name.toLowerCase()}${t.competition_level ?? ''}`;
    if (teamMap.has(key)) continue;
    const hintParts = [t.state, t.competition_level].filter(Boolean) as string[];
    teamMap.set(key, {
      kind: 'team',
      id: t.id,
      name: t.name,
      hint: hintParts.join(' · ') || null,
      league: 'usau',
      logoUrl: usauTeamLogo(t.name, t.gender_division, t.competition_level),
      prominence: usauTeamProminence(t.name, t.competition_level),
    });
  }

  // ── Dedupe players by lower(display_name) ────────────────────────────
  // The fuzzy player RPC omits the roster team (keeps it a cheap single-table
  // scan); the profile page shows career detail, so a null hint here is fine.
  const playerMap = new Map<string, SearchResult>();
  for (const p of (playerRes.data ?? []) as PlayerRow[]) {
    const key = p.display_name.toLowerCase();
    if (playerMap.has(key)) continue;
    playerMap.set(key, {
      kind: 'player',
      id: p.id,
      name: p.display_name,
      hint: null,
      league: 'usau',
    });
  }

  // ── Tournaments: keyed by usau_slug (unique per event). Hint = season +
  //    date range; the route uses the slug, not a UUID. ──────────────────────
  const tournamentMap = new Map<string, SearchResult>();
  for (const ev of (eventRes.data ?? []) as EventRow[]) {
    if (tournamentMap.has(ev.usau_slug)) continue;
    const dates = formatEventDateRange(ev.start_date, ev.end_date);
    const hintParts = [String(ev.season), dates].filter(Boolean) as string[];
    tournamentMap.set(ev.usau_slug, {
      kind: 'tournament',
      id: ev.usau_slug,
      name: ev.name,
      hint: hintParts.join(' · ') || null,
      flight: flightForName(ev.name),
      league: 'usau',
    });
  }

  const results: SearchResult[] = [
    ...teamMap.values(),
    ...playerMap.values(),
    ...tournamentMap.values(),
  ];

  // Prefix matches first, then alphabetical.
  const lower = q.toLowerCase();
  results.sort((a, b) => {
    const ap = a.name.toLowerCase().startsWith(lower) ? 0 : 1;
    const bp = b.name.toLowerCase().startsWith(lower) ? 0 : 1;
    if (ap !== bp) return ap - bp;
    return a.name.localeCompare(b.name);
  });

  return results.slice(0, limit * 2);
}

// ─── Detail pages: team / player / event ───────────────────────────────

export interface UsauPlayerSummary {
  id: string;
  displayName: string;
  /** Every distinct team this human (matched by lowercased name) has been on,
   *  with the events they played at on that team. */
  teamHistory: Array<{
    teamId: string;
    teamName: string;
    /** "Men" | "Women" | "Mixed" — passed through from usau_teams.gender_division.
     *  Required by UsauTeamLogo for accurate logo resolution (Men's vs Women's
     *  teams can share the same slug, e.g. "phoenix"). Null when unknown. */
    genderDivision: string | null;
    /** usau_teams.competition_level (e.g. "CLUB", "COLLEGE_D1"). Lets UsauTeamLogo
     *  resolve college crests from the College/ namespace. Null when unknown. */
    competitionLevel: string | null;
    season: number;
    jerseyNumber: string | null;
    /** True if this team won the Club Nationals championship that season. */
    isChampion: boolean;
    events: Array<{
      slug: string;
      name: string;
      season: number;
      startDate: string | null;
      goals: number | null;
      assists: number | null;
      seed: number | null;
      pool: string | null;
    }>;
  }>;
  /** Years this player won the USAU Club National Championship. */
  championYears: number[];
  /** US state postal codes this cluster's SERIES play maps to, derived from the
   *  section/region words in its Sectional/Regional event names (e.g. "Rocky
   *  Mountain" → CO). Used for cross-league pro-career attribution when a name
   *  splits into multiple people. Empty when no series region is recognized. */
  homeStates: string[];
}

/**
 * Build a player profile for the given USAU player id. We look up the
 * row's display name, then UNION across every player row whose
 * lowercased display name matches — that's the v1 cross-team identity.
 *
 * Known limitation: two real humans with the same exact name will merge
 * into one profile. We accept that for v1 (estimated < 2% collision rate
 * on the current dataset). Real fix is a `usau_canonical_players` +
 * `usau_player_identity_links` schema with auto-merge scoring (jersey
 * streak, roster overlap, geo, timeline) and a manual override table.
 * Design doc: ~/.claude/projects/<...>/memory/project_usau_player_identity.md
 */
export async function getPlayerProfile(playerId: string): Promise<UsauPlayerSummary | null> {
  const db = await supabase();
  const { data: anchor, error: anchorErr } = await db
    .from('usau_players')
    .select('id, display_name')
    .eq('id', playerId)
    .maybeSingle();
  if (anchorErr) throw anchorErr;
  if (!anchor) return null;

  // Identity rule (v1): merge every row with the same lowercased name,
  // EXCEPT split when two rows share a season but list different teams
  // (one human cannot roster on two club teams in the same season).
  const { data: namesakes } = await db
    .from('usau_players')
    .select('id, display_name')
    .ilike('display_name', anchor.display_name);
  const candidateIds = (namesakes ?? [])
    .filter((p) => p.display_name.toLowerCase() === anchor.display_name.toLowerCase())
    .map((p) => p.id);

  if (candidateIds.length === 0) {
    return { id: anchor.id, displayName: anchor.display_name, teamHistory: [], championYears: [], homeStates: [] };
  }

  // Pull rosters for ALL candidates so we can compute the cluster.
  // gender_division is needed downstream to look up the right (season,
  // division) champion since 3 divisions share the same Nationals event.
  const { data: candidateRosters } = await db
    .from('usau_rosters')
    .select('player_id, team_id, season, jersey_number, usau_teams(name, gender_division, competition_level)')
    .in('player_id', candidateIds);

  // For the identity conflict rule we need to know which candidate TEAMS played
  // a QUALIFYING event (official series or a marquee tournament). Fetch the
  // events for every candidate team_id and mark the teams that qualify.
  const candTeamIds = Array.from(new Set((candidateRosters ?? []).map((r) => r.team_id)));
  const qualifyingTeamIds = new Set<string>();
  if (candTeamIds.length > 0) {
    const { data: candEventRows } = await db
      .from('usau_event_teams')
      .select('team_id, usau_events(name)')
      .in('team_id', candTeamIds);
    for (const row of candEventRows ?? []) {
      const ev = (row as { usau_events: { name: string } | null }).usau_events;
      if (ev && isQualifyingSeriesEvent(ev.name)) qualifyingTeamIds.add((row as { team_id: string }).team_id);
    }
  }

  // Union-find over same-named player rows → one connected component per human.
  //
  // CONFLICT rule (what BLOCKS a merge → keeps two profiles separate). Two rows
  // conflict iff ALL of:
  //   1. same season, AND
  //   2. same competition TRACK (Club / College-D1 / College-D3), AND
  //   3. different team identity, AND
  //   4. BOTH teams played a QUALIFYING event that season (official series —
  //      Sectionals/Regionals/Nationals — or a marquee tournament like TCT Pro
  //      Championships / U.S. Open, where no one guests).
  //
  // Rationale:
  //   • A team commits to ONE series path per season per track, so two DIFFERENT
  //     teams both in official series (same track, same year) can't be one human
  //     → different people. This is the reliable split signal (e.g. two "Thomas
  //     Brewster"s: one on Thunderpants at Mixed Sectionals, one on shame. at
  //     Mixed Regionals+Nationals, same 2024 Mixed track → split).
  //   • Cross-track (college + club + masters same year) is NORMAL for one human
  //     → never conflicts (e.g. Zeke Thoreson: college Colorado + club Bravo).
  //   • Guesting at a NON-qualifying "fun" event for another team is NOT a split
  //     signal → if either team's only appearance is a minor event, no conflict
  //     (default to same person).
  //
  // Team identity is the tuple (name+gender+level), NOT the per-event team_id:
  // the scraper writes a separate team_id per event (Regionals vs Nationals are
  // different team_ids for the same team), so comparing raw team_id would
  // falsely conflict a player's own Regionals + Nationals rows. usau_team_id is
  // unpopulated, so the identity tuple is the reliable key.
  const parent = new Map<string, string>();
  candidateIds.forEach((id) => parent.set(id, id));
  const find = (x: string): string => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)!)!);
      x = parent.get(x)!;
    }
    return x;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  // Competition TRACK from a team's level. College D1/D3 are distinct tracks;
  // everything else (CLUB, plus Masters which folds into CLUB at team level) is
  // the "club" track. Masters-vs-open within a season is not distinguishable at
  // the team level (both CLUB) — an accepted limitation.
  const trackOf = (level: string): string =>
    level === 'COLLEGE_D1' || level === 'COLLEGE_D3' ? level : 'CLUB';
  const teamMeta = (r: {
    team_id: string;
    usau_teams?: { name?: string | null; gender_division?: string | null; competition_level?: string | null } | null;
  }): { track: string; identity: string; qualifying: boolean } => {
    const t = r.usau_teams;
    const level = t?.competition_level ?? '';
    const identity = [(t?.name ?? '').toLowerCase(), t?.gender_division ?? '', level].join('|');
    return { track: trackOf(level), identity, qualifying: qualifyingTeamIds.has(r.team_id) };
  };
  const rostersByPlayer = new Map<
    string,
    Array<{ season: number; track: string; identity: string; qualifying: boolean }>
  >();
  for (const r of candidateRosters ?? []) {
    if (!rostersByPlayer.has(r.player_id)) rostersByPlayer.set(r.player_id, []);
    const { track, identity, qualifying } = teamMeta(r as never);
    rostersByPlayer.get(r.player_id)!.push({ season: r.season, track, identity, qualifying });
  }
  for (let i = 0; i < candidateIds.length; i++) {
    for (let j = i + 1; j < candidateIds.length; j++) {
      const ra = rostersByPlayer.get(candidateIds[i]) ?? [];
      const rb = rostersByPlayer.get(candidateIds[j]) ?? [];
      let conflict = false;
      outer: for (const sa of ra) {
        for (const sb of rb) {
          if (
            sa.season === sb.season &&
            sa.track === sb.track &&
            sa.identity !== sb.identity &&
            sa.qualifying &&
            sb.qualifying
          ) {
            conflict = true;
            break outer;
          }
        }
      }
      if (!conflict) union(candidateIds[i], candidateIds[j]);
    }
  }
  const anchorCluster = find(anchor.id);
  const playerIds = candidateIds.filter((id) => find(id) === anchorCluster);
  const clusterRosters = (candidateRosters ?? []).filter((r) => playerIds.includes(r.player_id));

  // Stats only need this cluster's player ids.
  const { data: statsData } = await db
    .from('usau_player_event_stats')
    .select('player_id, event_id, team_id, goals, assists')
    .in('player_id', playerIds);
  const rosterRes = { data: clusterRosters };
  const statsRes = { data: statsData };

  const teamIds = Array.from(new Set((rosterRes.data ?? []).map((r) => r.team_id)));
  interface ParticipationRow {
    team_id: string;
    event_id: string;
    seed: number | null;
    pool: string | null;
    usau_events: { usau_slug: string; name: string; season: number; start_date: string | null } | null;
  }
  let participationRows: ParticipationRow[] = [];
  if (teamIds.length > 0) {
    const { data } = await db
      .from('usau_event_teams')
      .select('team_id, event_id, seed, pool, usau_events(usau_slug, name, season, start_date)')
      .in('team_id', teamIds);
    participationRows = (data ?? []) as unknown as ParticipationRow[];
  }

  // Build maps for the join.
  const eventsByTeamId = new Map<string, ParticipationRow[]>();
  for (const row of participationRows) {
    if (!eventsByTeamId.has(row.team_id)) eventsByTeamId.set(row.team_id, []);
    eventsByTeamId.get(row.team_id)!.push(row);
  }
  const statsByEvent = new Map<string, { goals: number; assists: number }>();
  for (const s of statsRes.data ?? []) {
    const prev = statsByEvent.get(s.event_id) ?? { goals: 0, assists: 0 };
    statsByEvent.set(s.event_id, {
      goals: prev.goals + (s.goals ?? 0),
      assists: prev.assists + (s.assists ?? 0),
    });
  }

  // Dedupe team-seasons into one stint per real-world team+season.
  //
  // A team like "Colorado" plays several events per season (Regionals →
  // Nationals), and the scraper writes a SEPARATE per-event usau_teams row for
  // each participation (distinct team_id). Grouping by team_id therefore split
  // one team-season into multiple cards. The persistent usau_team_id column is
  // not populated yet, so we key on the stable identity tuple instead:
  //   name + gender_division + competition_level + season
  // This correctly (a) merges a team's Regionals + Nationals + Sectionals into
  // one stint, while (b) keeping Men's vs Women's (gender_division) and
  // college vs club "Colorado" (competition_level) as distinct stints.
  //
  // Because one stint now spans multiple per-event team_ids, we track them in
  // a Set so the events + champion passes below can look up every participation.
  type Stint = UsauPlayerSummary['teamHistory'][number] & { _teamIds: Set<string> };
  const stintMap = new Map<string, Stint>();
  for (const r of rosterRes.data ?? []) {
    const teamRel = (
      r as { usau_teams: { name: string; gender_division: string | null; competition_level: string | null } | null }
    ).usau_teams;
    const teamName = teamRel?.name ?? 'Unknown team';
    const genderDivision = teamRel?.gender_division ?? null;
    const level = teamRel?.competition_level ?? '';
    const key = [teamName.toLowerCase(), genderDivision ?? '', level, r.season].join('|');
    const existing = stintMap.get(key);
    if (!existing) {
      stintMap.set(key, {
        teamId: r.team_id,
        teamName,
        genderDivision,
        competitionLevel: level || null,
        season: r.season,
        jerseyNumber: r.jersey_number,
        isChampion: false,
        events: [],
        _teamIds: new Set([r.team_id]),
      });
    } else {
      existing._teamIds.add(r.team_id);
      if (!existing.jerseyNumber && r.jersey_number) existing.jerseyNumber = r.jersey_number;
    }
  }

  for (const stint of stintMap.values()) {
    const seenEvents = new Set<string>();
    const events: typeof stint.events = [];
    // The stint spans every per-event team_id for this team+season, so gather
    // participations across all of them (dedup by event_id).
    const participations = [...stint._teamIds].flatMap((tid) => eventsByTeamId.get(tid) ?? []);
    for (const p of participations) {
      const ev = (p as { usau_events: { usau_slug: string; name: string; season: number; start_date: string | null } | null }).usau_events;
      if (!ev || ev.season !== stint.season) continue;
      if (seenEvents.has(p.event_id)) continue;
      seenEvents.add(p.event_id);
      const stats = statsByEvent.get(p.event_id);
      events.push({
        slug: ev.usau_slug,
        name: ev.name,
        season: ev.season,
        startDate: ev.start_date,
        goals: stats?.goals ?? null,
        assists: stats?.assists ?? null,
        seed: p.seed,
        pool: p.pool,
      });
    }
    events.sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''));
    stint.events = events;
  }

  const teamHistoryStints = Array.from(stintMap.values()).sort(
    (a, b) => b.season - a.season || a.teamName.localeCompare(b.teamName),
  );

  // Mark championship stints. Champions are keyed (season → division →
  // winner) since one Nationals event has separate Men/Women/Mixed
  // finals. We pull the stint's team's gender_division and look up the
  // matching division's winner for that year.
  const champions = await getUsauClubChampionsBySeason().catch(
    () => new Map<number, Map<string, UsauChampion>>(),
  );
  // Build a fast (team_id → division) lookup from the rosters we
  // already have, so we don't re-query.
  const divisionByTeamId = new Map<string, string>();
  for (const r of clusterRosters) {
    const tr = (r as { usau_teams: { gender_division: string | null } | null }).usau_teams;
    if (tr?.gender_division) divisionByTeamId.set(r.team_id, tr.gender_division);
  }
  const championYears: number[] = [];
  for (const stint of teamHistoryStints) {
    // The stint spans multiple per-event team_ids; it's a champion if ANY of
    // them is the season's division winner (the title is won at Nationals,
    // which is one of the stint's participations).
    const ids = stint._teamIds;
    let isChamp = false;
    for (const tid of ids) {
      const div = divisionByTeamId.get(tid);
      const champ = div ? champions.get(stint.season)?.get(div) : null;
      if (champ && champ.teamId === tid) {
        isChamp = true;
        break;
      }
    }
    if (isChamp) {
      stint.isChampion = true;
      championYears.push(stint.season);
    }
  }
  championYears.sort((a, b) => b - a);

  // Strip the internal _teamIds set from the wire shape.
  const teamHistory = teamHistoryStints.map(({ _teamIds, ...stint }) => {
    void _teamIds;
    return stint;
  });

  // Home states: union of the state-sets implied by this cluster's SERIES
  // event names (Sectionals/Regionals). Drives cross-league pro attribution.
  const homeStatesSet = new Set<string>();
  for (const stint of teamHistory) {
    for (const ev of stint.events) {
      for (const st of statesForEventName(ev.name)) homeStatesSet.add(st);
    }
  }

  return {
    id: anchor.id,
    displayName: anchor.display_name,
    teamHistory,
    championYears,
    homeStates: [...homeStatesSet],
  };
}

export interface UsauTeamSummary {
  id: string;
  name: string;
  state: string | null;
  competitionLevel: string | null;
  genderDivision: string | null;
  /**
   * One entry per season this team has played, newest first. Within
   * each season the events are sorted by date (newest first) and the
   * roster is deduped by (player_name, jersey_number) so the same human
   * isn't listed multiple times when the scraper wrote them under
   * multiple player_ids.
   */
  seasons: Array<{
    season: number;
    events: Array<{
      slug: string;
      name: string;
      startDate: string | null;
      seed: number | null;
      pool: string | null;
      finalPlacement: number | null;
    }>;
    roster: Array<{
      playerId: string;
      name: string;
      jerseyNumber: string | null;
    }>;
  }>;
}

export async function getTeam(teamId: string): Promise<UsauTeamSummary | null> {
  const db = await supabase();
  const { data: anchor, error } = await db
    .from('usau_teams')
    .select('id, name, state, competition_level, gender_division')
    .eq('id', teamId)
    .maybeSingle();
  if (error) throw error;
  if (!anchor) return null;

  // Cluster team rows: the scraper writes one usau_teams row per
  // (name, season) instead of one canonical row, so "Johnny Bravo"
  // shows up as 5 separate ids (one per year). Treat any team with the
  // same name + competition_level + gender_division as the same team.
  const { data: clusterTeams } = await db
    .from('usau_teams')
    .select('id, name, state, competition_level, gender_division')
    .ilike('name', anchor.name);
  const teamIds = (clusterTeams ?? [])
    .filter(
      (t) =>
        t.name.toLowerCase() === anchor.name.toLowerCase() &&
        t.competition_level === anchor.competition_level &&
        t.gender_division === anchor.gender_division,
    )
    .map((t) => t.id);
  if (teamIds.length === 0) teamIds.push(anchor.id);

  const [partRes, rosterRes] = await Promise.all([
    db
      .from('usau_event_teams')
      .select('team_id, event_id, seed, pool, final_placement, usau_events(usau_slug, name, season, start_date)')
      .in('team_id', teamIds),
    db
      .from('usau_rosters')
      .select('player_id, team_id, season, jersey_number, usau_players(display_name)')
      .in('team_id', teamIds),
  ]);

  interface PartRow {
    team_id: string;
    event_id: string;
    seed: number | null;
    pool: string | null;
    final_placement: number | null;
    usau_events: { usau_slug: string; name: string; season: number; start_date: string | null } | null;
  }
  interface RosterRow {
    player_id: string;
    team_id: string;
    season: number;
    jersey_number: string | null;
    usau_players: { display_name: string } | null;
  }

  // Group by season.
  const eventsBySeason = new Map<number, UsauTeamSummary['seasons'][number]['events']>();
  const seenEventBySeason = new Map<number, Set<string>>();
  for (const p of (partRes.data ?? []) as unknown as PartRow[]) {
    const ev = p.usau_events;
    if (!ev) continue;
    const seenSet = seenEventBySeason.get(ev.season) ?? new Set<string>();
    if (seenSet.has(p.event_id)) continue;
    seenSet.add(p.event_id);
    seenEventBySeason.set(ev.season, seenSet);
    if (!eventsBySeason.has(ev.season)) eventsBySeason.set(ev.season, []);
    eventsBySeason.get(ev.season)!.push({
      slug: ev.usau_slug,
      name: ev.name,
      startDate: ev.start_date,
      seed: p.seed,
      pool: p.pool,
      finalPlacement: p.final_placement,
    });
  }

  // Roster: dedupe by (season, lowercased name, jersey). When the same
  // human shows up under multiple player_ids in the same season we keep
  // the first one we see — same caveat as the player profile clustering.
  const rosterBySeason = new Map<
    number,
    Map<string, UsauTeamSummary['seasons'][number]['roster'][number]>
  >();
  for (const r of (rosterRes.data ?? []) as unknown as RosterRow[]) {
    const player = r.usau_players;
    if (!player) continue;
    const key = `${player.display_name.toLowerCase()}|${(r.jersey_number ?? '').trim()}`;
    if (!rosterBySeason.has(r.season)) rosterBySeason.set(r.season, new Map());
    const seasonMap = rosterBySeason.get(r.season)!;
    if (!seasonMap.has(key)) {
      seasonMap.set(key, {
        playerId: r.player_id,
        name: player.display_name,
        jerseyNumber: r.jersey_number,
      });
    }
  }

  // Assemble seasons.
  const allSeasons = new Set<number>();
  for (const s of eventsBySeason.keys()) allSeasons.add(s);
  for (const s of rosterBySeason.keys()) allSeasons.add(s);
  const seasons = Array.from(allSeasons)
    .sort((a, b) => b - a)
    .map((season) => {
      const events = (eventsBySeason.get(season) ?? []).slice().sort((a, b) =>
        (b.startDate ?? '').localeCompare(a.startDate ?? ''),
      );
      const roster = Array.from(rosterBySeason.get(season)?.values() ?? []).sort((a, b) => {
        const jersey = (s: string | null) => (s != null ? parseInt(s, 10) : 999);
        const ja = jersey(a.jerseyNumber);
        const jb = jersey(b.jerseyNumber);
        if (!isNaN(ja) && !isNaN(jb) && ja !== jb) return ja - jb;
        return a.name.localeCompare(b.name);
      });
      return { season, events, roster };
    });

  return {
    id: anchor.id,
    name: anchor.name,
    state: anchor.state,
    competitionLevel: anchor.competition_level,
    genderDivision: anchor.gender_division,
    seasons,
  };
}

export interface UsauEventSummary {
  id: string;
  slug: string;
  name: string;
  season: number;
  startDate: string | null;
  endDate: string | null;
  city: string | null;
  state: string | null;
  competitionLevel: string;
  /** Canonical USAU event page URL, for the "View on USAU" link. */
  url: string | null;
  /** Curated Triple Crown Tour flight (derived from the name), or null. */
  flight: Flight | null;
  teams: Array<{
    teamId: string;
    teamName: string;
    seed: number | null;
    pool: string | null;
    finalPlacement: number | null;
    /** "Men" | "Women" | "Mixed" | "Open" — used to split mixed-gender events
     *  like College Championships into separate Men's/Women's brackets. */
    genderDivision: string | null;
    /** The TEAM's competition level ("MASTERS" | "GRAND_MASTERS" | …).
     *  Combined masters championships host both levels in ONE event, with
     *  each team tagged per-group — this is what lets the event page split
     *  a Masters Men bracket from a GM Men bracket. */
    competitionLevel: string | null;
  }>;
  games: Array<{
    id: string;
    round: string;
    bracketName: string | null;
    teamAId: string | null;
    teamAName: string | null;
    teamBId: string | null;
    teamBName: string | null;
    seedA: number | null;
    seedB: number | null;
    scoreA: number | null;
    scoreB: number | null;
    location: string | null;
    scheduledAt: string | null;
    status: string;
  }>;
}

export async function getEvent(slug: string): Promise<UsauEventSummary | null> {
  const db = await supabase();
  // Case-INSENSITIVE slug match. USAU slugs are canonically lowercase, but the
  // HTML pipeline historically stored some mixed-case (e.g. "Glazed-Daze-2026")
  // and a later ultirzr re-ingest normalizes them to lowercase — which would
  // 404 any link built from the old casing. ilike keeps both forms working.
  // Slugs are unique case-insensitively, so maybeSingle() stays correct.
  // Escape LIKE metacharacters so a slug can't act as a wildcard pattern.
  const slugPattern = slug.replace(/[%_\\]/g, (c) => `\\${c}`);
  const { data: event, error } = await db
    .from('usau_events')
    .select('id, usau_slug, name, season, start_date, end_date, city, state, competition_level, url')
    .ilike('usau_slug', slugPattern)
    .maybeSingle();
  if (error) throw error;
  if (!event) return null;

  const [partRes, gameRes] = await Promise.all([
    db
      .from('usau_event_teams')
      .select('team_id, seed, pool, final_placement, usau_teams(name, gender_division, competition_level)')
      .eq('event_id', event.id),
    db
      .from('usau_games')
      .select(
        // usau_games has two FKs to usau_teams (team_a + team_b), so we
        // hint PostgREST with the !<columnName> syntax to disambiguate.
        `id, round, bracket_name, team_a_id, team_b_id,
         seed_a, seed_b, score_a, score_b, location, scheduled_at, status,
         team_a:usau_teams!team_a_id(name),
         team_b:usau_teams!team_b_id(name)`,
      )
      .eq('event_id', event.id),
  ]);

  const teams = (partRes.data ?? []).map((p) => {
    const t = (p as { usau_teams: { name: string; gender_division: string | null; competition_level: string | null } | null }).usau_teams;
    return {
      teamId: p.team_id,
      teamName: t?.name ?? 'Unknown',
      seed: p.seed,
      pool: p.pool,
      finalPlacement: p.final_placement,
      genderDivision: t?.gender_division ?? null,
      competitionLevel: t?.competition_level ?? null,
    };
  });

  const games = (gameRes.data ?? []).map((g) => {
    const ta = (g as { team_a: { name: string } | null }).team_a;
    const tb = (g as { team_b: { name: string } | null }).team_b;
    return {
      id: g.id,
      round: g.round,
      bracketName: g.bracket_name,
      teamAId: g.team_a_id,
      teamAName: ta?.name ?? null,
      teamBId: g.team_b_id,
      teamBName: tb?.name ?? null,
      seedA: g.seed_a,
      seedB: g.seed_b,
      scoreA: g.score_a,
      scoreB: g.score_b,
      location: g.location,
      scheduledAt: g.scheduled_at,
      status: g.status,
    };
  });

  return {
    id: event.id,
    slug: event.usau_slug,
    name: event.name,
    season: event.season,
    startDate: event.start_date,
    endDate: event.end_date,
    city: event.city,
    state: event.state,
    competitionLevel: event.competition_level,
    url: event.url ?? null,
    flight: flightForName(event.name),
    teams,
    games,
  };
}

/** Quick test: is this id a USAU UUID (vs a UFA player slug like "cdykes")? */
export function looksLikeUsauUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

// ─── Ranked team lists ─────────────────────────────────────────────────

// ─── Official USAU rankings (scraped weekly) ──────────────────────────────
// USAU publishes an official weekly power-rating Top-20 per division. We
// scrape it into usau_rankings (see sync-usau-rankings Edge Function) and read
// the latest week here. Only these 5 RankSets are published (no D-III / Masters
// on the rankings page), so listOfficialUsauRankings supports exactly them.

export interface OfficialRankedTeam {
  /** usau_teams.id — links to the team profile / logo. Null when the ranked
   *  team couldn't be confidently matched to a usau_teams row (we still show
   *  the team by name; there's just no profile link/logo). */
  id: string | null;
  name: string;
  state: string | null;
  region: string | null;
  rank: number;
  rating: number | null;
  wins: number | null;
  losses: number | null;
}

/** RankSet keys used by usau_rankings.division + the scraper. */
type OfficialRankDivision =
  | 'Club-Men'
  | 'Club-Women'
  | 'Club-Mixed'
  | 'College-Men'
  | 'College-Women';

/** Map a (competitionLevel, genderDivision) to its published RankSet, or null
 *  if USAU doesn't publish rankings for that combination (D-III, Masters, etc.). */
export function officialRankSetFor(
  competitionLevel: string | null | undefined,
  genderDivision: string | null | undefined,
): OfficialRankDivision | null {
  const g = genderDivision;
  if (competitionLevel === 'CLUB') {
    if (g === 'Men') return 'Club-Men';
    if (g === 'Women') return 'Club-Women';
    if (g === 'Mixed') return 'Club-Mixed';
  }
  if (competitionLevel === 'COLLEGE_D1') {
    if (g === 'Men') return 'College-Men';
    if (g === 'Women') return 'College-Women';
  }
  return null;
}

/**
 * The latest official USAU ranking for one division, top N (default 16),
 * joined to usau_teams. Reads the most-recent (season, week) present in
 * usau_rankings for that RankSet. Returns an empty array when we haven't
 * scraped that division yet (so callers can fall back to seed-ordering).
 */
export async function listOfficialUsauRankings(
  division: OfficialRankDivision,
  limit = 16,
): Promise<{ season: number; week: number; scrapedAt: string | null; teams: OfficialRankedTeam[] }> {
  const db = await supabase();

  // Find the latest (season, week) we have for this division.
  const { data: latest } = await db
    .from('usau_rankings')
    .select('season, week')
    .eq('division', division)
    .order('season', { ascending: false })
    .order('week', { ascending: false })
    .limit(1);
  const head = (latest ?? [])[0] as { season: number; week: number } | undefined;
  if (!head) return { season: 0, week: 0, scrapedAt: null, teams: [] };

  // Read the ranking's own stored identity (team_name/state), plus the OPTIONAL
  // team_id link when we matched one. We no longer inner-join usau_teams (that
  // silently dropped unmatched teams and left holes in the rank sequence).
  const { data, error } = await db
    .from('usau_rankings')
    .select('rank, rating, wins, losses, region, scraped_at, team_id, team_name, state')
    .eq('division', division)
    .eq('season', head.season)
    .eq('week', head.week)
    .order('rank', { ascending: true })
    .limit(limit);
  if (error) throw error;

  type Row = {
    rank: number;
    rating: number | null;
    wins: number | null;
    losses: number | null;
    region: string | null;
    scraped_at: string | null;
    team_id: string | null;
    team_name: string;
    state: string | null;
  };
  const rows = (data ?? []) as unknown as Row[];
  const teams: OfficialRankedTeam[] = rows.map((r) => ({
    id: r.team_id,
    name: r.team_name,
    state: r.state,
    region: r.region,
    rank: r.rank,
    rating: r.rating,
    wins: r.wins,
    losses: r.losses,
  }));

  return {
    season: head.season,
    week: head.week,
    scrapedAt: rows[0]?.scraped_at ?? null,
    teams,
  };
}

export interface RankedTeam {
  id: string;
  name: string;
  state: string | null;
  competitionLevel: string | null;
  genderDivision: string | null;
  /** Most-recent Nationals placement (1 = champion). null if they didn't
   *  make Nationals that year, in which case we fall back to best
   *  Regionals placement (also nullable). */
  nationalsPlacement: number | null;
  bestRegionalsPlacement: number | null;
  /** The season we used to rank them. */
  season: number;
  /** Slug of the Nationals (or, if absent, Regional) event used. Lets the
   *  UI link back to the event that produced the rank. */
  rankedFromSlug: string | null;
}

/**
 * Teams ranked by their finish at last season's Nationals.
 * Top 16 (or however many made Nationals that year) come first, in
 * placement order. Below them: teams that played that season but didn't
 * make Nationals, ranked by best Regionals placement.
 *
 * @param genderDivision optional filter (e.g. 'Men' for Club Open). When
 *   omitted, returns everything.
 * @param season the season to rank by. Defaults to the most recent season
 *   that has a Nationals event with placement data.
 */
type RankableLevel = 'CLUB' | 'COLLEGE_D1' | 'COLLEGE_D3' | 'MASTERS' | 'GRAND_MASTERS';

// Per-level ILIKE patterns identifying a level's Nationals/Championship event,
// so College's "Championships" doesn't collide with Club's "Nationals".
const CHAMPIONSHIP_NAME_LIKE: Record<RankableLevel, string> = {
  CLUB: '%Nationals%',
  COLLEGE_D1: '%D-I College Championship%',
  COLLEGE_D3: '%D-III College Championship%',
  MASTERS: '%Masters Championship%',
  GRAND_MASTERS: '%Grand Masters Championship%',
};
function championshipNameLikeFor(level: RankableLevel): string {
  return CHAMPIONSHIP_NAME_LIKE[level];
}

/**
 * Fraction of the previous completed season's competing-team count that the
 * IN-PROGRESS season must reach (teams that have played ≥1 game) before we
 * start ranking by the current season instead of the last completed Nationals.
 *
 * Rationale: a single early-season tournament (e.g. one "Tune Up" with 8 teams)
 * isn't enough to rank the whole field. USAU's full field isn't even known
 * until Sectionals. Using the prior season's total team count as a stable,
 * known denominator, we wait until ~80% of that many distinct teams have
 * actually played this season — which naturally trips around Sectionals when
 * the bulk of the field registers and plays.
 *
 * NOTE / FUTURE WORK — USAU RANKING ALGORITHM:
 * Once we cross this threshold we currently still order by entry seed (see the
 * banner in usau-teams-ranked.tsx). The REAL goal is to implement USAU's
 * official ranking algorithm (the rating-based system that weights each game's
 * result by opponent strength and score differential, iterated to convergence)
 * to produce true in-season rankings from game results. When that lands it
 * replaces the seed-ordering AND can supersede this crude threshold with a
 * proper "enough connected results to rate" check. See vault: "USAU rating
 * algorithm formula" in the data-sources memory.
 */
const CURRENT_SEASON_RANK_THRESHOLD = 0.8;

/**
 * Pick the season to rank for a level:
 *   1. If the IN-PROGRESS season (the newest season with ANY events) has had
 *      ≥ CURRENT_SEASON_RANK_THRESHOLD × (prior season's competing-team count)
 *      distinct teams play at least one game, use the in-progress season.
 *   2. Otherwise fall back to the most recent season whose Nationals event has
 *      actually been PLAYED (has participating teams). We can't just take
 *      MAX(season) of Nationals events — USAU schedules next season's Nationals
 *      far in advance, so a future, unplayed event row (0 teams) would win and
 *      render the page empty.
 * Returns null if nothing qualifies.
 */
async function resolveRankableSeason(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  compLevel: RankableLevel,
): Promise<number | null> {
  // Distinct teams that have played ≥1 event in a given (season, level).
  const teamsPlayedInSeason = async (s: number): Promise<number> => {
    const { data } = await db
      .from('usau_event_teams')
      .select('team_id, usau_events!inner(season, competition_level)')
      .eq('usau_events.season', s)
      .eq('usau_events.competition_level', compLevel);
    const ids = new Set<string>();
    for (const r of (data ?? []) as Array<{ team_id: string }>) ids.add(r.team_id);
    return ids.size;
  };

  // Most recent season that has a PLAYED Nationals event (the safe fallback).
  const { data: natsEvents } = await db
    .from('usau_events')
    .select('id, season')
    .eq('competition_level', compLevel)
    .ilike('name', championshipNameLikeFor(compLevel))
    .order('season', { ascending: false })
    .limit(12);

  let completedNatsSeason: number | null = null;
  for (const ev of (natsEvents ?? []) as Array<{ id: string; season: number }>) {
    const { count } = await db
      .from('usau_event_teams')
      .select('team_id', { count: 'exact', head: true })
      .eq('event_id', ev.id);
    if ((count ?? 0) > 0) {
      completedNatsSeason = ev.season;
      break;
    }
  }

  // Newest season with any events at all (the in-progress season, if later).
  const { data: newestEvent } = await db
    .from('usau_events')
    .select('season')
    .eq('competition_level', compLevel)
    .order('season', { ascending: false })
    .limit(1);
  const newestSeason: number | null = newestEvent?.[0]?.season ?? null;

  // If there's a season newer than the last completed Nationals, test the 80%
  // threshold against the prior (completed) season's team count.
  if (
    newestSeason != null &&
    completedNatsSeason != null &&
    newestSeason > completedNatsSeason
  ) {
    const denom = await teamsPlayedInSeason(completedNatsSeason);
    const played = await teamsPlayedInSeason(newestSeason);
    if (denom > 0 && played >= denom * CURRENT_SEASON_RANK_THRESHOLD) {
      return newestSeason;
    }
  }

  // Fall back to the last completed Nationals season (or newest as last resort).
  return completedNatsSeason ?? newestSeason;
}

export async function listRankedTeams(opts?: {
  genderDivision?: 'Men' | 'Women' | 'Mixed';
  competitionLevel?: RankableLevel;
  season?: number;
}): Promise<{ season: number; teams: RankedTeam[] }> {
  const db = await supabase();
  const compLevel: RankableLevel = opts?.competitionLevel ?? 'CLUB';

  // For College championships USAU uses event-name patterns like
  // "D-I College Championships" / "D-III College Championships". The
  // Club Nationals events match a different phrase ("USA Ultimate Club
  // Nationals"). We use a level-specific regex so we don't accidentally
  // pick a different level's event when finding "the most recent
  // Nationals season" for this filter.
  const championshipNameLike = CHAMPIONSHIP_NAME_LIKE;
  // Regionals naming varies the same way: Club regions are named
  // "Mid-Atlantic Regional Championship"; College has "D-I College
  // Regionals", "D-III College Regionals"; Masters/GM use their own
  // qualifier names. We match the level-appropriate phrase plus a
  // generic "Regional" fallback so seed-by-Regionals still works for
  // levels where we don't yet know the exact naming.
  const regionalsNameLike: Record<RankableLevel, string> = {
    CLUB: '%Regional%',
    COLLEGE_D1: '%D-I College Regional%',
    COLLEGE_D3: '%D-III College Regional%',
    MASTERS: '%Masters%Regional%',
    GRAND_MASTERS: '%Grand Masters%Regional%',
  };

  // Decide which season to rank.
  const season =
    opts?.season != null ? opts.season : await resolveRankableSeason(db, compLevel);
  if (season == null) {
    return { season: new Date().getUTCFullYear() - 1, teams: [] };
  }

  // Pull every Nationals + Regionals event for this (season, level).
  const { data: events } = await db
    .from('usau_events')
    .select('id, usau_slug, name')
    .eq('season', season)
    .eq('competition_level', compLevel)
    .or(
      `name.ilike.${championshipNameLike[compLevel]},name.ilike.${regionalsNameLike[compLevel]}`,
    );
  const eventsList = events ?? [];
  // Identify Nationals/Championship events by the level's championship phrase
  // so College's "Championships" doesn't collide with Club's "Nationals".
  const champRegex = new RegExp(
    championshipNameLike[compLevel].replace(/%/g, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    'i',
  );
  const nationalsIds = new Set(
    eventsList.filter((e) => champRegex.test(e.name)).map((e) => e.id),
  );
  const slugById = new Map(eventsList.map((e) => [e.id, e.usau_slug] as const));

  if (eventsList.length === 0) {
    return { season, teams: [] };
  }

  const { data: participations } = await db
    .from('usau_event_teams')
    .select('event_id, team_id, seed, final_placement, usau_teams(id, name, state, competition_level, gender_division)')
    .in('event_id', eventsList.map((e) => e.id));

  type Part = {
    event_id: string;
    team_id: string;
    seed: number | null;
    final_placement: number | null;
    usau_teams: {
      id: string;
      name: string;
      state: string | null;
      competition_level: string | null;
      gender_division: string | null;
    } | null;
  };

  // Aggregate: per team, find best Nationals placement (lowest non-null
  // final_placement at a Nationals event) and best Regionals placement
  // (lowest at a Regional event). Fall back to seed when placement is
  // null — at least it preserves the bracket order we saw.
  const byTeam = new Map<string, {
    team: NonNullable<Part['usau_teams']>;
    natPlacement: number | null;
    natSeed: number | null;
    regPlacement: number | null;
    regSeed: number | null;
  }>();

  for (const row of (participations ?? []) as unknown as Part[]) {
    if (!row.usau_teams) continue;
    const t = row.usau_teams;
    if (opts?.genderDivision && t.gender_division !== opts.genderDivision) continue;
    // Masters and Grand Masters share events (combined regionals/championships
    // are tagged one event-level but host teams of BOTH levels, each team
    // tagged per-group). Filtering events alone therefore mixes the levels —
    // also require the TEAM's own level to match. Scoped to masters/GM only:
    // club/college teams are sometimes mis-tagged in source data, and their
    // events never mix levels, so the event filter alone stays correct there.
    if (
      (compLevel === 'MASTERS' || compLevel === 'GRAND_MASTERS') &&
      t.competition_level !== compLevel
    ) {
      continue;
    }

    const isNationals = nationalsIds.has(row.event_id);
    const entry = byTeam.get(t.id) ?? {
      team: t,
      natPlacement: null,
      natSeed: null,
      regPlacement: null,
      regSeed: null,
    };

    if (isNationals) {
      if (row.final_placement != null && (entry.natPlacement == null || row.final_placement < entry.natPlacement)) {
        entry.natPlacement = row.final_placement;
      }
      if (row.seed != null && (entry.natSeed == null || row.seed < entry.natSeed)) {
        entry.natSeed = row.seed;
      }
    } else {
      if (row.final_placement != null && (entry.regPlacement == null || row.final_placement < entry.regPlacement)) {
        entry.regPlacement = row.final_placement;
      }
      if (row.seed != null && (entry.regSeed == null || row.seed < entry.regSeed)) {
        entry.regSeed = row.seed;
      }
    }
    byTeam.set(t.id, entry);
  }

  // Build the ranked list. Three tiers:
  //   1. Made Nationals + has placement → order by placement
  //   2. Made Nationals + no placement (rare; uses seed) → order by seed
  //   3. Didn't make Nationals → order by best Regionals (placement, then seed)
  const ranked = Array.from(byTeam.values())
    .map((e) => {
      const madeNationals = e.natPlacement != null || e.natSeed != null;
      const rankedFromEventId = madeNationals
        ? Array.from(nationalsIds).find((id) =>
            (participations ?? []).some((p) => p.team_id === e.team.id && p.event_id === id),
          )
        : eventsList
            .filter((ev) => !nationalsIds.has(ev.id))
            .find((ev) =>
              (participations ?? []).some(
                (p) => p.team_id === e.team.id && p.event_id === ev.id,
              ),
            )?.id;
      const slug = rankedFromEventId ? slugById.get(rankedFromEventId) ?? null : null;

      return {
        id: e.team.id,
        name: e.team.name,
        state: e.team.state,
        competitionLevel: e.team.competition_level,
        genderDivision: e.team.gender_division,
        nationalsPlacement: e.natPlacement,
        bestRegionalsPlacement: e.regPlacement,
        rankedFromSlug: slug,
        season,
        _tier: madeNationals ? 0 : 1,
        _natSort: e.natPlacement ?? e.natSeed ?? 999,
        _regSort: e.regPlacement ?? e.regSeed ?? 999,
      };
    })
    .sort((a, b) => {
      if (a._tier !== b._tier) return a._tier - b._tier;
      if (a._tier === 0) return a._natSort - b._natSort;
      return a._regSort - b._regSort;
    })
    .map(({ _tier, _natSort, _regSort, ...rest }) => rest);

  return { season, teams: ranked };
}

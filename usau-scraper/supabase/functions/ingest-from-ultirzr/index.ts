// ingest-from-ultirzr: pull events + games for one (year, division) from
// ultirzr.app's public JSON API and upsert into our usau_* tables.
//
// Why this exists: USAU's calendar form blocks programmatic POSTs from
// non-browser clients, so we couldn't enumerate historical events through
// HTML scraping alone. ultirzr.app already scrapes USAU and exposes the
// same data as a JSON API — we leverage their work.
//
// Request body:
//   { year: number,
//     division?: 'mens-club' | 'womens-club' | 'mixed-club' | 'masters' | string,
//     page?: number       // start at this /search page (default 1)
//     maxPages?: number   // hard cap on /search pagination from this start (default 1)
//     dryRun?: boolean }  // skip DB writes, just report what we'd do
//
// MASTERS MODE (division: 'masters'):
//   Club divisions map 1:1 to an ultirzr EventGroupName, but masters events
//   host up to 7 age×gender groups on one EventId ('Masters - Men',
//   'Grand Masters - Mixed', 'Great Grand Masters - Women', …) and ultirzr's
//   /search division filter doesn't cover them. So masters mode searches by
//   `query=masters` (name substring) and ingests EVERY masters-family group
//   per event, classifying each group independently:
//     - team competition_level: 'Masters - *' → MASTERS; 'Grand Masters - *'
//       and 'Great Grand Masters - *' → GRAND_MASTERS (GGM folded in — tiny
//       division, not worth widening the enum).
//     - bracket_name is prefixed with a short group label ("GM Women · Pool A")
//       so the combined championships' divisions stay distinguishable.
//   Non-masters events surfaced by the name search (clinics, "Masters Minus"
//   club tournaments) have no masters-family group → quietly skipped.
//
// Edge Functions cap CPU per invocation, so we work one /search page (20
// events) per call. The response includes `nextPage` so the caller can
// loop until null. A future cron wrapper would call us once per page and
// stop when nextPage is null.
//
// What it writes:
//   - usau_events (one row per ultirzr event, keyed on usau_event_id)
//   - usau_teams (one row per persistent USAU team id, keyed on usau_team_id)
//   - usau_event_teams (per-event participation; PK event_id + team_id)
//   - usau_games (one row per ultirzr EventGameId, keyed on usau_event_game_id)
//
// What it does NOT write:
//   - usau_players / usau_rosters / usau_player_event_stats — ultirzr
//     doesn't expose rosters or per-event player stats. Those still come
//     from sync-event-rosters (HTML scrape of the team page).

import { supabase, withRunLogging } from '../_shared/supabase.ts';

interface RequestBody {
  year?: number;
  division?: string;
  page?: number;
  maxPages?: number;
  dryRun?: boolean;
}

interface UltirzrEventSearchHit {
  EventId: number;
  EventName: string;
  EventLogo?: string;
  EventType?: string;
  EventTypeName?: string;
  City?: string | null;
  State?: string | null;
  StartDate?: string;
  EndDate?: string;
  EventGroups?: unknown[];
}

interface UltirzrGame {
  EventGameId: number;
  GameName?: string;
  StartDate?: string;
  StartTime?: string;
  HomeTeamId?: number;
  AwayTeamId?: number;
  HomeTeamName?: string;
  AwayTeamName?: string;
  HomeTeamScore?: string | number;
  AwayTeamScore?: string | number;
  FieldName?: string;
  GameStatus?: string;
}

interface UltirzrPool {
  Name?: string;
  PoolId?: number;
  Games?: UltirzrGame[];
}

interface UltirzrStage {
  StageId?: number;
  StageName?: string;
  Games?: UltirzrGame[];
}

interface UltirzrBracket {
  BracketId?: number;
  BracketName?: string;
  Stage?: UltirzrStage[];
}

interface UltirzrRound {
  RoundId?: number;
  Pools?: UltirzrPool[];
  Brackets?: UltirzrBracket[];
  Clusters?: unknown[];
}

interface UltirzrGroup {
  EventGroupId?: number;
  EventGroupName?: string;
  UsauUrl?: string;
  EventRounds?: UltirzrRound[];
}

interface UltirzrEventFull {
  EventName: string;
  EventLogo?: string;
  City?: string | null;
  State?: string | null;
  StartDate?: string;
  EndDate?: string;
  EventType?: string;
  EventTypeName?: string;
  EventGroups?: UltirzrGroup[];
}

// ─── HTTP ──────────────────────────────────────────────────────────────

const BASE = 'https://ultirzr.app/api/v1';
const MIN_GAP_MS = 600; // be polite, well under any reasonable rate limit
let lastFetchAt = 0;

async function fetchUltirzr<T>(path: string): Promise<T> {
  const now = Date.now();
  const wait = Math.max(0, lastFetchAt + MIN_GAP_MS - now);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastFetchAt = Date.now();

  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      // Identify ourselves so the operator can rate-limit / block if needed.
      'User-Agent': 'the-layout-scraper/1.0 (huntermay@altiusapps.com)',
    },
    redirect: 'follow',
  });
  if (!res.ok) {
    throw new Error(`ultirzr ${path} → HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

// ─── Helpers ───────────────────────────────────────────────────────────

function stringifyErr(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object') {
    const o = err as Record<string, unknown>;
    return [o.message, o.code && `(${o.code})`, o.details && `— ${o.details}`]
      .filter(Boolean)
      .join(' ') || JSON.stringify(err);
  }
  return String(err);
}

/** "Revolver (1)" → { name: "Revolver", seed: 1 }. Mirrors the helper in
 *  _shared/parse.ts for HTML scraping. */
function splitNameAndSeed(raw: string): { name: string; seed: number | null } {
  const trimmed = raw.trim();
  const m = trimmed.match(/^(.+?)\s*\((\d+)\)\s*$/);
  if (m) return { name: m[1].trim(), seed: parseInt(m[2], 10) };
  return { name: trimmed, seed: null };
}

/** ultirzr returns `2025-08-30T00:00:00.000Z` style — we want yyyy-mm-dd. */
function dateOnly(iso: string | undefined | null): string | null {
  if (!iso) return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** Their per-game StartDate is "MM/DD/YYYY" plus a separate StartTime. */
function combineDateTime(date?: string, time?: string): string | null {
  if (!date) return null;
  const md = date.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!md) return null;
  const [, mm, dd, yyyy] = md;
  const isoDate = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  if (!time) return `${isoDate}T00:00:00Z`;
  // "9:00 AM" / "12:30 PM"
  const mt = time.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!mt) return `${isoDate}T00:00:00Z`;
  let h = parseInt(mt[1], 10);
  const min = mt[2];
  const ampm = mt[3].toUpperCase();
  if (ampm === 'PM' && h < 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return `${isoDate}T${String(h).padStart(2, '0')}:${min}:00Z`;
}

/** Pull the lowercase slug out of UsauUrl. ultirzr returns URLs like
 *  https://play.usaultimate.org/events/{slug}/schedule/men/club-men/  */
function slugFromUsauUrl(url: string | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/events\/([^/]+)/);
  return m ? m[1] : null;
}

/** Status string from ultirzr ('Final', 'Scheduled', 'In Progress') →
 *  our usau_game_status enum value. */
function classifyStatus(raw: string | undefined): string {
  const t = (raw ?? '').toLowerCase();
  if (t.includes('final')) return 'final';
  if (t.includes('progress')) return 'in_progress';
  if (t.includes('forfeit')) return 'forfeit';
  if (t.includes('cancel')) return 'cancelled';
  return 'scheduled';
}

/** Heuristic: classify a bracket/stage name into our game_round enum. */
function classifyRound(stageName: string | undefined, bracketName: string | undefined): string {
  const t = `${bracketName ?? ''} ${stageName ?? ''}`.toLowerCase();
  if (/(prequarter|pre-quarter)/.test(t)) return 'prequarter';
  if (/(^|\s)final(s)?($|\s)/.test(t) && !/semi|quarter|third|fifth|seventh|placement/.test(t)) {
    return 'final';
  }
  if (/semi/.test(t)) return 'semi';
  if (/quarter/.test(t)) return 'quarter';
  if (/(third place|fifth place|seventh place|ninth|11th|13th|15th|placement)/.test(t)) {
    return 'placement';
  }
  if (/consolation/.test(t)) return 'consolation';
  return 'other';
}

// ─── Core ingest ────────────────────────────────────────────────────────

interface IngestStats {
  events: number;
  teams: number;
  participations: number;
  games: number;
  errors: Array<{ eventId: number; eventName?: string; error: string }>;
}

async function ingestEvent(
  db: ReturnType<typeof supabase>,
  hit: UltirzrEventSearchHit,
  divisionFilter: string,
  stats: IngestStats,
  dryRun: boolean,
): Promise<void> {
  // Fetch the full event tree.
  const full = await fetchUltirzr<{ success: boolean; event: UltirzrEventFull }>(
    `/events/${hit.EventId}`,
  );
  const e = full.event;
  if (!e) {
    stats.errors.push({ eventId: hit.EventId, eventName: hit.EventName, error: 'no event payload' });
    return;
  }

  // Resolve our division label to ultirzr's EventGroupName. The /search
  // endpoint filters by division but a single event can have multiple
  // groups (e.g. Pro Champs has Club-Men + Club-Mixed + Club-Women on the
  // same EventId). We only ingest the group the caller asked for.
  // ultirzr group names sometimes have inconsistent whitespace and casing
  // year to year (e.g. 2024 has 'Club - Men ' with a trailing space, 2025
  // has 'Club - Men'). Normalize both sides before comparing.
  //
  // Masters mode ingests EVERY masters-family group instead (one masters
  // event hosts up to 7 age×gender groups) — see header.
  const isMasters = divisionFilter === 'masters';
  const wantedGroupName = divisionLabel(divisionFilter);
  const wantedNorm = wantedGroupName?.toLowerCase().replace(/\s+/g, ' ').trim();
  const groups = (e.EventGroups ?? []).filter((g) => {
    if (isMasters) return mastersGroupMeta(g) !== null;
    if (!wantedNorm) return true;
    return normGroupName(g) === wantedNorm;
  });
  if (groups.length === 0) {
    // Event doesn't have this division — common (e.g. an HS-only event
    // shows up in our search results because of how ultirzr handles
    // division filtering on lookalike names, or a "Masters Minus" club
    // tournament matching the masters name search). Quiet skip.
    return;
  }

  // Find a slug (from any group's UsauUrl). Lowercase by convention.
  let slug: string | null = null;
  for (const g of groups) {
    const s = slugFromUsauUrl(g.UsauUrl);
    if (s) {
      slug = s.toLowerCase();
      break;
    }
  }
  if (!slug) {
    // Fall back to a synthesized slug from the event name. Not ideal but
    // some events don't expose a UsauUrl (masters groups, cancelled events).
    // Strip apostrophes BEFORE hyphenating so "Women's" → "womens" like
    // USAU's own slugs, not "women-s" (which would miss the slug match
    // against rows discover-events created and duplicate the event).
    slug = e.EventName.toLowerCase()
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  const start = dateOnly(e.StartDate);
  const season = start
    ? parseInt(start.slice(0, 4), 10)
    : (hit.StartDate ? parseInt(dateOnly(hit.StartDate)?.slice(0, 4) ?? '0', 10) : 0);

  if (!season) {
    stats.errors.push({ eventId: hit.EventId, eventName: hit.EventName, error: 'no season' });
    return;
  }

  // Year-aware slug. USAU reused a YEAR-LESS slug for several consecutive
  // seasons — e.g. "usa-ultimate-national-championships" covered 2014 through
  // 2018 — and usau_slug is UNIQUE, so without the year all those seasons
  // collapse into a single event row (this merged 5 Nationals + 740 games into
  // one). Appending the season when the slug doesn't already carry a 4-digit
  // year keeps each season its own event. Modern slugs already include the year
  // (e.g. "2025-usa-ultimate-club-nationals"), so they're untouched.
  if (!/\b(19|20)\d{2}\b/.test(slug)) {
    slug = `${slug}-${season}`;
  }

  if (dryRun) {
    stats.events++;
    return;
  }

  // ── Upsert season (FK target) ──
  await db.from('usau_seasons').upsert({ year: season }, { onConflict: 'year', ignoreDuplicates: true });

  // ── Upsert event ──
  // Match preference: by numeric usau_event_id first (most stable), then by
  // lowercased slug (handles legacy rows from HTML scrape), then — masters
  // only — by (season, name): discover-events created the 2026 masters
  // shells with REAL USAU slugs that a synthesized slug may not hit.
  //
  // Event-level competition_level is single-valued but a combined masters
  // event hosts Masters AND Grand Masters groups. We classify by the
  // "youngest" group present (any plain Masters group → MASTERS). The
  // per-division truth lives on the TEAMS (tagged from their group below).
  const eventLevel = isMasters
    ? (groups.some((g) => mastersGroupMeta(g)?.level === 'MASTERS') ? 'MASTERS' : 'GRAND_MASTERS')
    : levelFromGroup(wantedGroupName);

  const eventRow = {
    usau_slug: slug,
    usau_event_id: hit.EventId,
    name: e.EventName,
    season,
    start_date: start,
    end_date: dateOnly(e.EndDate),
    city: e.City ?? null,
    state: e.State ?? null,
    url: `https://play.usaultimate.org/events/${slug}/`,
    last_scraped_at: new Date().toISOString(),
    last_scraped_status: 'ok',
    competition_level: eventLevel,
  };

  // On UPDATE of an existing masters row, keep its slug (discover-events
  // stored the real USAU slug — better than our synthesized one) and its
  // level (already classified). Club updates keep full-overwrite behavior.
  const updatePayload = isMasters
    ? (({ usau_slug: _s, competition_level: _l, ...rest }) => rest)(eventRow)
    : eventRow;

  const { data: existingById } = await db
    .from('usau_events')
    .select('id')
    .eq('usau_event_id', hit.EventId)
    .maybeSingle();
  let eventUuid: string | null = null;
  if (existingById) {
    eventUuid = existingById.id;
  } else {
    const { data: existingBySlug } = await db
      .from('usau_events')
      .select('id')
      .ilike('usau_slug', slug)
      .maybeSingle();
    if (existingBySlug) {
      eventUuid = existingBySlug.id;
    } else if (isMasters) {
      const { data: existingByName } = await db
        .from('usau_events')
        .select('id')
        .eq('season', season)
        .ilike('name', e.EventName.trim())
        .limit(1);
      if (existingByName && existingByName.length > 0) eventUuid = existingByName[0].id;
    }
  }

  if (eventUuid) {
    const { error } = await db.from('usau_events').update(updatePayload).eq('id', eventUuid);
    if (error) throw new Error(`update event ${hit.EventId}: ${stringifyErr(error)}`);
  } else {
    const { data: inserted, error } = await db
      .from('usau_events')
      .insert(eventRow)
      .select('id')
      .single();
    if (error) throw new Error(`insert event ${hit.EventId}: ${stringifyErr(error)}`);
    eventUuid = inserted.id;
  }
  stats.events++;

  // ── Walk every game in the wanted groups, collect teams + games ──
  // In masters mode each group carries its own level+gender (a combined
  // championships hosts up to 7 groups), so teams remember the group they
  // were seen in and bracket names get a group prefix ("GM Women · Pool A")
  // to keep the divisions distinguishable on the event page.
  type GameWithCtx = { game: UltirzrGame; bracket: string | null; stage: string | null };
  const teamSeen = new Map<number, TeamSeenInfo>();
  const gameList: GameWithCtx[] = [];

  for (const g of groups) {
    const meta = isMasters ? mastersGroupMeta(g) : null;
    const prefix = meta ? `${meta.label} · ` : '';
    for (const r of g.EventRounds ?? []) {
      // Pool play
      for (const p of r.Pools ?? []) {
        for (const gm of p.Games ?? []) {
          collectTeam(gm.HomeTeamId, gm.HomeTeamName, teamSeen, meta);
          collectTeam(gm.AwayTeamId, gm.AwayTeamName, teamSeen, meta);
          gameList.push({ game: gm, bracket: `${prefix}${p.Name ?? 'Pool'}`, stage: 'pool' });
        }
      }
      // Bracket play
      for (const b of r.Brackets ?? []) {
        for (const st of b.Stage ?? []) {
          for (const gm of st.Games ?? []) {
            collectTeam(gm.HomeTeamId, gm.HomeTeamName, teamSeen, meta);
            collectTeam(gm.AwayTeamId, gm.AwayTeamName, teamSeen, meta);
            gameList.push({
              game: gm,
              bracket: b.BracketName ? `${prefix}${b.BracketName}` : (prefix ? prefix.replace(/ · $/, '') : null),
              stage: st.StageName ?? null,
            });
          }
        }
      }
    }
  }

  // ── Upsert teams (one row per usau_team_id) ──
  const teamUuidById = new Map<number, string>();
  for (const [tid, info] of teamSeen.entries()) {
    const teamIdStr = String(tid);
    const { data: existing } = await db
      .from('usau_teams')
      .select('id, name')
      .eq('usau_team_id', teamIdStr)
      .maybeSingle();
    if (existing) {
      teamUuidById.set(tid, existing.id);
      // Keep the canonical name fresh; only overwrite if our stored value
      // is shorter (avoids losing a longer official name to a casual one).
      if (info.name && info.name.length > (existing.name?.length ?? 0)) {
        await db.from('usau_teams').update({ name: info.name }).eq('id', existing.id);
      }
    } else {
      const { data: created, error } = await db
        .from('usau_teams')
        .insert({
          usau_team_id: teamIdStr,
          name: info.name,
          // Masters teams carry the level+gender of the GROUP they were seen
          // in (MASTERS vs GRAND_MASTERS), not the event's single level.
          competition_level: info.meta?.level ?? 'CLUB',
          gender_division: info.meta?.gender ?? genderFromGroup(wantedGroupName),
          last_scraped_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (error) throw new Error(`insert team ${tid}: ${stringifyErr(error)}`);
      teamUuidById.set(tid, created.id);
      stats.teams++;
    }
  }

  // ── Upsert event-team participations (seed from team-name parens) ──
  for (const [tid, info] of teamSeen.entries()) {
    const teamUuid = teamUuidById.get(tid);
    if (!teamUuid) continue;
    // PostgREST won't accept ON CONFLICT on a composite PK that isn't
    // backed by a unique constraint visible in the schema cache. Use
    // select-then-insert/update. Cheap: per-event row count is small.
    const { data: existing } = await db
      .from('usau_event_teams')
      .select('team_id')
      .eq('event_id', eventUuid)
      .eq('team_id', teamUuid)
      .maybeSingle();
    const row = {
      event_id: eventUuid,
      team_id: teamUuid,
      usau_event_team_id: String(tid), // we don't have a per-event id from ultirzr; reuse team id
      seed: info.seed,
    };
    if (existing) {
      const { error } = await db
        .from('usau_event_teams')
        .update({ seed: row.seed })
        .eq('event_id', eventUuid)
        .eq('team_id', teamUuid);
      if (error) throw new Error(`update event_team ${eventUuid}/${tid}: ${stringifyErr(error)}`);
    } else {
      const { error } = await db.from('usau_event_teams').insert(row);
      if (error) throw new Error(`insert event_team ${eventUuid}/${tid}: ${stringifyErr(error)}`);
    }
    stats.participations++;
  }

  // ── Upsert games (keyed on usau_event_game_id) ──
  // Filter out placeholder games where both team IDs are 0 (pre-draw
  // schedule stubs) and games with no real score updates pending — we
  // still want to record scheduled-not-played games so the bracket
  // renders, but we skip the ones with no resolved teams.
  for (const { game: gm, bracket, stage } of gameList) {
    if (!gm.EventGameId) continue;
    const homeId = gm.HomeTeamId ?? 0;
    const awayId = gm.AwayTeamId ?? 0;
    if (homeId === 0 && awayId === 0) continue;

    const teamA = homeId ? teamUuidById.get(homeId) ?? null : null;
    const teamB = awayId ? teamUuidById.get(awayId) ?? null : null;

    const homeSplit = gm.HomeTeamName ? splitNameAndSeed(gm.HomeTeamName) : { seed: null };
    const awaySplit = gm.AwayTeamName ? splitNameAndSeed(gm.AwayTeamName) : { seed: null };

    const scoreA = parseScore(gm.HomeTeamScore);
    const scoreB = parseScore(gm.AwayTeamScore);

    const row = {
      event_id: eventUuid,
      usau_event_game_id: String(gm.EventGameId),
      round: classifyRound(stage ?? undefined, bracket ?? undefined),
      bracket_name: bracket,
      team_a_id: teamA,
      team_b_id: teamB,
      seed_a: homeSplit.seed,
      seed_b: awaySplit.seed,
      score_a: scoreA,
      score_b: scoreB,
      location: gm.FieldName?.trim() || null,
      scheduled_at: combineDateTime(gm.StartDate, gm.StartTime),
      status: classifyStatus(gm.GameStatus),
      source_url: `https://play.usaultimate.org/events/${slug}/`,
    };

    const { error } = await db
      .from('usau_games')
      .upsert(row, { onConflict: 'usau_event_game_id', ignoreDuplicates: false });
    if (error) throw new Error(`upsert game ${gm.EventGameId}: ${stringifyErr(error)}`);
    stats.games++;
  }
}

interface TeamSeenInfo {
  name: string;
  seed: number | null;
  /** Masters mode: the group this team plays in (level + gender). */
  meta: MastersGroupMeta | null;
}

function collectTeam(
  id: number | undefined,
  name: string | undefined,
  out: Map<number, TeamSeenInfo>,
  meta: MastersGroupMeta | null,
): void {
  if (!id || id === 0) return;
  const split = name ? splitNameAndSeed(name) : { name: '', seed: null };
  const existing = out.get(id);
  // Track the deepest-seed we've seen for this team in this event (some
  // events list a team with their pool seed AND their bracket seed —
  // the latter is what we want).
  out.set(id, {
    name: split.name || existing?.name || '',
    seed: split.seed ?? existing?.seed ?? null,
    meta: existing?.meta ?? meta,
  });
}

function parseScore(v: string | number | undefined): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  const m = v.trim().match(/^(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

function divisionLabel(div: string): string | null {
  switch (div) {
    case 'mens-club': return 'Club - Men';
    case 'womens-club': return 'Club - Women';
    case 'mixed-club': return 'Club - Mixed';
    default: return null;
  }
}

// ─── Masters helpers ────────────────────────────────────────────────────

interface MastersGroupMeta {
  /** Our enum value. GGM folds into GRAND_MASTERS (see header). */
  level: 'MASTERS' | 'GRAND_MASTERS';
  gender: 'Men' | 'Women' | 'Mixed';
  /** Short display prefix for bracket names, e.g. "GM Women". */
  label: string;
}

/** Normalize an EventGroupName for matching (ultirzr has inconsistent
 *  whitespace year to year, incl. trailing spaces). */
function normGroupName(g: UltirzrGroup): string {
  return (g.EventGroupName ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** 'Great Grand Masters - Men ' → { GRAND_MASTERS, Men, 'GGM Men' };
 *  null for anything outside the masters family. */
function mastersGroupMeta(g: UltirzrGroup): MastersGroupMeta | null {
  const m = normGroupName(g).match(
    /^(great grand masters|grand masters|masters) - (men|women|mixed)$/,
  );
  if (!m) return null;
  const gender = (m[2][0].toUpperCase() + m[2].slice(1)) as MastersGroupMeta['gender'];
  const prefix =
    m[1] === 'great grand masters' ? 'GGM' : m[1] === 'grand masters' ? 'GM' : 'Masters';
  return {
    level: m[1] === 'masters' ? 'MASTERS' : 'GRAND_MASTERS',
    gender,
    label: `${prefix} ${gender}`,
  };
}

function genderFromGroup(group: string | null): 'Men' | 'Women' | 'Mixed' | null {
  if (!group) return null;
  if (group.includes('Mixed')) return 'Mixed';
  if (group.includes('Women')) return 'Women';
  if (group.includes('Men')) return 'Men';
  return null;
}

function levelFromGroup(group: string | null): string {
  if (!group) return 'OTHER';
  if (group.startsWith('Club')) return 'CLUB';
  if (group.startsWith('College')) {
    return group.includes('D-III') || group.includes('D3') ? 'COLLEGE_D3' : 'COLLEGE_D1';
  }
  if (group.includes('Masters')) return 'MASTERS';
  if (group.includes('High School')) return 'HS';
  return 'OTHER';
}

// ─── Entry point ────────────────────────────────────────────────────────

async function run(body: RequestBody) {
  if (!body.year || !Number.isFinite(body.year)) throw new Error('year is required');
  const division = body.division ?? 'mens-club';
  const startPage = Math.max(1, body.page ?? 1);
  const maxPages = body.maxPages ?? 1;
  const endPage = startPage + maxPages - 1;
  const dryRun = !!body.dryRun;

  const db = supabase();
  const stats: IngestStats = { events: 0, teams: 0, participations: 0, games: 0, errors: [] };
  let nextPage: number | null = null;
  let lastPageWalked: number = startPage - 1;

  for (let page = startPage; page <= endPage; page++) {
    // Masters events aren't reachable via ultirzr's division filter — search
    // by name substring instead (see header). Non-masters keeps division.
    const searchQs = division === 'masters'
      ? `year=${body.year}&query=masters&page=${page}`
      : `year=${body.year}&division=${encodeURIComponent(division)}&page=${page}`;
    const resp = await fetchUltirzr<{ success: boolean; hits: UltirzrEventSearchHit[] }>(
      `/events/search?${searchQs}`,
    );
    const hits = resp.hits ?? [];
    lastPageWalked = page;
    if (hits.length === 0) break;

    for (const hit of hits) {
      try {
        await ingestEvent(db, hit, division, stats, dryRun);
      } catch (err) {
        stats.errors.push({
          eventId: hit.EventId,
          eventName: hit.EventName,
          error: stringifyErr(err),
        });
      }
    }

    // If we got a full page, there might be more. Signal nextPage so the
    // caller can drive a loop without us having to fit it all in one
    // Edge Function invocation.
    if (hits.length === 20 && page === endPage) {
      nextPage = page + 1;
    }
  }

  return {
    rowsProcessed: stats.events + stats.teams + stats.participations + stats.games,
    result: {
      year: body.year,
      division,
      startPage,
      lastPageWalked,
      nextPage,
      ...stats,
    },
  };
}

Deno.serve(async (req) => {
  let body: RequestBody = {};
  try {
    if (req.headers.get('content-type')?.includes('application/json')) {
      body = await req.json();
    } else {
      const url = new URL(req.url);
      if (url.searchParams.get('year')) body.year = parseInt(url.searchParams.get('year')!, 10);
      if (url.searchParams.get('division')) body.division = url.searchParams.get('division')!;
      if (url.searchParams.get('dryRun') === 'true') body.dryRun = true;
    }
  } catch {
    // empty body OK
  }

  try {
    const res = await withRunLogging(
      'ingest-from-ultirzr',
      body as Record<string, unknown>,
      () => run(body),
    );
    return Response.json({ ok: true, ...res });
  } catch (err) {
    const message = stringifyErr(err);
    console.error('[ingest-from-ultirzr] failed:', message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
});

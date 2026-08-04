// euf-ingest — ingest one EUCS/EUF event from the Ultiorganizer schedule site.
//
// Operator-driven (no cron — matches the backfill rule in the vault). POST a
// season id; the function scrapes and upserts the whole event: teams, rosters,
// games, and per-game box scores.
//
// Request body: { "season": "e2cf25", "name": "2025 EUCF Wroclaw", "year": 2025,
//                 "kind": "eucf", "location": "Wrocław, Poland",
//                 "stats": true }        // stats=false skips box scores
//
// Scrape order matters — each step feeds the next:
//   1. ?view=teams    → team ids + countries (NO division here)
//   2. ?view=teamcard → division + roster totals  [the team→division authority]
//   3. ?view=games    → games, resolved to teams by (division, name)
//   4. ?view=gameplay → per-game box scores
//
// Auto-injected by Supabase: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  parseGames,
  parseGameplay,
  parseTeamcard,
  parseTeamList,
  type Division,
} from './parse.ts';

const BASE = 'https://eucs-schedule.ultimatefederation.eu';
const UA = 'Mozilla/5.0 (the-layout/euf-ingest)';
// Polite serial pacing. The site has no WAF and did not rate-limit during
// research, but an event is ~200 requests — keep it slow and sequential.
const FETCH_DELAY_MS = 250;
const CONCURRENCY = 4;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const teamKey = (d: Division, n: string) => `${d}|${normName(n)}`;

function db(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function fetchHtml(url: string): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
    if (res.status >= 500) return null; // Ultiorganizer 500s are permanent
    if (res.ok) return await res.text();
    if (attempt === 1) throw new Error(`HTTP ${res.status} for ${url}`);
    await sleep(800);
  }
  return null;
}

/** Run tasks with a small concurrency cap, preserving input order. */
async function pooled<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
        await sleep(FETCH_DELAY_MS);
      }
    }),
  );
  return out;
}

interface IngestBody {
  season: string;
  name?: string;
  year?: number;
  kind?: string;
  location?: string;
  slug?: string;
  stats?: boolean;
  /** Override the dates derived from the schedule's day headers (YYYY-MM-DD).
   *  Only needed when an event's schedule page omits them. */
  startDate?: string;
  endDate?: string;
}

/** "9:05" → "09:05". The source emits single-digit hours, which are not a
 *  valid ISO timestamp component. */
function padTime(t: string): string {
  const [h, m] = t.split(':');
  return `${h.padStart(2, '0')}:${m}`;
}

async function ingest(supabase: SupabaseClient, body: IngestBody) {
  const season = body.season;
  if (!season) throw new Error('season is required');
  const url = (view: string, extra = '') =>
    `${BASE}/?view=${view}&season=${encodeURIComponent(season)}${extra}`;

  // ── 1. Team list (ids + countries) ────────────────────────────────────────
  const teamsHtml = await fetchHtml(url('teams', '&list=allteams'));
  if (!teamsHtml) throw new Error(`teams view empty for season ${season}`);
  const teamRefs = parseTeamList(teamsHtml);
  if (!teamRefs.length) throw new Error(`no teams parsed for season ${season}`);

  // ── 2. Teamcards → division (authoritative) + roster totals ───────────────
  const cards = await pooled(teamRefs, async (t) => {
    const html = await fetchHtml(`${BASE}/?view=teamcard&team=${t.eufTeamId}`);
    return { ref: t, card: html ? parseTeamcard(html) : null };
  });

  // ── 3. Upsert event ───────────────────────────────────────────────────────
  // Games are fetched HERE (not at step 6) because the event's start/end dates
  // are DERIVED from the games' day headers ("<h3>Sat 20.9.2025</h3>") — the
  // source has no event-level date field, and these columns were left NULL
  // before, which made any schedule surface impossible.
  const gamesHtml = await fetchHtml(url('games', '&filter=tournaments&group=all'));
  if (!gamesHtml) throw new Error(`games view empty for season ${season}`);
  const games = parseGames(gamesHtml);

  const gameDates = games.map((g) => g.date).filter((d): d is string => Boolean(d)).sort();
  const startDate = body.startDate ?? gameDates[0] ?? null;
  const endDate = body.endDate ?? gameDates[gameDates.length - 1] ?? null;

  // Prefer a year we can prove from the schedule over one guessed from the name.
  const year =
    body.year ??
    (startDate ? Number(startDate.slice(0, 4)) : null) ??
    Number(body.name?.match(/(20\d{2})/)?.[1]) ??
    new Date().getFullYear();

  const { data: eventRow, error: evErr } = await supabase
    .from('euf_events')
    .upsert(
      {
        season_id: season,
        slug: body.slug ?? season.toLowerCase(),
        name: body.name ?? season,
        year,
        kind: body.kind ?? 'other',
        location: body.location ?? null,
        start_date: startDate,
        end_date: endDate,
        source_origin: BASE,
        last_scraped_at: new Date().toISOString(),
        last_scraped_status: 'ok',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'season_id' },
    )
    .select('id')
    .single();
  if (evErr) throw new Error(`event upsert: ${evErr.message}`);
  const eventId = eventRow.id as string;

  // ── 4. Upsert teams ───────────────────────────────────────────────────────
  const teamRows = cards
    .filter((c) => c.card?.division)
    .map((c) => ({
      event_id: eventId,
      euf_team_id: c.ref.eufTeamId,
      division: c.card!.division as Division,
      name: c.card!.name ?? c.ref.name,
      country_name: c.ref.country,
      updated_at: new Date().toISOString(),
    }));
  const skippedTeams = cards.length - teamRows.length;
  if (teamRows.length) {
    const { error } = await supabase
      .from('euf_teams')
      .upsert(teamRows, { onConflict: 'event_id,euf_team_id' });
    if (error) throw new Error(`teams upsert: ${error.message}`);
  }

  const { data: storedTeams, error: stErr } = await supabase
    .from('euf_teams')
    .select('id, euf_team_id, division, name')
    .eq('event_id', eventId);
  if (stErr) throw new Error(`teams read-back: ${stErr.message}`);

  const bySourceId = new Map(storedTeams!.map((t) => [t.euf_team_id as number, t.id as string]));
  // Games name teams WITHOUT ids, and names repeat across divisions — so the
  // lookup key must include the division.
  const byDivName = new Map(
    storedTeams!.map((t) => [teamKey(t.division as Division, t.name as string), t.id as string]),
  );

  // ── 5. Rosters (per-event player totals from the teamcards) ───────────────
  const rosterRows = cards.flatMap((c) => {
    const teamId = bySourceId.get(c.ref.eufTeamId);
    if (!teamId || !c.card) return [];
    return c.card.players.map((p) => ({
      team_id: teamId,
      event_id: eventId,
      euf_player_id: p.eufPlayerId,
      full_name: p.name,
      jersey_number: p.jersey,
      games: p.games,
      goals: p.goals,
      assists: p.assists,
      total: p.total,
    }));
  });
  for (let i = 0; i < rosterRows.length; i += 500) {
    const { error } = await supabase
      .from('euf_rosters')
      .upsert(rosterRows.slice(i, i + 500), { onConflict: 'team_id,euf_player_id' });
    if (error) throw new Error(`rosters upsert: ${error.message}`);
  }

  // ── 6. Games ──────────────────────────────────────────────────────────────
  // (fetched + parsed at step 3 — the event's dates are derived from them)
  let unresolved = 0;
  const gameRows = games.map((g) => {
    const home = byDivName.get(teamKey(g.division, g.home)) ?? null;
    const away = byDivName.get(teamKey(g.division, g.away)) ?? null;
    if (!home || !away) unresolved++;
    return {
      event_id: eventId,
      euf_game_id: g.eufGameId,
      division: g.division,
      round_name: g.round,
      stage: g.stage,
      is_bracket: g.isBracket,
      home_team_id: home,
      away_team_id: away,
      home_score: g.homeScore,
      away_score: g.awayScore,
      field: g.field,
      start_time: g.time,
      // start_time alone is a bare "10:15" with no day. Combining it with the
      // day header gives a real instant so games can be ordered and scheduled
      // across an event. Times are VENUE-LOCAL and the source publishes no
      // offset, so this is stored as UTC — treat it as wall-clock, the same
      // convention the USAU masters ingest uses.
      scheduled_at: g.date && g.time ? `${g.date}T${padTime(g.time)}:00Z` : null,
      status: g.forfeit ? 'forfeit' : 'completed',
      updated_at: new Date().toISOString(),
    };
  });

  const withId = gameRows.filter((r) => r.euf_game_id !== null);
  if (withId.length) {
    const { error } = await supabase
      .from('euf_games')
      .upsert(withId, { onConflict: 'event_id,euf_game_id' });
    if (error) throw new Error(`games upsert: ${error.message}`);
  }
  // Forfeits carry no source id, so they can't participate in the unique index.
  // Delete-then-insert keeps re-ingest idempotent for them.
  const noId = gameRows.filter((r) => r.euf_game_id === null);
  if (noId.length) {
    await supabase.from('euf_games').delete().eq('event_id', eventId).is('euf_game_id', null);
    const { error } = await supabase.from('euf_games').insert(noId);
    if (error) throw new Error(`forfeit games insert: ${error.message}`);
  }

  // ── 7. Per-game box scores ────────────────────────────────────────────────
  let statLines = 0;
  let gamesWithStats = 0;
  if (body.stats !== false) {
    const { data: storedGames, error: sgErr } = await supabase
      .from('euf_games')
      .select('id, euf_game_id, home_team_id, away_team_id')
      .eq('event_id', eventId)
      .not('euf_game_id', 'is', null);
    if (sgErr) throw new Error(`games read-back: ${sgErr.message}`);

    const batches = await pooled(storedGames!, async (g) => {
      const html = await fetchHtml(`${BASE}/?view=gameplay&game=${g.euf_game_id}`);
      if (!html) return [];
      const blocks = parseGameplay(html);
      if (blocks.length < 2) return [];
      // Block order is home then away, matching the games-table column order.
      const sides = [g.home_team_id, g.away_team_id];
      return blocks.slice(0, 2).flatMap((block, i) =>
        block.map((p) => ({
          game_id: g.id,
          event_id: eventId,
          team_id: sides[i],
          full_name: p.name,
          jersey_number: p.jersey,
          goals: p.goals,
          assists: p.assists,
          total: p.total,
        })),
      );
    });

    const statRows = batches.flat();
    gamesWithStats = batches.filter((b) => b.length > 0).length;
    statLines = statRows.length;
    for (let i = 0; i < statRows.length; i += 500) {
      const { error } = await supabase
        .from('euf_game_player_stats')
        .upsert(statRows.slice(i, i + 500), { onConflict: 'game_id,team_id,full_name' });
      if (error) throw new Error(`game stats upsert: ${error.message}`);
    }
  }

  return {
    season,
    event: body.name ?? season,
    teams: teamRows.length,
    skippedTeams,
    rosterPlayers: rosterRows.length,
    games: gameRows.length,
    unresolvedGameTeams: unresolved,
    gamesWithStats,
    statLines,
  };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  try {
    const body = (await req.json()) as IngestBody;
    const result = await ingest(db(), body);
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err instanceof Error ? err.message : err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

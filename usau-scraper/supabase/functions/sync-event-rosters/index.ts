// sync-event-rosters: scrape per-team rosters + per-event player stats
// (goals/assists) for one event.
//
// Request body: { slug: string }
//
// For each team already in usau_event_teams for that event, hit
// /teams/events/Eventteam/?EventTeamId={id} and parse:
//   - The roster table (#CT_Main_0_ucTeamDetails_gvList) → usau_players +
//     usau_rosters
//   - The goals leaderboard (#CT_Right_1_gvListGoals) → usau_player_event_stats
//   - The assists leaderboard (#CT_Right_1_gvListAssists) → same
//
// Player identity: USAU doesn't expose a persistent player ID on team
// pages, just display names. We use (team_id, lower(name)) as the natural
// key — meaning "Nick Tolfa on Revolver" and "Nick Tolfa on PoNY" are two
// separate rows. That's accurate to what the source actually publishes.

import { fetchHtml } from '../_shared/http.ts';
import { parseHtml, teamUrlByEventTeamId } from '../_shared/parse.ts';
import { supabase, withRunLogging } from '../_shared/supabase.ts';

interface RosterPlayer {
  jersey: string | null;
  name: string;
  pronouns: string | null;
  height: string | null;
}

interface StatLine {
  name: string;
  value: number | null;
}

interface TeamPageParse {
  roster: RosterPlayer[];
  goals: StatLine[];
  assists: StatLine[];
}

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

function parseTeamPage(html: string): TeamPageParse {
  const $ = parseHtml(html);

  // Roster: #CT_Main_0_ucTeamDetails_gvList tr
  // Columns: jersey, name, pronouns, ?, height, points
  const roster: RosterPlayer[] = [];
  $('#CT_Main_0_ucTeamDetails_gvList tr').each((_, tr) => {
    const $tr = $(tr);
    const $cells = $tr.children('td');
    if ($cells.length === 0) return;

    const jersey = $cells.eq(0).text().trim() || null;
    const name = $cells.eq(1).text().trim();
    if (!name) return;
    const pronouns = $cells.eq(2).text().trim() || null;
    const height = $cells.eq(4).text().trim() || null;
    roster.push({ jersey, name, pronouns, height });
  });

  const parseStatTable = (selector: string): StatLine[] => {
    const out: StatLine[] = [];
    $(`${selector} tr`).each((_, tr) => {
      const $tr = $(tr);
      const $cells = $tr.children('td');
      if ($cells.length === 0) return;
      const name = $cells.eq(0).text().trim();
      if (!name) return;
      const raw = $cells.eq(1).text().trim();
      const num = raw.match(/^(\d+)$/);
      out.push({ name, value: num ? parseInt(num[1], 10) : null });
    });
    return out;
  };

  return {
    roster,
    goals: parseStatTable('#CT_Right_1_gvListGoals'),
    assists: parseStatTable('#CT_Right_1_gvListAssists'),
  };
}

// ────────────────────────────────────────────────────────────
// Per-team sync
// ────────────────────────────────────────────────────────────

interface SyncResult {
  team: string;
  rosterSize: number;
  withGoals: number;
  withAssists: number;
  skipped?: boolean;
  error?: string;
}

async function syncTeam(
  db: ReturnType<typeof supabase>,
  eventID: string,
  eventTeamId: string,
  teamUUID: string,
  teamName: string,
  season: number,
): Promise<SyncResult> {
  const url = teamUrlByEventTeamId(eventTeamId);
  let html: string;
  try {
    html = await fetchHtml(url);
  } catch (err) {
    return {
      team: teamName,
      rosterSize: 0,
      withGoals: 0,
      withAssists: 0,
      skipped: true,
      error: stringifyErr(err),
    };
  }

  const { roster, goals, assists } = parseTeamPage(html);
  if (roster.length === 0) {
    return { team: teamName, rosterSize: 0, withGoals: 0, withAssists: 0, skipped: true };
  }

  // Merge goals + assists by lowercased name so we can join them to
  // roster players.
  const statsByName = new Map<string, { goals: number | null; assists: number | null }>();
  for (const g of goals) {
    statsByName.set(g.name.toLowerCase(), { goals: g.value, assists: null });
  }
  for (const a of assists) {
    const existing = statsByName.get(a.name.toLowerCase()) ?? { goals: null, assists: null };
    existing.assists = a.value;
    statsByName.set(a.name.toLowerCase(), existing);
  }

  let withGoals = 0;
  let withAssists = 0;

  // Existing roster on this team this season — used to dedupe by name.
  const { data: existingRoster } = await db
    .from('usau_rosters')
    .select('player_id, usau_players(display_name)')
    .eq('team_id', teamUUID)
    .eq('season', season);

  const playerByName = new Map<string, string>();
  for (const r of existingRoster ?? []) {
    const dn = (r.usau_players as { display_name: string } | null)?.display_name;
    if (dn) playerByName.set(dn.toLowerCase(), r.player_id);
  }

  for (const p of roster) {
    const lowerName = p.name.toLowerCase();
    let playerUUID = playerByName.get(lowerName);

    if (!playerUUID) {
      const { data: created, error: createErr } = await db
        .from('usau_players')
        .insert({ display_name: p.name })
        .select('id')
        .single();
      if (createErr) throw new Error(`insert usau_players(${p.name}): ${stringifyErr(createErr)}`);
      playerUUID = created.id;
      playerByName.set(lowerName, playerUUID);
    }

    const { error: rosterErr } = await db.from('usau_rosters').upsert(
      {
        team_id: teamUUID,
        season,
        player_id: playerUUID,
        jersey_number: p.jersey,
      },
      { onConflict: 'team_id,season,player_id', ignoreDuplicates: false },
    );
    if (rosterErr) throw new Error(`usau_rosters upsert: ${stringifyErr(rosterErr)}`);

    const stats = statsByName.get(lowerName);
    if (stats && (stats.goals != null || stats.assists != null)) {
      if (stats.goals != null) withGoals++;
      if (stats.assists != null) withAssists++;
      const { error: statErr } = await db.from('usau_player_event_stats').upsert(
        {
          player_id: playerUUID,
          event_id: eventID,
          team_id: teamUUID,
          goals: stats.goals,
          assists: stats.assists,
          scraped_at: new Date().toISOString(),
        },
        { onConflict: 'player_id,event_id', ignoreDuplicates: false },
      );
      if (statErr) throw new Error(`usau_player_event_stats upsert: ${stringifyErr(statErr)}`);
    }
  }

  await db
    .from('usau_teams')
    .update({ last_scraped_at: new Date().toISOString() })
    .eq('id', teamUUID);

  return { team: teamName, rosterSize: roster.length, withGoals, withAssists };
}

// ────────────────────────────────────────────────────────────
// Entry point
// ────────────────────────────────────────────────────────────

interface RequestBody {
  slug?: string;
  /** When set, scrape ONLY this team's roster (single-team mode). Keeps each
   *  invocation small so it fits the edge walltime budget — the dispatcher
   *  (sync-event-rosters-dispatch) fans one of these out per team. When absent,
   *  the function scrapes every team in the event (legacy; fine for small
   *  events / manual one-offs but can exceed walltime on 13+-team events). */
  teamId?: string;
}

async function run(body: RequestBody) {
  const slug = body.slug?.trim();
  if (!slug) throw new Error('Request body must include { slug }');
  const onlyTeamId = body.teamId?.trim() || null;

  const db = supabase();

  const { data: event, error: eventErr } = await db
    .from('usau_events')
    .select('id, season')
    .eq('usau_slug', slug)
    .maybeSingle();
  if (eventErr) throw new Error(`load event: ${stringifyErr(eventErr)}`);
  if (!event) throw new Error(`event '${slug}' not found — run sync-event-details first`);

  // Use usau_event_team_url_id (the base64 per-event id used by USAU team
  // page URLs), not the persistent usau_event_team_id (which is the
  // numeric team id since the ultirzr ingest). Skip rows where the URL id
  // hasn't been resolved yet — those need resolve-event-team-urls first.
  let ptQuery = db
    .from('usau_event_teams')
    .select('team_id, usau_event_team_url_id, usau_teams(name)')
    .eq('event_id', event.id)
    .not('usau_event_team_url_id', 'is', null);
  if (onlyTeamId) ptQuery = ptQuery.eq('team_id', onlyTeamId);
  const { data: participations, error: ptErr } = await ptQuery;
  if (ptErr) throw new Error(`load event_teams: ${stringifyErr(ptErr)}`);
  if (!participations || participations.length === 0) {
    throw new Error(
      `no participations with usau_event_team_url_id for '${slug}' — ` +
        `run resolve-event-team-urls first`,
    );
  }

  const results: SyncResult[] = [];
  for (const p of participations) {
    const teamName = (p.usau_teams as { name: string } | null)?.name ?? '?';
    results.push(
      await syncTeam(
        db,
        event.id,
        p.usau_event_team_url_id!,
        p.team_id,
        teamName,
        event.season,
      ),
    );
  }

  const totalRoster = results.reduce((s, r) => s + r.rosterSize, 0);
  const totalGoals = results.reduce((s, r) => s + r.withGoals, 0);
  const totalAssists = results.reduce((s, r) => s + r.withAssists, 0);

  return {
    rowsProcessed: totalRoster + totalGoals + totalAssists,
    result: {
      slug,
      teams: results.length,
      players: totalRoster,
      stats: { goals: totalGoals, assists: totalAssists },
      perTeam: results,
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
      const qSlug = url.searchParams.get('slug');
      if (qSlug) body.slug = qSlug;
      const qTeam = url.searchParams.get('teamId');
      if (qTeam) body.teamId = qTeam;
    }
  } catch {
    // ok
  }

  try {
    const res = await withRunLogging(
      'sync-event-rosters',
      { slug: body.slug ?? null, teamId: body.teamId ?? null },
      () => run(body),
    );
    return Response.json({ ok: true, ...res });
  } catch (err) {
    const message = stringifyErr(err);
    console.error('[sync-event-rosters] failed:', message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
});

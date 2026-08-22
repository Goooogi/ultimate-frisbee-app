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
//
// Rosters are PER EVENT. USAU publishes a different roster for each event a
// team attends (Chain Lightning 2026: 19 at Pro-Elite Challenge East, 20 at
// Elite Select Challenge, 12 in common), so usau_rosters rows carry event_id
// and are keyed (team_id, season, event_id, player_id). Before that key
// existed, the second event scraped silently overwrote the first.
//
// If an event's URL ids haven't been resolved yet this function resolves them
// on demand (invoking resolve-event-team-urls for that slug) rather than
// failing — that stage used to be a separate manual prerequisite and silently
// left 11% of 2026 participations unscrapeable.

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

    // event_id is part of the key: USAU rosters are PER EVENT, and without it
    // the second event scraped for a team-season overwrote the first (PEC East
    // lost Selfridge/Poe to the ESC scrape). See the 20260821140000 migration.
    const { error: rosterErr } = await db.from('usau_rosters').upsert(
      {
        team_id: teamUUID,
        season,
        event_id: eventID,
        player_id: playerUUID,
        jersey_number: p.jersey,
      },
      { onConflict: 'team_id,season,event_id,player_id', ignoreDuplicates: false },
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
  // numeric team id since the ultirzr ingest).
  const loadParticipations = async () => {
    let q = db
      .from('usau_event_teams')
      .select('team_id, usau_event_team_url_id, usau_teams(name)')
      .eq('event_id', event.id)
      .not('usau_event_team_url_id', 'is', null);
    if (onlyTeamId) q = q.eq('team_id', onlyTeamId);
    const { data, error } = await q;
    if (error) throw new Error(`load event_teams: ${stringifyErr(error)}`);
    return data ?? [];
  };

  let participations = await loadParticipations();

  // Self-heal instead of erroring out. The URL token is scraped from the same
  // schedule page this pipeline already walks, but it used to live in a
  // separate stage (resolve-event-team-urls) that had to be run FIRST and by
  // hand — 11% of 2026 participations were left unresolved, so their rosters
  // were never fetchable and the miss was silent. Resolve on demand, then retry.
  let resolved = 0;
  if (participations.length === 0) {
    const { data: pending } = await db
      .from('usau_event_teams')
      .select('team_id')
      .eq('event_id', event.id)
      .is('usau_event_team_url_id', null);
    if ((pending ?? []).length > 0) {
      console.log(
        `[sync-event-rosters] '${slug}': ${pending!.length} unresolved url ids — resolving now`,
      );
      const { error: invokeErr } = await db.functions.invoke('resolve-event-team-urls', {
        body: { slug, limit: 1 },
      });
      if (invokeErr) {
        throw new Error(`resolve-event-team-urls('${slug}'): ${stringifyErr(invokeErr)}`);
      }
      participations = await loadParticipations();
      resolved = participations.length;
    }
  }

  if (participations.length === 0) {
    throw new Error(
      `no participations with usau_event_team_url_id for '${slug}' — ` +
        `resolve-event-team-urls found no schedule page to resolve them from`,
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
      /** Non-zero when this run had to resolve URL ids before it could scrape. */
      resolvedUrlIds: resolved,
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

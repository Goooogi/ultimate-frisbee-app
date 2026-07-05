// wfdf-ingest — ingest one WFDF "Worlds" event from the results static cache.
//
// Operator-driven (no cron — matches the backfill rule). POST a single event
// base URL; the function self-discovers everything from the event's heartbeat
// and upserts the whole event: divisions, teams, named rosters, and games.
//
// Request body: { "base": "https://wmucc.wfdf.sport" }
//   base = any modern WFDF event root — a subdomain (https://wmucc.wfdf.sport)
//   OR a path event (https://results.wfdf.sport/wjuc-2026). The heartbeat at
//   {base}/live/data/_heartbeat.json self-describes season + static path.
//
// Data model (see memory project_wfdf_results_source):
//   {origin}{STATIC_CACHE_BASE_URL}{season}_{entity}.json
//   reference.json → season/series/pools/teams/countries (the master join)
//   games.json     → scores + spirit
//   teams_{id}.json→ per-team named roster + record + spirit rollups
//
// Only MODERN events (2025+) use this static cache. Legacy (≤2024) events run
// Ultiorganizer HTML and need a different scraper — this function 400s on them.
//
// Auto-injected by Supabase: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { ingestLegacy, type LegacyIngestConfig } from './legacy.ts';

const UA = 'Mozilla/5.0 (the-layout/wfdf-ingest)';
const FETCH_DELAY_MS = 120; // polite pacing between the per-team roster fetches
const ROSTER_CONCURRENCY = 6;

function db(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  return createClient(url, key, { auth: { persistSession: false } });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson(url: string): Promise<any> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      const ct = res.headers.get('content-type') || '';
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      // The SPA returns an HTML 200 fallback for missing files — reject those.
      if (!ct.includes('json')) throw new Error(`not JSON (${ct}) for ${url}`);
      return await res.json();
    } catch (err) {
      if (attempt === 1) throw err;
      await sleep(600);
    }
  }
}

// ── Classify the event kind from its season id / name / national flag ────────
function classifyKind(seasonId: string, isNational: boolean): string {
  const s = seasonId.toLowerCase();
  if (s.includes('wbuc') || s.includes('beach')) return 'beach';
  if (s.includes('wjuc') || s.includes('juc')) return 'junior';
  if (s.includes('u24')) return 'u24';
  if (s.includes('wmucc') || s.includes('mucc')) return 'masters';
  if (s.includes('wcc') || s.includes('cc')) return 'club';
  return isNational ? 'national' : 'other';
}

// Build "First Last" for name-matching. Falls back to whichever half exists.
function fullName(first?: string, last?: string): string {
  return [first, last].filter((x) => x && String(x).trim()).join(' ').trim();
}

interface IngestResult {
  season: string;
  event: string;
  divisions: number;
  teams: number;
  rosterPlayers: number;
  games: number;
}

async function ingest(base: string, seasonOverride?: string): Promise<IngestResult> {
  const supabase = db();
  const cleanBase = base.replace(/\/$/, '');
  const origin = new URL(cleanBase).origin;

  // 1. Heartbeat self-describes season + static path. Join STATIC_CACHE_BASE_URL
  //    to the ORIGIN (it's absolute-from-root; path events already include the
  //    path segment, so joining to cleanBase would double it up).
  //
  // Most events carry a full `config` block. A few older-but-still-static
  // events (e.g. AOUC 2025, app_version 1.8.x) ship a MINIMAL heartbeat with no
  // config — for those we derive the season id from the caller override, else
  // from the schedule page's `season=` param, and assume the default /live/data
  // static path.
  const hb = await getJson(`${cleanBase}/live/data/_heartbeat.json`).catch(() => ({}));
  const cfg = hb.config ?? {};
  let seasonId: string = String(cfg.LIVE_SEASON_ID || seasonOverride || '').replace(
    /[^a-zA-Z0-9]/g,
    '',
  );
  if (!seasonId) {
    // Scrape the schedule page for its season= param.
    try {
      const html = await (await fetch(`${cleanBase}/?view=games`, {
        headers: { 'User-Agent': UA, Accept: 'text/html' },
      })).text();
      const m = html.match(/[?&](?:sel)?season=([A-Za-z0-9_-]+)/);
      if (m) seasonId = m[1].replace(/[^a-zA-Z0-9]/g, '');
    } catch {
      // fall through to the error below
    }
  }
  if (!seasonId) throw new Error('no LIVE_SEASON_ID (heartbeat + schedule both empty)');
  // Static-cache base. Prefer the config value; otherwise derive it from the
  // event path — a subdomain event (https://x.wfdf.sport) uses /live/data/, a
  // path event (https://results.wfdf.sport/aouc) uses /aouc/live/data/.
  const pathPrefix = new URL(cleanBase).pathname.replace(/\/$/, ''); // '' or '/aouc'
  const staticBase = `${origin}${cfg.STATIC_CACHE_BASE_URL || `${pathPrefix}/live/data/`}`;
  const dataUrl = (entity: string) => `${staticBase}${seasonId}_${entity}.json?cb=${Date.now()}`;

  // 2. Reference = master join.
  const ref = await getJson(dataUrl('reference'));
  const season = ref.season ?? {};
  const seriesById = new Map<number, any>((ref.series ?? []).map((s: any) => [s.series_id, s]));
  const teamsById = new Map<number, any>((ref.teams ?? []).map((t: any) => [t.team_id, t]));
  const countriesById = new Map<number, any>((ref.countries ?? []).map((c: any) => [c.country_id, c]));
  const poolsById = new Map<number, any>((ref.pools ?? []).map((p: any) => [p.pool_id, p]));

  const year = Number(String(season.starttime || '').slice(0, 4)) || new Date().getUTCFullYear();
  const isNational = Number(season.isnationalteams) === 1;
  const kind = classifyKind(seasonId, isNational);

  // 3. Upsert the event row.
  const { data: eventRow, error: evErr } = await supabase
    .from('wfdf_events')
    .upsert(
      {
        season_id: seasonId,
        slug: seasonId,
        name: season.name || seasonId,
        year,
        kind,
        location: cfg.TOURNAMENT_LOCATION || null,
        start_date: (season.starttime || '').slice(0, 10) || null,
        end_date: (season.endtime || '').slice(0, 10) || null,
        is_national_teams: isNational,
        logo_url: cfg.HOME_LOGO_PATH ? `${origin}${cfg.HOME_LOGO_PATH}` : null,
        source_origin: origin,
        static_base: cfg.STATIC_CACHE_BASE_URL,
        last_scraped_at: new Date().toISOString(),
        last_scraped_status: 'ok',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'season_id' },
    )
    .select('id')
    .single();
  if (evErr) throw evErr;
  const eventId = eventRow.id as string;

  // 4. Divisions (series). Upsert, then map series_id → our uuid.
  const divRows = (ref.series ?? []).map((s: any) => ({
    event_id: eventId,
    wfdf_series_id: s.series_id,
    name: s.name,
    ordering: s.ordering ?? null,
  }));
  if (divRows.length) {
    const { error } = await supabase
      .from('wfdf_divisions')
      .upsert(divRows, { onConflict: 'event_id,wfdf_series_id' });
    if (error) throw error;
  }
  const { data: divs } = await supabase
    .from('wfdf_divisions')
    .select('id, wfdf_series_id')
    .eq('event_id', eventId);
  const divUuidBySeries = new Map<number, string>((divs ?? []).map((d: any) => [d.wfdf_series_id, d.id]));

  // 5. Teams (from reference.teams). Basic row now; record/spirit rollups get
  //    filled from the per-team detail below.
  const teamRows = (ref.teams ?? []).map((t: any) => {
    const country = countriesById.get(t.country);
    return {
      event_id: eventId,
      wfdf_team_id: t.team_id,
      division_id: divUuidBySeries.get(t.series) ?? null,
      name: t.name,
      abbreviation: t.abbreviation ?? null,
      club_name: t.clubname ?? t.club ?? null,
      country_code: country?.abbreviation ?? null,
      country_name: country?.name ?? null,
      flag_file: country?.flagfile ?? null,
      seed: t.rank ?? t.seed ?? null,
      final_standing: t.final_standing_calculated || null,
      updated_at: new Date().toISOString(),
    };
  });
  if (teamRows.length) {
    const { error } = await supabase
      .from('wfdf_teams')
      .upsert(teamRows, { onConflict: 'event_id,wfdf_team_id' });
    if (error) throw error;
  }
  const { data: teamRowsDb } = await supabase
    .from('wfdf_teams')
    .select('id, wfdf_team_id')
    .eq('event_id', eventId);
  const teamUuidByWfdf = new Map<number, string>((teamRowsDb ?? []).map((t: any) => [t.wfdf_team_id, t.id]));

  // 6. Per-team rosters + record rollups (teams_{id}.json). Bounded concurrency.
  let rosterPlayers = 0;
  const teamIds = [...teamsById.keys()];
  for (let i = 0; i < teamIds.length; i += ROSTER_CONCURRENCY) {
    const batch = teamIds.slice(i, i + ROSTER_CONCURRENCY);
    await Promise.all(
      batch.map(async (wfdfTeamId) => {
        const teamUuid = teamUuidByWfdf.get(wfdfTeamId);
        if (!teamUuid) return;
        let detail: any;
        try {
          detail = await getJson(dataUrl(`teams_${wfdfTeamId}`));
        } catch {
          return; // a missing per-team file shouldn't abort the whole ingest
        }
        // Record + spirit rollup back onto the team row.
        const pts = detail.points ?? {};
        const st = detail.stats ?? {};
        await supabase
          .from('wfdf_teams')
          .update({
            games: st.games ?? null,
            wins: st.wins ?? null,
            losses: st.games != null && st.wins != null ? st.games - st.wins : null,
            scores_for: pts.scores ?? null,
            scores_against: pts.against ?? null,
            spirit_avg: pts.spiritavg ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', teamUuid);

        // Named roster.
        const players = (detail.players ?? []).filter((p: any) => p && p.player_id != null);
        if (players.length) {
          const rows = players.map((p: any) => ({
            team_id: teamUuid,
            event_id: eventId,
            wfdf_player_id: p.player_id,
            first_name: p.firstname ?? null,
            last_name: p.lastname ?? null,
            full_name: fullName(p.firstname, p.lastname) || `Player ${p.player_id}`,
            jersey_number: p.num != null ? String(p.num) : null,
            goals: p.done ?? null,
            assists: p.fedin ?? null,
            callahans: p.callahan ?? null,
            total: p.total ?? null,
            games: p.games ?? null,
          }));
          const { error } = await supabase
            .from('wfdf_rosters')
            .upsert(rows, { onConflict: 'team_id,wfdf_player_id' });
          if (!error) rosterPlayers += rows.length;
        }
        await sleep(FETCH_DELAY_MS);
      }),
    );
  }

  // 7. Games (scores + spirit). Division inferred from the home team's series.
  const games = (await getJson(dataUrl('games'))).games ?? [];
  const gameRows = games.map((g: any) => {
    const home = teamsById.get(g.hometeam);
    const pool = poolsById.get(g.pool);
    const isBracket = pool ? Number(pool.type) !== 1 || Number(pool.placementpool) === 1 : false;
    const statusMap: Record<string, string> = {
      completed: 'completed',
      inprogress: 'in_progress',
      scheduled: 'scheduled',
    };
    const t = g.time_utc || g.time || null;
    return {
      event_id: eventId,
      wfdf_game_id: g.game_id,
      division_id: home ? divUuidBySeries.get(home.series) ?? null : null,
      home_team_id: teamUuidByWfdf.get(g.hometeam) ?? null,
      away_team_id: teamUuidByWfdf.get(g.visitorteam) ?? null,
      home_score: g.homescore ?? null,
      away_score: g.visitorscore ?? null,
      home_sotg: g.homesotg ?? null,
      away_sotg: g.visitorsotg ?? null,
      pool_name: pool?.poolname ?? null,
      is_bracket: isBracket,
      status: statusMap[String(g.status)] ?? 'scheduled',
      scheduled_at: t ? new Date(t.replace(' ', 'T') + 'Z').toISOString() : null,
      updated_at: new Date().toISOString(),
    };
  });
  if (gameRows.length) {
    // Chunk to stay well under any payload limits.
    for (let i = 0; i < gameRows.length; i += 500) {
      const { error } = await supabase
        .from('wfdf_games')
        .upsert(gameRows.slice(i, i + 500), { onConflict: 'event_id,wfdf_game_id' });
      if (error) throw error;
    }
  }

  return {
    season: seasonId,
    event: season.name || seasonId,
    divisions: divRows.length,
    teams: teamRows.length,
    rosterPlayers,
    games: gameRows.length,
  };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // empty body ok — we'll error on missing base below
  }

  // ── Live-dispatch mode (cron) ────────────────────────────────────────────
  // { "dispatch": "live" } → re-ingest every MODERN WFDF event currently in its
  // date window (start_date ≤ today ≤ end_date). Modern events are the ones the
  // static-cache path can refresh cheaply (last_scraped_status = 'ok', not the
  // 'ok-legacy' Ultiorganizer ones). Used by the every-15-min cron so a live
  // tournament (e.g. WMUCC / WJUC) stays fresh; idle when nothing is on.
  if (body?.dispatch === 'live') {
    const supabase = db();
    const today = new Date().toISOString().slice(0, 10);
    const { data: events, error } = await supabase
      .from('wfdf_events')
      .select('slug, name, source_origin, start_date, end_date, last_scraped_status')
      .eq('last_scraped_status', 'ok') // modern static-cache events only
      .lte('start_date', today)
      .gte('end_date', today);
    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const live = (events ?? []).filter((e: any) => e.source_origin);
    const results: any[] = [];
    // Sequential — polite to the source, and each event's ingest is quick.
    for (const e of live) {
      try {
        const r = await ingest(e.source_origin as string);
        results.push({ slug: e.slug, ok: true, teams: r.teams, games: r.games });
      } catch (err) {
        results.push({ slug: e.slug, ok: false, error: err instanceof Error ? err.message : String(err) });
        console.error(`[wfdf-ingest] live re-ingest failed for ${e.slug}:`, err);
      }
    }
    return new Response(JSON.stringify({ ok: true, mode: 'dispatch-live', liveEvents: live.length, results }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const base = body?.base;
  if (!base || typeof base !== 'string' || !/^https?:\/\//.test(base)) {
    return new Response(
      JSON.stringify({ error: 'body must be { base: "https://<event>.wfdf.sport" }' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  try {
    // MODERN vs LEGACY: modern events self-describe via a heartbeat. If that's
    // absent, it's an older Ultiorganizer event → the legacy HTML path. The
    // caller may pass an explicit `legacy` config to override auto-detection
    // (e.g. to force the season param for a year-less slug).
    const legacyOverride = body?.legacy as Partial<LegacyIngestConfig> | undefined;
    const cleanBase = base.replace(/\/$/, '');
    let hb: any = null;
    if (!legacyOverride) {
      hb = await getJson(`${cleanBase}/live/data/_heartbeat.json`).catch(() => null);
    }

    if (hb && !legacyOverride) {
      const result = await ingest(base, body?.season);
      return new Response(JSON.stringify({ ok: true, mode: 'modern', ...result }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Legacy path — resolve the season + metadata (from the body override, else
    // scrape the schedule page <title> like "Schedule WMUCC 2022").
    const cfg = await resolveLegacyConfig(cleanBase, legacyOverride);
    if (!cfg) {
      return new Response(
        JSON.stringify({
          ok: false,
          error:
            'not a modern event (no heartbeat) and could not resolve legacy season — pass { legacy: { season, name, year } }',
        }),
        { status: 422, headers: { 'Content-Type': 'application/json' } },
      );
    }
    const result = await ingestLegacy(db(), cfg);
    return new Response(JSON.stringify({ ok: true, mode: 'legacy', ...result }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[wfdf-ingest] failed:', err);
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});

// ── Legacy config resolution ─────────────────────────────────────────────────
// Derive { season, name, year, kind, isNational } for a legacy Ultiorganizer
// event from its schedule-page <title> (e.g. "Schedule WMUCC 2022") + the
// season= param used by its view links. Body `override` wins per-field.
async function resolveLegacyConfig(
  base: string,
  override?: Partial<LegacyIngestConfig>,
): Promise<LegacyIngestConfig | null> {
  let season = override?.season ?? '';
  let name = override?.name ?? '';
  let year = override?.year ?? 0;

  if (!season || !name || !year) {
    // Fetch the SCHEDULE view — its <title> is reliably "Schedule XXX YYYY"
    // (the bare root redirects to a Teams page titled just "Teams").
    let html = '';
    try {
      const res = await fetch(`${base}/?view=games`, {
        headers: { 'User-Agent': UA, Accept: 'text/html' },
      });
      html = await res.text();
    } catch {
      return override?.season ? (override as LegacyIngestConfig) : null;
    }
    // season= param (the one used by view links, not selseason).
    if (!season) {
      const counts = new Map<string, number>();
      for (const m of html.matchAll(/[?&](?:sel)?season=([A-Za-z0-9_-]+)/g)) {
        counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
      }
      season = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    }
    // name + year from <title> "Schedule WMUCC 2022".
    const titleM = html.match(/<title>\s*(?:Schedule\s+)?([^<]+?)\s*<\/title>/i);
    if (titleM) {
      const t = titleM[1].replace(/\s*[-–].*$/, '').trim();
      if (!name && /20\d{2}/.test(t) && !/^schedule$/i.test(t)) name = t;
      if (!year) {
        const ym = t.match(/(20\d{2})/);
        if (ym) year = Number(ym[1]);
      }
    }
    // Year fallback: from the season param digits.
    if (!year && season) {
      const ym = season.match(/(20\d{2})|(\d{2})$/);
      if (ym) year = Number(ym[1] ?? (ym[2] ? `20${ym[2]}` : ''));
    }
  }

  if (!season || !year) return null;
  // Name fallback: prettify the season id ("WMUCC2022" → "WMUCC 2022").
  if (!name) {
    const m = season.match(/^([A-Za-z]+?)-?(\d{2,4})$/);
    name = m ? `${m[1].toUpperCase()} ${m[2].length === 2 ? '20' + m[2] : m[2]}` : season;
  }

  const isNational =
    override?.isNational !== undefined
      ? override.isNational
      : /wbuc|wwuc|wjuc|wuc|wu24|pauc|aouc|aougc/i.test(season);
  const kind = classifyKind(season, isNational);

  return { base, season, name, year, kind: override?.kind ?? kind, isNational };
}

// pul-games-sync — scheduled PUL game scraper (Phase 2).
//
// Keeps pul_games + pul_game_player_stats current during the season. Designed
// to run hourly on weekends (Fri/Sat/Sun, Mar–Jul) via pg_cron — see the
// cron.schedule call in the migration / vault doc.
//
// Each run (incremental — cheap):
//   1. Open a pul_sync_log row (status 'running').
//   2. Fetch /schedule → insert any brand-new game ids.
//   3. Re-fetch only games that aren't 'final' yet (scheduled, or final w/ a
//      null score) PLUS all current-season games (to catch score/stat
//      corrections after a game completes). Each game fetch gets 1 retry.
//   4. Upsert games + replace box-score rows. Close the log row 'ok'.
//   5. On failure: close the log row 'error'. If the PREVIOUS completed run was
//      also 'error' (→ 2 in a row), send a Resend alert email and set
//      alert_sent. A single isolated failure does NOT email (one retry already
//      happened at the fetch level; the next hourly run is the second chance).
//
// Secrets (set via supabase secrets): RESEND_API, SEND_EMAIL.
// Auto-injected by Supabase: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { parseSchedule, parseGamePage, type ScheduledGame } from './scrape.ts';

const BASE = 'https://pul-stats-hub.pages.dev';
const UA = 'Mozilla/5.0 (the-layout/pul-games-sync)';
const FETCH_DELAY_MS = 300;
const ALERT_TO = 'huntermay@altiusapps.com';
// Current PUL season — bump each spring (the source publishes the new season's
// schedule before games are played; current-season games are always re-checked).
const CURRENT_SEASON = 2026;

function db(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  return createClient(url, key, { auth: { persistSession: false } });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Fetch with 1 retry (2 attempts total). Returns null on total failure. */
async function fetchHtml(path: string): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        headers: { 'User-Agent': UA, Accept: 'text/html' },
      });
      if (res.ok) return await res.text();
      // 4xx (other than 429) won't improve on retry — bail early.
      if (res.status < 500 && res.status !== 429) {
        throw new Error(`HTTP ${res.status} for ${path}`);
      }
      throw new Error(`Retryable HTTP ${res.status} for ${path}`);
    } catch (err) {
      if (attempt === 1) {
        console.error(`fetch failed (final) ${path}:`, err);
        return null;
      }
      await sleep(800);
    }
  }
  return null;
}

interface SyncResult {
  gamesChecked: number;
  gamesInserted: number;
  gamesUpdated: number;
  boxRows: number;
}

async function runSync(supabase: SupabaseClient): Promise<SyncResult> {
  // 1. Schedule → full game list.
  const schedHtml = await fetchHtml('/schedule');
  if (!schedHtml) throw new Error('Could not fetch /schedule (after retry).');
  const { games: scheduleGames, warnings } = parseSchedule(schedHtml);
  for (const w of warnings) console.warn('[schedule]', w);
  if (scheduleGames.length === 0) {
    throw new Error('Schedule parsed 0 games — source structure may have changed.');
  }

  // 2. What do we already have? Pull id + status + score to decide what to refetch.
  const { data: existingRows, error: exErr } = await supabase
    .from('pul_games')
    .select('id, season, status, away_score, home_score')
    .limit(100000);
  if (exErr) throw exErr;
  const existing = new Map(
    (existingRows ?? []).map((r) => [r.id as string, r as {
      id: string; season: number; status: string; away_score: number | null; home_score: number | null;
    }]),
  );

  // 3. Decide which games to (re)fetch:
  //    - any game not in the DB yet (new on /schedule)
  //    - any DB game that's not 'final', or 'final' with a null score
  //    - all current-season games (catch post-game stat corrections)
  const byId = new Map(scheduleGames.map((g) => [g.id, g]));
  const toFetch: ScheduledGame[] = [];
  let gamesInserted = 0;

  for (const g of scheduleGames) {
    const row = existing.get(g.id);
    if (!row) {
      gamesInserted++;
      toFetch.push(g);
      continue;
    }
    const incomplete = row.status !== 'final' || row.away_score === null || row.home_score === null;
    if (incomplete || g.season === CURRENT_SEASON) toFetch.push(g);
  }

  // 4. Fetch + upsert each.
  let gamesUpdated = 0;
  let boxRows = 0;
  const now = () => new Date().toISOString();

  for (let i = 0; i < toFetch.length; i++) {
    const g = toFetch[i];
    if (i > 0) await sleep(FETCH_DELAY_MS);
    const html = await fetchHtml(`/games/${g.id}`);
    if (!html) {
      console.warn(`[game] skip (fetch failed): ${g.id}`);
      continue;
    }
    const parsed = parseGamePage(html);
    for (const w of parsed.warnings) console.warn(`[game ${g.id}]`, w);

    const { error: upErr } = await supabase.from('pul_games').upsert(
      {
        id: g.id,
        season: g.season,
        week_label: g.weekLabel,
        week_num: g.weekNum,
        away_team_id: g.awayTeamId,
        home_team_id: g.homeTeamId,
        away_abbrev: g.awayAbbrev,
        home_abbrev: g.homeAbbrev,
        game_date: parsed.gameDate,
        location: parsed.location,
        away_score: parsed.awayScore,
        home_score: parsed.homeScore,
        status: parsed.status,
        updated_at: now(),
      },
      { onConflict: 'id' },
    );
    if (upErr) throw upErr;
    gamesUpdated++;

    // Replace box-score rows (delete-then-insert) only when we have them.
    if (parsed.playerStats.length > 0) {
      const { error: delErr } = await supabase
        .from('pul_game_player_stats')
        .delete()
        .eq('game_id', g.id);
      if (delErr) throw delErr;
      const rows = parsed.playerStats.map((p) => ({
        game_id: g.id,
        team_id: p.teamId,
        player_name: p.playerName,
        jersey_number: p.jerseyNumber,
        goals: p.goals,
        assists: p.assists,
        blocks: p.blocks,
        turnovers: p.turnovers,
        touches: p.touches,
        o_points: p.oPoints,
        d_points: p.dPoints,
        plus_minus: p.plusMinus,
        updated_at: now(),
      }));
      const { error: insErr } = await supabase.from('pul_game_player_stats').insert(rows);
      if (insErr) throw insErr;
      boxRows += rows.length;
    }
  }

  return { gamesChecked: toFetch.length, gamesInserted, gamesUpdated, boxRows };
}

/** Was the most recent COMPLETED run (before this one) an error? */
async function previousRunErrored(supabase: SupabaseClient, currentRunId: string): Promise<boolean> {
  const { data } = await supabase
    .from('pul_sync_log')
    .select('id, status')
    .neq('id', currentRunId)
    .not('finished_at', 'is', null)
    .order('started_at', { ascending: false })
    .limit(1);
  return (data?.[0]?.status ?? null) === 'error';
}

async function sendAlert(errorMessage: string): Promise<boolean> {
  const apiKey = Deno.env.get('RESEND_API');
  const from = Deno.env.get('SEND_EMAIL');
  if (!apiKey || !from) {
    console.error('Cannot send alert — RESEND_API / SEND_EMAIL not set.');
    return false;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `The Layout <${from}>`,
        to: ALERT_TO,
        subject: '⚠️ PUL games sync failed twice in a row',
        text:
          'The pul-games-sync edge function has failed on two consecutive runs.\n\n' +
          `Latest error:\n${errorMessage}\n\n` +
          'Check the pul_sync_log table and the function logs in the Supabase dashboard.\n' +
          'Source: pul-stats-hub.pages.dev (a structure change there is the most likely cause).',
      }),
    });
    if (!res.ok) {
      console.error('Resend alert failed:', res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error('Resend alert threw:', err);
    return false;
  }
}

Deno.serve(async () => {
  const supabase = db();

  // Open the log row.
  const { data: logRow, error: logErr } = await supabase
    .from('pul_sync_log')
    .insert({ status: 'running' })
    .select('id')
    .single();
  if (logErr) {
    console.error('Could not open log row:', logErr);
    return Response.json({ ok: false, error: 'log insert failed' }, { status: 500 });
  }
  const runId = logRow.id as string;

  try {
    const r = await runSync(supabase);
    await supabase
      .from('pul_sync_log')
      .update({
        status: 'ok',
        finished_at: new Date().toISOString(),
        games_checked: r.gamesChecked,
        games_inserted: r.gamesInserted,
        games_updated: r.gamesUpdated,
        box_rows: r.boxRows,
      })
      .eq('id', runId);
    return Response.json({ ok: true, ...r });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[pul-games-sync] failed:', message);

    // 2-consecutive-failures → alert.
    let alertSent = false;
    try {
      if (await previousRunErrored(supabase, runId)) {
        alertSent = await sendAlert(message);
      }
    } catch (alertErr) {
      console.error('alert decision/send failed:', alertErr);
    }

    await supabase
      .from('pul_sync_log')
      .update({
        status: 'error',
        finished_at: new Date().toISOString(),
        error: message,
        alert_sent: alertSent,
      })
      .eq('id', runId);

    return Response.json({ ok: false, error: message, alertSent }, { status: 500 });
  }
});

// score-fantasy: compute + persist fantasy scores.
//
// For every fantasy team, for every week that has LOCKED (its Friday has
// passed — games have begun/finished), score that week's FROZEN roster against
// the UFA per-game player stats and upsert one row per (team, week) into
// fantasy_scores. Cumulative team score = sum of its weekly rows (done in the
// read layer). Idempotent: re-running recomputes + upserts the same rows.
//
// Scope rule (confirmed with Hunter 2026-07-05): a week scores the roster saved
// FOR THAT WEEK. A team with no roster for a week gets no row for it (0). So a
// team created after a week locked doesn't retroactively score that week — it
// starts scoring from the next week it sets a lineup for.
//
// Request body (all optional): { "week": "week-10", "year": 2026 }
//   - week  → only (re)score that one week (fast, for a live-weekend refresh).
//   - year  → override the season (defaults to the current UFA season year).
//
// Auth: verify_jwt. Called by pg_cron with the vault service-role key.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

// ── Scoring engine (kept in lockstep with src/lib/fantasy/scoring.ts) ────────
// Duplicated here because edge functions can't import the app's src/. If the
// matrix changes, update BOTH. Values confirmed 2026-06-30.
type FantasyRole = 'offender' | 'defender';
const SCORING = {
  offender: { goal: 3, assist: 3, block: 2, turnover: -1 },
  defender: { goal: 2, assist: 2, block: 5, turnover: -1 },
  yardsPerPoint: 100,
} as const;

interface StatLine {
  goals: number;
  assists: number;
  blocks: number;
  turnovers: number;
  yards: number;
}

function scoreStatLine(line: StatLine, role: FantasyRole): number {
  const v = SCORING[role];
  const counting =
    line.goals * v.goal +
    line.assists * v.assist +
    line.blocks * v.block +
    line.turnovers * v.turnover;
  return counting + line.yards / SCORING.yardsPerPoint;
}

// ── UFA season year (mirrors src/lib/ufa/season.ts) ──────────────────────────
// UFA runs Apr–Aug; before April, the "current" season is the prior year's.
function currentSeasonYear(now = new Date()): number {
  const y = now.getUTCFullYear();
  return now.getUTCMonth() >= 3 ? y : y - 1; // month 3 = April
}

// ── Lock moment (mirrors src/lib/fantasy/weeks.ts lockWindowFor) ─────────────
// A week LOCKS — and thus becomes scorable — at its FIRST game's kickoff (the
// earliest Fri/Sat/Sun game; fall back to the earliest game overall). This is
// the same rule the app UI and the DB roster-lock trigger use. Previously this
// function stepped back to Friday 00:00, which considered a week scorable BEFORE
// its roster actually locked — harmless (stats are 0 until games play) but out
// of step with the rest of the system. Now all three agree on "first game".
function lockAtFor(startMsList: number[]): number | null {
  if (startMsList.length === 0) return null;
  const isWeekend = (ms: number) => {
    const d = new Date(ms).getUTCDay();
    return d === 5 || d === 6 || d === 0; // Fri/Sat/Sun (UTC — deploy runs UTC)
  };
  const sorted = [...startMsList].sort((a, b) => a - b);
  return sorted.find(isWeekend) ?? sorted[0];
}

function db(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required');
  return createClient(url, key, { auth: { persistSession: false } });
}

// Page helper — PostgREST caps a response at 1000 rows.
async function fetchAll<T>(
  supabase: SupabaseClient,
  build: (from: number, to: number) => any,
): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

interface GameRow { id: string; week: string | null; start_timestamp: string | null }
interface StatRow {
  game_id: string;
  player_id: string;
  goals: number; assists: number; blocks: number;
  throwaways: number; drops: number; stalls: number;
  yards_thrown: number; yards_received: number;
}
interface SlotRow { team_id: string; week: string; player_id: string; role: FantasyRole }

async function run(body: { week?: string; year?: number }) {
  const supabase = db();
  const year = body.year ?? currentSeasonYear();
  const nowMs = Date.now();

  // 1. Games for the season → week → { gameIds, lockAt }.
  const games = await fetchAll<GameRow>(supabase, (from, to) =>
    supabase
      .from('ufa_games')
      .select('id, week, start_timestamp')
      .eq('year', year)
      .not('week', 'is', null)
      .order('id', { ascending: true })
      .range(from, to),
  );

  const gamesByWeek = new Map<string, { ids: Set<string>; starts: number[] }>();
  for (const g of games) {
    if (!g.week) continue;
    let bucket = gamesByWeek.get(g.week);
    if (!bucket) { bucket = { ids: new Set(), starts: [] }; gamesByWeek.set(g.week, bucket); }
    bucket.ids.add(g.id);
    if (g.start_timestamp) {
      const t = new Date(g.start_timestamp).getTime();
      if (!Number.isNaN(t)) bucket.starts.push(t);
    }
  }

  // Only LOCKED weeks are scorable (their Friday has passed). Optionally narrow
  // to a single requested week.
  const scorableWeeks = [...gamesByWeek.entries()].filter(([week, b]) => {
    if (body.week && week !== body.week) return false;
    const lockAt = lockAtFor(b.starts);
    return lockAt != null && nowMs >= lockAt;
  }).map(([week]) => week);

  if (scorableWeeks.length === 0) {
    return { year, scoredWeeks: 0, teamsScored: 0, rowsUpserted: 0, note: 'no locked weeks to score' };
  }

  // 2. Roster slots for the scorable weeks (all teams).
  const slots = await fetchAll<SlotRow>(supabase, (from, to) =>
    supabase
      .from('fantasy_roster_slots')
      .select('team_id, week, player_id, role')
      .in('week', scorableWeeks)
      .order('team_id', { ascending: true })
      .range(from, to),
  );
  if (slots.length === 0) {
    return { year, scoredWeeks: scorableWeeks.length, teamsScored: 0, rowsUpserted: 0, note: 'no rosters for locked weeks' };
  }

  // 3. Per-game player stats for all games in the scorable weeks.
  const allGameIds = scorableWeeks.flatMap((w) => [...(gamesByWeek.get(w)?.ids ?? [])]);
  // player_id → week → summed stat line (a player might feature in >1 game/week).
  const statByGame = new Map<string, StatRow[]>(); // keyed by game_id for week lookup
  const stats = await fetchAll<StatRow>(supabase, (from, to) =>
    supabase
      .from('ufa_game_player_stats')
      .select('game_id, player_id, goals, assists, blocks, throwaways, drops, stalls, yards_thrown, yards_received')
      .in('game_id', allGameIds)
      .order('game_id', { ascending: true })
      .range(from, to),
  );
  for (const s of stats) {
    const arr = statByGame.get(s.game_id);
    if (arr) arr.push(s); else statByGame.set(s.game_id, [s]);
  }
  // week → player_id → StatLine (summed across that week's games)
  const weekPlayerLine = new Map<string, Map<string, StatLine>>();
  for (const week of scorableWeeks) {
    const perPlayer = new Map<string, StatLine>();
    for (const gid of gamesByWeek.get(week)?.ids ?? []) {
      for (const s of statByGame.get(gid) ?? []) {
        const line = perPlayer.get(s.player_id) ?? { goals: 0, assists: 0, blocks: 0, turnovers: 0, yards: 0 };
        line.goals += s.goals ?? 0;
        line.assists += s.assists ?? 0;
        line.blocks += s.blocks ?? 0;
        line.turnovers += (s.throwaways ?? 0) + (s.drops ?? 0) + (s.stalls ?? 0);
        line.yards += (s.yards_thrown ?? 0) + (s.yards_received ?? 0);
        perPlayer.set(s.player_id, line);
      }
    }
    weekPlayerLine.set(week, perPlayer);
  }

  // 4. Score each (team, week) from its frozen roster; upsert fantasy_scores.
  const byTeamWeek = new Map<string, SlotRow[]>();
  for (const s of slots) {
    const key = `${s.team_id}|${s.week}`;
    const arr = byTeamWeek.get(key);
    if (arr) arr.push(s); else byTeamWeek.set(key, [s]);
  }

  const upserts: { team_id: string; week: string; points: number; computed_at: string }[] = [];
  const scoredTeams = new Set<string>();
  for (const [key, roster] of byTeamWeek) {
    const [teamId, week] = key.split('|');
    const lines = weekPlayerLine.get(week);
    let points = 0;
    for (const slot of roster) {
      const line = lines?.get(slot.player_id);
      if (line) points += scoreStatLine(line, slot.role);
    }
    upserts.push({
      team_id: teamId,
      week,
      points: Math.round(points * 100) / 100, // 2dp storage precision
      computed_at: new Date().toISOString(),
    });
    scoredTeams.add(teamId);
  }

  // Chunked upsert on (team_id, week).
  for (let i = 0; i < upserts.length; i += 500) {
    const { error } = await supabase
      .from('fantasy_scores')
      .upsert(upserts.slice(i, i + 500), { onConflict: 'team_id,week' });
    if (error) throw error;
  }

  return {
    year,
    scoredWeeks: scorableWeeks.length,
    teamsScored: scoredTeams.size,
    rowsUpserted: upserts.length,
  };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  let body: { week?: string; year?: number } = {};
  try {
    body = await req.json();
  } catch { /* empty ok */ }

  try {
    const result = await run(body);
    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[score-fantasy] failed:', err);
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});

// score-fantasy: compute + persist fantasy scores — CONTEST-AWARE.
//
// Since the leagues/contests build (2026-08-15) every fantasy team belongs to a
// fantasy_contests row (global UFA pool included; legacy contest-less teams are
// folded into the global UFA contest for their season). Each run:
//
//   1. Refreshes fantasy_contest_periods via fantasy_rebuild_all_periods()
//      (SQL owns the lock schedule — this fn only READS periods).
//   2. For every non-complete contest, scores every LOCKED period's FROZEN
//      rosters against that contest's competition data and upserts one
//      fantasy_scores row per (team, period). Idempotent.
//
// Competition sources:
//   ufa  — ufa_game_player_stats per native week           (full statline)
//   pul  — pul_game_player_stats per week_label            (no yards)
//   wul  — wul_game_player_stats per synthesized week      (Monday buckets,
//          'week-N' by chronological order — MIRRORS fantasy_rebuild_contest_periods)
//   usau — usau_player_event_stats event totals (G/A only; no placement bonus
//          in v1 — final_placement coverage is too sparse to be fair)
//   wfdf — wfdf_rosters event totals (G/A/callahans) + final_standing bonus
//
// Scope rule (unchanged, confirmed 2026-07-05): a period scores the roster
// saved FOR that period. No roster → no row (0). New teams start scoring from
// the next period they set a lineup for.
//
// Request body (all optional): { "contest": "<uuid>" } → only score that one.
//
// Auth: verify_jwt. Called by pg_cron with the vault service-role key.
//
// ⚠️ MIRROR: the scoring matrices duplicate src/lib/fantasy/scoring.ts and
// src/lib/fantasy/event-adapter.ts (edge fns can't import src/). Change BOTH.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

// ── Scoring matrices (keep in lockstep with src/lib/fantasy/) ────────────────
type FantasyRole = 'offender' | 'defender' | 'flex';
const SCORING = {
  offender: { goal: 3, assist: 3, block: 2, turnover: -1 },
  defender: { goal: 2, assist: 2, block: 5, turnover: -1 },
  yardsPerPoint: 100,
} as const;

const EVENT_SCORING = { goal: 3, assist: 3, callahan: 5 } as const;

function placementBonus(placement: number | null | undefined): number {
  if (placement == null || placement < 1) return 0;
  if (placement === 1) return 30;
  if (placement === 2) return 20;
  if (placement <= 4) return 12;
  if (placement <= 8) return 6;
  return 0;
}

interface StatLine {
  goals: number;
  assists: number;
  blocks: number;
  turnovers: number;
  yards: number;
}

function scoreStatLine(line: StatLine, role: 'offender' | 'defender'): number {
  const v = SCORING[role];
  return (
    line.goals * v.goal +
    line.assists * v.assist +
    line.blocks * v.block +
    line.turnovers * v.turnover +
    line.yards / SCORING.yardsPerPoint
  );
}

function db(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required');
  return createClient(url, key, { auth: { persistSession: false } });
}

// Page helper — PostgREST caps a response at 1000 rows.
async function fetchAll<T>(
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

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ── Types ────────────────────────────────────────────────────────────────────

type Competition =
  | 'ufa'
  | 'pul'
  | 'wul'
  | 'usau-club-nationals'
  | 'usau-college-nationals'
  | 'wfdf-wucc';

interface ContestRow {
  id: string;
  league_id: string | null;
  competition: Competition;
  season_year: number;
  status: string;
  settings: { mode?: string; eventId?: string } | null;
}

interface PeriodRow {
  contest_id: string;
  period: string;
  lock_at: string | null;
  complete: boolean;
}

interface TeamRow {
  id: string;
  contest_id: string | null;
  league_id: string | null;
  season_year: number;
}

interface SlotRow {
  team_id: string;
  week: string;
  player_id: string;
  player_league: string;
  role: FantasyRole;
}

// ── Weekly-stats contexts (per competition+season, cached across contests) ──
// weekLines: period → playerKey → summed StatLine for that period.

type WeekLines = Map<string, Map<string, StatLine>>;

function addLine(
  weekLines: WeekLines,
  period: string,
  key: string,
  add: StatLine,
): void {
  let per = weekLines.get(period);
  if (!per) {
    per = new Map();
    weekLines.set(period, per);
  }
  const line = per.get(key) ?? { goals: 0, assists: 0, blocks: 0, turnovers: 0, yards: 0 };
  line.goals += add.goals;
  line.assists += add.assists;
  line.blocks += add.blocks;
  line.turnovers += add.turnovers;
  line.yards += add.yards;
  per.set(key, line);
}

async function ufaWeekLines(supabase: SupabaseClient, year: number): Promise<WeekLines> {
  const games = await fetchAll<{ id: string; week: string | null }>((from, to) =>
    supabase
      .from('ufa_games')
      .select('id, week')
      .eq('year', year)
      .not('week', 'is', null)
      .order('id')
      .range(from, to),
  );
  const weekOf = new Map(games.map((g) => [g.id, g.week as string]));
  const out: WeekLines = new Map();
  const ids = games.map((g) => g.id);
  for (const part of chunk(ids, 150)) {
    const stats = await fetchAll<Record<string, any>>((from, to) =>
      supabase
        .from('ufa_game_player_stats')
        .select('game_id, player_id, goals, assists, blocks, throwaways, drops, stalls, yards_thrown, yards_received')
        .in('game_id', part)
        .order('game_id')
        .range(from, to),
    );
    for (const s of stats) {
      const wk = weekOf.get(s.game_id);
      if (!wk) continue;
      addLine(out, wk, s.player_id, {
        goals: s.goals ?? 0,
        assists: s.assists ?? 0,
        blocks: s.blocks ?? 0,
        turnovers: (s.throwaways ?? 0) + (s.drops ?? 0) + (s.stalls ?? 0),
        yards: (s.yards_thrown ?? 0) + (s.yards_received ?? 0),
      });
    }
  }
  return out;
}

async function pulWeekLines(supabase: SupabaseClient, season: number): Promise<WeekLines> {
  const games = await fetchAll<{ id: string; week_label: string | null }>((from, to) =>
    supabase
      .from('pul_games')
      .select('id, week_label')
      .eq('season', season)
      .not('week_label', 'is', null)
      .order('id')
      .range(from, to),
  );
  const periodOf = new Map(games.map((g) => [g.id, g.week_label as string]));
  const out: WeekLines = new Map();
  for (const part of chunk(games.map((g) => g.id), 150)) {
    const stats = await fetchAll<Record<string, any>>((from, to) =>
      supabase
        .from('pul_game_player_stats')
        .select('game_id, player_name, goals, assists, blocks, turnovers')
        .in('game_id', part)
        .order('game_id')
        .range(from, to),
    );
    for (const s of stats) {
      const period = periodOf.get(s.game_id);
      if (!period) continue;
      addLine(out, period, s.player_name, {
        goals: s.goals ?? 0,
        assists: s.assists ?? 0,
        blocks: s.blocks ?? 0,
        turnovers: s.turnovers ?? 0,
        yards: 0, // PUL tracks no yardage
      });
    }
  }
  return out;
}

/** Monday (ISO week start) of a 'YYYY-MM-DD' date — the WUL synthesized-week
 *  bucket key. MIRRORS date_trunc('week', game_date) in
 *  fantasy_rebuild_contest_periods; both must bucket identically. */
function mondayKey(date: string): string | null {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
  return dt.toISOString().slice(0, 10);
}

async function wulWeekLines(supabase: SupabaseClient, season: number): Promise<WeekLines> {
  const games = await fetchAll<{ id: string; game_date: string | null }>((from, to) =>
    supabase
      .from('wul_games')
      .select('id, game_date')
      .eq('season', season)
      .not('game_date', 'is', null)
      .order('id')
      .range(from, to),
  );
  // Chronological Monday buckets → 'week-N' (mirrors the SQL dense_rank).
  const mondays = [...new Set(games.map((g) => mondayKey(g.game_date as string)).filter(Boolean))] as string[];
  mondays.sort();
  const labelOf = new Map(mondays.map((m, i) => [m, `week-${i + 1}`]));
  const periodOf = new Map(
    games.map((g) => [g.id, labelOf.get(mondayKey(g.game_date as string) ?? '') ?? null]),
  );

  const out: WeekLines = new Map();
  for (const part of chunk(games.map((g) => g.id), 150)) {
    const stats = await fetchAll<Record<string, any>>((from, to) =>
      supabase
        .from('wul_game_player_stats')
        .select('game_id, player_name, goals, assists, blocks, turnovers, throw_yards, receive_yards, total_yards')
        .in('game_id', part)
        .order('game_id')
        .range(from, to),
    );
    for (const s of stats) {
      const period = periodOf.get(s.game_id);
      if (!period) continue;
      addLine(out, period, s.player_name, {
        goals: s.goals ?? 0,
        assists: s.assists ?? 0,
        blocks: s.blocks ?? 0,
        turnovers: s.turnovers ?? 0,
        yards: s.total_yards ?? (s.throw_yards ?? 0) + (s.receive_yards ?? 0),
      });
    }
  }
  return out;
}

// ── Event contexts (per eventId): playerKey → event points ──────────────────

async function usauEventPoints(
  supabase: SupabaseClient,
  eventId: string,
  playerIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (playerIds.length === 0) return out;

  // NO placement bonus for USAU in v1: usau_event_teams.final_placement
  // coverage is sparse/inconsistent (verified 2026-08-15 — e.g. 42/48 at 2025
  // Club Nats, 0–8/40 at College), so a bonus would pay some teams and
  // silently skip others in the SAME event. G/A only until placement
  // derivation is built. WFDF keeps its bonus (final_standing is complete).

  // Event stat totals (G/A only — that's all USAU publishes).
  for (const part of chunk(playerIds, 150)) {
    const stats = await fetchAll<Record<string, any>>((from, to) =>
      supabase
        .from('usau_player_event_stats')
        .select('player_id, goals, assists')
        .eq('event_id', eventId)
        .in('player_id', part)
        .order('player_id')
        .range(from, to),
    );
    for (const s of stats) {
      const pts = (s.goals ?? 0) * EVENT_SCORING.goal + (s.assists ?? 0) * EVENT_SCORING.assist;
      out.set(s.player_id, (out.get(s.player_id) ?? 0) + pts);
    }
  }
  return out;
}

async function wfdfEventPoints(
  supabase: SupabaseClient,
  eventId: string,
  playerIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (playerIds.length === 0) return out;

  const teams = await fetchAll<{ id: string; final_standing: number | null }>((from, to) =>
    supabase
      .from('wfdf_teams')
      .select('id, final_standing')
      .eq('event_id', eventId)
      .order('id')
      .range(from, to),
  );
  const standingOf = new Map(teams.map((t) => [t.id, t.final_standing]));

  for (const part of chunk(playerIds, 150)) {
    const rows = await fetchAll<Record<string, any>>((from, to) =>
      supabase
        .from('wfdf_rosters')
        .select('id, team_id, goals, assists, callahans')
        .in('id', part)
        .order('id')
        .range(from, to),
    );
    for (const r of rows) {
      const pts =
        (r.goals ?? 0) * EVENT_SCORING.goal +
        (r.assists ?? 0) * EVENT_SCORING.assist +
        (r.callahans ?? 0) * EVENT_SCORING.callahan +
        placementBonus(standingOf.get(r.team_id));
      out.set(r.id, pts);
    }
  }
  return out;
}

// ── Main run ─────────────────────────────────────────────────────────────────

async function run(body: { contest?: string }) {
  const supabase = db();
  const nowMs = Date.now();

  // 1. Refresh the lock schedule (SQL owns it).
  const { error: rebuildErr } = await supabase.rpc('fantasy_rebuild_all_periods');
  if (rebuildErr) console.error('[score-fantasy] period rebuild failed:', rebuildErr.message);

  // 2. Contests to score.
  const contests = await fetchAll<ContestRow>((from, to) => {
    let q = supabase
      .from('fantasy_contests')
      .select('id, league_id, competition, season_year, status, settings')
      .neq('status', 'complete')
      .order('id')
      .range(from, to);
    if (body.contest) q = q.eq('id', body.contest);
    return q;
  });
  if (contests.length === 0) return { contestsScored: 0, rowsUpserted: 0, note: 'no contests' };

  // 3. Locked periods per contest.
  const periods = await fetchAll<PeriodRow>((from, to) =>
    supabase
      .from('fantasy_contest_periods')
      .select('contest_id, period, lock_at, complete')
      .in('contest_id', contests.map((c) => c.id))
      .order('contest_id')
      .range(from, to),
  );
  const lockedPeriods = new Map<string, Set<string>>(); // contest → periods
  for (const p of periods) {
    if (!p.lock_at || nowMs < new Date(p.lock_at).getTime()) continue;
    let set = lockedPeriods.get(p.contest_id);
    if (!set) {
      set = new Set();
      lockedPeriods.set(p.contest_id, set);
    }
    set.add(p.period);
  }

  // 4. Teams → contest. Legacy contest-less teams fold into the global UFA
  //    contest for their season (transition-window inserts).
  const teams = await fetchAll<TeamRow>((from, to) =>
    supabase
      .from('fantasy_teams')
      .select('id, contest_id, league_id, season_year')
      .order('id')
      .range(from, to),
  );
  const globalUfaByYear = new Map<number, string>();
  for (const c of contests) {
    if (c.league_id === null && c.competition === 'ufa') globalUfaByYear.set(c.season_year, c.id);
  }
  const contestOfTeam = new Map<string, string>();
  for (const t of teams) {
    const cid = t.contest_id ?? (t.league_id === null ? globalUfaByYear.get(t.season_year) : undefined);
    if (cid) contestOfTeam.set(t.id, cid);
  }

  // 5. All roster slots, attributed to (contest, period); keep only locked ones.
  const slots = await fetchAll<SlotRow>((from, to) =>
    supabase
      .from('fantasy_roster_slots')
      .select('team_id, week, player_id, player_league, role')
      .order('id')
      .range(from, to),
  );
  // contest → team → period → slots
  const work = new Map<string, Map<string, Map<string, SlotRow[]>>>();
  const playersByContest = new Map<string, Set<string>>();
  for (const s of slots) {
    const cid = contestOfTeam.get(s.team_id);
    if (!cid) continue;
    if (!lockedPeriods.get(cid)?.has(s.week)) continue;
    let byTeam = work.get(cid);
    if (!byTeam) {
      byTeam = new Map();
      work.set(cid, byTeam);
    }
    let byPeriod = byTeam.get(s.team_id);
    if (!byPeriod) {
      byPeriod = new Map();
      byTeam.set(s.team_id, byPeriod);
    }
    const arr = byPeriod.get(s.week);
    if (arr) arr.push(s);
    else byPeriod.set(s.week, [s]);
    let ps = playersByContest.get(cid);
    if (!ps) {
      ps = new Set();
      playersByContest.set(cid, ps);
    }
    ps.add(s.player_id);
  }

  // 6. Score contest by contest (stat contexts cached per competition+season).
  const weeklyCache = new Map<string, WeekLines>();
  const upserts: { team_id: string; week: string; points: number; computed_at: string }[] = [];
  let contestsScored = 0;

  for (const contest of contests) {
    const byTeam = work.get(contest.id);
    if (!byTeam || byTeam.size === 0) continue;
    contestsScored += 1;
    const comp = contest.competition;

    if (comp === 'ufa' || comp === 'pul' || comp === 'wul') {
      const cacheKey = `${comp}:${contest.season_year}`;
      let lines = weeklyCache.get(cacheKey);
      if (!lines) {
        lines =
          comp === 'ufa'
            ? await ufaWeekLines(supabase, contest.season_year)
            : comp === 'pul'
              ? await pulWeekLines(supabase, contest.season_year)
              : await wulWeekLines(supabase, contest.season_year);
        weeklyCache.set(cacheKey, lines);
      }
      for (const [teamId, byPeriod] of byTeam) {
        for (const [period, roster] of byPeriod) {
          const per = lines.get(period);
          let points = 0;
          for (const slot of roster) {
            if (slot.role === 'flex') continue; // not valid in weekly mode
            const line = per?.get(slot.player_id);
            if (line) points += scoreStatLine(line, slot.role);
          }
          upserts.push({
            team_id: teamId,
            week: period,
            points: Math.round(points * 100) / 100,
            computed_at: new Date().toISOString(),
          });
        }
      }
    } else {
      // Event mode.
      const eventId = contest.settings?.eventId;
      if (!eventId) {
        console.error(`[score-fantasy] contest ${contest.id} (${comp}) has no eventId — skipped`);
        continue;
      }
      const playerIds = [...(playersByContest.get(contest.id) ?? [])];
      const pointsOf =
        comp === 'wfdf-wucc'
          ? await wfdfEventPoints(supabase, eventId, playerIds)
          : await usauEventPoints(supabase, eventId, playerIds);
      for (const [teamId, byPeriod] of byTeam) {
        for (const [period, roster] of byPeriod) {
          let points = 0;
          for (const slot of roster) points += pointsOf.get(slot.player_id) ?? 0;
          upserts.push({
            team_id: teamId,
            week: period,
            points: Math.round(points * 100) / 100,
            computed_at: new Date().toISOString(),
          });
        }
      }
    }
  }

  // 7. Chunked upsert on (team_id, week).
  for (const part of chunk(upserts, 500)) {
    const { error } = await supabase.from('fantasy_scores').upsert(part, { onConflict: 'team_id,week' });
    if (error) throw error;
  }

  return { contestsScored, rowsUpserted: upserts.length };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  let body: { contest?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty ok */
  }

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

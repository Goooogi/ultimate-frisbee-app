// Home-page "Standout Performances" — the best individual player stat-lines
// from recent games, for the rotating carousel. UFA / PUL / WUL are wired; only
// leagues with a live/recent season contribute (currently just UFA).
//
// Data is cheap: we mirror per-game box scores into Supabase
// (ufa_game_player_stats / pul_game_player_stats / wul_game_player_stats, all
// world-readable via the anon key), so a standout is a small windowed read +
// a perf score computed in TS — no per-game API fan-out.
//
// PERF SCORE (0-ish to ~50): weighted blend of counting stats + throwing, with
// completion % that only matters at LOW counting volume (a 6+ combined G/A/Blk
// line gets ~0 from completion %). Tuned against real recent UFA lines so a
// 4G/9A/761yd distributor game and a 6G/5Blk two-way game both surface, and a
// 7-block defender shows up on the blocks weight.
//
// SELECTION = strength-gated recency: the most recent weekend's best lines
// appear easily; an older line must clear a higher perf bar to survive (a
// 3-week-old line needs to be a monster). See gateThreshold().

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseUrl, supabaseAnonKey } from '@/lib/supabase/env';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>;

let _client: AnyClient | null = null;
function supabase(): AnyClient {
  if (_client) return _client;
  _client = createClient(supabaseUrl(), supabaseAnonKey(), { auth: { persistSession: false } });
  return _client;
}

export type StandoutLeague = 'ufa' | 'pul' | 'wul';

export interface StandoutStat {
  label: string;
  value: string;
}

/** UFA season awards a standout can be "on watch" for. ROY = Rookie of the Year
 *  (plumbed but not yet computable — no rookie-year data stored). */
export type AwardWatch = 'MVP' | 'OPOY' | 'DPOY' | 'ROY';

export interface StandoutLine {
  id: string; // `${league}-${gameId}-${playerKey}`
  league: StandoutLeague;
  /** League player id (UFA slug), or null (PUL/WUL box rows carry no id). Used
   *  to match a card to its season award-watch status. */
  playerId: string | null;
  playerName: string;
  /** Route to the profile, or null when we can't resolve an id (PUL/WUL). */
  href: string | null;
  /** UFA headshot (only league with them); null → monogram fallback. */
  headshotUrl: string | null;
  teamName: string | null;
  /** Human date label of the game, e.g. "Jul 19", or "Season" for a season card. */
  dateLabel: string;
  /** Opponent name/abbr for "vs {opp}" next to the date. Null for season cards. */
  opponent: string | null;
  /** True when the card shows SEASON totals (an award leader whose latest game
   *  wasn't standout-worthy) rather than a single game line. */
  seasonMode: boolean;
  /** The stat tiles to show on the card. */
  stats: StandoutStat[];
  /** Season award this player currently leads/contends (tag on the card). A
   *  player never gets a duplicate card — their watch status rides their
   *  standout line. Null when they're not an award leader. */
  awardWatch: AwardWatch | null;
  /** True when this game line included a Callahan (a D-block caught in the
   *  endzone for a score — the rarest play; always acknowledged). */
  callahan: boolean;
  /** Internal — perf score + timestamp (for selection, not shown raw). */
  perf: number;
  ts: number;
  /** Internal — `${league}-${gameId}` for the per-game cap. */
  gameKey: string;
}

const MS_DAY = 86_400_000;
const WINDOW_DAYS = 21; // max 3 weeks back — the section is "recent" great games
const MAX_CARDS = 10;
const PER_GAME_CAP = 1; // at most one standout per game so one blowout doesn't flood
const PER_PLAYER_CAP = 1; // at most one card per player — their single best recent game

// ─── Perf score ───────────────────────────────────────────────────────────────

interface RawLine {
  goals: number;
  assists: number;
  blocks: number;
  plusMinus: number;
  totalYards: number | null;
  completions: number | null;
  throwsAttempted: number | null;
  /** Callahans in the game — each is a defensive score, the rarest highlight;
   *  weighted heavily so a callahan line ranks up and gets acknowledged. */
  callahans?: number;
}

/** Weighted performance score. See file header for the model + rationale. */
function perfScore(l: RawLine): number {
  const counting = l.goals + l.assists + l.blocks;
  let s =
    l.goals * 2.2 +
    l.assists * 2.0 +
    l.blocks * 2.6 +
    l.plusMinus * 1.4 +
    (l.callahans ?? 0) * 6; // a callahan is a marquee play → strong boost

  if (l.totalYards != null) s += l.totalYards / 100; // ~250yd → +2.5

  // Completion-% bonus, only meaningful at low counting volume: the weight
  // fades to 0 by ~8 combined G/A/Blk, so a big box line isn't padded by cmp%.
  if (l.throwsAttempted != null && l.throwsAttempted >= 10 && l.completions != null) {
    const cmpPct = (100 * l.completions) / l.throwsAttempted;
    const lowVolWeight = Math.max(0, 1 - counting / 8);
    s += (cmpPct - 85) * lowVolWeight * 0.08;
  }
  return s;
}

/**
 * Strength-gated recency threshold: how strong a line must be to survive at a
 * given age. Fresh (≤3 days) lines pass at a low bar; the bar then climbs
 * steeply so the section reads as "this week / last week" and an older game must
 * be near-elite (and, past ~3 weeks, a genuine monster) to keep its spot. A
 * strong recent game therefore displaces a merely-good older one for the same
 * player. Tuned to the perf scale above (a recent weekend tops ~50-65).
 *
 * Reference points on the current UFA data: a 4G/9A/761yd line (~perf 50) at 3
 * weeks old no longer survives (needs 54), but the same player's fresher
 * 3G/14A/938yd line (~perf 65) sails through — so the recent game wins the card.
 */
function gateThreshold(ageDays: number): number {
  if (ageDays <= 3) return 10; // this weekend — easy to appear
  if (ageDays <= 10) return 24; // ~1-1.5 weeks — solid line
  if (ageDays <= 14) return 34; // ~2 weeks — strong line only
  if (ageDays <= 17) return 44; // ~2.5 weeks — near-elite
  return 54; // 18-21 days — monster games only (WINDOW_DAYS caps the tail)
}

// ─── UFA ──────────────────────────────────────────────────────────────────────

interface UfaStatRow {
  game_id: string;
  player_id: string;
  team_id: string;
  goals: number;
  assists: number;
  blocks: number;
  callahans: number;
  throwaways: number;
  drops: number;
  stalls: number;
  yards_thrown: number;
  yards_received: number;
  completions: number;
  throws_attempted: number;
}

async function ufaStandouts(now: number): Promise<StandoutLine[]> {
  const db = supabase();
  const since = new Date(now - WINDOW_DAYS * MS_DAY).toISOString();

  // Recent final games (id → date + teams).
  const { data: games } = await db
    .from('ufa_games')
    .select('id, start_timestamp, status, home_team_id, away_team_id')
    .gt('start_timestamp', since)
    .ilike('status', '%final%');
  const gameMeta = new Map<string, { ts: number; homeTeamId: string; awayTeamId: string }>();
  for (const g of (games ?? []) as { id: string; start_timestamp: string; home_team_id: string; away_team_id: string }[]) {
    gameMeta.set(g.id, { ts: new Date(g.start_timestamp).getTime(), homeTeamId: g.home_team_id, awayTeamId: g.away_team_id });
  }
  if (gameMeta.size === 0) return [];

  const gameIds = [...gameMeta.keys()];
  // ~28 players/game × up to 4 weeks of games can exceed PostgREST's default
  // 1000-row response cap → .range lifts it so no lines are silently dropped.
  const { data: rows } = await db
    .from('ufa_game_player_stats')
    .select(
      'game_id, player_id, team_id, goals, assists, blocks, callahans, throwaways, drops, stalls, yards_thrown, yards_received, completions, throws_attempted',
    )
    .in('game_id', gameIds)
    .range(0, 4999);
  const statRows = (rows ?? []) as UfaStatRow[];
  if (statRows.length === 0) return [];

  // Season award watch (MVP/OPOY/DPOY) keyed by player_id — a tag on whichever
  // standout cards belong to a current award leader. Gated to week ≥ 5.
  const awardByPlayer = await ufaAwardWatch(now).catch(() => new Map<string, AwardWatch>());

  // Resolve player names + headshots + team names in bulk. Include BOTH sides of
  // each game so we can name the opponent ("vs {opp}").
  const playerIds = [...new Set(statRows.map((r) => r.player_id))];
  const teamIds = [
    ...new Set([
      ...statRows.map((r) => r.team_id),
      ...[...gameMeta.values()].flatMap((m) => [m.homeTeamId, m.awayTeamId]),
    ]),
  ];
  const [playersRes, teamsRes] = await Promise.all([
    db.from('ufa_players').select('id, full_name, headshot_url').in('id', playerIds),
    db.from('ufa_teams').select('id, name, city').in('id', teamIds),
  ]);
  const players = new Map<string, { full_name: string; headshot_url: string | null }>();
  for (const p of (playersRes.data ?? []) as { id: string; full_name: string; headshot_url: string | null }[]) {
    players.set(p.id, { full_name: p.full_name, headshot_url: p.headshot_url });
  }
  const teams = new Map<string, string>();
  for (const t of (teamsRes.data ?? []) as { id: string; name: string; city: string }[]) {
    teams.set(t.id, [t.city, t.name].filter(Boolean).join(' ') || t.name);
  }

  const lines: StandoutLine[] = statRows.map((r) => {
    const plusMinus = r.goals + r.assists + r.blocks - r.throwaways - r.drops - r.stalls;
    const totalYards = (r.yards_thrown ?? 0) + (r.yards_received ?? 0);
    const perf = perfScore({
      goals: r.goals,
      assists: r.assists,
      blocks: r.blocks,
      plusMinus,
      totalYards,
      completions: r.completions,
      throwsAttempted: r.throws_attempted,
      callahans: r.callahans ?? 0,
    });
    const p = players.get(r.player_id);
    const meta = gameMeta.get(r.game_id);
    const ts = meta?.ts ?? now;
    // Opponent = the game's other team (not the player's team_id).
    const oppTeamId = meta ? (meta.homeTeamId === r.team_id ? meta.awayTeamId : meta.homeTeamId) : null;
    return {
      id: `ufa-${r.game_id}-${r.player_id}`,
      gameKey: `ufa-${r.game_id}`,
      league: 'ufa' as const,
      playerId: r.player_id,
      playerName: p?.full_name?.trim() || r.player_id,
      href: `/players/${r.player_id}`,
      headshotUrl: p?.headshot_url ?? null,
      teamName: teams.get(r.team_id) ?? null,
      dateLabel: dateLabel(ts),
      opponent: oppTeamId ? teams.get(oppTeamId) ?? null : null,
      seasonMode: false,
      stats: buildStats({
        goals: r.goals, assists: r.assists, blocks: r.blocks, plusMinus,
        totalYards, completions: r.completions, throwsAttempted: r.throws_attempted,
      }),
      awardWatch: awardByPlayer.get(r.player_id) ?? null,
      callahan: (r.callahans ?? 0) > 0,
      perf,
      ts,
    };
  });
  return lines;
}

// ─── UFA season award watch (MVP / OPOY / DPOY) ────────────────────────────────

const AWARD_MIN_WEEK = 5; // don't crown a watch until there's enough sample

/**
 * Compute the current UFA award-watch leaders for the live season, keyed by
 * player_id. Returns an empty map before week 5, or if the season has no games.
 *
 *   - OPOY (Offensive POY) — offensive production: goals + assists + yards.
 *   - DPOY (Defensive POY) — blocks (+ callahans, which are defensive scores).
 *   - MVP                  — overall two-way value (a blend of the above + +/-).
 *   - ROY (Rookie)         — NOT computed: we don't store rookie-year/experience
 *     data. Plumbed so it lights up the moment that data exists.
 *
 * One leader per award. If the same player would lead two awards (e.g. MVP and
 * OPOY), MVP wins on their card — award precedence MVP > OPOY > DPOY — so no
 * player carries two tags.
 */
type SeasonAgg = { g: number; a: number; blk: number; cal: number; yds: number; pm: number; gp: number };

interface AwardData {
  /** player_id → award. */
  awards: Map<string, AwardWatch>;
  /** player_id → season totals (for building a season card when a leader has
   *  no recent game in the standouts window). */
  agg: Map<string, SeasonAgg>;
}

/**
 * Shared computation: the current UFA award-watch leaders + every player's
 * season aggregate. See ufaAwardWatch / ufaAwardSeasonCards for the two callers.
 * Returns empty maps before week 5 or if the season has no games.
 */
async function ufaAwardData(now: number): Promise<AwardData> {
  const db = supabase();
  const empty: AwardData = { awards: new Map(), agg: new Map() };

  // Current season = the newest year with a game already played.
  const { data: latest } = await db
    .from('ufa_games')
    .select('year, week, start_timestamp')
    .lt('start_timestamp', new Date(now).toISOString())
    .order('start_timestamp', { ascending: false })
    .limit(1)
    .maybeSingle();
  const season = (latest as { year?: number } | null)?.year;
  if (!season) return empty;

  // Games this season (final) → their ids + the max week reached (the gate).
  const { data: games } = await db
    .from('ufa_games')
    .select('id, week, status')
    .eq('year', season)
    .ilike('status', '%final%');
  const gameRows = (games ?? []) as { id: string; week: string | null }[];
  if (gameRows.length === 0) return empty;
  const maxWeek = gameRows.reduce((m, g) => Math.max(m, weekNum(g.week)), 0);
  if (maxWeek < AWARD_MIN_WEEK) return empty;

  const seasonGameIds = gameRows.map((g) => g.id);
  // Page the stat fetch in 1000-row chunks so a season's worth of rows can NEVER
  // silently truncate at the PostgREST cap (an incomplete read would compute the
  // wrong award leaders — e.g. a partial season made Taylor outrank Decraene).
  type StatPick = Pick<UfaStatRow, 'player_id' | 'goals' | 'assists' | 'blocks' | 'callahans' | 'throwaways' | 'drops' | 'stalls' | 'yards_thrown' | 'yards_received'>;
  const statRows: StatPick[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data: page } = await db
      .from('ufa_game_player_stats')
      .select('player_id, goals, assists, blocks, callahans, throwaways, drops, stalls, yards_thrown, yards_received')
      .in('game_id', seasonGameIds)
      .order('id', { ascending: true }) // stable order → pages don't overlap/skip
      .range(from, from + PAGE - 1);
    const chunk = (page ?? []) as StatPick[];
    statRows.push(...chunk);
    if (chunk.length < PAGE) break;
  }
  if (statRows.length === 0) return empty;

  // Aggregate season totals per player.
  const agg = new Map<string, SeasonAgg>();
  for (const r of statRows) {
    const cur = agg.get(r.player_id) ?? { g: 0, a: 0, blk: 0, cal: 0, yds: 0, pm: 0, gp: 0 };
    cur.g += r.goals; cur.a += r.assists; cur.blk += r.blocks; cur.cal += r.callahans ?? 0;
    cur.yds += (r.yards_thrown ?? 0) + (r.yards_received ?? 0);
    cur.pm += r.goals + r.assists + r.blocks - r.throwaways - r.drops - r.stalls;
    cur.gp += 1;
    agg.set(r.player_id, cur);
  }
  const players = [...agg.entries()];
  const awards = new Map<string, AwardWatch>();

  // Best player by a scoring fn, EXCLUDING already-tagged players so each award
  // goes to a distinct person. (Often the MVP also leads offense — without this,
  // OPOY would vanish instead of falling to the next-best offensive player.)
  const bestExcluding = (score: (v: SeasonAgg) => number): string | null =>
    players.reduce<{ id: string; s: number } | null>((best, [id, v]) => {
      if (awards.has(id)) return best;
      const s = score(v);
      return !best || s > best.s ? { id, s } : best;
    }, null)?.id ?? null;

  // Precedence MVP > OPOY > DPOY; each takes the best still-untagged player.
  const mvp = bestExcluding((v) => v.g + v.a + v.blk * 1.4 + v.pm * 0.6 + v.yds / 150);
  if (mvp) awards.set(mvp, 'MVP');
  const opoy = bestExcluding((v) => v.g + v.a + v.yds / 100);
  if (opoy) awards.set(opoy, 'OPOY');
  const dpoy = bestExcluding((v) => v.blk + v.cal * 1.5);
  if (dpoy) awards.set(dpoy, 'DPOY');
  return { awards, agg };
}

/** player_id → current award (MVP/OPOY/DPOY). Thin wrapper over ufaAwardData. */
async function ufaAwardWatch(now: number): Promise<Map<string, AwardWatch>> {
  return (await ufaAwardData(now)).awards;
}

/**
 * Build a SEASON-stats card for every award-watch player who did NOT earn a
 * game card (no standout-worthy recent game — a quiet week, or no game at all).
 * `gameEarnerIds` = award players who already have a gate-clearing game card.
 * This is what makes an MVP contender with a mediocre latest game show SEASON
 * totals (Decraene's 32G/59A/+71) instead of that one quiet line.
 */
async function ufaAwardSeasonCards(
  now: number,
  gameEarnerIds: Set<string | null>,
): Promise<StandoutLine[]> {
  const { awards, agg } = await ufaAwardData(now);
  const missing = [...awards.entries()].filter(([id]) => !gameEarnerIds.has(id));
  if (missing.length === 0) return [];

  const db = supabase();
  const ids = missing.map(([id]) => id);
  const { data: playersData } = await db
    .from('ufa_players')
    .select('id, full_name, headshot_url, current_team_id')
    .in('id', ids);
  const teamIds = [...new Set(((playersData ?? []) as { current_team_id: string | null }[]).map((p) => p.current_team_id).filter(Boolean))] as string[];
  const { data: teamsData } = teamIds.length
    ? await db.from('ufa_teams').select('id, name, city').in('id', teamIds)
    : { data: [] as { id: string; name: string; city: string }[] };
  const pmeta = new Map<string, { full_name: string; headshot_url: string | null; team: string | null }>();
  const teamName = new Map<string, string>();
  for (const t of (teamsData ?? []) as { id: string; name: string; city: string }[]) {
    teamName.set(t.id, [t.city, t.name].filter(Boolean).join(' ') || t.name);
  }
  for (const p of (playersData ?? []) as { id: string; full_name: string; headshot_url: string | null; current_team_id: string | null }[]) {
    pmeta.set(p.id, { full_name: p.full_name, headshot_url: p.headshot_url, team: p.current_team_id ? teamName.get(p.current_team_id) ?? null : null });
  }

  return missing.map(([id, award]) => {
    const v = agg.get(id)!;
    const meta = pmeta.get(id);
    return {
      id: `ufa-season-${id}`,
      gameKey: `ufa-season-${id}`,
      league: 'ufa' as const,
      playerId: id,
      playerName: meta?.full_name?.trim() || id,
      href: `/players/${id}`,
      headshotUrl: meta?.headshot_url ?? null,
      teamName: meta?.team ?? null,
      dateLabel: 'Season',
      opponent: null,
      seasonMode: true,
      stats: [
        { label: 'G', value: String(v.g) },
        { label: 'A', value: String(v.a) },
        { label: 'Blk', value: String(v.blk) },
        { label: '+/-', value: (v.pm >= 0 ? '+' : '') + v.pm },
        { label: 'Yds', value: String(v.yds) },
      ],
      awardWatch: award,
      callahan: false,
      // Season cards aren't "recent" — give them a high perf so they still lead,
      // and a ts of now so recency math never drops them.
      perf: 1000,
      ts: now,
    };
  });
}

/** UFA week labels are "week-11" / "week-1" etc.; playoffs sort high. */
function weekNum(week: string | null): number {
  if (!week) return 0;
  const m = week.match(/(\d+)/);
  if (m) return parseInt(m[1], 10);
  // Non-numeric (playoffs/championship) → treat as late-season.
  return 99;
}

// ─── PUL / WUL (Supabase, no yards for PUL) ─────────────────────────────────────

interface ProStatRow {
  game_id: string;
  team_id: string;
  player_name: string;
  goals: number;
  assists: number;
  blocks: number;
  turnovers: number;
  plus_minus: number;
  // WUL-only:
  total_yards?: number | null;
  completions?: number | null;
  throws?: number | null;
  callahans?: number | null;
}

async function proStandouts(league: 'pul' | 'wul', now: number): Promise<StandoutLine[]> {
  const db = supabase();
  const sinceDate = new Date(now - WINDOW_DAYS * MS_DAY).toISOString().slice(0, 10);
  const gamesTable = league === 'pul' ? 'pul_games' : 'wul_games';
  const statsTable = league === 'pul' ? 'pul_game_player_stats' : 'wul_game_player_stats';
  const teamsTable = league === 'pul' ? 'pul_teams' : 'wul_teams';

  const { data: games } = await db
    .from(gamesTable)
    .select('id, game_date, status, home_team_id, away_team_id')
    .gte('game_date', sinceDate)
    .eq('status', 'final');
  const gameMeta = new Map<string, { ts: number; homeTeamId: string; awayTeamId: string }>();
  for (const g of (games ?? []) as { id: string; game_date: string | null; home_team_id: string; away_team_id: string }[]) {
    gameMeta.set(g.id, {
      ts: g.game_date ? new Date(g.game_date).getTime() : now,
      homeTeamId: g.home_team_id,
      awayTeamId: g.away_team_id,
    });
  }
  if (gameMeta.size === 0) return [];

  const gameIds = [...gameMeta.keys()];
  const cols =
    league === 'wul'
      ? 'game_id, team_id, player_name, goals, assists, blocks, turnovers, plus_minus, total_yards, completions, throws, callahans'
      : 'game_id, team_id, player_name, goals, assists, blocks, turnovers, plus_minus';
  const { data: rows } = await db.from(statsTable).select(cols).in('game_id', gameIds).range(0, 4999);
  const statRows = (rows ?? []) as unknown as ProStatRow[];
  if (statRows.length === 0) return [];

  const teamIds = [
    ...new Set([
      ...statRows.map((r) => r.team_id),
      ...[...gameMeta.values()].flatMap((m) => [m.homeTeamId, m.awayTeamId]),
    ]),
  ];
  const { data: teamRows } = await db.from(teamsTable).select('id, name, city').in('id', teamIds);
  const teams = new Map<string, string>();
  for (const t of (teamRows ?? []) as { id: string; name: string; city: string | null }[]) {
    teams.set(t.id, [t.city, t.name].filter(Boolean).join(' ') || t.name);
  }

  return statRows.map((r, i) => {
    const totalYards = league === 'wul' ? r.total_yards ?? null : null;
    const perf = perfScore({
      goals: r.goals,
      assists: r.assists,
      blocks: r.blocks,
      plusMinus: r.plus_minus,
      totalYards,
      completions: league === 'wul' ? r.completions ?? null : null,
      throwsAttempted: league === 'wul' ? r.throws ?? null : null,
      callahans: league === 'wul' ? r.callahans ?? 0 : 0,
    });
    const meta = gameMeta.get(r.game_id);
    const ts = meta?.ts ?? now;
    const oppTeamId = meta ? (meta.homeTeamId === r.team_id ? meta.awayTeamId : meta.homeTeamId) : null;
    return {
      id: `${league}-${r.game_id}-${r.player_name}-${i}`,
      gameKey: `${league}-${r.game_id}`,
      league,
      playerId: null,
      playerName: r.player_name,
      href: null, // PUL/WUL box rows don't carry a profile id; link resolution TODO
      headshotUrl: null,
      teamName: teams.get(r.team_id) ?? null,
      dateLabel: dateLabel(ts),
      opponent: oppTeamId ? teams.get(oppTeamId) ?? null : null,
      seasonMode: false,
      stats: buildStats({
        goals: r.goals, assists: r.assists, blocks: r.blocks, plusMinus: r.plus_minus,
        totalYards, completions: league === 'wul' ? r.completions ?? null : null,
        throwsAttempted: league === 'wul' ? r.throws ?? null : null,
      }),
      awardWatch: null, // award watch is UFA-only for now
      callahan: league === 'wul' ? (r.callahans ?? 0) > 0 : false,
      perf,
      ts,
    };
  });
}

// ─── Shared helpers ─────────────────────────────────────────────────────────────

function buildStats(l: RawLine): StandoutStat[] {
  const out: StandoutStat[] = [
    { label: 'G', value: String(l.goals) },
    { label: 'A', value: String(l.assists) },
    { label: 'Blk', value: String(l.blocks) },
    { label: '+/-', value: (l.plusMinus >= 0 ? '+' : '') + l.plusMinus },
  ];
  if (l.totalYards != null && l.totalYards > 0) {
    out.push({ label: 'Yds', value: String(Math.round(l.totalYards)) });
  }
  if (l.throwsAttempted != null && l.throwsAttempted >= 10 && l.completions != null) {
    const pct = Math.round((100 * l.completions) / l.throwsAttempted);
    out.push({ label: 'Cmp%', value: String(pct) });
  }
  return out;
}

function dateLabel(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Public entry ───────────────────────────────────────────────────────────────

/**
 * The standout stat-lines for the home carousel. Fans out to all wired leagues
 * (only ones with recent games contribute), applies the strength-gated recency
 * filter, caps to one line per game, and returns the top MAX_CARDS by perf.
 */
export async function getStandoutPerformances(): Promise<StandoutLine[]> {
  const now = Date.now();
  const perLeague = await Promise.all([
    ufaStandouts(now).catch(() => [] as StandoutLine[]),
    proStandouts('pul', now).catch(() => [] as StandoutLine[]),
    proStandouts('wul', now).catch(() => [] as StandoutLine[]),
  ]);
  const all = perLeague.flat();

  const clearsGate = (l: StandoutLine) => l.perf >= gateThreshold((now - l.ts) / MS_DAY);

  // An award-watch player is worth a SEASON card unless one of their recent games
  // was genuinely standout-worthy (cleared the gate) — in which case we show that
  // game. So: an MVP contender with a quiet week shows season totals, not the
  // quiet line. Track which award-players earned a real game card.
  const awardGameEarners = new Set<string>(); // player_id with a gate-clearing line
  for (const l of all) {
    if (l.awardWatch && l.playerId && clearsGate(l)) awardGameEarners.add(l.playerId);
  }

  // Strength-gated recency: keep only lines that cleared the age-scaled bar
  // (a real standout game). This now applies to award lines too — a sub-gate
  // award line is dropped and replaced by a season card below.
  const gated = all.filter(clearsGate);

  // Cap the field: at most PER_GAME_CAP standouts per game (so one blowout
  // doesn't flood the rail) AND at most PER_PLAYER_CAP card per player (so a
  // player with several standout weeks shows only their single best recent
  // game, not a stack of cards). Lines are sorted by perf desc, so the first
  // time we see a game/player is their best line. Award players are exempt from
  // the per-player cap — an award leader's real game line still competes with
  // their season-totals fallback below (award dedup keeps one per award).
  gated.sort((a, b) => b.perf - a.perf);
  const perGame = new Map<string, number>();
  const perPlayer = new Map<string, number>();
  const capped: StandoutLine[] = [];
  for (const l of gated) {
    const gN = (perGame.get(l.gameKey) ?? 0) + 1;
    perGame.set(l.gameKey, gN);
    if (gN > PER_GAME_CAP) continue;
    // Per-player cap keyed by playerId (UFA) or name (PUL/WUL box rows have no
    // id). Skip the cap for award-watch players (handled by award dedup).
    if (!l.awardWatch) {
      const pKey = l.playerId ?? `${l.league}:${l.playerName}`;
      const pN = (perPlayer.get(pKey) ?? 0) + 1;
      perPlayer.set(pKey, pN);
      if (pN > PER_PLAYER_CAP) continue;
    }
    capped.push(l);
  }

  // SEASON cards for award players who did NOT earn a game card (quiet week or
  // no game at all) — so the MVP/OPOY/DPOY always appears, showing season totals
  // when their latest game wasn't standout-worthy.
  const seasonCards = await ufaAwardSeasonCards(now, awardGameEarners).catch(
    () => [] as StandoutLine[],
  );
  capped.push(...seasonCards);

  // De-dup: keep only ONE card per award (their best line already sorted first),
  // so a leader with several recent games isn't shown repeatedly.
  const seenAward = new Set<AwardWatch>();
  const deduped: StandoutLine[] = [];
  for (const l of capped) {
    if (l.awardWatch) {
      if (seenAward.has(l.awardWatch)) continue;
      seenAward.add(l.awardWatch);
    }
    deduped.push(l);
  }

  // Award cards LEAD the carousel (in award precedence MVP → OPOY → DPOY), then
  // callahan lines, then ordinary standouts by perf. Award cards are exempt from
  // the MAX_CARDS slice so they're always present regardless of a quiet week.
  const AWARD_ORDER: Record<AwardWatch, number> = { MVP: 0, OPOY: 1, DPOY: 2, ROY: 3 };
  const awards = deduped
    .filter((l) => l.awardWatch)
    .sort((a, b) => AWARD_ORDER[a.awardWatch!] - AWARD_ORDER[b.awardWatch!]);
  const rest = deduped
    .filter((l) => !l.awardWatch)
    .sort((a, b) => (b.callahan ? 1 : 0) - (a.callahan ? 1 : 0) || b.perf - a.perf)
    .slice(0, Math.max(0, MAX_CARDS - awards.length));
  return [...awards, ...rest];
}

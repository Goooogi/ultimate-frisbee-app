'use server';

// "For You" LIVE data — the real games / team snapshots / league standings for a
// signed-in user's favorites. Server action (heavy per-league fetching stays on
// the server); the client passes its already-loaded favorites and gets back a
// ForYouFeed. Replaces buildPreview() from preview-data.ts.
//
// SCHEDULE ASYMMETRY (important): UFA/PUL/WUL are scheduled leagues with per-team
// game feeds → they populate the games strip. USAU + WFDF are tournament/event-
// based with no ongoing team schedule → they contribute team snapshots + league
// context but NOT games. This is expected, not a gap.

import type { FavoriteLeague, FavoriteTeam } from '@/lib/favorites/data';
import { LEAGUE_DISPLAY } from '@/lib/for-you/leagues';
import {
  getCurrentGames,
  getGamesByYears,
  getStandings,
  getTeamStats,
  getAllPlayerStats,
  currentSeasonYear,
} from '@/lib/ufa/client';
import { gameUiState } from '@/lib/ufa/format';
import { teamMeta } from '@/lib/ufa/teams';
import type { UfaGame, UfaTeamStat, UfaPlayerStat } from '@/lib/ufa/types';
import {
  listPulGames,
  getPulStandings,
  getPulTeam,
  getPulRoster,
  PUL_CURRENT_SEASON,
  type PulPlayer,
} from '@/lib/pul/data';
import {
  listWulGames,
  getWulStandings,
  getWulTeam,
  getWulRoster,
  WUL_CURRENT_SEASON,
  type WulPlayer,
} from '@/lib/wul/data';
import { getTeam as getUsauTeam, getEvent as getUsauEvent } from '@/lib/usau/data';
import { getTeam as getWfdfTeam } from '@/lib/wfdf/data';

// ─── Output shapes (mirror preview-data, isPreview:false) ───────────────────

export interface FeedGame {
  id: string;
  league: FavoriteLeague;
  status: 'upcoming' | 'live' | 'final';
  home: { name: string; teamId: string; score: number | null; logoUrl: string | null };
  away: { name: string; teamId: string; score: number | null; logoUrl: string | null };
  when: string;
  /** Which favorited team surfaced this game. */
  favoriteTeamName: string;
  /** Sort key — epoch ms; games with no date sort last. */
  sortTs: number;
  isPreview: false;
}

/** A labeled team stat tile (e.g. { label: 'PF', value: '210' }). */
export interface TeamStat {
  label: string;
  value: string;
}

/** A stat leader on a favorite team — top scorer/assist/block/etc. */
export interface TeamLeader {
  /** Player profile id for the link, or null (unlinked). */
  playerId: string | null;
  name: string;
  /** Stat category label (e.g. 'Goals', 'Assists', 'Blocks', '+/-'). */
  statLabel: string;
  /** Formatted value (e.g. '63', '+41'). */
  statValue: string;
  /** How to route: /players/[id]?from=<league> for anchor leagues. */
  league: FavoriteLeague;
}

export interface TeamSnapshot {
  team: FavoriteTeam;
  record: string | null;
  standing: string | null;
  /**
   * Rank-in-context line that replaces the standings table — e.g.
   * "1st in East · 1 game up on Machine" or "3rd · 1 back of Empire". Folds the
   * one useful fact out of the full table onto the card itself.
   */
  rankContext: string | null;
  /**
   * Recent form, most-recent-first — e.g. ['W','W','L','W','W']. Empty for
   * event-based leagues (USAU/WFDF) with no per-team game feed.
   */
  form: Array<'W' | 'L'>;
  /** Team-level stat tiles (PF/PA/Cmp/TO/Blk…), league-dependent. */
  stats: TeamStat[];
  /** Top players on the team by a few categories. */
  leaders: TeamLeader[];
  /**
   * Full roster (USAU club/college teams only — event-based leagues don't
   * expose per-game stats, so the roster IS the substance). Rendered scrollable
   * inside the card. Empty for UFA/PUL/WUL (those get leaders instead).
   */
  roster: Array<{ playerId: string | null; name: string; jersey: string | null }>;
  /**
   * Notable finishes — e.g. [{ placement: 3, event: 'Pro Elite Challenge West' }].
   * USAU teams surface these instead of a season record. Empty otherwise.
   */
  accolades: Array<{ placement: number; event: string; season: number }>;
  isPreview: false;
}

/**
 * A tournament a favorite team is entered in / played. USAU + WFDF are event-
 * based (no per-team game schedule), so their favorites surface tournaments
 * here instead of the games strip. Upcoming = not yet finished (no placement or
 * a future start date); past = has a final placement.
 */
export interface FeedTournament {
  id: string;
  league: FavoriteLeague;
  name: string;
  /** Event page slug → /usau/events/[slug] or /wfdf/events/[slug]. */
  slug: string;
  /** YYYY-MM-DD or null. */
  startDate: string | null;
  /** Final placement at this event, or null if upcoming / unplaced. */
  placement: number | null;
  status: 'upcoming' | 'past';
  /** Which favorited team surfaced this tournament. */
  favoriteTeamName: string;
  sortTs: number;
}

export interface ForYouFeed {
  /**
   * The single most important game to feature big at the top: a live game if any,
   * else the soonest upcoming game, else the most recent final. Null if the user
   * follows only event-based (USAU/WFDF) teams with no scheduled game.
   */
  heroGame: FeedGame | null;
  /** The remaining games (hero excluded) for the secondary strip. */
  games: FeedGame[];
  tournaments: FeedTournament[];
  teams: TeamSnapshot[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const MS_DAY = 86_400_000;

/** Short "Sat 3:00 PM" / "Final" / "Live" label from a date + status. */
function whenLabel(date: Date | null, status: 'upcoming' | 'live' | 'final'): string {
  if (status === 'live') return 'Live';
  if (status === 'final') return 'Final';
  if (!date) return 'TBD';
  return date.toLocaleString('en-US', {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Keep upcoming games within the next 60d (drop far-future); drop nothing on the
 * past side here. Recent-finals trimming happens AFTER sorting (keep the most
 * recent N per team), so an offseason league whose last game was weeks ago still
 * shows its results instead of an empty strip. `live` always kept.
 */
function inWindow(ts: number, now: number, status: 'upcoming' | 'live' | 'final'): boolean {
  if (status === 'live') return true;
  if (status === 'final') return true; // trimmed later by recency rank, not a hard window
  return ts <= now + 60 * MS_DAY;
}

/** Max recent finals to keep per favorite team (their season may be over). */
const RECENT_FINALS_PER_TEAM = 3;

// ─── Rank context + form (replaces the standings table) ─────────────────────

/** Ordinal ("1st", "2nd", "3rd", "11th"). */
function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

/** "1 game" / "2 games" plural helper. */
function games(n: number): string {
  return `${n} game${n === 1 ? '' : 's'}`;
}

/**
 * The rank-in-context line for a team, derived from an ordered standings list
 * (already sorted best→worst). Returns e.g. "1st · 1 game up on Machine",
 * "3rd · 1 game back of Empire", or just "1st" / "Last" when there's no neighbor
 * to compare. `scope` is an optional trailing qualifier ("in East").
 *
 * "Games up/back" uses the classic (wins-losses) differential / 2 vs the
 * relevant neighbor — the team above when you're chasing, the team below when
 * you're leading.
 */
function rankContextLine(
  rows: Array<{ teamId: string; wins: number; losses: number; name: string }>,
  teamId: string,
  scope: string | null,
): string | null {
  const idx = rows.findIndex((r) => r.teamId === teamId);
  if (idx < 0) return null;
  const me = rows[idx];
  const rankLabel = ordinal(idx + 1) + (scope ? ` in ${scope}` : '');
  const diff2 = (a: { wins: number; losses: number }, b: { wins: number; losses: number }) =>
    ((a.wins - a.losses) - (b.wins - b.losses)) / 2;

  if (idx === 0) {
    // Leading — how far up on the next team down?
    const next = rows[idx + 1];
    if (!next) return rankLabel;
    const up = diff2(me, next);
    if (up <= 0) return `${rankLabel} · tied with ${next.name}`;
    return `${rankLabel} · ${games(up)} up on ${next.name}`;
  }
  // Chasing — how far back of the team directly above?
  const above = rows[idx - 1];
  const back = diff2(above, me);
  if (back <= 0) return `${rankLabel} · tied with ${above.name}`;
  return `${rankLabel} · ${games(back)} back of ${above.name}`;
}

/**
 * Recent form (most-recent-first, capped at 5) for a team, from that team's
 * already-fetched FeedGames. Only finals with a decided score count.
 */
function formFromGames(feedGames: FeedGame[], teamId: string): Array<'W' | 'L'> {
  return feedGames
    .filter((g) => g.status === 'final' && (g.home.teamId === teamId || g.away.teamId === teamId))
    .filter((g) => g.home.score !== null && g.away.score !== null)
    .sort((a, b) => b.sortTs - a.sortTs)
    .slice(0, 5)
    .map((g) => {
      const isHome = g.home.teamId === teamId;
      const mine = isHome ? g.home.score! : g.away.score!;
      const theirs = isHome ? g.away.score! : g.home.score!;
      return mine >= theirs ? ('W' as const) : ('L' as const);
    });
}

// ─── UFA games ──────────────────────────────────────────────────────────────

function ufaStatus(g: UfaGame): 'upcoming' | 'live' | 'final' {
  const s = gameUiState(g);
  return s.isLive ? 'live' : s.isFinal ? 'final' : 'upcoming';
}

async function ufaGamesFor(favTeamIds: Set<string>, now: number): Promise<FeedGame[]> {
  if (favTeamIds.size === 0) return [];
  // Current slate covers live + near-term; the season pull backfills recents.
  const [current, season] = await Promise.all([
    getCurrentGames().catch(() => [] as UfaGame[]),
    getGamesByYears([currentSeasonYear()]).catch(() => [] as UfaGame[]),
  ]);
  const byId = new Map<string, UfaGame>();
  for (const g of [...season, ...current]) byId.set(g.gameID, g); // current wins (fresher)

  const out: FeedGame[] = [];
  for (const g of byId.values()) {
    const favIsAway = favTeamIds.has(g.awayTeamID);
    const favIsHome = favTeamIds.has(g.homeTeamID);
    if (!favIsAway && !favIsHome) continue;

    const status = ufaStatus(g);
    const date = g.startTimestamp ? new Date(g.startTimestamp) : null;
    const ts = date ? date.getTime() : now; // dateless → treat as "now" (keep)
    if (date && !inWindow(ts, now, status)) continue;

    const favName = favIsHome ? `${g.homeTeamCity} ${g.homeTeamName}` : `${g.awayTeamCity} ${g.awayTeamName}`;
    out.push({
      id: `ufa-${g.gameID}`,
      league: 'ufa',
      status,
      away: { name: `${g.awayTeamCity} ${g.awayTeamName}`, teamId: g.awayTeamID, score: status === 'upcoming' ? null : g.awayScore, logoUrl: teamMeta(g.awayTeamID).logo ?? null },
      home: { name: `${g.homeTeamCity} ${g.homeTeamName}`, teamId: g.homeTeamID, score: status === 'upcoming' ? null : g.homeScore, logoUrl: teamMeta(g.homeTeamID).logo ?? null },
      when: whenLabel(date, status),
      favoriteTeamName: favName,
      sortTs: ts,
      isPreview: false,
    });
  }
  return out;
}

// ─── PUL / WUL games (identical shape) ──────────────────────────────────────

type LeagueGame = {
  id: string;
  status: 'scheduled' | 'final';
  gameDate: string | null;
  away: { teamId: string; city: string | null; mascot: string | null; score: number | null; logoUrl: string | null };
  home: { teamId: string; city: string | null; mascot: string | null; score: number | null; logoUrl: string | null };
};

function sideName(s: { city: string | null; mascot: string | null }, fallback: string): string {
  return [s.city, s.mascot].filter(Boolean).join(' ') || fallback;
}

function proLeagueGamesFor(
  league: 'pul' | 'wul',
  games: LeagueGame[],
  favTeamIds: Set<string>,
  now: number,
): FeedGame[] {
  const out: FeedGame[] = [];
  for (const g of games) {
    const favIsAway = favTeamIds.has(g.away.teamId);
    const favIsHome = favTeamIds.has(g.home.teamId);
    if (!favIsAway && !favIsHome) continue;

    const status: 'upcoming' | 'final' = g.status === 'final' ? 'final' : 'upcoming';
    const date = g.gameDate ? new Date(g.gameDate) : null;
    const ts = date ? date.getTime() : now;
    if (date && !inWindow(ts, now, status)) continue;

    const awayName = sideName(g.away, 'Away');
    const homeName = sideName(g.home, 'Home');
    out.push({
      id: `${league}-${g.id}`,
      league,
      status,
      away: { name: awayName, teamId: g.away.teamId, score: g.away.score, logoUrl: g.away.logoUrl },
      home: { name: homeName, teamId: g.home.teamId, score: g.home.score, logoUrl: g.home.logoUrl },
      when: whenLabel(date, status),
      favoriteTeamName: favIsHome ? homeName : awayName,
      sortTs: ts,
      isPreview: false,
    });
  }
  return out;
}

// ─── Team snapshots (record / standing / stats / leaders) ───────────────────

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};
const plusMinus = (n: number): string => (n >= 0 ? `+${n}` : String(n));

/** Top players by a set of categories, one leader each, deduped by category. */
function topLeaders<T>(
  players: T[],
  league: FavoriteLeague,
  getName: (p: T) => string,
  getId: (p: T) => string | null,
  cats: Array<{ label: string; get: (p: T) => number; fmt?: (n: number) => string }>,
): TeamLeader[] {
  const out: TeamLeader[] = [];
  for (const c of cats) {
    let best: T | null = null;
    let bestV = -Infinity;
    for (const p of players) {
      const v = c.get(p);
      if (v > bestV) { bestV = v; best = p; }
    }
    if (best && bestV > 0) {
      out.push({
        playerId: getId(best),
        name: getName(best),
        statLabel: c.label,
        statValue: c.fmt ? c.fmt(bestV) : String(bestV),
        league,
      });
    }
  }
  return out;
}

async function ufaSnapshot(
  team: FavoriteTeam,
  standingsById: Map<string, { wins: number; losses: number; division: string; pointDiff: number }>,
  divisionRows: Map<string, Array<{ teamId: string; wins: number; losses: number; name: string }>>,
  teamStatsById: Map<string, UfaTeamStat>,
  teamGames: FeedGame[],
  year: number,
): Promise<TeamSnapshot> {
  const s = standingsById.get(team.teamId);
  const teamStatsRes = teamStatsById.get(team.teamId) ?? null;
  const players = await getAllPlayerStats(
    { year, per: 'total', teamID: team.teamId, limit: 30 },
    { maxPages: 2 },
  ).catch(() => [] as UfaPlayerStat[]);

  const stats: TeamStat[] = [];
  if (teamStatsRes) {
    stats.push(
      { label: 'PF', value: String(num(teamStatsRes.scoresFor)) },
      { label: 'PA', value: String(num(teamStatsRes.scoresAgainst)) },
      { label: 'Blk', value: String(num(teamStatsRes.blocks)) },
      { label: 'TO', value: String(num(teamStatsRes.turnovers)) },
    );
  }
  const leaders = topLeaders(
    players, 'ufa',
    (p) => p.name, (p) => p.playerID,
    [
      { label: 'Goals', get: (p) => p.goals ?? 0 },
      { label: 'Assists', get: (p) => p.assists ?? 0 },
      { label: 'Blocks', get: (p) => p.blocks ?? 0 },
      { label: '+/-', get: (p) => p.plusMinus ?? 0, fmt: plusMinus },
    ],
  );

  // Rank within the team's own division (UFA standings are divisional).
  const divRows = s ? divisionRows.get(s.division) ?? [] : [];
  const rankContext = s ? rankContextLine(divRows, team.teamId, s.division) : null;

  return {
    team,
    record: s ? `${s.wins}-${s.losses}` : null,
    standing: s ? `${s.division} Division` : null,
    rankContext,
    form: formFromGames(teamGames, team.teamId),
    stats,
    leaders,
    roster: [],
    accolades: [],
    isPreview: false,
  };
}

/** PUL + WUL share PulPlayer/WulPlayer stat shape — one enricher. */
async function proSnapshot(
  team: FavoriteTeam,
  league: 'pul' | 'wul',
  standings: { teamId: string; wins: number; losses: number; place: number; name: string }[],
  teamGames: FeedGame[],
  season: number,
): Promise<TeamSnapshot> {
  const row = standings.find((r) => r.teamId === team.teamId);
  const [teamMetaRow, roster] = await Promise.all([
    league === 'pul' ? getPulTeam(team.teamId).catch(() => null) : getWulTeam(team.teamId).catch(() => null),
    (league === 'pul'
      ? getPulRoster(team.teamId, season).catch(() => [] as PulPlayer[])
      : getWulRoster(team.teamId, season).catch(() => [] as WulPlayer[])) as Promise<Array<PulPlayer | WulPlayer>>,
  ]);
  const name = teamMetaRow?.name ?? team.name;

  // Team stat tiles aggregated from the roster (PUL/WUL have no team-stats API).
  const agg = roster.reduce(
    (a, p) => {
      a.goals += p.goals ?? 0; a.assists += p.assists ?? 0;
      a.blocks += p.blocks ?? 0; a.turnovers += p.turnovers ?? 0;
      return a;
    },
    { goals: 0, assists: 0, blocks: 0, turnovers: 0 },
  );
  const stats: TeamStat[] = roster.length
    ? [
        { label: 'G', value: String(agg.goals) },
        { label: 'A', value: String(agg.assists) },
        { label: 'Blk', value: String(agg.blocks) },
        { label: 'TO', value: String(agg.turnovers) },
      ]
    : [];

  const leaders = topLeaders(
    roster, league,
    (p) => p.playerName, (p) => p.id,
    [
      { label: 'Goals', get: (p) => p.goals ?? 0 },
      { label: 'Assists', get: (p) => p.assists ?? 0 },
      { label: 'Blocks', get: (p) => p.blocks ?? 0 },
      { label: '+/-', get: (p) => p.plusMinus ?? 0, fmt: plusMinus },
    ],
  );

  const rankContext = rankContextLine(standings, team.teamId, null);

  return {
    team: { ...team, name },
    record: row ? `${row.wins}-${row.losses}` : null,
    standing: row ? ordinal(row.place) + ` in ${league.toUpperCase()}` : null,
    rankContext,
    form: formFromGames(teamGames, team.teamId),
    stats,
    leaders,
    roster: [],
    accolades: [],
    isPreview: false,
  };
}

async function usauSnapshot(team: FavoriteTeam, year: number): Promise<TeamSnapshot> {
  const t = await getUsauTeam(team.teamId).catch(() => null);
  // Prefer the CURRENT season; fall back to the newest the team has.
  const season = t?.seasons?.find((s) => s.season === year) ?? t?.seasons?.[0] ?? null;
  const latest = season?.events?.[0] ?? null;
  const placement = latest?.finalPlacement ?? null;

  // Full roster is the substance for an event-based team (no per-game stats).
  const roster = (season?.roster ?? []).map((p) => ({
    playerId: p.playerId,
    name: p.name,
    jersey: p.jerseyNumber,
  }));
  const rosterSize = roster.length;
  const stats: TeamStat[] = rosterSize > 0 ? [{ label: 'Roster', value: String(rosterSize) }] : [];

  // Accolades: notable finishes (top-8 placements) across ALL seasons, best
  // placement first. This is the "accolades" the user asked for on the card.
  const accolades: TeamSnapshot['accolades'] = [];
  for (const s of t?.seasons ?? []) {
    for (const ev of s.events) {
      if (ev.finalPlacement != null && ev.finalPlacement <= 8) {
        accolades.push({ placement: ev.finalPlacement, event: ev.name, season: s.season });
      }
    }
  }
  accolades.sort((a, b) => a.placement - b.placement || b.season - a.season);

  return {
    team,
    record: null, // USAU is event-based; no season W-L record here
    standing: placement != null ? `Finished ${ordinal(placement)} · ${latest?.name ?? ''}`.trim() : (latest?.name ?? null),
    rankContext: null,
    form: [],
    stats,
    leaders: [], // USAU per-player stats aren't reliably per-team; roster only
    roster,
    accolades,
    isPreview: false,
  };
}

/**
 * A favorite USAU team's tournaments for the CURRENT year — upcoming + played.
 * USAU has no per-team game schedule, so tournaments are the team's "feed".
 * getUsauTeam already aggregates every row of the real team (name + level +
 * gender), so its seasons cover the current year's events.
 */
async function usauTournamentsFor(team: FavoriteTeam, now: number, year: number): Promise<FeedTournament[]> {
  const t = await getUsauTeam(team.teamId).catch(() => null);
  const season = t?.seasons?.find((s) => s.season === year);
  if (!season) return [];
  return season.events.map((ev) => {
    const date = ev.startDate ? new Date(ev.startDate) : null;
    const ts = date ? date.getTime() : now;
    // Past once it has a final placement OR its start date is in the past.
    const past = ev.finalPlacement != null || (date != null && ts < now);
    return {
      id: `usau-${ev.slug}`,
      league: 'usau' as const,
      name: ev.name,
      slug: ev.slug,
      startDate: ev.startDate,
      placement: ev.finalPlacement,
      status: past ? ('past' as const) : ('upcoming' as const),
      favoriteTeamName: team.name,
      sortTs: ts,
    };
  });
}

/**
 * A favorite USAU team's UPCOMING scheduled games (real pool-play matchups with
 * kickoff times) for the current year. USAU is event-based, so unlike UFA there's
 * no team-wide schedule endpoint — we walk the team's current-year events, fetch
 * each one that could still have unplayed games (starts within the next ~30d or
 * started within the last ~3d, since a tournament plays Fri–Sun), and pull that
 * team's games with status 'scheduled' + a future kickoff.
 *
 * Games are keyed on per-season team ids that differ from the favorite's stored
 * teamId, so we match by NAME (same clustering the rest of the USAU layer uses).
 */
async function usauUpcomingGamesFor(team: FavoriteTeam, now: number, year: number): Promise<FeedGame[]> {
  const t = await getUsauTeam(team.teamId).catch(() => null);
  const season = t?.seasons?.find((s) => s.season === year);
  if (!season) return [];

  // Only fetch events that plausibly still have unplayed games (a full event
  // fetch each is not free). Window: start within +30d, or started within -3d.
  const candidateSlugs = season.events
    .filter((ev) => {
      if (!ev.startDate) return true; // undated → check it
      const ts = new Date(ev.startDate).getTime();
      return ts >= now - 3 * MS_DAY && ts <= now + 30 * MS_DAY;
    })
    .map((ev) => ev.slug);
  if (candidateSlugs.length === 0) return [];

  const teamNameLc = t!.name.toLowerCase();
  const events = await Promise.all(candidateSlugs.map((slug) => getUsauEvent(slug).catch(() => null)));

  const out: FeedGame[] = [];
  for (const ev of events) {
    if (!ev) continue;
    for (const g of ev.games) {
      const aLc = g.teamAName?.toLowerCase() ?? '';
      const bLc = g.teamBName?.toLowerCase() ?? '';
      const favIsA = aLc === teamNameLc;
      const favIsB = bLc === teamNameLc;
      if (!favIsA && !favIsB) continue;
      if (g.status !== 'scheduled') continue; // finals handled by the tournament/results path
      const date = g.scheduledAt ? new Date(g.scheduledAt) : null;
      const ts = date ? date.getTime() : now;
      if (ts < now) continue; // only genuinely upcoming
      if (!g.teamAName || !g.teamBName) continue; // need both sides to show a matchup

      out.push({
        id: `usau-${g.id}`,
        league: 'usau',
        status: 'upcoming',
        away: { name: g.teamAName, teamId: g.teamAId ?? '', score: null, logoUrl: null },
        home: { name: g.teamBName, teamId: g.teamBId ?? '', score: null, logoUrl: null },
        when: whenLabel(date, 'upcoming'),
        favoriteTeamName: team.name,
        sortTs: ts,
        isPreview: false,
      });
    }
  }
  return out;
}

async function wfdfSnapshot(team: FavoriteTeam): Promise<TeamSnapshot> {
  const t = await getWfdfTeam(team.teamId).catch(() => null);
  const record = t && t.wins != null && t.losses != null ? `${t.wins}-${t.losses}` : null;
  const standing = t?.finalStanding != null
    ? `${ordinal(t.finalStanding)} · ${t.eventName}`
    : (t?.eventName ?? null);
  const stats: TeamStat[] = [];
  if (t?.scoresFor != null) stats.push({ label: 'PF', value: String(t.scoresFor) });
  if (t?.scoresAgainst != null) stats.push({ label: 'PA', value: String(t.scoresAgainst) });
  if (t?.spiritAvg != null) stats.push({ label: 'Spirit', value: t.spiritAvg.toFixed(1) });
  const rosterSize = t?.roster?.length ?? 0;
  if (rosterSize > 0) stats.push({ label: 'Roster', value: String(rosterSize) });
  return { team, record, standing, rankContext: null, form: [], stats, leaders: [], roster: [], accolades: [], isPreview: false };
}

// ─── League standings teasers ───────────────────────────────────────────────
// LEAGUE_DISPLAY lives in ./leagues (a plain module) — this file is 'use server'
// and can only export async functions, so display constants can't live here.

// ─── Main entry ─────────────────────────────────────────────────────────────

export async function getForYouFeed(favorites: {
  leagues: FavoriteLeague[];
  teams: FavoriteTeam[];
}): Promise<ForYouFeed> {
  const now = Date.now();
  const teams = favorites.teams;

  const favByLeague = (lg: FavoriteLeague) =>
    new Set(teams.filter((t) => t.league === lg).map((t) => t.teamId));

  // Which leagues do we actually need data for? (favorited as a league OR has a
  // favorited team in it.)
  const activeLeagues = new Set<FavoriteLeague>([
    ...favorites.leagues,
    ...teams.map((t) => t.league),
  ]);

  // ── Fetch league-wide data once (shared by games + snapshots + teasers) ──
  const needUfa = activeLeagues.has('ufa');
  const needPul = activeLeagues.has('pul');
  const needWul = activeLeagues.has('wul');

  const [
    ufaGamesRaw,
    ufaStandingsRaw,
    pulGamesRaw,
    pulStandingsRaw,
    wulGamesRaw,
    wulStandingsRaw,
    ufaTeamStatsRaw,
  ] = await Promise.all([
    needUfa ? ufaGamesFor(favByLeague('ufa'), now) : Promise.resolve([] as FeedGame[]),
    needUfa ? getStandings().catch(() => []) : Promise.resolve([]),
    needPul ? listPulGames({ season: PUL_CURRENT_SEASON }).catch(() => []) : Promise.resolve([]),
    needPul ? getPulStandings(PUL_CURRENT_SEASON).catch(() => []) : Promise.resolve([]),
    needWul ? listWulGames({ season: WUL_CURRENT_SEASON }).catch(() => []) : Promise.resolve([]),
    needWul ? getWulStandings(WUL_CURRENT_SEASON).catch(() => []) : Promise.resolve([]),
    needUfa ? getTeamStats({ year: currentSeasonYear() }).then((r) => r.stats ?? []).catch(() => [] as UfaTeamStat[]) : Promise.resolve([] as UfaTeamStat[]),
  ]);

  // UFA standings index (teamID → wins/losses/division/pointDiff)
  const ufaStandingsById = new Map<string, { wins: number; losses: number; division: string; pointDiff: number }>();
  for (const s of ufaStandingsRaw) {
    ufaStandingsById.set(s.teamID, { wins: s.wins, losses: s.losses, division: s.divisionName, pointDiff: s.pointDiff });
  }
  // UFA division-ordered rows (division → best→worst) for rank-in-context.
  const ufaDivisionRows = new Map<string, Array<{ teamId: string; wins: number; losses: number; name: string }>>();
  for (const s of ufaStandingsRaw) {
    const arr = ufaDivisionRows.get(s.divisionName) ?? [];
    arr.push({ teamId: s.teamID, wins: s.wins, losses: s.losses, name: s.teamName });
    ufaDivisionRows.set(s.divisionName, arr);
  }
  for (const arr of ufaDivisionRows.values()) {
    arr.sort((a, b) => b.wins - a.wins || (a.losses - b.losses));
  }
  // UFA team-stats index (teamID → team stat row).
  const ufaTeamStatsById = new Map<string, UfaTeamStat>();
  for (const ts of ufaTeamStatsRaw) ufaTeamStatsById.set(ts.teamID, ts);

  // PUL/WUL standings → {teamId, wins, losses, place, name} ordered lists
  const pulPlaces = pulStandingsRaw.map((r, i) => ({ teamId: r.team.id, wins: r.wins, losses: r.losses, place: i + 1, name: r.team.name }));
  const wulPlaces = wulStandingsRaw.map((r, i) => ({ teamId: r.team.id, wins: r.wins, losses: r.losses, place: i + 1, name: r.team.name }));

  // ── Games strip: UFA (pre-shaped) + PUL/WUL ──
  const pulGames = proLeagueGamesFor(
    'pul',
    (pulGamesRaw as unknown as LeagueGame[]),
    favByLeague('pul'),
    now,
  );
  const wulGames = proLeagueGamesFor(
    'wul',
    (wulGamesRaw as unknown as LeagueGame[]),
    favByLeague('wul'),
    now,
  );

  // ── USAU upcoming scheduled games (pool play) for favorite USAU teams ──
  // Event-based → walk each favorite USAU team's near-term events for its
  // not-yet-played matchups. Fetched per team (each does its own event fetches).
  const currentYear = new Date(now).getFullYear();
  const usauFavTeams = teams.filter((t) => t.league === 'usau');
  const usauGameLists = await Promise.all(
    usauFavTeams.map((t) => usauUpcomingGamesFor(t, now, currentYear).catch(() => [] as FeedGame[])),
  );
  const usauGames = usauGameLists.flat();

  const allGames = [...ufaGamesRaw, ...pulGames, ...wulGames, ...usauGames].sort((a, b) => {
    // Upcoming/live first (ascending by time), then finals (most recent first).
    const aFinal = a.status === 'final';
    const bFinal = b.status === 'final';
    if (aFinal !== bFinal) return aFinal ? 1 : -1;
    return aFinal ? b.sortTs - a.sortTs : a.sortTs - b.sortTs;
  });

  // Trim finals to the most-recent few PER favorite team so a wrapped-up season
  // still surfaces its latest results without one team flooding the strip.
  const finalsPerTeam = new Map<string, number>();
  const games = allGames.filter((g) => {
    if (g.status !== 'final') return true; // keep all upcoming/live
    const key = `${g.league}:${g.favoriteTeamName}`;
    const n = (finalsPerTeam.get(key) ?? 0) + 1;
    finalsPerTeam.set(key, n);
    return n <= RECENT_FINALS_PER_TEAM;
  });

  // ── Team snapshots (per favorite team) — record/standing + stats + leaders ──
  // Form is computed off the UNtrimmed game set (allGames) so a team's last 5
  // results survive the strip's per-team recency cap.
  const ufaYear = currentSeasonYear();
  const snapshots = await Promise.all(
    teams.map((t) => {
      switch (t.league) {
        case 'ufa': return ufaSnapshot(t, ufaStandingsById, ufaDivisionRows, ufaTeamStatsById, allGames, ufaYear);
        case 'pul': return proSnapshot(t, 'pul', pulPlaces, allGames, PUL_CURRENT_SEASON);
        case 'wul': return proSnapshot(t, 'wul', wulPlaces, allGames, WUL_CURRENT_SEASON);
        case 'usau': return usauSnapshot(t, currentYear);
        case 'wfdf': return wfdfSnapshot(t);
      }
    }),
  );

  // ── Tournaments (USAU favorite teams — current year, upcoming + played) ──
  // USAU has no per-team game schedule, so a favorite USAU team's "feed" is its
  // tournament entries. WFDF teams are single-event so their snapshot already
  // names the event; only USAU gets the tournament list. (currentYear +
  // usauFavTeams are computed above with the USAU games fetch.)
  const tournamentLists = await Promise.all(
    usauFavTeams.map((t) => usauTournamentsFor(t, now, currentYear).catch(() => [] as FeedTournament[])),
  );
  const tournaments = tournamentLists.flat().sort((a, b) => {
    // Upcoming first (soonest first), then past (most recent first).
    const aPast = a.status === 'past';
    const bPast = b.status === 'past';
    if (aPast !== bPast) return aPast ? 1 : -1;
    return aPast ? b.sortTs - a.sortTs : a.sortTs - b.sortTs;
  });

  // ── Hero game: the one game to feature big ──
  // Priority: a live game > the soonest upcoming game > the most recent final.
  // `games` is already sorted (live/upcoming ascending, then finals descending),
  // so the first element is exactly that. Pull it out so the strip shows the rest.
  const heroGame = games.length > 0 ? games[0] : null;
  const stripGames = heroGame ? games.slice(1) : games;

  return { heroGame, games: stripGames, tournaments, teams: snapshots };
}

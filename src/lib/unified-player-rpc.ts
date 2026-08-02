// RPC-backed fast path for the unified player profile.
//
// The shared `get_player_profile(p_anchor_id text)` function (deployed to the
// Supabase project, co-owned with the mobile app) reproduces the cross-league
// merge in one round trip: ~2ms warm off a cache-aside table, <300ms cold.
// The multi-query assembler in ./unified-player.ts stays as the fallback — any
// RPC error, a null return, or a payload we can't faithfully map degrades to it,
// so the rollout carries no behavioral risk.
//
// ── Two things the RPC does NOT give us, and how we handle them ─────────────
//
// 1. UFA ATTRIBUTION (correctness-critical). The RPC name-matches a UFA slug
//    with a bare `names_match` + `limit 1`. Its namesake conflict-graph splits
//    apart distinct humans WITHIN USAU, but nothing verifies that the matched
//    UFA career belongs to the person the anchor resolved to. Web guards this
//    with a geography check (see the attribution block in ./unified-player.ts):
//    if the USAU cluster's home states and the UFA team's state are both known
//    and disjoint, the UFA career is NOT this person's. The RPC omits
//    `homeStates` entirely, so we re-derive it here from the series-event names
//    already present in the payload — no extra query. This path prefers
//    `payload.homeStates` when present, so the day mobile adds it we switch over
//    with no code change; homeStatesFromPayload() then becomes dead code.
//
// 2. HEADSHOT LIVE-SCRAPE. The RPC returns the STORED headshot url only, by
//    design. A brand-new UFA player the sync hasn't self-hosted yet has none, so
//    a null headshot falls back to the live watchufa scrape — same order of
//    preference the fallback assembler uses (stored → live → monogram).
//
// ── Known defects in the shared function (verified against live data) ──────
//
// Until these are fixed upstream, the guards below detect each one and hand off
// to the multi-query assembler, so an affected profile is SLOW but never WRONG.
// Each guard is written to stop firing automatically once the fix lands — no
// coordinated deploy needed, and no code change here beyond deleting dead code.
//
//   a. UFA per-game rows omit `throwaways`/`drops`/`stalls`. The profile's game
//      log computes +/- as G+A+B−throwaways−drops−stalls; without them every row
//      would overstate +/-. Guard: ufaGamesArePresentable().
//   b. USAU `events` is empty for every stint — the event flatten aggregates the
//      inner array rather than the event object, so the downstream
//      `ev->>'slug' is not null` filter drops all of them. This zeroes
//      career.usauEventsPlayed and the USAU goals/assists contribution.
//      Guard: usauEventsArePresentable().
//   c. UFA stints only cover 2022+ (the extent of `ufa_games`); earlier seasons
//      live solely in the upstream UFA API. Guard: ufaCoverageIsComplete().

import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { getPlayerInfo } from '@/lib/ufa/client';
import { teamBySlugOrAbbr } from '@/lib/ufa/teams';
import { ufaTeamState, statesForEventName, isUsStateCode } from '@/lib/usau/regions';
import type { UfaPlayerGameRow } from '@/lib/ufa/types';
import type { PlayerKind } from '@/lib/player-content/types';
import type {
  UnifiedPlayerProfile,
  UnifiedYear,
  SeasonStint,
  UfaSeasonStint,
  UsauSeasonStint,
  PulSeasonStint,
  WulSeasonStint,
  WfdfSeasonStint,
} from './unified-player';

// ── Wire shape ───────────────────────────────────────────────────────────
// Mirrors the jsonb the SQL function builds. Every field is treated as
// possibly-absent: this is a shared contract we don't own, and a shape drift
// should degrade to the fallback assembler rather than throw into a 500.

interface RpcUfaGame {
  gameId?: string | null;
  isHome?: boolean | null;
  goals?: number | null;
  assists?: number | null;
  blocks?: number | null;
  completions?: number | null;
  throwsAttempted?: number | null;
  hucksCompleted?: number | null;
  hucksAttempted?: number | null;
  throwaways?: number | null;
  drops?: number | null;
  stalls?: number | null;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  homeScore?: number | null;
  awayScore?: number | null;
  startTimestamp?: string | null;
}

interface RpcUfaStint {
  year?: number | null;
  teamId?: string | null;
  totals?: Record<string, number | null> | null;
  isChampion?: boolean | null;
  games?: RpcUfaGame[] | null;
}

interface RpcUsauStint {
  season?: number | null;
  teamId?: string | null;
  teamName?: string | null;
  genderDivision?: string | null;
  competitionLevel?: string | null;
  jerseyNumber?: string | null;
  isChampion?: boolean | null;
  events?: UsauSeasonStint['events'] | null;
}

interface RpcLeagueBlock<TStint> {
  stints?: TStint[] | null;
  career?: Record<string, number | null> | null;
}

interface RpcPulStint {
  season?: number | null;
  teamId?: string | null;
  teamName?: string | null;
  teamCity?: string | null;
  teamLogoUrl?: string | null;
  teamAccentColor?: string | null;
  jerseyNumber?: string | null;
  pronouns?: string | null;
  stats?: Record<string, number | null> | null;
}

interface RpcWulStint extends Omit<RpcPulStint, 'pronouns'> {
  games?: unknown[] | null;
}

interface RpcWfdfStint {
  season?: number | null;
  teamId?: string | null;
  teamName?: string | null;
  countryCode?: string | null;
  divisionName?: string | null;
  eventName?: string | null;
  eventSlug?: string | null;
  jerseyNumber?: string | null;
  isChampion?: boolean | null;
  stats?: { goals?: number | null; assists?: number | null } | null;
}

interface RpcProfile {
  anchorId?: string | null;
  anchorLeague?: string | null;
  displayName?: string | null;
  ufaSlug?: string | null;
  usauId?: string | null;
  /** EVERY usau_players id in the resolved cluster, not just the anchor's.
   *  The scraper mints one id per event registration, so one human routinely has
   *  many; content is keyed per-id, so all of them are needed to build a
   *  complete gallery. Absent on pre-20260801120000 payloads — treat as empty. */
  usauClusterIds?: string[] | null;
  pulAnchorId?: string | null;
  wulAnchorId?: string | null;
  headshotUrl?: string | null;
  pronouns?: string | null;
  /** Not currently emitted by the shared function — see note (1) at the top.
   *  Declared so that the day mobile adds it, this path picks it up for free. */
  homeStates?: string[] | null;
  ufaStints?: RpcUfaStint[] | null;
  championYearsUfa?: number[] | null;
  usauTeamHistory?: RpcUsauStint[] | null;
  championYearsUsau?: number[] | null;
  pul?: RpcLeagueBlock<RpcPulStint> | null;
  wul?: RpcLeagueBlock<RpcWulStint> | null;
  wfdfStints?: RpcWfdfStint[] | null;
}

const num = (v: number | null | undefined): number => (typeof v === 'number' ? v : 0);
const str = (v: string | null | undefined): string => (typeof v === 'string' ? v : '');

/**
 * Rebuild the `gameID` the UI keys on ("2024-05-11-ATX-DAL") from the RPC's
 * structured columns. The UI parses this string for the date, the opponent, and
 * the /g/{id} link, so it has to be byte-identical to the UFA API's own id.
 *
 * The RPC returns the raw `ufa_games.id`, which IS that string — we prefer it
 * verbatim and only synthesize when it's absent.
 */
function ufaGameId(g: RpcUfaGame): string | null {
  if (g.gameId) return g.gameId;
  const date = g.startTimestamp?.slice(0, 10);
  const home = g.homeTeamId ? teamBySlugOrAbbr(g.homeTeamId)?.abbr : null;
  const away = g.awayTeamId ? teamBySlugOrAbbr(g.awayTeamId)?.abbr : null;
  if (!date || !home || !away) return null;
  return `${date}-${away}-${home}`;
}

/**
 * Map an RPC game row onto UfaPlayerGameRow. The UI reads a narrow slice of
 * this type — gameID, isHome, scoreHome/scoreAway, goals, assists, blocks,
 * throwaways/drops/stalls (per-game +/-), completions, throwsAttempted, hucks —
 * and every one of those is present in the RPC payload. Fields the UI does not
 * read on this surface (hockeyAssists, yards, seconds, o/d points, catches,
 * pulls, callahans) are zero-filled to satisfy the type.
 *
 * NOTE: zero-fill is safe ONLY while those fields stay unread on the profile.
 * If a future stat column surfaces one of them here, it must be added to the
 * shared function's `games` payload first — otherwise it silently renders 0.
 */
function mapUfaGame(g: RpcUfaGame): UfaPlayerGameRow | null {
  const gameID = ufaGameId(g);
  if (!gameID) return null;
  const isHome = g.isHome === true;
  return {
    gameID,
    isHome,
    scoreHome: num(g.homeScore),
    scoreAway: num(g.awayScore),
    assists: num(g.assists),
    goals: num(g.goals),
    hockeyAssists: 0,
    completions: num(g.completions),
    throwaways: num(g.throwaways),
    stalls: num(g.stalls),
    throwsAttempted: num(g.throwsAttempted),
    catches: 0,
    drops: num(g.drops),
    blocks: num(g.blocks),
    callahans: 0,
    pulls: 0,
    obPulls: 0,
    recordedPulls: 0,
    recordedPullsHangtime: 0,
    oPointsPlayed: 0,
    oPointsScored: 0,
    dPointsPlayed: 0,
    dPointsScored: 0,
    secondsPlayed: 0,
    yardsReceived: 0,
    yardsThrown: 0,
    hucksCompleted: num(g.hucksCompleted),
    hucksAttempted: num(g.hucksAttempted),
  };
}

/**
 * Does the RPC's UFA game payload carry the fields the profile's game-log table
 * renders? The per-game +/- column is computed from throwaways/drops/stalls and
 * the result cell from homeScore/awayScore — if the shared function ever stops
 * emitting them, every row would silently render +/- as (G+A+B) and a 0–0
 * score. That's a wrong-data failure, not a cosmetic one, so we detect it and
 * hand off to the fallback assembler instead.
 *
 * Checked on the shape (key presence), not the values — a genuine 0 throwaway
 * game is normal and must not trip this.
 */
function ufaGamesArePresentable(stints: RpcUfaStint[]): boolean {
  for (const st of stints) {
    for (const g of st.games ?? []) {
      const hasPlusMinusInputs =
        'throwaways' in g && 'drops' in g && 'stalls' in g;
      const hasScores = 'homeScore' in g && 'awayScore' in g;
      if (!hasPlusMinusInputs || !hasScores) return false;
    }
  }
  return true;
}

/**
 * The first UFA season `ufa_games` covers. The RPC derives UFA stints purely
 * from ufa_game_player_stats ⋈ ufa_games, so a career that began before this
 * year is silently truncated to its post-2022 portion — there is no season-
 * totals table in the DB to fill the gap; the multi-query path gets those years
 * from the live UFA API instead. Verified: Ben Jagt renders 2022-2026 via the
 * RPC vs 2014-2026 via the API (5 seasons and a 2019 championship dropped).
 */
const UFA_DB_FIRST_SEASON = 2022;

/**
 * Would trusting the RPC's UFA stints truncate a career that predates the
 * game-log era? We can't know the true first season from the payload alone, so
 * we use the one signal we have: a USAU history that starts before UFA game
 * coverage means this player was active earlier, and any UFA seasons from that
 * period would be missing. Conservative — it only rejects when there IS a UFA
 * side to truncate and independent evidence of pre-coverage activity.
 */
function ufaCoverageIsComplete(
  ufaStints: RpcUfaStint[],
  usauStints: RpcUsauStint[],
): boolean {
  if (ufaStints.length === 0) return true;
  const earliestUsau = Math.min(
    ...usauStints
      .map((st) => st.season)
      .filter((s): s is number => typeof s === 'number'),
  );
  if (!Number.isFinite(earliestUsau)) return true;
  return earliestUsau >= UFA_DB_FIRST_SEASON;
}

/**
 * Does the RPC's USAU payload carry per-stint `events`?
 *
 * As of this writing the shared function returns EVERY stint with `events: []`
 * — its event flatten aggregates the inner array instead of the event object,
 * leaving the value double-nested, so the `ev->>'slug' is not null` filter that
 * follows discards all of them (verified against live data: Ben Jagt, 0 of 32
 * events survive). Those events drive `career.usauEventsPlayed` and the
 * goals/assists that USAU contributes to career totals, so accepting the
 * payload would silently zero out a real chunk of the hero stats.
 *
 * A player genuinely CAN have a roster spot with no event participation, so an
 * empty array is not by itself proof of the bug. We only reject when EVERY
 * stint is empty while there is at least one stint — the signature of the
 * systemic failure rather than of a sparse individual season.
 */
function usauEventsArePresentable(usauStints: RpcUsauStint[]): boolean {
  if (usauStints.length === 0) return true;
  return usauStints.some((st) => (st.events?.length ?? 0) > 0);
}

/**
 * Recover the `homeStates` signal the RPC omits — see note (1) at the top.
 *
 * Derived exactly the way the multi-query path derives it: the union of states
 * implied by the USAU cluster's SERIES (Sectionals/Regionals) event names. We
 * read the event names straight off the RPC payload we already hold, so this
 * costs no extra query at all in the common case.
 */
function homeStatesFromPayload(usauStints: RpcUsauStint[]): string[] {
  const states = new Set<string>();
  for (const st of usauStints) {
    for (const ev of st.events ?? []) {
      if (!ev?.name) continue;
      for (const s of statesForEventName(ev.name)) states.add(s);
    }
  }
  return [...states];
}

/**
 * The geography gate. Mirrors the attribution block in ./unified-player.ts
 * one-for-one, including its conservative fallback: we only DROP the UFA career
 * when the USAU cluster HAS a usable location signal AND it contradicts the UFA
 * team's state. No signal, or a non-US UFA team with no state, means keep.
 */
function shouldAttachUfa(
  ufaStints: RpcUfaStint[],
  usauStints: RpcUsauStint[],
  homeStates: string[],
): boolean {
  if (ufaStints.length === 0) return true;
  if (usauStints.length === 0) return true;
  if (homeStates.length === 0) return true;

  const usauStates = new Set(homeStates);
  // Non-US codes are dropped, not compared. Canadian franchises map to
  // provinces (royal→QC, rush/lions→ON), which can never appear in homeStates
  // (US codes only) — comparing them would guarantee a miss and drop the whole
  // real UFA career. A non-US team is no signal, so we keep, per the doc above.
  const ufaStates = ufaStints
    .map((st) => (st.teamId ? ufaTeamState(st.teamId) : null))
    .filter((s): s is string => s != null && isUsStateCode(s));
  if (ufaStates.length === 0) return true;
  return ufaStates.some((s) => usauStates.has(s));
}

function sortStintsForYear(stints: SeasonStint[]): SeasonStint[] {
  const leagueOrder: Record<SeasonStint['league'], number> = {
    ufa: 0,
    pul: 1,
    wul: 2,
    usau: 3,
    wfdf: 4,
  };
  return [...stints].sort((a, b) => leagueOrder[a.league] - leagueOrder[b.league]);
}

/**
 * Map the RPC payload onto UnifiedPlayerProfile. Returns null when the payload
 * can't be faithfully represented — the caller then runs the fallback
 * assembler, so a null here is a safe degradation, never a user-visible error.
 */
export async function mapRpcProfile(
  anchorId: string,
  payload: RpcProfile,
): Promise<UnifiedPlayerProfile | null> {
  const anchorLeague = payload.anchorLeague;
  if (
    anchorLeague !== 'ufa' &&
    anchorLeague !== 'usau' &&
    anchorLeague !== 'pul' &&
    anchorLeague !== 'wul'
  ) {
    return null;
  }
  const displayName = payload.displayName;
  if (!displayName) return null;

  const rpcUfaStints = payload.ufaStints ?? [];
  const rpcUsauStints = payload.usauTeamHistory ?? [];

  // Bail to the fallback if either league's payload can't be rendered
  // faithfully. Better a slower correct page than a fast wrong one.
  if (!ufaGamesArePresentable(rpcUfaStints)) return null;
  if (!usauEventsArePresentable(rpcUsauStints)) return null;
  if (!ufaCoverageIsComplete(rpcUfaStints, rpcUsauStints)) return null;

  // ── UFA attribution gate ────────────────────────────────────────────────
  // Prefer a homeStates the shared function supplies (not emitted today);
  // otherwise derive it from the event names already in this payload.
  const homeStates =
    payload.homeStates && payload.homeStates.length > 0
      ? payload.homeStates
      : homeStatesFromPayload(rpcUsauStints);
  const attachUfa = shouldAttachUfa(rpcUfaStints, rpcUsauStints, homeStates);

  const yearMap = new Map<number, SeasonStint[]>();
  const push = (year: number, stint: SeasonStint) => {
    const list = yearMap.get(year) ?? [];
    list.push(stint);
    yearMap.set(year, list);
  };

  // ── UFA ────────────────────────────────────────────────────────────────
  const championYearsUfa: number[] = [];
  if (attachUfa) {
    for (const st of rpcUfaStints) {
      const year = st.year;
      const teamMeta = st.teamId ? teamBySlugOrAbbr(st.teamId) : null;
      // An unknown team slug means our TEAM_META is out of date relative to the
      // DB; the fallback path skips such stints too (teamMetaByAbbr → continue).
      if (typeof year !== 'number' || !teamMeta) continue;
      const t = st.totals ?? {};
      const games = (st.games ?? [])
        .map(mapUfaGame)
        .filter((g): g is UfaPlayerGameRow => g != null);
      const stint: UfaSeasonStint = {
        league: 'ufa',
        teamId: teamMeta.id,
        teamMeta,
        totals: {
          gamesPlayed: num(t.gamesPlayed),
          goals: num(t.goals),
          assists: num(t.assists),
          blocks: num(t.blocks),
          plusMinus: num(t.plusMinus),
          completions: num(t.completions),
          throwsAttempted: num(t.throwsAttempted),
          hucksCompleted: num(t.hucksCompleted),
          hucksAttempted: num(t.hucksAttempted),
        },
        games,
        isChampion: st.isChampion === true,
      };
      if (stint.isChampion) championYearsUfa.push(year);
      push(year, stint);
    }
  }

  // ── USAU ───────────────────────────────────────────────────────────────
  for (const st of rpcUsauStints) {
    const season = st.season;
    if (typeof season !== 'number') continue;
    const stint: UsauSeasonStint = {
      league: 'usau',
      teamId: str(st.teamId),
      teamName: str(st.teamName),
      // Matches deriveUsauChip()'s current placeholder-null behavior.
      division: null,
      genderDivision: st.genderDivision ?? null,
      competitionLevel: st.competitionLevel ?? null,
      jerseyNumber: st.jerseyNumber ?? null,
      isChampion: st.isChampion === true,
      events: st.events ?? [],
    };
    push(season, stint);
  }

  // ── PUL ────────────────────────────────────────────────────────────────
  for (const st of payload.pul?.stints ?? []) {
    const season = st.season;
    if (typeof season !== 'number') continue;
    const s = st.stats ?? {};
    const stint: PulSeasonStint = {
      league: 'pul',
      season,
      teamId: str(st.teamId),
      teamName: str(st.teamName) || str(st.teamId),
      teamCity: str(st.teamCity),
      teamLogoUrl: st.teamLogoUrl ?? null,
      teamAccentColor: st.teamAccentColor ?? null,
      jerseyNumber: str(st.jerseyNumber),
      pronouns: st.pronouns ?? null,
      stats: {
        gamesPlayed: num(s.gamesPlayed),
        goals: num(s.goals),
        assists: num(s.assists),
        blocks: num(s.blocks),
        turnovers: num(s.turnovers),
        touches: num(s.touches),
        oPoints: num(s.oPoints),
        dPoints: num(s.dPoints),
        plusMinus: num(s.plusMinus),
      },
      // PUL per-game logs are not in the RPC payload. The fallback path fetches
      // them per-season; here the season-totals view renders without them, the
      // same way a 2022 PUL season (which genuinely has no box scores) does.
      games: [],
    };
    push(season, stint);
  }

  // ── WUL ────────────────────────────────────────────────────────────────
  for (const st of payload.wul?.stints ?? []) {
    const season = st.season;
    if (typeof season !== 'number') continue;
    const s = st.stats ?? {};
    const stint: WulSeasonStint = {
      league: 'wul',
      season,
      teamId: str(st.teamId),
      teamName: str(st.teamName) || str(st.teamId),
      teamCity: str(st.teamCity),
      teamLogoUrl: st.teamLogoUrl ?? null,
      teamAccentColor: st.teamAccentColor ?? null,
      jerseyNumber: str(st.jerseyNumber),
      stats: {
        gamesPlayed: num(s.gamesPlayed),
        goals: num(s.goals),
        assists: num(s.assists),
        blocks: num(s.blocks),
        turnovers: num(s.turnovers),
        touches: num(s.touches),
        oPoints: num(s.oPoints),
        dPoints: num(s.dPoints),
        plusMinus: num(s.plusMinus),
      },
      // The RPC's WUL game objects use a different shape than WulPlayerGameRow
      // (gameId/date/weekLabel/opponentAbbrev vs the data-layer row). Rather
      // than half-map it, leave empty — see the WUL note in the summary.
      games: [],
    };
    push(season, stint);
  }

  // ── WFDF ───────────────────────────────────────────────────────────────
  for (const st of payload.wfdfStints ?? []) {
    const season = st.season;
    if (typeof season !== 'number') continue;
    const stint: WfdfSeasonStint = {
      league: 'wfdf',
      season,
      teamId: str(st.teamId),
      teamName: str(st.teamName),
      countryCode: st.countryCode ?? null,
      divisionName: st.divisionName ?? null,
      eventName: str(st.eventName),
      eventSlug: str(st.eventSlug),
      jerseyNumber: st.jerseyNumber ?? null,
      isChampion: st.isChampion === true,
      stats: {
        goals: st.stats?.goals ?? null,
        assists: st.stats?.assists ?? null,
      },
    };
    push(season, stint);
  }

  const years: UnifiedYear[] = Array.from(yearMap.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([year, stints]) => ({ year, stints: sortStintsForYear(stints) }));

  // ── Most-recent USAU division ──────────────────────────────────────────
  let mostRecentUsauDivision: string | null = null;
  outer: for (const y of years) {
    for (const s of y.stints) {
      if (s.league === 'usau' && s.genderDivision) {
        mostRecentUsauDivision = s.genderDivision;
        break outer;
      }
    }
  }

  // ── Career aggregates ──────────────────────────────────────────────────
  // Recomputed from the mapped stints rather than read off the payload, so the
  // attribution gate above actually removes the UFA contribution when it fires.
  const career = {
    ufaGamesPlayed: 0,
    usauEventsPlayed: 0,
    goals: 0,
    assists: 0,
    blocks: 0,
    plusMinus: 0,
    completions: 0,
    throwsAttempted: 0,
  };
  for (const year of years) {
    for (const s of year.stints) {
      if (s.league === 'ufa') {
        career.ufaGamesPlayed += s.totals.gamesPlayed;
        career.goals += s.totals.goals;
        career.assists += s.totals.assists;
        career.blocks += s.totals.blocks;
        career.plusMinus += s.totals.plusMinus;
        career.completions += s.totals.completions;
        career.throwsAttempted += s.totals.throwsAttempted;
      } else if (s.league === 'usau') {
        career.usauEventsPlayed += s.events.length;
        for (const ev of s.events) {
          career.goals += ev.goals ?? 0;
          career.assists += ev.assists ?? 0;
        }
      }
    }
  }

  const pulCareer = payload.pul?.career;
  const pulBlock = payload.pul
    ? {
        seasonsPlayed: num(pulCareer?.seasonsPlayed),
        gamesPlayed: num(pulCareer?.gamesPlayed),
        goals: num(pulCareer?.goals),
        assists: num(pulCareer?.assists),
        blocks: num(pulCareer?.blocks),
        turnovers: num(pulCareer?.turnovers),
        touches: num(pulCareer?.touches),
        plusMinus: num(pulCareer?.plusMinus),
      }
    : null;

  const wulCareer = payload.wul?.career;
  const wulBlock = payload.wul
    ? {
        seasonsPlayed: num(wulCareer?.seasonsPlayed),
        gamesPlayed: num(wulCareer?.gamesPlayed),
        goals: num(wulCareer?.goals),
        assists: num(wulCareer?.assists),
        blocks: num(wulCareer?.blocks),
        turnovers: num(wulCareer?.turnovers),
        touches: num(wulCareer?.touches),
        plusMinus: num(wulCareer?.plusMinus),
      }
    : null;

  // ── Content refs ───────────────────────────────────────────────────────
  // Rebuilt from the per-league ids the RPC returns. A photo uploaded under ANY
  // of the person's league ids must show regardless of which url reached the
  // profile — so this list has to stay complete. The UFA ref is included even
  // when the attribution gate detached the UFA CAREER: the gate is about whose
  // stats these are, and suppressing the ref would only hide the merged-in
  // content, matching the fallback path's behavior (it pushes ufaSlug too).
  const contentRefs: { kind: PlayerKind; ref: string }[] = [];
  const pushRef = (kind: PlayerKind, ref: string | null | undefined) => {
    if (ref && !contentRefs.some((r) => r.kind === kind && r.ref === ref)) {
      contentRefs.push({ kind, ref });
    }
  };
  pushRef('ufa', payload.ufaSlug);
  pushRef('usau', payload.usauId);
  // Every id in the USAU cluster, not just the anchor's. Without these the
  // gallery's contents depend on WHICH cluster id you navigated in through —
  // content uploaded under a sibling registration id would silently vanish.
  for (const id of payload.usauClusterIds ?? []) pushRef('usau', id);
  pushRef('pul', payload.pulAnchorId);
  pushRef('wul', payload.wulAnchorId);
  pushRef(anchorLeague, anchorId);

  // ── Headshot ───────────────────────────────────────────────────────────
  // The RPC returns the STORED url only. Null means either the player has none
  // or the sync hasn't self-hosted them yet — fall back to the live scrape, the
  // same preference order the multi-query path uses.
  let headshotUrl = payload.headshotUrl ?? null;
  if (!headshotUrl && payload.ufaSlug) {
    headshotUrl = await getPlayerInfo(payload.ufaSlug)
      .then((i) => i?.headshotUrl ?? null)
      .catch(() => null);
  }

  return {
    anchorId,
    anchorLeague,
    displayName,
    pronouns: payload.pronouns ?? null,
    contentRefs,
    headshotUrl,
    years,
    career,
    pul: pulBlock,
    wul: wulBlock,
    championYearsUfa: attachUfa
      ? (payload.championYearsUfa ?? championYearsUfa).slice().sort((a, b) => b - a)
      : [],
    championYearsUsau: (payload.championYearsUsau ?? []).slice().sort((a, b) => b - a),
    mostRecentUsauDivision,
  };
}

/**
 * Call the shared RPC and map it. Returns null on any error, a null payload, or
 * an unmappable shape — the caller falls back to the multi-query assembler.
 */
export async function getProfileViaRpc(
  anchorId: string,
): Promise<UnifiedPlayerProfile | null> {
  try {
    const db = createClient();
    // NOTE: call db.rpc(...) on the client object DIRECTLY (bound) — pulling it
    // into a local `const rpc = db.rpc` detaches `this` and supabase-js then
    // reads `this.rest` → "Cannot read properties of undefined (reading 'rest')".
    const { data, error } = await db.rpc('get_player_profile', {
      p_anchor_id: anchorId,
    });
    if (error || !data) return null;
    return await mapRpcProfile(anchorId, data as RpcProfile);
  } catch {
    return null;
  }
}

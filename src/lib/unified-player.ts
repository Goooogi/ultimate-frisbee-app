// Unified player profile data layer.
//
// Combines UFA + USAU + PUL careers under one identity. Identity match is by
// lowercased display name — the same v1 rule we use elsewhere (see
// memory/project_usau_player_identity.md). Two real humans with the same
// name will merge; acceptable until we build the canonical-identity layer.
//
// The page accepts a UFA slug (e.g. "tdecraene"), a USAU UUID, or a PUL UUID.
// We anchor on whichever the URL gives us, resolve the human's name, then
// fetch the OTHER leagues' data via name match.
//
// UUID DISAMBIGUATION NOTE: Both USAU and PUL use v4 UUIDs as player ids,
// so looksLikeUsauUuid() returns true for PUL ids too. The resolver handles
// this by trying USAU first; if that misses, it tries PUL. See the uuid
// anchor-resolution block in getUnifiedPlayerProfile.

import 'server-only';
import {
  currentSeasonYear,
  getAllPlayerStats,
  getPlayerInfo,
  getPlayerSeasons,
  getPlayerGameLog,
  getUfaChampionsByYear,
} from '@/lib/ufa/client';
import { teamMetaByAbbr, type TeamMeta } from '@/lib/ufa/teams';
import type { UfaPlayerGameRow, UfaPlayerSeasonRow } from '@/lib/ufa/types';
import {
  findUsauPlayerByName,
  getPlayerProfile as getUsauPlayerProfile,
  looksLikeUsauUuid,
  type UsauPlayerSummary,
} from '@/lib/usau/data';
import {
  getPulPlayer,
  getPulPlayerCareerByName,
  findPulPlayerNameByName,
  listPulTeams,
  type PulTeam,
  type PulPlayerCareer,
} from '@/lib/pul/data';
import { namesMatch } from '@/lib/name-match';

// ── Output shape ─────────────────────────────────────────────────────────

export interface UfaSeasonStint {
  league: 'ufa';
  /** UFA franchise slug (the team page lives at /teams/{slug}). */
  teamId: string;
  teamMeta: TeamMeta;
  /** Combined reg-season + playoffs totals for the year. */
  totals: {
    gamesPlayed: number;
    goals: number;
    assists: number;
    blocks: number;
    plusMinus: number;
    completions: number;
    throwsAttempted: number;
    hucksCompleted: number;
    hucksAttempted: number;
  };
  /** Per-game log; populated when game data is available. */
  games: UfaPlayerGameRow[];
  /** Did this team win the UFA championship that year? */
  isChampion: boolean;
}

export interface UsauSeasonStint {
  league: 'usau';
  teamId: string;
  teamName: string;
  /** "Men" | "Women" | "Mixed" | "Club" | "College" — used for the chip
   *  next to the team name. We pass through whatever the team row had. */
  division: string | null;
  jerseyNumber: string | null;
  isChampion: boolean;
  events: UsauPlayerSummary['teamHistory'][number]['events'];
}

/**
 * PUL (Premier Ultimate League) stint — one season with one team.
 * PUL has no per-game API; stats are season totals only.
 *
 * teamName, teamLogoUrl, and teamAccentColor are resolved from the pul_teams
 * table at build time (batched — not fetched per-stint).
 */
export interface PulSeasonStint {
  league: 'pul';
  season: number;
  teamId: string;
  teamName: string;
  teamCity: string;
  teamLogoUrl: string | null;
  teamAccentColor: string | null;
  jerseyNumber: string;
  pronouns: string | null;
  stats: {
    gamesPlayed: number;
    goals: number;
    assists: number;
    blocks: number;
    turnovers: number;
    touches: number;
    oPoints: number;
    dPoints: number;
    plusMinus: number;
  };
}

export type SeasonStint = UfaSeasonStint | UsauSeasonStint | PulSeasonStint;

export interface UnifiedYear {
  year: number;
  stints: SeasonStint[];
}

export interface UnifiedPlayerProfile {
  /** The anchor id the URL used. UFA slug, USAU UUID, or PUL UUID. */
  anchorId: string;
  /** Which side the URL anchored on. */
  anchorLeague: 'ufa' | 'usau' | 'pul';
  displayName: string;
  /** Pronouns resolved from PUL data when available; null otherwise. */
  pronouns: string | null;
  /** Year-by-year, newest first. */
  years: UnifiedYear[];
  /**
   * Combined hero stats — UFA + USAU feed in additively.
   *
   * PUL is kept as a SEPARATE sub-block (see `pul` field below) rather than
   * being added into the UFA/USAU career totals. Rationale: PUL is a
   * women's/open semi-pro league whose seasons overlap USAU Club Nationals;
   * a player may accumulate goals in both simultaneously. Mixing PUL goals
   * into the same counter as USAU goals would double-count effort in
   * overlapping weeks. The UI can render PUL totals from the `pul` block and
   * keep them visually distinct.
   */
  career: {
    /** UFA games played + USAU events-played (kept separate to avoid
     *  conflating "ultimate game" with "tournament event"). */
    ufaGamesPlayed: number;
    usauEventsPlayed: number;
    goals: number;
    assists: number;
    blocks: number;
    plusMinus: number;
    completions: number;
    throwsAttempted: number;
  };
  /**
   * PUL career sub-totals. Null when the player has no PUL history.
   * Reported separately from `career` to avoid double-counting overlapping
   * competitive periods.
   */
  pul: {
    seasonsPlayed: number;
    gamesPlayed: number;
    goals: number;
    assists: number;
    blocks: number;
    turnovers: number;
    touches: number;
    plusMinus: number;
  } | null;
  championYearsUfa: number[];
  championYearsUsau: number[];
}

// ── Builder ──────────────────────────────────────────────────────────────

/**
 * Builds a unified profile for a UFA slug, USAU UUID, or PUL UUID. All three
 * leagues are resolved in parallel where possible; a failure in any
 * cross-league lookup degrades gracefully (that league's stints are omitted).
 *
 * UUID DISAMBIGUATION:
 *   Both USAU and PUL use v4 UUIDs. When the anchor looks like a UUID we try
 *   USAU first (existing behavior, no regression for USAU links). If USAU
 *   returns nothing, we try PUL. This is a sequential fallback, not parallel,
 *   to keep the logic simple and correct without a race condition on the
 *   anchor-league determination.
 *
 * Cost: 1 UFA scrape + 1 UFA season fetch + N UFA game-log fetches (one
 * per year) + 1 USAU profile fetch + 1 PUL career fetch + 1 PUL teams fetch.
 * Each upstream call is cached 1h–24h via the existing library defaults.
 */
export async function getUnifiedPlayerProfile(
  anchorId: string,
): Promise<UnifiedPlayerProfile | null> {
  // ── Anchor resolution ───────────────────────────────────────────────────
  // Determine which league owns this id and pull the display name from it.
  // After this block we have: anchorLeague, anchorName, and the anchor-side
  // data object (sideUsau or sidePulCareer) already fetched.

  let anchorLeague: 'ufa' | 'usau' | 'pul';
  let anchorName: string | null = null;
  let anchorUsau: UsauPlayerSummary | null = null;
  let anchorPulCareer: PulPlayerCareer | null = null;

  if (!looksLikeUsauUuid(anchorId)) {
    // ── UFA slug anchor ────────────────────────────────────────────────
    anchorLeague = 'ufa';
    const info = await getPlayerInfo(anchorId).catch(() => null);
    anchorName = info?.name ?? null;
  } else {
    // ── UUID anchor — try USAU first, then PUL ─────────────────────────
    // Both USAU and PUL use v4 UUIDs. We check USAU first (existing
    // behavior preserves all current /players/{usau-uuid} links).
    const usauProfile = await getUsauPlayerProfile(anchorId).catch(() => null);
    if (usauProfile) {
      anchorLeague = 'usau';
      anchorName = usauProfile.displayName ?? null;
      anchorUsau = usauProfile;
    } else {
      // USAU miss — try PUL.
      const pulPlayer = await getPulPlayer(anchorId).catch(() => null);
      if (pulPlayer) {
        anchorLeague = 'pul';
        anchorName = pulPlayer.playerName;
        // We need the full career (all seasons) for a PUL anchor, not just
        // the one row. Fetch by name so we get every season's stint.
        anchorPulCareer = await getPulPlayerCareerByName(pulPlayer.playerName).catch(() => null);
        anchorName = anchorPulCareer?.playerName ?? pulPlayer.playerName;
      } else {
        // UUID matches neither USAU nor PUL — unresolvable.
        return null;
      }
    }
  }

  if (!anchorName) return null;

  // ── Fetch all three sides in parallel ──────────────────────────────────
  // Each lookup is independent once we have a display name. Failures are
  // caught per-league so one bad network call doesn't kill the whole profile.
  const [sideUfa, sideUsau, sidePulCareer, teamMap] = await Promise.all([
    // UFA side
    (anchorLeague === 'ufa'
      ? buildUfaSide(anchorId)
      : findUfaSlugByName(anchorName).then((slug) =>
          slug ? buildUfaSide(slug) : null,
        )
    ).catch(() => null),

    // USAU side
    (anchorLeague === 'usau'
      ? Promise.resolve(anchorUsau)
      : findUsauPlayerByName(anchorName).then((id) =>
          id ? getUsauPlayerProfile(id) : null,
        )
    ).catch(() => null),

    // PUL side
    (anchorLeague === 'pul'
      ? Promise.resolve(anchorPulCareer)
      : findPulPlayerNameByName(anchorName).then((name) =>
          name ? getPulPlayerCareerByName(name) : null,
        )
    ).catch(() => null),

    // PUL team metadata — fetched once, used for all PUL stints.
    // listPulTeams() returns all 13 teams; we build a Map for O(1) lookup.
    listPulTeams()
      .then((teams) => new Map<string, PulTeam>(teams.map((t) => [t.id, t])))
      .catch(() => new Map<string, PulTeam>()),
  ] as const);

  // ── Merge into a Map<year, stints[]> ───────────────────────────────────

  const yearMap = new Map<number, SeasonStint[]>();

  if (sideUfa) {
    for (const { year, stint } of sideUfa.stints) {
      const list = yearMap.get(year) ?? [];
      list.push(stint);
      yearMap.set(year, list);
    }
  }

  if (sideUsau) {
    for (const stint of sideUsau.teamHistory) {
      const list = yearMap.get(stint.season) ?? [];
      list.push({
        league: 'usau',
        teamId: stint.teamId,
        teamName: stint.teamName,
        division: deriveUsauChip(stint),
        jerseyNumber: stint.jerseyNumber,
        isChampion: stint.isChampion,
        events: stint.events,
      });
      yearMap.set(stint.season, list);
    }
  }

  if (sidePulCareer) {
    for (const pulStint of sidePulCareer.stints) {
      const list = yearMap.get(pulStint.season) ?? [];
      const team = teamMap.get(pulStint.player.teamId);
      list.push({
        league: 'pul',
        season: pulStint.season,
        teamId: pulStint.player.teamId,
        teamName: team?.name ?? pulStint.player.teamId,
        teamCity: team?.city ?? '',
        teamLogoUrl: team?.logoUrl ?? null,
        teamAccentColor: team?.accentColor ?? null,
        jerseyNumber: pulStint.player.jerseyNumber,
        pronouns: pulStint.player.pronouns,
        stats: {
          gamesPlayed: pulStint.player.gamesPlayed,
          goals: pulStint.player.goals,
          assists: pulStint.player.assists,
          blocks: pulStint.player.blocks,
          turnovers: pulStint.player.turnovers,
          touches: pulStint.player.touches,
          oPoints: pulStint.player.oPoints,
          dPoints: pulStint.player.dPoints,
          plusMinus: pulStint.player.plusMinus,
        },
      });
      yearMap.set(pulStint.season, list);
    }
  }

  const years: UnifiedYear[] = Array.from(yearMap.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([year, stints]) => ({ year, stints: sortStintsForYear(stints) }));

  // ── Career aggregates ───────────────────────────────────────────────────
  // UFA + USAU add into the shared `career` block (same as before).
  // PUL is reported separately in the `pul` sub-block to avoid conflating
  // stats from potentially overlapping competitive periods.

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
      // PUL stints intentionally not added to `career` — see `pul` block.
    }
  }

  // PUL career sub-block. Use the pre-aggregated career from the data layer
  // rather than re-summing from the year-map to keep this clean.
  const pulCareerBlock = sidePulCareer
    ? {
        seasonsPlayed: sidePulCareer.career.seasonsPlayed,
        gamesPlayed: sidePulCareer.career.gamesPlayed,
        goals: sidePulCareer.career.goals,
        assists: sidePulCareer.career.assists,
        blocks: sidePulCareer.career.blocks,
        turnovers: sidePulCareer.career.turnovers,
        touches: sidePulCareer.career.touches,
        plusMinus: sidePulCareer.career.plusMinus,
      }
    : null;

  // Pronouns: PUL data is the only league that tracks them. Surface when found.
  const pronouns =
    sidePulCareer?.pronouns ??
    (anchorPulCareer?.pronouns ?? null);

  return {
    anchorId,
    anchorLeague,
    displayName: anchorName,
    pronouns,
    years,
    career,
    pul: pulCareerBlock,
    championYearsUfa: sideUfa?.championYears ?? [],
    championYearsUsau: sideUsau?.championYears ?? [],
  };
}

// ── Reverse lookup: USAU → UFA via name ────────────────────────────────

/**
 * Find a UFA playerID by name using the token-subset match (see
 * src/lib/name-match.ts). Handles "Robert Mitchell McCarthy" (USAU) ↔
 * "Mitchell McCarthy" (UFA) — surname matches exactly, given tokens of
 * the shorter side are a subset of the longer side's.
 *
 * Walks the last 3 seasons' leaderboards. Each season fetch is cached
 * for 1h upstream so the cost is amortized across requests.
 */
async function findUfaSlugByName(name: string): Promise<string | null> {
  const years = [currentSeasonYear(), currentSeasonYear() - 1, currentSeasonYear() - 2];
  for (const year of years) {
    try {
      const all = await getAllPlayerStats({ year, per: 'total' });
      const hit = all.find((p) => namesMatch(name, p.name));
      if (hit) return hit.playerID;
    } catch {
      // try next year
    }
  }
  return null;
}

// ── UFA helpers ──────────────────────────────────────────────────────────

interface UfaSideStint {
  year: number;
  stint: UfaSeasonStint;
}
interface UfaSide {
  stints: UfaSideStint[];
  championYears: number[];
}

async function buildUfaSide(playerID: string): Promise<UfaSide | null> {
  const seasons = await getPlayerSeasons(playerID).catch(() => [] as UfaPlayerSeasonRow[]);
  if (seasons.length === 0) return { stints: [], championYears: [] };

  // Group rows by (year, teamAbbrev). The UFA API emits a separate row
  // for regSeason vs playoffs and (rarely) for a mid-season trade — we
  // combine them all under one stint per team-year.
  const byYearTeam = new Map<string, UfaPlayerSeasonRow[]>();
  for (const r of seasons) {
    const key = `${r.year}|${r.teamAbbrev}`;
    if (!byYearTeam.has(key)) byYearTeam.set(key, []);
    byYearTeam.get(key)!.push(r);
  }

  const years = Array.from(new Set(seasons.map((r) => r.year))).sort((a, b) => b - a);
  const championMap = await getUfaChampionsByYear(years).catch(() => new Map<number, string>());

  // Game logs are per-year, not per-team — we fetch one per year and split
  // among the stints inside that year by team abbreviation.
  const gameLogs = await Promise.all(
    years.map((y) => getPlayerGameLog(playerID, y).catch(() => [] as UfaPlayerGameRow[])),
  );
  const logsByYear = new Map<number, UfaPlayerGameRow[]>();
  years.forEach((y, i) => logsByYear.set(y, gameLogs[i]));

  const stints: UfaSideStint[] = [];
  for (const [key, rows] of byYearTeam.entries()) {
    const [yearStr, teamAbbrev] = key.split('|');
    const year = Number(yearStr);
    const totals = sumUfaRows(rows);
    const tm = teamMetaByAbbr(teamAbbrev);
    if (!tm) continue;
    // getUfaChampionsByYear returns the team's slug (e.g. "empire"),
    // not its abbr ("NY"). Compare on slug.
    const champ = championMap.get(year);
    const isChampion = champ != null && tm.id.toLowerCase() === champ.toLowerCase();
    // Filter the year's game log to games involving this team's abbr —
    // mid-season trades are rare but this keeps us honest.
    const games = (logsByYear.get(year) ?? []).filter((g) => {
      const m = g.gameID.match(/^\d{4}-\d{2}-\d{2}-([A-Z]+)-([A-Z]+)$/);
      if (!m) return true;
      const [, away, home] = m;
      const homeMeta = teamMetaByAbbr(home);
      const awayMeta = teamMetaByAbbr(away);
      const myAbbr = tm.abbr;
      return (g.isHome && homeMeta?.abbr === myAbbr) || (!g.isHome && awayMeta?.abbr === myAbbr);
    });
    stints.push({
      year,
      stint: {
        league: 'ufa',
        teamId: tm.id,
        teamMeta: tm,
        totals,
        games,
        isChampion,
      },
    });
  }

  const championYears = Array.from(
    new Set(stints.filter((s) => s.stint.isChampion).map((s) => s.year)),
  ).sort((a, b) => b - a);

  return { stints, championYears };
}

function sumUfaRows(rows: UfaPlayerSeasonRow[]): UfaSeasonStint['totals'] {
  return rows.reduce(
    (acc, r) => {
      acc.gamesPlayed += r.gamesPlayed;
      acc.goals += r.goals;
      acc.assists += r.assists;
      acc.blocks += r.blocks;
      acc.completions += r.completions;
      acc.throwsAttempted += r.throwsAttempted;
      acc.hucksCompleted += r.hucksCompleted;
      acc.hucksAttempted += r.hucksAttempted;
      acc.plusMinus += r.goals + r.assists + r.blocks - r.throwaways - r.drops - r.stalls;
      return acc;
    },
    {
      gamesPlayed: 0,
      goals: 0,
      assists: 0,
      blocks: 0,
      plusMinus: 0,
      completions: 0,
      throwsAttempted: 0,
      hucksCompleted: 0,
      hucksAttempted: 0,
    },
  );
}

// ── USAU helpers ─────────────────────────────────────────────────────────

/**
 * Pick the small label shown next to the team name (e.g. "USAU · Club"
 * or "USAU · College D-I Women"). We don't have the team's competition
 * level in the player-profile shape — fall back to plain "USAU" when we
 * can't infer.
 *
 * The stint we have only carries gender_division indirectly via the team
 * row; for v1 we use the trophy badge + the team name's natural division
 * cues. Until we plumb competition_level through, the chip stays generic.
 */
function deriveUsauChip(_stint: UsauPlayerSummary['teamHistory'][number]): string | null {
  // Placeholder hook — for now we just show "USAU" via the chip styling.
  return null;
}

// ── Ordering ─────────────────────────────────────────────────────────────

function sortStintsForYear(stints: SeasonStint[]): SeasonStint[] {
  // Ordering priority within a year: UFA (pro, per-game data) → PUL (semi-pro,
  // season totals) → USAU (club/college, tournament-style). Stable within each.
  const leagueOrder: Record<SeasonStint['league'], number> = {
    ufa: 0,
    pul: 1,
    usau: 2,
  };
  return [...stints].sort((a, b) => leagueOrder[a.league] - leagueOrder[b.league]);
}

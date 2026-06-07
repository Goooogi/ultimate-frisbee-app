// Unified player profile data layer.
//
// Combines UFA + USAU careers under one identity. Identity match is by
// lowercased display name — the same v1 rule we use elsewhere (see
// memory/project_usau_player_identity.md). Two real humans with the same
// name will merge; acceptable until we build the canonical-identity layer.
//
// The page accepts either a UFA slug (e.g. "tdecraene") or a USAU UUID;
// we anchor on whichever the URL gives us, resolve the human's name, then
// fetch the OTHER league's data via name match.

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

export type SeasonStint = UfaSeasonStint | UsauSeasonStint;

export interface UnifiedYear {
  year: number;
  stints: SeasonStint[];
}

export interface UnifiedPlayerProfile {
  /** The anchor id the URL used. UFA slug or USAU UUID. */
  anchorId: string;
  /** Which side the URL anchored on. */
  anchorLeague: 'ufa' | 'usau';
  displayName: string;
  /** Year-by-year, newest first. */
  years: UnifiedYear[];
  /** Combined hero stats — UFA career totals when present, otherwise
   *  USAU event totals. Both leagues feed in additively where possible. */
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
  championYearsUfa: number[];
  championYearsUsau: number[];
}

// ── Builder ──────────────────────────────────────────────────────────────

/**
 * Builds a unified profile for either a UFA slug or USAU UUID. Both leagues
 * are queried in parallel; whichever isn't matched returns an empty slice.
 *
 * Cost: 1 UFA scrape + 1 UFA season fetch + N UFA game-log fetches (one
 * per year) + 1 USAU profile fetch. Each cached for 1h–24h via the existing
 * library defaults — same as the previous standalone code paths.
 */
export async function getUnifiedPlayerProfile(
  anchorId: string,
): Promise<UnifiedPlayerProfile | null> {
  const anchorLeague: 'ufa' | 'usau' = looksLikeUsauUuid(anchorId) ? 'usau' : 'ufa';

  // Resolve display name from the anchor side first; we need it to find
  // the OTHER side via name match.
  const [anchorName, sideUsau, sideUfa] = await (async () => {
    if (anchorLeague === 'ufa') {
      const info = await getPlayerInfo(anchorId).catch(() => null);
      const ufa = await buildUfaSide(anchorId).catch(() => null);
      const usauId = info?.name ? await findUsauPlayerByName(info.name).catch(() => null) : null;
      const usau = usauId ? await getUsauPlayerProfile(usauId).catch(() => null) : null;
      return [info?.name ?? null, usau, ufa] as const;
    }
    const usau = await getUsauPlayerProfile(anchorId).catch(() => null);
    // No name → UFA-slug index exists, so for the reverse direction we
    // walk this season's UFA leaderboard and find an EXACT name match.
    // This costs 1-3 page hits (each cached for 1h via the call() helper)
    // — acceptable for a profile-page render. Falls back to no UFA side
    // when there's no match for the year.
    const ufaSlug = usau?.displayName ? await findUfaSlugByName(usau.displayName).catch(() => null) : null;
    const ufa = ufaSlug ? await buildUfaSide(ufaSlug).catch(() => null) : null;
    return [usau?.displayName ?? null, usau, ufa] as const;
  })();

  if (!anchorName) return null;

  // Merge into a Map<year, stints[]>.
  const yearMap = new Map<number, SeasonStint[]>();

  if (sideUfa) {
    for (const stint of sideUfa.stints) {
      const list = yearMap.get(stint.year) ?? [];
      list.push(stint.stint);
      yearMap.set(stint.year, list);
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

  const years: UnifiedYear[] = Array.from(yearMap.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([year, stints]) => ({ year, stints: sortStintsForYear(stints) }));

  // Career aggregates.
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
      } else {
        career.usauEventsPlayed += s.events.length;
        for (const ev of s.events) {
          career.goals += ev.goals ?? 0;
          career.assists += ev.assists ?? 0;
        }
      }
    }
  }

  return {
    anchorId,
    anchorLeague,
    displayName: anchorName,
    years,
    career,
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
  // UFA stints come first (active pro league with games); USAU stints
  // (tournament-style) below. Stable inside each league.
  return [...stints].sort((a, b) => {
    if (a.league === b.league) return 0;
    return a.league === 'ufa' ? -1 : 1;
  });
}

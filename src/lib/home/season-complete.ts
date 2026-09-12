// Home-page "Season complete" cards — the champion/final-standings pages that
// sit in one carousel below the league standings group.
//
// Port of the mobile app's src/lib/home/data.ts season-complete readers
// (getWfdfSeasonCompleteCards / getUfaSeasonCompleteCard /
// getUsauSeasonCompleteCard). PUL/WUL cards are assembled in
// league-standings-sections.tsx from data page.tsx already holds.
//
// WHEN a card shows is decided by src/lib/home/season-phase.ts (a league must
// be `complete`: final decided, ≤ 6 months old, next season not started); the
// readers here only shape WHAT the card shows. UFA/USAU are pure functions
// over the page's existing fetches — no second API/DB round-trip.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseUrl, supabaseAnonKey } from '@/lib/supabase/env';
import type { UfaGame, UfaStanding } from '@/lib/ufa/types';
import { ufaPlayoffGames, type UfaPlayoffGame } from '@/lib/ufa/game-of-the-week';
import { listEvents } from '@/lib/wfdf/data';
import type { UsauMajorWithChampions } from '@/lib/usau/data';
import {
  COMPLETE_WINDOW_DAYS,
  isClubNationalsName,
  isCollegeChampionshipsName,
  isoDay,
} from '@/lib/home/season-phase';

// Public read-only data — plain anon client, matching wfdf/data.ts (no cookie
// binding needed, and it stays reusable across requests).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>;

let _client: AnyClient | null = null;
function supabase(): AnyClient {
  if (_client) return _client;
  _client = createClient(supabaseUrl(), supabaseAnonKey(), { auth: { persistSession: false } });
  return _client;
}

// ─── WFDF — top-3 per division ───────────────────────────────────────────────

export interface WfdfChampionRow {
  division: string;
  teamId: string;
  name: string;
  countryCode: string | null;
  record: string | null;
}

export interface WfdfPlacementRow extends WfdfChampionRow {
  finalStanding: 1 | 2 | 3;
}

export interface WfdfSeasonCompleteCard {
  slug: string;
  name: string;
  year: number;
  startDate: string | null;
  endDate: string | null;
  divisionCount: number;
  /** Division winners only (finalStanding === 1), in division order. */
  champions: WfdfPlacementRow[];
  /** Top-3 per division, division order then standing — the card renders
   *  these when the event has few enough divisions to fit. */
  placements: WfdfPlacementRow[];
}

/** One card per WFDF event that ENDED within the last COMPLETE_WINDOW_DAYS
 *  (newest first, max 4). Per-event windowing — not "the most recent year" —
 *  so each Worlds expires on its own six-month clock and a late-year event
 *  (WBUC/PAUC in Nov–Dec) isn't hidden by the next year's first event. */
export async function getWfdfSeasonCompleteCards(now: Date = new Date()): Promise<WfdfSeasonCompleteCard[]> {
  const events = await listEvents();
  const today = isoDay(now);
  const cutoff = isoDay(new Date(now.getTime() - COMPLETE_WINDOW_DAYS * 86400_000));
  const completed = events
    .filter((e) => {
      const end = e.endDate ?? e.startDate ?? '';
      return end !== '' && end < today && end >= cutoff;
    })
    .sort((a, b) => (b.endDate ?? '').localeCompare(a.endDate ?? ''))
    .slice(0, 4);
  if (completed.length === 0) return [];

  const db = supabase();
  const cards = await Promise.all(
    completed.map(async (ev): Promise<WfdfSeasonCompleteCard | null> => {
      const { data: teams } = await db
        .from('wfdf_teams')
        .select('id, name, country_code, wins, losses, final_standing, division:division_id(name, ordering)')
        .eq('event_id', ev.id)
        .lte('final_standing', 3)
        .order('division_id')
        .order('final_standing');
      if (!teams || teams.length === 0) return null;

      const placements = (teams as unknown as Record<string, unknown>[])
        .map((t) => {
          const div = t.division as { name: string; ordering: string | null } | null;
          return {
            ordering: div?.ordering ?? div?.name ?? 'Open',
            row: {
              division: div?.name ?? 'Open',
              teamId: t.id as string,
              name: t.name as string,
              countryCode: (t.country_code as string) ?? null,
              record:
                t.wins != null && t.losses != null
                  ? `${t.wins as number}-${t.losses as number}`
                  : null,
              finalStanding: Number(t.final_standing) as 1 | 2 | 3,
            } satisfies WfdfPlacementRow,
          };
        })
        .sort(
          (a, b) =>
            a.ordering.localeCompare(b.ordering) ||
            a.row.division.localeCompare(b.row.division) ||
            a.row.finalStanding - b.row.finalStanding,
        )
        .map((x) => x.row);

      const champions = placements.filter((p) => p.finalStanding === 1);
      if (champions.length === 0) return null;

      return {
        slug: ev.slug,
        name: ev.name,
        year: ev.year,
        startDate: ev.startDate,
        endDate: ev.endDate,
        divisionCount: new Set(placements.map((p) => p.division)).size,
        champions,
        placements,
      };
    }),
  );
  return cards.filter((c): c is WfdfSeasonCompleteCard => c !== null);
}

// ─── UFA — the full playoff bracket ──────────────────────────────────────────
// Pure: `games` is the season pool page.tsx already fetched (current year, or
// the previous year during the Jan–Aug fallback). Null until the title game
// is decided — ufaPlayoffGames requires a structural bracket, so a
// regular-season final can never be mistaken for a championship.

export interface UfaStandingsRow {
  teamID: string;
  teamName: string;
  wins: number;
  losses: number;
  ties: number;
  pointDiff: number;
  divisionName: string | null;
}

export interface UfaSeasonCompleteCard {
  year: number;
  championTeamID: string;
  runnerUpTeamID: string;
  /** Newest first: championship → semifinals → divisional round. ≤ 7 rows. */
  playoffGames: UfaPlayoffGame[];
  /** The playoff teams that did NOT reach championship weekend (8 in 2026),
   *  ranked wins → point diff (the same tiebreak as the "Top of the league"
   *  strip). The final + semis rows above already show the top four, and the
   *  whole league (24 rows) made every other card stretch to match (Hunter,
   *  2026-09-11). Empty once the standings feed has rolled to the next
   *  season — the card then shows the bracket only. */
  standingsRows: UfaStandingsRow[];
  /** Teams in the final + semis rows — the rank numbering below starts after
   *  them. */
  championshipWeekendTeams: number;
  recordFor: (teamID: string) => string | null;
}

export function getUfaSeasonCompleteCard(
  games: UfaGame[],
  standings: UfaStanding[],
): UfaSeasonCompleteCard | null {
  const playoffGames = ufaPlayoffGames(games);
  if (playoffGames.length === 0) return null;

  const finalGame = playoffGames[0].game;
  const year = finalGame.startTimestamp
    ? new Date(finalGame.startTimestamp).getUTCFullYear()
    : new Date().getFullYear();
  const championWon = finalGame.awayScore > finalGame.homeScore;

  const recordFor = (teamID: string): string | null => {
    const s = standings.find((row) => row.teamID === teamID && row.year === year);
    if (!s) return null;
    return s.ties > 0 ? `${s.wins}-${s.losses}-${s.ties}` : `${s.wins}-${s.losses}`;
  };

  const playoffTeamIDs = new Set(playoffGames.flatMap((p) => [p.game.awayTeamID, p.game.homeTeamID]));
  const weekendTeamIDs = new Set(
    playoffGames
      .filter((p) => p.round !== 'divisional')
      .flatMap((p) => [p.game.awayTeamID, p.game.homeTeamID]),
  );
  const standingsRows: UfaStandingsRow[] = standings
    .filter((s) => s.year === year && playoffTeamIDs.has(s.teamID) && !weekendTeamIDs.has(s.teamID))
    .map((s) => ({
      teamID: s.teamID,
      teamName: s.teamName,
      wins: s.wins,
      losses: s.losses,
      ties: s.ties,
      pointDiff: s.pointDiff,
      divisionName: s.divisionName ?? null,
    }))
    .sort((a, b) => b.wins - a.wins || b.pointDiff - a.pointDiff);

  return {
    year,
    championTeamID: championWon ? finalGame.awayTeamID : finalGame.homeTeamID,
    runnerUpTeamID: championWon ? finalGame.homeTeamID : finalGame.awayTeamID,
    playoffGames,
    standingsRows,
    championshipWeekendTeams: weekendTeamIDs.size,
    recordFor,
  };
}

// ─── USAU — champion (+ finalist) per division ───────────────────────────────

export interface UsauChampionEntry {
  division: string;
  teamName: string;
  teamId: string;
  runnerUpName?: string;
  runnerUpId?: string;
  /** Losers of the championship-bracket semifinals (tied 3rd; USAU plays no
   *  3rd-place game) — the card's "Semis" row. */
  semifinalists?: Array<{ name: string; id: string }>;
}

export interface UsauSeasonCompleteCard {
  slug: string;
  name: string;
  season: number;
  champions: UsauChampionEntry[];
}

function seasonOf(m: UsauMajorWithChampions): number {
  return m.startDate ? new Date(`${m.startDate}T12:00:00Z`).getUTCFullYear() : new Date().getFullYear();
}

/** Club Nationals — picked out of the page's shared recentUsauMajorsWithChampions
 *  list (newest first, CLUB), scoped by name so the US Open / Pro Champs under
 *  the same 'triple-crown' flight bucket never stand in for it. */
export function getUsauSeasonCompleteCard(majors: UsauMajorWithChampions[]): UsauSeasonCompleteCard | null {
  const nationals = majors.find((m) => isClubNationalsName(m.name));
  if (!nationals || nationals.champions.length === 0) return null;
  return {
    slug: nationals.slug,
    name: nationals.name,
    season: seasonOf(nationals),
    champions: nationals.champions.map((c) => ({
      division: c.division,
      teamName: c.teamName,
      teamId: c.teamId,
      runnerUpName: c.runnerUpName,
      runnerUpId: c.runnerUpId,
      semifinalists: c.semifinalists,
    })),
  };
}

/** College Championships — D-I and D-III are separate usau_events rows in the
 *  same week, merged into ONE card ("D-I Men", "D-I Women", "D-III Men",
 *  "D-III Women"). `champs` = recentUsauMajorsWithChampions with the college
 *  levels + isCollegeChampionshipsName filter, newest first. Only the newest
 *  season's events are used; the card links to the D-I event. */
export function getUsauCollegeSeasonCompleteCard(
  champs: UsauMajorWithChampions[],
): UsauSeasonCompleteCard | null {
  const college = champs.filter((m) => isCollegeChampionshipsName(m.name) && m.champions.length > 0);
  if (college.length === 0) return null;
  const season = Math.max(...college.map(seasonOf));
  const thisSeason = college.filter((m) => seasonOf(m) === season);

  const levelOf = (name: string): string => (/d-?iii\b/i.test(name) ? 'D-III' : 'D-I');
  const LEVEL_ORDER: Record<string, number> = { 'D-I': 0, 'D-III': 1 };
  const DIV_ORDER: Record<string, number> = { Men: 0, Women: 1, Mixed: 2 };

  const champions: UsauChampionEntry[] = thisSeason
    .flatMap((m) =>
      m.champions.map((c) => ({
        level: levelOf(m.name),
        division: `${levelOf(m.name)} ${c.division}`,
        teamName: c.teamName,
        teamId: c.teamId,
        runnerUpName: c.runnerUpName,
        runnerUpId: c.runnerUpId,
        semifinalists: c.semifinalists,
        gender: c.division,
      })),
    )
    .sort(
      (a, b) =>
        (LEVEL_ORDER[a.level] ?? 9) - (LEVEL_ORDER[b.level] ?? 9) ||
        (DIV_ORDER[a.gender] ?? 9) - (DIV_ORDER[b.gender] ?? 9),
    )
    .map(({ division, teamName, teamId, runnerUpName, runnerUpId, semifinalists }) => ({
      division,
      teamName,
      teamId,
      runnerUpName,
      runnerUpId,
      semifinalists,
    }));

  const anchor = thisSeason.find((m) => levelOf(m.name) === 'D-I') ?? thisSeason[0];
  return {
    slug: anchor.slug,
    name: `${season} College Championships`,
    season,
    champions,
  };
}

// Home-page "Season complete" cards — the champion/final-standings pages that
// sit in one carousel below the league standings group.
//
// Port of the mobile app's src/lib/home/data.ts season-complete readers
// (getWfdfSeasonCompleteCards / getUfaSeasonCompleteCard /
// getUsauSeasonCompleteCard), which the web home page was missing entirely.
// PUL/WUL already have their own sections (league-standings-sections.tsx);
// these add UFA, USAU and WFDF so every league's finished season is
// represented in the same place, matching mobile's ordering.
//
// Each reader returns null / [] when that league's season isn't decided yet,
// so the carousel simply drops the page in the offseason.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseUrl, supabaseAnonKey } from '@/lib/supabase/env';
import {
  getAllGamesByYears,
  getStandings,
  currentSeasonYear,
  findChampionshipGame,
} from '@/lib/ufa/client';
import { listEvents } from '@/lib/wfdf/data';
import { recentUsauMajorsWithChampions } from '@/lib/usau/data';

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

// ─── WFDF — champion per division ────────────────────────────────────────────

export interface WfdfChampionRow {
  division: string;
  teamId: string;
  name: string;
  countryCode: string | null;
  record: string | null;
}

export interface WfdfSeasonCompleteCard {
  slug: string;
  name: string;
  year: number;
  champions: WfdfChampionRow[];
}

export async function getWfdfSeasonCompleteCards(): Promise<WfdfSeasonCompleteCard[]> {
  const events = await listEvents();
  const today = new Date().toISOString().slice(0, 10);
  const completed = events.filter((e) => (e.endDate ?? e.startDate ?? '') < today);
  if (completed.length === 0) return [];

  // Most recent completed YEAR, newest events first within it.
  const year = Math.max(...completed.map((e) => e.year));
  const yearEvents = completed
    .filter((e) => e.year === year)
    .sort((a, b) => (b.endDate ?? '').localeCompare(a.endDate ?? ''))
    .slice(0, 4);

  const db = supabase();
  const cards = await Promise.all(
    yearEvents.map(async (ev): Promise<WfdfSeasonCompleteCard | null> => {
      const { data: teams } = await db
        .from('wfdf_teams')
        .select('id, name, country_code, wins, losses, division:division_id(name, ordering)')
        .eq('event_id', ev.id)
        .eq('final_standing', 1)
        .order('division_id');
      if (!teams || teams.length === 0) return null;

      const rows = (teams as unknown as Record<string, unknown>[])
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
            } satisfies WfdfChampionRow,
          };
        })
        .sort((a, b) => a.ordering.localeCompare(b.ordering))
        .map((x) => x.row);

      return { slug: ev.slug, name: ev.name, year: ev.year, champions: rows };
    }),
  );
  return cards.filter((c): c is WfdfSeasonCompleteCard => c !== null);
}

// ─── UFA — championship-game result ──────────────────────────────────────────
// Appears once the most recent season's championship game is decided — a
// structural rule, not an "every game final" gate (a still-open lower bracket
// game must never hide a decided title game).

export interface UfaSeasonCompleteCard {
  year: number;
  championTeamID: string;
  runnerUpTeamID: string;
  championScore: number;
  runnerUpScore: number;
  championRecord: string | null;
  runnerUpRecord: string | null;
}

export async function getUfaSeasonCompleteCard(): Promise<UfaSeasonCompleteCard | null> {
  const year = currentSeasonYear();
  const games = await getAllGamesByYears([year]);
  if (games.length === 0) return null;

  const finalGame = findChampionshipGame(games);
  if (!finalGame) return null;

  const standings = await getStandings();
  const recordFor = (teamID: string): string | null => {
    const s = standings.find((row) => row.teamID === teamID && row.year === year);
    if (!s) return null;
    return s.ties > 0 ? `${s.wins}-${s.losses}-${s.ties}` : `${s.wins}-${s.losses}`;
  };

  const championWon = finalGame.awayScore > finalGame.homeScore;
  const championTeamID = championWon ? finalGame.awayTeamID : finalGame.homeTeamID;
  const runnerUpTeamID = championWon ? finalGame.homeTeamID : finalGame.awayTeamID;

  return {
    year,
    championTeamID,
    runnerUpTeamID,
    championScore: championWon ? finalGame.awayScore : finalGame.homeScore,
    runnerUpScore: championWon ? finalGame.homeScore : finalGame.awayScore,
    championRecord: recordFor(championTeamID),
    runnerUpRecord: recordFor(runnerUpTeamID),
  };
}

// ─── USAU — Club Nationals champion per division ─────────────────────────────
// Distinct from recentUsauMajorsWithChampions' general TCT/major sweep (which
// also catches the US Open / Pro Championships under the same 'triple-crown'
// flight bucket). Reuses that function's champion derivation, scoped by name
// to Nationals specifically.

export interface UsauSeasonCompleteCard {
  slug: string;
  name: string;
  season: number;
  champions: Array<{ division: 'Men' | 'Women' | 'Mixed'; teamName: string; teamId: string }>;
}

function isClubNationalsName(name: string): boolean {
  const n = name.toLowerCase();
  if (/u\.?\s?s\.?\s?open|pro[- ]?championship/.test(n)) return false;
  if (/wucc|wmucc|wjuc|worlds?\b/.test(n)) return false;
  return /national championship/.test(n) || /club nationals/.test(n) || /club championship/.test(n);
}

export async function getUsauSeasonCompleteCard(): Promise<UsauSeasonCompleteCard | null> {
  const majors = await recentUsauMajorsWithChampions(20);
  const nationals = majors.find((m) => isClubNationalsName(m.name));
  if (!nationals || nationals.champions.length === 0) return null;

  return {
    slug: nationals.slug,
    name: nationals.name,
    season: nationals.startDate
      ? new Date(nationals.startDate).getFullYear()
      : new Date().getFullYear(),
    champions: nationals.champions.map((c) => ({
      division: c.division,
      teamName: c.teamName,
      teamId: c.teamId,
    })),
  };
}

// /players — league-aware player directory.
//
//   - ?league=ufa  → top UFA players by goals/assists (current season default).
//   - ?league=usau → most-active USAU players (sorted by most recent stint).
//
// Server Component. Reads ?league= and ?year= from searchParams, fetches
// the relevant dataset, and hands it to the client PlayersSearchList for
// the hero search bar + live filtering.

import type { Metadata } from 'next';
import {
  getAllPlayerStats,
  currentSeasonYear,
  getUfaChampionsByYear,
} from '@/lib/ufa/client';
import type { UfaPlayerStat } from '@/lib/ufa/types';
import { PageShell } from '@/components/page-shell';
import { YearSelector } from '@/components/year-selector';
import { listUsauPlayers, type UsauPlayerListRow } from '@/lib/usau/data';
import { parseDivisionParam, parseLeagueParam } from '@/lib/league';
import { PlayersSearchList } from '@/components/players/players-search-list';
import { UsauDivisionSelect } from '@/components/usau/usau-division-select';
import { SortControl } from '@/components/sort-control';

// Fields the UFA API actually sorts on (verified live). Any ?sort= value not
// in this set falls back to 'scores' so arbitrary strings never reach the API.
const UFA_SORT_FIELDS = new Set([
  'goals',
  'assists',
  'scores',
  'hockeyAssists',
  'completions',
  'throwaways',
  'drops',
  'blocks',
  'plusMinus',
  'gamesPlayed',
]);

const UFA_SORT_OPTIONS = [
  { value: 'scores', label: 'Scores' },
  { value: 'goals', label: 'Goals' },
  { value: 'assists', label: 'Assists' },
  { value: 'hockeyAssists', label: 'Hockey Assists' },
  { value: 'completions', label: 'Completions' },
  { value: 'throwaways', label: 'Throwaways' },
  { value: 'drops', label: 'Drops' },
  { value: 'blocks', label: 'Blocks' },
  { value: 'plusMinus', label: '+/−' },
  { value: 'gamesPlayed', label: 'Games' },
];

export const revalidate = 600;

export const metadata: Metadata = {
  title: 'Players · The Layout',
};

interface Props {
  searchParams: { year?: string; league?: string; div?: string; sort?: string; dir?: string };
}

export default async function PlayersPage({ searchParams }: Props) {
  const league = parseLeagueParam(searchParams.league);

  if (league === 'usau') {
    const division = parseDivisionParam(searchParams.div);
    const players = await listUsauPlayers({ limit: 200, genderDivision: division }).catch(
      () => [] as UsauPlayerListRow[],
    );
    return (
      <PageShell
        title="Players"
        eyebrow={`USAU · Club · ${division}`}
        controls={<UsauDivisionSelect />}
      >
        <PlayersSearchList
          mode={{ kind: 'usau', players, division }}
          scopeLabel={`${division}'s · all seasons`}
        />
      </PageShell>
    );
  }

  // UFA: pull leaders for the selected year. Sort via API (server-side).
  const currentYear = currentSeasonYear();
  const year = parseInt(searchParams.year ?? String(currentYear), 10) || currentYear;

  // Validate sort/dir against the allowlist — never forward arbitrary user input.
  const rawSort = searchParams.sort ?? '';
  const sort = UFA_SORT_FIELDS.has(rawSort) ? rawSort : 'scores';
  const rawDir = searchParams.dir ?? '';
  const dir: 'asc' | 'desc' = rawDir === 'asc' ? 'asc' : 'desc';

  const [stats, champions] = await Promise.all([
    getAllPlayerStats({ year, per: 'total', sort, dir }).catch(() => [] as UfaPlayerStat[]),
    getUfaChampionsByYear([year]).catch(() => new Map<number, string>()),
  ]);
  // API returns rows already sorted; just cap at 200.
  const ranked = stats.slice(0, 200);
  // Champion of the year the list is showing. Single-season list scopes
  // the trophy chip to "this year's reigning champ" rather than career
  // history (full career is on the player profile).
  const championTeamIds = champions.get(year) ? [champions.get(year)!] : [];

  return (
    <PageShell
      title="Players"
      eyebrow={`UFA · ${year}`}
      controls={
        <>
          <YearSelector currentYear={year} />
          <SortControl
            options={UFA_SORT_OPTIONS}
            currentSort={sort}
            currentDir={dir}
          />
        </>
      }
    >
      <PlayersSearchList
        mode={{ kind: 'ufa', stats: ranked, championTeamIds, year }}
        scopeLabel={`${year} UFA leaders`}
      />
    </PageShell>
  );
}

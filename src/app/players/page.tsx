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

export const revalidate = 600;

export const metadata: Metadata = {
  title: 'Players · The Layout',
};

interface Props {
  searchParams: { year?: string; league?: string; div?: string };
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

  // UFA: pull leaders for the selected year. Sort by goals + assists (scores).
  const currentYear = currentSeasonYear();
  const year = parseInt(searchParams.year ?? String(currentYear), 10) || currentYear;
  const [stats, champions] = await Promise.all([
    getAllPlayerStats({ year, per: 'total' }).catch(() => [] as UfaPlayerStat[]),
    getUfaChampionsByYear([year]).catch(() => new Map<number, string>()),
  ]);
  const ranked = [...stats]
    .sort((a, b) => (b.scores ?? 0) - (a.scores ?? 0))
    .slice(0, 200);
  // Champion of the year the list is showing. Single-season list scopes
  // the trophy chip to "this year's reigning champ" rather than career
  // history (full career is on the player profile).
  const championTeamIds = champions.get(year) ? [champions.get(year)!] : [];

  return (
    <PageShell
      title="Players"
      eyebrow={`UFA · ${year}`}
      controls={<YearSelector currentYear={year} />}
    >
      <PlayersSearchList
        mode={{ kind: 'ufa', stats: ranked, championTeamIds }}
        scopeLabel={`${year} UFA leaders`}
      />
    </PageShell>
  );
}

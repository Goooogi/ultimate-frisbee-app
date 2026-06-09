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
import Link from 'next/link';
import { Suspense } from 'react';
import { PulTeamLogo } from '@/components/pul-team-logo';
import { PulSeasonSelect } from '@/components/pul-season-select';
import {
  listPulPlayers,
  listPulTeams,
  listPulSeasons,
  PUL_CURRENT_SEASON,
  type PulPlayer,
  type PulTeam,
  type PulSortField,
} from '@/lib/pul/data';

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

// PUL-specific sort allowlist
const PUL_SORT_FIELDS = new Set<PulSortField>([
  'goals', 'assists', 'blocks', 'plus_minus', 'o_points', 'd_points', 'touches', 'games_played',
]);

const PUL_SORT_OPTIONS = [
  { value: 'goals',       label: 'Goals'   },
  { value: 'assists',     label: 'Assists'  },
  { value: 'blocks',      label: 'Blocks'   },
  { value: 'plus_minus',  label: '+/−'      },
  { value: 'touches',     label: 'Touches'  },
  { value: 'o_points',    label: 'O-Pts'   },
  { value: 'd_points',    label: 'D-Pts'   },
  { value: 'games_played', label: 'Games'  },
];

interface Props {
  searchParams: { year?: string; league?: string; div?: string; sort?: string; dir?: string; season?: string };
}

export default async function PlayersPage({ searchParams }: Props) {
  const league = parseLeagueParam(searchParams.league);

  // PUL branch: season-filtered, sortable leaderboard. Each row links to
  // the unified player profile at /players/{uuid}.
  if (league === 'pul') {
    const rawSort = searchParams.sort ?? '';
    const sortBy: PulSortField = PUL_SORT_FIELDS.has(rawSort as PulSortField)
      ? (rawSort as PulSortField)
      : 'goals';
    const rawDir = searchParams.dir ?? '';
    const dir: 'asc' | 'desc' = rawDir === 'asc' ? 'asc' : 'desc';

    const rawSeason = parseInt(searchParams.season ?? String(PUL_CURRENT_SEASON), 10);
    const season = isNaN(rawSeason) ? PUL_CURRENT_SEASON : rawSeason;

    const [players, teams, seasons] = await Promise.all([
      listPulPlayers({ season, sortBy, limit: 500 }).catch((): PulPlayer[] => []),
      listPulTeams().catch((): PulTeam[] => []),
      listPulSeasons().catch((): number[] => [PUL_CURRENT_SEASON]),
    ]);

    // Client-side asc re-sort (DB always returns desc).
    const ranked = dir === 'asc' ? [...players].reverse() : players;
    const teamMap = new Map<string, PulTeam>(teams.map((t) => [t.id, t]));

    return (
      <PageShell
        title="Players"
        eyebrow={`PUL · Premier Ultimate League · ${season}`}
        controls={
          <div className="flex flex-wrap items-center gap-2">
            {/* Season switcher — client component, must be in Suspense */}
            <Suspense fallback={null}>
              <PulSeasonSelect seasons={seasons} currentSeason={season} />
            </Suspense>
            {/* Sort control */}
            <Suspense fallback={null}>
              <SortControl
                options={PUL_SORT_OPTIONS}
                currentSort={sortBy}
                currentDir={dir}
              />
            </Suspense>
          </div>
        }
      >
        {ranked.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center bg-surface border border-border">
            <div className="text-[14px] font-semibold uppercase tracking-[0.18em] text-muted mb-2 font-tight">
              No players yet
            </div>
            <div className="text-[13px] text-faint max-w-sm">
              PUL player stats will appear here as the {season} season progresses.
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-5 px-5 md:mx-0 md:px-0">
            <table className="w-full min-w-[700px] border-collapse">
              <thead>
                <tr>
                  {[
                    { label: '#',       title: 'Rank',                     left: true  },
                    { label: 'Player',  title: 'Player name',              left: true  },
                    { label: 'Team',    title: 'Team',                     left: true  },
                    { label: 'G',       title: 'Goals',                    left: false },
                    { label: 'A',       title: 'Assists',                  left: false },
                    { label: 'Blk',     title: 'Blocks',                   left: false },
                    { label: 'TO',      title: 'Turnovers',                left: false },
                    { label: 'Touch',   title: 'Touches',                  left: false },
                    { label: 'O-Pts',   title: 'Offensive Points Played',  left: false },
                    { label: 'D-Pts',   title: 'Defensive Points Played',  left: false },
                    { label: '+/−',     title: 'Plus / Minus',             left: false },
                  ].map((h) => (
                    <th
                      key={h.label}
                      scope="col"
                      title={h.title}
                      className={[
                        'px-3 py-2 text-[10px] font-bold tracking-[0.14em] uppercase font-tight text-muted',
                        'border-b border-border whitespace-nowrap',
                        h.left ? 'text-left' : 'text-right',
                      ].join(' ')}
                    >
                      {h.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ranked.map((player, i) => {
                  const team = teamMap.get(player.teamId);
                  return (
                    <tr key={player.id} className="hover:bg-surface-hi transition-colors duration-100">
                      <td className="px-3 py-2.5 text-[13px] border-b border-hairline text-left text-faint tabular font-tight w-10">
                        {i + 1}
                      </td>
                      <td className="px-3 py-2.5 text-[13px] border-b border-hairline text-left">
                        <Link
                          href={`/players/${player.id}`}
                          className="font-medium font-tight text-ink hover:text-accent transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
                        >
                          {player.playerName}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 border-b border-hairline text-left">
                        {team ? (
                          <Link
                            href={`/pul/teams/${team.id}`}
                            className="inline-flex items-center gap-2 no-underline text-[12px] font-medium font-tight text-muted hover:text-ink transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
                          >
                            <PulTeamLogo team={team} size={22} />
                            <span className="truncate max-w-[120px]">{team.mascot}</span>
                          </Link>
                        ) : (
                          <span className="text-[12px] text-faint font-tight">—</span>
                        )}
                      </td>
                      {[player.goals, player.assists, player.blocks, player.turnovers, player.touches, player.oPoints, player.dPoints].map((val, ci) => (
                        <td key={ci} className="px-3 py-2.5 text-[13px] border-b border-hairline text-right tabular text-muted font-tight">
                          {val}
                        </td>
                      ))}
                      <td className="px-3 py-2.5 text-[13px] border-b border-hairline text-right tabular text-muted font-tight">
                        {player.plusMinus > 0 ? `+${player.plusMinus}` : player.plusMinus}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </PageShell>
    );
  }

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

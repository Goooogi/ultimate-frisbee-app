// /wul/players — WUL leaderboard, season-filtered and sortable.
// Mirrors the PUL branch of src/app/players/page.tsx, self-contained under
// the /wul prefix rather than routing through the shared ?league= param
// (WUL is not yet a LeagueId in the shared routing layer). Each player row
// links to /players/[id] (the unified cross-league profile).

import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { PageShell } from '@/components/page-shell';
import { WulTeamLogo } from '@/components/wul-team-logo';
import { SortControl } from '@/components/sort-control';
import {
  listWulPlayers,
  listWulTeams,
  listWulSeasons,
  WUL_CURRENT_SEASON,
  type WulPlayer,
  type WulTeam,
  type WulSortField,
} from '@/lib/wul/data';

export const revalidate = 600;

export const metadata: Metadata = {
  title: 'WUL Players · The Layout',
  description: `${WUL_CURRENT_SEASON} Western Ultimate League player leaderboard.`,
};

const WUL_SORT_FIELDS = new Set<WulSortField>([
  'goals',
  'assists',
  'blocks',
  'plus_minus',
  'o_points',
  'd_points',
  'touches',
  'games_played',
  'hucks_completed',
  'yards_total',
]);

const WUL_SORT_OPTIONS = [
  { value: 'goals',           label: 'Goals'   },
  { value: 'assists',         label: 'Assists'  },
  { value: 'blocks',          label: 'Blocks'   },
  { value: 'plus_minus',      label: '+/−'      },
  { value: 'touches',         label: 'Touches'  },
  { value: 'o_points',        label: 'O-Pts'   },
  { value: 'd_points',        label: 'D-Pts'   },
  { value: 'games_played',    label: 'Games'   },
  { value: 'hucks_completed', label: 'Hucks'   },
  { value: 'yards_total',     label: 'Yards'   },
];

interface Props {
  searchParams: { sort?: string; dir?: string; season?: string };
}

export default async function WulPlayersPage({ searchParams }: Props) {
  const rawSort = searchParams.sort ?? '';
  const sortBy: WulSortField = WUL_SORT_FIELDS.has(rawSort as WulSortField)
    ? (rawSort as WulSortField)
    : 'goals';
  const rawDir = searchParams.dir ?? '';
  const dir: 'asc' | 'desc' = rawDir === 'asc' ? 'asc' : 'desc';

  const rawSeason = parseInt(searchParams.season ?? String(WUL_CURRENT_SEASON), 10);
  const season = isNaN(rawSeason) ? WUL_CURRENT_SEASON : rawSeason;

  const [players, teams] = await Promise.all([
    listWulPlayers({ season, sortBy, limit: 500 }).catch((): WulPlayer[] => []),
    listWulTeams().catch((): WulTeam[] => []),
  ]);

  // Client-side asc re-sort (DB always returns desc).
  const ranked = dir === 'asc' ? [...players].reverse() : players;
  const teamMap = new Map<string, WulTeam>(teams.map((t) => [t.id, t]));

  return (
    <PageShell
      title="Players"
      eyebrow={`WUL · Western Ultimate League · ${season}`}
      topNavSlot={<span />}
      controls={
        <div className="flex flex-wrap items-center gap-2">
          <Suspense fallback={null}>
            <SortControl
              options={WUL_SORT_OPTIONS}
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
            WUL player stats will appear here as the {season} season progresses.
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto -mx-5 px-5 md:mx-0 md:px-0">
          <table className="w-full min-w-[700px] border-collapse table-fixed">
            <thead>
              <tr>
                {[
                  { label: '#',      title: 'Rank',                     left: true,  w: 'w-10' },
                  { label: 'Player', title: 'Player name',              left: true,  w: 'w-[140px] sm:w-[180px]' },
                  { label: 'Team',   title: 'Team',                     left: true,  w: 'w-[120px]' },
                  { label: 'G',      title: 'Goals',                    left: false, w: '' },
                  { label: 'A',      title: 'Assists',                  left: false, w: '' },
                  { label: 'Blk',    title: 'Blocks',                   left: false, w: '' },
                  { label: 'TO',     title: 'Turnovers',                left: false, w: '' },
                  { label: 'Touch',  title: 'Touches',                  left: false, w: '' },
                  { label: 'O-Pts',  title: 'Offensive Points Played',  left: false, w: '' },
                  { label: 'D-Pts',  title: 'Defensive Points Played',  left: false, w: '' },
                  { label: '+/−',    title: 'Plus / Minus',             left: false, w: '' },
                ].map((h) => (
                  <th
                    key={h.label}
                    scope="col"
                    title={h.title}
                    className={[
                      'px-3 py-2 text-[10px] font-bold tracking-[0.14em] uppercase font-tight text-muted',
                      'border-b border-border whitespace-nowrap',
                      h.left ? 'text-left' : 'text-right',
                      h.w,
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
                    <td className="px-3 py-2.5 text-[13px] border-b border-hairline text-left w-[140px] sm:w-[180px]">
                      <Link
                        href={`/players/${player.id}`}
                        className="block font-medium font-tight text-ink hover:text-accent transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded whitespace-nowrap overflow-x-auto no-scrollbar"
                      >
                        {player.playerName}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 border-b border-hairline text-left w-[120px]">
                      {team ? (
                        <Link
                          href={`/wul/teams/${team.id}`}
                          className="flex items-center gap-2 no-underline text-[12px] font-medium font-tight text-muted hover:text-ink transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
                        >
                          <span className="flex-shrink-0 inline-flex">
                            <WulTeamLogo team={team} size={22} />
                          </span>
                          <span className="truncate">{team.mascot}</span>
                        </Link>
                      ) : (
                        <span className="text-[12px] text-faint font-tight">—</span>
                      )}
                    </td>
                    {[
                      player.goals,
                      player.assists,
                      player.blocks,
                      player.turnovers,
                      player.touches,
                      player.oPoints,
                      player.dPoints,
                    ].map((val, ci) => (
                      <td
                        key={ci}
                        className="px-3 py-2.5 text-[13px] border-b border-hairline text-right tabular text-muted font-tight"
                      >
                        {val}
                      </td>
                    ))}
                    <td className="px-3 py-2.5 text-[13px] border-b border-hairline text-right tabular text-muted font-tight">
                      {formatPlusMinus(player.plusMinus)}
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

function formatPlusMinus(val: number): string {
  const abs = Number.isInteger(val) ? String(Math.abs(val)) : Math.abs(val).toFixed(1);
  if (val > 0) return `+${abs}`;
  if (val < 0) return `-${abs}`;
  return '0';
}

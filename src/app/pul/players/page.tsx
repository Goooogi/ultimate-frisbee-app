// /pul/players — PUL league-wide player leaderboard.
// Sortable by goals / assists / blocks / plus-minus / o-points / d-points.
// Server component — sort is driven by ?sort= / ?dir= query params, echoing the
// UFA /players pattern. SortControl is a client component that pushes URL updates.

import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { PageShell } from '@/components/page-shell';
import { SortControl } from '@/components/sort-control';
import { PulTeamLogo } from '@/components/pul-team-logo';
import {
  listPulPlayers,
  listPulTeams,
  type PulPlayer,
  type PulTeam,
  type PulSortField,
} from '@/lib/pul/data';

export const metadata: Metadata = {
  title: 'PUL Players · The Layout',
  description: 'Premier Ultimate League player leaderboard for the 2026 season.',
};

export const revalidate = 3600;

// Allowlist of valid PulSortField values — never forward arbitrary user input.
const VALID_SORT_FIELDS = new Set<PulSortField>([
  'goals', 'assists', 'blocks', 'plus_minus', 'o_points', 'd_points',
]);

const SORT_OPTIONS = [
  { value: 'goals',      label: 'Goals'    },
  { value: 'assists',    label: 'Assists'  },
  { value: 'blocks',     label: 'Blocks'   },
  { value: 'plus_minus', label: '+/−'      },
  { value: 'o_points',   label: 'O-Pts'   },
  { value: 'd_points',   label: 'D-Pts'   },
];

interface Props {
  searchParams: { sort?: string; dir?: string };
}

export default async function PulPlayersPage({ searchParams }: Props) {
  const rawSort = searchParams.sort ?? '';
  const sortBy: PulSortField = VALID_SORT_FIELDS.has(rawSort as PulSortField)
    ? (rawSort as PulSortField)
    : 'goals';

  const rawDir = searchParams.dir ?? '';
  const dir: 'asc' | 'desc' = rawDir === 'asc' ? 'asc' : 'desc';

  const [players, teams] = await Promise.all([
    listPulPlayers({ season: 2026, sortBy, limit: 500 }).catch((): PulPlayer[] => []),
    listPulTeams().catch((): PulTeam[] => []),
  ]);

  // Client-side asc re-sort when dir=asc (DB always returns desc).
  const ranked = dir === 'asc' ? [...players].reverse() : players;

  // Build a lookup map so roster rows can render team info without a second fetch.
  const teamMap = new Map<string, PulTeam>(teams.map((t) => [t.id, t]));

  return (
    <PageShell
      title="Players"
      eyebrow="PUL · Premier Ultimate League · 2026"
      topNavSlot={<span />}
      breadcrumbs={[
        { label: 'Home', href: '/' },
        { label: 'PUL Teams', href: '/pul/teams' },
        { label: 'Players' },
      ]}
      controls={
        // SortControl uses useRouter/useSearchParams — must be inside Suspense
        // for Next 14 static prerendering.
        <Suspense fallback={null}>
          <SortControl
            options={SORT_OPTIONS}
            currentSort={sortBy}
            currentDir={dir}
          />
        </Suspense>
      }
    >
      {ranked.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center bg-surface border border-border rounded-md">
          <p className="text-[14px] font-semibold uppercase tracking-[0.18em] text-muted font-tight">
            No players yet
          </p>
          <p className="text-[13px] text-faint mt-2 max-w-sm">
            PUL player stats will appear here as the 2026 season progresses.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto -mx-5 px-5 md:mx-0 md:px-0">
          <table className="w-full min-w-[700px] border-collapse">
            <thead>
              <tr>
                {[
                  { label: 'Rank',   title: 'Rank',                           left: true  },
                  { label: 'Player', title: 'Player name',                    left: true  },
                  { label: 'Team',   title: 'Team',                           left: true  },
                  { label: 'G',      title: 'Goals',                          left: false },
                  { label: 'A',      title: 'Assists',                        left: false },
                  { label: 'Blk',    title: 'Blocks',                         left: false },
                  { label: 'TO',     title: 'Turnovers',                      left: false },
                  { label: 'O-Pts',  title: 'Offensive Points Played',        left: false },
                  { label: 'D-Pts',  title: 'Defensive Points Played',        left: false },
                  { label: '+/−',    title: 'Plus / Minus',                   left: false },
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
                  <LeaderboardRow
                    key={player.id}
                    player={player}
                    rank={i + 1}
                    team={team}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  );
}

// ─── Leaderboard row ──────────────────────────────────────────────────────────

function LeaderboardRow({
  player,
  rank,
  team,
}: {
  player: PulPlayer;
  rank: number;
  team: PulTeam | undefined;
}) {
  return (
    <tr className="hover:bg-surface-hi transition-colors duration-100">
      <td className="px-3 py-2.5 text-[13px] border-b border-hairline text-left text-faint tabular font-tight w-10">
        {rank}
      </td>
      <td className="px-3 py-2.5 text-[13px] border-b border-hairline text-left text-ink font-medium font-tight">
        {player.playerName}
      </td>
      <td className="px-3 py-2.5 border-b border-hairline text-left">
        {team ? (
          <Link
            href={`/pul/teams/${team.id}`}
            className={[
              'inline-flex items-center gap-2 no-underline',
              'text-[12px] font-medium font-tight text-muted',
              'hover:text-ink transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded',
            ].join(' ')}
          >
            <PulTeamLogo team={team} size={22} />
            <span className="truncate max-w-[120px]">{team.mascot}</span>
          </Link>
        ) : (
          <span className="text-[12px] text-faint font-tight">—</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-[13px] border-b border-hairline text-right tabular text-muted font-tight">
        {player.goals}
      </td>
      <td className="px-3 py-2.5 text-[13px] border-b border-hairline text-right tabular text-muted font-tight">
        {player.assists}
      </td>
      <td className="px-3 py-2.5 text-[13px] border-b border-hairline text-right tabular text-muted font-tight">
        {player.blocks}
      </td>
      <td className="px-3 py-2.5 text-[13px] border-b border-hairline text-right tabular text-muted font-tight">
        {player.turnovers}
      </td>
      <td className="px-3 py-2.5 text-[13px] border-b border-hairline text-right tabular text-muted font-tight">
        {player.oPoints}
      </td>
      <td className="px-3 py-2.5 text-[13px] border-b border-hairline text-right tabular text-muted font-tight">
        {player.dPoints}
      </td>
      <td className="px-3 py-2.5 text-[13px] border-b border-hairline text-right tabular text-muted font-tight">
        {formatPlusMinus(player.plusMinus)}
      </td>
    </tr>
  );
}

function formatPlusMinus(val: number): string {
  if (val > 0) return `+${val}`;
  return String(val);
}

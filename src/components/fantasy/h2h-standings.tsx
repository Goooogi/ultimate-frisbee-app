// H2HStandings — head-to-head standings table (rank · team · W-L(-T) · PF).
// Server-friendly presentational component (no hooks) shared by league-view
// and matchup-view (matchup-view uses it for team names/records only, not
// rendered there — see that file). Rows link to the team's public page.

import Link from 'next/link';
import type { H2HStandingRow } from '@/lib/fantasy/leagues';

export function H2HStandings({ contestId, rows }: { contestId: string; rows: H2HStandingRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="bg-surface rounded-card-lg shadow-card p-8 text-center">
        <p className="text-muted font-tight text-[14px]">No teams yet — be the first to build one.</p>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-card-lg shadow-card overflow-hidden">
      <div className="hidden sm:grid grid-cols-[2.5rem_1fr_auto] items-center px-5 py-3">
        <span className="text-[10px] font-bold tracking-[0.16em] uppercase text-faint font-tight">#</span>
        <span className="text-[10px] font-bold tracking-[0.16em] uppercase text-faint font-tight">Team</span>
        <span className="text-[10px] font-bold tracking-[0.16em] uppercase text-faint font-tight text-right">
          Record
        </span>
      </div>
      <ol aria-label="Head-to-head standings">
        {rows.map((row, idx) => {
          const rank = idx + 1;
          const isTop3 = rank <= 3;
          return (
            <li key={row.teamId}>
              <Link
                href={`/fantasy/l/${contestId}/t/${row.teamId}`}
                className={[
                  'grid grid-cols-[2.5rem_1fr_auto] items-center px-5 py-3.5',
                  'no-underline transition-colors duration-150',
                  'hover:bg-surface-hi',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
                  'border-t border-hairline sm:first:border-t-0',
                ].join(' ')}
              >
                <span
                  className={[
                    'font-tight text-[13px] font-bold tabular',
                    isTop3 ? 'text-accent' : 'text-faint',
                  ].join(' ')}
                  aria-label={`Rank ${rank}`}
                >
                  {rank}
                </span>
                <span className="min-w-0 font-tight text-[14px] font-semibold text-ink truncate">
                  {row.teamName}
                </span>
                <span className="flex flex-col items-end gap-0.5">
                  <span className="font-tight text-[14px] font-bold tabular text-ink">
                    {row.wins}-{row.losses}
                    {row.ties > 0 ? `-${row.ties}` : ''}
                  </span>
                  <span className="font-tight text-[10.5px] text-faint">{row.pointsFor} PF</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default H2HStandings;

// Standings strip — dark "Top of the league" panel on the left, then the
// top 3 teams from each division on the right. Designed to read at a
// glance: same chrome as before, but instead of one division's top 4 it
// shows every division's top 3 stacked in a labeled column.

import Link from 'next/link';
import type { UfaStanding, UfaTeamStat } from '@/lib/ufa/types';
import { teamMeta } from '@/lib/ufa/teams';
import { TeamLogo } from '@/components/team-logo';

interface StandingsStripProps {
  standings: UfaStanding[];
  teamStats?: UfaTeamStat[];
  /** Eyebrow label below the big number. */
  seasonLabel?: string;
}

const TOP_N = 3;

// The UFA's four divisions, in the canonical display order. Anything that
// shows up in the data but isn't in this list gets appended at the end so
// new/renamed divisions don't silently disappear.
const DIVISION_ORDER = ['Atlantic', 'Central', 'South', 'West', 'East'];

export function StandingsStrip({
  standings,
  teamStats = [],
  seasonLabel = 'UFA · 2026',
}: StandingsStripProps) {
  if (standings.length === 0) return null;

  // Group by division.
  const byDiv = new Map<string, UfaStanding[]>();
  for (const s of standings) {
    const d = s.divisionName ?? 'Unknown';
    if (!byDiv.has(d)) byDiv.set(d, []);
    byDiv.get(d)!.push(s);
  }

  // Order: canonical first, then any leftovers alphabetical.
  const allDivisions = Array.from(byDiv.keys());
  const ordered: string[] = [
    ...DIVISION_ORDER.filter((d) => byDiv.has(d)),
    ...allDivisions.filter((d) => !DIVISION_ORDER.includes(d)).sort(),
  ];

  // Top 3 per division, sorted by wins then point diff (same tiebreaker as
  // the previous single-division implementation).
  const columns = ordered.map((divName) => {
    const rows = (byDiv.get(divName) ?? [])
      .slice()
      .sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins;
        return b.pointDiff - a.pointDiff;
      })
      .slice(0, TOP_N)
      .map((s, i) => ({ ...s, rk: i + 1 }));
    return { divName, rows };
  });

  if (columns.every((c) => c.rows.length === 0)) return null;

  const statByTeam = new Map<string, UfaTeamStat>();
  for (const t of teamStats) statByTeam.set(t.teamID, t);

  // Choose a grid column count that lets every division get its own column
  // on desktop but stacks gracefully on smaller breakpoints. Most UFA
  // seasons have 4 divisions; we tier 1/2/4 to keep the math simple.
  const colCount = columns.length;
  const colsClass =
    colCount >= 4
      ? 'sm:grid-cols-2 lg:grid-cols-4'
      : colCount === 3
        ? 'sm:grid-cols-2 lg:grid-cols-3'
        : colCount === 2
          ? 'sm:grid-cols-2'
          : 'grid-cols-1';

  return (
    <section
      aria-label="Division standings — top 3"
      className="px-5 lg:px-12 pt-2 pb-12 lg:pb-14"
    >
      <div className="bg-surface border border-border grid grid-cols-1 md:grid-cols-[200px_1fr]">
        {/* Dark left panel — design element paired with the dark stadium
            hero card. Kept dark in both themes. */}
        <div className="bg-[#0E0E0C] text-[#F4F2EB] px-5 py-5 lg:px-6 lg:py-6 flex flex-col justify-between gap-3 min-h-[180px]">
          <span className="font-sans text-[10.5px] font-bold tracking-[0.18em] uppercase text-[rgba(244,242,235,0.55)]">
            Top of the league
          </span>
          <div>
            <div className="font-display italic font-bold text-[34px] lg:text-[38px] leading-[0.95] tracking-[-0.02em]">
              Top {TOP_N}
            </div>
            <div className="font-sans text-[10.5px] mt-2 tracking-[0.16em] uppercase text-[rgba(244,242,235,0.55)]">
              per division
            </div>
            <div className="font-mono text-[11px] mt-3 text-[rgba(244,242,235,0.55)]">
              {seasonLabel}
            </div>
          </div>
        </div>

        {/* One column per division, top 3 inside each. */}
        <div className={`px-5 py-4 lg:px-6 grid grid-cols-1 ${colsClass} gap-x-6 gap-y-5`}>
          {columns.map((col) => (
            <div key={col.divName} className="flex flex-col">
              <div className="flex items-center gap-2 mb-2 pb-2 border-b border-hairline">
                <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-ink font-tight">
                  {col.divName}
                </span>
                <span aria-hidden="true" className="h-px flex-1 bg-hairline" />
              </div>

              {col.rows.length === 0 ? (
                <span className="text-[11px] text-faint font-tight py-2">No teams ranked.</span>
              ) : (
                col.rows.map((s) => {
                  const meta = teamMeta(s.teamID);
                  const ts = statByTeam.get(s.teamID);
                  const record =
                    s.ties > 0 ? `${s.wins}-${s.losses}-${s.ties}` : `${s.wins}-${s.losses}`;
                  return (
                    <Link
                      key={s.teamID}
                      href={`/teams/${s.teamID}`}
                      className="flex items-center gap-3 py-2 border-b border-hairline last:border-b-0 hover:opacity-80 transition-opacity"
                    >
                      <span className="font-mono text-[11px] text-faint w-[18px]">
                        {String(s.rk).padStart(2, '0')}
                      </span>
                      <TeamLogo team={meta} size={26} />
                      <div className="flex-1 min-w-0">
                        <div className="font-display italic font-bold text-[14px] lg:text-[15px] leading-none text-ink truncate">
                          {meta.name ?? s.teamName.split(' ').slice(-1).join(' ')}
                        </div>
                        <div className="font-mono text-[10.5px] text-muted mt-1 tabular">
                          {record}
                          {ts && ts.scoresFor != null && ts.scoresAgainst != null
                            ? ` · ${ts.scoresFor}-${ts.scoresAgainst}`
                            : ''}
                        </div>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

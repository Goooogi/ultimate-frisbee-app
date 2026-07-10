// Standings strip — one floating card per division (DivisionCardA), each
// showing its top 3 teams. Designed to read at a glance: each division gets
// its own card so the grid reads as a set of equal, scannable panels rather
// than one wide table. The section-level SectionHead ("Top of the league")
// is rendered by the page, not this component — this file owns just the
// division-card grid, per the Home v2 design spec.

import Link from 'next/link';
import type { UfaStanding, UfaTeamStat } from '@/lib/ufa/types';
import { teamMeta } from '@/lib/ufa/teams';
import { TeamLogo } from '@/components/team-logo';
import { StandingsCarousel } from '@/components/home/standings-carousel';

interface StandingsStripProps {
  standings: UfaStanding[];
  teamStats?: UfaTeamStat[];
}

const TOP_N = 3;

// The UFA's four divisions, in the canonical display order. Anything that
// shows up in the data but isn't in this list gets appended at the end so
// new/renamed divisions don't silently disappear.
const DIVISION_ORDER = ['Atlantic', 'Central', 'South', 'West', 'East'];

export function StandingsStrip({ standings, teamStats = [] }: StandingsStripProps) {
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
  // Desktop grid column count — every division gets its own column on wide
  // screens, tiered down for tablet. The MOBILE view is a swipe carousel
  // (StandingsCarousel), so grid-cols-1 no longer matters below sm.
  const colCount = columns.length;
  const desktopColsClass =
    colCount >= 4
      ? 'sm:grid-cols-2 lg:grid-cols-4'
      : colCount === 3
        ? 'sm:grid-cols-2 lg:grid-cols-3'
        : colCount === 2
          ? 'sm:grid-cols-2'
          : 'sm:grid-cols-1';

  const cards = columns.map((col) => (
    <DivisionCard key={col.divName} col={col} statByTeam={statByTeam} />
  ));

  return (
    <StandingsCarousel
      cards={cards}
      labels={columns.map((c) => c.divName)}
      desktopColsClass={desktopColsClass}
    />
  );
}

// ─── One division panel — top-3 teams. Shared by the mobile carousel and the
// desktop grid (rendered on the server, handed to StandingsCarousel). ───────
function DivisionCard({
  col,
  statByTeam,
}: {
  col: { divName: string; rows: Array<UfaStanding & { rk: number }> };
  statByTeam: Map<string, UfaTeamStat>;
}) {
  return (
    <div className="h-full bg-surface rounded-card-lg shadow-card px-5 pt-5 pb-2 flex flex-col">
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-display italic font-bold text-[20px] tracking-[-0.01em] text-ink">
          {col.divName}
        </span>
        <span className="font-mono text-[10px] text-faint tracking-[0.08em]">TOP {TOP_N}</span>
      </div>

      {col.rows.length === 0 ? (
        <span className="text-[11px] text-faint font-tight py-3">No teams ranked.</span>
      ) : (
        col.rows.map((s, i) => {
          const meta = teamMeta(s.teamID);
          const ts = statByTeam.get(s.teamID);
          const record = s.ties > 0 ? `${s.wins}-${s.losses}-${s.ties}` : `${s.wins}-${s.losses}`;
          const pointDiffLabel =
            ts && ts.scoresFor != null && ts.scoresAgainst != null
              ? `${ts.scoresFor}-${ts.scoresAgainst}`
              : s.pointDiff !== 0
                ? `${s.pointDiff > 0 ? '+' : ''}${s.pointDiff}`
                : null;
          return (
            <Link
              key={s.teamID}
              href={`/teams/${s.teamID}`}
              className={[
                'grid grid-cols-[16px_34px_1fr_auto] gap-2.5 items-center py-[11px]',
                i === 0 ? '' : 'border-t border-hairline',
                'hover:opacity-80 transition-opacity',
              ].join(' ')}
            >
              <span
                className={[
                  'font-mono text-[12px] font-bold',
                  s.rk === 1 ? 'text-accent' : 'text-faint',
                ].join(' ')}
              >
                {s.rk}
              </span>
              <span className="inline-flex rounded-full overflow-hidden">
                <TeamLogo team={meta} size={30} />
              </span>
              <div className="min-w-0">
                <div className="font-sans font-bold text-[14px] leading-tight text-ink truncate">
                  {meta.name ?? s.teamName.split(' ').slice(-1).join(' ')}
                </div>
                {pointDiffLabel && (
                  <div className="font-mono text-[10.5px] text-faint mt-0.5 tabular">
                    {pointDiffLabel}
                  </div>
                )}
              </div>
              <span className="font-mono text-[12.5px] font-semibold text-ink tabular">
                {record}
              </span>
            </Link>
          );
        })
      )}
    </div>
  );
}

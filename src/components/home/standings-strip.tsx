// Standings strip — dark "Week NN" panel on the left, then 4-team row on the
// right. By default shows the East division (per design); falls back to first
// available division if East is empty.

import Link from 'next/link';
import type { UfaStanding, UfaTeamStat } from '@/lib/ufa/types';
import { teamMeta } from '@/lib/ufa/teams';
import { TeamLogo } from '@/components/team-logo';

interface StandingsStripProps {
  standings: UfaStanding[];
  teamStats?: UfaTeamStat[];
  /** Defaults to "East". */
  division?: string;
  /** Eyebrow label below the big number. */
  seasonLabel?: string;
  /** Top-right of dark panel — e.g. "Week 09". */
  weekLabel?: string;
}

export function StandingsStrip({
  standings,
  teamStats = [],
  division = 'East',
  seasonLabel = 'UFA · 2026',
  weekLabel = 'Week 09',
}: StandingsStripProps) {
  // Group standings by division and pick the requested one (or first available)
  const byDiv = new Map<string, UfaStanding[]>();
  for (const s of standings) {
    const d = s.divisionName ?? 'Unknown';
    if (!byDiv.has(d)) byDiv.set(d, []);
    byDiv.get(d)!.push(s);
  }
  const rows = (byDiv.get(division) ?? byDiv.get(Array.from(byDiv.keys())[0]) ?? [])
    .slice()
    .sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      return b.pointDiff - a.pointDiff;
    })
    .slice(0, 4)
    .map((s, i) => ({ ...s, rk: i + 1 }));

  if (rows.length === 0) return null;

  const statByTeam = new Map<string, UfaTeamStat>();
  for (const t of teamStats) statByTeam.set(t.teamID, t);

  const displayDiv = byDiv.has(division) ? division : Array.from(byDiv.keys())[0] ?? division;

  return (
    <section
      aria-label={`${displayDiv} standings`}
      className="px-5 lg:px-12 pt-2 pb-12 lg:pb-14"
    >
      <div className="bg-white border border-[#E5E1D6] grid grid-cols-1 md:grid-cols-[200px_1fr]">
        {/* Dark left panel */}
        <div className="bg-[#0E0E0C] text-[#F4F2EB] px-5 py-5 lg:px-6 lg:py-6 flex flex-col justify-between gap-3 min-h-[140px]">
          <span className="font-sans text-[10.5px] font-bold tracking-[0.18em] uppercase text-[rgba(244,242,235,0.55)]">
            {displayDiv} · standings
          </span>
          <div>
            <div className="font-display italic font-bold text-[34px] lg:text-[38px] leading-[0.95] tracking-[-0.02em]">
              {weekLabel}
            </div>
            <div className="font-mono text-[11px] mt-2 text-[rgba(244,242,235,0.55)]">
              {seasonLabel}
            </div>
          </div>
        </div>

        {/* Standings rows */}
        <div className="px-5 py-4 lg:px-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6">
          {rows.map((s) => {
            const meta = teamMeta(s.teamID);
            const ts = statByTeam.get(s.teamID);
            const record = s.ties > 0 ? `${s.wins}-${s.losses}-${s.ties}` : `${s.wins}-${s.losses}`;
            return (
              <Link
                key={s.teamID}
                href={`/teams/${s.teamID}`}
                className="flex items-center gap-3 py-2.5 border-b border-[#EFECE3] last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0 lg:[&:nth-last-child(-n+4)]:border-b-0 hover:opacity-80 transition-opacity"
              >
                <span className="font-mono text-[11px] text-[#A6A29A] w-[18px]">
                  {String(s.rk).padStart(2, '0')}
                </span>
                <TeamLogo team={meta} size={28} />
                <div className="flex-1 min-w-0">
                  <div className="font-display italic font-bold text-[15px] lg:text-[16px] leading-none text-[#0E0E0C] truncate">
                    {meta.name ?? s.teamName.split(' ').slice(-1).join(' ')}
                  </div>
                  <div className="font-mono text-[10.5px] text-[#6F6B62] mt-1 tabular">
                    {record}
                    {ts && ts.scoresFor != null && ts.scoresAgainst != null
                      ? ` · ${ts.scoresFor}-${ts.scoresAgainst}`
                      : ''}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

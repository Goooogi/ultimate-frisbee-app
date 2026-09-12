// "Top of the league" cards — one floating card per standings table, each
// showing its top teams, rendered on the server and handed to
// StandingsCarousel by the page (swipe row on mobile, grid on desktop).
//
//   UFA  one card per division (top 3), while the UFA season is in progress
//   PUL  one card (single table, top 5), while the PUL season is in progress
//   WUL  same as PUL
//
// The section-level head ("Top of the league") is rendered by the page, and
// the page decides WHICH leagues appear from src/lib/home/season-phase.ts —
// a finished league's table lives in its "Season complete" card instead
// (Hunter, 2026-09-11: hide UFA once its season is over, show PUL/WUL here
// while theirs run).

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { UfaStanding, UfaTeamStat } from '@/lib/ufa/types';
import type { PulStandingRow } from '@/lib/pul/data';
import type { WulStandingRow } from '@/lib/wul/data';
import { teamMeta } from '@/lib/ufa/teams';
import { TeamLogo } from '@/components/team-logo';
import { PulTeamLogo } from '@/components/pul-team-logo';
import { WulTeamLogo } from '@/components/wul-team-logo';

export interface TopOfLeagueCard {
  label: string;
  node: ReactNode;
}

const UFA_TOP_N = 3;
const PRO_TOP_N = 5;

// The UFA's four divisions, in the canonical display order. Anything that
// shows up in the data but isn't in this list gets appended at the end so
// new/renamed divisions don't silently disappear.
const DIVISION_ORDER = ['Atlantic', 'Central', 'South', 'West', 'East'];

/** One card per UFA division, top 3 by wins then point diff. */
export function ufaDivisionCards(standings: UfaStanding[], teamStats: UfaTeamStat[] = []): TopOfLeagueCard[] {
  if (standings.length === 0) return [];

  const byDiv = new Map<string, UfaStanding[]>();
  for (const s of standings) {
    const d = s.divisionName ?? 'Unknown';
    if (!byDiv.has(d)) byDiv.set(d, []);
    byDiv.get(d)!.push(s);
  }
  const allDivisions = Array.from(byDiv.keys());
  const ordered: string[] = [
    ...DIVISION_ORDER.filter((d) => byDiv.has(d)),
    ...allDivisions.filter((d) => !DIVISION_ORDER.includes(d)).sort(),
  ];

  const statByTeam = new Map<string, UfaTeamStat>();
  for (const t of teamStats) statByTeam.set(t.teamID, t);

  return ordered
    .map((divName) => {
      const rows = (byDiv.get(divName) ?? [])
        .slice()
        .sort((a, b) => {
          if (b.wins !== a.wins) return b.wins - a.wins;
          return b.pointDiff - a.pointDiff;
        })
        .slice(0, UFA_TOP_N)
        .map((s, i): StandingsCardRow => {
          const meta = teamMeta(s.teamID);
          const ts = statByTeam.get(s.teamID);
          return {
            key: s.teamID,
            href: `/teams/${s.teamID}`,
            rank: i + 1,
            mark: <TeamLogo team={meta} size={30} />,
            name: meta.name ?? s.teamName.split(' ').slice(-1).join(' '),
            sub:
              ts && ts.scoresFor != null && ts.scoresAgainst != null
                ? `${ts.scoresFor}-${ts.scoresAgainst}`
                : s.pointDiff !== 0
                  ? `${s.pointDiff > 0 ? '+' : ''}${s.pointDiff}`
                  : null,
            record: s.ties > 0 ? `${s.wins}-${s.losses}-${s.ties}` : `${s.wins}-${s.losses}`,
          };
        });
      return { divName, rows };
    })
    .filter((col) => col.rows.length > 0)
    .map((col) => ({
      label: col.divName,
      node: <StandingsCard key={col.divName} title={col.divName} topLabel={`TOP ${UFA_TOP_N}`} rows={col.rows} />,
    }));
}

/** The PUL's single table, top 5 (rows arrive sorted from getPulStandings;
 *  folded franchises sit at 0-0 and are skipped). */
export function pulStandingsCard(rows: PulStandingRow[]): TopOfLeagueCard | null {
  const top = rows.filter((r) => r.wins + r.losses > 0).slice(0, PRO_TOP_N);
  if (top.length === 0) return null;
  return {
    label: 'PUL',
    node: (
      <StandingsCard
        key="pul"
        title="PUL"
        topLabel={`TOP ${PRO_TOP_N}`}
        rows={top.map((r, i) => ({
          key: r.team.id,
          href: `/pul/teams/${r.team.id}`,
          rank: i + 1,
          mark: <PulTeamLogo team={r.team} size={30} />,
          name: r.team.name,
          sub: pointDiffLabel(r.pointDiff),
          record: `${r.wins}-${r.losses}`,
        }))}
      />
    ),
  };
}

/** The WUL's single table, top 5. */
export function wulStandingsCard(rows: WulStandingRow[]): TopOfLeagueCard | null {
  const top = rows.slice(0, PRO_TOP_N);
  if (top.length === 0) return null;
  return {
    label: 'WUL',
    node: (
      <StandingsCard
        key="wul"
        title="WUL"
        topLabel={`TOP ${PRO_TOP_N}`}
        rows={top.map((r, i) => ({
          key: r.team.id,
          href: `/wul/teams/${r.team.id}`,
          rank: i + 1,
          mark: <WulTeamLogo team={r.team} size={30} />,
          name: r.team.name,
          sub: pointDiffLabel(r.pointDiff),
          record: `${r.wins}-${r.losses}`,
        }))}
      />
    ),
  };
}

function pointDiffLabel(diff: number): string | null {
  return diff === 0 ? null : `${diff > 0 ? '+' : ''}${diff}`;
}

// ─── One standings panel — shared by the mobile carousel and the desktop grid ─

export interface StandingsCardRow {
  key: string;
  href: string;
  rank: number;
  mark: ReactNode;
  name: string;
  /** Second line under the name: UFA scores for-against, PUL/WUL point diff. */
  sub: string | null;
  record: string;
}

function StandingsCard({ title, topLabel, rows }: { title: string; topLabel: string; rows: StandingsCardRow[] }) {
  return (
    <div className="h-full bg-surface rounded-card-lg shadow-card px-5 pt-5 pb-2 flex flex-col">
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-display italic font-bold text-[20px] tracking-[-0.01em] text-ink">{title}</span>
        <span className="font-mono text-[10px] text-faint tracking-[0.08em]">{topLabel}</span>
      </div>

      {rows.map((row, i) => (
        <Link
          key={row.key}
          href={row.href}
          className={[
            'grid grid-cols-[16px_34px_1fr_auto] gap-2.5 items-center py-[11px]',
            i === 0 ? '' : 'border-t border-hairline',
            'hover:opacity-80 transition-opacity',
          ].join(' ')}
        >
          <span className={['font-mono text-[12px] font-bold', row.rank === 1 ? 'text-accent' : 'text-faint'].join(' ')}>
            {row.rank}
          </span>
          <span className="inline-flex rounded-full overflow-hidden">{row.mark}</span>
          <div className="min-w-0">
            <div className="font-sans font-bold text-[14px] leading-tight text-ink truncate">{row.name}</div>
            {row.sub && <div className="font-mono text-[10.5px] text-faint mt-0.5 tabular">{row.sub}</div>}
          </div>
          <span className="font-mono text-[12.5px] font-semibold text-ink tabular">{row.record}</span>
        </Link>
      ))}
    </div>
  );
}

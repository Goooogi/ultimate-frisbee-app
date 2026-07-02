// /teams — branches on ?league=:
//   - league=usau → USAU teams ranked by last completed Nationals
//   - default (UFA) → divisional standings + team stats (existing flow)
//
// Server Component. Reads ?year=YYYY and ?league=… from searchParams.

import type { Metadata } from 'next';
import Link from 'next/link';
import { getStandings, getTeamStats, currentSeasonYear } from '@/lib/ufa/client';
import { teamMeta } from '@/lib/ufa/teams';
import type { UfaStanding, UfaTeamStat } from '@/lib/ufa/types';
import { PageShell } from '@/components/page-shell';
import { YearSelector } from '@/components/year-selector';
import { TeamLogo } from '@/components/team-logo';
import { UsauTeamsRanked } from '@/components/usau/usau-teams-ranked';
import { UsauDivisionSelect } from '@/components/usau/usau-division-select';
import { UsauLevelSelect } from '@/components/usau/usau-level-select';
import { PulTeamLogo } from '@/components/pul-team-logo';
import { listPulTeams, type PulTeam } from '@/lib/pul/data';
import { WulTeamLogo } from '@/components/wul-team-logo';
import { listActiveWulTeams, type WulTeam } from '@/lib/wul/data';
import {
  parseDivisionParam,
  parseLeagueParam,
  parseLevelParam,
  levelLabel,
} from '@/lib/league';

export const revalidate = 600;

export const metadata: Metadata = {
  title: 'Teams · The Layout',
};

interface Props {
  searchParams: { year?: string; league?: string; div?: string; level?: string; season?: string };
}

const DIVISIONS = ['East', 'Central', 'South', 'West'] as const;
type Division = (typeof DIVISIONS)[number];

export default async function TeamsPage({ searchParams }: Props) {
  const league = parseLeagueParam(searchParams.league);

  // PUL branch: 13 PUL teams in a card grid. Season-agnostic team list.
  if (league === 'pul') {
    const teams = await listPulTeams().catch((): PulTeam[] => []);
    return (
      <PageShell
        title="Teams"
        eyebrow="PUL · Premier Ultimate League"
      >
        {teams.length === 0 ? (
          <EmptyState message="Could not load PUL teams. Try refreshing the page." />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {teams.map((team) => (
              <PulTeamCard key={team.id} team={team} />
            ))}
          </div>
        )}
      </PageShell>
    );
  }

  // WUL branch: team card grid (mirrors PUL). Cards link to /wul/teams/[id].
  if (league === 'wul') {
    const teams = await listActiveWulTeams().catch((): WulTeam[] => []);
    return (
      <PageShell
        title="Teams"
        eyebrow="WUL · Western Ultimate League"
      >
        {teams.length === 0 ? (
          <EmptyState message="Could not load WUL teams. Try refreshing the page." />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {teams.map((team) => (
              <WulTeamCard key={team.id} team={team} />
            ))}
          </div>
        )}
      </PageShell>
    );
  }

  // USAU branch: ranked team list. No year selector (USAU's notion of
  // year is implicit in the source data, last-completed-Nationals).
  if (league === 'usau') {
    const division = parseDivisionParam(searchParams.div);
    const level = parseLevelParam(searchParams.level);
    // College has no Mixed division — quietly coerce so the page doesn't
    // render empty when a user lands here via a stale `?div=mixed` link.
    const isCollege = level === 'COLLEGE_D1' || level === 'COLLEGE_D3';
    const effectiveDivision = isCollege && division === 'Mixed' ? 'Men' : division;
    return (
      <PageShell
        title="Teams"
        eyebrow={`USAU · ${levelLabel(level)} · ${effectiveDivision}`}
        controls={
          <div className="flex flex-wrap items-center gap-2">
            <UsauLevelSelect />
            <UsauDivisionSelect />
          </div>
        }
      >
        <UsauTeamsRanked genderDivision={effectiveDivision} competitionLevel={level} />
      </PageShell>
    );
  }

  // UFA branch (original behavior).
  const currentYear = currentSeasonYear();
  const year = parseInt(searchParams.year ?? String(currentYear), 10) || currentYear;
  const isCurrentSeason = year === currentYear;

  let standings: UfaStanding[] = [];
  let teamStats: UfaTeamStat[] = [];

  try {
    const results = await Promise.allSettled([
      isCurrentSeason ? getStandings() : Promise.resolve<UfaStanding[]>([]),
      getTeamStats({ year, perGame: false }),
    ]);

    if (results[0].status === 'fulfilled') standings = results[0].value;
    if (results[1].status === 'fulfilled') teamStats = results[1].value.stats ?? [];
  } catch (err) {
    console.error('Failed to fetch teams data:', err);
  }

  // Index team-stats by teamID for quick lookup.
  const statsByTeam = new Map<string, UfaTeamStat>();
  for (const t of teamStats) statsByTeam.set(t.teamID, t);

  return (
    <PageShell
      title="Teams"
      eyebrow={`UFA · ${year}`}
      controls={<YearSelector currentYear={year} />}
    >
      {isCurrentSeason && standings.length > 0 ? (
        <DivisionView standings={standings} statsByTeam={statsByTeam} />
      ) : (
        <TeamStatsTable stats={teamStats} />
      )}
    </PageShell>
  );
}

// ── Divisional view (current season) ─────────────────────────────────────────

function DivisionView({
  standings,
  statsByTeam,
}: {
  standings: UfaStanding[];
  statsByTeam: Map<string, UfaTeamStat>;
}) {
  // Group standings by division.
  const byDiv = new Map<string, UfaStanding[]>();
  for (const s of standings) {
    const d = s.divisionName ?? 'Unknown';
    if (!byDiv.has(d)) byDiv.set(d, []);
    byDiv.get(d)!.push(s);
  }

  // Sort each division by wins desc, ties broken by pointDiff desc.
  for (const rows of byDiv.values()) {
    rows.sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      return b.pointDiff - a.pointDiff;
    });
  }

  const divisionOrder = DIVISIONS.filter((d) => byDiv.has(d));
  // Append any divisions not in our hard-coded order.
  for (const d of byDiv.keys()) {
    if (!divisionOrder.includes(d as Division)) divisionOrder.push(d as Division);
  }

  if (divisionOrder.length === 0) {
    return <EmptyState message="No standings data available." />;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {divisionOrder.map((divName) => {
        const rows = byDiv.get(divName) ?? [];
        return (
          <section key={divName} aria-labelledby={`div-${divName}`}>
            <h2
              id={`div-${divName}`}
              className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight mb-2 pb-2 border-b border-hairline"
            >
              {divName}
            </h2>
            <div className="flex flex-col gap-px bg-border border border-border">
              {rows.map((s, i) => {
                const meta = teamMeta(s.teamID);
                const ts = statsByTeam.get(s.teamID);
                return (
                  <Link
                    key={s.teamID}
                    href={`/teams/${s.teamID}`}
                    className="flex items-center gap-3 bg-surface px-4 py-3 hover:bg-surface-hi transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
                  >
                    {/* Rank */}
                    <span className="text-[11px] font-bold text-faint tabular font-tight w-4 flex-shrink-0">
                      {i + 1}
                    </span>

                    {/* Team logo */}
                    <TeamLogo team={meta} size={36} />

                    {/* Team name */}
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-[11px] font-semibold tracking-[0.08em] uppercase text-muted font-tight truncate">
                        {s.teamName.split(' ').slice(0, -1).join(' ')}
                      </span>
                      <span className="text-[15px] font-bold font-tight text-ink leading-tight truncate">
                        {s.teamName.split(' ').slice(-1).join(' ')}
                      </span>
                    </div>

                    {/* Record */}
                    <div className="flex flex-col items-end flex-shrink-0 gap-0.5">
                      <span className="tabular text-[15px] font-bold font-tight text-ink">
                        {s.wins}–{s.losses}{s.ties > 0 ? `–${s.ties}` : ''}
                      </span>
                      {ts && (
                        <span className="text-[10px] text-faint font-tight tabular">
                          {Number(ts.scoresFor) > 0 ? `${ts.scoresFor}–${ts.scoresAgainst}` : null}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ── Flat team-stats table (non-current years) ─────────────────────────────────

function TeamStatsTable({ stats }: { stats: UfaTeamStat[] }) {
  if (stats.length === 0) return <EmptyState message="No team stats available for this season." />;

  const thBase = 'px-3 py-2 text-[10px] font-bold tracking-[0.14em] uppercase font-tight text-muted border-b border-border whitespace-nowrap text-right';

  return (
    <div className="overflow-x-auto -mx-5 px-5 md:mx-0 md:px-0">
      <table className="w-full min-w-[560px] border-collapse">
        <thead>
          <tr>
            <th className={`${thBase} text-left`} scope="col">Team</th>
            <th className={thBase} scope="col">GP</th>
            <th className={thBase} scope="col">W</th>
            <th className={thBase} scope="col">L</th>
            <th className={thBase} scope="col">PF</th>
            <th className={thBase} scope="col">PA</th>
            <th className={thBase} scope="col">Cmp</th>
            <th className={thBase} scope="col">TO</th>
            <th className={thBase} scope="col">Blk</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((t) => {
            const meta = teamMeta(t.teamID);
            return (
              <tr key={t.teamID} className="hover:bg-surface-hi transition-colors duration-100">
                <td className="px-3 py-2.5 text-[13px] border-b border-hairline text-left">
                  <Link
                    href={`/teams/${t.teamID}`}
                    className="inline-flex items-center gap-2 hover:opacity-80 transition-opacity"
                  >
                    <TeamLogo team={meta} size={24} />
                    <span className="font-medium font-tight text-ink">{t.teamName}</span>
                  </Link>
                </td>
                {[t.gamesPlayed, t.wins, t.losses, t.scoresFor, t.scoresAgainst, t.completions, t.turnovers, t.blocks].map((val, i) => (
                  <td key={i} className="px-3 py-2.5 text-[13px] border-b border-hairline text-right tabular text-muted font-tight">
                    {val ?? '—'}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center bg-surface border border-border">
      <div className="text-[14px] font-semibold uppercase tracking-[0.18em] text-muted mb-2 font-tight">
        No data available
      </div>
      <div className="text-[13px] text-faint max-w-sm">{message}</div>
    </div>
  );
}

// ── PUL team card ─────────────────────────────────────────────────────────────

function PulTeamCard({ team }: { team: PulTeam }) {
  return (
    <Link
      href={`/pul/teams/${team.id}`}
      className={[
        'flex flex-col items-center gap-3 bg-surface border border-border p-4 rounded-md',
        'text-ink no-underline',
        'hover:border-[rgb(var(--ink)/0.3)] hover:bg-surface-hi transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
      ].join(' ')}
    >
      <PulTeamLogo team={team} size={56} />
      <div className="text-center min-w-0 w-full">
        <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-muted font-tight truncate">
          {team.city}
        </p>
        <p className="text-[15px] font-bold font-tight text-ink leading-tight truncate mt-0.5">
          {team.mascot}
        </p>
      </div>
    </Link>
  );
}

function WulTeamCard({ team }: { team: WulTeam }) {
  return (
    <Link
      href={`/wul/teams/${team.id}`}
      className={[
        'flex flex-col items-center gap-3 bg-surface border border-border p-4 rounded-md',
        'text-ink no-underline',
        'hover:border-[rgb(var(--ink)/0.3)] hover:bg-surface-hi transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
      ].join(' ')}
    >
      <WulTeamLogo team={team} size={56} />
      <div className="text-center min-w-0 w-full">
        <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-muted font-tight truncate">
          {team.city}
        </p>
        <p className="text-[15px] font-bold font-tight text-ink leading-tight truncate mt-0.5">
          {team.mascot}
        </p>
      </div>
    </Link>
  );
}

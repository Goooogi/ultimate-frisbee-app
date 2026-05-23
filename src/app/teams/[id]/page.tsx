// /teams/[id] — synthesized team page.
// Hero band + top scorers + upcoming games + recent results.

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  getStandings,
  getTeamStats,
  getAllGamesByYears,
  getCurrentGames,
  getAllPlayerStats,
  currentSeasonYear,
} from '@/lib/ufa/client';
import { teamMeta } from '@/lib/ufa/teams';
import { gameUiState } from '@/lib/ufa/format';
import type { UfaGame, UfaPlayerStat, UfaStanding } from '@/lib/ufa/types';
import { PageShell } from '@/components/page-shell';
import { GameCard } from '@/components/game-card';

export const revalidate = 300;

interface Props {
  params: { id: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const meta = teamMeta(params.id);
  if (meta.internalID === 0) return { title: 'Team not found · The Layout' };
  return { title: `${meta.city} ${meta.name} · The Layout` };
}

export default async function TeamPage({ params }: Props) {
  const id = params.id;
  const meta = teamMeta(id);

  if (meta.internalID === 0) notFound();

  const year = currentSeasonYear();

  // Fire all fetches in parallel.
  const [standingsResult, teamStatsResult, seasonGamesResult, liveGamesResult, playersResult] =
    await Promise.allSettled([
      getStandings(),
      getTeamStats({ year }),
      getAllGamesByYears([year], { teamID: id }),
      getCurrentGames(),
      getAllPlayerStats({ year, teamID: id, sort: 'scores', dir: 'desc' }),
    ]);

  const standings = standingsResult.status === 'fulfilled' ? standingsResult.value : [];
  const teamStats = teamStatsResult.status === 'fulfilled' ? teamStatsResult.value.stats ?? [] : [];
  const seasonGames = seasonGamesResult.status === 'fulfilled' ? seasonGamesResult.value : [];
  const liveGames = liveGamesResult.status === 'fulfilled' ? liveGamesResult.value : [];
  const players = playersResult.status === 'fulfilled' ? playersResult.value : [];

  // Merge live games with season games — live data wins.
  const allGamesById = new Map<string, UfaGame>();
  for (const g of seasonGames) allGamesById.set(g.gameID, g);
  for (const g of liveGames) {
    if (g.awayTeamID === id || g.homeTeamID === id) {
      allGamesById.set(g.gameID, g);
    }
  }
  const allGames = Array.from(allGamesById.values());

  // Split by status.
  const upcomingAndLive = allGames
    .filter((g) => {
      const s = gameUiState(g);
      return s.isUpcoming || s.isLive;
    })
    .sort((a, b) => {
      const ta = a.startTimestamp ? new Date(a.startTimestamp).getTime() : Infinity;
      const tb = b.startTimestamp ? new Date(b.startTimestamp).getTime() : Infinity;
      return ta - tb;
    });

  const recentFinals = allGames
    .filter((g) => gameUiState(g).isFinal)
    .sort((a, b) => {
      const ta = a.startTimestamp ? new Date(a.startTimestamp).getTime() : 0;
      const tb = b.startTimestamp ? new Date(b.startTimestamp).getTime() : 0;
      return tb - ta; // most recent first
    })
    .slice(0, 6);

  // Find this team's standing row.
  const standing = standings.find((s) => s.teamID === id);

  // Find team stats row.
  const teamStatRow = teamStats.find((t) => t.teamID === id);

  const recordStr = standing
    ? `${standing.wins}–${standing.losses}${standing.ties > 0 ? `–${standing.ties}` : ''}`
    : null;

  return (
    <PageShell
      title={`${meta.city} ${meta.name}`}
      eyebrow={`UFA · ${meta.division ?? 'Team'}`}
      breadcrumbs={[
        { label: 'Home', href: '/' },
        { label: 'Teams', href: '/teams' },
        { label: `${meta.city} ${meta.name}` },
      ]}
    >
      {/* Hero band with team color */}
      <div
        className="relative overflow-hidden mb-8 px-6 py-8 md:px-8 md:py-10"
        style={{ background: meta.primary }}
        aria-hidden="false"
      >
        {/* Accent overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: meta.accent, opacity: 0.08 }}
          aria-hidden="true"
        />

        <div className="relative z-10 flex flex-wrap items-end justify-between gap-6">
          <div className="flex items-center gap-5">
            {/* Logo (or abbr fallback) */}
            <div
              className="flex items-center justify-center w-[72px] h-[72px] md:w-[96px] md:h-[96px] relative overflow-hidden flex-shrink-0 rounded-[2px] bg-white/10"
            >
              {meta.logo ? (
                <img
                  src={meta.logo}
                  alt={`${meta.city} ${meta.name} logo`}
                  className="max-w-[80%] max-h-[80%] object-contain"
                />
              ) : (
                <span
                  className="font-display text-[28px] md:text-[36px] font-bold tracking-[0.04em] uppercase"
                  style={{ color: '#fff' }}
                >
                  {meta.abbr}
                </span>
              )}
            </div>

            <div>
              <div className="text-[11px] font-bold tracking-[0.2em] uppercase font-sans mb-1" style={{ color: 'rgba(255,255,255,0.6)' }}>
                {meta.division ? `${meta.division} Division` : 'UFA'}
              </div>
              <div className="font-display text-[32px] md:text-[42px] font-bold uppercase leading-none tracking-[0.01em]" style={{ color: '#fff' }}>
                {meta.name}
              </div>
              <div className="text-[13px] font-medium font-sans mt-1" style={{ color: 'rgba(255,255,255,0.7)' }}>
                {meta.city}
              </div>
            </div>
          </div>

          {/* Record + point diff */}
          {standing && (
            <div className="flex flex-col items-end gap-1">
              <div className="tabular font-display text-[36px] md:text-[44px] font-bold leading-none" style={{ color: '#fff' }}>
                {recordStr}
              </div>
              {standing.pointDiff !== 0 && (
                <div className="text-[11px] font-bold tracking-[0.1em] uppercase font-sans" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  {standing.pointDiff > 0 ? `+${standing.pointDiff}` : standing.pointDiff} point diff
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Team stats strip */}
      {teamStatRow && (
        <div className="grid grid-cols-4 md:grid-cols-8 gap-px bg-border border border-border mb-8">
          {[
            { label: 'PF', value: teamStatRow.scoresFor },
            { label: 'PA', value: teamStatRow.scoresAgainst },
            { label: 'Cmp', value: teamStatRow.completions },
            { label: 'TO', value: teamStatRow.turnovers },
            { label: 'Blk', value: teamStatRow.blocks },
            { label: 'Holds', value: teamStatRow.holds },
            { label: 'GP', value: teamStatRow.gamesPlayed },
          ]
            .filter(({ value }) => value != null)
            .map(({ label, value }) => (
              <div key={label} className="bg-surface flex flex-col items-center justify-center px-2 py-4 gap-0.5">
                <div className="tabular text-[22px] font-bold font-tight leading-none text-ink">{value}</div>
                <div className="text-[9px] font-bold tracking-[0.16em] uppercase text-muted font-tight">{label}</div>
              </div>
            ))}
        </div>
      )}

      <div className="flex flex-col gap-10">
        {/* Roster */}
        {players.length > 0 && (
          <section aria-labelledby="roster-heading">
            <h2
              id="roster-heading"
              className="flex items-center justify-between text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight mb-3 pb-2 border-b border-hairline"
            >
              <span>Roster · {year}</span>
              <span className="text-faint tabular">{players.length}</span>
            </h2>
            <div className="overflow-x-auto -mx-5 px-5 md:mx-0 md:px-0">
              <table className="w-full min-w-[400px] border-collapse">
                <thead>
                  <tr>
                    {['#', 'Player', 'G', 'A', '+/−', 'CMP%'].map((h, i) => (
                      <th
                        key={h}
                        scope="col"
                        className={[
                          'px-3 py-2 text-[10px] font-bold tracking-[0.14em] uppercase font-tight text-muted',
                          'border-b border-border whitespace-nowrap',
                          i <= 1 ? 'text-left' : 'text-right',
                        ].join(' ')}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {players.map((p, i) => {
                    const cmp = parseFloat(p.completionPercentage as string) || 0;
                    return (
                      <tr key={p.playerID} className="hover:bg-surface-hi transition-colors duration-100">
                        <td className="px-3 py-2.5 text-[13px] border-b border-hairline text-left text-faint tabular font-tight">{i + 1}</td>
                        <td className="px-3 py-2.5 text-[13px] border-b border-hairline text-left text-ink font-medium font-tight">
                          <Link href={`/players/${p.playerID}`} className="hover:text-accent transition-colors duration-150">
                            {p.name}
                          </Link>
                        </td>
                        <td className="px-3 py-2.5 text-[13px] border-b border-hairline text-right tabular text-muted font-tight">{p.goals ?? '—'}</td>
                        <td className="px-3 py-2.5 text-[13px] border-b border-hairline text-right tabular text-muted font-tight">{p.assists ?? '—'}</td>
                        <td className="px-3 py-2.5 text-[13px] border-b border-hairline text-right tabular text-muted font-tight">{formatPlusMinus(p.plusMinus)}</td>
                        <td className="px-3 py-2.5 text-[13px] border-b border-hairline text-right tabular text-muted font-tight">
                          {cmp > 0 ? `${cmp.toFixed(1)}%` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Upcoming + Live games */}
        {upcomingAndLive.length > 0 && (
          <section aria-labelledby="upcoming-heading">
            <h2
              id="upcoming-heading"
              className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight mb-3 pb-2 border-b border-hairline"
            >
              Upcoming Games
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 md:gap-3">
              {upcomingAndLive.map((g) => (
                <GameCard key={g.gameID} game={g} />
              ))}
            </div>
          </section>
        )}

        {/* Recent results */}
        {recentFinals.length > 0 && (
          <section aria-labelledby="results-heading">
            <h2
              id="results-heading"
              className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight mb-3 pb-2 border-b border-hairline"
            >
              Recent Results
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 md:gap-3">
              {recentFinals.map((g) => (
                <GameCard key={g.gameID} game={g} />
              ))}
            </div>
          </section>
        )}

        {upcomingAndLive.length === 0 && recentFinals.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center bg-surface border border-border">
            <div className="text-[14px] font-semibold uppercase tracking-[0.18em] text-muted mb-2 font-tight">
              No games found
            </div>
            <div className="text-[13px] text-faint max-w-sm">
              No game data available for {meta.city} {meta.name} this season.
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}

function formatPlusMinus(val: number | undefined): string {
  if (val == null) return '—';
  return val >= 0 ? `+${val}` : String(val);
}

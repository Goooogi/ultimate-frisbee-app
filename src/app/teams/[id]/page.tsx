// /teams/[id] — synthesized team page.
// Hero band + top scorers + upcoming games + recent results.

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import {
  getStandings,
  getTeamStats,
  getAllGamesByYears,
  getCurrentGames,
  getAllPlayerStats,
  getGameRoster,
  getUfaTeamPodiums,
  currentSeasonYear,
  recentSeasons,
} from '@/lib/ufa/client';
import { TeamMedals } from '@/components/team-medals';
import { YearSelector } from '@/components/year-selector';
import { teamMeta } from '@/lib/ufa/teams';
import { gameUiState } from '@/lib/ufa/format';
import type { UfaGame, UfaPlayerStat, UfaStanding } from '@/lib/ufa/types';
import { PageShell } from '@/components/page-shell';
import { GameCard } from '@/components/game-card';
import { UfaRosterTable } from '@/components/ufa/ufa-roster-table';
import { ufaTeamState } from '@/lib/usau/regions';
import { locationLine } from '@/lib/team-geo';

export const revalidate = 300;

interface Props {
  params: { id: string };
  searchParams: { year?: string };
}

/** Clamp ?year= to a real UFA season (2021..current); default current. Guards
 *  against a hand-typed or stale year producing an empty page. */
function resolveYear(raw: string | undefined): number {
  const current = currentSeasonYear();
  const n = raw ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n) || n < 2021 || n > current) return current;
  return n;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const meta = teamMeta(params.id);
  if (meta.internalID === 0) return { title: 'Team not found · The Layout' };
  return { title: `${meta.city} ${meta.name} · The Layout` };
}

export default async function TeamPage({ params, searchParams }: Props) {
  const id = params.id;
  const meta = teamMeta(id);

  if (meta.internalID === 0) notFound();

  const year = resolveYear(searchParams.year);
  const isCurrentYear = year === currentSeasonYear();

  // Fire all fetches in parallel.
  const [standingsResult, teamStatsResult, seasonGamesResult, liveGamesResult, playersResult, podiumsResult] =
    await Promise.allSettled([
      // Standings are current-season only; skip for a past year (record is
      // derived from that season's finals instead).
      isCurrentYear ? getStandings() : Promise.resolve([]),
      getTeamStats({ year }),
      getAllGamesByYears([year], { teamID: id }),
      // Live games are current-season only — skip the call for a past year so a
      // live game from the current season can't leak into a historical view.
      isCurrentYear ? getCurrentGames() : Promise.resolve([]),
      getAllPlayerStats({ year, teamID: id, sort: 'scores', dir: 'desc' }),
      getUfaTeamPodiums(id),
    ]);

  const standings = standingsResult.status === 'fulfilled' ? standingsResult.value : [];
  const teamStats = teamStatsResult.status === 'fulfilled' ? teamStatsResult.value.stats ?? [] : [];
  const seasonGames = seasonGamesResult.status === 'fulfilled' ? seasonGamesResult.value : [];
  const liveGames = liveGamesResult.status === 'fulfilled' ? liveGamesResult.value : [];
  const players = playersResult.status === 'fulfilled' ? playersResult.value : [];
  const podiums = podiumsResult.status === 'fulfilled' ? podiumsResult.value : [];

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

  // Every completed game this season, most recent first. (Previously capped at
  // 6 "recent results"; the team page now shows the full season schedule.)
  const seasonFinals = allGames
    .filter((g) => gameUiState(g).isFinal)
    .sort((a, b) => {
      const ta = a.startTimestamp ? new Date(a.startTimestamp).getTime() : 0;
      const tb = b.startTimestamp ? new Date(b.startTimestamp).getTime() : 0;
      return tb - ta; // most recent first
    });

  // Jersey numbers: the player-stats endpoint has no jersey field, but each
  // game's roster-report does. Pull the most recent PLAYED game's roster and
  // map playerID → jerseyNumber. Numbers are stable within a season, so the
  // latest game is a good source. Degrades gracefully to {} on any failure.
  const jerseyByPlayer = new Map<string, string>();
  const latestGame = seasonFinals[0];
  if (latestGame) {
    try {
      const roster = await getGameRoster(latestGame.gameID);
      const ourSide =
        latestGame.homeTeamID === id ? roster.home : roster.away;
      for (const r of ourSide) {
        if (r.jerseyNumber != null && r.jerseyNumber !== '') {
          jerseyByPlayer.set(r.playerID, String(r.jerseyNumber));
        }
      }
    } catch {
      // No jersey data — roster table falls back to row index.
    }
  }

  // Find this team's standing row. The standings endpoint is CURRENT-SEASON
  // only, so for a past year there's no row — we fall back to a record derived
  // from that season's finals below.
  const standing = isCurrentYear ? standings.find((s) => s.teamID === id) : null;

  // Find team stats row.
  const teamStatRow = teamStats.find((t) => t.teamID === id);

  // Win/loss/tie for the hero. Use the live standings row when it exists
  // (current season); otherwise derive from the season's completed games so a
  // historical year still shows a record. Ties = equal final scores (rare).
  const derivedRecord = seasonFinals.reduce(
    (acc, g) => {
      const mine = g.homeTeamID === id ? g.homeScore : g.awayScore;
      const theirs = g.homeTeamID === id ? g.awayScore : g.homeScore;
      if (mine == null || theirs == null) return acc;
      if (mine > theirs) acc.wins++;
      else if (mine < theirs) acc.losses++;
      else acc.ties++;
      return acc;
    },
    { wins: 0, losses: 0, ties: 0 },
  );
  const record = standing ?? (derivedRecord.wins + derivedRecord.losses + derivedRecord.ties > 0 ? derivedRecord : null);

  const recordStr = record
    ? `${record.wins}–${record.losses}${record.ties > 0 ? `–${record.ties}` : ''}`
    : null;

  return (
    <PageShell
      title={`${meta.city} ${meta.name}`}
      eyebrow={`UFA · ${meta.division ?? 'Team'} · ${year}`}
      breadcrumbs={[
        { label: 'Home', href: '/' },
        { label: 'Teams', href: '/teams' },
        { label: `${meta.city} ${meta.name}` },
      ]}
      controls={<YearSelector currentYear={year} />}
    >
      {/* Hero band with team color — floats on shadow, softened corners */}
      <div
        className="relative overflow-hidden mb-6 px-6 py-8 md:px-8 md:py-10 rounded-card-xl shadow-hero"
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
            {/* Logo (or abbr fallback) — circular white disc per v2 chip treatment */}
            <div
              className="flex items-center justify-center w-[72px] h-[72px] md:w-[96px] md:h-[96px] relative overflow-hidden flex-shrink-0 rounded-full bg-white"
            >
              {meta.logo ? (
                <img
                  src={meta.logo}
                  alt={`${meta.city} ${meta.name} logo`}
                  className="w-[72%] h-[72%] object-contain"
                />
              ) : (
                <span
                  className="font-display italic text-[28px] md:text-[36px] font-bold tracking-[0.02em] uppercase"
                  style={{ color: meta.primary }}
                >
                  {meta.abbr}
                </span>
              )}
            </div>

            <div>
              <div className="text-[11px] font-bold tracking-[0.2em] uppercase font-sans mb-1" style={{ color: 'rgba(255,255,255,0.6)' }}>
                {meta.division ? `${meta.division} Division` : 'UFA'}
              </div>
              <div className="font-display italic text-[32px] md:text-[42px] font-bold uppercase leading-[0.95] tracking-[-0.01em]" style={{ color: '#fff' }}>
                {meta.name}
              </div>
              <div className="text-[13px] font-medium font-sans mt-1" style={{ color: 'rgba(255,255,255,0.7)' }}>
                {locationLine(meta.city, ufaTeamState(meta.id))}
              </div>
            </div>
          </div>

          {/* Record + point diff. Point diff is only carried by the live
              standings row (current season); a derived historical record shows
              the W-L only. */}
          {recordStr && (
            <div className="flex flex-col items-end gap-1">
              <div className="tabular font-display italic text-[36px] md:text-[44px] font-bold leading-[0.95]" style={{ color: '#fff' }}>
                {recordStr}
              </div>
              {standing && standing.pointDiff !== 0 && (
                <div className="text-[11px] font-bold tracking-[0.1em] uppercase font-sans" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  {standing.pointDiff > 0 ? `+${standing.pointDiff}` : standing.pointDiff} point diff
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Championship medals (podium finishes) */}
      {podiums.length > 0 && (
        <div className="mb-6">
          <TeamMedals medals={podiums} />
        </div>
      )}

      {/* Team stats strip */}
      {teamStatRow && (
        <div className="grid grid-cols-4 md:grid-cols-8 bg-surface rounded-card-lg shadow-card mb-8 overflow-hidden">
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
              <div
                key={label}
                className="flex flex-col items-center justify-center px-2 py-4 gap-0.5"
              >
                <div className="tabular font-display italic text-[22px] font-bold leading-none text-ink">{value}</div>
                <div className="text-[9px] font-bold tracking-[0.16em] uppercase text-muted font-tight">{label}</div>
              </div>
            ))}
        </div>
      )}

      <div className="flex flex-col gap-10">
        {/* Roster */}
        {players.length > 0 && (
          <section aria-labelledby="roster-heading">
            <div className="flex items-end justify-between gap-4 mb-4">
              <h2
                id="roster-heading"
                className="text-[10.5px] font-bold tracking-[0.18em] uppercase text-accent font-sans m-0"
              >
                Roster · {year}
              </h2>
              <span className="font-mono text-[11px] text-faint tabular">{players.length}</span>
            </div>
            <UfaRosterTable players={players} jerseyByPlayer={jerseyByPlayer} year={year} />
          </section>
        )}

        {/* Upcoming + Live games */}
        {upcomingAndLive.length > 0 && (
          <section aria-labelledby="upcoming-heading">
            <h2
              id="upcoming-heading"
              className="text-[10.5px] font-bold tracking-[0.18em] uppercase text-accent font-sans mb-4"
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

        {/* Season results — every completed game this season */}
        {seasonFinals.length > 0 && (
          <section aria-labelledby="results-heading">
            <div className="flex items-end justify-between gap-4 mb-4">
              <h2
                id="results-heading"
                className="text-[10.5px] font-bold tracking-[0.18em] uppercase text-accent font-sans m-0"
              >
                Season Results · {year}
              </h2>
              <span className="font-mono text-[11px] text-faint tabular">{seasonFinals.length}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 md:gap-3">
              {seasonFinals.map((g) => (
                <GameCard key={g.gameID} game={g} />
              ))}
            </div>
          </section>
        )}

        {upcomingAndLive.length === 0 && seasonFinals.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center bg-surface rounded-card-lg shadow-card">
            <div className="text-[14px] font-semibold uppercase tracking-[0.18em] text-muted mb-2 font-tight">
              No games found
            </div>
            <div className="text-[13px] text-faint max-w-sm">
              No game data available for {meta.city} {meta.name} in {year}.
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}

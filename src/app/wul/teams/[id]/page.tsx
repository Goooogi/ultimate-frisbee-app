// /wul/teams/[id] — WUL team roster page.
// Mirrors src/app/pul/teams/[id]/page.tsx exactly, adapted for WUL types.
// WUL carries richer per-player stats (hucks, yards) but the roster table
// shows the same core columns as PUL for consistency. Players link to the
// shared /players/[id] profile.

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '@/components/page-shell';
import { WulTeamLogo } from '@/components/wul-team-logo';
import {
  getWulRoster,
  listWulGames,
  listWulTeams,
  getWulCurrentSeason,
  getWulTeamPodiums,
  type WulTeam,
  type WulPlayer,
  type WulGame,
} from '@/lib/wul/data';
import { TeamMedals } from '@/components/team-medals';
import { ProRosterTable } from '@/components/pro-roster-table';
import { ProTeamGameLog } from '@/components/pro-team-game-log';
import { wulTeamState, locationLine } from '@/lib/team-geo';

export const revalidate = 3600;

interface Props {
  params: { id: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const teams = await listWulTeams().catch((): WulTeam[] => []);
  const team = teams.find((t) => t.id === params.id);
  if (!team) return { title: 'Team not found · The Layout' };
  const season = await getWulCurrentSeason();
  return {
    title: `${team.city} ${team.mascot} · WUL · The Layout`,
    description: `${team.city} ${team.mascot} roster and stats for the ${season} WUL season.`,
  };
}

export default async function WulTeamPage({ params }: Props) {
  const season = await getWulCurrentSeason();
  const [teams, roster, podiums, games] = await Promise.all([
    listWulTeams().catch((): WulTeam[] => []),
    getWulRoster(params.id, season).catch((): WulPlayer[] => []),
    getWulTeamPodiums(params.id).catch(() => []),
    listWulGames({ season }).catch((): WulGame[] => []),
  ]);

  const team = teams.find((t) => t.id === params.id);

  // Unknown team id → hard 404
  if (!team) notFound();

  return (
    <PageShell
      title={`${team.city} ${team.mascot}`}
      eyebrow="WUL · Western Ultimate League"
      topNavSlot={<span />}
      breadcrumbs={[
        { label: 'Home', href: '/' },
        { label: 'WUL Teams', href: '/teams?league=wul' },
        { label: `${team.city} ${team.mascot}` },
      ]}
    >
      {/* Team hero band */}
      <div className="flex flex-wrap items-center gap-5 mb-8 p-5 lg:p-7 bg-surface rounded-card-lg shadow-card">
        <span className="inline-flex rounded-full overflow-hidden flex-shrink-0">
          <WulTeamLogo team={team} size={72} />
        </span>
        <div>
          <div className="text-[10.5px] font-bold tracking-[0.18em] uppercase text-accent font-sans mb-1.5">
            {team.city}
          </div>
          <h2 className="font-display italic text-[28px] lg:text-[36px] font-bold text-ink leading-[0.95] tracking-[-0.02em]">
            {team.mascot}
          </h2>
          <div className="text-[12px] text-muted font-tight mt-1.5">
            {locationLine(team.city, wulTeamState(params.id))} · {season} Season
          </div>
        </div>
        {podiums.length > 0 && (
          <div className="w-full sm:w-auto sm:ml-auto">
            <TeamMedals medals={podiums} />
          </div>
        )}
      </div>

      {/* Roster */}
      <section aria-labelledby="roster-heading">
        <div className="flex items-end justify-between gap-4 mb-4">
          <div>
            <span className="block text-[10.5px] font-bold tracking-[0.18em] uppercase text-accent font-sans mb-2">
              {season} Season
            </span>
            <h2 id="roster-heading" className="font-display italic font-bold text-[22px] lg:text-[26px] leading-[0.95] tracking-[-0.02em] text-ink m-0">
              Roster
            </h2>
          </div>
          <span className="text-[11px] font-bold tracking-[0.12em] uppercase text-faint tabular pb-1">
            {roster.length} {roster.length === 1 ? 'player' : 'players'}
          </span>
        </div>

        {roster.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 px-6 text-center bg-surface rounded-card-lg shadow-card">
            <p className="text-[14px] font-semibold uppercase tracking-[0.18em] text-muted font-tight">
              Roster coming soon
            </p>
            <p className="text-[13px] text-faint mt-2 max-w-sm">
              No players have been rostered for {team.city} {team.mascot} yet this season.
            </p>
            <Link
              href="/teams?league=wul"
              className="mt-5 text-[12px] font-bold tracking-[0.12em] uppercase text-ink underline underline-offset-2 hover:text-accent transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
            >
              View all WUL teams
            </Link>
          </div>
        ) : (
          <div className="bg-surface rounded-card-lg shadow-card p-5">
            <ProRosterTable players={roster} league="wul" />
          </div>
        )}
      </section>

      {/* Season game log — every game the team played this season. */}
      <ProTeamGameLog teamId={params.id} games={games} league="wul" season={season} />
    </PageShell>
  );
}

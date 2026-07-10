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
  listWulTeams,
  getWulCurrentSeason,
  getWulTeamPodiums,
  type WulTeam,
  type WulPlayer,
} from '@/lib/wul/data';
import { TeamMedals } from '@/components/team-medals';
import { ProRosterTable } from '@/components/pro-roster-table';
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
  const [teams, roster, podiums] = await Promise.all([
    listWulTeams().catch((): WulTeam[] => []),
    getWulRoster(params.id, season).catch((): WulPlayer[] => []),
    getWulTeamPodiums(params.id).catch(() => []),
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
      <div className="flex flex-wrap items-center gap-5 mb-8 pb-6 border-b border-hairline">
        <WulTeamLogo team={team} size={72} />
        <div>
          <div className="text-[11px] font-bold tracking-[0.18em] uppercase text-muted font-tight mb-1">
            {team.city}
          </div>
          <h2 className="text-[28px] lg:text-[36px] font-bold font-tight text-ink leading-none tracking-[-0.02em]">
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
        <h2
          id="roster-heading"
          className="flex items-center justify-between text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight mb-3 pb-2 border-b border-hairline"
        >
          <span>Roster · {season}</span>
          <span className="text-faint tabular">{roster.length}</span>
        </h2>

        {roster.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 px-6 text-center bg-surface border border-border rounded-md">
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
          <ProRosterTable players={roster} league="wul" />
        )}
      </section>
    </PageShell>
  );
}

// /pul/teams/[id] — PUL team roster page.
// Shows the team header (logo + name) and a full stat table for all rostered players.
// Server component; gracefully handles empty/partial rosters (56 players across 13 teams).

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '@/components/page-shell';
import { PulTeamLogo } from '@/components/pul-team-logo';
import { TeamMedals } from '@/components/team-medals';
import { ProRosterTable } from '@/components/pro-roster-table';
import { pulTeamState, proTeamCountry, locationLine } from '@/lib/team-geo';
import {
  getPulRoster,
  listPulTeams,
  getPulTeamPodiums,
  type PulTeam,
  type PulPlayer,
} from '@/lib/pul/data';

export const revalidate = 3600;

interface Props {
  params: { id: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const teams = await listPulTeams().catch((): PulTeam[] => []);
  const team = teams.find((t) => t.id === params.id);
  if (!team) return { title: 'Team not found · The Layout' };
  return {
    title: `${team.city} ${team.mascot} · PUL · The Layout`,
    description: `${team.city} ${team.mascot} roster and stats for the 2026 PUL season.`,
  };
}

export default async function PulTeamPage({ params }: Props) {
  const [teams, roster, podiums] = await Promise.all([
    listPulTeams().catch((): PulTeam[] => []),
    getPulRoster(params.id, 2026).catch((): PulPlayer[] => []),
    getPulTeamPodiums(params.id).catch(() => []),
  ]);

  const team = teams.find((t) => t.id === params.id);

  // Unknown team id → hard 404
  if (!team) notFound();

  return (
    <PageShell
      title={`${team.city} ${team.mascot}`}
      eyebrow="PUL · Premier Ultimate League"
      topNavSlot={<span />}
      breadcrumbs={[
        { label: 'Home', href: '/' },
        { label: 'PUL Teams', href: '/pul/teams' },
        { label: `${team.city} ${team.mascot}` },
      ]}
    >
      {/* Team hero band */}
      <div className="flex flex-wrap items-center gap-5 mb-8 pb-6 border-b border-hairline">
        <PulTeamLogo team={team} size={72} />
        <div>
          <div className="text-[11px] font-bold tracking-[0.18em] uppercase text-muted font-tight mb-1">
            {team.city}
          </div>
          <h2 className="text-[28px] lg:text-[36px] font-bold font-tight text-ink leading-none tracking-[-0.02em]">
            {team.mascot}
          </h2>
          <div className="text-[12px] text-muted font-tight mt-1.5">
            {locationLine(team.city, pulTeamState(params.id), proTeamCountry(params.id))} · 2026 Season
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
          <span>Roster · 2026</span>
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
              href="/pul/teams"
              className="mt-5 text-[12px] font-bold tracking-[0.12em] uppercase text-ink underline underline-offset-2 hover:text-accent transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
            >
              View all PUL teams
            </Link>
          </div>
        ) : (
          <ProRosterTable players={roster} league="pul" linkNames={false} />
        )}
      </section>
    </PageShell>
  );
}

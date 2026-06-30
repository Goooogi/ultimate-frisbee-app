// /usau/teams/[id] — single USAU team page.
//
// Server fetches the clustered team summary (all 5 usau_teams rows for a
// franchise unioned into one history) and hands it to the client-side
// UsauTeamHistory component, which renders a year dropdown + the
// selected year's tournaments + roster.

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { PageShell } from '@/components/page-shell';
import { getTeam } from '@/lib/usau/data';
import { UsauTeamHistory } from '@/components/usau/usau-team-history';
import { UsauTeamLogo } from '@/components/usau/usau-team-logo';

export const revalidate = 60;

interface Props {
  params: { id: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const team = await getTeam(params.id).catch(() => null);
  if (!team) return { title: 'Team not found · The Layout' };
  return { title: `${team.name} · USAU · The Layout` };
}

export default async function UsauTeamPage({ params }: Props) {
  const team = await getTeam(params.id);
  if (!team) notFound();

  const eyebrowParts = [team.competitionLevel, team.genderDivision, team.state]
    .filter(Boolean)
    .join(' · ');

  const totalEvents = team.seasons.reduce((s, y) => s + y.events.length, 0);
  const yearsCount = team.seasons.length;

  return (
    <PageShell
      title={team.name}
      eyebrow={`USAU${eyebrowParts ? ` · ${eyebrowParts}` : ''}`}
      breadcrumbs={[
        { label: 'Home', href: '/' },
        { label: 'Teams', href: '/teams?league=usau' },
        { label: team.name },
      ]}
    >
      <div className="flex flex-wrap items-center gap-3 mb-8 pb-6 border-b border-hairline">
        <UsauTeamLogo name={team.name} genderDivision={team.genderDivision} size={56} />
        <SummaryChip label="Seasons" value={yearsCount} />
        <SummaryChip label="Events" value={totalEvents} />
      </div>

      <UsauTeamHistory seasons={team.seasons} />
    </PageShell>
  );
}

function SummaryChip({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="inline-flex items-baseline gap-2 px-3 py-2 rounded-md bg-surface border border-border">
      <span className="tabular text-[18px] font-bold font-tight leading-none tracking-[-0.02em] text-ink">
        {value}
      </span>
      <span className="text-[9px] font-bold tracking-[0.18em] uppercase text-muted font-tight">
        {label}
      </span>
    </div>
  );
}

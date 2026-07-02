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
import {
  levelToParam,
  DEFAULT_DIVISION,
  DEFAULT_LEVEL,
  type UsauDivision,
  type UsauLevel,
  USAU_LEVELS,
} from '@/lib/league';

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

  // Back link → the Teams list filtered to THIS team's division + level, so
  // "‹ Teams" returns you to (e.g.) College D-I · Men rather than the default
  // Club · Men. Params match the teams page: ?league=usau&div=…&level=….
  const teamsBackHref = buildTeamsBackHref(team.genderDivision, team.competitionLevel);

  return (
    <PageShell
      title={team.name}
      eyebrow={`USAU${eyebrowParts ? ` · ${eyebrowParts}` : ''}`}
      breadcrumbs={[
        { label: 'Home', href: '/' },
        { label: 'Teams', href: teamsBackHref },
        { label: team.name },
      ]}
    >
      <div className="flex flex-wrap items-center gap-3 mb-8 pb-6 border-b border-hairline">
        <UsauTeamLogo
          name={team.name}
          genderDivision={team.genderDivision}
          competitionLevel={team.competitionLevel}
          size={56}
        />
        <SummaryChip label="Seasons" value={yearsCount} />
        <SummaryChip label="Events" value={totalEvents} />
      </div>

      <UsauTeamHistory seasons={team.seasons} genderDivision={team.genderDivision} />
    </PageShell>
  );
}

/**
 * Build the "‹ Teams" href pointing back to the USAU teams list filtered to a
 * team's own division + competition level. Params mirror the teams page
 * (?league=usau&div=men&level=college-d1). Defaults (Men / Club) are omitted so
 * the URL stays clean, matching buildLeagueQs's convention.
 */
function buildTeamsBackHref(
  genderDivision: string | null,
  competitionLevel: string | null,
): string {
  const params = new URLSearchParams({ league: 'usau' });

  // Division: only add when it's a valid non-default value.
  const div = (genderDivision ?? '') as UsauDivision;
  if ((['Men', 'Women', 'Mixed'] as string[]).includes(div) && div !== DEFAULT_DIVISION) {
    params.set('div', div.toLowerCase());
  }

  // Level: only add when it's a recognized non-default level.
  const level = (competitionLevel ?? '') as UsauLevel;
  if (USAU_LEVELS.includes(level) && level !== DEFAULT_LEVEL) {
    params.set('level', levelToParam(level));
  }

  return `/teams?${params.toString()}`;
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

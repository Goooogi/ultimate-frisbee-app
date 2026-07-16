// /usau/teams/[id] — single USAU team page.
//
// Server fetches the clustered team summary (all 5 usau_teams rows for a
// franchise unioned into one history) and hands it to the client-side
// UsauTeamHistory component, which renders a year dropdown + the
// selected year's tournaments + roster.

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { PageShell } from '@/components/page-shell';
import { getTeam, getTeamNationalsMedals } from '@/lib/usau/data';
import { UsauTeamHistory } from '@/components/usau/usau-team-history';
import { UsauTeamLogo } from '@/components/usau/usau-team-logo';
import { TeamMedals } from '@/components/team-medals';
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

  // National Championship medals (year + placement). Non-fatal on failure.
  const medals = await getTeamNationalsMedals(
    team.name,
    team.genderDivision,
    team.competitionLevel,
  ).catch(() => []);

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
      <div className="mb-8 rounded-card-lg shadow-card bg-surface overflow-hidden">
        {/* Identity + stats row. The big page title above carries the team
            name; here the logo anchors the card and the stats sit opposite. */}
        <div className="flex items-center gap-4 p-4 lg:p-5">
          <UsauTeamLogo
            name={team.name}
            genderDivision={team.genderDivision}
            competitionLevel={team.competitionLevel}
            size={52}
          />
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold tracking-[0.16em] uppercase text-faint font-tight">
              Team Profile
            </div>
            {eyebrowParts && (
              <div className="text-[13px] font-bold text-ink font-tight mt-1 truncate tracking-[-0.01em]">
                {eyebrowParts}
              </div>
            )}
          </div>
          <div className="flex items-stretch shrink-0">
            <SummaryStat label="Seasons" value={yearsCount} />
            <span className="w-px self-stretch bg-hairline mx-3 lg:mx-4" aria-hidden="true" />
            <SummaryStat label="Events" value={totalEvents} />
          </div>
        </div>

        {/* Honors row — only when the team has medals. Sits in its own tinted
            band with a divider so it reads as a distinct trophy shelf. */}
        {medals.length > 0 && (
          <div className="border-t border-hairline bg-bg px-4 py-3.5 lg:px-5">
            <TeamMedals medals={medals} heading="National Championships" showPlace />
          </div>
        )}
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

/** A single vertical stat (number over label) for the team hero panel. Border
 *  and background come from the enclosing panel; stats are separated by a thin
 *  divider rendered by the caller. */
function SummaryStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-1">
      <span className="tabular text-[22px] font-bold font-tight leading-none tracking-[-0.03em] text-ink">
        {value}
      </span>
      <span className="text-[9px] font-bold tracking-[0.16em] uppercase text-faint font-tight mt-1">
        {label}
      </span>
    </div>
  );
}

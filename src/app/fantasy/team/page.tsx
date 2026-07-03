// /fantasy/team — Roster builder page shell. Server Component.
// The page itself is public (no auth gate). Auth is demanded ONLY when the
// user attempts a write action (create team / save roster) inside the
// client RosterBuilder component.

import { PageShell } from '@/components/page-shell';
import { currentFantasyWeek, getMyTeam, getMyTeamRoster } from '@/lib/fantasy/data';
import { RosterBuilder } from '@/components/fantasy/roster-builder';
import { FantasyRulesModal } from '@/components/fantasy/fantasy-rules-modal';
import type { Crumb } from '@/components/breadcrumbs';

export const revalidate = 0; // builder needs fresh week/team state

const BREADCRUMBS: Crumb[] = [
  { label: 'Fantasy', href: '/fantasy' },
  { label: 'My Team' },
];

export default async function FantasyTeamPage() {
  // Both fetches are safe to run server-side as anon / session-aware
  // respectively — getMyTeam returns null when not signed in (no crash).
  const [weekInfo, myTeam] = await Promise.all([
    currentFantasyWeek().catch(() => null),
    getMyTeam().catch(() => null),
  ]);

  // Pre-fill the builder with the user's already-saved roster so "My Team"
  // shows their picks instead of empty search boxes. Needs a week to key on;
  // if the schedule has no active week we skip it (builder starts empty).
  const existingRoster = weekInfo
    ? await getMyTeamRoster(weekInfo.week).catch(() => [])
    : [];

  return (
    <PageShell
      title="My Team"
      eyebrow="Fantasy · Beta"
      subtitle={
        weekInfo
          ? `${weekInfo.week}${weekInfo.locked ? ' · Locked' : ' · Open'}`
          : 'UFA Fantasy'
      }
      breadcrumbs={BREADCRUMBS}
    >
      <div className="flex justify-end mb-6">
        <FantasyRulesModal label="How scoring works" />
      </div>
      <RosterBuilder weekInfo={weekInfo} existingTeam={myTeam} existingRoster={existingRoster} />
    </PageShell>
  );
}

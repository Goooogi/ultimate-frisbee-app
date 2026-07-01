// /fantasy/team — Roster builder page shell. Server Component.
// The page itself is public (no auth gate). Auth is demanded ONLY when the
// user attempts a write action (create team / save roster) inside the
// client RosterBuilder component.

import { PageShell } from '@/components/page-shell';
import { currentFantasyWeek, getMyTeam } from '@/lib/fantasy/data';
import { RosterBuilder } from '@/components/fantasy/roster-builder';
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
      <RosterBuilder weekInfo={weekInfo} existingTeam={myTeam} />
    </PageShell>
  );
}

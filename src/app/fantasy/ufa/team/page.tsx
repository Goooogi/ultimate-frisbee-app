// /fantasy/ufa/team — Roster builder page shell. Server Component.
// Moved from /fantasy/team (2026-08-27 game-hub IA inversion); the old path
// redirects here via next.config. The page itself is public (no auth gate).
// Auth is demanded ONLY when the user attempts a write action (create team /
// save roster) inside the client RosterBuilder component.

import { PageShell } from '@/components/page-shell';
import { currentFantasyWeek } from '@/lib/fantasy/data';
import {
  getMyTeamServer,
  getMyTeamRosterServer,
  getMyProfileServer,
} from '@/lib/fantasy/server';
import { RosterBuilder } from '@/components/fantasy/roster-builder';
import { FantasyRulesModal } from '@/components/fantasy/fantasy-rules-modal';
import type { Crumb } from '@/components/breadcrumbs';

export const revalidate = 0; // builder needs fresh week/team state
// Per-request render: the team/roster/profile are user-specific (server-auth),
// so this route can't be statically cached across users.
export const dynamic = 'force-dynamic';

const BREADCRUMBS: Crumb[] = [
  { label: 'UFA Fantasy', href: '/fantasy/ufa' },
  { label: 'My Team' },
];

export default async function UfaTeamPage() {
  // Resolve everything server-side with the cookie-aware server client so the
  // signed-in user's team name, roster, and profile are baked into the initial
  // HTML — no post-hydration empty→filled flash. All three return null/[] when
  // signed out (no crash), so the logged-out builder still renders fine.
  const [weekInfo, myTeam, myProfile] = await Promise.all([
    currentFantasyWeek().catch(() => null),
    getMyTeamServer().catch(() => null),
    getMyProfileServer().catch(() => null),
  ]);

  // Pre-fill the builder with the user's already-saved roster so "My Team"
  // shows their picks instead of empty search boxes. Needs a week to key on;
  // if the schedule has no active week we skip it (builder starts empty).
  const existingRoster = weekInfo
    ? await getMyTeamRosterServer(weekInfo.week).catch(() => [])
    : [];

  return (
    <PageShell
      title="My Team"
      eyebrow="UFA Fantasy · Beta"
      hideFooterMobile
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
      <RosterBuilder
        weekInfo={weekInfo}
        existingTeam={myTeam}
        existingRoster={existingRoster}
        initialProfile={myProfile}
      />
    </PageShell>
  );
}

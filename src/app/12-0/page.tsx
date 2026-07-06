// /12-0 — draft mini-game (UFA / PUL / WUL).
// Server component: loads all three leagues' spin pools + team display maps
// once and passes them to the client game. League choice happens client-side
// on the game's first screen, so no extra round-trip on switch.
// No league switcher, no GamesSubnav — 12-0 is a standalone sub-app.

import { AppRail } from '@/components/app-rail';
import { TwelveOhGame } from '@/components/twelve-oh/twelve-oh-game';
import { listTeamYears } from '@/lib/twelve-oh/data';
import { listPulTeams } from '@/lib/pul/data';
import {
  ufaTeamDisplayMap,
  pulTeamDisplayMap,
  wulTeamDisplayMap,
  type LeagueTeamDisplayMaps,
} from '@/lib/twelve-oh/team-display';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '12-0 · The Layout',
  description:
    'Spin for a team and season — UFA, PUL, or WUL. Draft 7 players. Can you go 12-0?',
};

// Render at request time, not build time. This page reads from Supabase
// (listTeamYears); static prerender would query the DB during `next build`,
// which fails the build whenever Supabase isn't reachable at build time (e.g. a
// fresh deploy before env vars are configured). Dynamic = data is always live.
export const dynamic = 'force-dynamic';

export default async function TwelveOhPage() {
  const [ufa, pul, wul, pulTeams] = await Promise.all([
    listTeamYears('ufa'),
    listTeamYears('pul'),
    listTeamYears('wul'),
    listPulTeams(),
  ]);

  const teamDisplay: LeagueTeamDisplayMaps = {
    ufa: ufaTeamDisplayMap(),
    pul: pulTeamDisplayMap(pulTeams),
    wul: wulTeamDisplayMap(),
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-bg text-ink">
      <AppRail />
      <main className="flex-1 flex flex-col">
        <TwelveOhGame
          teamYearsByLeague={{ ufa, pul, wul }}
          teamDisplay={teamDisplay}
        />
      </main>
    </div>
  );
}

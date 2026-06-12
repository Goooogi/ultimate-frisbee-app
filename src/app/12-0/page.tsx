// /12-0 — UFA draft mini-game.
// Server component: loads the spin pool once and passes it to the client game.
// No league switcher, no GamesSubnav — 12-0 is a standalone sub-app.

import { AppRail } from '@/components/app-rail';
import { TwelveOhGame } from '@/components/twelve-oh/twelve-oh-game';
import { listTeamYears } from '@/lib/twelve-oh/data';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '12-0 · The Layout',
  description: 'Spin for a UFA team and season. Draft 7 players. Can you go 12-0?',
};

// Render at request time, not build time. This page reads from Supabase
// (listTeamYears); static prerender would query the DB during `next build`,
// which fails the build whenever Supabase isn't reachable at build time (e.g. a
// fresh deploy before env vars are configured). Dynamic = data is always live.
export const dynamic = 'force-dynamic';

export default async function TwelveOhPage() {
  const teamYears = await listTeamYears();

  return (
    <div className="min-h-[100dvh] flex flex-col bg-bg text-ink">
      <AppRail />
      <main className="flex-1 flex flex-col">
        <TwelveOhGame teamYears={teamYears} />
      </main>
    </div>
  );
}

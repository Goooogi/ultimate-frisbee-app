// /fantasy — Fantasy hub. Server Component, public + ISR. Sleeper-style
// front door: My Leagues → Mini Games → Start a League, with a "+ Play"
// menu (create / join) in the header. Replaces the old "pick a game" card
// grid — game selection now happens inside league creation (Start a League /
// create-league form), not as the hub's primary landing.
// Port of the mobile app's fantasy hub (altiusapps/mobileapp-thelayout ·
// app/(app)/fantasy/index.tsx). See vault: Features/Fantasy V2 — Game Hub.

import { PageShell } from '@/components/page-shell';
import { PlayMenu } from '@/components/fantasy/play-menu';
import { MyLeaguesList } from '@/components/fantasy/my-leagues-list';
import { MiniGamesTile } from '@/components/fantasy/mini-games-tile';
import { StartALeagueList } from '@/components/fantasy/start-a-league-list';
import { hubGames } from '@/lib/fantasy/games';
import { getGameStartDates, sortGamesBySoonest } from '@/lib/fantasy/game-dates';
import { getGlobalContest } from '@/lib/fantasy/leagues';
import { fantasySeasonYear } from '@/lib/fantasy/data';

export const revalidate = 60;

export default async function FantasyHubPage() {
  const starts = await getGameStartDates();
  const orderedGames = sortGamesBySoonest(hubGames(), starts);
  const globalContest = await getGlobalContest('ufa', fantasySeasonYear()).catch(() => null);

  return (
    <PageShell title="Fantasy Ultimate" titleSize="compact" controls={<PlayMenu />} hideFooterMobile>
      <MyLeaguesList globalContest={globalContest} />
      <MiniGamesTile />
      <StartALeagueList games={orderedGames} starts={starts} />
    </PageShell>
  );
}

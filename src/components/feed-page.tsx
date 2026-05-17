'use client';

// /scores body — today's slate inside the unified AppShell.
// One layout regardless of theme; CSS variables handle the light/dark swap.
// The league switcher lives in the AppShell's top bar.

import { gameUiState } from '@/lib/ufa/format';
import type { UfaGame } from '@/lib/ufa/types';
import type { Today } from '@/lib/today';
import { GameCard } from '@/components/game-card';
import { FeedHero } from '@/components/feed-hero';
import { AppShell } from '@/components/page-shell';

interface FeedPageProps {
  games: UfaGame[];
  today: Today;
}

export function FeedPage({ games, today }: FeedPageProps) {
  const counts = gameCounts(games);

  return (
    <AppShell>
      <div className="px-5 pt-4 pb-12 lg:px-14 lg:pt-8 lg:pb-14 lg:max-w-[1080px] lg:mx-auto">
        <div className="flex justify-between items-end mb-5 lg:mb-7 gap-6">
          <FeedHero counts={counts} today={today} desktop />
          <LiveBadge counts={counts} />
        </div>

        <div className="flex items-center gap-2 mb-5 lg:mb-7">
          <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight">
            {badgeText(counts)}
          </span>
          <span className="mx-1.5 text-faint">·</span>
          <span className="text-[10px] font-semibold tracking-[0.1em] text-faint uppercase font-tight">
            Auto-refresh · 30s
          </span>
        </div>

        {games.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 lg:gap-3.5">
            {games.map((g) => (
              <GameCard key={g.gameID} game={g} />
            ))}
          </div>
        ) : (
          <EmptyState />
        )}
      </div>
    </AppShell>
  );
}

export interface GameCounts {
  total: number;
  live: number;
  upcoming: number;
  final: number;
}

function gameCounts(games: UfaGame[]): GameCounts {
  let live = 0, upcoming = 0, final = 0;
  for (const g of games) {
    const s = gameUiState(g);
    if (s.isLive) live++;
    else if (s.isFinal) final++;
    else upcoming++;
  }
  return { total: games.length, live, upcoming, final };
}

function badgeText(c: GameCounts): string {
  if (c.live > 0) return `Live · ${c.live}`;
  if (c.total > 0) return `Today · ${c.total}`;
  return 'No games today';
}

function LiveBadge({ counts }: { counts: GameCounts }) {
  if (counts.live > 0) {
    return (
      <div className="flex items-center gap-2 flex-shrink-0 pb-1">
        <span className="w-[7px] h-[7px] rounded-full bg-live flex-shrink-0" aria-hidden="true" />
        <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-live font-tight">
          {counts.live} live
        </span>
      </div>
    );
  }
  if (counts.total > 0) {
    return (
      <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-muted font-tight pb-1">
        {counts.upcoming} upcoming
      </span>
    );
  }
  return null;
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center bg-surface border border-border">
      <div className="text-[14px] font-semibold uppercase tracking-[0.18em] text-muted mb-2">
        No games today
      </div>
      <div className="text-[13px] text-faint max-w-sm">
        The UFA isn&rsquo;t showing anything on the slate right now.
        Check back during the regular season (April&ndash;August).
      </div>
    </div>
  );
}

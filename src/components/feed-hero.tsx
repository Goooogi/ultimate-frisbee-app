'use client';

// Unified hero for /scores ("Today.") — single layout for both themes.
// Per the chrome merge, the broadcast "NEXT 01" treatment was retired in
// favor of the light-mode "Today." headline. Theme tokens swap via CSS vars.

import type { GameCounts } from '@/components/feed-page';
import type { Today } from '@/lib/today';

interface FeedHeroProps {
  counts: GameCounts;
  today: Today;
  desktop?: boolean;
}

export function FeedHero({ counts, today, desktop = false }: FeedHeroProps) {
  if (desktop) {
    return (
      <div>
        <div className="text-[11px] font-bold tracking-[0.18em] uppercase text-muted mb-2 font-tight tabular">
          {today.weekday} · {today.month} {today.day} · {today.year}
        </div>
        <h1 className="text-[56px] font-bold tracking-[-0.04em] text-ink leading-none font-tight m-0">
          Today.
        </h1>
        <p className="text-[15px] text-muted font-medium mt-2.5 font-tight">
          {subline(counts)} Tap any card to follow.
        </p>
      </div>
    );
  }

  return (
    <div className="px-5 pt-3.5 pb-2">
      <div className="text-[40px] font-bold tracking-[-0.04em] text-ink leading-none font-tight">
        Today.
      </div>
      <div className="text-[14px] text-muted font-medium mt-1.5 font-tight">
        {subline(counts)}
      </div>
    </div>
  );
}

function subline(c: GameCounts): string {
  if (c.total === 0) return 'No games on the field today.';
  if (c.live > 0 && c.upcoming > 0) return `${c.live} live · ${c.upcoming} upcoming this week.`;
  if (c.live > 0) return `${c.live} ${c.live === 1 ? 'game' : 'games'} live across the league.`;
  if (c.upcoming > 0) return `${c.upcoming} ${c.upcoming === 1 ? 'game' : 'games'} coming up this week.`;
  return `${c.final} ${c.final === 1 ? 'final' : 'finals'} from today.`;
}

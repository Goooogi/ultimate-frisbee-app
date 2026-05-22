'use client';

// /scores body — today's slate inside the unified AppShell.
// One layout regardless of theme; CSS variables handle the light/dark swap.
// The league switcher lives in the AppShell's top bar and is now controlled
// from here so changing leagues swaps the content (UFA games ↔ USAU events).

import { Suspense } from 'react';
import Link from 'next/link';
import { gameUiState } from '@/lib/ufa/format';
import type { UfaGame } from '@/lib/ufa/types';
import type { Today } from '@/lib/today';
import { GameCard } from '@/components/game-card';
import { FeedHero } from '@/components/feed-hero';
import { AppShell } from '@/components/page-shell';
import { LeagueTabs } from '@/components/league-tabs';
import { UsauEventDetail } from '@/components/usau/usau-event-detail';
import type { UsauEventSummary } from '@/lib/usau/data';
import { useLeague } from '@/lib/use-league';

interface FeedPageProps {
  games: UfaGame[];
  today: Today;
  usauEvent: UsauEventSummary | null;
}

// Suspense wraps the useLeague() call so Next 14 can statically
// prerender /scores without bailing the whole tree to CSR.
export function FeedPage(props: FeedPageProps) {
  return (
    <Suspense fallback={null}>
      <FeedPageInner {...props} />
    </Suspense>
  );
}

function FeedPageInner({ games, today, usauEvent }: FeedPageProps) {
  // League state lives in ?league= — see lib/use-league.ts. Switching tabs
  // updates the URL so /scores → /teams → /scores remembers the choice.
  const [league, setLeague] = useLeague();
  const counts = gameCounts(games);

  return (
    <AppShell topNavSlot={<LeagueTabs active={league} onChange={setLeague} />}>
      <div className="px-5 pt-4 pb-12 lg:px-14 lg:pt-8 lg:pb-14 lg:max-w-[1080px] lg:mx-auto">
        {league === 'ufa' ? (
          <UfaFeed games={games} today={today} counts={counts} />
        ) : league === 'usau' ? (
          <UsauFeed event={usauEvent} />
        ) : null}
      </div>
    </AppShell>
  );
}

function UfaFeed({
  games,
  today,
  counts,
}: {
  games: UfaGame[];
  today: Today;
  counts: GameCounts;
}) {
  return (
    <>
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
    </>
  );
}

function UsauFeed({ event }: { event: UsauEventSummary | null }) {
  if (!event) {
    return (
      <>
        <div className="flex flex-col gap-1 mb-5 lg:mb-7">
          <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-accent font-tight">
            USAU Club · Open
          </span>
          <h1 className="m-0 font-display italic font-bold text-[36px] lg:text-[44px] leading-[0.95] tracking-[-0.04em] text-ink">
            No tournament available
          </h1>
          <p className="text-[13px] text-muted font-tight max-w-[600px]">
            Check back when the next sanctioned event is on the calendar.
            Browse{' '}
            <Link href="/schedule?league=usau" className="text-accent hover:underline">
              the schedule
            </Link>{' '}
            for upcoming + past tournaments.
          </p>
        </div>
      </>
    );
  }

  const now = Date.now();
  const startMs = event.startDate ? new Date(event.startDate + 'T00:00:00').getTime() : null;
  const endMs = event.endDate ? new Date(event.endDate + 'T23:59:59').getTime() : null;
  const isLive = startMs != null && endMs != null && startMs <= now && now <= endMs;
  const isUpcoming = startMs != null && startMs > now;
  const eyebrowState = isLive ? 'Live now' : isUpcoming ? 'Upcoming' : 'Most recent';
  const dateRange = formatEventDates(event.startDate, event.endDate);

  return (
    <>
      <div className="flex flex-col gap-1 mb-5 lg:mb-7">
        <span
          className={[
            'text-[10px] font-bold tracking-[0.18em] uppercase font-tight',
            isLive ? 'text-live' : 'text-accent',
          ].join(' ')}
        >
          USAU Club · {eyebrowState}
        </span>
        <h1 className="m-0 font-display italic font-bold text-[36px] lg:text-[44px] leading-[0.95] tracking-[-0.04em] text-ink">
          <Link href={`/usau/events/${event.slug}`} className="hover:text-accent transition-colors no-underline">
            {event.name}
          </Link>
        </h1>
        <p className="text-[13px] text-muted font-tight max-w-[600px]">
          {dateRange}
          {dateRange && (event.city || event.state) && ' · '}
          {[event.city, event.state].filter(Boolean).join(', ')}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-8 pb-6 border-b border-hairline">
        <UsauChip label="Teams" value={event.teams.length} />
        <UsauChip label="Games" value={event.games.length} />
        <Link
          href={`/schedule?league=usau`}
          className="ml-auto text-[10px] font-bold tracking-[0.16em] uppercase text-muted font-tight hover:text-ink transition-colors no-underline"
        >
          All tournaments →
        </Link>
      </div>

      <UsauEventDetail event={event} />
    </>
  );
}

function UsauChip({ label, value }: { label: string; value: string | number }) {
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

function formatEventDates(start: string | null, end: string | null): string {
  if (!start) return '';
  const s = new Date(start + 'T00:00:00');
  const sLabel = s.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  if (!end || end === start) return sLabel;
  const e = new Date(end + 'T00:00:00');
  const eLabel = e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${sLabel} – ${eLabel}`;
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

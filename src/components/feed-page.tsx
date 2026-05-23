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
import { UsauEventDetail } from '@/components/usau/usau-event-detail';
import { UsauDivisionSelect } from '@/components/usau/usau-division-select';
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
  // League state lives in ?league= — see lib/use-league.ts. We don't pass
  // a topNavSlot so AppShell's default renders: pill tabs on desktop, a
  // dropdown on mobile. Both write to the same useLeague() state via the
  // URL so changing it anywhere updates this component on next render.
  const [league] = useLeague();
  const counts = gameCounts(games);

  return (
    <AppShell>
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
        <div className="flex items-center justify-between gap-3 mb-5">
          <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-accent font-tight">
            USAU
          </span>
          <UsauDivisionSelect />
        </div>
        <div className="flex flex-col gap-1 mb-5 lg:mb-7">
          <h1 className="m-0 font-display italic font-bold text-[36px] lg:text-[44px] leading-[0.95] tracking-[-0.04em] text-ink">
            No tournament available
          </h1>
          <p className="text-[13px] text-muted font-tight max-w-[600px]">
            Try a different division above, or browse{' '}
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
  const levelLabel = prettyLevel(event.competitionLevel);
  // "Bracket-pending" state: the event is live or upcoming AND we don't
  // have games scraped yet. USAU sometimes publishes the bracket only on
  // the morning of the tournament — show a friendly placeholder until
  // our cron picks it up.
  const noGamesYet = event.games.length === 0;
  const showBracketPending = noGamesYet && (isLive || isUpcoming);

  return (
    <>
      <div className="flex flex-col gap-1 mb-5 lg:mb-7">
        <span
          className={[
            'text-[10px] font-bold tracking-[0.18em] uppercase font-tight',
            isLive ? 'text-live' : 'text-accent',
          ].join(' ')}
        >
          USAU {levelLabel} · {eyebrowState}
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
        <div className="ml-auto flex items-center gap-3">
          <UsauDivisionSelect />
          <Link
            href={`/schedule?league=usau`}
            className="text-[10px] font-bold tracking-[0.16em] uppercase text-muted font-tight hover:text-ink transition-colors no-underline"
          >
            All tournaments →
          </Link>
        </div>
      </div>

      {showBracketPending ? (
        <BracketPending event={event} isLive={isLive} />
      ) : (
        <UsauEventDetail event={event} />
      )}
    </>
  );
}

function BracketPending({
  event,
  isLive,
}: {
  event: UsauEventSummary;
  isLive: boolean;
}) {
  return (
    <div className="bg-surface border border-border rounded-md p-6 flex flex-col gap-3">
      <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-accent font-tight">
        {isLive ? 'Bracket pending' : 'Bracket not yet published'}
      </div>
      <p className="text-[14px] text-ink font-tight leading-relaxed max-w-[640px]">
        {event.teams.length > 0
          ? `${event.teams.length} ${event.teams.length === 1 ? 'team is' : 'teams are'} in the field, but USAU hasn't published the schedule yet.`
          : "We've seen the event but USAU hasn't posted teams or the bracket yet."}
        {' '}
        We re-check every few minutes during live tournaments — refresh later to see scores roll in.
      </p>
      <div className="flex items-center gap-3 pt-1">
        <a
          href={`https://play.usaultimate.org/events/${event.slug}/`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-[0.14em] uppercase text-accent hover:underline font-tight no-underline"
        >
          View on USAU
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M4 2h6v6M10 2L4 8M2 4v6h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </a>
      </div>
    </div>
  );
}

function prettyLevel(level: string): string {
  switch (level) {
    case 'CLUB': return 'Club';
    case 'COLLEGE_D1': return 'College · D-I';
    case 'COLLEGE_D3': return 'College · D-III';
    case 'MASTERS': return 'Masters';
    case 'GRAND_MASTERS': return 'Grand Masters';
    default: return level;
  }
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

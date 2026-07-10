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
import { UsauMajorGrid } from '@/components/home/multi-league-grid-section';
import type { UsauMajorWithChampions } from '@/lib/usau/data';
import { useLeague } from '@/lib/use-league';
import { buildLeagueQs, levelLabel, type UsauLevel } from '@/lib/league';
import { UsauLevelSelect } from '@/components/usau/usau-level-select';

interface FeedPageProps {
  games: UfaGame[];
  today: Today;
  usauCards: UsauMajorWithChampions[];
  /** Active USAU competition level (cards are pre-filtered server-side). */
  usauLevel: UsauLevel;
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

function FeedPageInner({ games, today, usauCards, usauLevel }: FeedPageProps) {
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
          <UsauFeed cards={usauCards} level={usauLevel} />
        ) : league === 'pul' ? (
          <PulComingSoon page="scores" />
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
        <span className="text-[10.5px] font-bold tracking-[0.18em] uppercase text-muted font-sans">
          {badgeText(counts)}
        </span>
        <span className="mx-1.5 text-faint">·</span>
        <span className="text-[10.5px] font-semibold tracking-[0.1em] text-faint uppercase font-sans">
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

// USAU scores landing: recent (last ~2 weekends) FLAGSHIP tournaments as cards,
// each showing per-division champions. Clicking a card opens the full event
// detail (games/pools/bracket) at /usau/events/[slug]. This "results overview"
// replaced the old single-auto-picked-tournament view so we can show winners
// across every division without choosing just one event.
function UsauFeed({ cards, level }: { cards: UsauMajorWithChampions[]; level: UsauLevel }) {
  // Carry the active level into the schedule links so the division context
  // survives the hop (buildLeagueQs omits the default CLUB for clean URLs;
  // league=usau is always non-default so the qs is never empty).
  const scheduleHref = `/schedule${buildLeagueQs('usau', null, level)}`;
  return (
    <>
      <div className="flex items-end justify-between gap-4 mb-5 lg:mb-7">
        <div className="flex flex-col gap-2">
          <span className="text-[10.5px] font-bold tracking-[0.18em] uppercase text-accent font-sans">
            USAU · {levelLabel(level)} · Recent Results
          </span>
          <h1 className="m-0 font-display italic font-bold text-[32px] lg:text-[40px] leading-[0.95] tracking-[-0.02em] text-ink">
            Recent Tournaments
          </h1>
        </div>
        <div className="flex-shrink-0 flex items-center gap-3">
          <UsauLevelSelect />
          <Link
            href={scheduleHref}
            className="flex-shrink-0 text-[11px] font-bold tracking-[0.12em] uppercase text-muted hover:text-accent transition-colors no-underline inline-flex items-center gap-1.5"
          >
            All tournaments
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 8H13M13 8L8.5 3.5M13 8L8.5 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
            </svg>
          </Link>
        </div>
      </div>

      {cards.length > 0 ? (
        <UsauMajorGrid majors={cards} fill />
      ) : (
        <div className="rounded-card-lg bg-surface shadow-card p-10 text-center">
          <p className="text-[14px] text-muted font-tight">
            No completed {levelLabel(level)} tournaments in the last couple of weekends yet.
          </p>
          <Link
            href={scheduleHref}
            className="inline-flex items-center gap-1.5 mt-3 text-accent font-tight text-[13px] font-bold hover:opacity-80 transition-opacity"
          >
            Browse the schedule →
          </Link>
        </div>
      )}
    </>
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
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center bg-surface rounded-card-lg shadow-card">
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

function PulComingSoon({ page }: { page: 'scores' | 'schedule' }) {
  const label = page === 'scores' ? 'game scores' : 'schedule';
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <div className="text-[10.5px] font-bold tracking-[0.18em] uppercase text-accent font-sans mb-3">
        PUL · Premier Ultimate League
      </div>
      <div className="text-[18px] font-bold font-tight text-ink mb-2 leading-tight">
        {page === 'scores' ? 'Game scores coming soon' : 'Schedule coming soon'}
      </div>
      <div className="text-[13px] text-muted font-tight max-w-[480px] leading-relaxed">
        PUL {label} aren&rsquo;t available yet. Player and team stats are available now under{' '}
        <Link href="/teams?league=pul" className="text-ink underline underline-offset-2 hover:text-accent transition-colors">
          Teams
        </Link>{' '}
        and{' '}
        <Link href="/players?league=pul" className="text-ink underline underline-offset-2 hover:text-accent transition-colors">
          Players
        </Link>.
      </div>
    </div>
  );
}

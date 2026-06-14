// /schedule — past, present, and future UFA games grouped by week.
// Server Component. Reads ?year=YYYY from searchParams.
//
// Display order: current week (expanded by default), upcoming weeks (collapsed),
// then prior weeks (collapsed). The native <details> elements keep this fully
// server-rendered — no client component needed for collapse state.

import type { Metadata } from 'next';
import { getCurrentGames, getAllGamesByYears, currentSeasonYear } from '@/lib/ufa/client';
import type { UfaGame } from '@/lib/ufa/types';
import { PageShell } from '@/components/page-shell';
import { GameCard } from '@/components/game-card';
import { YearSelector } from '@/components/year-selector';
import { parseDivisionParam, parseLeagueParam, parseLevelParam, levelLabel } from '@/lib/league';
import { UsauSchedule } from '@/components/usau/usau-schedule';
import { UsauScheduleControls } from '@/components/usau/usau-schedule-controls';
import { PulSchedule } from '@/components/pul/pul-schedule';
import { PUL_CURRENT_SEASON } from '@/lib/pul/data';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Schedule · The Layout',
};

interface Props {
  searchParams: { year?: string; season?: string; league?: string; div?: string; level?: string };
}

export default async function SchedulePage({ searchParams }: Props) {
  const league = parseLeagueParam(searchParams.league);

  if (league === 'pul') {
    const season = parseInt(searchParams.season ?? String(PUL_CURRENT_SEASON), 10) || PUL_CURRENT_SEASON;
    return (
      <PageShell
        title="Schedule"
        eyebrow={`PUL · ${season} Season`}
      >
        <PulSchedule season={season} />
      </PageShell>
    );
  }

  if (league === 'usau') {
    const level = parseLevelParam(searchParams.level);
    // Division is OPTIONAL on the schedule: absent ?div ⇒ show all divisions
    // (and events without scraped teams). Only narrow when a div is present.
    const division = searchParams.div ? parseDivisionParam(searchParams.div) : undefined;
    const eyebrow = `USAU · ${levelLabel(level)}${division ? ` · ${division}` : ''}`;
    return (
      <PageShell
        title="Schedule"
        eyebrow={eyebrow}
        controls={<UsauScheduleControls />}
      >
        <UsauSchedule competitionLevel={level} division={division} />
      </PageShell>
    );
  }

  const currentYear = currentSeasonYear();
  const year = parseInt(searchParams.year ?? String(currentYear), 10) || currentYear;
  const isCurrentSeason = year === currentYear;

  // Fetch games for the selected year; overlay live data for current season.
  let games: UfaGame[] = [];
  try {
    const [seasonGames, liveGames] = await Promise.all([
      getAllGamesByYears([year]),
      isCurrentSeason ? getCurrentGames() : Promise.resolve<UfaGame[]>([]),
    ]);

    // Dedupe by gameID — live data wins for current-season games.
    const byId = new Map<string, UfaGame>();
    for (const g of seasonGames) byId.set(g.gameID, g);
    for (const g of liveGames) byId.set(g.gameID, g); // overwrite with richer live fields
    games = Array.from(byId.values());
  } catch (err) {
    console.error('Failed to fetch schedule:', err);
  }

  // Group by week, then split into current / upcoming / prior based on today.
  const weekGroups = groupByWeek(games);
  const currentWeekLabel = pickCurrentWeek(games, Date.now());
  const { current, upcoming, prior } = partitionWeeks(weekGroups, currentWeekLabel);

  return (
    <PageShell
      title="Schedule"
      eyebrow={`UFA · ${year} Season`}
      controls={<YearSelector currentYear={year} />}
    >
      {weekGroups.length === 0 ? (
        <EmptyState year={year} />
      ) : (
        <div className="flex flex-col gap-8">
          {current && <WeekSection group={current} eyebrow="This week" emphasized />}

          {upcoming.length > 0 && (
            <CollapsibleWeeks
              summary={`Upcoming weeks · ${upcoming.length}`}
              groups={upcoming}
            />
          )}

          {prior.length > 0 && (
            <CollapsibleWeeks
              summary={`Prior weeks · ${prior.length}`}
              groups={prior}
            />
          )}
        </div>
      )}
    </PageShell>
  );
}

function WeekSection({
  group,
  eyebrow,
  emphasized,
}: {
  group: WeekGroup;
  eyebrow?: string;
  emphasized?: boolean;
}) {
  const id = `week-${group.label}`;
  return (
    <section aria-labelledby={id}>
      <div
        id={id}
        className={[
          'flex items-baseline justify-between gap-3 mb-3 pb-2 border-b',
          emphasized ? 'border-ink' : 'border-hairline',
        ].join(' ')}
      >
        <span
          className={[
            'text-[10px] font-bold tracking-[0.18em] uppercase font-tight',
            emphasized ? 'text-ink' : 'text-muted',
          ].join(' ')}
        >
          {formatWeekLabel(group.label)}
        </span>
        {eyebrow && (
          <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-accent font-tight">
            {eyebrow}
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 md:gap-3">
        {group.games.map((g) => (
          <GameCard key={g.gameID} game={g} />
        ))}
      </div>
    </section>
  );
}

function CollapsibleWeeks({
  summary,
  groups,
}: {
  summary: string;
  groups: WeekGroup[];
}) {
  return (
    <details className="group">
      <summary
        className={[
          'list-none cursor-pointer flex items-center justify-between gap-3',
          'py-3 px-4 border border-border bg-surface hover:border-ink transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        ].join(' ')}
      >
        <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-ink font-tight">
          {summary}
        </span>
        <span className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[0.16em] uppercase text-muted font-tight group-hover:text-ink transition-colors">
          <span className="group-open:hidden">Show</span>
          <span className="hidden group-open:inline">Hide</span>
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="transition-transform duration-150 group-open:rotate-180"
          >
            <path d="M2 4l3 3 3-3" />
          </svg>
        </span>
      </summary>
      <div className="flex flex-col gap-8 mt-5">
        {groups.map((g) => (
          <WeekSection key={g.label} group={g} />
        ))}
      </div>
    </details>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

interface WeekGroup {
  label: string;
  sortKey: string;
  games: UfaGame[];
}

function groupByWeek(games: UfaGame[]): WeekGroup[] {
  const map = new Map<string, UfaGame[]>();

  for (const g of games) {
    const key = g.week ?? 'unscheduled';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(g);
  }

  // Sort each week's games by startTimestamp ascending.
  const groups: WeekGroup[] = [];
  for (const [label, weekGames] of map) {
    weekGames.sort((a, b) => {
      const ta = a.startTimestamp ? new Date(a.startTimestamp).getTime() : Infinity;
      const tb = b.startTimestamp ? new Date(b.startTimestamp).getTime() : Infinity;
      return ta - tb;
    });
    groups.push({ label, sortKey: weekSortKey(label), games: weekGames });
  }

  // Sort weeks ascending by sortKey so prior weeks come first chronologically;
  // the page-level partition then peels them into prior / current / upcoming.
  // "unscheduled" is pinned to the bottom regardless.
  groups.sort((a, b) => {
    if (a.label === 'unscheduled') return 1;
    if (b.label === 'unscheduled') return -1;
    return a.sortKey.localeCompare(b.sortKey);
  });
  return groups;
}

/**
 * Picks the "current" week label for this schedule view.
 * Strategy:
 *   1. The week containing the next-upcoming or in-progress game (start >= today).
 *      We include games up to 12h in the past so a game-in-progress still counts.
 *   2. If every game is in the past (offseason), the most recent week.
 *   3. If there are no timestamped games at all, null.
 */
function pickCurrentWeek(games: UfaGame[], nowMs: number): string | null {
  const cutoff = nowMs - 12 * 60 * 60 * 1000;
  const withTs = games.filter((g) => g.startTimestamp && g.week);

  let upcoming: UfaGame | undefined;
  let upcomingMs = Infinity;
  let mostRecent: UfaGame | undefined;
  let mostRecentMs = -Infinity;

  for (const g of withTs) {
    const t = new Date(g.startTimestamp!).getTime();
    if (t >= cutoff && t < upcomingMs) {
      upcoming = g;
      upcomingMs = t;
    }
    if (t < cutoff && t > mostRecentMs) {
      mostRecent = g;
      mostRecentMs = t;
    }
  }

  return upcoming?.week ?? mostRecent?.week ?? null;
}

/**
 * Splits the (ascending-sorted) week groups around `currentWeekLabel`.
 * `unscheduled` is treated as a bottom-of-prior bucket so it stays out of the
 * way but is still findable.
 */
function partitionWeeks(
  groups: WeekGroup[],
  currentWeekLabel: string | null,
): { current: WeekGroup | null; upcoming: WeekGroup[]; prior: WeekGroup[] } {
  if (!currentWeekLabel) return { current: null, upcoming: [], prior: [...groups].reverse() };

  const currentKey = weekSortKey(currentWeekLabel);
  let current: WeekGroup | null = null;
  const upcoming: WeekGroup[] = [];
  const prior: WeekGroup[] = [];

  for (const g of groups) {
    if (g.label === currentWeekLabel) {
      current = g;
    } else if (g.label === 'unscheduled') {
      prior.push(g);
    } else if (g.sortKey > currentKey) {
      upcoming.push(g);
    } else {
      prior.push(g);
    }
  }

  // Upcoming earliest-first (next up at the top of the accordion).
  upcoming.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  // Prior most-recent-first (last week at the top of the accordion).
  prior.sort((a, b) => {
    if (a.label === 'unscheduled') return 1;
    if (b.label === 'unscheduled') return -1;
    return b.sortKey.localeCompare(a.sortKey);
  });
  return { current, upcoming, prior };
}

/** Makes "week-4" sort before "week-10". */
function weekSortKey(label: string): string {
  if (label === 'unscheduled') return 'z-unscheduled';
  const n = parseInt(label.replace(/\D/g, ''), 10);
  return isNaN(n) ? label : `week-${String(n).padStart(3, '0')}`;
}

function formatWeekLabel(label: string): string {
  if (label === 'unscheduled') return 'Unscheduled';
  const n = parseInt(label.replace(/\D/g, ''), 10);
  if (!isNaN(n)) return `Week ${n}`;
  return label.replace(/-/g, ' ');
}

function EmptyState({ year }: { year: number }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center bg-surface border border-border">
      <div className="text-[14px] font-semibold uppercase tracking-[0.18em] text-muted mb-2 font-tight">
        No games scheduled
      </div>
      <div className="text-[13px] text-faint max-w-sm">
        No games scheduled for the {year} season yet. Check back during the regular season.
      </div>
    </div>
  );
}

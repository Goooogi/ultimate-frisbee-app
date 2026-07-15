'use client';

// USAU schedule view — tournaments ordered by date relative to today.
//
// Layout:
//   - "Upcoming" section: events whose start_date is today or later,
//     soonest first. Always expanded.
//   - "Prior" section: events that already happened, most-recent first.
//     Collapsed by default.
//
// We default to the latest season but show a season pill row so users
// can browse the archive.

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { listEvents, listSeasons, type UsauEventCard, type CompetitionLevel } from '@/lib/usau/data';
import { FLIGHT_LABELS, type Flight } from '@/lib/usau/flights';
import type { UsauDivision } from '@/lib/league';

interface Props {
  /** Optional gender division filter. When omitted, all divisions show
   *  (and events without scraped teams still appear). */
  division?: UsauDivision;
  /** Competition level to list (Club, College D-I, etc.). Required so the
   *  schedule shows the full calendar for that level, not just events that
   *  happen to have teams scraped. */
  competitionLevel?: CompetitionLevel;
  /** Optional curated Triple Crown Tour flight filter (Club only), multi-select.
   *  Empty ⇒ all flights. */
  flights?: Flight[];
}

export function UsauSchedule({ division, competitionLevel, flights = [] }: Props = {}) {
  // Serialize for a stable useEffect dep (array identity changes each render).
  const flightsKey = flights.join(',');
  const searchParams = useSearchParams();
  const [seasons, setSeasons] = useState<number[]>([]);
  const [events, setEvents] = useState<UsauEventCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Season is URL-driven (?season=YYYY) so its control can live in the page
  // header controls row (above the other filters on mobile) and persist/share
  // via the URL. Falls back to the latest available season when ?season is
  // absent or not in the list.
  const seasonParam = Number(searchParams.get('season'));
  const season =
    Number.isInteger(seasonParam) && seasons.includes(seasonParam)
      ? seasonParam
      : (seasons[0] ?? null);

  useEffect(() => {
    let cancelled = false;
    listSeasons()
      .then((s) => {
        if (cancelled) return;
        setSeasons(s);
      })
      .catch((err) =>
        !cancelled && setError(err instanceof Error ? err.message : 'Failed to load seasons.'),
      );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (season == null) return;
    setLoading(true);
    let cancelled = false;
    // Filter to the selected competition level (default Club) so we show the
    // FULL calendar for that level — including events whose teams aren't
    // scraped yet. genderDivision is optional: when undefined, every event at
    // the level shows; when set, it narrows to events with scraped teams in
    // that division (the only ones we can attribute a gender to).
    listEvents({ season, limit: 1000, genderDivision: division, competitionLevel, flights })
      .then((e) => !cancelled && setEvents(e))
      .catch((err) =>
        !cancelled && setError(err instanceof Error ? err.message : 'Failed to load events.'),
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // flightsKey (serialized) is the stable dep — `flights` array identity changes each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season, division, competitionLevel, flightsKey]);

  const { upcoming, prior } = useMemo(() => partitionByDate(events), [events]);

  if (error) {
    return (
      <div className="text-[12px] font-medium font-tight text-live bg-live/10 border border-live/30 rounded px-3 py-2">
        {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">

      {loading && events.length === 0 ? (
        <div className="text-[12px] text-faint font-tight">Loading events…</div>
      ) : events.length === 0 ? (
        <div className="text-[12px] text-faint font-tight">
          No events for {season ?? 'this season'}.
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {upcoming.length > 0 && (
            <Section
              eyebrow="Upcoming"
              count={upcoming.length}
              events={upcoming}
              defaultOpen
              emphasized
            />
          )}
          {prior.length > 0 && (
            <Section
              eyebrow="Prior"
              count={prior.length}
              events={prior}
              defaultOpen={upcoming.length === 0}
            />
          )}
        </div>
      )}
    </div>
  );
}

function Section({
  eyebrow,
  count,
  events,
  defaultOpen,
  emphasized,
}: {
  eyebrow: string;
  count: number;
  events: UsauEventCard[];
  defaultOpen: boolean;
  emphasized?: boolean;
}) {
  // Both sections are collapsible. The section header itself is the toggle, so
  // the open state looks identical to before (header rule + card grid) — only
  // now the header is clickable to collapse. `defaultOpen` preserves the prior
  // defaults: Upcoming open, Prior collapsed (unless there's no Upcoming).
  return (
    <details className="group" open={defaultOpen}>
      <summary
        className={[
          'list-none cursor-pointer select-none',
          'flex items-baseline justify-between gap-3 mb-4 pb-2 border-b border-hairline',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        ].join(' ')}
      >
        <span className="flex items-center gap-2">
          <Chevron />
          <span
            className={[
              'text-[10px] font-bold tracking-[0.18em] uppercase font-tight',
              emphasized ? 'text-ink' : 'text-muted',
            ].join(' ')}
          >
            {eyebrow}
          </span>
        </span>
        <span className="text-[10px] font-bold tracking-[0.16em] uppercase text-accent font-tight">
          {count} {count === 1 ? 'tournament' : 'tournaments'}
        </span>
      </summary>
      <ul className="grid grid-cols-1 md:grid-cols-2 gap-2.5 lg:gap-3">
        {events.map((e) => (
          <EventCard key={e.id} event={e} />
        ))}
      </ul>
    </details>
  );
}

function EventCard({ event }: { event: UsauEventCard }) {
  const dateRange = formatDates(event.startDate, event.endDate);
  const location = [event.city, event.state].filter(Boolean).join(', ');
  const past =
    event.endDate != null &&
    new Date(event.endDate + 'T00:00:00').getTime() < Date.now();
  const level = prettyLevel(event.competitionLevel);

  // The card itself navigates to our event detail. The "USAU" pill is a
  // separate external link, so it sits OUTSIDE the Next <Link> (no nested <a>)
  // — as a footer row in normal flow (NOT absolutely positioned) so it can
  // never overlap a 2-line title/location, and every card fills its grid
  // cell's full height so rows stay even.
  return (
    <li className="h-full">
      <div
        className={[
          'group/card relative flex h-full flex-col bg-surface rounded-card p-4 transition-shadow shadow-card hover:shadow-lift',
          past ? 'opacity-75' : '',
        ].join(' ')}
      >
        <Link
          href={`/usau/events/${event.slug}`}
          className="flex flex-col flex-1 no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface rounded-card-sm"
        >
          <div className="flex items-center justify-between gap-3 mb-2">
            <span className="flex items-center gap-2 min-w-0">
              <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-faint font-tight truncate">
                {level}
              </span>
              {event.flight && (
                <span className="shrink-0 text-[9px] font-bold tracking-[0.14em] uppercase font-tight text-accent bg-accent/10 rounded-full px-2 py-0.5">
                  {FLIGHT_LABELS[event.flight]}
                </span>
              )}
            </span>
            {event.teamCount > 0 && (
              <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-accent font-tight whitespace-nowrap">
                {event.teamCount} teams
              </span>
            )}
          </div>
          <div className="font-display italic font-bold text-[20px] lg:text-[22px] leading-tight tracking-[-0.02em] text-ink mb-2 group-hover/card:text-accent transition-colors">
            {event.name}
          </div>
          {/* mt-auto pushes the date/location to the card bottom so short and
              tall cards align their meta rows across the grid. */}
          <div className="mt-auto flex items-center gap-3 text-[11px] font-medium text-muted font-tight">
            {dateRange && <span className="tabular">{dateRange}</span>}
            {dateRange && location && <span className="text-faint">·</span>}
            {location && <span className="truncate">{location}</span>}
          </div>
        </Link>
        {event.url && (
          <div className="mt-3 flex justify-end">
            <a
              href={event.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`View ${event.name} on USA Ultimate`}
              className="inline-flex items-center gap-1 text-[10px] font-bold tracking-[0.14em] uppercase font-tight text-muted hover:text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-full px-2.5 py-1 bg-ink/5"
            >
              USAU
              <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 1.5h5.5V7" />
                <path d="M8.5 1.5L3.5 6.5" />
                <path d="M7 8.5H1.5V3" />
              </svg>
            </a>
          </div>
        )}
      </div>
    </li>
  );
}

function prettyLevel(level: string): string {
  switch (level) {
    case 'CLUB': return 'Club';
    case 'COLLEGE_D1': return 'College · D-I';
    case 'COLLEGE_D3': return 'College · D-III';
    case 'MASTERS': return 'Masters';
    case 'GRAND_MASTERS': return 'Grand Masters';
    case 'GREAT_GRAND_MASTERS': return 'Great Grand Masters';
    case 'HS': return 'High School';
    case 'MS': return 'Middle School';
    case 'YC': return 'Youth Club';
    case 'BEACH': return 'Beach';
    case 'OTHER': return 'Other';
    default: return level;
  }
}

function Chevron() {
  return (
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
      className="text-muted transition-transform duration-150 group-open:rotate-180"
    >
      <path d="M2 4l3 3 3-3" />
    </svg>
  );
}

function partitionByDate(events: UsauEventCard[]) {
  const now = Date.now();
  // "Upcoming" includes anything ending today or later (still ongoing).
  const upcoming: UsauEventCard[] = [];
  const prior: UsauEventCard[] = [];
  for (const e of events) {
    const compareDate = e.endDate ?? e.startDate;
    if (!compareDate) {
      upcoming.push(e);
      continue;
    }
    const t = new Date(compareDate + 'T23:59:59').getTime();
    if (t >= now) upcoming.push(e);
    else prior.push(e);
  }
  // Upcoming: soonest first.
  upcoming.sort((a, b) => {
    const av = a.startDate ? new Date(a.startDate + 'T00:00:00').getTime() : Number.POSITIVE_INFINITY;
    const bv = b.startDate ? new Date(b.startDate + 'T00:00:00').getTime() : Number.POSITIVE_INFINITY;
    return av - bv;
  });
  // Prior: most recent first.
  prior.sort((a, b) => {
    const av = a.startDate ? new Date(a.startDate + 'T00:00:00').getTime() : 0;
    const bv = b.startDate ? new Date(b.startDate + 'T00:00:00').getTime() : 0;
    return bv - av;
  });
  return { upcoming, prior };
}

function formatDates(start: string | null, end: string | null): string | null {
  if (!start) return null;
  const s = new Date(start + 'T00:00:00');
  const sLabel = s.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  if (!end || end === start) return sLabel;
  const e = new Date(end + 'T00:00:00');
  const eLabel = e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${sLabel} – ${eLabel}`;
}

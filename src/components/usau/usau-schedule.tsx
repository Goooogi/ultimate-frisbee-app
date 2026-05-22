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
import { listEvents, listSeasons, type UsauEventCard } from '@/lib/usau/data';

export function UsauSchedule() {
  const [seasons, setSeasons] = useState<number[]>([]);
  const [season, setSeason] = useState<number | null>(null);
  const [events, setEvents] = useState<UsauEventCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listSeasons()
      .then((s) => {
        if (cancelled) return;
        setSeasons(s);
        setSeason(s[0] ?? null);
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
    // No competitionLevel filter — schedule shows everything we have for
    // the season (Club, College D-I/D-III, HS, MS, Masters, etc.). The
    // upcoming section auto-pins the most relevant event regardless of
    // level (this weekend = College D-I Nationals for 2026, for instance).
    listEvents({ season, limit: 500 })
      .then((e) => !cancelled && setEvents(e))
      .catch((err) =>
        !cancelled && setError(err instanceof Error ? err.message : 'Failed to load events.'),
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [season]);

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
      {seasons.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight">
            Season
          </span>
          <div className="inline-flex rounded-full bg-surface border border-border p-[3px]">
            {seasons.map((y) => {
              const on = y === season;
              return (
                <button
                  key={y}
                  type="button"
                  onClick={() => setSeason(y)}
                  className={[
                    'rounded-full px-3 py-1.5 text-[11px] font-bold tracking-[0.14em] uppercase font-tight cursor-pointer transition-colors',
                    on ? 'bg-accent text-accent-ink' : 'text-muted hover:text-ink',
                  ].join(' ')}
                >
                  {y}
                </button>
              );
            })}
          </div>
        </div>
      )}

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
  return (
    <section>
      <div
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
          {eyebrow}
        </span>
        <span className="text-[10px] font-bold tracking-[0.16em] uppercase text-accent font-tight">
          {count} {count === 1 ? 'tournament' : 'tournaments'}
        </span>
      </div>
      {defaultOpen ? (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-2.5 lg:gap-3">
          {events.map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
        </ul>
      ) : (
        <details className="group">
          <summary className="list-none cursor-pointer flex items-center justify-between gap-3 py-3 px-4 border border-border bg-surface hover:border-ink transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-ink font-tight">
              Show {count} prior {count === 1 ? 'tournament' : 'tournaments'}
            </span>
            <Chevron />
          </summary>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-2.5 lg:gap-3 mt-3">
            {events.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function EventCard({ event }: { event: UsauEventCard }) {
  const dateRange = formatDates(event.startDate, event.endDate);
  const location = [event.city, event.state].filter(Boolean).join(', ');
  const past =
    event.endDate != null &&
    new Date(event.endDate + 'T00:00:00').getTime() < Date.now();
  const level = prettyLevel(event.competitionLevel);

  return (
    <li>
      <Link
        href={`/usau/events/${event.slug}`}
        className={[
          'block bg-surface border border-border rounded-md p-4 hover:border-ink transition-colors no-underline',
          past ? 'opacity-75' : '',
        ].join(' ')}
      >
        <div className="flex items-baseline justify-between gap-3 mb-2">
          <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-faint font-tight truncate">
            {level}
          </span>
          {event.teamCount > 0 && (
            <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-accent font-tight whitespace-nowrap">
              {event.teamCount} teams
            </span>
          )}
        </div>
        <div className="font-display italic font-bold text-[20px] lg:text-[22px] leading-tight tracking-[-0.02em] text-ink mb-2">
          {event.name}
        </div>
        <div className="flex items-center gap-3 text-[11px] font-medium text-muted font-tight">
          {dateRange && <span className="tabular">{dateRange}</span>}
          {dateRange && location && <span className="text-faint">·</span>}
          {location && <span className="truncate">{location}</span>}
        </div>
      </Link>
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

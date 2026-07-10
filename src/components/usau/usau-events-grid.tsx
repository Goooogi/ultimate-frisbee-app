'use client';

// USAU "games" surface — for now this means tournaments, since USAU's data
// is event-scoped (no rolling live-game feed like UFA).
//
// Layout:
//   - Season picker (defaults to most recent)
//   - One collapsible <details> section per competition_level
//   - Sections ordered by "most relevant": the section that contains the
//     soonest upcoming (or most recent past) event sits at the top.
//   - Within each section, events sort by date ascending so the next-up
//     event is first.
//
// The first section auto-expands; the rest start collapsed. User can open
// any of them.

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { listEvents, listSeasons, type UsauEventCard } from '@/lib/usau/data';

// Pretty label for our competition_level enum codes. Order in this map
// is the fallback tiebreaker — earlier keys outrank later keys when two
// sections have the same nearest-event score.
const LEVEL_META: Record<
  string,
  { label: string; tier: number }
> = {
  CLUB: { label: 'Club', tier: 1 },
  COLLEGE_D1: { label: 'College · D-I', tier: 2 },
  COLLEGE_D3: { label: 'College · D-III', tier: 3 },
  MASTERS: { label: 'Masters', tier: 4 },
  GRAND_MASTERS: { label: 'Grand Masters', tier: 5 },
  HS: { label: 'High School', tier: 6 },
  MS: { label: 'Middle School', tier: 7 },
  YC: { label: 'Youth Club', tier: 8 },
  BEACH: { label: 'Beach', tier: 9 },
  OTHER: { label: 'Other', tier: 10 },
};

export function UsauEventsGrid() {
  const [seasons, setSeasons] = useState<number[]>([]);
  const [season, setSeason] = useState<number | null>(null);
  const [events, setEvents] = useState<UsauEventCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Hydrate seasons + default to the most recent.
  useEffect(() => {
    let cancelled = false;
    listSeasons()
      .then((s) => {
        if (cancelled) return;
        setSeasons(s);
        setSeason(s[0] ?? null);
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'Failed to load seasons.'));
    return () => {
      cancelled = true;
    };
  }, []);

  // Load events whenever the selected season changes.
  useEffect(() => {
    if (season == null) return;
    setLoading(true);
    let cancelled = false;
    listEvents({ season, limit: 200 })
      .then((e) => !cancelled && setEvents(e))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'Failed to load events.'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [season]);

  // Group + sort sections.
  const sections = useMemo(() => buildSections(events), [events]);

  if (error) {
    return (
      <div className="text-[12px] font-medium font-tight text-live bg-live/10 border border-live/30 rounded px-3 py-2">
        {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Season pill row */}
      {seasons.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight">
            Season
          </span>
          <div className="inline-flex rounded-full bg-ink/5 p-[3px]">
            {seasons.map((y) => {
              const on = y === season;
              return (
                <button
                  key={y}
                  type="button"
                  onClick={() => setSeason(y)}
                  className={[
                    'rounded-full px-3 py-1.5 text-[11px] font-bold tracking-[0.14em] uppercase font-tight cursor-pointer transition-colors',
                    on ? 'bg-ink text-bg' : 'text-muted hover:text-ink',
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
      ) : sections.length === 0 ? (
        <div className="text-[12px] text-faint font-tight">
          No events for {season ?? 'this season'}.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {sections.map((section, idx) => (
            <DivisionSection key={section.level} section={section} defaultOpen={idx === 0} />
          ))}
        </div>
      )}
    </div>
  );
}

interface Section {
  level: string;
  label: string;
  events: UsauEventCard[];
  /** ms since epoch of the event whose start_date is closest to "now"
   *  in either direction. Used to rank sections by relevance. */
  nearestEventMs: number | null;
  /** True when nearestEventMs is in the future. Used for the badge. */
  nearestIsUpcoming: boolean;
}

function buildSections(events: UsauEventCard[]): Section[] {
  const now = Date.now();

  const byLevel = new Map<string, UsauEventCard[]>();
  for (const e of events) {
    const k = e.competitionLevel;
    if (!byLevel.has(k)) byLevel.set(k, []);
    byLevel.get(k)!.push(e);
  }

  const sections: Section[] = [];
  for (const [level, list] of byLevel.entries()) {
    // Events without a start date sort to the end of their section.
    list.sort((a, b) => {
      const av = a.startDate ? new Date(a.startDate + 'T00:00:00').getTime() : Number.POSITIVE_INFINITY;
      const bv = b.startDate ? new Date(b.startDate + 'T00:00:00').getTime() : Number.POSITIVE_INFINITY;
      return av - bv;
    });

    // Find the event whose start_date is closest to "now" (in either direction).
    let nearestMs: number | null = null;
    let nearestIsUpcoming = false;
    let nearestDelta = Number.POSITIVE_INFINITY;
    for (const e of list) {
      if (!e.startDate) continue;
      const t = new Date(e.startDate + 'T00:00:00').getTime();
      const delta = Math.abs(t - now);
      if (delta < nearestDelta) {
        nearestDelta = delta;
        nearestMs = t;
        nearestIsUpcoming = t >= now;
      }
    }

    sections.push({
      level,
      label: LEVEL_META[level]?.label ?? level,
      events: list,
      nearestEventMs: nearestMs,
      nearestIsUpcoming,
    });
  }

  // Sort sections: prefer the one with the *soonest upcoming* event; if
  // no section has an upcoming event, fall back to the most recently past.
  // Ties broken by LEVEL_META.tier for a stable, predictable order.
  sections.sort((a, b) => {
    const aHasUpcoming = a.nearestIsUpcoming && a.nearestEventMs != null;
    const bHasUpcoming = b.nearestIsUpcoming && b.nearestEventMs != null;
    if (aHasUpcoming !== bHasUpcoming) return aHasUpcoming ? -1 : 1;
    if (aHasUpcoming && bHasUpcoming) {
      // Both have upcoming — earlier date wins.
      return (a.nearestEventMs ?? 0) - (b.nearestEventMs ?? 0);
    }
    if (a.nearestEventMs != null && b.nearestEventMs != null) {
      // Both are past — more recent wins.
      return b.nearestEventMs - a.nearestEventMs;
    }
    // No date data at all — fall back to canonical tier order.
    return (LEVEL_META[a.level]?.tier ?? 99) - (LEVEL_META[b.level]?.tier ?? 99);
  });

  return sections;
}

function DivisionSection({
  section,
  defaultOpen,
}: {
  section: Section;
  defaultOpen: boolean;
}) {
  const nextEvent = section.events.find(
    (e) =>
      e.startDate != null &&
      new Date(e.startDate + 'T00:00:00').getTime() >= Date.now(),
  );

  return (
    <details
      open={defaultOpen}
      className="group bg-surface rounded-card shadow-card overflow-hidden transition-shadow [&[open]]:shadow-lift"
    >
      <summary
        className={[
          'list-none cursor-pointer select-none',
          'flex items-center gap-3 px-5 py-4',
          'hover:bg-ink/[0.02] transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset',
        ].join(' ')}
      >
        <Caret />
        <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-ink font-tight">
          {section.label}
        </span>
        <span className="text-[10px] font-bold tracking-[0.16em] uppercase text-faint font-tight">
          {section.events.length} {section.events.length === 1 ? 'event' : 'events'}
        </span>
        {nextEvent && (
          <span className="ml-auto text-[10px] font-bold tracking-[0.16em] uppercase text-accent font-tight whitespace-nowrap">
            Next · {formatShortDate(nextEvent.startDate)}
          </span>
        )}
      </summary>

      <div className="px-5 pt-1 pb-5 border-t border-hairline">
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-2.5 lg:gap-3 mt-4">
          {section.events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </ul>
      </div>
    </details>
  );
}

function EventCard({ event }: { event: UsauEventCard }) {
  const dateRange = formatDates(event.startDate, event.endDate);
  const location = [event.city, event.state].filter(Boolean).join(', ');
  const past =
    event.endDate != null &&
    new Date(event.endDate + 'T00:00:00').getTime() < Date.now();

  return (
    <li>
      <Link
        href={`/usau/events/${event.slug}`}
        className={[
          'group/card block bg-bg rounded-card-sm p-4 transition-shadow hover:shadow-card cursor-pointer no-underline',
          past ? 'opacity-75' : '',
        ].join(' ')}
      >
        <div className="flex items-baseline justify-between gap-3 mb-2">
          <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-faint font-tight truncate">
            {event.season}
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
        <div className="flex items-center gap-3 text-[11px] font-medium text-muted font-tight">
          {dateRange && <span className="tabular">{dateRange}</span>}
          {dateRange && location && <span className="text-faint">·</span>}
          {location && <span className="truncate">{location}</span>}
        </div>
      </Link>
    </li>
  );
}

function Caret() {
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
      className="text-muted flex-shrink-0 transition-transform duration-150 group-open:rotate-90"
      aria-hidden="true"
    >
      <path d="M3 2l4 3-4 3" />
    </svg>
  );
}

function formatDates(start: string | null, end: string | null): string | null {
  if (!start) return null;
  const s = new Date(start + 'T00:00:00');
  const sLabel = s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (!end || end === start) return sLabel;
  const e = new Date(end + 'T00:00:00');
  const eLabel = e.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${sLabel} – ${eLabel}`;
}

function formatShortDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

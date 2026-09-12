// USAU schedule view — the FUTURE-FACING events list (mobile parity 2026-08-16).
//
// Only "Upcoming" renders: events that haven't started yet, soonest first, with
// each series stage (sectionals, regionals …) as ONE card that opens its list
// of merged tournaments. Anything started (including in play right now) or
// finished belongs to /scores — a "View completed tournaments →" link points
// there when prior events exist. Season browsing also lives on /scores; the
// schedule always shows the latest season's calendar. Data is read server-side
// (listUsauScheduleUpcoming) against the Eastern date.

import Link from 'next/link';
import type {
  UsauEventCard,
  UsauScheduleItem,
  UsauScheduleUpcoming,
  UsauSeriesStageCard,
  CompetitionLevel,
} from '@/lib/usau/data';
import { FLIGHT_LABELS } from '@/lib/usau/flights';
import { buildLeagueQs, seriesListHref, seriesUnitLabel, type UsauLevel } from '@/lib/league';

interface Props {
  /** Upcoming items + whether anything already started; null when the read failed. */
  schedule: UsauScheduleUpcoming | null;
  /** Competition level being listed (Club, College D-I, etc.). */
  competitionLevel: CompetitionLevel;
}

export function UsauSchedule({ schedule, competitionLevel }: Props) {
  // Prior events aren't listed here — they only decide whether to show the
  // link out to the results feed.
  const scoresHref = `/scores${buildLeagueQs('usau', null, competitionLevel as UsauLevel)}`;

  if (!schedule) {
    return (
      <div className="text-[12px] font-medium font-tight text-live bg-live/10 border border-live/30 rounded px-3 py-2">
        Failed to load events.
      </div>
    );
  }

  const { items, hasPrior } = schedule;
  // A stage card stands for every tournament in it.
  const tournaments = items.reduce((n, i) => n + (i.kind === 'series' ? i.series.groupCount : 1), 0);

  return (
    <div className="flex flex-col gap-6">

      {items.length === 0 ? (
        <div className="text-[12px] text-faint font-tight">
          No upcoming events scheduled.
        </div>
      ) : (
        <Section
          eyebrow="Upcoming"
          count={tournaments}
          items={items}
          defaultOpen
          emphasized
        />
      )}

      {hasPrior && (
        <div>
          <Link
            href={scoresHref}
            className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-[0.14em] uppercase font-tight text-accent hover:opacity-80 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-full"
          >
            View completed tournaments →
          </Link>
        </div>
      )}
    </div>
  );
}

function Section({
  eyebrow,
  count,
  items,
  defaultOpen,
  emphasized,
}: {
  eyebrow: string;
  count: number;
  items: UsauScheduleItem[];
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
        {items.map((i) =>
          i.kind === 'series' ? (
            <StageCard key={i.series.id} stage={i.series} />
          ) : (
            <EventCard key={i.event.id} event={i.event} />
          ),
        )}
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
          {event.winner && (
            <div className="flex items-center gap-1.5 min-w-0 mb-2">
              <TrophyGlyph />
              <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-accent font-tight whitespace-nowrap">
                {event.winner.kind === 'champion' ? 'Champion' : 'Pool Leader'}
              </span>
              <span className="text-faint">·</span>
              <span className="text-[11px] font-bold text-ink font-tight truncate min-w-0">
                {event.winner.name}
              </span>
            </div>
          )}
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

// A whole series stage ("2026 USAU Regionals · 8 regions") in the EventCard
// shell; opens the stage's list of merged tournaments.
function StageCard({ stage }: { stage: UsauSeriesStageCard }) {
  const dateRange = formatDates(stage.startDate, stage.endDate);
  return (
    <li className="h-full">
      <Link
        href={seriesListHref('schedule', stage)}
        className="group/card flex h-full flex-col bg-surface rounded-card p-4 transition-shadow shadow-card hover:shadow-lift no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <div className="flex items-center justify-between gap-3 mb-2">
          <span className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-faint font-tight truncate">
              {prettyLevel(stage.level)}
            </span>
            <span className="shrink-0 text-[9px] font-bold tracking-[0.14em] uppercase font-tight text-accent bg-accent/10 rounded-full px-2 py-0.5">
              Series
            </span>
          </span>
          <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-accent font-tight whitespace-nowrap">
            {seriesUnitLabel(stage.stage, stage.groupCount)}
          </span>
        </div>
        <div className="font-display italic font-bold text-[20px] lg:text-[22px] leading-tight tracking-[-0.02em] text-ink mb-2 group-hover/card:text-accent transition-colors">
          {stage.name}
        </div>
        <div className="mt-auto flex items-center justify-between gap-3 text-[11px] font-medium text-muted font-tight">
          {dateRange && <span className="tabular">{dateRange}</span>}
          <span className="text-[10px] font-bold tracking-[0.14em] uppercase text-accent">View all →</span>
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
    case 'GREAT_GRAND_MASTERS': return 'Great Grand Masters';
    case 'HS': return 'High School';
    case 'MS': return 'Middle School';
    case 'YC': return 'Youth Club';
    case 'BEACH': return 'Beach';
    case 'OTHER': return 'Other';
    default: return level;
  }
}

function TrophyGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="flex-shrink-0">
      <path
        d="M4 2h8v3a4 4 0 01-8 0V2zM4 3H2v1a2 2 0 002 2M12 3h2v1a2 2 0 01-2 2M6 9.5V11m4-1.5V11M5 14h6M6.5 11h3l.5 3h-4l.5-3z"
        stroke="rgb(var(--accent))"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
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

function formatDates(start: string | null, end: string | null): string | null {
  if (!start) return null;
  const s = new Date(start + 'T00:00:00');
  const sLabel = s.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  if (!end || end === start) return sLabel;
  const e = new Date(end + 'T00:00:00');
  const eLabel = e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${sLabel} – ${eLabel}`;
}

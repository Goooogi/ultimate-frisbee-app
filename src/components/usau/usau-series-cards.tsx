// Series stage lists — the merged tournaments behind one "2026 USAU
// Sectionals" card (/scores?series= and /schedule?series=). Each card is one
// real tournament; each row is a division USAU published, linking to that
// division's tab on the merged event page.
//
// No hooks: renders inside the client Scores feed and the server Schedule page.

import Link from 'next/link';
import type {
  UsauSeriesDivisionResult,
  UsauSeriesEventResult,
  UsauSeriesStageEvents,
} from '@/lib/usau/data';
import { levelLabel, seriesUnitLabel } from '@/lib/league';
import { usauEventHref } from '@/lib/usau/event-href';
import { UsauTeamLogo } from '@/components/usau/usau-team-logo';

export function UsauSeriesStageList({
  data,
  today,
  backHref,
  backLabel,
  heading = 'h2',
}: {
  data: UsauSeriesStageEvents;
  /** Eastern date (usauToday) the server rendered with — each division's
   *  upcoming / in progress / pending status keys on it. */
  today: string;
  backHref: string;
  backLabel: string;
  /** h1 where the list IS the page title (Scores); h2 under a PageShell title. */
  heading?: 'h1' | 'h2';
}) {
  const { stage, events } = data;
  const Title = heading;
  const meta = [seriesUnitLabel(stage.stage, stage.groupCount), formatDateRange(stage.startDate, stage.endDate)]
    .filter(Boolean)
    .join(' · ');
  return (
    <>
      <div className="flex flex-col gap-3 mb-5 lg:mb-7">
        <Link
          href={backHref}
          className="self-start inline-flex items-center min-h-[32px] text-[11px] font-bold tracking-[0.14em] uppercase font-tight text-muted hover:text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-full"
        >
          ← {backLabel}
        </Link>
        <span className="text-[10.5px] font-bold tracking-[0.18em] uppercase text-accent font-sans">
          USAU · {levelLabel(stage.level)} · Series
        </span>
        <Title
          className={[
            'm-0 font-display italic font-bold leading-[0.95] tracking-[-0.02em] text-ink',
            heading === 'h1' ? 'text-[32px] lg:text-[40px]' : 'text-[26px] lg:text-[34px]',
          ].join(' ')}
        >
          {stage.name}
        </Title>
        <span className="font-mono text-[11px] text-muted tracking-[0.06em] uppercase">{meta}</span>
      </div>
      <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 items-stretch">
        {events.map((e) => (
          <li key={e.slug} className="h-full">
            <UsauSeriesEventCard event={e} today={today} />
          </li>
        ))}
      </ul>
    </>
  );
}

function UsauSeriesEventCard({ event, today }: { event: UsauSeriesEventResult; today: string }) {
  const meta = [formatDateRange(event.startDate, event.endDate), [event.city, event.state].filter(Boolean).join(', ')]
    .filter(Boolean)
    .join(' · ');
  // A container, not one anchor: every division row links to its own tab and
  // nested anchors are invalid HTML (same shape as the results-feed cards).
  return (
    <div className="group h-full bg-surface rounded-card shadow-card px-4 py-3.5 flex flex-col gap-2.5 transition-shadow hover:shadow-lift">
      <Link
        href={`/usau/events/${event.slug}`}
        className="flex flex-col gap-0.5 no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm"
      >
        <span className="font-tight font-semibold text-[13px] text-ink leading-snug line-clamp-2 group-hover:text-accent transition-colors">
          {event.name}
        </span>
        {meta && <span className="font-mono text-[10px] text-faint tracking-[0.06em]">{meta}</span>}
      </Link>
      <div className="flex flex-col gap-2">
        {event.divisions.map((d, i) => (
          <DivisionRow key={`${d.division ?? 'all'}-${i}`} slug={event.slug} result={d} today={today} />
        ))}
      </div>
    </div>
  );
}

function DivisionRow({
  slug,
  result,
  today,
}: {
  slug: string;
  result: UsauSeriesDivisionResult;
  today: string;
}) {
  const label = result.division ?? 'All divisions';
  const champion = result.champion;
  return (
    <Link
      href={usauEventHref(slug, result.division)}
      className="flex items-center gap-2 min-h-[30px] no-underline rounded-card-sm -mx-1 px-1 py-0.5 hover:bg-[rgb(var(--ink)/0.04)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {champion ? (
        <>
          <span className="text-accent flex-shrink-0">
            <TrophyIcon />
          </span>
          <span className="inline-flex rounded-full overflow-hidden flex-shrink-0">
            <UsauTeamLogo name={champion.teamName} genderDivision={result.division} size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-tight text-[13px] text-ink font-semibold truncate">{champion.teamName}</div>
            <div className="font-mono text-[9.5px] text-faint tracking-[0.1em] uppercase">
              {label}
              {champion.viaPoolRecord && <span className="text-accent"> · Pool leader</span>}
            </div>
          </div>
        </>
      ) : (
        <div className="min-w-0 flex-1 flex items-baseline justify-between gap-3">
          <span className="font-tight text-[13px] text-ink font-semibold">{label}</span>
          <span className="font-mono text-[9.5px] text-faint tracking-[0.1em] uppercase text-right">
            {divisionStatus(result, today)}
          </span>
        </div>
      )}
    </Link>
  );
}

function divisionStatus(d: UsauSeriesDivisionResult, today: string): string {
  if (d.cancelled) return 'Final cancelled';
  if (d.teamCount === 0) return 'No teams posted';
  const teams = `${d.teamCount} team${d.teamCount === 1 ? '' : 's'}`;
  if (d.startDate != null && d.startDate > today) return teams;
  if (d.endDate != null && d.endDate < today) return 'Results pending';
  return `In progress · ${teams}`;
}

/** "Sep 12 – Sep 13"; one date when they match. UTC so server and client agree. */
function formatDateRange(start: string | null, end: string | null): string {
  if (!start) return '';
  const fmt = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  if (!end || end === start) return fmt(start);
  return `${fmt(start)} – ${fmt(end)}`;
}

function TrophyIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 4h12v3a6 6 0 0 1-12 0V4Z M6 5H3v2a3 3 0 0 0 3 3 M18 5h3v2a3 3 0 0 1-3 3 M9 14.5h6 M10 18h4 M9 18h6v2H9z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

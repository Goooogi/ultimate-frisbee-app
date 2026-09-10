// "Up next" cards — split per-league per Hunter's explicit request ("I want
// each league/subject to be separate"). Each league gets its own independent
// floating card (same shell: bg-surface rounded-card-lg shadow-card, italic
// display 22px title + neutral league pill top-right, hairline-separated
// rows) instead of one combined card with in-card league-pill dividers.
//
// Exports UpNextCards — a fragment of 0-2 cards (UFA, then USAU) — so
// page.tsx can drop it straight into a `grid grid-cols-1 lg:grid-cols-2`
// row as its own "Up next" section; each card renders only when it has
// data. When only ONE league has anything upcoming (UFA's off-season, most
// of the year) that card spans the full row and its rows flow into two
// columns on lg, so the section never shows a half-empty row.

import Link from 'next/link';
import type { UfaGame } from '@/lib/ufa/types';
import type { UpcomingUsauEvent } from '@/lib/usau/data';
import { teamMeta } from '@/lib/ufa/teams';
import { gameUiState, formatStartCompact } from '@/lib/ufa/format';
import { TeamLogo } from '@/components/team-logo';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Compact date range for a tournament card row: same month → "Jul 25–26";
 *  cross-month → "Jul 31 – Aug 2"; single day (or matching start/end) →
 *  "Jul 18"; either date missing → ''. Dates are ISO "YYYY-MM-DD" strings;
 *  parsed as UTC noon to avoid local-timezone day-shift. */
function formatDateRange(start: string | null, end: string | null): string {
  if (!start) return '';
  const parse = (iso: string) => new Date(`${iso}T12:00:00Z`);
  const startDate = parse(start);
  if (Number.isNaN(startDate.getTime())) return '';

  const startMonth = MONTHS[startDate.getUTCMonth()];
  const startDay = startDate.getUTCDate();

  if (!end || end === start) return `${startMonth} ${startDay}`;

  const endDate = parse(end);
  if (Number.isNaN(endDate.getTime())) return `${startMonth} ${startDay}`;

  const endMonth = MONTHS[endDate.getUTCMonth()];
  const endDay = endDate.getUTCDate();

  return startMonth === endMonth
    ? `${startMonth} ${startDay}–${endDay}`
    : `${startMonth} ${startDay} – ${endMonth} ${endDay}`;
}

/** "FRI · 7:00 PM" — drops the date + timezone from formatStartCompact's
 *  "FRI, JUL 10 · 7:00 PM EDT" so the row's right column doesn't force the
 *  away/home abbr text to collapse to a single letter on narrow (390px)
 *  viewports. Falls back to the raw string (e.g. "TBD") if the expected
 *  "WD, MON D · TIME TZ" shape isn't there. */
function formatWhenCompact(game: UfaGame): string {
  const full = formatStartCompact(game);
  const match = full.match(/^(\w+),.*·\s*(\d{1,2}:\d{2}\s*[AP]M)/);
  return match ? `${match[1]} · ${match[2]}` : full;
}

interface UpNextCardsProps {
  ufaGames: UfaGame[];
  /** Next several upcoming flighted USAU tournaments (soonest first). */
  usauEvents: UpcomingUsauEvent[];
}

/** Renders the "Up next" card group: UFA card, then USAU card — each shown
 *  only when it has data. Returns null (no wrapper element) when neither has
 *  content, so page.tsx can drop this straight into the flex stack. */
/** Upper bound on rows per card — keeps a huge slate from ballooning the card. */
const MAX_UP_NEXT_ROWS = 6;

export function UpNextCards({ ufaGames, usauEvents }: UpNextCardsProps) {
  const hasUfa = ufaGames.length > 0;
  const hasUsau = usauEvents.length > 0;
  if (!hasUfa && !hasUsau) return null;

  // Equal-height guarantee: when BOTH cards render side by side, they show the
  // SAME number of rows — the smaller of the two supplies (capped) — so neither
  // card is taller than the other. When only one card renders, it uses its own
  // supply up to the cap. This both fills the UFA card's whitespace (it now
  // shows as many games as USAU has events) and never leaves one card short.
  const rowCount =
    hasUfa && hasUsau
      ? Math.min(ufaGames.length, usauEvents.length, MAX_UP_NEXT_ROWS)
      : MAX_UP_NEXT_ROWS;
  const alone = hasUfa !== hasUsau;

  return (
    <>
      {hasUfa && (
        <CardShell title="Up next" pill="UFA" alone={alone} rows={Math.min(ufaGames.length, rowCount)}>
          {ufaGames.slice(0, rowCount).map((g, i) => (
            <UfaUpNextRow key={g.gameID} game={g} first={i === 0} secondColumnStart={alone && i === splitAt(Math.min(ufaGames.length, rowCount))} />
          ))}
        </CardShell>
      )}
      {hasUsau && (
        <CardShell title="Up next" pill="USAU" alone={alone} rows={Math.min(usauEvents.length, rowCount)}>
          {usauEvents.slice(0, rowCount).map((e, i) => (
            <UsauEventRow key={e.slug} event={e} first={i === 0} secondColumnStart={alone && i === splitAt(Math.min(usauEvents.length, rowCount))} />
          ))}
        </CardShell>
      )}
    </>
  );
}

/** Index of the first row in the second column of a lone card's lg layout
 *  (column-major: chronology reads DOWN the first column, then the second). */
function splitAt(rows: number): number {
  return Math.ceil(rows / 2);
}

// Literal class strings so Tailwind keeps them; index = rows per column.
const LG_ROWS: Record<number, string> = {
  1: 'lg:grid-rows-1',
  2: 'lg:grid-rows-2',
  3: 'lg:grid-rows-3',
};

/** Row-list classes: a lone card with 2+ rows lays them out in two lg
 *  columns, column-major, with a wide gutter between the columns. */
function rowsClass(alone: boolean, rows: number): string {
  if (!alone || rows < 2) return 'flex flex-col';
  return `flex flex-col ${LG_ROWS[splitAt(rows)] ?? 'lg:grid-rows-3'} lg:grid lg:grid-cols-2 lg:grid-flow-col lg:gap-x-8`;
}

// ─── Shared card shell ────────────────────────────────────────────────────

function CardShell({
  title,
  pill,
  alone,
  rows,
  children,
}: {
  title: string;
  pill: string;
  /** The only Up next card on the page → span the whole lg row. */
  alone: boolean;
  rows: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className={[
        'h-full flex flex-col bg-surface rounded-card-lg shadow-card px-6 py-5',
        alone ? 'lg:col-span-2' : '',
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-3 mb-3.5">
        <h3 className="font-display italic font-bold text-[22px] leading-none tracking-[-0.01em] text-ink m-0">
          {title}
        </h3>
        <LeaguePill>{pill}</LeaguePill>
      </div>
      <div className={rowsClass(alone, rows)}>{children}</div>
    </div>
  );
}

/** Hairline rule: every row but the first, except the row that opens the
 *  second lg column of a lone card (it sits at the top of its column). */
function rowBorder(first: boolean, secondColumnStart: boolean): string {
  if (first) return '';
  return secondColumnStart ? 'border-t border-hairline lg:border-t-0' : 'border-t border-hairline';
}

function LeaguePill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-sans text-[10.5px] font-bold tracking-[0.12em] uppercase px-2.5 py-[5px] rounded-full bg-[rgb(var(--ink)/0.05)] text-ink/80 flex-shrink-0">
      {children}
    </span>
  );
}

// ─── UFA row ──────────────────────────────────────────────────────────────

function UfaUpNextRow({
  game,
  first,
  secondColumnStart,
}: {
  game: UfaGame;
  first: boolean;
  secondColumnStart: boolean;
}) {
  const away = teamMeta(game.awayTeamID);
  const home = teamMeta(game.homeTeamID);
  const state = gameUiState(game);
  const when = state.isLive ? 'LIVE' : formatWhenCompact(game).toUpperCase();

  return (
    <Link
      href={`/g/${game.gameID}`}
      className={[
        'grid grid-cols-[1fr_auto] gap-3 items-center py-[11px]',
        rowBorder(first, secondColumnStart),
        'hover:opacity-80 transition-opacity',
      ].join(' ')}
    >
      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
        <span className="inline-flex rounded-full overflow-hidden flex-shrink-0">
          <TeamLogo team={away} size={26} />
        </span>
        {/* Abbrs are always 2-4 chars — flex-shrink-0 so they're never the
            thing that collapses when the row is tight; the datetime column
            (right) and the "at" divider absorb the squeeze instead. */}
        <span className="font-sans font-bold text-[13.5px] text-ink flex-shrink-0">{away.abbr}</span>
        <span className="font-mono text-[11px] text-faint flex-shrink-0">at</span>
        <span className="inline-flex rounded-full overflow-hidden flex-shrink-0">
          <TeamLogo team={home} size={26} />
        </span>
        <span className="font-sans font-bold text-[13.5px] text-ink flex-shrink-0">{home.abbr}</span>
      </div>
      <span
        className={[
          'font-mono text-[10.5px] flex-shrink-0 whitespace-nowrap',
          state.isLive ? 'text-accent font-bold' : 'text-muted',
        ].join(' ')}
      >
        {when}
      </span>
    </Link>
  );
}

// ─── USAU row — one upcoming flighted tournament ─────────────────────────

function UsauEventRow({
  event,
  first,
  secondColumnStart,
}: {
  event: UpcomingUsauEvent;
  first: boolean;
  secondColumnStart: boolean;
}) {
  const dateRange = formatDateRange(event.startDate, event.endDate);
  const meta = [dateRange, event.flightLabel].filter(Boolean).join(' · ');

  // Single-line row: tournament name + its date·flight sitting IMMEDIATELY to
  // the right of the name (not pinned to the far edge), with the rest of the row
  // left empty. The name truncates first if the row gets tight so the date stays
  // visible. Single-line keeps USAU rows the same height as UFA rows.
  return (
    <Link
      href={`/usau/events/${event.slug}`}
      className={[
        'flex items-baseline gap-3 py-[11px]',
        rowBorder(first, secondColumnStart),
        'hover:opacity-80 transition-opacity',
      ].join(' ')}
    >
      <span className="font-tight font-semibold text-[13.5px] text-ink truncate min-w-0">
        {event.name}
      </span>
      <span className="font-mono text-[10.5px] text-muted flex-shrink-0 whitespace-nowrap uppercase">
        {meta || 'View →'}
      </span>
    </Link>
  );
}

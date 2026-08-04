// Date/time formatting for EUCS games and events.
//
// THE TIMEZONE RULE: euf_games.scheduled_at holds the VENUE-LOCAL wall clock
// stored as UTC. Ultiorganizer publishes a time-of-day with no offset, so the
// ingest can't resolve a real instant — it stores what the site said and marks
// it Z. Formatting must therefore read it back in UTC, which renders the stored
// wall clock unshifted. Reading it in the viewer's zone would shift a 9:05 game
// to 4:05 for a US viewer, inventing a time that never existed.
//
// Same convention as the USAU masters ingest and src/lib/usau/venue-tz.ts (its
// unknown-state fallback path). See the vault: "EUF EUCS Pipeline.md" → Dates.

const TZ = 'UTC';

/** "Sat, Sep 20" — the day a game/event falls on. Year omitted (the event
 *  header already carries it); pass withYear for standalone contexts. */
export function eufGameDate(iso: string | null | undefined, withYear = false): string {
  const d = parse(iso);
  if (!d) return '';
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: TZ,
  });
}

/** "9:05 AM" — the venue wall clock. Empty when the row carries no real
 *  time-of-day (stored at midnight), so callers render the date alone rather
 *  than a fake "12:00 AM". */
export function eufGameTime(iso: string | null | undefined): string {
  const d = parse(iso);
  if (!d) return '';
  const t = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: TZ,
  });
  return t === '12:00 AM' ? '' : t;
}

/** Stable YYYY-MM-DD key for grouping games into days. Derived in UTC so it
 *  agrees with eufGameDate — a local-zone key would bucket a Saturday evening
 *  game under Sunday for viewers east of the venue. */
export function eufDayKey(iso: string | null | undefined): string | null {
  const d = parse(iso);
  return d ? d.toISOString().slice(0, 10) : null;
}

/** "Sep 19 – 21, 2025" · "Sep 20, 2025" · "Aug 30 – Sep 1, 2025" — an event's
 *  date range, collapsing a shared month and a single-day event. */
export function eufDateRange(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  const s = parseDateOnly(start);
  const e = parseDateOnly(end);
  if (!s) return '';
  const year = s.getUTCFullYear();
  const sMonth = s.toLocaleDateString('en-US', { month: 'short', timeZone: TZ });
  const sDay = s.getUTCDate();

  if (!e || e.getTime() === s.getTime()) return `${sMonth} ${sDay}, ${year}`;

  const eMonth = e.toLocaleDateString('en-US', { month: 'short', timeZone: TZ });
  const eDay = e.getUTCDate();
  const eYear = e.getUTCFullYear();

  if (eYear !== year) return `${sMonth} ${sDay}, ${year} – ${eMonth} ${eDay}, ${eYear}`;
  if (eMonth === sMonth) return `${sMonth} ${sDay} – ${eDay}, ${year}`;
  return `${sMonth} ${sDay} – ${eMonth} ${eDay}, ${year}`;
}

/** "Sep 2025" — compact month+year stamp for dense event cards. */
export function eufMonthYear(start: string | null | undefined): string {
  const s = parseDateOnly(start);
  if (!s) return '';
  return s.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: TZ });
}

function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

// start_date/end_date are DATE columns ("2025-09-20"). Appending the time makes
// the parse explicitly UTC — a bare "2025-09-20" is already UTC per spec, but
// being explicit keeps it from drifting if the column ever returns a timestamp.
function parseDateOnly(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v.length === 10 ? `${v}T00:00:00Z` : v);
  return isNaN(d.getTime()) ? null : d;
}

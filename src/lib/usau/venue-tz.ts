// Venue-timezone helpers for USAU game times.
//
// usau_games.scheduled_at stores a TRUE UTC instant. USAU publishes schedule
// times in the venue's local clock with no zone; the scraper converts them to
// UTC using the event's US state (see usau-scraper sync-event-details), and
// the 2026-07 backfill normalized the older venue-local-as-Z rows the same
// way. To show the wall-clock time a player/fan at the event would say
// ("semis at 9:45 AM"), format the instant back in the venue's zone — NOT the
// viewer's zone and NOT UTC.
//
// When the event's state is unknown (state null/TBD — the scraper also stores
// those rows date-only or venue-local-as-Z), fall back to formatting in UTC,
// which renders the stored wall clock unshifted.
//
// Keep this map in sync with STATE_TO_TZ in
// usau-scraper/supabase/functions/sync-event-details/index.ts.

const STATE_TO_TZ: Record<string, string> = {
  // Eastern
  CT: 'America/New_York', DE: 'America/New_York', DC: 'America/New_York',
  FL: 'America/New_York', GA: 'America/New_York', IN: 'America/Indiana/Indianapolis',
  ME: 'America/New_York', MD: 'America/New_York', MA: 'America/New_York',
  MI: 'America/Detroit', NH: 'America/New_York', NJ: 'America/New_York',
  NY: 'America/New_York', NC: 'America/New_York', OH: 'America/New_York',
  PA: 'America/New_York', RI: 'America/New_York', SC: 'America/New_York',
  VT: 'America/New_York', VA: 'America/New_York', WV: 'America/New_York',
  // Central
  AL: 'America/Chicago', AR: 'America/Chicago', IL: 'America/Chicago',
  IA: 'America/Chicago', KS: 'America/Chicago', KY: 'America/New_York',
  LA: 'America/Chicago', MN: 'America/Chicago', MS: 'America/Chicago',
  MO: 'America/Chicago', NE: 'America/Chicago', OK: 'America/Chicago',
  TN: 'America/Chicago', TX: 'America/Chicago', WI: 'America/Chicago',
  // Mountain
  AZ: 'America/Phoenix', CO: 'America/Denver', ID: 'America/Boise',
  MT: 'America/Denver', NM: 'America/Denver', UT: 'America/Denver',
  // Pacific
  CA: 'America/Los_Angeles', NV: 'America/Los_Angeles', OR: 'America/Los_Angeles',
  WA: 'America/Los_Angeles',
  // Alaska / Hawaii
  AK: 'America/Anchorage', HI: 'Pacific/Honolulu',
};

/** IANA timezone for a US state code, or null when unknown. */
export function venueTimeZone(state: string | null | undefined): string | null {
  if (!state) return null;
  return STATE_TO_TZ[state.trim().toUpperCase()] ?? null;
}

/** "Sun 9:45 AM" — a game's scheduled time as the venue's wall clock.
 *  Rows ingested without a time-of-day are stored at venue midnight (or
 *  UTC midnight when the venue zone was unknown); those render as just the
 *  weekday ("Sun") rather than a fake "12:00 AM". */
export function formatGameTime(
  iso: string | null | undefined,
  state: string | null | undefined,
): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const timeZone = venueTimeZone(state) ?? 'UTC';
  const full = d.toLocaleString('en-US', {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  });
  if (full.endsWith('12:00 AM')) {
    return d.toLocaleString('en-US', { weekday: 'short', timeZone });
  }
  return full;
}

// Venue-timezone helpers shared by every pipeline that writes
// usau_games.scheduled_at.
//
// USAU (and ultirzr, which mirrors USAU) publishes schedule times as the
// VENUE'S LOCAL wall clock with no offset. scheduled_at is a timestamptz —
// a true instant — so every writer must convert local wall time → UTC using
// the event's venue zone, derived from its US state. When the state/zone is
// unknown we store date-only (midnight) rather than a wrong instant.
//
// The web app formats these instants back in the venue zone (see
// src/lib/usau/venue-tz.ts — keep the state map in sync).

export const STATE_TO_TZ: Record<string, string> = {
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

/** Map an event's US state code to an IANA timezone, or null if unknown. */
export function tzForState(state: string | null | undefined): string | null {
  if (!state) return null;
  return STATE_TO_TZ[state.trim().toUpperCase()] ?? null;
}

/**
 * Convert a LOCAL wall-clock time in `tz` to a UTC ISO string (DST-aware).
 * Works by measuring the zone's offset for that instant via Intl: format a
 * provisional UTC instant in the target zone, diff the rendered wall-clock from
 * the intended wall-clock, and correct.
 */
export function localWallTimeToUtcIso(
  year: number, month: number, day: number, hour: number, minute: number,
  tz: string,
): string | null {
  // Provisional: treat the wall-clock as if it were UTC.
  const provisional = Date.UTC(year, month - 1, day, hour, minute, 0);
  // What wall-clock does that instant show in the target zone?
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = fmt.formatToParts(new Date(provisional));
  const get = (t: string) => parseInt(parts.find((p) => p.type === t)?.value ?? '0', 10);
  // Reconstruct the zone-rendered instant as if it were UTC, diff = the offset.
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') === 24 ? 0 : get('hour'), get('minute'), 0);
  const offset = asUtc - provisional; // ms the zone is ahead of UTC at this instant
  const utcMs = provisional - offset;
  if (isNaN(utcMs)) return null;
  return new Date(utcMs).toISOString();
}

/** Date-only fallback: store midnight UTC for the given Y/M/D (no time). */
export function dateOnlyIso(year: number, month: number, day: number): string | null {
  const ms = Date.UTC(year, month - 1, day, 0, 0, 0);
  return isNaN(ms) ? null : new Date(ms).toISOString();
}

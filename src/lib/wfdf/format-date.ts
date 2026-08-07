// Date/time formatting for WFDF games.
//
// THE TIMEZONE RULE: wfdf_games.scheduled_at holds the VENUE-LOCAL wall clock
// stored as UTC — the same convention as EUCS (src/lib/euf/format-date.ts) and
// the USAU masters ingest. The source publishes both `time` (venue-local, what
// the schedule site prints) and `time_utc` (the real instant); the ingest takes
// `time`. Formatting must therefore read it back in UTC, which renders the
// stored wall clock unshifted. Reading it in the viewer's zone would shift a
// 1:00 PM game in Limerick to 8:00 AM for a US viewer.

const TZ = 'UTC';

/** "Sun, Aug 16 · 1:00 PM" — a game's scheduled day and venue wall clock.
 *  Null when absent, so callers can fall back to a status label. */
export function wfdfGameTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: TZ,
  });
  const time = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: TZ,
  });
  return `${day} · ${time}`;
}

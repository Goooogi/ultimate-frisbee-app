// Server-derived "today" for the feed header. Computed per-request so the date
// stays current — no hardcoded reference date.

export interface Today {
  weekday: string;   // "WED"
  month: string;     // "MAY"
  day: number;
  year: number;
}

/** Today as yyyy-mm-dd in US Eastern — the cutoff for "has this tournament
 *  started yet?".
 *
 *  NOT `toISOString().slice(0,10)`: that's UTC, which rolls over at 8pm ET, so
 *  every tournament starting tomorrow appeared under Scores the evening before.
 *  USAU events are US-based, so Eastern is the latest any of them can still be
 *  "today" — a west-coast event is never shown late by this, only never early. */
export function usauToday(now: Date = new Date()): string {
  // en-CA formats as yyyy-mm-dd.
  return now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

export function getToday(now: Date = new Date()): Today {
  return {
    weekday: now.toLocaleString('en-US', { weekday: 'short' }).toUpperCase(),
    month: now.toLocaleString('en-US', { month: 'short' }).toUpperCase(),
    day: now.getDate(),
    year: now.getFullYear(),
  };
}

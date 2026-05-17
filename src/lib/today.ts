// Server-derived "today" for the feed header. Computed per-request so the date
// stays current — no hardcoded reference date.

export interface Today {
  weekday: string;   // "WED"
  month: string;     // "MAY"
  day: number;
  year: number;
}

export function getToday(now: Date = new Date()): Today {
  return {
    weekday: now.toLocaleString('en-US', { weekday: 'short' }).toUpperCase(),
    month: now.toLocaleString('en-US', { month: 'short' }).toUpperCase(),
    day: now.getDate(),
    year: now.getFullYear(),
  };
}

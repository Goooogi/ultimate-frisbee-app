// Fantasy week logic — pure functions over UFA game rows.
//
// A fantasy "week" IS the UFA native `week` string ("week-9"). Roster rules:
//   • A week LOCKS at its earliest game start (start_timestamp).
//   • Before lock, that week's roster is editable.
//   • After lock, the manager edits the NEXT week's slots (which default-copy
//     from the locked week in the app layer).
//
// These functions are pure: they take the games and a reference "now" and
// derive week boundaries + lock state. No DB, no wall clock (caller passes now)
// so they're trivially testable and deterministic.

/** The minimal game shape week logic needs (subset of ufa_games). */
export interface WeekGame {
  week: string | null;
  startTimestamp: string | null; // ISO
  status: string; // 'Upcoming' | 'Final' | 'InProgress'
}

export interface FantasyWeek {
  week: string; // "week-9"
  /** Earliest game start in the week — the lock moment. null if no timestamps. */
  lockAt: string | null;
  gameCount: number;
  /** True once `now >= lockAt`. A week with no lockAt is treated as not locked. */
  locked: boolean;
  /** True when every game in the week is Final. */
  complete: boolean;
}

/** Numeric sort key for a "week-N" string; unknown formats sort last. */
export function weekSortKey(week: string | null): number {
  if (!week) return Number.MAX_SAFE_INTEGER;
  const m = week.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER - 1;
}

function ts(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

const FINAL = 'Final';

/**
 * Group games into fantasy weeks, sorted by week number, with lock + completion
 * state resolved against `now`. Games with a null `week` are dropped (can't be
 * assigned to a fantasy week).
 */
export function buildWeeks(games: WeekGame[], now: Date = new Date()): FantasyWeek[] {
  const nowMs = now.getTime();
  const byWeek = new Map<string, WeekGame[]>();
  for (const g of games) {
    if (!g.week) continue;
    const arr = byWeek.get(g.week);
    if (arr) arr.push(g);
    else byWeek.set(g.week, [g]);
  }

  const weeks: FantasyWeek[] = [];
  for (const [week, wg] of byWeek) {
    const starts = wg.map((g) => ts(g.startTimestamp)).filter((n): n is number => n != null);
    const lockMs = starts.length ? Math.min(...starts) : null;
    weeks.push({
      week,
      lockAt: lockMs != null ? new Date(lockMs).toISOString() : null,
      gameCount: wg.length,
      locked: lockMs != null ? nowMs >= lockMs : false,
      complete: wg.every((g) => g.status === FINAL),
    });
  }

  return weeks.sort((a, b) => weekSortKey(a.week) - weekSortKey(b.week));
}

/**
 * The week a manager is currently setting a lineup for = the earliest week that
 * has NOT yet locked. If every week has locked (season effectively over for
 * roster purposes), returns the last week. Returns null if there are no weeks.
 */
export function activeWeek(weeks: FantasyWeek[]): FantasyWeek | null {
  if (weeks.length === 0) return null;
  return weeks.find((w) => !w.locked) ?? weeks[weeks.length - 1];
}

/**
 * Weeks that count toward the cumulative score = every week that has locked.
 * (A week's points accrue once its games begin; unlocked/future weeks score 0.)
 */
export function scorableWeeks(weeks: FantasyWeek[]): FantasyWeek[] {
  return weeks.filter((w) => w.locked);
}

/** Convenience: is this specific week locked as of `now`? */
export function isWeekLocked(weeks: FantasyWeek[], week: string, now: Date = new Date()): boolean {
  const w = weeks.find((x) => x.week === week);
  if (!w) return false;
  if (w.lockAt == null) return false;
  return now.getTime() >= new Date(w.lockAt).getTime();
}

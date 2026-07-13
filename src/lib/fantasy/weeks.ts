// Fantasy week logic — pure functions over UFA game rows.
//
// A fantasy "week" IS the UFA native `week` string ("week-9"). Roster rules
// (confirmed with Hunter 2026-07-05):
//   • A week LOCKS when its FIRST game kicks off — managers can edit right up
//     until games start (standard fantasy behavior). Earlier we locked at a
//     fixed Friday 00:00, but that froze anyone who set a lineup Friday daytime
//     before any game had started.
//   • It REOPENS the following MONDAY (00:00 US Eastern) — at which point the
//     manager is editing the NEXT week.
//   So the locked window is [firstGameStart, Mon 00:00 ET).
//
// All wall-clock boundaries are anchored to US EASTERN (the UFA is a US league;
// "Monday" must mean Monday ET, not UTC). These functions are pure: they take
// the games + a reference "now" and derive boundaries + lock state — no DB, no
// implicit wall clock (caller passes now) — so they're deterministic/testable.

/** The minimal game shape week logic needs (subset of ufa_games). */
export interface WeekGame {
  week: string | null;
  startTimestamp: string | null; // ISO
  status: string; // 'Upcoming' | 'Final' | 'InProgress'
}

export interface FantasyWeek {
  week: string; // "week-9"
  /** Friday 00:00 before this week's games — the lock moment. null if no game
   *  timestamps to anchor on. */
  lockAt: string | null;
  /** Monday 00:00 after this week's games — editing reopens (for the NEXT week).
   *  null when lockAt is null. */
  unlockAt: string | null;
  gameCount: number;
  /** True when now is within [lockAt, unlockAt). A week with no lockAt is never
   *  locked. */
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

/** Human label for a UFA week id: "week-12" → "Week 12". Non-numeric weeks
 *  ("finals", "semifinals") get title-cased; null/empty → "". */
export function formatWeekLabel(week: string | null | undefined): string {
  if (!week) return '';
  const m = week.match(/^week-(\d+)$/i);
  if (m) return `Week ${parseInt(m[1], 10)}`;
  return week.charAt(0).toUpperCase() + week.slice(1);
}

function ts(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

const FINAL = 'Final';
const DAY_MS = 86400_000;

/**
 * Wall-clock fields of an instant as seen in US Eastern, DST-correct. Uses Intl
 * so we don't hardcode the EST/EDT offset (UFA season spans both). Returns the
 * ET calendar Y/M/D + day-of-week (Sun=0 … Sat=6) for the given epoch ms.
 */
function easternParts(ms: number): { y: number; mo: number; d: number; dow: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });
  const parts = fmt.formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    y: parseInt(get('year'), 10),
    mo: parseInt(get('month'), 10),
    d: parseInt(get('day'), 10),
    dow: dowMap[get('weekday')] ?? 0,
  };
}

/** ET's UTC offset in minutes at a given instant (negative; -240 EDT / -300 EST). */
function easternOffsetMinutes(ms: number): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const p = fmt.formatToParts(new Date(ms));
  const g = (t: string) => parseInt(p.find((x) => x.type === t)?.value ?? '0', 10);
  // The same instant expressed as if the ET wall-clock were UTC.
  const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'), g('second'));
  return Math.round((asUtc - ms) / 60000);
}

/**
 * UTC epoch ms for ET wall-clock midnight (00:00 America/New_York) on y-mo-d.
 * DST-correct: subtract the ET offset in effect at that local midnight.
 */
function easternMidnightUtcMs(y: number, mo: number, d: number): number {
  const naive = Date.UTC(y, mo - 1, d, 0, 0, 0); // treat ET wall-clock as UTC
  const offset = easternOffsetMinutes(naive);    // offset near that date
  return naive - offset * 60000;
}

/**
 * Compute a week's lock window around its games.
 *   • lockAt   = the FIRST game's start (managers edit until kickoff).
 *   • unlockAt = Monday 00:00 US Eastern strictly after lockAt.
 *
 * UFA weekends are Fri/Sat/Sun, but a week occasionally has a midweek makeup /
 * opener (e.g. a Wednesday game). Locking on that midweek game would freeze the
 * week days before the real slate, so we anchor on the earliest Fri/Sat/Sun (ET)
 * game; if a week has none (all midweek), we fall back to the earliest game.
 */
function lockWindowFor(startMsList: number[]): { lockAt: number; unlockAt: number } | null {
  if (startMsList.length === 0) return null;
  const isWeekend = (ms: number) => {
    const { dow } = easternParts(ms); // Fri/Sat/Sun in ET
    return dow === 5 || dow === 6 || dow === 0;
  };
  const sorted = [...startMsList].sort((a, b) => a - b);
  const lockAt = sorted.find(isWeekend) ?? sorted[0];

  // Unlock = next Monday 00:00 ET strictly after lockAt. Anchor from the lock
  // DAY's ET midnight (not the lock instant — an evening kickoff + 12h probe
  // would roll a day), advance to the Monday's calendar date, then take that
  // date's ET midnight — DST-correct even if a shift falls in the span.
  const { y, mo, d, dow } = easternParts(lockAt);
  // Days from lockAt's ET weekday to the following Monday (1). Sun=0→+1, Mon=1→+7
  // (a Monday game locks; reopens the NEXT Monday), … Sat=6→+2.
  const daysToMonday = ((1 - dow + 7) % 7) || 7;
  const lockDayMidnight = easternMidnightUtcMs(y, mo, d);
  const mondayProbe = easternParts(lockDayMidnight + daysToMonday * DAY_MS + 12 * 3600_000);
  const unlockAt = easternMidnightUtcMs(mondayProbe.y, mondayProbe.mo, mondayProbe.d);
  return { lockAt, unlockAt };
}

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
    const w = lockWindowFor(starts);
    const lockAt: number | null = w?.lockAt ?? null;
    const unlockAt: number | null = w?.unlockAt ?? null;
    weeks.push({
      week,
      lockAt: lockAt != null ? new Date(lockAt).toISOString() : null,
      unlockAt: unlockAt != null ? new Date(unlockAt).toISOString() : null,
      gameCount: wg.length,
      // Locked = inside the Fri→Mon window.
      locked: lockAt != null && unlockAt != null ? nowMs >= lockAt && nowMs < unlockAt : false,
      complete: wg.every((g) => g.status === FINAL),
    });
  }

  return weeks.sort((a, b) => weekSortKey(a.week) - weekSortKey(b.week));
}

/**
 * The week a manager is currently setting a lineup for = the earliest week that
 * is NOT currently locked AND whose weekend hasn't already passed (unlock/Monday
 * still in the future). If all weeks are locked or past, return the last week so
 * the builder still shows something.
 */
export function activeWeek(weeks: FantasyWeek[], now: Date = new Date()): FantasyWeek | null {
  if (weeks.length === 0) return null;
  const nowMs = now.getTime();
  const editable = weeks.find((w) => {
    if (w.locked) return false;
    if (w.unlockAt == null) return true;
    return new Date(w.unlockAt).getTime() > nowMs;
  });
  return editable ?? weeks[weeks.length - 1];
}

/**
 * Weeks that count toward the cumulative score = every week that has LOCKED at
 * least once (lockAt is in the past). Its games have begun / finished, so its
 * frozen roster scores. Future (never-locked) weeks score 0.
 */
export function scorableWeeks(weeks: FantasyWeek[], now: Date = new Date()): FantasyWeek[] {
  const nowMs = now.getTime();
  return weeks.filter((w) => w.lockAt != null && nowMs >= new Date(w.lockAt).getTime());
}

/** Convenience: is this specific week locked (in its Fri→Mon window) as of now? */
export function isWeekLocked(weeks: FantasyWeek[], week: string, now: Date = new Date()): boolean {
  const w = weeks.find((x) => x.week === week);
  if (!w || w.lockAt == null || w.unlockAt == null) return false;
  const nowMs = now.getTime();
  return nowMs >= new Date(w.lockAt).getTime() && nowMs < new Date(w.unlockAt).getTime();
}

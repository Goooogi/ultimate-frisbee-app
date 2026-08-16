// Fantasy competition registry — the single place that defines which real
// competitions a contest can point at, and how each one plays.
//
// Two contest MODES:
//   • 'weekly-stats' — season leagues with per-game player statlines (UFA, PUL,
//     WUL). Weekly roster of role-assigned players (offenders/defenders),
//     scored by the SCORING matrix per locked week.
//   • 'event'        — single-tournament competitions where only event-total
//     stats exist (USAU Nationals, WFDF). One flex roster drafted from event
//     rosters, locked once at event start, scored once from event totals
//     (see event-adapter.ts).
//
// A contest row stores a snapshot of these settings in fantasy_contests.settings
// (jsonb) at creation time — the DB composition trigger reads that snapshot, so
// changing defaults here never mutates existing contests.

export type CompetitionId =
  | 'ufa'
  | 'pul'
  | 'wul'
  | 'usau-club-nationals'
  | 'usau-college-nationals'
  | 'wfdf-wucc';

export type ContestMode = 'weekly-stats' | 'event';

/** Which player pool a contest drafts from = fantasy_roster_slots.player_league. */
export type FantasyPlayerLeague = 'ufa' | 'pul' | 'wul' | 'usau' | 'wfdf';

export interface WeeklyStatsSettings {
  mode: 'weekly-stats';
  offenders: number;
  defenders: number;
}

export interface EventSettings {
  mode: 'event';
  flex: number;
  /** The real event this contest scores against (usau_events.id /
   *  wfdf_events.id), frozen at contest creation. */
  eventId?: string;
}

export type ContestSettings = WeeklyStatsSettings | EventSettings;

export interface CompetitionDef {
  id: CompetitionId;
  /** Full label for pickers/headers ("USAU Club Nationals"). */
  label: string;
  /** Compact label for chips/badges ("Club Nats"). */
  shortLabel: string;
  mode: ContestMode;
  playerLeague: FantasyPlayerLeague;
  defaultSettings: ContestSettings;
  /** weekly-stats only: league tracks yardage (UFA/WUL yes, PUL no → 0 pts). */
  hasYards: boolean;
  /** Hidden from the create-contest picker; usable only via direct code paths.
   *  WFDF/WUCC is our live test bed until Hunter opts it in. */
  testOnly: boolean;
}

const WEEKLY_DEFAULT: WeeklyStatsSettings = { mode: 'weekly-stats', offenders: 4, defenders: 3 };
const EVENT_DEFAULT: EventSettings = { mode: 'event', flex: 7 };

export const COMPETITIONS: CompetitionDef[] = [
  {
    id: 'ufa',
    label: 'UFA Season',
    shortLabel: 'UFA',
    mode: 'weekly-stats',
    playerLeague: 'ufa',
    defaultSettings: WEEKLY_DEFAULT,
    hasYards: true,
    testOnly: false,
  },
  {
    id: 'pul',
    label: 'PUL Season',
    shortLabel: 'PUL',
    mode: 'weekly-stats',
    playerLeague: 'pul',
    defaultSettings: WEEKLY_DEFAULT,
    hasYards: false,
    testOnly: false,
  },
  {
    id: 'wul',
    label: 'WUL Season',
    shortLabel: 'WUL',
    mode: 'weekly-stats',
    playerLeague: 'wul',
    defaultSettings: WEEKLY_DEFAULT,
    hasYards: true,
    testOnly: false,
  },
  {
    id: 'usau-club-nationals',
    label: 'USAU Club Nationals',
    shortLabel: 'Club Nats',
    mode: 'event',
    playerLeague: 'usau',
    defaultSettings: EVENT_DEFAULT,
    hasYards: false,
    testOnly: false,
  },
  {
    id: 'usau-college-nationals',
    label: 'USAU College Nationals',
    shortLabel: 'College Nats',
    mode: 'event',
    playerLeague: 'usau',
    defaultSettings: EVENT_DEFAULT,
    hasYards: false,
    testOnly: false,
  },
  {
    id: 'wfdf-wucc',
    label: 'WFDF WUCC',
    shortLabel: 'WUCC',
    mode: 'event',
    playerLeague: 'wfdf',
    defaultSettings: EVENT_DEFAULT,
    hasYards: false,
    testOnly: true,
  },
];

const BY_ID = new Map(COMPETITIONS.map((c) => [c.id, c]));

export function getCompetition(id: string): CompetitionDef | null {
  return BY_ID.get(id as CompetitionId) ?? null;
}

/** Competitions offered in the create-contest picker (testOnly hidden). */
export function selectableCompetitions(): CompetitionDef[] {
  return COMPETITIONS.filter((c) => !c.testOnly);
}

/** Parse a contest's stored settings jsonb, falling back to the competition
 *  default when the snapshot is missing/malformed (fail-soft on reads; the DB
 *  trigger is the write-side enforcer). */
export function parseContestSettings(def: CompetitionDef, raw: unknown): ContestSettings {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  if (obj?.mode === 'weekly-stats') {
    return {
      mode: 'weekly-stats',
      offenders: typeof obj.offenders === 'number' ? obj.offenders : WEEKLY_DEFAULT.offenders,
      defenders: typeof obj.defenders === 'number' ? obj.defenders : WEEKLY_DEFAULT.defenders,
    };
  }
  if (obj?.mode === 'event') {
    return {
      mode: 'event',
      flex: typeof obj.flex === 'number' ? obj.flex : EVENT_DEFAULT.flex,
      eventId: typeof obj.eventId === 'string' ? obj.eventId : undefined,
    };
  }
  return def.defaultSettings;
}

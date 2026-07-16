// Wire types for the UFA backend at backend.ufastats.com/web-v1/*.
// These match the actual response shapes — verified by hitting each endpoint.

// UFA's `status` is a human-readable phase string, NOT a fixed enum. Observed
// values: "Upcoming", "Final", and live phases like "First Quarter",
// "Second Quarter", "Halftime", "Third Quarter", "Fourth Quarter", "Overtime".
// There is NO literal "Live" — anything that isn't Upcoming/Final is in-play.
// Classify via isLiveStatus()/isFinalStatus() in ./format, never by `=== 'Live'`.
export type GameStatus = 'Upcoming' | 'Final' | (string & {});

export interface UfaGame {
  gameID: string;              // "2026-05-16-COL-NY"
  awayTeamID: string;          // "apex"
  awayTeamCity: string;        // "Colorado"
  awayTeamName: string;        // "Apex"
  awayTeamNameRaw: string;
  homeTeamID: string;
  homeTeamCity: string;
  homeTeamName: string;
  homeTeamNameRaw: string;
  awayScore: number;
  homeScore: number;
  status: GameStatus;
  week?: string;               // "week-4"
  ticketURL?: string;
  streamingURL?: string;
  hasRosterReport?: boolean;
  locationName?: string;
  locationURL?: string;
  startTimestamp?: string;     // ISO with offset, e.g. "2026-05-16T19:00:00-04:00"
  startTimezone?: string;      // "EDT"
  startTimeTBD?: string | null;
}

export interface UfaGamesResponse {
  games: UfaGame[];
}

export interface UfaStanding {
  divisionName: string;        // "Central"
  divisionID: string;          // "central"
  year: number;
  teamID: string;
  teamName: string;
  wins: number;
  losses: number;
  ties: number;
  pointDiff: number;
}

export interface UfaPlayerStat {
  playerID: string;
  name: string;
  gamesPlayed: number;
  scores: number;
  assists: number;
  goals: number;
  plusMinus: number;
  completions: number;
  completionPercentage: string;  // upstream returns string like "92.34"
  hockeyAssists: number;
  throwaways: number;
  stalls: number;
  drops: number;
  blocks: number;
  // Other fields exist; extend as needed.
  [k: string]: unknown;
}

export interface UfaPlayerStatsResponse {
  stats: UfaPlayerStat[];
  total: number;
  params?: Record<string, unknown>;
}

export interface UfaTeamStat {
  teamID: string;
  teamName: string;
  gamesPlayed: number;
  wins: number | string;
  losses: number | string;
  scoresFor: number | string;
  scoresAgainst: number | string;
  completions: number | string;
  turnovers: number | string;
  blocks: number | string;
  holds?: number | string;
  [k: string]: unknown;
}

export interface UfaTeamStatsResponse {
  stats: UfaTeamStat[];
  total?: number;
}

// ── Per-player endpoints ────────────────────────────────────────────────────
// Direct UFA endpoints discovered from the watchufa.com player Svelte bundle:
//   /web-v1/roster-stats-for-player?playerID=X         → year × team × regSeason rows
//   /web-v1/roster-game-stats-for-player?playerID=X&year=Y → per-game rows for one year

export interface UfaPlayerSeasonRow {
  year: number;
  teamAbbrev: string;       // e.g. "ATL", "DAL", "NY"
  regSeason: boolean;       // true = regular season, false = playoffs
  assists: number;
  goals: number;
  hockeyAssists: number;
  completions: number;
  throwaways: number;
  stalls: number;
  throwsAttempted: number;
  catches: number;
  drops: number;
  blocks: number;
  callahans: number;
  pulls: number;
  obPulls: number;
  recordedPulls: number;
  recordedPullsHangtime: number;
  gamesPlayed: number;
  oPointsPlayed: number;
  oPointsScored: number;
  dPointsPlayed: number;
  dPointsScored: number;
  secondsPlayed: number;
  yardsReceived: number;
  yardsThrown: number;
  hucksCompleted: number;
  hucksAttempted: number;
}

export interface UfaPlayerSeasonResponse {
  stats: UfaPlayerSeasonRow[];
}

export interface UfaPlayerGameRow {
  gameID: string;           // "2024-05-11-ATX-DAL"
  isHome: boolean;
  scoreHome: number;
  scoreAway: number;
  assists: number;
  goals: number;
  hockeyAssists: number;
  completions: number;
  throwaways: number;
  stalls: number;
  throwsAttempted: number;
  catches: number;
  drops: number;
  blocks: number;
  callahans: number;
  pulls: number;
  obPulls: number;
  recordedPulls: number;
  recordedPullsHangtime: number;
  oPointsPlayed: number;
  oPointsScored: number;
  dPointsPlayed: number;
  dPointsScored: number;
  secondsPlayed: number;
  yardsReceived: number;
  yardsThrown: number;
  hucksCompleted: number;
  hucksAttempted: number;
}

export interface UfaPlayerGameResponse {
  stats: UfaPlayerGameRow[];
}

/** Lightweight identity scraped from watchufa.com — the API doesn't expose name. */
export interface UfaPlayerInfo {
  playerID: string;
  name: string;
  currentTeam: string | null;  // free-text from watchufa, e.g. "Atlanta Hustle"; null if not extracted
  headshotUrl: string | null;  // watchufa profile headshot; null when the player has none (~10%)
}

// ── Per-game endpoints ───────────────────────────────────────────────────────
// Sourced from watchufa.com's game-center Svelte bundle:
//   /web-v1/game-stats?gameID=X      → team-level totals + 6 stat-leader categories
//   /web-v1/roster-reports?gameID=X  → roster availability + jersey numbers

export interface UfaGameTeamStats {
  completions: number;
  throwingAttempts: number;
  hucksCompleted: number;
  hucksAttempted: number;
  blocks: number;
  turnovers: number;
  oLineScores: number;
  oLinePoints: number;
  oLinePossessions: number;
  dLineScores: number;
  dLinePoints: number;
  dLinePossessions: number;
  redZoneScores: number;
  redZonePossessions: number;
}

export interface UfaGameStatLeader {
  playerID: string;
  firstName: string;
  lastName: string;
}

/** A leader bucket. Upstream returns `leaders` as an array of players for normal categories,
 * but occasionally (e.g. Blocks when none) sends a stray number — guard for that. */
export interface UfaGameStatLeaderBucket {
  leaders: UfaGameStatLeader[] | number;
  count: number;
}

export interface UfaGameStatCategory {
  title: string;     // "Assists" | "Goals" | "Blocks" | "Completions" | "Points Played" | "Plus/Minus"
  home: UfaGameStatLeaderBucket;
  away: UfaGameStatLeaderBucket;
}

export interface UfaGameStatsResponse {
  awayTeam: string;
  homeTeam: string;
  leaderCategories?: UfaGameStatCategory[];
  homeTeamStats?: UfaGameTeamStats;
  awayTeamStats?: UfaGameTeamStats;
}

export interface UfaRosterPlayer {
  playerID: string;
  firstName: string;
  lastName: string;
  jerseyNumber: number | string | null;
  notes: string | null;
  status: string | null;       // "Active" | "Injured" | etc.
  prevStatus: string | null;
}

export interface UfaRosterReportsResponse {
  home: UfaRosterPlayer[];
  away: UfaRosterPlayer[];
}

/** Composed per-game per-player breakdown (built by getGameBoxscore by fanning out
 * to roster-game-stats-for-player for each rostered player). `stats` is null when
 * the player wasn't in the game's stat log (DNP or pre-game pull). */
export interface UfaBoxscorePlayerRow {
  playerID: string;
  firstName: string;
  lastName: string;
  jerseyNumber: number | string | null;
  status: string | null;
  stats: UfaPlayerGameRow | null;
}

export interface UfaGameBoxscore {
  gameID: string;
  year: number;
  away: UfaBoxscorePlayerRow[];
  home: UfaBoxscorePlayerRow[];
}

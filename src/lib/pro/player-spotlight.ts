// Pro-league "Player Spotlight" — league-agnostic derivation for the two states
// shown on a pro game-detail page:
//
//   • Players to Watch (pre-game): the single best player per team by SEASON
//     production. Ranked by a per-game, scale-normalized 60/40 blend of impact
//     and (completions + yards). PUL has no yards/completions, so it falls back
//     to impact-only.
//
//   • Player of the Game (final): the single best player per team from THIS
//     game's box score, ranked by an impact score (the same model the home
//     Standout carousel uses — see lib/home/standouts.ts perfScore; keep the
//     weights in the same spirit if you tune one).
//
// UFA / PUL / WUL all feed these through a tiny normalized input shape, so each
// caller adapts its own row/roster type once and the ranking math lives here.

export type SpotlightLeague = 'ufa' | 'pul' | 'wul';

/** A resolved spotlight pick, ready to render. `profileId` is set only when we
 *  can link to a unified /players/[id] profile (UFA ids; PUL/WUL box/roster
 *  rows carry a season profile id when matched). */
export interface SpotlightPlayer {
  name: string;
  profileId: string | null;
  headshotUrl: string | null;
  /** The headline stat line, e.g. "4G · 9A · 761 yds" (game) or a season line. */
  statLine: string;
  /** Small secondary line, e.g. "12 GP · +71" (season) or null. */
  sub: string | null;
  /**
   * The same numbers as `statLine`/`sub`, but split into discrete
   * label/value pairs so the UI can lay them out as an ESPN-style stat strip
   * (value over label, evenly spaced) instead of one long wrapping sentence.
   *
   * `statLine`/`sub` are retained for any caller that wants the compact string
   * form — this is additive, not a replacement.
   */
  stats: SpotlightStat[];
}

/** One cell in the ESPN-style stat strip: a short label and its value. */
export interface SpotlightStat {
  /** Short uppercase label, e.g. "G", "A", "BLK", "YDS", "GP", "+/-". */
  label: string;
  /** Preformatted value, e.g. "22", "6369", "+59". */
  value: string;
}

// ─── Normalized inputs ──────────────────────────────────────────────────────

/** One player's SEASON totals for the watch ranking. yards/completions are
 *  optional — PUL supplies neither and is scored on impact alone. */
export interface SeasonInput {
  name: string;
  profileId: string | null;
  headshotUrl: string | null;
  gamesPlayed: number;
  goals: number;
  assists: number;
  blocks: number;
  plusMinus: number;
  /** Season total yards (UFA/WUL). Omit/null for PUL. */
  yards?: number | null;
  /** Season total completions (UFA). Omit/null for PUL/WUL rosters. */
  completions?: number | null;
}

/** One player's SINGLE-GAME line for the player-of-the-game ranking. */
export interface GameInput {
  name: string;
  profileId: string | null;
  headshotUrl: string | null;
  goals: number;
  assists: number;
  blocks: number;
  plusMinus: number;
  /** Game yards (UFA/WUL). Omit/null for PUL. */
  yards?: number | null;
}

// ─── Scoring ────────────────────────────────────────────────────────────────

/** Counting-stat impact — the shared core of both rankings. Blocks weighted
 *  highest so a defensive game still surfaces (mirrors the standouts model). */
function impact(goals: number, assists: number, blocks: number): number {
  return goals * 2.2 + assists * 2.0 + blocks * 2.6;
}

/**
 * Player-of-the-game score for a single game line: impact + plus/minus + yards.
 * Higher is better; one winner per team.
 */
function gameScore(g: GameInput): number {
  let s = impact(g.goals, g.assists, g.blocks) + g.plusMinus * 1.4;
  if (g.yards != null) s += g.yards / 100; // ~250 yds → +2.5
  return s;
}

/**
 * Players-to-watch score for a season line: a per-game, scale-normalized 60/40
 * blend of impact and (completions + yards). Per-game so a 5-game star isn't
 * buried by a 12-game grinder; yards/completions are scaled into impact's range
 * (yards/100, completions/10) before the blend so the 0.4 term is comparable.
 *
 *   impactPG = impact / GP
 *   cmpYdsPG = (yards/100 + completions/10) / GP
 *   score    = 0.6·impactPG + 0.4·cmpYdsPG
 *
 * PUL supplies neither yards nor completions → the 0.4 term is 0 and the pick
 * is effectively impact-only, which is the intended fallback.
 */
function watchScore(p: SeasonInput): number {
  const gp = Math.max(1, p.gamesPlayed);
  const impactPG = impact(p.goals, p.assists, p.blocks) / gp;
  const cmpYds = (p.yards ?? 0) / 100 + (p.completions ?? 0) / 10;
  const cmpYdsPG = cmpYds / gp;
  return 0.6 * impactPG + 0.4 * cmpYdsPG;
}

// ─── Formatting ─────────────────────────────────────────────────────────────

/** "4G · 9A · 2Blk" (+ " · 761 yds" when yards are present + positive). */
function statLineOf(goals: number, assists: number, blocks: number, yards?: number | null): string {
  const parts = [`${goals}G`, `${assists}A`, `${blocks}Blk`];
  if (yards != null && yards > 0) parts.push(`${Math.round(yards)} yds`);
  return parts.join(' · ');
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

/**
 * Build the ESPN-style stat cells. Mirrors statLineOf()/sub exactly — same
 * numbers, just split so the UI can column them. Yards are omitted when absent
 * or zero (PUL supplies none), matching statLineOf's behavior.
 *
 * ORDER MATTERS. `GP` leads (when present) so the season line reads
 * `GP · G · A` / `BLK · YDS · +/-` in the 3-up grid — the conventional
 * stat-line order.
 *
 * Previously GP sat 5th, which put goals in the grid's top-left and GP in the
 * middle of row two. In a 3-across layout that made the goals number look like
 * a games count (Kyle Henke's 2026 line read as "22 games" when 22 was goals
 * and GP was 12). Leading with GP removes the ambiguity.
 *
 * Player-of-the-game lines pass no gamesPlayed (a single game), so they simply
 * start at G — no empty leading cell.
 */
function statCellsOf(opts: {
  goals: number;
  assists: number;
  blocks: number;
  yards?: number | null;
  plusMinus: number;
  gamesPlayed?: number | null;
}): SpotlightStat[] {
  const cells: SpotlightStat[] = [];
  if (opts.gamesPlayed != null && opts.gamesPlayed > 0) {
    cells.push({ label: 'GP', value: String(opts.gamesPlayed) });
  }
  cells.push(
    { label: 'G', value: String(opts.goals) },
    { label: 'A', value: String(opts.assists) },
    { label: 'BLK', value: String(opts.blocks) },
  );
  if (opts.yards != null && opts.yards > 0) {
    cells.push({ label: 'YDS', value: String(Math.round(opts.yards)) });
  }
  cells.push({ label: '+/-', value: signed(opts.plusMinus) });
  return cells;
}

// ─── Public pickers ─────────────────────────────────────────────────────────

/**
 * The single Player of the Game for one team, or null if the side has no usable
 * box rows (all-zero / empty). Ties break on the first row (already the caller's
 * order). `league` is accepted for symmetry / future per-league nuance.
 */
export function pickPlayerOfGame(rows: GameInput[], _league: SpotlightLeague): SpotlightPlayer | null {
  let best: GameInput | null = null;
  let bestScore = -Infinity;
  for (const r of rows) {
    const s = gameScore(r);
    if (s > bestScore) {
      bestScore = s;
      best = r;
    }
  }
  // Guard against an empty side or a side whose best line is genuinely nothing
  // (score ≤ 0 means no goals/assists/blocks and non-positive +/- and no yards).
  if (!best || bestScore <= 0) return null;
  return {
    name: best.name,
    profileId: best.profileId,
    headshotUrl: best.headshotUrl,
    statLine: statLineOf(best.goals, best.assists, best.blocks, best.yards),
    sub: signed(best.plusMinus) + ' +/-',
    stats: statCellsOf({
      goals: best.goals,
      assists: best.assists,
      blocks: best.blocks,
      yards: best.yards,
      plusMinus: best.plusMinus,
    }),
  };
}

/**
 * The single Player to Watch for one team, or null if the roster is empty / has
 * no one with a game played.
 */
export function pickPlayerToWatch(roster: SeasonInput[], _league: SpotlightLeague): SpotlightPlayer | null {
  let best: SeasonInput | null = null;
  let bestScore = -Infinity;
  for (const p of roster) {
    if (p.gamesPlayed <= 0) continue;
    const s = watchScore(p);
    if (s > bestScore) {
      bestScore = s;
      best = p;
    }
  }
  if (!best || bestScore <= 0) return null;
  return {
    name: best.name,
    profileId: best.profileId,
    headshotUrl: best.headshotUrl,
    statLine: statLineOf(best.goals, best.assists, best.blocks, best.yards),
    sub: `${best.gamesPlayed} GP · ${signed(best.plusMinus)}`,
    stats: statCellsOf({
      goals: best.goals,
      assists: best.assists,
      blocks: best.blocks,
      yards: best.yards,
      plusMinus: best.plusMinus,
      gamesPlayed: best.gamesPlayed,
    }),
  };
}

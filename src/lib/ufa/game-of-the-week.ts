// "Game of the Week" picker.
//
// The UFA API doesn't expose a featured-game flag, so we derive one. The goal
// is the most evenly-matched upcoming game between two good teams — the kind
// of headline matchup you'd put on a sports homepage.
//
// Algorithm:
//   1. Scope to the current week's Upcoming/Live games. If that yields
//      nothing (off-week, weekend over), fall back to the next non-empty
//      future week so the hero never goes empty mid-season.
//   2. For each candidate, score the matchup using both teams' standings:
//        quality   = mean(awayWinPct, homeWinPct)        — both teams good?
//        closeness = 1 - |awayWinPct - homeWinPct|        — well matched?
//        score     = quality × closeness
//   3. A team is "rated" once it has >= MIN_GAMES_PLAYED games. Below that
//      the win % is too noisy to trust, so we drop the candidate down to a
//      baseline score (any rated matchup beats it) but still keep it in
//      contention so early-season Sundays aren't empty.
//   4. Tie-break (per Hunter): prefer games with `streamingURL` set —
//      showcases watchable matchups.
//   5. If a Live game exists in the current week, it always wins. People
//      open the homepage during the live window expecting to land on the
//      game that's happening now.

import type { UfaGame, UfaStanding } from './types';
import { gameUiState } from './format';

export const MIN_GAMES_PLAYED = 2;
const UNRATED_BASELINE = -1; // any rated matchup beats this.

interface ScoredGame {
  game: UfaGame;
  score: number;
  hasStream: boolean;
  startTs: number;
}

/**
 * Picks the headline game for the homepage hero. Returns undefined when the
 * input has no Live/Upcoming games at all (off-season).
 */
export function pickGameOfTheWeek(
  games: UfaGame[],
  standings: UfaStanding[],
): UfaGame | undefined {
  if (games.length === 0) return undefined;

  // Live always wins — people opening the homepage mid-game expect the live
  // matchup front and center. If multiple live games, pick the highest-
  // scoring by quality × closeness (same metric).
  const liveGames = games.filter((g) => gameUiState(g).isLive);
  if (liveGames.length > 0) {
    const scored = liveGames.map((g) => scoreGame(g, standings));
    return pickBest(scored).game;
  }

  // Otherwise: current week first, falling back to subsequent weeks until we
  // find one that has upcoming games. Sorting by `week` lexically works for
  // the UFA's "week-N" labels because N is always padded the same way in a
  // season (single digit values are still numerically smaller as strings up
  // to "week-9"; we sort numerically below to be safe across week-10+).
  const upcoming = games.filter((g) => gameUiState(g).isUpcoming);
  if (upcoming.length === 0) return undefined;

  const byWeek = groupByWeek(upcoming);
  const orderedWeeks = Array.from(byWeek.keys()).sort((a, b) => weekNum(a) - weekNum(b));
  for (const week of orderedWeeks) {
    const slate = byWeek.get(week)!;
    if (slate.length === 0) continue;
    const scored = slate.map((g) => scoreGame(g, standings));
    return pickBest(scored).game;
  }

  return upcoming[0];
}

/**
 * "Top" hero game — the ongoing story. Prefers the best LIVE game (by the same
 * quality × closeness metric); when nothing is live, falls back to the MOST
 * RECENT final so the slide always has something current to show. Returns
 * undefined only when there are no live/final games at all (pure off-season).
 *
 * Pairs with pickUpcomingGameOfWeek(): together they let the homepage carousel
 * show a "Top" (live/recent) slide AND a distinct "Game of the week" (best
 * upcoming) slide, instead of one slide that has to choose.
 */
export function pickTopGame(
  games: UfaGame[],
  standings: UfaStanding[],
): UfaGame | undefined {
  if (games.length === 0) return undefined;

  const live = games.filter((g) => gameUiState(g).isLive);
  if (live.length > 0) {
    return pickBest(live.map((g) => scoreGame(g, standings))).game;
  }

  // No live game → most recent final (latest start timestamp among finals).
  const finals = games.filter((g) => gameUiState(g).isFinal);
  if (finals.length === 0) return undefined;
  return [...finals].sort(
    (a, b) =>
      (b.startTimestamp ? new Date(b.startTimestamp).getTime() : 0) -
      (a.startTimestamp ? new Date(a.startTimestamp).getTime() : 0),
  )[0];
}

/**
 * Best UPCOMING marquee matchup — the "Game of the week" proper, WITHOUT the
 * live-game override that pickGameOfTheWeek applies. Scoped to the soonest week
 * that has upcoming games. Returns undefined when nothing is upcoming (so the
 * caller can drop the slide). Use this alongside pickTopGame() so the live game
 * lives on the "Top" slide and this stays the forward-looking headline.
 */
export function pickUpcomingGameOfWeek(
  games: UfaGame[],
  standings: UfaStanding[],
): UfaGame | undefined {
  const upcoming = games.filter((g) => gameUiState(g).isUpcoming);
  if (upcoming.length === 0) return undefined;

  const byWeek = groupByWeek(upcoming);
  const orderedWeeks = Array.from(byWeek.keys()).sort((a, b) => weekNum(a) - weekNum(b));
  for (const week of orderedWeeks) {
    const slate = byWeek.get(week)!;
    if (slate.length === 0) continue;
    return pickBest(slate.map((g) => scoreGame(g, standings))).game;
  }
  return upcoming[0];
}

// ── scoring ────────────────────────────────────────────────────────────

function scoreGame(game: UfaGame, standings: UfaStanding[]): ScoredGame {
  const away = standings.find((s) => s.teamID === game.awayTeamID);
  const home = standings.find((s) => s.teamID === game.homeTeamID);

  const score = matchupScore(away, home);
  return {
    game,
    score,
    hasStream: Boolean(game.streamingURL),
    startTs: game.startTimestamp ? new Date(game.startTimestamp).getTime() : 0,
  };
}

function matchupScore(
  a: UfaStanding | undefined,
  b: UfaStanding | undefined,
): number {
  if (!a || !b) return UNRATED_BASELINE;
  const aGp = a.wins + a.losses + a.ties;
  const bGp = b.wins + b.losses + b.ties;
  if (aGp < MIN_GAMES_PLAYED || bGp < MIN_GAMES_PLAYED) return UNRATED_BASELINE;

  const aPct = winPct(a);
  const bPct = winPct(b);
  const quality = (aPct + bPct) / 2;
  const closeness = 1 - Math.abs(aPct - bPct);
  return quality * closeness;
}

function winPct(s: UfaStanding): number {
  const gp = s.wins + s.losses + s.ties;
  if (gp === 0) return 0;
  // Ties count as half a win — matches standard UFA standings math.
  return (s.wins + s.ties * 0.5) / gp;
}

// ── tie-breaks + grouping ──────────────────────────────────────────────

function pickBest(scored: ScoredGame[]): ScoredGame {
  // Sort: score desc → streamable desc → soonest start (so a tied late game
  // doesn't beat a tied earlier game if neither streams).
  return [...scored].sort((x, y) => {
    if (y.score !== x.score) return y.score - x.score;
    if (x.hasStream !== y.hasStream) return x.hasStream ? -1 : 1;
    return x.startTs - y.startTs;
  })[0];
}

function groupByWeek(games: UfaGame[]): Map<string, UfaGame[]> {
  const m = new Map<string, UfaGame[]>();
  for (const g of games) {
    const key = g.week ?? '';
    if (!m.has(key)) m.set(key, []);
    m.get(key)!.push(g);
  }
  return m;
}

function weekNum(week: string): number {
  const m = week.match(/(\d+)/);
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
}

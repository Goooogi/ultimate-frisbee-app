// Player ratings — the ranked player list for event contests (Hunter,
// 2026-10-09). fantasy_player_ratings holds one row per player in the event's
// draft pool, rebuilt in the background by fantasy_rebuild_player_ratings
// (hourly cron, only when the pool changed or the rows are a day old). Public
// read. Autodraft takes the team's queue first, then the best-ranked player
// still available — fantasy_draft_best_available reads the same rows.
//
// The order, from the player's past events at the event's own level (Club for
// Club Nationals, College for College Nationals):
//   1. Average goals + assists per event, over past events where the player's
//      team had stats tracked (mostly Nationals, the U.S. Open and the Pro
//      Championships). USAU tracks no blocks.
//   2. Nationals attended
//   3. TCT events attended (U.S. Open, Pro Championships)
//   4. Pro-Elite Challenge, then Elite-Select Challenge, then Select Flight
//      Invite events attended
//   5. Everyone else, A–Z
// USAU issues a new player id every season, so a career is every stint with
// the player's name (the same rule the player profile uses).

import { createClient } from '@/lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import { EVENT_SCORING, scoreEventLine } from './event-adapter';
import type { ContestView } from './leagues';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>;
function client(): AnyClient {
  return createClient() as unknown as AnyClient;
}

/** S = has scored at past events · A = Nationals/TCT experience · B = flight
 *  events only · C = no history at this level. */
export type RatingTier = 'S' | 'A' | 'B' | 'C';

export interface PlayerRating {
  playerLeague: string;
  playerId: string;
  playerName: string;
  teamName: string | null;
  /** 1 = best in the event's pool. Gaps appear as players are drafted. */
  rank: number;
  tier: RatingTier;
  /** Past events where the player's team had stats tracked. */
  statEvents: number;
  avgGoals: number;
  avgAssists: number;
  nationals: number;
  tctEvents: number;
  proEliteEvents: number;
  eliteSelectEvents: number;
  selectEvents: number;
}

export type RatingMap = Map<string, PlayerRating>;

export function ratingKey(playerLeague: string, playerId: string): string {
  return `${playerLeague}:${playerId}`;
}

function mapRating(r: Record<string, unknown>): PlayerRating {
  return {
    playerLeague: r.player_league as string,
    playerId: r.player_id as string,
    playerName: r.player_name as string,
    teamName: (r.team_name as string | null) ?? null,
    rank: r.rank as number,
    tier: r.tier as RatingTier,
    statEvents: Number(r.stat_events ?? 0),
    avgGoals: Number(r.avg_goals ?? 0),
    avgAssists: Number(r.avg_assists ?? 0),
    nationals: Number(r.nationals ?? 0),
    tctEvents: Number(r.tct_events ?? 0),
    proEliteEvents: Number(r.pro_elite_events ?? 0),
    eliteSelectEvents: Number(r.elite_select_events ?? 0),
    selectEvents: Number(r.select_events ?? 0),
  };
}

const PAGE = 1000; // PostgREST's per-response row cap; a Nationals pool is ~1,250.

/** Every rated player in the contest's pool, best first. [] for weekly
 *  contests and for events whose ratings haven't been built yet. */
export async function getContestRatings(contest: ContestView): Promise<PlayerRating[]> {
  if (contest.settings.mode !== 'event' || !contest.settings.eventId) return [];
  const out: PlayerRating[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client()
      .from('fantasy_player_ratings')
      .select(
        'player_league, player_id, player_name, team_name, rank, tier, stat_events, avg_goals, avg_assists, nationals, tct_events, pro_elite_events, elite_select_events, select_events',
      )
      .eq('event_id', contest.settings.eventId)
      .eq('player_league', contest.competitionDef.playerLeague)
      .order('rank')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as Record<string, unknown>[];
    for (const r of rows) out.push(mapRating(r));
    if (rows.length < PAGE) return out;
  }
}

export function toRatingMap(ratings: PlayerRating[]): RatingMap {
  return new Map(ratings.map((r) => [ratingKey(r.playerLeague, r.playerId), r]));
}

/** Projected fantasy points for one event: the player's per-event averages
 *  scored like a real event line, without the team-placement bonus. Null when
 *  the player has no tracked events. */
export function projectedEventPoints(r: PlayerRating): number | null {
  if (r.statEvents === 0) return null;
  return Math.round(scoreEventLine({ goals: r.avgGoals, assists: r.avgAssists, callahans: 0 }, null) * 10) / 10;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** One short line on why the player sits where they do: scoring when there is
 *  any, then the strongest experience signal. */
export function ratingSummary(r: PlayerRating): string {
  const parts: string[] = [];
  if (r.statEvents > 0) parts.push(`${(r.avgGoals + r.avgAssists).toFixed(1)} G+A per event`);
  if (r.nationals > 0) parts.push(`${r.nationals}× Nationals`);
  else if (r.tctEvents > 0) parts.push(plural(r.tctEvents, 'TCT event', 'TCT events'));
  else if (r.proEliteEvents > 0) parts.push(plural(r.proEliteEvents, 'Pro-Elite event', 'Pro-Elite events'));
  else if (r.eliteSelectEvents > 0) parts.push(plural(r.eliteSelectEvents, 'Elite-Select event', 'Elite-Select events'));
  else if (r.selectEvents > 0) parts.push(plural(r.selectEvents, 'Select Flight event', 'Select Flight events'));
  return parts.length > 0 ? parts.join(' · ') : 'No past events on record';
}

/** Plain-language explainer for the list header and the rules modal. College
 *  has no Triple Crown Tour, so its second line stops at Nationals. */
export function ratingExplainer(competition: ContestView['competition']): string[] {
  const club = competition === 'usau-club-nationals';
  return [
    club
      ? 'Players are ranked by average goals + assists per event at past USAU Club events where stats were kept — mostly Nationals, the U.S. Open and the Pro Championships.'
      : 'Players are ranked by average goals + assists per event at past USAU College events where stats were kept — mostly College Nationals.',
    club
      ? 'Players without stats are ranked by Nationals attended, then TCT events (U.S. Open, Pro Championships), then Pro-Elite, Elite-Select and Select Flight events.'
      : 'Players without stats are ranked by Nationals attended.',
    `Proj = those averages scored like this event (${EVENT_SCORING.goal} per goal, ${EVENT_SCORING.assist} per assist), before any team-finish bonus.`,
    'If your clock runs out, autodraft picks for you: your queue first, then the top-ranked player left.',
  ];
}

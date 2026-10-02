// Recompute one event's usau_event_teams.final_placement from its bracket games
// (Feature Backlog #18). WRITE-PATH ONLY: call after an ingest wrote the event's
// games, never from a page render or read RPC (app health rule #1).
//
// Skips while any bracket game is still scheduled/in progress. After that it
// recomputes on every call and writes only the rows that change (usually none,
// ~3 indexed reads per call). A derived place replaces a stored one; a stored
// place is set NULL only when the checks prove it wrong — it collides with the
// division's places, or the team's results contradict any single place — never
// just because the current games no longer produce it.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  gameDivision,
  isBracketGame,
  planEventPlacements,
  type DerivePlacementGame,
  type PlacementTeam,
} from './derive-placement.ts';

// One event's final + cancelled games fit a single PostgREST page (the largest is ~340).
const PAGE = 1000;

interface GameRow {
  status: string;
  team_a_id: string | null;
  team_b_id: string | null;
  score_a: number | null;
  score_b: number | null;
  winner_team_id: string | null;
  round: string;
  bracket_name: string | null;
  bracket_stage: string | null;
  bracket_stage_index: number | null;
  usau_game_id: string | null;
  next_usau_game_id: string | null;
  scheduled_at: string | null;
  team_a: PlacementTeam | null;
  team_b: PlacementTeam | null;
}

export async function refreshEventPlacements(
  db: SupabaseClient,
  eventId: string,
): Promise<{ written: number; skipped?: string }> {
  const { data: open, error: openErr } = await db
    .from('usau_games')
    .select('bracket_name')
    .eq('event_id', eventId)
    .in('status', ['scheduled', 'in_progress']);
  if (openErr) throw new Error(`placements ${eventId}: open games: ${openErr.message}`);
  if ((open ?? []).some((g: { bracket_name: string | null }) => isBracketGame(g.bracket_name))) {
    return { written: 0, skipped: 'bracket unfinished' };
  }

  const { data: games, error: gamesErr } = await db
    .from('usau_games')
    .select(
      'status, team_a_id, team_b_id, score_a, score_b, winner_team_id, round, bracket_name, ' +
        'bracket_stage, bracket_stage_index, usau_game_id, next_usau_game_id, scheduled_at, ' +
        'team_a:usau_teams!team_a_id(gender_division, competition_level), ' +
        'team_b:usau_teams!team_b_id(gender_division, competition_level)',
    )
    .eq('event_id', eventId)
    // cancelled games only fill out a bracket's shape (derive-placement.ts)
    .in('status', ['final', 'cancelled'])
    .order('id')
    .range(0, PAGE - 1);
  if (gamesErr) throw new Error(`placements ${eventId}: games: ${gamesErr.message}`);
  if ((games ?? []).length === PAGE) throw new Error(`placements ${eventId}: ${PAGE}+ games — page this read`);

  const { data: teams, error: teamsErr } = await db
    .from('usau_event_teams')
    .select('team_id, final_placement')
    .eq('event_id', eventId);
  if (teamsErr) throw new Error(`placements ${eventId}: event teams: ${teamsErr.message}`);
  const stored = new Map<string, number | null>(
    (teams ?? []).map((r: { team_id: string; final_placement: number | null }) => [r.team_id, r.final_placement]),
  );

  const input: DerivePlacementGame[] = ((games ?? []) as unknown as GameRow[]).map((g) => ({
    teamAId: g.team_a_id,
    teamBId: g.team_b_id,
    scoreA: g.score_a,
    scoreB: g.score_b,
    winnerTeamId: g.winner_team_id,
    round: g.round,
    bracketName: g.bracket_name,
    division: gameDivision(g.team_a, g.team_b),
    scheduledAt: g.scheduled_at,
    status: g.status,
    bracketStage: g.bracket_stage,
    bracketStageIndex: g.bracket_stage_index,
    usauGameId: g.usau_game_id,
    nextUsauGameId: g.next_usau_game_id,
  }));
  const { changes } = planEventPlacements(input, stored);

  for (const [teamId, c] of changes) {
    const row = db
      .from('usau_event_teams')
      .update({ final_placement: c.to })
      .eq('event_id', eventId)
      .eq('team_id', teamId);
    const { error } = await (c.from == null ? row.is('final_placement', null) : row.eq('final_placement', c.from));
    if (error) throw new Error(`placements ${eventId}: update ${teamId}: ${error.message}`);
  }
  return { written: changes.size };
}

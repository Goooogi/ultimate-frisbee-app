-- Structural guard against duplicate games from the two ingest pipelines (HTML
-- scraper + ultirzr), which assign the SAME physical game different ids/rounds.
-- Natural identity = (event, the two teams order-independent, kickoff time,
-- bracket). Excludes rows with a null team side (TBD bracket feeders share a
-- null and would false-collide) and null time (undated placeholders). Two teams
-- CAN legitimately meet twice in one event — but not at the same time in the
-- same bracket, so this never rejects a real distinct game (verified: 0 groups
-- span conflicting usau_game_ids).
CREATE UNIQUE INDEX IF NOT EXISTS usau_games_natural_key_uidx
ON public.usau_games (
  event_id,
  LEAST(team_a_id, team_b_id),
  GREATEST(team_a_id, team_b_id),
  scheduled_at,
  bracket_name
)
WHERE team_a_id IS NOT NULL
  AND team_b_id IS NOT NULL
  AND scheduled_at IS NOT NULL;
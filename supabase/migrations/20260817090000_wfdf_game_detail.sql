-- WFDF per-game detail: point-by-point goal log + per-player game stats.
--
-- Source: {origin}{STATIC_CACHE_BASE_URL}{season}_games_{game_id}.json (modern
-- static-cache events only — legacy Ultiorganizer events have no per-game
-- files). `goals` powers the matchup screen's Game Progress chart; the
-- home/visitor scoreboards power per-game player stats. Scorer/assist resolve
-- to names via wfdf_rosters (event_id, wfdf_player_id).

CREATE TABLE wfdf_game_goals (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id        uuid NOT NULL REFERENCES wfdf_games(id) ON DELETE CASCADE,
  event_id       uuid NOT NULL REFERENCES wfdf_events(id) ON DELETE CASCADE,
  num            integer NOT NULL,          -- 0-based point index within the game
  time_s         integer,                   -- elapsed game seconds at the goal
  -- Real UTC (unlike wfdf_games.scheduled_at, which stores venue-local wall
  -- clock): goal timestamps in the source are genuinely UTC-shifted.
  scored_at      timestamptz,
  is_home_goal   boolean NOT NULL,
  is_callahan    boolean NOT NULL DEFAULT false,
  home_score     integer NOT NULL,          -- running score AFTER this goal
  away_score     integer NOT NULL,
  scorer_wfdf_player_id integer,
  assist_wfdf_player_id integer,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, num)
);

CREATE TABLE wfdf_game_player_stats (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id        uuid NOT NULL REFERENCES wfdf_games(id) ON DELETE CASCADE,
  event_id       uuid NOT NULL REFERENCES wfdf_events(id) ON DELETE CASCADE,
  team_id        uuid REFERENCES wfdf_teams(id) ON DELETE CASCADE,
  wfdf_player_id integer NOT NULL,
  jersey_number  text,
  goals          integer NOT NULL DEFAULT 0,   -- source 'done'
  assists        integer NOT NULL DEFAULT 0,   -- source 'fedin'
  callahans      integer NOT NULL DEFAULT 0,
  total          integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, wfdf_player_id)
);

-- Detail-sync bookkeeping: goals_count lets the ingest skip completed games
-- whose goal log is already complete (goals_count = home+away score). Games
-- that were never live-scored keep goals_count 0 and simply refetch on each
-- live refresh — bounded, since live refresh only runs in the event window.
ALTER TABLE wfdf_games ADD COLUMN IF NOT EXISTS goals_count integer;
ALTER TABLE wfdf_games ADD COLUMN IF NOT EXISTS detail_synced_at timestamptz;

CREATE INDEX idx_wfdf_game_goals_game   ON wfdf_game_goals(game_id);
CREATE INDEX idx_wfdf_game_goals_event  ON wfdf_game_goals(event_id);
CREATE INDEX idx_wfdf_game_pstats_game  ON wfdf_game_player_stats(game_id);
CREATE INDEX idx_wfdf_game_pstats_event ON wfdf_game_player_stats(event_id);

-- RLS: public read-only, service-role writes (matches every other wfdf_* table).
ALTER TABLE wfdf_game_goals        ENABLE ROW LEVEL SECURITY;
ALTER TABLE wfdf_game_player_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY wfdf_game_goals_read        ON wfdf_game_goals        FOR SELECT USING (true);
CREATE POLICY wfdf_game_player_stats_read ON wfdf_game_player_stats FOR SELECT USING (true);


-- ─────────────────────────────────────────────────────────────────────────────
-- twelve_oh_players
-- One row per (player_id, team_slug, year). Backfill writes via service role;
-- the browser reads via anon key + world-readable RLS (mirrors usau_* pattern).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.twelve_oh_players (
  -- Identity (natural PK from UFA API)
  player_id         text        NOT NULL,   -- UFA playerID e.g. "bjagt"
  team_slug         text        NOT NULL,   -- e.g. "empire"  (from TEAM_META)
  year              smallint    NOT NULL,

  -- Display identity
  name              text        NOT NULL,
  team_abbr         text        NOT NULL,   -- e.g. "NY"
  team_internal_id  integer     NOT NULL,   -- UFA internalID for API calls

  -- Raw counting stats (season totals, ≥ 3 GP gate enforced by backfill)
  games_played          integer NOT NULL DEFAULT 0,
  goals                 integer NOT NULL DEFAULT 0,
  assists               integer NOT NULL DEFAULT 0,
  blocks                integer NOT NULL DEFAULT 0,
  hockey_assists        integer NOT NULL DEFAULT 0,
  completions           integer NOT NULL DEFAULT 0,
  completion_pct        numeric(6,3),           -- NULL when < 50 completions (low volume)
  yards_thrown          integer NOT NULL DEFAULT 0,
  yards_received        integer NOT NULL DEFAULT 0,
  plus_minus            integer NOT NULL DEFAULT 0,
  hucks_completed       integer NOT NULL DEFAULT 0,
  huck_pct              numeric(6,3),           -- informational only; not rated
  turnovers             integer NOT NULL DEFAULT 0,   -- throwaways

  -- Component z-scores (stored for transparency / future tuning)
  z_goals           numeric(8,4),
  z_assists         numeric(8,4),
  z_blocks          numeric(8,4),
  z_hockey_assists  numeric(8,4),
  z_yards_thrown    numeric(8,4),
  z_yards_received  numeric(8,4),
  z_plus_minus      numeric(8,4),
  z_completion_pct  numeric(8,4),   -- 0 when completions < 50

  -- Final score (0–100)
  player_score      numeric(6,2)  NOT NULL DEFAULT 0,

  -- Audit
  backfill_version  integer       NOT NULL DEFAULT 1,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now(),

  PRIMARY KEY (player_id, team_slug, year)
);

COMMENT ON TABLE public.twelve_oh_players IS
  '12-0 mini-game reference data. One row per UFA player × team × year. '
  'Backfill writes via service role; world-readable via anon. '
  'player_score is a 0–100 composite rating against all-time UFA baselines.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────────────────────────────────────

-- Spin query: "give me all (team, year) pairs" → cheap distinct
CREATE INDEX IF NOT EXISTS idx_twelve_oh_players_team_year
  ON public.twelve_oh_players (team_slug, year);

-- Roster fetch: "all players for this (team, year)"
CREATE INDEX IF NOT EXISTS idx_twelve_oh_players_roster
  ON public.twelve_oh_players (team_slug, year, player_score DESC);

-- Top-score lookups / leaderboard (backfill verification, future features)
CREATE INDEX IF NOT EXISTS idx_twelve_oh_players_score
  ON public.twelve_oh_players (player_score DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS — world-readable, no client writes (mirrors usau_* pattern exactly)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.twelve_oh_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY twelve_oh_players_select_public
  ON public.twelve_oh_players
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- No INSERT / UPDATE / DELETE policies for anon or authenticated.
-- Backfill uses the service role key which bypasses RLS entirely.

-- ─────────────────────────────────────────────────────────────────────────────
-- twelve_oh_baseline
-- One row (the canonical all-time baseline computed during backfill).
-- Stored so the client can verify the constants baked into rating.ts.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.twelve_oh_baseline (
  id                  integer     PRIMARY KEY DEFAULT 1,   -- singleton; always id=1
  player_seasons      integer     NOT NULL,   -- number of qualifying rows (≥3 GP)
  mean_goals          numeric(10,4) NOT NULL,
  std_goals           numeric(10,4) NOT NULL,
  mean_assists        numeric(10,4) NOT NULL,
  std_assists         numeric(10,4) NOT NULL,
  mean_blocks         numeric(10,4) NOT NULL,
  std_blocks          numeric(10,4) NOT NULL,
  mean_hockey_assists numeric(10,4) NOT NULL,
  std_hockey_assists  numeric(10,4) NOT NULL,
  mean_yards_thrown   numeric(10,4) NOT NULL,
  std_yards_thrown    numeric(10,4) NOT NULL,
  mean_yards_received numeric(10,4) NOT NULL,
  std_yards_received  numeric(10,4) NOT NULL,
  mean_plus_minus     numeric(10,4) NOT NULL,
  std_plus_minus      numeric(10,4) NOT NULL,
  mean_completion_pct numeric(10,4) NOT NULL,
  std_completion_pct  numeric(10,4) NOT NULL,  -- among completions >= 50 only
  -- raw_score distribution (for score normalization)
  raw_score_min       numeric(10,4) NOT NULL,
  raw_score_max       numeric(10,4) NOT NULL,
  raw_score_p5        numeric(10,4) NOT NULL,  -- 5th percentile
  raw_score_p95       numeric(10,4) NOT NULL,  -- 95th percentile
  computed_at         timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT twelve_oh_baseline_singleton CHECK (id = 1)
);

COMMENT ON TABLE public.twelve_oh_baseline IS
  'Singleton row (id=1) storing the all-time UFA baseline used to compute '
  'z-scores and normalize player_score to 0–100. Rewritten on each backfill run.';

ALTER TABLE public.twelve_oh_baseline ENABLE ROW LEVEL SECURITY;

CREATE POLICY twelve_oh_baseline_select_public
  ON public.twelve_oh_baseline
  FOR SELECT
  TO anon, authenticated
  USING (true);

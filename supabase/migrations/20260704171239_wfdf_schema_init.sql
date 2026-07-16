-- ─── WFDF (World Flying Disc Federation) "Worlds" results schema ───
-- Mirrors the usau_* shape but event-centric (each Worlds event is a distinct
-- tournament with its own division set). Source: the WFDF results static-JSON
-- cache (see memory project_wfdf_results_source). All ids from WFDF are
-- per-event integers; we keep them as source ids + our own uuid PKs.

-- Enums (mirror USAU conventions where sensible).
CREATE TYPE wfdf_event_kind AS ENUM (
  'club', 'national', 'beach', 'junior', 'u24', 'masters', 'other'
);
CREATE TYPE wfdf_game_status AS ENUM (
  'scheduled', 'in_progress', 'completed', 'forfeit', 'cancelled'
);

-- ── Events ──────────────────────────────────────────────────────────────────
CREATE TABLE wfdf_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- WFDF season id, e.g. 'wmucc2026' (LIVE_SEASON_ID lowercased+alnum). Unique.
  season_id      text NOT NULL UNIQUE,
  -- Slug used in our URLs (/wfdf/events/{slug}); defaults to season_id.
  slug           text NOT NULL UNIQUE,
  name           text NOT NULL,
  short_name     text,
  year           integer NOT NULL,
  kind           wfdf_event_kind NOT NULL DEFAULT 'other',
  location       text,
  start_date     date,
  end_date       date,
  is_national_teams boolean NOT NULL DEFAULT false,
  logo_url       text,
  -- The self-describing source base + static path, so re-ingest needs no guess.
  source_origin  text,             -- e.g. https://wmucc.wfdf.sport
  static_base    text,             -- e.g. /live/data/  or /wjuc-2026/live/data/
  last_scraped_at    timestamptz,
  last_scraped_status text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- ── Divisions (per-event "series") ──────────────────────────────────────────
CREATE TABLE wfdf_divisions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       uuid NOT NULL REFERENCES wfdf_events(id) ON DELETE CASCADE,
  wfdf_series_id integer NOT NULL,          -- source series_id (per event)
  name           text NOT NULL,             -- 'Master Mixed', 'Open', ...
  ordering       text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, wfdf_series_id)
);

-- ── Teams (per-event entry) ─────────────────────────────────────────────────
CREATE TABLE wfdf_teams (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       uuid NOT NULL REFERENCES wfdf_events(id) ON DELETE CASCADE,
  wfdf_team_id   integer NOT NULL,          -- source team_id (per event)
  division_id    uuid REFERENCES wfdf_divisions(id) ON DELETE SET NULL,
  name           text NOT NULL,
  abbreviation   text,
  club_name      text,
  country_code   text,                      -- 'USA', 'GER', ... (from country abbrev)
  country_name   text,
  flag_file      text,
  seed           integer,
  final_standing integer,                   -- final_standing_calculated
  -- Record + point/spirit rollups (from teams_{id} detail).
  games          integer,
  wins           integer,
  losses         integer,
  scores_for     integer,
  scores_against integer,
  spirit_avg     numeric,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, wfdf_team_id)
);

-- ── Roster (named players per team) ─────────────────────────────────────────
CREATE TABLE wfdf_rosters (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id        uuid NOT NULL REFERENCES wfdf_teams(id) ON DELETE CASCADE,
  event_id       uuid NOT NULL REFERENCES wfdf_events(id) ON DELETE CASCADE,
  wfdf_player_id integer NOT NULL,          -- source player_id (per event)
  first_name     text,
  last_name      text,
  full_name      text NOT NULL,             -- computed "first last", for name-match
  jersey_number  text,
  goals          integer,                   -- 'done'
  assists        integer,                   -- 'fedin'
  callahans      integer,
  total          integer,
  games          integer,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, wfdf_player_id)
);

-- ── Games (scores + spirit) ─────────────────────────────────────────────────
CREATE TABLE wfdf_games (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       uuid NOT NULL REFERENCES wfdf_events(id) ON DELETE CASCADE,
  wfdf_game_id   integer NOT NULL,          -- source game_id (per event)
  division_id    uuid REFERENCES wfdf_divisions(id) ON DELETE SET NULL,
  home_team_id   uuid REFERENCES wfdf_teams(id) ON DELETE SET NULL,
  away_team_id   uuid REFERENCES wfdf_teams(id) ON DELETE SET NULL,
  home_score     integer,
  away_score     integer,
  home_sotg      integer,                   -- spirit
  away_sotg      integer,
  pool_name      text,                      -- resolved from reference.pools
  is_bracket     boolean NOT NULL DEFAULT false,
  status         wfdf_game_status NOT NULL DEFAULT 'scheduled',
  scheduled_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, wfdf_game_id)
);

-- ── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX idx_wfdf_teams_event      ON wfdf_teams(event_id);
CREATE INDEX idx_wfdf_teams_division   ON wfdf_teams(division_id);
CREATE INDEX idx_wfdf_teams_name       ON wfdf_teams(lower(name));
CREATE INDEX idx_wfdf_rosters_team     ON wfdf_rosters(team_id);
CREATE INDEX idx_wfdf_rosters_event    ON wfdf_rosters(event_id);
CREATE INDEX idx_wfdf_rosters_name     ON wfdf_rosters(lower(full_name));
CREATE INDEX idx_wfdf_rosters_lastname ON wfdf_rosters(lower(last_name));
CREATE INDEX idx_wfdf_games_event      ON wfdf_games(event_id);
CREATE INDEX idx_wfdf_games_division   ON wfdf_games(division_id);
CREATE INDEX idx_wfdf_divisions_event  ON wfdf_divisions(event_id);

-- ── RLS: public read-only (matches usau_* — public results data) ────────────
ALTER TABLE wfdf_events    ENABLE ROW LEVEL SECURITY;
ALTER TABLE wfdf_divisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE wfdf_teams     ENABLE ROW LEVEL SECURITY;
ALTER TABLE wfdf_rosters   ENABLE ROW LEVEL SECURITY;
ALTER TABLE wfdf_games     ENABLE ROW LEVEL SECURITY;

CREATE POLICY wfdf_events_read    ON wfdf_events    FOR SELECT USING (true);
CREATE POLICY wfdf_divisions_read ON wfdf_divisions FOR SELECT USING (true);
CREATE POLICY wfdf_teams_read     ON wfdf_teams     FOR SELECT USING (true);
CREATE POLICY wfdf_rosters_read   ON wfdf_rosters   FOR SELECT USING (true);
CREATE POLICY wfdf_games_read     ON wfdf_games     FOR SELECT USING (true);
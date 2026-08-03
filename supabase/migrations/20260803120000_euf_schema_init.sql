-- ─── EUF / EUCS (European Ultimate Federation club season) results schema ───
-- Source: eucs-schedule.ultimatefederation.eu — an Ultiorganizer install, same
-- platform as the LEGACY WFDF path (supabase/functions/wfdf-ingest/legacy.ts).
-- Kept in its OWN euf_* tables rather than reusing wfdf_*: different governing
-- body, club-level (not national-team), and the upstream markup/API is expected
-- to drift independently of the WFDF static-JSON cache.
--
-- Source-shape facts that drive this schema (all verified against EUCF 2025):
--   * There is NO JSON API. `?view=json` returns 200 with an empty body.
--   * `?view=allplayers` IGNORES the season param — it returns one global,
--     600-row truncated list. Rosters MUST come from `?view=teamcard&team=N`.
--   * Player ids are PER-EVENT, not persistent (one human = many ids across
--     events), so cross-event identity is name-matched, same as USAU.
--   * Games reference teams by NAME ONLY — no team id in the games or gameplay
--     markup. A club can field an Open AND a Women's team with the SAME name and
--     country (3SB, GRUT, Bristol all did at EUCF 2025), so team resolution must
--     be scoped by (division, name). The `<Name> (Open|Women|Mixed)` teamcard
--     header is the authoritative team→division key.

-- Divisions are a fixed, small vocabulary in EUCS.
CREATE TYPE euf_division AS ENUM ('Open', 'Women''s', 'Mixed');

CREATE TYPE euf_event_kind AS ENUM (
  'eucf', 'e2cf', 'elite_invite', 'spring_tour', 'summer_tour', 'regional', 'other'
);

CREATE TYPE euf_game_stage AS ENUM (
  'pool', 'crossover', 'bracket', 'quarterfinal', 'semifinal', 'final', 'placement', 'other'
);

CREATE TYPE euf_game_status AS ENUM (
  'scheduled', 'completed', 'forfeit', 'cancelled'
);

-- ── Events ──────────────────────────────────────────────────────────────────
CREATE TABLE euf_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Ultiorganizer season key, e.g. 'e2cf25', 'EI_25'. Case-sensitive upstream.
  season_id      text NOT NULL UNIQUE,
  slug           text NOT NULL UNIQUE,       -- our URL key (/euf/events/{slug})
  name           text NOT NULL,
  short_name     text,
  year           integer NOT NULL,
  kind           euf_event_kind NOT NULL DEFAULT 'other',
  location       text,
  start_date     date,
  end_date       date,
  source_origin  text,                       -- scraped base, for re-ingest
  last_scraped_at     timestamptz,
  last_scraped_status text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- ── Teams (per-event entry) ─────────────────────────────────────────────────
CREATE TABLE euf_teams (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       uuid NOT NULL REFERENCES euf_events(id) ON DELETE CASCADE,
  euf_team_id    integer NOT NULL,           -- source teamcard id (per event)
  division       euf_division NOT NULL,      -- from the teamcard header
  name           text NOT NULL,
  country_name   text,
  country_code   text,
  seed           integer,
  final_placement integer,
  games          integer,
  wins           integer,
  losses         integer,
  scores_for     integer,
  scores_against integer,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, euf_team_id),
  -- The lookup key games resolve against. Name alone is NOT unique per event.
  UNIQUE (event_id, division, name)
);

-- ── Roster + per-event player totals (from teamcard) ────────────────────────
CREATE TABLE euf_rosters (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id        uuid NOT NULL REFERENCES euf_teams(id) ON DELETE CASCADE,
  event_id       uuid NOT NULL REFERENCES euf_events(id) ON DELETE CASCADE,
  euf_player_id  integer NOT NULL,           -- PER-EVENT id, not persistent
  full_name      text NOT NULL,              -- for cross-league name-match
  jersey_number  text,
  games          integer,
  goals          integer,
  assists        integer,
  total          integer,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, euf_player_id)
);

-- ── Games ───────────────────────────────────────────────────────────────────
CREATE TABLE euf_games (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       uuid NOT NULL REFERENCES euf_events(id) ON DELETE CASCADE,
  -- Source gameplay id. NULL for forfeits, which have no gameplay page at all
  -- (one such row at E2CF 2025) — hence nullable + a partial unique index.
  euf_game_id    integer,
  division       euf_division NOT NULL,
  round_name     text,                       -- 'Pool A', 'Bracket 1-8 Finals'
  stage          euf_game_stage NOT NULL DEFAULT 'other',
  is_bracket     boolean NOT NULL DEFAULT false,
  home_team_id   uuid REFERENCES euf_teams(id) ON DELETE SET NULL,
  away_team_id   uuid REFERENCES euf_teams(id) ON DELETE SET NULL,
  home_score     integer,
  away_score     integer,
  field          text,
  start_time     text,                       -- venue-local clock, as published
  scheduled_at   timestamptz,
  status         euf_game_status NOT NULL DEFAULT 'completed',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_euf_games_source
  ON euf_games(event_id, euf_game_id) WHERE euf_game_id IS NOT NULL;

-- ── Per-game player stat lines (from ?view=gameplay) ────────────────────────
-- EUCS publishes real box scores — jersey #, assists, goals per player per game.
-- WFDF has no equivalent. Coverage is good but NOT total: box-score goals
-- reconcile exactly to the final score in 141/155 EUCF 2025 games (91%); the
-- rest are upstream scorekeeping gaps (unattributed goals), not parse errors.
CREATE TABLE euf_game_player_stats (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id        uuid NOT NULL REFERENCES euf_games(id) ON DELETE CASCADE,
  event_id       uuid NOT NULL REFERENCES euf_events(id) ON DELETE CASCADE,
  team_id        uuid REFERENCES euf_teams(id) ON DELETE SET NULL,
  euf_player_id  integer,                    -- per-event id when resolvable
  full_name      text NOT NULL,
  jersey_number  text,
  goals          integer NOT NULL DEFAULT 0,
  assists        integer NOT NULL DEFAULT 0,
  total          integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, team_id, full_name)
);

-- ── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX idx_euf_teams_event      ON euf_teams(event_id);
CREATE INDEX idx_euf_teams_name       ON euf_teams(lower(name));
CREATE INDEX idx_euf_teams_country    ON euf_teams(country_name);
CREATE INDEX idx_euf_rosters_team     ON euf_rosters(team_id);
CREATE INDEX idx_euf_rosters_event    ON euf_rosters(event_id);
CREATE INDEX idx_euf_rosters_name     ON euf_rosters(lower(full_name));
CREATE INDEX idx_euf_games_event      ON euf_games(event_id);
CREATE INDEX idx_euf_games_division   ON euf_games(event_id, division);
CREATE INDEX idx_euf_games_home       ON euf_games(home_team_id);
CREATE INDEX idx_euf_games_away       ON euf_games(away_team_id);
CREATE INDEX idx_euf_gps_game         ON euf_game_player_stats(game_id);
CREATE INDEX idx_euf_gps_event        ON euf_game_player_stats(event_id);
CREATE INDEX idx_euf_gps_name         ON euf_game_player_stats(lower(full_name));

-- ── RLS: public read-only (matches usau_* / wfdf_* — public results data) ────
ALTER TABLE euf_events            ENABLE ROW LEVEL SECURITY;
ALTER TABLE euf_teams             ENABLE ROW LEVEL SECURITY;
ALTER TABLE euf_rosters           ENABLE ROW LEVEL SECURITY;
ALTER TABLE euf_games             ENABLE ROW LEVEL SECURITY;
ALTER TABLE euf_game_player_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY euf_events_read  ON euf_events            FOR SELECT USING (true);
CREATE POLICY euf_teams_read   ON euf_teams             FOR SELECT USING (true);
CREATE POLICY euf_rosters_read ON euf_rosters           FOR SELECT USING (true);
CREATE POLICY euf_games_read   ON euf_games             FOR SELECT USING (true);
CREATE POLICY euf_gps_read     ON euf_game_player_stats FOR SELECT USING (true);

COMMENT ON TABLE euf_events IS 'EUCS/EUF events scraped from the Ultiorganizer schedule site. Public read; writes via service role only.';
COMMENT ON COLUMN euf_teams.division IS 'From the teamcard "<Name> (Open|Women|Mixed)" header. Required to disambiguate same-named teams within an event.';
COMMENT ON COLUMN euf_rosters.euf_player_id IS 'PER-EVENT source id, NOT persistent across events. Cross-event identity must be name-matched.';
COMMENT ON TABLE euf_game_player_stats IS 'Per-game box scores from ?view=gameplay. ~91% of games reconcile exactly to the final score; gaps are upstream scorekeeping.';

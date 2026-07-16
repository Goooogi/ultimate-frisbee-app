-- ─────────────────────────────────────────────────────────────────────────────
-- UFA ingestion tables (Phase 1 of Fantasy feature).
--
-- Mirrors the wul_*/pul_* pattern: normalized, real FK relations, world-readable
-- via RLS, writes via the service role only. Populated by a weekly sync script
-- (scripts/sync-ufa.ts) that pulls from backend.ufastats.com.
--
-- Identity keys (verified from src/lib/ufa/*):
--   ufa_teams.id     = UFA team slug (e.g. 'empire', 'apex') — text, stable
--   ufa_players.id   = UFA player slug (e.g. 'tdecraene')    — text, stable across seasons
--   ufa_games.id     = UFA gameID (e.g. '2026-05-16-COL-NY') — text, date-embedded
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Teams ────────────────────────────────────────────────────────────────────
create table if not exists public.ufa_teams (
  id           text primary key,          -- UFA team slug ("empire")
  name         text not null,             -- "Empire"
  city         text,                      -- "New York"
  full_name    text,                      -- "New York Empire"
  abbr         text,                      -- "NY" (from gameID segments)
  division     text,                      -- "Atlantic" / "Central" / etc (nullable)
  logo_url     text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ── Players ──────────────────────────────────────────────────────────────────
create table if not exists public.ufa_players (
  id               text primary key,      -- UFA player slug ("tdecraene")
  first_name       text,
  last_name        text,
  full_name        text,                  -- "Tobe DeCraene" (from watchufa / leaderboard name)
  current_team_id  text references public.ufa_teams(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists ufa_players_current_team_idx on public.ufa_players(current_team_id);
create index if not exists ufa_players_full_name_idx on public.ufa_players(lower(full_name));

-- ── Games ────────────────────────────────────────────────────────────────────
create table if not exists public.ufa_games (
  id               text primary key,      -- UFA gameID ("2026-05-16-COL-NY")
  year             int not null,
  week             text,                  -- "week-4" (fantasy week boundary)
  start_timestamp  timestamptz,           -- earliest-in-week drives the fantasy lock
  status           text not null default 'Upcoming',  -- 'Upcoming' | 'Final' | live phase
  home_team_id     text references public.ufa_teams(id) on delete set null,
  away_team_id     text references public.ufa_teams(id) on delete set null,
  home_score       int,
  away_score       int,
  location_name    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists ufa_games_year_week_idx on public.ufa_games(year, week);
create index if not exists ufa_games_start_idx on public.ufa_games(start_timestamp);
create index if not exists ufa_games_status_idx on public.ufa_games(status);

-- ── Per-game player stats ────────────────────────────────────────────────────
-- One row per (game, player). Columns mirror UfaPlayerGameRow (src/lib/ufa/types.ts).
-- "turnovers" is NOT a single upstream field — store the components and let the
-- scoring/UI layer sum throwaways+drops+stalls (matches game-boxscore.tsx).
create table if not exists public.ufa_game_player_stats (
  id                  bigint generated always as identity primary key,
  game_id             text not null references public.ufa_games(id) on delete cascade,
  player_id           text not null references public.ufa_players(id) on delete cascade,
  team_id             text references public.ufa_teams(id) on delete set null,
  is_home             boolean,
  -- core counting stats
  goals               int  not null default 0,
  assists             int  not null default 0,
  hockey_assists      int  not null default 0,
  blocks              int  not null default 0,
  callahans           int  not null default 0,
  -- turnover components (sum for "turnovers")
  throwaways          int  not null default 0,
  drops               int  not null default 0,
  stalls              int  not null default 0,
  -- throwing / completions
  completions         int  not null default 0,
  throws_attempted    int  not null default 0,
  catches             int  not null default 0,
  -- yards (fantasy: 1pt / 100 combined yds)
  yards_thrown        int  not null default 0,
  yards_received      int  not null default 0,
  -- points played
  o_points_played     int  not null default 0,
  o_points_scored     int  not null default 0,
  d_points_played     int  not null default 0,
  d_points_scored     int  not null default 0,
  seconds_played      int  not null default 0,
  -- pulls / hucks (kept for parity with UfaPlayerGameRow)
  pulls               int  not null default 0,
  hucks_completed     int  not null default 0,
  hucks_attempted     int  not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (game_id, player_id)
);
create index if not exists ufa_gps_game_idx   on public.ufa_game_player_stats(game_id);
create index if not exists ufa_gps_player_idx on public.ufa_game_player_stats(player_id);
create index if not exists ufa_gps_team_idx   on public.ufa_game_player_stats(team_id);

-- ── RLS: world-readable, service-role writes only (matches wul_*/pul_*) ───────
alter table public.ufa_teams             enable row level security;
alter table public.ufa_players           enable row level security;
alter table public.ufa_games             enable row level security;
alter table public.ufa_game_player_stats enable row level security;

create policy "ufa_teams public read"   on public.ufa_teams             for select using (true);
create policy "ufa_players public read" on public.ufa_players           for select using (true);
create policy "ufa_games public read"   on public.ufa_games             for select using (true);
create policy "ufa_gps public read"     on public.ufa_game_player_stats for select using (true);

comment on table public.ufa_teams is 'UFA teams. id = UFA team slug. World-readable; writes via service role only (scripts/sync-ufa.ts).';
comment on table public.ufa_players is 'UFA players. id = stable UFA player slug across seasons. World-readable; writes via service role only.';
comment on table public.ufa_games is 'UFA games. id = UFA gameID (date-embedded). week drives fantasy week boundaries. World-readable; writes via service role only.';
comment on table public.ufa_game_player_stats is 'Per-game per-player UFA stat lines (mirrors UfaPlayerGameRow). turnovers = throwaways+drops+stalls. World-readable; writes via service role only.';
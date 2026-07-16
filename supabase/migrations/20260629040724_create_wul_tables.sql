-- WUL (Western Ultimate League) tables — mirror pul_* shapes, plus WUL's
-- richer per-game advanced stats. World-readable RLS; backfill writes via
-- service role, app reads via anon (same pattern as pul_*/usau_*).

create table if not exists wul_teams (
  id text primary key,                 -- slug, e.g. 'falcons'
  name text not null,                  -- 'Bay Area Falcons'
  city text not null,
  mascot text not null,
  abbr text,
  logo_url text,
  accent_color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists wul_games (
  id text primary key,                 -- '{season}/{date}/{AWAY}-vs-{HOME}'
  season integer not null,
  week_label text not null,            -- 'regular' | 'post'
  game_date date,
  away_team_id text not null,
  home_team_id text not null,
  away_abbrev text not null,
  home_abbrev text not null,
  away_score integer,
  home_score integer,
  status text not null default 'final',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists wul_games_season_idx on wul_games(season);

create table if not exists wul_players (
  id uuid primary key default gen_random_uuid(),
  player_name text not null,
  jersey_number text not null default '',
  team_id text not null,
  season integer not null,
  games_played integer not null default 0,
  goals integer not null default 0,
  assists integer not null default 0,
  blocks integer not null default 0,
  turnovers integer not null default 0,
  touches integer not null default 0,
  o_points integer not null default 0,
  d_points integer not null default 0,
  plus_minus numeric not null default 0,   -- WUL +/- has .5 values
  -- advanced season totals
  callahans integer not null default 0,
  hucks_completed integer not null default 0,
  yards_total integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (player_name, team_id, season)
);
create index if not exists wul_players_season_idx on wul_players(season);
create index if not exists wul_players_name_idx on wul_players(lower(player_name));

create table if not exists wul_game_player_stats (
  id uuid primary key default gen_random_uuid(),
  game_id text not null references wul_games(id) on delete cascade,
  team_id text not null,
  player_name text not null,
  jersey_number text,
  goals integer not null default 0,
  assists integer not null default 0,
  blocks integer not null default 0,
  turnovers integer not null default 0,
  touches integer not null default 0,
  o_points integer not null default 0,
  d_points integer not null default 0,
  points_played integer not null default 0,
  plus_minus numeric not null default 0,
  -- advanced per-game
  callahans integer not null default 0,
  hucks_completed integer not null default 0,
  throw_yards integer not null default 0,
  receive_yards integer not null default 0,
  total_yards integer not null default 0,
  completions integer not null default 0,
  throws integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_id, team_id, player_name)
);
create index if not exists wul_gps_game_idx on wul_game_player_stats(game_id);

-- world-readable RLS (anon reads; service role writes bypass RLS)
alter table wul_teams enable row level security;
alter table wul_games enable row level security;
alter table wul_players enable row level security;
alter table wul_game_player_stats enable row level security;

create policy "wul_teams_read" on wul_teams for select using (true);
create policy "wul_games_read" on wul_games for select using (true);
create policy "wul_players_read" on wul_players for select using (true);
create policy "wul_gps_read" on wul_game_player_stats for select using (true);
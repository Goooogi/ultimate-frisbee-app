-- PUL game history + per-game box scores.
-- Source: pul-stats-hub.pages.dev (/schedule index + /games/* pages).
-- Mirrors the existing pul_teams/pul_players convention: RLS enabled, single
-- public-read policy, no insert/update policy (writes go through the
-- service-role backfill / future edge function, which bypass RLS).

-- ── pul_games ──────────────────────────────────────────────────────────────
-- One row per game. id = the stats-hub path slug (e.g. '2024/week-10/IND-vs-MIN'
-- or '2022/finals/MED-vs-DC') so re-runs upsert cleanly and the URL is
-- reconstructable. away_/home_ follow the {AWAY}-vs-{HOME} URL order.
create table if not exists public.pul_games (
  id            text primary key,            -- '{season}/{week_label}/{AWAY}-vs-{HOME}'
  season        integer not null,
  week_label    text not null,               -- 'week-7' | 'semifinals' | 'finals'
  week_num      integer,                     -- 7 for 'week-7'; null for playoffs
  away_team_id  text not null references public.pul_teams(id),
  home_team_id  text not null references public.pul_teams(id),
  away_abbrev   text not null,
  home_abbrev   text not null,
  game_date     date,                        -- parsed from 'M/D/YYYY'; null if absent
  game_time     text,                        -- raw '12:00 PM' (local, no tz on source)
  location      text,
  away_score    integer,                     -- null until the game is final
  home_score    integer,
  status        text not null default 'scheduled'
                  check (status in ('scheduled','final')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists pul_games_season_idx       on public.pul_games (season);
create index if not exists pul_games_away_team_idx     on public.pul_games (away_team_id);
create index if not exists pul_games_home_team_idx     on public.pul_games (home_team_id);
create index if not exists pul_games_status_idx        on public.pul_games (status);

alter table public.pul_games enable row level security;
create policy "pul_games public read" on public.pul_games
  for select to public using (true);

-- ── pul_game_player_stats ──────────────────────────────────────────────────
-- One row per player per game (box score). Unique on (game_id, team_id,
-- player_name) so re-scrapes upsert. Stat set mirrors pul_players; fields the
-- source omits for a given game default to 0.
create table if not exists public.pul_game_player_stats (
  id             uuid primary key default gen_random_uuid(),
  game_id        text not null references public.pul_games(id) on delete cascade,
  team_id        text not null references public.pul_teams(id),
  player_name    text not null,
  jersey_number  text not null default '',
  goals          integer not null default 0,
  assists        integer not null default 0,
  blocks         integer not null default 0,
  turnovers      integer not null default 0,
  touches        integer not null default 0,
  o_points       integer not null default 0,
  d_points       integer not null default 0,
  plus_minus     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (game_id, team_id, player_name)
);

create index if not exists pgps_game_idx   on public.pul_game_player_stats (game_id);
create index if not exists pgps_team_idx    on public.pul_game_player_stats (team_id);
create index if not exists pgps_player_idx  on public.pul_game_player_stats (player_name);

alter table public.pul_game_player_stats enable row level security;
create policy "pul_game_player_stats public read" on public.pul_game_player_stats
  for select to public using (true);

-- ── Medellín Revolution ────────────────────────────────────────────────────
-- 2022 champion, now defunct (the league's former international team). Present
-- only in 2022 game history but must exist for the pul_games FK to resolve.
insert into public.pul_teams (id, name, city, mascot, logo_url, accent_color, created_at, updated_at)
values (
  'medellin', 'Medellin Revolution', 'Medellin', 'Revolution',
  'https://pub-d284bbb3229c435b8e085787c253db6f.r2.dev/assets/teams/medellin.png',
  null, now(), now()
)
on conflict (id) do nothing;
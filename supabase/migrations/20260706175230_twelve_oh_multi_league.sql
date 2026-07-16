-- 12-0 multi-league support: PUL + WUL join UFA.
-- twelve_oh_players gains a league discriminator (part of the PK) and the
-- PUL/WUL-only display stats. Per-league baselines live in a new jsonb table
-- (UFA keeps its typed twelve_oh_baseline singleton for backward compat).

-- 1. league column
alter table public.twelve_oh_players
  add column if not exists league text not null default 'ufa';

alter table public.twelve_oh_players
  add constraint twelve_oh_players_league_check
  check (league in ('ufa','pul','wul'));

-- 2. PK now includes league (player ids are only unique within a league)
alter table public.twelve_oh_players
  drop constraint twelve_oh_players_pkey;
alter table public.twelve_oh_players
  add constraint twelve_oh_players_pkey
  primary key (league, player_id, team_slug, year);

-- 3. PUL/WUL display stats (null for UFA rows)
alter table public.twelve_oh_players
  add column if not exists touches integer,
  add column if not exists o_points integer,
  add column if not exists d_points integer;

-- 4. Per-league baseline storage (jsonb payload printed/consumed by the
--    backfill scripts; the app scores from code-baked baselines).
create table if not exists public.twelve_oh_league_baselines (
  league text primary key check (league in ('pul','wul')),
  player_seasons integer not null,
  payload jsonb not null,
  computed_at timestamptz not null default now()
);
alter table public.twelve_oh_league_baselines enable row level security;
create policy "public read" on public.twelve_oh_league_baselines
  for select using (true);

-- 5. Spin-pool view now league-scoped
drop view if exists public.twelve_oh_team_years;
create view public.twelve_oh_team_years as
select league, team_slug, team_abbr, year, count(*)::integer as player_count
from public.twelve_oh_players
group by league, team_slug, team_abbr, year;

notify pgrst, 'reload schema';
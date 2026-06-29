-- USAU Scraper schema
-- Run with: supabase db push

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ============================================================
-- Enums
-- ============================================================

do $$ begin
  create type competition_level_code as enum (
    'CLUB', 'COLLEGE_D1', 'COLLEGE_D3', 'HS', 'MS', 'YC',
    'MASTERS', 'GRAND_MASTERS', 'BEACH', 'OTHER'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type gender_division as enum ('Men', 'Women', 'Mixed', 'Open');
exception when duplicate_object then null; end $$;

do $$ begin
  create type event_type as enum (
    'regular_season', 'sectional', 'regional', 'national',
    'masters', 'youth_club', 'beach', 'pro', 'unaffiliated', 'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type game_status as enum (
    'scheduled', 'in_progress', 'final', 'forfeit', 'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type game_round as enum (
    'pool', 'prequarter', 'quarter', 'semi', 'final',
    'placement', 'consolation', 'other'
  );
exception when duplicate_object then null; end $$;

-- ============================================================
-- Reference tables
-- ============================================================

create table if not exists seasons (
  year int primary key,
  is_active boolean not null default false
);

insert into seasons (year, is_active) values
  (2023, false), (2024, false), (2025, false), (2026, true)
on conflict (year) do nothing;

-- ============================================================
-- Core entities
-- ============================================================

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  usau_slug text not null unique,
  name text not null,
  season int not null references seasons(year),
  competition_level competition_level_code not null default 'OTHER',
  start_date date,
  end_date date,
  city text,
  state text,
  event_type event_type not null default 'other',
  is_sanctioned boolean not null default true,
  url text,
  last_scraped_at timestamptz,
  last_scraped_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists events_season_idx on events(season);
create index if not exists events_dates_idx on events(start_date, end_date);
create index if not exists events_active_idx
  on events(start_date, end_date)
  where end_date >= current_date - interval '1 day';

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  usau_team_id text not null unique,
  name text not null,
  school_or_club_name text,
  gender_division gender_division,
  competition_level competition_level_code,
  competition_division text,
  team_designation text,
  state text,
  city text,
  last_scraped_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists teams_state_idx on teams(state);
create index if not exists teams_level_division_idx
  on teams(competition_level, gender_division);

create table if not exists event_teams (
  event_id uuid not null references events(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  seed int,
  pool text,
  final_placement int,
  primary key (event_id, team_id)
);
create index if not exists event_teams_team_idx on event_teams(team_id);

create table if not exists games (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  round game_round not null default 'pool',
  bracket_name text,
  team_a_id uuid references teams(id),
  team_b_id uuid references teams(id),
  score_a int,
  score_b int,
  scheduled_at timestamptz,
  played_at timestamptz,
  status game_status not null default 'scheduled',
  source_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists games_natural_key
  on games(event_id, round, team_a_id, team_b_id,
           coalesce(scheduled_at, 'epoch'::timestamptz));
create index if not exists games_event_idx on games(event_id);

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  usau_player_id text unique,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists rosters (
  team_id uuid not null references teams(id) on delete cascade,
  season int not null references seasons(year),
  player_id uuid not null references players(id) on delete cascade,
  jersey_number text,
  primary key (team_id, season, player_id)
);

create table if not exists rankings (
  season int not null references seasons(year),
  week int not null,
  division text not null,
  team_id uuid not null references teams(id) on delete cascade,
  rank int not null,
  rating numeric,
  scraped_at timestamptz not null default now(),
  primary key (season, week, division, team_id)
);
create index if not exists rankings_division_idx on rankings(division, season, week);

-- ============================================================
-- Operational
-- ============================================================

create table if not exists scrape_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  rows_processed int default 0,
  error text,
  metadata jsonb
);
create index if not exists scrape_runs_job_idx
  on scrape_runs(job_name, started_at desc);

-- ============================================================
-- updated_at triggers
-- ============================================================

create or replace function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists events_updated_at on events;
create trigger events_updated_at before update on events
  for each row execute function set_updated_at();

drop trigger if exists teams_updated_at on teams;
create trigger teams_updated_at before update on teams
  for each row execute function set_updated_at();

drop trigger if exists games_updated_at on games;
create trigger games_updated_at before update on games
  for each row execute function set_updated_at();

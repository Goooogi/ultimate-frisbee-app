-- ─────────────────────────────────────────────────────────────
-- USAU public data schema (scraped from play.usaultimate.org)
--
-- Naming: all tables prefixed `usau_` so they sit clearly apart from
-- the playbook (`pb_`) and the universal `profiles` table.
--
-- Reads: world-readable via RLS so the web/mobile apps can query
-- with the anon key. Writes: service-role only (Edge Functions
-- bypass RLS using SUPABASE_SERVICE_ROLE_KEY).
-- ─────────────────────────────────────────────────────────────

-- ── Enums ────────────────────────────────────────────────────
do $$ begin
  create type usau_competition_level as enum (
    'CLUB', 'COLLEGE_D1', 'COLLEGE_D3', 'HS', 'MS', 'YC',
    'MASTERS', 'GRAND_MASTERS', 'BEACH', 'OTHER'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type usau_gender_division as enum ('Men', 'Women', 'Mixed', 'Open');
exception when duplicate_object then null; end $$;

do $$ begin
  create type usau_event_type as enum (
    'regular_season', 'sectional', 'regional', 'national',
    'masters', 'youth_club', 'beach', 'pro', 'unaffiliated', 'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type usau_game_status as enum (
    'scheduled', 'in_progress', 'final', 'forfeit', 'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type usau_game_round as enum (
    'pool', 'prequarter', 'quarter', 'semi', 'final',
    'placement', 'consolation', 'other'
  );
exception when duplicate_object then null; end $$;

-- ── seasons (reference table) ────────────────────────────────
create table if not exists public.usau_seasons (
  year int primary key,
  is_active boolean not null default false
);

insert into public.usau_seasons (year, is_active) values
  (2022, false), (2023, false), (2024, false), (2025, false), (2026, true)
on conflict (year) do nothing;

-- ── events (tournaments) ─────────────────────────────────────
create table if not exists public.usau_events (
  id uuid primary key default gen_random_uuid(),
  usau_slug text not null unique,
  name text not null,
  season int not null references public.usau_seasons(year),
  competition_level public.usau_competition_level not null default 'OTHER',
  start_date date,
  end_date date,
  city text,
  state text,
  event_type public.usau_event_type not null default 'other',
  is_sanctioned boolean not null default true,
  url text,
  last_scraped_at timestamptz,
  last_scraped_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists usau_events_season_idx on public.usau_events(season);
create index if not exists usau_events_dates_idx on public.usau_events(start_date, end_date);
create index if not exists usau_events_end_date_idx on public.usau_events(end_date);

-- ── teams (persistent identity, with per-event IDs we've seen) ──
create table if not exists public.usau_teams (
  id uuid primary key default gen_random_uuid(),
  usau_team_id text unique,
  usau_event_team_ids text[] not null default array[]::text[],
  name text not null,
  school_or_club_name text,
  gender_division public.usau_gender_division,
  competition_level public.usau_competition_level,
  competition_division text,
  team_designation text,
  city text,
  state text,
  last_scraped_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists usau_teams_state_idx on public.usau_teams(state);
create index if not exists usau_teams_level_division_idx
  on public.usau_teams(competition_level, gender_division);
create index if not exists usau_teams_event_ids_idx
  on public.usau_teams using gin (usau_event_team_ids);

-- ── event_teams (per-event participation) ────────────────────
create table if not exists public.usau_event_teams (
  event_id uuid not null references public.usau_events(id) on delete cascade,
  team_id uuid not null references public.usau_teams(id) on delete cascade,
  usau_event_team_id text not null,
  seed int,
  pool text,
  final_placement int,
  primary key (event_id, team_id)
);
create index if not exists usau_event_teams_team_idx on public.usau_event_teams(team_id);
create unique index if not exists usau_event_teams_event_team_id_idx
  on public.usau_event_teams(usau_event_team_id);

-- ── games ────────────────────────────────────────────────────
-- Two natural keys: usau_game_id when present, otherwise
-- (event, round, teams) tuple. Both as unique-when-applicable indexes.
create table if not exists public.usau_games (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.usau_events(id) on delete cascade,
  usau_game_id text,
  usau_event_game_id text,
  round public.usau_game_round not null default 'pool',
  bracket_name text,
  team_a_id uuid references public.usau_teams(id),
  team_b_id uuid references public.usau_teams(id),
  seed_a int,
  seed_b int,
  score_a int,
  score_b int,
  location text,
  scheduled_at timestamptz,
  played_at timestamptz,
  status public.usau_game_status not null default 'scheduled',
  source_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists usau_games_usau_game_id_idx
  on public.usau_games(usau_game_id)
  where usau_game_id is not null;
create index if not exists usau_games_event_idx on public.usau_games(event_id);
-- NOTE: fallback uniqueness for games without usau_game_id is enforced
-- in application code (upsert with explicit onConflict on the natural
-- columns). We can't put it in a partial index because coalesce/'epoch'
-- isn't immutable in all Postgres versions.

-- ── players ──────────────────────────────────────────────────
create table if not exists public.usau_players (
  id uuid primary key default gen_random_uuid(),
  usau_player_id text unique,
  display_name text not null,
  created_at timestamptz not null default now()
);

-- ── rosters (team + season → player) ─────────────────────────
create table if not exists public.usau_rosters (
  team_id uuid not null references public.usau_teams(id) on delete cascade,
  season int not null references public.usau_seasons(year),
  player_id uuid not null references public.usau_players(id) on delete cascade,
  jersey_number text,
  primary key (team_id, season, player_id)
);

-- ── player_event_stats ───────────────────────────────────────
create table if not exists public.usau_player_event_stats (
  player_id uuid not null references public.usau_players(id) on delete cascade,
  event_id uuid not null references public.usau_events(id) on delete cascade,
  team_id uuid references public.usau_teams(id),
  goals int,
  assists int,
  scraped_at timestamptz not null default now(),
  primary key (player_id, event_id)
);
create index if not exists usau_pes_event_idx on public.usau_player_event_stats(event_id);
create index if not exists usau_pes_team_idx on public.usau_player_event_stats(team_id);

-- ── rankings ─────────────────────────────────────────────────
create table if not exists public.usau_rankings (
  season int not null references public.usau_seasons(year),
  week int not null,
  division text not null,
  team_id uuid not null references public.usau_teams(id) on delete cascade,
  rank int not null,
  rating numeric,
  wins int,
  losses int,
  region text,
  conference text,
  scraped_at timestamptz not null default now(),
  primary key (season, week, division, team_id)
);
create index if not exists usau_rankings_division_idx
  on public.usau_rankings(division, season, week);

-- ── scrape_runs (operational log) ────────────────────────────
create table if not exists public.usau_scrape_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  rows_processed int default 0,
  error text,
  metadata jsonb
);
create index if not exists usau_scrape_runs_job_idx
  on public.usau_scrape_runs(job_name, started_at desc);

-- ── updated_at triggers (reuse existing public.set_updated_at) ──
drop trigger if exists usau_events_updated_at on public.usau_events;
create trigger usau_events_updated_at before update on public.usau_events
  for each row execute function public.set_updated_at();

drop trigger if exists usau_teams_updated_at on public.usau_teams;
create trigger usau_teams_updated_at before update on public.usau_teams
  for each row execute function public.set_updated_at();

drop trigger if exists usau_games_updated_at on public.usau_games;
create trigger usau_games_updated_at before update on public.usau_games
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- RLS: world-readable, writes only via service role.
-- ─────────────────────────────────────────────────────────────
alter table public.usau_seasons             enable row level security;
alter table public.usau_events              enable row level security;
alter table public.usau_teams               enable row level security;
alter table public.usau_event_teams         enable row level security;
alter table public.usau_games               enable row level security;
alter table public.usau_players             enable row level security;
alter table public.usau_rosters             enable row level security;
alter table public.usau_player_event_stats  enable row level security;
alter table public.usau_rankings            enable row level security;
alter table public.usau_scrape_runs         enable row level security;

create policy "usau_seasons_select_public"             on public.usau_seasons             for select to anon, authenticated using (true);
create policy "usau_events_select_public"              on public.usau_events              for select to anon, authenticated using (true);
create policy "usau_teams_select_public"               on public.usau_teams               for select to anon, authenticated using (true);
create policy "usau_event_teams_select_public"         on public.usau_event_teams         for select to anon, authenticated using (true);
create policy "usau_games_select_public"               on public.usau_games               for select to anon, authenticated using (true);
create policy "usau_players_select_public"             on public.usau_players             for select to anon, authenticated using (true);
create policy "usau_rosters_select_public"             on public.usau_rosters             for select to anon, authenticated using (true);
create policy "usau_player_event_stats_select_public"  on public.usau_player_event_stats  for select to anon, authenticated using (true);
create policy "usau_rankings_select_public"            on public.usau_rankings            for select to anon, authenticated using (true);

comment on table public.usau_events is 'Public scraped USAU tournaments. World-readable; writes via service role only.';
comment on table public.usau_teams is 'Public scraped USAU teams. usau_team_id is persistent; usau_event_team_ids is the array of per-event participation IDs.';
comment on table public.usau_event_teams is 'Per-event participation. usau_event_team_id is the canonical URL key for everything bracket/pool-related.';
comment on table public.usau_games is 'usau_game_id = stable id from page HTML (preferred upsert key). usau_event_game_id = URL-encoded match-report key.';
comment on table public.usau_player_event_stats is 'Per-event player goals/assists. NULL when not scorekept by USAU (most regional events).';
comment on table public.usau_scrape_runs is 'Operational log of scraper invocations. RLS-locked: service role only.';

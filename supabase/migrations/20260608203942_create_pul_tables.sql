
-- ─── PUL Teams ───────────────────────────────────────────────────────────────
create table if not exists pul_teams (
  id          text primary key,           -- slug, e.g. 'atlanta'
  name        text not null,              -- 'Atlanta Soul'
  city        text not null,
  mascot      text not null,
  logo_url    text,                       -- R2 URL or null if not found
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ─── PUL Players (season stats) ──────────────────────────────────────────────
create table if not exists pul_players (
  id             uuid primary key default gen_random_uuid(),
  player_name    text not null,
  jersey_number  text not null default '',   -- '00', '7', etc.
  team_id        text not null references pul_teams(id),
  season         integer not null default 2025,
  goals          integer not null default 0,
  assists        integer not null default 0,
  blocks         integer not null default 0,
  turnovers      integer not null default 0,
  o_points       integer not null default 0,
  d_points       integer not null default 0,
  plus_minus     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- idempotent upsert key
  unique (player_name, team_id, season)
);

create index if not exists pul_players_team_id_idx on pul_players(team_id);
create index if not exists pul_players_season_idx  on pul_players(season);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table pul_teams   enable row level security;
alter table pul_players enable row level security;

-- Public read, no client writes (backfill uses service role which bypasses RLS)
create policy "pul_teams public read"
  on pul_teams for select
  using (true);

create policy "pul_players public read"
  on pul_players for select
  using (true);

-- ─── PostgREST schema cache reload ───────────────────────────────────────────
notify pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────────
-- Fantasy schema (Phase 3).
--
-- Beta = soccer-style free-for-all: one global pool (league_id NULL), one public
-- leaderboard, duplicate players allowed across teams. The private-league model
-- ships next year — fantasy_teams.league_id + a scaffolded fantasy_leagues table
-- make that a non-breaking addition.
--
-- AUTH BOUNDARY (Hunter's rule): PUBLIC to VIEW, auth only to CREATE/EDIT.
--   → SELECT policies grant anon + authenticated (leaderboard reads logged-out).
--   → INSERT/UPDATE/DELETE gated to owner_id = auth.uid().
--
-- Leaderboard shows the owner's username. profiles is NOT anon-readable (holds
-- email/phone), so we DENORMALIZE username onto fantasy_teams — the public
-- leaderboard reads only fantasy_teams, never profiles. Synced at write time.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Scaffold for next year's private leagues (unused in beta) ────────────────
create table if not exists public.fantasy_leagues (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles(id) on delete cascade,
  name          text not null,
  invite_token  text unique,
  season_year   int  not null,
  created_at    timestamptz not null default now()
);

-- ── Teams ────────────────────────────────────────────────────────────────────
create table if not exists public.fantasy_teams (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  -- NULL = global beta pool (free-for-all). Set = a private league (next year).
  league_id    uuid references public.fantasy_leagues(id) on delete cascade,
  team_name    text not null check (char_length(team_name) between 1 and 40),
  -- Denormalized owner handle so the PUBLIC leaderboard reads only this table
  -- (profiles is not anon-readable). Kept in sync on write from profiles.username.
  owner_username text,
  season_year  int not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- One team per owner per league per season in the beta (global pool = league_id NULL).
  -- NULLS NOT DISTINCT so two NULL-league teams for the same owner+season collide.
  unique nulls not distinct (owner_id, league_id, season_year)
);
create index if not exists fantasy_teams_league_idx on public.fantasy_teams(league_id);
create index if not exists fantasy_teams_owner_idx on public.fantasy_teams(owner_id);

-- ── Roster slots ─────────────────────────────────────────────────────────────
-- One row per rostered player, per week (weekly versioning → lock + between-week
-- edits). role skews scoring. player_id references the UFA player slug.
create table if not exists public.fantasy_roster_slots (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.fantasy_teams(id) on delete cascade,
  week        text not null,                        -- UFA "week-N"
  player_id   text not null references public.ufa_players(id) on delete restrict,
  role        text not null check (role in ('offender','defender')),
  created_at  timestamptz not null default now(),
  -- A player can't occupy two slots on the same team in the same week.
  unique (team_id, week, player_id)
);
create index if not exists fantasy_slots_team_week_idx on public.fantasy_roster_slots(team_id, week);
create index if not exists fantasy_slots_player_idx on public.fantasy_roster_slots(player_id);

-- ── Weekly score cache ───────────────────────────────────────────────────────
-- Computed by the scoring job after each stats sync. Cumulative season total =
-- SUM(points) over weeks for a team. numeric (decimals from yardage).
create table if not exists public.fantasy_scores (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references public.fantasy_teams(id) on delete cascade,
  week         text not null,
  points       numeric(8,2) not null default 0,
  computed_at  timestamptz not null default now(),
  unique (team_id, week)
);
create index if not exists fantasy_scores_team_idx on public.fantasy_scores(team_id);

comment on table public.fantasy_teams is 'Fantasy teams. Beta: league_id NULL = global free-for-all pool. PUBLIC read (leaderboard); writes gated to owner_id=auth.uid(). owner_username denormalized so leaderboard never reads profiles.';
comment on table public.fantasy_roster_slots is 'Per-week roster (4 offenders + 3 defenders enforced at submit). player_id = UFA player slug. Public read; writes gated to team owner.';
comment on table public.fantasy_scores is 'Weekly fantasy point cache per team. Cumulative = SUM over weeks. Written by scoring job (service role). Public read.';
comment on table public.fantasy_leagues is 'SCAFFOLD for next-year private leagues. Unused in beta (all beta teams have league_id NULL).';
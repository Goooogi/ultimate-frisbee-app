-- ─────────────────────────────────────────────────────────────────────────────
-- Fantasy Leagues & Contests — Phase 1, migration 4 of 8.
--
-- fantasy_contests: an instance of a league pointed at one real competition +
-- season. league_id NULL = global/service-managed contest (the existing beta
-- pool becomes the global UFA 2026 contest in migration 6).
--
-- fantasy_contest_periods: the single lock authority (see design doc —
-- multi-league SQL date logic would be unmaintainable inline). One row per
-- (contest, period) with lock_at/unlock_at computed by TS period builders or
-- fantasy_rebuild_ufa_periods() (migration 7) and read by the generic lock
-- trigger (migration 6). Public SELECT, no client write policies — service-
-- role/SECURITY DEFINER fn only, since periods are system-computed, not
-- user input.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.fantasy_contests (
  id           uuid primary key default gen_random_uuid(),
  -- NULL = global/service-managed contest (e.g. the beta UFA pool).
  league_id    uuid references public.fantasy_leagues(id) on delete cascade,
  competition  text not null check (competition in (
                 'ufa','pul','wul','usau-club-nationals','usau-college-nationals','wfdf-wucc'
               )),
  season_year  int not null,
  name         text not null check (char_length(name) between 1 and 60),
  status       text not null default 'open' check (status in ('open','active','complete')),
  settings     jsonb not null default '{}'::jsonb,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique nulls not distinct (league_id, competition, season_year)
);

create index fantasy_contests_league_idx on public.fantasy_contests(league_id);

comment on table public.fantasy_contests is 'One instance of a league pointed at a real competition+season. league_id NULL = global/service-managed contest. settings jsonb carries mode + roster composition (e.g. {"mode":"weekly-stats","offenders":4,"defenders":3} / {"mode":"event","flex":7}) so DB triggers stay generic across competitions.';

alter table public.fantasy_contests enable row level security;

create policy "fantasy_contests public read"
  on public.fantasy_contests for select
  to anon, authenticated
  using (true);

create policy "fantasy_contests insert commissioner"
  on public.fantasy_contests for insert
  to authenticated
  with check (league_id is not null and public.fantasy_is_commissioner(league_id));

create policy "fantasy_contests update commissioner"
  on public.fantasy_contests for update
  to authenticated
  using (league_id is not null and public.fantasy_is_commissioner(league_id))
  with check (league_id is not null and public.fantasy_is_commissioner(league_id));

-- No DELETE policy in v1 (spec: "no DELETE in v1").

create table public.fantasy_contest_periods (
  contest_id  uuid not null references public.fantasy_contests(id) on delete cascade,
  period      text not null check (char_length(period) between 1 and 40 and period !~ '^\s*$'),
  lock_at     timestamptz not null,
  unlock_at   timestamptz,
  game_count  int,
  complete    boolean not null default false,
  updated_at  timestamptz not null default now(),
  primary key (contest_id, period)
);

comment on table public.fantasy_contest_periods is 'Single lock authority for roster edits, per (contest, period). Written by TS period builders or fantasy_rebuild_ufa_periods() — never computed inline on the read/write path. unlock_at NULL = once locked, locked forever (correct for event-mode contests with a single "event" period).';

alter table public.fantasy_contest_periods enable row level security;

create policy "fantasy_contest_periods public read"
  on public.fantasy_contest_periods for select
  to anon, authenticated
  using (true);

-- No client write policies — service-role / SECURITY DEFINER fn only.

notify pgrst, 'reload schema';

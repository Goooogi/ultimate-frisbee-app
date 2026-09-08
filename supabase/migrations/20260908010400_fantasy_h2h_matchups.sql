-- ─────────────────────────────────────────────────────────────────────────────
-- Fantasy expansion, migration 5 of 9 — head-to-head matchups.
--
-- settings.format ∈ 'h2h' | 'points'; absent = 'points' everywhere (SQL and
-- the Deno scorer both default this way — see fantasy_h2h_standings and
-- score-fantasy/index.ts v4). Event contests ignore format entirely (they
-- score once from event totals, there's no week-by-week schedule to make).
-- ─────────────────────────────────────────────────────────────────────────────

create table public.fantasy_matchups (
  id             uuid primary key default gen_random_uuid(),
  contest_id     uuid not null references public.fantasy_contests(id) on delete cascade,
  period         text not null,
  stage          text not null default 'regular' check (stage in ('regular','semifinal','final','third')),
  home_team_id   uuid not null references public.fantasy_teams(id) on delete cascade,
  away_team_id   uuid references public.fantasy_teams(id) on delete cascade,  -- null = bye
  home_seed      int,
  away_seed      int,
  home_points    numeric(8,2),
  away_points    numeric(8,2),
  winner_team_id uuid references public.fantasy_teams(id) on delete set null,
  scored         boolean not null default false,
  created_at     timestamptz not null default now(),
  unique (contest_id, period, home_team_id),
  foreign key (contest_id, period) references public.fantasy_contest_periods(contest_id, period) on delete cascade
);

create unique index fantasy_matchups_away_uq
  on public.fantasy_matchups(contest_id, period, away_team_id)
  where away_team_id is not null;

create index fantasy_matchups_contest_idx on public.fantasy_matchups(contest_id);

comment on table public.fantasy_matchups is 'Head-to-head schedule for format=h2h weekly-stats contests. away_team_id NULL = bye week (auto-scored, no winner). stage regular/semifinal/final/third; playoff rows are generated once the regular season completes (see score-fantasy v4). settings.schedule on fantasy_contests records the period plan this was generated from.';

alter table public.fantasy_matchups enable row level security;

create policy "fantasy_matchups public read"
  on public.fantasy_matchups for select
  to anon, authenticated
  using (true);

-- No client write policies — service-role / SECURITY DEFINER fn only.

alter publication supabase_realtime add table public.fantasy_matchups;

-- ── fantasy_set_contest_format — commissioner-only RPC ────────────────────────
create or replace function public.fantasy_set_contest_format(p_contest uuid, p_format text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_league_id uuid;
  v_settings  jsonb;
  v_mode      text;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;

  if p_format not in ('h2h', 'points') then
    raise exception 'format must be h2h or points';
  end if;

  select league_id, settings into v_league_id, v_settings
  from public.fantasy_contests
  where id = p_contest
  for update;

  if not found then
    raise exception 'unknown contest %', p_contest;
  end if;

  if v_league_id is null then
    raise exception 'this contest is not editable';
  end if;

  if not public.fantasy_is_commissioner(v_league_id) then
    raise exception 'not authorized — commissioner only';
  end if;

  v_mode := coalesce(v_settings->>'mode', 'weekly-stats');
  if v_mode <> 'weekly-stats' then
    raise exception 'format only applies to weekly-stats contests';
  end if;

  if exists (select 1 from public.fantasy_matchups where contest_id = p_contest) then
    raise exception 'a schedule has already been generated for this contest — format is locked';
  end if;

  update public.fantasy_contests
  set settings = settings || jsonb_build_object('format', p_format)
  where id = p_contest;
end;
$$;

revoke all on function public.fantasy_set_contest_format(uuid, text) from public, anon;
grant execute on function public.fantasy_set_contest_format(uuid, text) to authenticated;

-- ── fantasy_generate_schedule_internal — internal, does the actual work ──────
-- Circle-method round robin over the contest's FUTURE periods (lock_at not
-- yet passed — a schedule can't be generated retroactively over weeks already
-- played), ordered by lock_at. Needs >=3 future periods: the last two become
-- semifinal/final, everything before that is the regular season.
create or replace function public.fantasy_generate_schedule_internal(p_contest uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings     jsonb;
  v_mode         text;
  v_format       text;
  v_teams        uuid[];
  v_periods      text[];
  n_teams        int;
  n_periods      int;
  n_regular      int;
  v_semi_period  text;
  v_final_period text;
  v_arr          uuid[];
  v_rounds       int;
  r              int;
  i              int;
  v_home         uuid;
  v_away         uuid;
  v_inserted     int := 0;
  v_schedule     jsonb;
begin
  select settings into v_settings
  from public.fantasy_contests
  where id = p_contest
  for update;

  if not found then
    raise exception 'unknown contest %', p_contest;
  end if;

  v_mode := coalesce(v_settings->>'mode', 'weekly-stats');
  if v_mode <> 'weekly-stats' then
    raise exception 'schedules only apply to weekly-stats contests';
  end if;

  v_format := coalesce(v_settings->>'format', 'points');
  if v_format <> 'h2h' then
    raise exception 'contest format is not h2h';
  end if;

  if exists (select 1 from public.fantasy_matchups where contest_id = p_contest) then
    raise exception 'a schedule already exists for this contest';
  end if;

  select coalesce(array_agg(id order by random()), array[]::uuid[]) into v_teams
  from public.fantasy_teams
  where contest_id = p_contest;

  n_teams := array_length(v_teams, 1);
  if n_teams is null or n_teams < 4 then
    raise exception 'a schedule needs at least 4 teams';
  end if;

  select coalesce(array_agg(period order by lock_at), array[]::text[]) into v_periods
  from public.fantasy_contest_periods
  where contest_id = p_contest and lock_at > now();

  n_periods := array_length(v_periods, 1);
  if n_periods is null or n_periods < 3 then
    raise exception 'a schedule needs at least 3 future periods';
  end if;

  v_semi_period := v_periods[n_periods - 1];
  v_final_period := v_periods[n_periods];
  n_regular := n_periods - 2;

  if n_regular < 1 then
    raise exception 'a schedule needs at least 1 regular-season period before playoffs';
  end if;

  -- Circle method: fix v_teams[1], rotate the rest. Odd team counts get a
  -- synthetic bye slot (NULL) appended before rotation.
  v_arr := v_teams;
  if n_teams % 2 = 1 then
    v_arr := v_arr || array[null::uuid];
  end if;
  v_rounds := array_length(v_arr, 1) - 1;

  for r in 0 .. least(n_regular, v_rounds) - 1 loop
    for i in 0 .. (array_length(v_arr, 1) / 2) - 1 loop
      v_home := v_arr[i + 1];
      v_away := v_arr[array_length(v_arr, 1) - i];
      if v_home is null then
        v_home := v_away;
        v_away := null;
      end if;
      if v_home is not null then
        if v_away is null then
          insert into public.fantasy_matchups (contest_id, period, stage, home_team_id, away_team_id, scored)
          values (p_contest, v_periods[r + 1], 'regular', v_home, null, true);
        else
          insert into public.fantasy_matchups (contest_id, period, stage, home_team_id, away_team_id)
          values (p_contest, v_periods[r + 1], 'regular', v_home, v_away);
        end if;
        v_inserted := v_inserted + 1;
      end if;
    end loop;

    -- Rotate: keep position 1 fixed, rotate the rest by one.
    v_arr := array[v_arr[1]] || v_arr[array_length(v_arr, 1)] || v_arr[2 : array_length(v_arr, 1) - 1];
  end loop;

  v_schedule := jsonb_build_object(
    'regular', to_jsonb(v_periods[1 : n_regular]),
    'semifinal', v_semi_period,
    'final', v_final_period,
    'generatedAt', to_jsonb(now())
  );

  update public.fantasy_contests
  set settings = settings || jsonb_build_object('schedule', v_schedule)
  where id = p_contest;

  return v_inserted;
end;
$$;

revoke execute on function public.fantasy_generate_schedule_internal(uuid) from anon, authenticated, public;

-- ── fantasy_generate_schedule — commissioner-only public wrapper ─────────────
create or replace function public.fantasy_generate_schedule(p_contest uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_league_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;

  select league_id into v_league_id from public.fantasy_contests where id = p_contest;

  if v_league_id is null then
    raise exception 'this contest is not editable';
  end if;

  if not public.fantasy_is_commissioner(v_league_id) then
    raise exception 'not authorized — commissioner only';
  end if;

  return public.fantasy_generate_schedule_internal(p_contest);
end;
$$;

revoke all on function public.fantasy_generate_schedule(uuid) from public, anon;
grant execute on function public.fantasy_generate_schedule(uuid) to authenticated;

-- ── fantasy_h2h_standings — public read RPC ───────────────────────────────────
create or replace function public.fantasy_h2h_standings(p_contest uuid)
returns table (
  team_id uuid,
  team_name text,
  wins int,
  losses int,
  ties int,
  points_for numeric,
  points_against numeric,
  rank int
)
language sql
stable
security definer
set search_path = ''
as $$
  with results as (
    select m.home_team_id as team_id, m.home_points as pf, m.away_points as pa,
           case when m.winner_team_id = m.home_team_id then 1 else 0 end as win,
           case when m.winner_team_id = m.away_team_id then 1 else 0 end as loss,
           case when m.winner_team_id is null then 1 else 0 end as tie
    from public.fantasy_matchups m
    where m.contest_id = p_contest and m.stage = 'regular' and m.scored = true and m.away_team_id is not null
    union all
    select m.away_team_id as team_id, m.away_points as pf, m.home_points as pa,
           case when m.winner_team_id = m.away_team_id then 1 else 0 end as win,
           case when m.winner_team_id = m.home_team_id then 1 else 0 end as loss,
           case when m.winner_team_id is null then 1 else 0 end as tie
    from public.fantasy_matchups m
    where m.contest_id = p_contest and m.stage = 'regular' and m.scored = true and m.away_team_id is not null
  ),
  agg as (
    select
      t.id as team_id,
      t.team_name,
      coalesce(sum(r.win), 0)::int as wins,
      coalesce(sum(r.loss), 0)::int as losses,
      coalesce(sum(r.tie), 0)::int as ties,
      coalesce(sum(r.pf), 0) as points_for,
      coalesce(sum(r.pa), 0) as points_against
    from public.fantasy_teams t
    left join results r on r.team_id = t.id
    where t.contest_id = p_contest
    group by t.id, t.team_name
  )
  select
    team_id, team_name, wins, losses, ties, points_for, points_against,
    row_number() over (order by wins desc, points_for desc, team_name)::int as rank
  from agg;
$$;

revoke all on function public.fantasy_h2h_standings(uuid) from public;
grant execute on function public.fantasy_h2h_standings(uuid) to anon, authenticated;

notify pgrst, 'reload schema';

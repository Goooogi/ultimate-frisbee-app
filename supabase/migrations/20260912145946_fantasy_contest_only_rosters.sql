-- Public League teardown, part 4. Strip the remaining contest-less-team
-- branches from shared fantasy functions, move the roster carry-over onto the
-- contest lock schedule, and make the contest/league links required.
-- Functions are patched in place from the live definition (never
-- create-or-replace a shared function from committed text).
-- fantasy_teams.league_id is NOT dropped yet: installed pre-leagues mobile
-- store builds still filter their leaderboard on it.
set lock_timeout = '5s';

do $$
declare v_def text; v_new text; i int; j int;
begin
  -- Roster lock: contest-less teams used a legacy UFA first-game lock.
  v_def := pg_get_functiondef('public.fantasy_check_roster_lock()'::regprocedure);
  i := position('  if v_contest_id is null then' in v_def);
  if i > 0 then
    j := position('  -- Contest-scoped: fantasy_contest_periods is the single lock authority.' in v_def);
    if j <= i then raise exception 'fantasy_check_roster_lock anchor not found'; end if;
    v_new := left(v_def, i - 1) || substr(v_def, j);
    v_new := replace(v_new, E'  lock_time    timestamptz;\n', '');
    if v_new like '%lock_time%' or v_new like '%Legacy fallback%' then
      raise exception 'fantasy_check_roster_lock patch incomplete';
    end if;
    execute v_new;
  end if;

  -- Roster composition: contest-less teams used a hardcoded 4 O / 3 D cap.
  v_def := pg_get_functiondef('public.fantasy_enforce_roster_composition()'::regprocedure);
  i := position('  if v_contest_id is null then' in v_def);
  if i > 0 then
    j := position('  select settings into v_settings' in v_def);
    if j <= i then raise exception 'fantasy_enforce_roster_composition anchor not found'; end if;
    v_new := left(v_def, i - 1) || substr(v_def, j);
    if v_new like '%v_contest_id is null%' then
      raise exception 'fantasy_enforce_roster_composition patch incomplete';
    end if;
    execute v_new;
  end if;

  -- Roster validity: contest-less teams used a hardcoded 4/3/7 shape.
  v_def := pg_get_functiondef('public.fantasy_roster_is_valid(uuid, text)'::regprocedure);
  if v_def like '%v_contest_id is null%' then
    v_new := replace(v_def,
      E'  if v_contest_id is null then\n    return v_off = 4 and v_def = 3 and v_total = 7;\n  end if;\n\n', '');
    v_new := replace(v_new,
      E'    count(*) filter (where role = ''flex''),\n    count(*)\n  into v_off, v_def, v_flex, v_total\n',
      E'    count(*) filter (where role = ''flex'')\n  into v_off, v_def, v_flex\n');
    v_new := replace(v_new, E'  v_total      int;\n', '');
    if v_new like '%v_total%' or v_new like '%v_contest_id is null%' then
      raise exception 'fantasy_roster_is_valid patch incomplete';
    end if;
    execute v_new;
  end if;

  -- Carry-over: the active week came from ufa_games' first Fri/Sat/Sun game,
  -- which disagrees with the lock trigger (fantasy_contest_periods.lock_at =
  -- first game of the week). Use each contest's earliest unlocked period.
  v_def := pg_get_functiondef('public.fantasy_carry_over_rosters(integer)'::regprocedure);
  i := position('  -- 1. Active editable week' in v_def);
  if i > 0 then
    j := position(E'\n  loop\n' in v_def);
    if j <= i then raise exception 'fantasy_carry_over_rosters anchor not found'; end if;
    v_new := left(v_def, i - 1) || $blk$  -- For each UFA-contest team, its contest's active period is the earliest
  -- fantasy_contest_periods row not yet locked: the same authority the
  -- roster-lock trigger checks. Teams with no slots in it get their most
  -- recent prior week copied forward. Non-UFA contests are excluded.
  for rec in
    select t.id as tid, ap.period as active_week
    from public.fantasy_teams t
    join public.fantasy_contests c on c.id = t.contest_id and c.competition = 'ufa'
    cross join lateral (
      select cp.period
      from public.fantasy_contest_periods cp
      where cp.contest_id = c.id and cp.lock_at > now()
      order by cp.lock_at
      limit 1
    ) ap
    where t.season_year = v_year
      and not exists (
        select 1 from public.fantasy_roster_slots rs
        where rs.team_id = t.id and rs.week = ap.period
      )$blk$ || substr(v_def, j);
    v_new := replace(v_new, E'  v_active_week text;\n', '');
    v_new := replace(v_new, 'v_active_week', 'rec.active_week');
    if v_new like '%ufa_games%' or v_new like '%contest_id is null%' then
      raise exception 'fantasy_carry_over_rosters patch incomplete';
    end if;
    execute v_new;
  end if;
end $$;

-- No nulls exist (verified 2026-09-12); both tables are empty today.
alter table public.fantasy_contests alter column league_id set not null;
alter table public.fantasy_teams alter column contest_id set not null;

notify pgrst, 'reload schema';

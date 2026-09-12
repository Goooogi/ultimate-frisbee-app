-- Public League teardown, part 3: strip the dead global-contest (league_id
-- NULL) and contest-less-team branches from shared fantasy functions. No such
-- rows can exist any more (the insert policy requires a league contest, and
-- clients can't UPDATE contest_id). Patched in place from the live definition:
-- never create-or-replace a shared function from committed text.
do $$
declare v_def text; v_new text;
begin
  -- Global contests had no team cap.
  v_def := pg_get_functiondef('public.fantasy_contest_team_limits(uuid)'::regprocedure);
  if v_def like '%when c.league_id is null then null%' then
    v_new := replace(v_def, E'      when c.league_id is null then null\n', '');
    if v_new like '%league_id is null%' then raise exception 'fantasy_contest_team_limits anchor not found'; end if;
    execute v_new;
  end if;

  -- Contest-less teams and global-contest teams skipped the cap/draft checks.
  v_def := pg_get_functiondef('public.fantasy_teams_enforce_contest_cap()'::regprocedure);
  if v_def like '%NEW.contest_id is null%' then
    v_new := replace(v_def, E'  if NEW.contest_id is null then\n    return NEW;\n  end if;\n\n', '');
    v_new := replace(v_new, E'  if v_league_id is null then\n    return NEW;\n  end if;\n\n', '');
    v_new := replace(v_new,
      E'  select league_id, settings, competition\n    into v_league_id, v_settings, v_competition\n',
      E'  select settings, competition\n    into v_settings, v_competition\n');
    v_new := replace(v_new, E'  v_league_id      uuid;\n', '');
    if v_new like '%v_league_id%' or v_new like '%NEW.contest_id is null%' then
      raise exception 'fantasy_teams_enforce_contest_cap anchor not found';
    end if;
    execute v_new;
  end if;

  -- The null check is redundant: fantasy_is_league_member(NULL) is false.
  v_def := pg_get_functiondef('public.fantasy_rebuild_contest_periods(uuid)'::regprocedure);
  if v_def like '%v_league_id is null or not%' then
    v_new := replace(v_def,
      E'  -- they belong to; global (league_id NULL) contests are service-managed.\n',
      E'  -- they belong to.\n');
    v_new := replace(v_new,
      'if v_league_id is null or not public.fantasy_is_league_member(v_league_id) then',
      'if not public.fantasy_is_league_member(v_league_id) then');
    if v_new like '%v_league_id is null%' or v_new like '%global (league_id NULL)%' then
      raise exception 'fantasy_rebuild_contest_periods anchor not found';
    end if;
    execute v_new;
  end if;
end $$;

notify pgrst, 'reload schema';

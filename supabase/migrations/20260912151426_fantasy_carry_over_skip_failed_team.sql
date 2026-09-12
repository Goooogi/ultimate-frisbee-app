-- fantasy_carry_over_rosters: one team's failed carry (e.g. a drafted league
-- where the team no longer owns a rostered player, so the composition trigger
-- raises) aborted the hourly run for every team. Each team's copy now runs in
-- its own sub-block; a failure is logged as a WARNING and that team skipped.
-- Patched in place from the live definition.
do $$
declare v_def text; v_new text;
begin
  v_def := pg_get_functiondef('public.fantasy_carry_over_rosters(integer)'::regprocedure);
  if v_def not like '%skipped team%' then
    v_new := replace(v_def,
      E'    insert into public.fantasy_roster_slots (team_id, week, player_id, player_league, role)\n    select rec.tid, rec.active_week, rs.player_id, rs.player_league, rs.role\n    from public.fantasy_roster_slots rs\n    where rs.team_id = rec.tid and rs.week = v_prev_week;\n    get diagnostics v_copied = row_count;\n',
      E'    -- One team''s bad carry (e.g. a drafted league where it no longer owns a\n    -- rostered player) must not abort the run for every other team.\n    begin\n      insert into public.fantasy_roster_slots (team_id, week, player_id, player_league, role)\n      select rec.tid, rec.active_week, rs.player_id, rs.player_league, rs.role\n      from public.fantasy_roster_slots rs\n      where rs.team_id = rec.tid and rs.week = v_prev_week;\n      get diagnostics v_copied = row_count;\n    exception when others then\n      raise warning ''fantasy_carry_over_rosters: skipped team % (% -> %): %'', rec.tid, v_prev_week, rec.active_week, sqlerrm;\n      continue;\n    end;\n');
    if v_new = v_def then raise exception 'fantasy_carry_over_rosters anchor not found'; end if;
    execute v_new;
  end if;
end $$;

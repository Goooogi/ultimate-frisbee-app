-- The placement repair (parts 01-12) cleared 1st/2nd at two events decided by a
-- 2-team best-of-3 series ("Game 1/2/3" bracket names now read as no place):
-- Ok Corral 2016 (Dreadnought 1st, Rawhide 2nd) and Florida Women's Club
-- Sectional Championship 2019 (Tabby Rosa 1st, Fiasco 2nd). The stored values
-- were correct, so restore exactly those 4 rows from the pre-repair backup.
DO $migration$
DECLARE
  v_n int;
BEGIN
  update usau_event_teams et
     set final_placement = b.final_placement
    from usau_event_teams_placement_backup_20260923 b
    join usau_events e on e.id = b.event_id
    join usau_teams t on t.id = b.team_id
   where et.event_id = b.event_id and et.team_id = b.team_id
     and et.final_placement is null
     and b.final_placement in (1, 2)
     and ((e.name = 'Ok Corral 2016' and t.name in ('Dreadnought', 'Rawhide'))
       or (e.name = 'Florida Women''s Club Sectional Championship 2019' and t.name in ('Tabby Rosa', 'Fiasco')));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 4 THEN RAISE EXCEPTION 'expected 4 best-of-3 rows, updated %', v_n; END IF;
END
$migration$;

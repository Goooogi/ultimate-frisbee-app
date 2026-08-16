-- fantasy_carry_over_rosters: scope to UFA contests only.
--
-- The carryover predates contests and looped over EVERY fantasy team for the
-- season. With multi-league contests live that breaks two ways:
--   1. An event-mode team's week label is 'event' → regexp_replace strips to
--      '' → ''::int raises invalid_text_representation and aborts the WHOLE
--      run (carryover dies for everyone).
--   2. A PUL/WUL contest team's roster would be copied into a UFA week label
--      its contest has no period for → the generic lock trigger raises →
--      same full abort.
-- Weekly carryover for PUL/WUL contests is a future item; v1 carries over the
-- UFA week only, for teams in UFA contests (or legacy contest-less teams).

create or replace function public.fantasy_carry_over_rosters(p_year int default null)
returns table (team_id uuid, from_week text, into_week text, slots_copied int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year int := coalesce(p_year, case when extract(month from now()) >= 4
                                        then extract(year from now())::int
                                        else extract(year from now())::int - 1 end);
  v_active_week text;
  rec record;
  v_prev_week text;
  v_copied int;
begin
  -- 1. Active editable week: earliest week not yet locked.
  select w.week into v_active_week
  from (
    select g.week,
           coalesce(
             min(g.start_timestamp) filter (
               where extract(dow from g.start_timestamp at time zone 'America/New_York') in (5,6,0)
             ),
             min(g.start_timestamp)
           ) as lock_at
    from public.ufa_games g
    where g.year = v_year and g.week is not null and g.start_timestamp is not null
    group by g.week
  ) w
  where w.lock_at > now()
  order by (regexp_replace(w.week, '\D', '', 'g'))::int nulls last
  limit 1;

  if v_active_week is null then
    return; -- no upcoming editable week (off-season / all locked)
  end if;

  -- 2. For each UFA-contest team with NO slots in the active week, copy its
  --    most-recent prior week's slots forward. Non-UFA contest teams are
  --    excluded — their periods live on their own contests.
  for rec in
    select t.id as tid
    from public.fantasy_teams t
    where t.season_year = v_year
      and (
        t.contest_id is null
        or exists (
          select 1 from public.fantasy_contests c
          where c.id = t.contest_id and c.competition = 'ufa'
        )
      )
      and not exists (
        select 1 from public.fantasy_roster_slots rs
        where rs.team_id = t.id and rs.week = v_active_week
      )
  loop
    -- most recent prior week this team has a roster for (by numeric week order,
    -- strictly before the active week)
    select rs.week into v_prev_week
    from public.fantasy_roster_slots rs
    where rs.team_id = rec.tid
      and rs.week ~ '^week-[0-9]+$'
      and (regexp_replace(rs.week,'\D','','g'))::int < (regexp_replace(v_active_week,'\D','','g'))::int
    order by (regexp_replace(rs.week,'\D','','g'))::int desc
    limit 1;

    if v_prev_week is null then
      continue; -- team never set a roster → nothing to carry
    end if;

    insert into public.fantasy_roster_slots (team_id, week, player_id, player_league, role)
    select rec.tid, v_active_week, rs.player_id, rs.player_league, rs.role
    from public.fantasy_roster_slots rs
    where rs.team_id = rec.tid and rs.week = v_prev_week;
    get diagnostics v_copied = row_count;

    team_id := rec.tid; from_week := v_prev_week; into_week := v_active_week; slots_copied := v_copied;
    return next;
  end loop;
end $$;

notify pgrst, 'reload schema';

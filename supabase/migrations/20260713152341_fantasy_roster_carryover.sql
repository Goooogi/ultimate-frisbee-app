-- Roster carryover: when a new week opens (Monday unlock), a team that hasn't
-- set a lineup for it inherits its MOST RECENT prior week's roster, so a manager
-- who forgets still fields a team and scores. Materialized into fantasy_roster_
-- slots (not a score-time fallback) so the carried lineup is visible + editable
-- until the week locks at its first game. Idempotent: only fills a week a team
-- has NO slots for; never overwrites an edited lineup.
--
-- "Active editable week" = the earliest week whose LOCK moment is still in the
-- future (min Fri/Sat/Sun ET game start > now; fall back to min game start).
-- This mirrors src/lib/fantasy/weeks.ts lockWindowFor(). Run by pg_cron.

create or replace function fantasy_carry_over_rosters(p_year int default null)
returns table(team_id uuid, from_week text, into_week text, slots_copied int) as $$
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
    from ufa_games g
    where g.year = v_year and g.week is not null and g.start_timestamp is not null
    group by g.week
  ) w
  where w.lock_at > now()
  order by (regexp_replace(w.week, '\D', '', 'g'))::int nulls last
  limit 1;

  if v_active_week is null then
    return; -- no upcoming editable week (off-season / all locked)
  end if;

  -- 2. For each team with NO slots in the active week, copy its most-recent
  --    prior week's slots forward.
  for rec in
    select t.id as tid
    from fantasy_teams t
    where t.season_year = v_year
      and not exists (
        select 1 from fantasy_roster_slots rs
        where rs.team_id = t.id and rs.week = v_active_week
      )
  loop
    -- most recent prior week this team has a roster for (by numeric week order,
    -- strictly before the active week)
    select rs.week into v_prev_week
    from fantasy_roster_slots rs
    where rs.team_id = rec.tid
      and (regexp_replace(rs.week,'\D','','g'))::int < (regexp_replace(v_active_week,'\D','','g'))::int
    order by (regexp_replace(rs.week,'\D','','g'))::int desc
    limit 1;

    if v_prev_week is null then
      continue; -- team never set a roster → nothing to carry
    end if;

    insert into fantasy_roster_slots (team_id, week, player_id, role)
    select rec.tid, v_active_week, rs.player_id, rs.role
    from fantasy_roster_slots rs
    where rs.team_id = rec.tid and rs.week = v_prev_week;
    get diagnostics v_copied = row_count;

    team_id := rec.tid; from_week := v_prev_week; into_week := v_active_week; slots_copied := v_copied;
    return next;
  end loop;
end $$ language plpgsql security definer set search_path = public;
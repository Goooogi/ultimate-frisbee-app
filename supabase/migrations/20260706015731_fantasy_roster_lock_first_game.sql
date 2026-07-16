-- Roster lock rule (confirmed w/ Hunter 2026-07-05): a week locks when its FIRST
-- game kicks off, not at a fixed Friday. Managers can edit right up until games
-- start (matches standard fantasy behavior). Reopens Monday 00:00 ET.
--
-- Anchor = earliest Fri/Sat/Sun (ET) game of the week, so a midweek makeup game
-- doesn't lock the whole week days early; fall back to the earliest game overall
-- if the week has no weekend games.
create or replace function public.fantasy_check_roster_lock()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  wk        text;
  t_id      uuid;
  yr        int;
  lock_time timestamptz;   -- first (weekend) game start = the lock moment
begin
  wk   := coalesce(NEW.week, OLD.week);
  t_id := coalesce(NEW.team_id, OLD.team_id);

  select season_year into yr from public.fantasy_teams where id = t_id;
  if yr is null then
    return coalesce(NEW, OLD);  -- orphan/edge; let FK handle it
  end if;

  -- Earliest Fri/Sat/Sun (ET) game; fall back to the earliest game overall.
  select min(start_timestamp) into lock_time
  from public.ufa_games
  where week = wk and year = yr and start_timestamp is not null
    and extract(dow from start_timestamp at time zone 'America/New_York') in (5, 6, 0);
  if lock_time is null then
    select min(start_timestamp) into lock_time
    from public.ufa_games
    where week = wk and year = yr and start_timestamp is not null;
  end if;

  if lock_time is not null and now() >= lock_time then
    raise exception 'This week is locked — games have started. Roster changes are disabled until Monday.'
      using errcode = 'P0001';
  end if;

  return coalesce(NEW, OLD);
end;
$function$;
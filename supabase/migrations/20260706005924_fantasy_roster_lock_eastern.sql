-- Shift the fantasy roster lock anchor from Friday 00:00 UTC to Friday 00:00 ET.
-- The UFA is a US league; "locks Friday" should mean Friday in US Eastern, not
-- UTC (which is Thursday evening in the US and locked managers out a day early).
-- Postgres 'America/New_York' handles EST/EDT automatically.
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
  anchor    timestamptz;   -- earliest weekend game (Fri/Sat/Sun ET) of the week
  lock_time timestamptz;   -- Friday 00:00 America/New_York before the games
begin
  wk   := coalesce(NEW.week, OLD.week);
  t_id := coalesce(NEW.team_id, OLD.team_id);

  select season_year into yr from public.fantasy_teams where id = t_id;
  if yr is null then
    return coalesce(NEW, OLD);  -- orphan/edge; let FK handle it
  end if;

  -- Prefer the earliest Fri/Sat/Sun game (in ET) as the weekend anchor;
  -- fall back to the earliest game overall if the week has no weekend games.
  select min(start_timestamp) into anchor
  from public.ufa_games
  where week = wk and year = yr and start_timestamp is not null
    and extract(dow from start_timestamp at time zone 'America/New_York') in (5, 6, 0);
  if anchor is null then
    select min(start_timestamp) into anchor
    from public.ufa_games
    where week = wk and year = yr and start_timestamp is not null;
  end if;

  if anchor is not null then
    -- Step back from the anchor's ET calendar day to the Friday 00:00 ET on/before
    -- it. dow: Sun=0 … Fri=5, Sat=6. back_to_friday = (dow - 5 + 7) % 7.
    -- date_trunc('day', ... at time zone 'America/New_York') gives ET wall-clock
    -- midnight as a naive timestamp; re-interpret it in ET to get a real instant.
    lock_time := (
        date_trunc('day', anchor at time zone 'America/New_York')
        - ((extract(dow from anchor at time zone 'America/New_York')::int - 5 + 7) % 7) * interval '1 day'
      ) at time zone 'America/New_York';

    if now() >= lock_time then
      raise exception 'This week is locked for the weekend — roster changes are disabled.'
        using errcode = 'P0001';
    end if;
  end if;

  return coalesce(NEW, OLD);
end;
$function$;
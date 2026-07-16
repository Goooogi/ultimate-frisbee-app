
-- Align the roster-lock DB trigger with the app's Friday-lock rule
-- (src/lib/fantasy/weeks.ts). A week locks at FRIDAY 00:00 (UTC) before its
-- games — earlier than the first game start the old rule used. We anchor on the
-- earliest WEEKEND (Fri/Sat/Sun) game of the week (ignoring midweek makeups),
-- then step back to that Friday 00:00.
--
-- Note: a past week stays locked forever, which is correct — after Monday the
-- manager edits the NEXT week, never a prior one. So no "unlock" branch here.
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
  anchor    timestamptz;   -- earliest weekend game (Fri/Sat/Sun) of the week
  lock_time timestamptz;   -- Friday 00:00 UTC before the games
begin
  wk   := coalesce(NEW.week, OLD.week);
  t_id := coalesce(NEW.team_id, OLD.team_id);

  select season_year into yr from public.fantasy_teams where id = t_id;
  if yr is null then
    return coalesce(NEW, OLD);  -- orphan/edge; let FK handle it
  end if;

  -- Prefer the earliest Fri/Sat/Sun game as the weekend anchor (dow 5,6,0);
  -- fall back to the earliest game overall if the week has no weekend games.
  select min(start_timestamp) into anchor
  from public.ufa_games
  where week = wk and year = yr and start_timestamp is not null
    and extract(dow from start_timestamp at time zone 'UTC') in (5, 6, 0);
  if anchor is null then
    select min(start_timestamp) into anchor
    from public.ufa_games
    where week = wk and year = yr and start_timestamp is not null;
  end if;

  if anchor is not null then
    -- Step back from the anchor's UTC day to the Friday 00:00 on/before it.
    -- dow: Sun=0 … Fri=5, Sat=6. back_to_friday = (dow - 5 + 7) % 7.
    lock_time := date_trunc('day', anchor at time zone 'UTC')
      - ((extract(dow from anchor at time zone 'UTC')::int - 5 + 7) % 7) * interval '1 day';
    -- date_trunc returned a timestamp (no tz); interpret it as UTC.
    lock_time := (date_trunc('day', anchor at time zone 'UTC')
      - ((extract(dow from anchor at time zone 'UTC')::int - 5 + 7) % 7) * interval '1 day')
      at time zone 'UTC';

    if now() >= lock_time then
      raise exception 'This week is locked for the weekend — roster changes are disabled.'
        using errcode = 'P0001';
    end if;
  end if;

  return coalesce(NEW, OLD);
end;
$function$;

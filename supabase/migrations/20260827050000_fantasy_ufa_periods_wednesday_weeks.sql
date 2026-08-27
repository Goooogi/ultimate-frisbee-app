-- Fantasy UFA periods: lock at the week's ACTUAL first game; weeks run Wed→Wed.
--
-- Two bugs in the UFA branch of fantasy_rebuild_contest_periods, both live on
-- championship weekend 2026:
--
-- 1. lock_at filtered to games falling Fri/Sat/Sun (`dow in (5,6,0)`), with the
--    true min() only as a fallback. Week 16's real opener is THURSDAY
--    2026-08-27 18:00 ET (spiders@empire); the filter skipped it and locked on
--    Friday 17:00 ET (the all-star game) instead — ~23h late, leaving lineups
--    editable after two real games had already been played and scored.
--
-- 2. unlock_at was anchored to the following MONDAY. Per Hunter (2026-08-27) a
--    fantasy week starts WEDNESDAY, so editing must not reopen before then.
--
-- New rule:
--   lock_at   = min(start_timestamp) over the week — the first game, whatever
--               day it lands on. No day-of-week filtering.
--   unlock_at = 00:00 ET on the first WEDNESDAY strictly after lock_at.
--
-- PATCHED VIA prosrc REPLACEMENT, not `create or replace` from committed text:
-- the deployed body has diverged from the committed migrations (it carries the
-- fantasy_is_league_member auth gate from the security review, plus pul/wul/
-- event branches that differ from 20260815015548). Re-emitting the function
-- from this repo's SQL would silently revert that gate. Same pattern as the
-- 20260729 / 20260801 migrations. This edits ONLY the ufa branch's two
-- expressions and leaves every other byte of the live body untouched.

do $mig$
declare
  v_src      text;
  v_new      text;
  v_old_lock text;
  v_new_lock text;
begin
  select prosrc into v_src
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fantasy_rebuild_contest_periods';

  if v_src is null then
    raise exception 'fantasy_rebuild_contest_periods not found';
  end if;

  -- The exact lock_at expression in the live ufa branch (weekend-filtered).
  v_old_lock :=
    'coalesce(' || E'\n' ||
    '        min(g.start_timestamp) filter (' || E'\n' ||
    '          where extract(dow from g.start_timestamp at time zone ''America/New_York'') in (5, 6, 0)' || E'\n' ||
    '        ),' || E'\n' ||
    '        min(g.start_timestamp)' || E'\n' ||
    '      ) as lock_at';

  v_new_lock := 'min(g.start_timestamp) as lock_at';

  if position(v_old_lock in v_src) = 0 then
    raise exception 'ufa lock_at expression not found in deployed body — aborting rather than guessing';
  end if;

  v_new := replace(v_src, v_old_lock, v_new_lock);

  -- Replace the whole weekend-anchored unlock_at expression with a Wednesday
  -- anchor computed off the (now unfiltered) first game. dow: Wed=3.
  -- ((3 - dow + 6) % 7) + 1 yields 1..7 days ahead, never 0, so a Wednesday
  -- opener unlocks the FOLLOWING Wednesday rather than the same morning.
  declare
    v_old_unlock text;
    v_new_unlock text;
  begin
    v_old_unlock :=
      '(' || E'\n' ||
      '        date_trunc(''day'', coalesce(' || E'\n' ||
      '          min(g.start_timestamp) filter (' || E'\n' ||
      '            where extract(dow from g.start_timestamp at time zone ''America/New_York'') in (5, 6, 0)' || E'\n' ||
      '          ),' || E'\n' ||
      '          min(g.start_timestamp)' || E'\n' ||
      '        ) at time zone ''America/New_York'')' || E'\n' ||
      '        + (' || E'\n' ||
      '            ((8 - extract(dow from coalesce(' || E'\n' ||
      '              min(g.start_timestamp) filter (' || E'\n' ||
      '                where extract(dow from g.start_timestamp at time zone ''America/New_York'') in (5, 6, 0)' || E'\n' ||
      '              ),' || E'\n' ||
      '              min(g.start_timestamp)' || E'\n' ||
      '            ) at time zone ''America/New_York'')::int - 1) % 7) + 1' || E'\n' ||
      '          ) * interval ''1 day''' || E'\n' ||
      '      ) at time zone ''America/New_York'' as unlock_at';

    v_new_unlock :=
      '(' || E'\n' ||
      '        date_trunc(''day'', min(g.start_timestamp) at time zone ''America/New_York'')' || E'\n' ||
      '        + (' || E'\n' ||
      '            ((3 - extract(dow from min(g.start_timestamp) at time zone ''America/New_York'')::int + 6) % 7) + 1' || E'\n' ||
      '          ) * interval ''1 day''' || E'\n' ||
      '      ) at time zone ''America/New_York'' as unlock_at';

    if position(v_old_unlock in v_new) = 0 then
      raise exception 'ufa unlock_at expression not found in deployed body — aborting rather than guessing';
    end if;

    v_new := replace(v_new, v_old_unlock, v_new_unlock);
  end;

  execute format(
    'create or replace function public.fantasy_rebuild_contest_periods(p_contest uuid)
       returns void language plpgsql security definer set search_path = public as %L',
    v_new
  );
end
$mig$;

revoke all on function public.fantasy_rebuild_contest_periods(uuid) from public;
grant execute on function public.fantasy_rebuild_contest_periods(uuid) to authenticated;

notify pgrst, 'reload schema';

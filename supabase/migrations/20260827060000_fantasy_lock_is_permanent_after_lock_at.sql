-- Roster lock: a period is closed FOREVER once its lock_at passes.
--
-- BUG (found 2026-08-27, mobile session + web verification): both the trigger
-- and the clients treated "locked" as the WINDOW [lock_at, unlock_at). Once a
-- week's unlock_at passed, `now() >= lock_at and now() < unlock_at` went FALSE
-- again — so the database ACCEPTED roster writes to every completed week.
-- Verified against prod: week-1 (Apr 24, complete, already scored) and every
-- other finished week evaluated trigger_would_block = false. A crafted request
-- could rewrite a finished lineup and change scored standings.
--
-- The window semantics were a misreading of what unlock_at is for. unlock_at
-- does NOT reopen its own period — it marks when the NEXT period becomes
-- editable. A period's own editability ends at its lock_at, permanently.
--
-- Fix: block whenever now() >= lock_at, regardless of unlock_at. Editing a
-- future week is still allowed (its lock_at hasn't arrived), which is exactly
-- how setting next week's lineup during the current week works.
--
-- PATCHED VIA prosrc REPLACEMENT — the deployed body has diverged from the
-- committed migrations (it carries a contest-scoped branch plus a legacy
-- league_id-null fallback that 20260706001043 does not). Re-emitting from repo
-- text would revert those. Raises rather than guessing if the anchor is gone.

do $mig$
declare
  v_src text;
  v_new text;
  v_old text;
  v_rep text;
begin
  select prosrc into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fantasy_check_roster_lock';

  if v_src is null then
    raise exception 'fantasy_check_roster_lock not found';
  end if;

  -- Contest-scoped branch: the window check that let finished weeks reopen.
  v_old :=
    '  if now() >= v_period.lock_at' || E'\n' ||
    '     and (v_period.unlock_at is null or now() < v_period.unlock_at) then';

  v_rep :=
    '  -- Closed for good once lock_at passes: unlock_at opens the NEXT period,' || E'\n' ||
    '  -- it does not reopen this one. (Window semantics let every completed' || E'\n' ||
    '  -- week be rewritten — fixed 2026-08-27.)' || E'\n' ||
    '  if now() >= v_period.lock_at then';

  if position(v_old in v_src) = 0 then
    raise exception 'contest-scoped window check not found in deployed body — aborting rather than guessing';
  end if;

  v_new := replace(v_src, v_old, v_rep);

  -- Legacy (contest_id NULL) fallback carries the same weekend-filtered
  -- first-game logic the periods builder just dropped. Align it: first game of
  -- the week, any day. Its lock is already permanent (no unlock term), so only
  -- the day-of-week filter needs removing.
  declare
    v_old_legacy text;
    v_rep_legacy text;
  begin
    v_old_legacy :=
      '    select min(start_timestamp) into lock_time' || E'\n' ||
      '    from public.ufa_games' || E'\n' ||
      '    where week = wk and year = yr and start_timestamp is not null' || E'\n' ||
      '      and extract(dow from start_timestamp at time zone ''America/New_York'') in (5, 6, 0);' || E'\n' ||
      '    if lock_time is null then' || E'\n' ||
      '      select min(start_timestamp) into lock_time' || E'\n' ||
      '      from public.ufa_games' || E'\n' ||
      '      where week = wk and year = yr and start_timestamp is not null;' || E'\n' ||
      '    end if;';

    v_rep_legacy :=
      '    -- First game of the week, whatever day it falls on (the Fri/Sat/Sun' || E'\n' ||
      '    -- filter skipped Thursday openers — fixed 2026-08-27).' || E'\n' ||
      '    select min(start_timestamp) into lock_time' || E'\n' ||
      '    from public.ufa_games' || E'\n' ||
      '    where week = wk and year = yr and start_timestamp is not null;';

    if position(v_old_legacy in v_new) > 0 then
      v_new := replace(v_new, v_old_legacy, v_rep_legacy);
    end if;
  end;

  execute format(
    'create or replace function public.fantasy_check_roster_lock()
       returns trigger language plpgsql security definer set search_path = public as %L',
    v_new
  );
end
$mig$;

notify pgrst, 'reload schema';

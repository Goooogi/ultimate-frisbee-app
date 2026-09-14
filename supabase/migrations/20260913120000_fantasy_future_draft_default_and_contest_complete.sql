-- Fantasy: a pre-filled draft time is never in the past, a draft can't be
-- scheduled in the past, and finished contests stop being rebuilt + re-scored
-- every hour (2026-09-13). NOT YET APPLIED — Hunter's go needed.
--
-- Found by the 2026-27 time-travel simulation:
--   • UFA contests created after Apr 9 2027 got "Apr 9, 8 PM ET" as their
--     default draft time (the season's first lock − 14 days) — already past, so
--     the pre-filled draft read "missed" the moment it was saved. Event contests
--     created in the days before a tournament had the same problem.
--   • Nothing ever set fantasy_contests.status = 'complete', so every finished
--     contest was rebuilt and re-scored hourly, forever.
--   • One contest whose rebuild raises (an EUCS contest bound to the date-less
--     EUCF row: "euf_events … has no start_date") aborted
--     fantasy_rebuild_all_periods for EVERY contest, every hour.
--
-- PATCHED IN PLACE from the LIVE definitions (pg_get_functiondef + asserted
-- anchors) — the 20260729 / 20260801 pattern (see 20260827050000). This DB is
-- shared with the mobile app and deployed bodies can differ from committed
-- text, so nothing here re-emits a function from repo SQL. An anchor that is
-- missing, or present more than once, aborts the migration instead of guessing.
-- Live md5(prosrc) the anchors were written against (2026-09-12/13):
--   fantasy_draft_default_at        493d5a055507f737793aa2147127d52b
--   fantasy_schedule_draft          022a735b79329cb7f57e12eab56af12f
--   fantasy_schedule_auction_draft  87a8eb7a88ce30ffed72309d27999e82
--   fantasy_rebuild_all_periods     a1c9a3fca6cd64bee828d5514d8d8dfc
--
-- 1. fantasy_draft_default_at keeps its anchors — weekly: a lock − 14 days;
--    events: greatest(start − 7, the Saturday before the start); both 20:00 ET —
--    and adds:
--      a. never earlier than the next 20:00 ET that is at least now() + 1 hour;
--      b. weekly: anchors on the first FUTURE lock (lock_at > now()). If the
--         default can't land before that lock (it locks tonight), it anchors on
--         the next future lock instead — the league drafts before the following
--         week and misses the one about to lock. Null only when no future lock
--         leaves room (e.g. the season's final week);
--      c. events: a tournament has one lock, so a default that can't land before
--         it is null — no pre-fill (the settings card then opens in manual mode).
-- 2. fantasy_schedule_draft and
-- 3. fantasy_schedule_auction_draft reject a p_at that has already passed.
-- 4. fantasy_rebuild_all_periods:
--      a. each contest's rebuild runs in its own exception block; a failure is
--         logged (RAISE WARNING, like fantasy_carry_over_rosters) and skipped;
--      b. a contest becomes 'complete' once every period is complete and its
--         last lock is at least 7 days old. score-fantasy (status <> 'complete')
--         and this loop then stop touching it. The 7 days are deliberate:
--         score-fantasy rebuilds periods BEFORE it scores, so completing on the
--         tick the final week turns complete would skip that week's last scoring
--         pass and never mark its H2H matchups final; they also cover late stat
--         corrections (sync-ufa retries for 5 days).
-- 5. fantasy_contests: direct UPDATE narrows to (name, settings) — see the
--    section at the bottom (security review, 2026-09-13).

do $mig$
declare
  v_new text;
  v_old text;
  v_rep text;
begin
  -- ── 1. fantasy_draft_default_at ──────────────────────────────────────────
  v_new := pg_get_functiondef('public.fantasy_draft_default_at(uuid)'::regprocedure);

  -- New locals + the earliest allowed default, computed once for both branches.
  v_old := E'  v_min_lock    timestamptz;\nbegin\n';
  v_rep := E'  v_min_lock    timestamptz;\n'
        || E'  v_slot        timestamptz;\n'
        || E'  v_at          timestamptz;\n'
        || E'begin\n'
        || E'  -- Never pre-fill a time that has passed or is under an hour away: the\n'
        || E'  -- earliest default is the next 20:00 ET at least an hour out. Every\n'
        || E'  -- anchor below is a 20:00 ET time, so greatest(anchor, v_slot) is the\n'
        || E'  -- anchor, or this slot when the anchor is already that close.\n'
        || E'  v_slot := ((((now() + interval ''1 hour'') at time zone ''America/New_York'')::date)::timestamp + time ''20:00'')\n'
        || E'            at time zone ''America/New_York'';\n'
        || E'  if v_slot < now() + interval ''1 hour'' then\n'
        || E'    v_slot := ((((now() + interval ''1 hour'') at time zone ''America/New_York'')::date + 1)::timestamp + time ''20:00'')\n'
        || E'              at time zone ''America/New_York'';\n'
        || E'  end if;\n'
        || E'\n';
  if (length(v_new) - length(replace(v_new, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'fantasy_draft_default_at: declare anchor not found exactly once — aborting rather than guessing';
  end if;
  v_new := replace(v_new, v_old, v_rep);

  -- Event branch: a tournament has one lock (start_date 00:00 ET).
  v_old := E'    return (v_anchor::timestamp + time ''20:00'') at time zone ''America/New_York'';\n';
  v_rep := E'    v_at := greatest((v_anchor::timestamp + time ''20:00'') at time zone ''America/New_York'', v_slot);\n'
        || E'    if v_at >= v_start_date::timestamp at time zone ''America/New_York'' then\n'
        || E'      return null;  -- no slot left before the tournament''s only lock\n'
        || E'    end if;\n'
        || E'    return v_at;\n';
  if (length(v_new) - length(replace(v_new, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'fantasy_draft_default_at: event return anchor not found exactly once — aborting rather than guessing';
  end if;
  v_new := replace(v_new, v_old, v_rep);

  -- Weekly branch: the first FUTURE lock the default can still land before.
  v_old := E'    select min(lock_at) into v_min_lock\n'
        || E'    from public.fantasy_contest_periods\n'
        || E'    where contest_id = p_contest;\n'
        || E'\n'
        || E'    if v_min_lock is null then\n'
        || E'      return null;\n'
        || E'    end if;\n'
        || E'\n'
        || E'    return (((v_min_lock at time zone ''America/New_York'')::date - 14)::timestamp + time ''20:00'')\n'
        || E'           at time zone ''America/New_York'';\n'
        || E'  end if;\n'
        || E'end;';
  v_rep := E'    -- The first FUTURE lock whose default (that lock − 14 days, or v_slot if\n'
        || E'    -- later) still lands before it. If the next lock is tonight, the league\n'
        || E'    -- drafts before the following week and misses that one; null only when\n'
        || E'    -- no future lock leaves room (e.g. the season''s final week).\n'
        || E'    for v_min_lock in\n'
        || E'      select lock_at\n'
        || E'      from public.fantasy_contest_periods\n'
        || E'      where contest_id = p_contest and lock_at > now()\n'
        || E'      order by lock_at\n'
        || E'    loop\n'
        || E'      v_at := greatest(\n'
        || E'        (((v_min_lock at time zone ''America/New_York'')::date - 14)::timestamp + time ''20:00'')\n'
        || E'          at time zone ''America/New_York'',\n'
        || E'        v_slot\n'
        || E'      );\n'
        || E'      if v_at < v_min_lock then\n'
        || E'        return v_at;\n'
        || E'      end if;\n'
        || E'    end loop;\n'
        || E'\n'
        || E'    return null;\n'
        || E'  end if;\n'
        || E'end;';
  if (length(v_new) - length(replace(v_new, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'fantasy_draft_default_at: weekly branch anchor not found exactly once — aborting rather than guessing';
  end if;
  v_new := replace(v_new, v_old, v_rep);

  execute v_new;

  -- ── 2. fantasy_schedule_draft ────────────────────────────────────────────
  v_new := pg_get_functiondef('public.fantasy_schedule_draft(uuid, timestamp with time zone, integer, integer)'::regprocedure);

  v_old := E'  if p_at is not null and v_earliest is not null and p_at < v_earliest then\n';
  v_rep := E'  if p_at is not null and p_at <= now() then\n'
        || E'    raise exception ''that draft time has already passed — pick a time in the future'';\n'
        || E'  end if;\n'
        || v_old;
  if (length(v_new) - length(replace(v_new, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'fantasy_schedule_draft: earliest-check anchor not found exactly once — aborting rather than guessing';
  end if;
  v_new := replace(v_new, v_old, v_rep);

  execute v_new;

  -- ── 3. fantasy_schedule_auction_draft ────────────────────────────────────
  v_new := pg_get_functiondef('public.fantasy_schedule_auction_draft(uuid, timestamp with time zone, integer, integer, integer, integer, integer)'::regprocedure);

  v_old := E'  if p_at is not null and v_earliest is not null and p_at < v_earliest then\n';
  v_rep := E'  if p_at is not null and p_at <= now() then\n'
        || E'    raise exception ''that draft time has already passed — pick a time in the future'';\n'
        || E'  end if;\n'
        || v_old;
  if (length(v_new) - length(replace(v_new, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'fantasy_schedule_auction_draft: earliest-check anchor not found exactly once — aborting rather than guessing';
  end if;
  v_new := replace(v_new, v_old, v_rep);

  execute v_new;

  -- ── 4. fantasy_rebuild_all_periods ───────────────────────────────────────
  v_new := pg_get_functiondef('public.fantasy_rebuild_all_periods()'::regprocedure);

  v_old := E'    perform public.fantasy_rebuild_contest_periods(r.id);\n';
  v_rep := E'    begin\n'
        || E'      perform public.fantasy_rebuild_contest_periods(r.id);\n'
        || E'    exception when others then\n'
        || E'      -- One contest''s failure (e.g. an event row with no dates) must not\n'
        || E'      -- roll back every other contest''s refresh.\n'
        || E'      raise warning ''fantasy_rebuild_all_periods: skipped contest %: %'', r.id, sqlerrm;\n'
        || E'      continue;\n'
        || E'    end;\n'
        || E'\n'
        || E'    -- Finished: every period complete and the last lock at least 7 days old.\n'
        || E'    update public.fantasy_contests c\n'
        || E'    set status = ''complete''\n'
        || E'    where c.id = r.id\n'
        || E'      and exists (select 1 from public.fantasy_contest_periods p where p.contest_id = r.id)\n'
        || E'      and not exists (\n'
        || E'        select 1 from public.fantasy_contest_periods p\n'
        || E'        where p.contest_id = r.id\n'
        || E'          and (not p.complete or p.lock_at > now() - interval ''7 days'')\n'
        || E'      );\n';
  if (length(v_new) - length(replace(v_new, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'fantasy_rebuild_all_periods: rebuild-call anchor not found exactly once — aborting rather than guessing';
  end if;
  v_new := replace(v_new, v_old, v_rep);

  execute v_new;
end
$mig$;

-- ── 5. fantasy_contests column lockdown ──────────────────────────────────
-- Section 4 makes status meaningful (complete = no more rebuilds or scoring),
-- but the table's UPDATE policy only checks fantasy_is_commissioner — so a
-- commissioner could PATCH their own contest over raw REST: status to
-- 'complete' (freezing scoring before late stat corrections land), or
-- settings.eventId to a finished event after the must-be-startable insert
-- check (20260913140000) passed, which the hourly service-role rebuild would
-- then build locks from. Neither app updates fantasy_contests directly (web
-- and mobile only INSERT it; verified 2026-09-13), and every function that
-- writes it is SECURITY DEFINER (fantasy_set_contest_format / _limits /
-- _waiver_settings / _update_contest_roster / _schedule_draft /
-- _schedule_auction_draft / _generate_schedule_internal), so clients lose
-- direct UPDATE entirely. (REVOKE on the table also drops per-column grants.)
revoke update on public.fantasy_contests from anon, authenticated;

-- fantasy_draft_default_at is read through fantasy_draft_readiness, and both
-- schedule functions are called from the browser.
notify pgrst, 'reload schema';

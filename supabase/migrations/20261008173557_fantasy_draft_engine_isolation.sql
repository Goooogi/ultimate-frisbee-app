-- Fantasy drafts: keep one draft's engine error from spreading (security
-- review of 20261008162129, 2026-10-08).
-- APPLIED to prod 2026-10-08 (remote version 20261008173557); a rollback-only
-- dry run of 4 scenarios passed first.
--
--   * fantasy_draft_tick runs every live draft in ONE transaction, so a draft
--     whose clock work raises rolled back every other draft's tick, every
--     10 s. For example, a draft that finishes after its event locks can't
--     seed rosters into the locked period. Each draft now runs in its own
--     subtransaction, and a failure is logged as a WARNING with the draft id.
--     The broken draft still doesn't advance, so it stays visible.
--   * fantasy_make_pick, fantasy_start_draft and fantasy_set_autodraft chain
--     into the engine. An error in someone else's auto-pick no longer undoes
--     the caller's own pick, start or toggle; the tick retries the chain.
--   * fantasy_set_autodraft checks the caller's team BEFORE taking the draft
--     row lock, so a stranger can't hold the lock.
--
-- Patched IN PLACE from LIVE definitions (md5 asserted; anchors must occur
-- exactly once). Live md5(prosrc) (2026-10-08):
--   fantasy_draft_tick    62cfdb7a12af91ff1ab50fd5251f9d06
--   fantasy_make_pick     fa18763a456a4bbf230027af55ddc75b
--   fantasy_start_draft   c09ea1f0a2f282bf5315ad099c790cfb
--   fantasy_set_autodraft bb4640491ca067a2aa02396ba9792ce2

create or replace function pg_temp.assert_md5(p_fn regprocedure, p_md5 text)
returns void
language plpgsql
as $$
begin
  if (select md5(prosrc) from pg_proc where oid = p_fn) <> p_md5 then
    raise exception '% changed since it was read (md5 mismatch) — re-read before patching', p_fn;
  end if;
end;
$$;

create or replace function pg_temp.replace_once(p_src text, p_old text, p_new text, p_what text)
returns text
language plpgsql
as $$
begin
  if (length(p_src) - length(replace(p_src, p_old, ''))) / length(p_old) <> 1 then
    raise exception '%: anchor not found exactly once — aborting rather than guessing', p_what;
  end if;
  return replace(p_src, p_old, p_new);
end;
$$;

do $mig$
declare
  v text;
begin
  perform pg_temp.assert_md5('public.fantasy_draft_tick()', '62cfdb7a12af91ff1ab50fd5251f9d06');
  perform pg_temp.assert_md5('public.fantasy_make_pick(uuid, text, text, text)', 'fa18763a456a4bbf230027af55ddc75b');
  perform pg_temp.assert_md5('public.fantasy_start_draft(uuid)', 'c09ea1f0a2f282bf5315ad099c790cfb');
  perform pg_temp.assert_md5('public.fantasy_set_autodraft(uuid, boolean)', 'bb4640491ca067a2aa02396ba9792ce2');

  v := pg_get_functiondef('public.fantasy_draft_tick()'::regprocedure);
  v := pg_temp.replace_once(v,
'    if v_draft.draft_type = ''auction'' then
      v_applied := v_applied + public.fantasy_auction_advance(v_draft.id);
    else
      v_applied := v_applied + public.fantasy_draft_run_clock(v_draft.id);
    end if;',
'    -- One broken draft must not stall every other draft''s clock.
    begin
      if v_draft.draft_type = ''auction'' then
        v_applied := v_applied + public.fantasy_auction_advance(v_draft.id);
      else
        v_applied := v_applied + public.fantasy_draft_run_clock(v_draft.id);
      end if;
    exception when others then
      raise warning ''fantasy_draft_tick: draft % failed: %'', v_draft.id, sqlerrm;
    end;',
    'fantasy_draft_tick per-draft isolation');
  execute v;

  v := pg_get_functiondef('public.fantasy_make_pick(uuid, text, text, text)'::regprocedure);
  v := pg_temp.replace_once(v,
'  -- Autodraft teams up next pick at once (Hunter, 2026-10-08).
  perform public.fantasy_draft_run_clock(p_draft);',
'  -- Autodraft teams up next pick at once (Hunter, 2026-10-08). An error there
  -- must not undo this pick; the 10 s tick retries it.
  begin
    perform public.fantasy_draft_run_clock(p_draft);
  exception when others then
    raise warning ''fantasy_make_pick: autodraft run failed for draft %: %'', p_draft, sqlerrm;
  end;',
    'fantasy_make_pick chain isolation');
  execute v;

  v := pg_get_functiondef('public.fantasy_start_draft(uuid)'::regprocedure);
  v := pg_temp.replace_once(v,
'  -- Teams already on autodraft pick (or nominate) right away.
  if v_draft.draft_type = ''auction'' then
    perform public.fantasy_auction_advance(p_draft);
  else
    perform public.fantasy_draft_run_clock(p_draft);
  end if;',
'  -- Teams already on autodraft pick (or nominate) right away. An error there
  -- must not undo the start; the 10 s tick retries it.
  begin
    if v_draft.draft_type = ''auction'' then
      perform public.fantasy_auction_advance(p_draft);
    else
      perform public.fantasy_draft_run_clock(p_draft);
    end if;
  exception when others then
    raise warning ''fantasy_start_draft: autodraft run failed for draft %: %'', p_draft, sqlerrm;
  end;',
    'fantasy_start_draft chain isolation');
  execute v;

  v := pg_get_functiondef('public.fantasy_set_autodraft(uuid, boolean)'::regprocedure);
  v := pg_temp.replace_once(v,
'  -- Draft row first (the engine''s lock order), then the team.
  select * into v_draft from public.fantasy_drafts where id = p_draft for update;
  if not found then
    raise exception ''unknown draft %'', p_draft;
  end if;
  if v_draft.status not in (''scheduled'', ''live'') then
    raise exception ''this draft is over'';
  end if;

  select id into v_team from public.fantasy_teams
  where contest_id = v_draft.contest_id and owner_id = v_caller;
  if v_team is null then
    raise exception ''you do not have a team in this contest'';
  end if;
',
'  -- The caller''s team first, so a stranger never takes the draft row lock.
  -- (A draft''s contest never changes.)
  select id into v_team from public.fantasy_teams
  where owner_id = v_caller
    and contest_id = (select d.contest_id from public.fantasy_drafts d where d.id = p_draft);
  if v_team is null then
    raise exception ''you do not have a team in this contest'';
  end if;

  -- Draft row next (the engine''s lock order), then the team.
  select * into v_draft from public.fantasy_drafts where id = p_draft for update;
  if v_draft.status not in (''scheduled'', ''live'') then
    raise exception ''this draft is over'';
  end if;
',
    'fantasy_set_autodraft ownership first');
  v := pg_temp.replace_once(v,
'  -- Already on the clock? Pick (or nominate) now.
  if p_on and v_draft.status = ''live'' then
    if v_draft.draft_type = ''auction'' then
      perform public.fantasy_auction_advance(p_draft);
    else
      perform public.fantasy_draft_run_clock(p_draft);
    end if;
  end if;',
'  -- Already on the clock? Pick (or nominate) now. An error there must not
  -- undo the toggle; the 10 s tick retries it.
  if p_on and v_draft.status = ''live'' then
    begin
      if v_draft.draft_type = ''auction'' then
        perform public.fantasy_auction_advance(p_draft);
      else
        perform public.fantasy_draft_run_clock(p_draft);
      end if;
    exception when others then
      raise warning ''fantasy_set_autodraft: autodraft run failed for draft %: %'', p_draft, sqlerrm;
    end;
  end if;',
    'fantasy_set_autodraft chain isolation');
  execute v;
end;
$mig$;

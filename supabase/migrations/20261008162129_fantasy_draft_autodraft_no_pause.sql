-- Fantasy drafts: no pausing, a 90-second clock, and autodraft (Hunter,
-- 2026-10-08): "drafts shouldn't be able to pause, once its going it goes. if
-- a user doesn't make a pick in 90 seconds they autodraft the next player in
-- line ... and they get automatically set to auto-draft. a user in the draft
-- room should be able to set themselves on autodraft". A ranking system for
-- "next in line" comes later; for now it is the team's queue, then
-- fantasy_draft_best_available (unchanged).
-- APPLIED to prod 2026-10-08 (remote version 20261008162129); rollback-only
-- dry run of 12 scenarios passed first.
--
--   * fantasy_teams.autodraft: public read like the rest of the row. Clients
--     hold no UPDATE on it (only team_name), so only the engine and
--     fantasy_set_autodraft write it.
--   * fantasy_draft_run_clock(draft): the snake engine. It picks for the team
--     on the clock when that team is on autodraft, or when its clock ran out,
--     which also puts the team on autodraft. At most one round per call keeps
--     each transaction short; the tick carries on. Internal, no client EXECUTE.
--   * fantasy_resolve_clock keeps its member check and delegates to it.
--     fantasy_make_pick and fantasy_start_draft chain into it, so autodraft
--     teams pick at once.
--   * fantasy_auction_advance: an autodraft nominator nominates at once, and a
--     missed nomination puts the team on autodraft. Autodraft never bids.
--   * fantasy_set_autodraft(draft, on): acts on the caller's own team. Turning
--     it on while that team is on the clock picks or nominates now.
--   * fantasy_draft_tick() + pg_cron every 10 s: drafts advance with nobody in
--     the room. Clients still resolve at 0, and the first caller wins.
--   * The snake pick clock and the auction nomination clock are fixed at 90 s.
--     The args stay for shipped clients. The bid clock is unchanged.
--   * fantasy_pause_draft raises, and paused_at is cleared. The column, the
--     resume RPC and the refuse-when-paused trigger stay, inert.
--   * fantasy_undo_last_pick (snake) takes the undone team off autodraft, so
--     the engine doesn't re-make the pick at once.
--
-- Lock order everywhere: the fantasy_drafts row FOR UPDATE first, then
-- fantasy_teams. Live functions are PATCHED IN PLACE; each md5 is asserted
-- first and each anchor must occur exactly once. Live md5(prosrc) (2026-10-08):
--   fantasy_resolve_clock          4c49e69381ecbb129b428bc60da6106c
--   fantasy_make_pick              b7931afa7da03db73ef73b2a404a5906
--   fantasy_start_draft            83b2b490a4cdae83db998c0e1959b07f
--   fantasy_schedule_draft         1bc60971a5203c8577cee30100ee5651
--   fantasy_schedule_auction_draft 2e0782ea98928f68c6880d4e28e005cc
--   fantasy_auction_advance        76c5cda2355f173fda8a7988eaf130c8
--   fantasy_undo_last_pick         5c5c9a4bea92194c984f7c0cd458af08
--   fantasy_pause_draft            5b0a00ac7ee1456508d0ecb7db0f9268 (replaced whole)

alter table public.fantasy_teams add column autodraft boolean not null default false;

update public.fantasy_drafts set paused_at = null where paused_at is not null;
update public.fantasy_drafts set pick_seconds = 90 where status <> 'complete' and pick_seconds <> 90;
update public.fantasy_drafts set nomination_seconds = 90
where status <> 'complete' and draft_type = 'auction' and nomination_seconds <> 90;

-- ─── Snake engine ─────────────────────────────────────────────────────────────

create function public.fantasy_draft_run_clock(p_draft uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft       public.fantasy_drafts;
  v_contest     public.fantasy_contests;
  v_team_count  int;
  v_total_picks int;
  v_team        uuid;
  v_auto        boolean;
  v_applied     int := 0;
  v_queue       jsonb;
  v_entry       jsonb;
  v_pick_league text;
  v_pick_id     text;
  v_pick_name   text;
  v_next        int;
begin
  select * into v_draft from public.fantasy_drafts where id = p_draft for update;
  if not found or v_draft.draft_type <> 'snake' or v_draft.status <> 'live' then
    return 0;
  end if;

  select * into v_contest from public.fantasy_contests where id = v_draft.contest_id;
  v_team_count := jsonb_array_length(v_draft.draft_order);
  v_total_picks := v_draft.rounds * v_team_count;

  while v_draft.status = 'live' and v_draft.current_started_at is not null and v_applied < v_team_count loop
    v_team := public.fantasy_draft_team_on_clock(v_draft.draft_order, v_draft.current_overall);
    exit when v_team is null;

    select t.autodraft into v_auto from public.fantasy_teams t where t.id = v_team;
    if not coalesce(v_auto, false) then
      exit when now() < v_draft.current_started_at + make_interval(secs => v_draft.pick_seconds) + interval '3 seconds';
      -- A missed pick puts the team on autodraft.
      update public.fantasy_teams set autodraft = true where id = v_team;
    end if;

    -- Next in line: the team's queue, then the best available.
    v_pick_id := null;
    select entries into v_queue
    from public.fantasy_draft_queues
    where draft_id = p_draft and team_id = v_team;
    if v_queue is not null then
      for v_entry in select * from jsonb_array_elements(v_queue) loop
        if public.fantasy_draft_player_league_valid(v_contest.competition, v_entry ->> 'playerLeague')
           and not exists (
             select 1 from public.fantasy_draft_picks
             where draft_id = p_draft
               and player_league = (v_entry ->> 'playerLeague')
               and player_id = (v_entry ->> 'playerId')
           )
        then
          v_pick_league := v_entry ->> 'playerLeague';
          v_pick_id := v_entry ->> 'playerId';
          v_pick_name := coalesce(v_entry ->> 'playerName', v_entry ->> 'playerId');
          exit;
        end if;
      end loop;
    end if;
    if v_pick_id is null then
      select bp.player_league, bp.player_id, coalesce(bp.player_name, bp.player_id)
      into v_pick_league, v_pick_id, v_pick_name
      from public.fantasy_draft_best_available(p_draft, v_contest) bp;
    end if;

    if v_pick_id is not null then
      insert into public.fantasy_draft_picks (draft_id, overall, round, team_id, player_league, player_id, player_name, auto)
      values (p_draft, v_draft.current_overall, (v_draft.current_overall - 1) / v_team_count + 1, v_team,
              v_pick_league, v_pick_id, v_pick_name, true);
    end if;

    v_applied := v_applied + 1;
    v_next := v_draft.current_overall + 1;
    if v_next > v_total_picks then
      update public.fantasy_drafts
      set status = 'complete', current_overall = v_next, current_started_at = now()
      where id = p_draft
      returning * into v_draft;
      perform public.fantasy_draft_on_complete(p_draft, v_contest);
    else
      update public.fantasy_drafts
      set current_overall = v_next, current_started_at = now()
      where id = p_draft
      returning * into v_draft;
    end if;
  end loop;

  return v_applied;
end;
$$;

revoke all on function public.fantasy_draft_run_clock(uuid) from public, anon, authenticated;

-- ─── Patches to live functions ────────────────────────────────────────────────

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

create or replace function pg_temp.replace_between(p_src text, p_start text, p_end text, p_new text, p_what text)
returns text
language plpgsql
as $$
declare
  i int;
  j int;
begin
  if (length(p_src) - length(replace(p_src, p_start, ''))) / length(p_start) <> 1
     or (length(p_src) - length(replace(p_src, p_end, ''))) / length(p_end) <> 1 then
    raise exception '%: anchors not found exactly once — aborting rather than guessing', p_what;
  end if;
  i := strpos(p_src, p_start);
  j := strpos(p_src, p_end);
  if j < i then
    raise exception '%: anchors out of order', p_what;
  end if;
  return left(p_src, i - 1) || p_new || substr(p_src, j + length(p_end));
end;
$$;

do $mig$
declare
  v text;
begin
  perform pg_temp.assert_md5('public.fantasy_resolve_clock(uuid)', '4c49e69381ecbb129b428bc60da6106c');
  perform pg_temp.assert_md5('public.fantasy_make_pick(uuid, text, text, text)', 'b7931afa7da03db73ef73b2a404a5906');
  perform pg_temp.assert_md5('public.fantasy_start_draft(uuid)', '83b2b490a4cdae83db998c0e1959b07f');
  perform pg_temp.assert_md5('public.fantasy_schedule_draft(uuid, timestamptz, integer, integer)', '1bc60971a5203c8577cee30100ee5651');
  perform pg_temp.assert_md5('public.fantasy_schedule_auction_draft(uuid, timestamptz, integer, integer, integer, integer, integer)', '2e0782ea98928f68c6880d4e28e005cc');
  perform pg_temp.assert_md5('public.fantasy_auction_advance(uuid)', '76c5cda2355f173fda8a7988eaf130c8');
  perform pg_temp.assert_md5('public.fantasy_undo_last_pick(uuid)', '5c5c9a4bea92194c984f7c0cd458af08');
  perform pg_temp.assert_md5('public.fantasy_pause_draft(uuid)', '5b0a00ac7ee1456508d0ecb7db0f9268');

  -- resolve_clock: member check stays; the clock work moves to run_clock.
  v := pg_get_functiondef('public.fantasy_resolve_clock(uuid)'::regprocedure);
  v := pg_temp.replace_between(v,
'  v_team_count := jsonb_array_length(v_draft.draft_order);
  v_total_picks := v_draft.rounds * v_team_count;',
'  return v_applied;
end;',
'  return public.fantasy_draft_run_clock(p_draft);
end;',
    'fantasy_resolve_clock body');
  execute v;

  -- make_pick: autodraft teams up next pick at once.
  v := pg_get_functiondef('public.fantasy_make_pick(uuid, text, text, text)'::regprocedure);
  v := pg_temp.replace_once(v,
'  return v_pick;
end;',
'  -- Autodraft teams up next pick at once (Hunter, 2026-10-08).
  perform public.fantasy_draft_run_clock(p_draft);

  return v_pick;
end;',
    'fantasy_make_pick tail');
  execute v;

  -- start_draft: teams already on autodraft pick (or nominate) right away.
  v := pg_get_functiondef('public.fantasy_start_draft(uuid)'::regprocedure);
  v := pg_temp.replace_once(v,
'  returning * into v_draft;

  return v_draft;
end;',
'  returning * into v_draft;

  -- Teams already on autodraft pick (or nominate) right away.
  if v_draft.draft_type = ''auction'' then
    perform public.fantasy_auction_advance(p_draft);
  else
    perform public.fantasy_draft_run_clock(p_draft);
  end if;
  select * into v_draft from public.fantasy_drafts where id = p_draft;

  return v_draft;
end;',
    'fantasy_start_draft tail');
  execute v;

  -- schedule_draft: 90-second pick clock.
  v := pg_get_functiondef('public.fantasy_schedule_draft(uuid, timestamptz, integer, integer)'::regprocedure);
  v := pg_temp.replace_once(v,
'  if p_pick_seconds < 10 or p_pick_seconds > 600 then
    raise exception ''pick_seconds must be between 10 and 600'';
  end if;',
'  -- 90-second pick clock, fixed by the game (Hunter, 2026-10-08).
  -- p_pick_seconds is ignored (kept for shipped clients).
  p_pick_seconds := 90;',
    'fantasy_schedule_draft pick clock');
  execute v;

  -- schedule_auction_draft: 90 seconds to nominate.
  v := pg_get_functiondef('public.fantasy_schedule_auction_draft(uuid, timestamptz, integer, integer, integer, integer, integer)'::regprocedure);
  v := pg_temp.replace_once(v,
'  if p_nomination_seconds < 10 or p_nomination_seconds > 300 then
    raise exception ''nomination_seconds must be between 10 and 300'';
  end if;',
'  -- 90 seconds to nominate, fixed by the game (Hunter, 2026-10-08).
  -- p_nomination_seconds is ignored (kept for shipped clients).
  p_nomination_seconds := 90;',
    'fantasy_schedule_auction_draft nomination clock');
  execute v;

  -- auction_advance: the team up nominates at once when it's on autodraft, or
  -- when its clock ran out, which also puts it on autodraft.
  v := pg_get_functiondef('public.fantasy_auction_advance(uuid)'::regprocedure);
  v := pg_temp.replace_once(v,
'    if not found and v_draft.current_started_at is not null
       and now() >= v_draft.current_started_at + make_interval(secs => v_draft.nomination_seconds) + interval ''3 seconds''
    then
      v_next_team := public.fantasy_auction_team_to_nominate(p_draft);
',
'    -- (An assignment leaves FOUND from the nomination SELECT untouched.)
    v_next_team := case when found then null else public.fantasy_auction_team_to_nominate(p_draft) end;
    if not found and v_draft.current_started_at is not null
       and (
         now() >= v_draft.current_started_at + make_interval(secs => v_draft.nomination_seconds) + interval ''3 seconds''
         or exists (select 1 from public.fantasy_teams t where t.id = v_next_team and t.autodraft)
       )
    then
',
    'fantasy_auction_advance nominate condition');
  v := pg_temp.replace_once(v,
'        return v_applied;
      end if;

      select * into v_state from public.fantasy_auction_team_state(p_draft, v_next_team);',
'        return v_applied;
      end if;

      -- A missed nomination puts the team on autodraft (Hunter, 2026-10-08).
      update public.fantasy_teams set autodraft = true where id = v_next_team and not autodraft;

      select * into v_state from public.fantasy_auction_team_state(p_draft, v_next_team);',
    'fantasy_auction_advance autodraft on timeout');
  execute v;

  -- undo_last_pick (snake): off autodraft, or the engine re-makes the pick.
  v := pg_get_functiondef('public.fantasy_undo_last_pick(uuid)'::regprocedure);
  v := pg_temp.replace_once(v,
'  if not found then raise exception ''nothing to undo''; end if;
',
'  if not found then raise exception ''nothing to undo''; end if;

  -- Off autodraft, or the engine re-makes the undone pick at once (snake).
  if v_draft.draft_type <> ''auction'' then
    update public.fantasy_teams set autodraft = false where id = v_pick.team_id;
  end if;
',
    'fantasy_undo_last_pick autodraft');
  execute v;
end;
$mig$;

-- Drafts can't be paused. Signature kept so shipped clients get a clear error.
create or replace function public.fantasy_pause_draft(p_draft uuid)
returns public.fantasy_drafts
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Drafts can''t be paused — once a draft starts it runs to the end.';
end;
$$;

-- ─── Autodraft toggle (the caller's own team) ─────────────────────────────────

create function public.fantasy_set_autodraft(p_draft uuid, p_on boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_draft  public.fantasy_drafts;
  v_team   uuid;
begin
  if v_caller is null then
    raise exception 'not authenticated';
  end if;
  if p_on is null then
    raise exception 'p_on is required';
  end if;

  -- Draft row first (the engine's lock order), then the team.
  select * into v_draft from public.fantasy_drafts where id = p_draft for update;
  if not found then
    raise exception 'unknown draft %', p_draft;
  end if;
  if v_draft.status not in ('scheduled', 'live') then
    raise exception 'this draft is over';
  end if;

  select id into v_team from public.fantasy_teams
  where contest_id = v_draft.contest_id and owner_id = v_caller;
  if v_team is null then
    raise exception 'you do not have a team in this contest';
  end if;

  update public.fantasy_teams set autodraft = p_on where id = v_team;

  -- Already on the clock? Pick (or nominate) now.
  if p_on and v_draft.status = 'live' then
    if v_draft.draft_type = 'auction' then
      perform public.fantasy_auction_advance(p_draft);
    else
      perform public.fantasy_draft_run_clock(p_draft);
    end if;
  end if;

  return p_on;
end;
$$;

revoke all on function public.fantasy_set_autodraft(uuid, boolean) from public, anon, authenticated;
grant execute on function public.fantasy_set_autodraft(uuid, boolean) to authenticated;

-- ─── Server clock ─────────────────────────────────────────────────────────────

create function public.fantasy_draft_tick()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft   record;
  v_applied int := 0;
begin
  -- A draft a client is mid-pick on is skipped; the next tick gets it.
  for v_draft in
    select id, draft_type from public.fantasy_drafts
    where status = 'live'
    for update skip locked
  loop
    if v_draft.draft_type = 'auction' then
      v_applied := v_applied + public.fantasy_auction_advance(v_draft.id);
    else
      v_applied := v_applied + public.fantasy_draft_run_clock(v_draft.id);
    end if;
  end loop;
  return v_applied;
end;
$$;

revoke all on function public.fantasy_draft_tick() from public, anon, authenticated;

select cron.schedule('fantasy-draft-clock', '10 seconds', $$select public.fantasy_draft_tick()$$);

notify pgrst, 'reload schema';

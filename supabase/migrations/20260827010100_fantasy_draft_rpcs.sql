-- ─────────────────────────────────────────────────────────────────────────────
-- Fantasy V2 — Draft room RPCs.
--
-- fantasy_schedule_draft / fantasy_start_draft / fantasy_make_pick /
-- fantasy_resolve_clock / fantasy_set_queue. All SECURITY DEFINER,
-- search_path='', REVOKE ALL FROM PUBLIC then GRANT to authenticated —
-- 20260815 house style (20260815015541_fantasy_league_rpcs.sql).
--
-- Snake math: fantasy_draft_team_on_clock(draft_order, current_overall)
-- mirrors teamOnClock() in src/lib/fantasy/draft-room.ts EXACTLY — same
-- 0-based round/pos derivation, same reversal on odd 0-based rounds.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── fantasy_draft_team_on_clock — shared snake helper (internal) ───────────
create or replace function public.fantasy_draft_team_on_clock(p_draft_order jsonb, p_current_overall int)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  n     int := jsonb_array_length(p_draft_order);
  idx0  int;
  rnd   int;
  pos   int;
begin
  if n = 0 then
    return null;
  end if;
  idx0 := p_current_overall - 1;
  rnd  := idx0 / n;          -- 0-based round, integer division
  pos  := idx0 % n;
  if rnd % 2 = 0 then
    return (p_draft_order ->> pos)::uuid;
  else
    return (p_draft_order ->> (n - 1 - pos))::uuid;
  end if;
end;
$$;

revoke all on function public.fantasy_draft_team_on_clock(jsonb, int) from public;
grant execute on function public.fantasy_draft_team_on_clock(jsonb, int) to authenticated;

comment on function public.fantasy_draft_team_on_clock is 'Mirrors teamOnClock() in src/lib/fantasy/draft-room.ts. Server-authoritative snake resolution — keep both in lockstep on any change.';

-- ── fantasy_draft_player_league_valid — competition -> player_league gate ──
-- Mirrors src/lib/fantasy/competitions.ts COMPETITIONS[].playerLeague. Kept
-- as a small internal helper so fantasy_make_pick stays readable.
create or replace function public.fantasy_draft_player_league_valid(p_competition text, p_player_league text)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select case p_competition
    when 'ufa' then p_player_league = 'ufa'
    when 'pul' then p_player_league = 'pul'
    when 'wul' then p_player_league = 'wul'
    when 'usau-club-nationals' then p_player_league = 'usau'
    when 'usau-college-nationals' then p_player_league = 'usau'
    when 'wfdf-wucc' then p_player_league = 'wfdf'
    else false
  end;
$$;

revoke all on function public.fantasy_draft_player_league_valid(text, text) from public;
grant execute on function public.fantasy_draft_player_league_valid(text, text) to authenticated;

-- ── fantasy_draft_competition_player_league — reverse of the above, for
-- autopick inserts where the league is derived from the contest, not caller
-- input. Mirrors competitions.ts COMPETITIONS[].playerLeague. ──
create or replace function public.fantasy_draft_competition_player_league(p_competition text)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select case p_competition
    when 'ufa' then 'ufa'
    when 'pul' then 'pul'
    when 'wul' then 'wul'
    when 'usau-club-nationals' then 'usau'
    when 'usau-college-nationals' then 'usau'
    when 'wfdf-wucc' then 'wfdf'
    else null
  end;
$$;

revoke all on function public.fantasy_draft_competition_player_league(text) from public;
grant execute on function public.fantasy_draft_competition_player_league(text) to authenticated;

-- ── fantasy_draft_seed_event_rosters — internal, shared by fantasy_make_pick
-- and fantasy_resolve_clock. Event-mode contests: the drafted pool IS the
-- lineup, so on draft completion insert each team's first <flex> picks (by
-- draft order = priority order) as 'event'-period flex roster slots. No-op
-- for weekly-mode contests (UFA/PUL/WUL owners set lineups manually). ──
create or replace function public.fantasy_draft_seed_event_rosters(p_draft uuid, p_contest_mode text, p_flex int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seed record;
begin
  if p_contest_mode <> 'event' then
    return;
  end if;

  for v_seed in
    select team_id, player_league, player_id,
           row_number() over (partition by team_id order by overall) as rn
    from public.fantasy_draft_picks
    where draft_id = p_draft
  loop
    if v_seed.rn <= p_flex then
      insert into public.fantasy_roster_slots (team_id, week, player_id, player_league, role)
      values (v_seed.team_id, 'event', v_seed.player_id, v_seed.player_league, 'flex')
      on conflict do nothing;
    end if;
  end loop;
end;
$$;

revoke all on function public.fantasy_draft_seed_event_rosters(uuid, text, int) from public;
grant execute on function public.fantasy_draft_seed_event_rosters(uuid, text, int) to authenticated;

-- ── fantasy_schedule_draft ──────────────────────────────────────────────────
create or replace function public.fantasy_schedule_draft(
  p_contest uuid,
  p_at timestamptz,
  p_pick_seconds int default 60,
  p_rounds int default 12
)
returns public.fantasy_drafts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller  uuid := (select auth.uid());
  v_league  uuid;
  v_status  text;
  v_order   jsonb;
  v_draft   public.fantasy_drafts;
begin
  if v_caller is null then
    raise exception 'not authenticated';
  end if;

  select league_id, status into v_league, v_status
  from public.fantasy_contests
  where id = p_contest
  for update;

  if not found then
    raise exception 'unknown contest %', p_contest;
  end if;

  if v_league is null then
    raise exception 'the Public League never drafts';
  end if;

  if not public.fantasy_is_commissioner(v_league) then
    raise exception 'not authorized — commissioner only';
  end if;

  if v_status <> 'open' then
    raise exception 'contest is not open for drafting (status: %)', v_status;
  end if;

  if p_pick_seconds < 10 or p_pick_seconds > 600 then
    raise exception 'pick_seconds must be between 10 and 600';
  end if;
  if p_rounds < 1 or p_rounds > 40 then
    raise exception 'rounds must be between 1 and 40';
  end if;

  select coalesce(jsonb_agg(id order by random()), '[]'::jsonb) into v_order
  from public.fantasy_teams
  where contest_id = p_contest;

  if jsonb_array_length(v_order) < 2 then
    raise exception 'a draft needs at least 2 teams';
  end if;

  insert into public.fantasy_drafts (contest_id, status, rounds, pick_seconds, draft_order, scheduled_at, created_by)
  values (p_contest, 'scheduled', p_rounds, p_pick_seconds, v_order, p_at, v_caller)
  returning * into v_draft;

  update public.fantasy_contests
  set settings = settings || jsonb_build_object('draft', true)
  where id = p_contest;

  return v_draft;
end;
$$;

revoke all on function public.fantasy_schedule_draft(uuid, timestamptz, int, int) from public;
grant execute on function public.fantasy_schedule_draft(uuid, timestamptz, int, int) to authenticated;

-- ── fantasy_start_draft ──────────────────────────────────────────────────────
create or replace function public.fantasy_start_draft(p_draft uuid)
returns public.fantasy_drafts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contest uuid;
  v_league  uuid;
  v_status  text;
  v_order   jsonb;
  v_draft   public.fantasy_drafts;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;

  select contest_id, status into v_contest, v_status
  from public.fantasy_drafts
  where id = p_draft
  for update;

  if not found then
    raise exception 'unknown draft %', p_draft;
  end if;

  select league_id into v_league from public.fantasy_contests where id = v_contest;

  if not public.fantasy_is_commissioner(v_league) then
    raise exception 'not authorized — commissioner only';
  end if;

  if v_status <> 'scheduled' then
    raise exception 'draft is not scheduled (status: %)', v_status;
  end if;

  -- Final shuffle at start (the schedule-time order was provisional).
  select coalesce(jsonb_agg(id order by random()), '[]'::jsonb) into v_order
  from public.fantasy_teams
  where contest_id = v_contest;

  if jsonb_array_length(v_order) < 2 then
    raise exception 'a draft needs at least 2 teams';
  end if;

  update public.fantasy_drafts
  set status = 'live',
      draft_order = v_order,
      current_overall = 1,
      current_started_at = now()
  where id = p_draft
  returning * into v_draft;

  return v_draft;
end;
$$;

revoke all on function public.fantasy_start_draft(uuid) from public;
grant execute on function public.fantasy_start_draft(uuid) to authenticated;

-- ── fantasy_make_pick ─────────────────────────────────────────────────────────
create or replace function public.fantasy_make_pick(
  p_draft uuid,
  p_player_league text,
  p_player_id text,
  p_player_name text
)
returns public.fantasy_draft_picks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller       uuid := (select auth.uid());
  v_draft        public.fantasy_drafts;
  v_contest      public.fantasy_contests;
  v_team_on_clock uuid;
  v_round        int;
  v_team_count   int;
  v_pick         public.fantasy_draft_picks;
  v_next_overall int;
  v_total_picks  int;
begin
  if v_caller is null then
    raise exception 'not authenticated';
  end if;

  select * into v_draft from public.fantasy_drafts where id = p_draft for update;
  if not found then
    raise exception 'unknown draft %', p_draft;
  end if;

  if v_draft.status <> 'live' then
    raise exception 'draft is not live (status: %)', v_draft.status;
  end if;

  select * into v_contest from public.fantasy_contests where id = v_draft.contest_id;

  if not public.fantasy_draft_player_league_valid(v_contest.competition, p_player_league) then
    raise exception 'player_league % is not valid for %', p_player_league, v_contest.competition;
  end if;

  v_team_on_clock := public.fantasy_draft_team_on_clock(v_draft.draft_order, v_draft.current_overall);
  if v_team_on_clock is null then
    raise exception 'no team on the clock';
  end if;

  if not exists (
    select 1 from public.fantasy_teams
    where id = v_team_on_clock and owner_id = v_caller
  ) then
    raise exception 'not your team''s turn to pick';
  end if;

  if exists (
    select 1 from public.fantasy_draft_picks
    where draft_id = p_draft and player_league = p_player_league and player_id = p_player_id
  ) then
    raise exception 'player already drafted';
  end if;

  v_team_count := jsonb_array_length(v_draft.draft_order);
  v_round := (v_draft.current_overall - 1) / v_team_count + 1;

  insert into public.fantasy_draft_picks (draft_id, overall, round, team_id, player_league, player_id, player_name, auto)
  values (p_draft, v_draft.current_overall, v_round, v_team_on_clock, p_player_league, p_player_id, p_player_name, false)
  returning * into v_pick;

  v_next_overall := v_draft.current_overall + 1;
  v_total_picks := v_draft.rounds * v_team_count;

  if v_next_overall > v_total_picks then
    update public.fantasy_drafts
    set status = 'complete', current_overall = v_next_overall, current_started_at = now()
    where id = p_draft;

    -- Event-mode contests: the drafted pool IS the lineup — seed the 'event'
    -- period flex roster slots from each team's first <flex> picks (draft
    -- order = priority order). weekly-mode (UFA/PUL/WUL): no-op — owners set
    -- 4O/3D from their drafted pool via the existing roster flow.
    perform public.fantasy_draft_seed_event_rosters(
      p_draft, coalesce(v_contest.settings ->> 'mode', 'weekly-stats'), coalesce((v_contest.settings ->> 'flex')::int, 7)
    );
  else
    update public.fantasy_drafts
    set current_overall = v_next_overall, current_started_at = now()
    where id = p_draft;
  end if;

  return v_pick;
end;
$$;

revoke all on function public.fantasy_make_pick(uuid, text, text, text) from public;
grant execute on function public.fantasy_make_pick(uuid, text, text, text) to authenticated;

comment on function public.fantasy_make_pick is 'Validates: draft live, caller owns the on-clock team (snake math via fantasy_draft_team_on_clock), player not already picked, player_league valid for the contest competition. Advances the clock; on the final pick marks the draft complete and, for event-mode contests, seeds fantasy_roster_slots flex slots (period ''event'') from each team''s first <flex> picks by draft order. Unique(draft_id, player_league, player_id) is the hard backstop against a race past the pre-check.';

-- ── fantasy_resolve_clock ────────────────────────────────────────────────────
create or replace function public.fantasy_resolve_clock(p_draft uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft        public.fantasy_drafts;
  v_contest      public.fantasy_contests;
  v_league       uuid;
  v_team_count   int;
  v_total_picks  int;
  v_team_on_clock uuid;
  v_applied      int := 0;
  v_queue        jsonb;
  v_entry        jsonb;
  v_picked_id    text;
  v_best         record;
  v_round        int;
  v_next_overall int;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;

  select * into v_draft from public.fantasy_drafts where id = p_draft for update;
  if not found then
    raise exception 'unknown draft %', p_draft;
  end if;

  if v_draft.status <> 'live' then
    return 0;
  end if;

  select * into v_contest from public.fantasy_contests where id = v_draft.contest_id;
  select league_id into v_league from public.fantasy_contests where id = v_draft.contest_id;

  if v_league is not null and not exists (
    select 1 from public.fantasy_league_members
    where league_id = v_league and user_id = (select auth.uid())
  ) then
    raise exception 'not authorized — league members only';
  end if;

  v_team_count := jsonb_array_length(v_draft.draft_order);
  v_total_picks := v_draft.rounds * v_team_count;

  -- Loop while the CURRENT pick's clock is expired (+3s grace); each
  -- iteration re-reads current_started_at/current_overall from v_draft, which
  -- we update in-loop — the row lock (for update above) keeps this atomic
  -- against concurrent callers, so a second caller simply sees status
  -- already advanced and no-ops on the remaining (already-resolved) picks.
  while v_draft.status = 'live'
    and v_draft.current_started_at is not null
    and now() >= v_draft.current_started_at + make_interval(secs => v_draft.pick_seconds) + interval '3 seconds'
  loop
    v_team_on_clock := public.fantasy_draft_team_on_clock(v_draft.draft_order, v_draft.current_overall);
    exit when v_team_on_clock is null;

    v_picked_id := null;

    -- 1) Queue: first entry not yet drafted in this draft.
    select entries into v_queue
    from public.fantasy_draft_queues
    where draft_id = p_draft and team_id = v_team_on_clock;

    if v_queue is not null then
      for v_entry in select * from jsonb_array_elements(v_queue)
      loop
        if not exists (
          select 1 from public.fantasy_draft_picks
          where draft_id = p_draft
            and player_league = (v_entry ->> 'playerLeague')
            and player_id = (v_entry ->> 'playerId')
        ) then
          v_picked_id := v_entry ->> 'playerId';
          exit;
        end if;
      end loop;
    end if;

    if v_picked_id is not null then
      v_round := (v_draft.current_overall - 1) / v_team_count + 1;
      insert into public.fantasy_draft_picks (draft_id, overall, round, team_id, player_league, player_id, player_name, auto)
      values (p_draft, v_draft.current_overall, v_round, v_team_on_clock,
              v_entry ->> 'playerLeague', v_entry ->> 'playerId', coalesce(v_entry ->> 'playerName', v_entry ->> 'playerId'), true);
    else
      -- 2) Best-available by current-season production, per competition.
      v_best := null;

      if v_contest.competition = 'ufa' then
        select p.id as player_id, p.full_name as player_name
        into v_best
        from public.ufa_players p
        join public.ufa_game_player_stats s on s.player_id = p.id
        join public.ufa_games g on g.id = s.game_id and g.year = v_contest.season_year
        where not exists (
          select 1 from public.fantasy_draft_picks dp
          where dp.draft_id = p_draft and dp.player_league = 'ufa' and dp.player_id = p.id
        )
        group by p.id, p.full_name
        order by sum(s.goals + s.assists + s.blocks) desc
        limit 1;

      elsif v_contest.competition in ('pul','wul') then
        if v_contest.competition = 'pul' then
          select pl.player_name as player_id, pl.player_name as player_name
          into v_best
          from public.pul_players pl
          where pl.season = v_contest.season_year
            and not exists (
              select 1 from public.fantasy_draft_picks dp
              where dp.draft_id = p_draft and dp.player_league = 'pul' and dp.player_id = pl.player_name
            )
          order by (pl.goals + pl.assists + pl.blocks) desc
          limit 1;
        else
          select wl.player_name as player_id, wl.player_name as player_name
          into v_best
          from public.wul_players wl
          where wl.season = v_contest.season_year
            and not exists (
              select 1 from public.fantasy_draft_picks dp
              where dp.draft_id = p_draft and dp.player_league = 'wul' and dp.player_id = wl.player_name
            )
          order by (wl.goals + wl.assists + wl.blocks) desc
          limit 1;
        end if;

      elsif v_contest.competition in ('usau-club-nationals','usau-college-nationals') then
        select pes.player_id::text as player_id, up.display_name as player_name
        into v_best
        from public.usau_player_event_stats pes
        join public.usau_players up on up.id = pes.player_id
        where pes.event_id = (v_contest.settings ->> 'eventId')::uuid
          and not exists (
            select 1 from public.fantasy_draft_picks dp
            where dp.draft_id = p_draft and dp.player_league = 'usau' and dp.player_id = pes.player_id::text
          )
        order by (coalesce(pes.goals,0) + coalesce(pes.assists,0)) desc
        limit 1;

      elsif v_contest.competition = 'wfdf-wucc' then
        select r.id::text as player_id, r.full_name as player_name
        into v_best
        from public.wfdf_rosters r
        where r.event_id = (v_contest.settings ->> 'eventId')::uuid
          and not exists (
            select 1 from public.fantasy_draft_picks dp
            where dp.draft_id = p_draft and dp.player_league = 'wfdf' and dp.player_id = r.id::text
          )
        order by (coalesce(r.goals,0) + coalesce(r.assists,0) + coalesce(r.callahans,0)) desc
        limit 1;
      end if;

      if v_best.player_id is not null then
        v_round := (v_draft.current_overall - 1) / v_team_count + 1;
        insert into public.fantasy_draft_picks (draft_id, overall, round, team_id, player_league, player_id, player_name, auto)
        values (p_draft, v_draft.current_overall, v_round, v_team_on_clock,
                public.fantasy_draft_competition_player_league(v_contest.competition),
                v_best.player_id, coalesce(v_best.player_name, v_best.player_id), true);
      else
        -- No eligible player left at all (pool exhausted) — advance the
        -- clock with no pick rather than looping forever.
        null;
      end if;
    end if;

    v_applied := v_applied + 1;
    v_next_overall := v_draft.current_overall + 1;

    if v_next_overall > v_total_picks then
      update public.fantasy_drafts
      set status = 'complete', current_overall = v_next_overall, current_started_at = now()
      where id = p_draft
      returning * into v_draft;

      perform public.fantasy_draft_seed_event_rosters(
        p_draft, coalesce(v_contest.settings ->> 'mode', 'weekly-stats'), coalesce((v_contest.settings ->> 'flex')::int, 7)
      );
    else
      update public.fantasy_drafts
      set current_overall = v_next_overall, current_started_at = now()
      where id = p_draft
      returning * into v_draft;
    end if;
  end loop;

  return v_applied;
end;
$$;

revoke all on function public.fantasy_resolve_clock(uuid) from public;
grant execute on function public.fantasy_resolve_clock(uuid) to authenticated;

comment on function public.fantasy_resolve_clock is 'Lazy clock resolution — no cron. Any league member may call; loops while the current pick is expired (+3s grace), autopicking from the on-clock team''s queue else best-available (per-competition single aggregate query: UFA=ufa_game_player_stats season sum, PUL/WUL=season row, USAU=usau_player_event_stats event row, WFDF=wfdf_rosters event row). Row lock (SELECT ... FOR UPDATE on fantasy_drafts) makes concurrent callers race-safe: only one advances the clock per expired pick. Returns count of autopicks applied.';

-- ── fantasy_set_queue ─────────────────────────────────────────────────────────
create or replace function public.fantasy_set_queue(p_draft uuid, p_entries jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller  uuid := (select auth.uid());
  v_contest uuid;
  v_team    uuid;
begin
  if v_caller is null then
    raise exception 'not authenticated';
  end if;

  if jsonb_typeof(p_entries) <> 'array' then
    raise exception 'p_entries must be a JSON array';
  end if;
  if jsonb_array_length(p_entries) > 100 then
    raise exception 'queue is capped at 100 entries';
  end if;

  select contest_id into v_contest from public.fantasy_drafts where id = p_draft;
  if not found then
    raise exception 'unknown draft %', p_draft;
  end if;

  select id into v_team from public.fantasy_teams
  where contest_id = v_contest and owner_id = v_caller;

  if v_team is null then
    raise exception 'you do not have a team in this contest';
  end if;

  insert into public.fantasy_draft_queues (draft_id, team_id, entries, updated_at)
  values (p_draft, v_team, p_entries, now())
  on conflict (draft_id, team_id)
  do update set entries = excluded.entries, updated_at = now();
end;
$$;

revoke all on function public.fantasy_set_queue(uuid, jsonb) from public;
grant execute on function public.fantasy_set_queue(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';

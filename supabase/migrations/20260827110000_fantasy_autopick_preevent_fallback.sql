-- ─────────────────────────────────────────────────────────────────────────────
-- Fantasy — pre-event autopick fallback for USAU event drafts.
--
-- Bug (found during the Club Nationals e2e, 2026-08-27): fantasy_resolve_clock
-- ranks USAU best-available by usau_player_event_stats for the contest's
-- event — which has ZERO rows before the event starts, i.e. exactly when every
-- event draft runs (the draft window closes at event lock). A queueless
-- expired turn therefore advanced with NO pick, permanently shorting that
-- team's roster. WFDF is unaffected (wfdf_rosters rows ARE its pool, so its
-- query returns a row even at 0 stats).
--
-- Fix: when the stats-ranked pick comes back empty, fall back to any
-- undrafted player rostered on the event's teams (usau_rosters ⋈
-- usau_event_teams for the frozen eventId + season), ordered by display_name
-- for determinism. Post-event behavior is unchanged (stats ranking still wins
-- when stats exist).
--
-- Deployed body verified byte-identical to committed
-- 20260827010100_fantasy_draft_rpcs.sql before this replace (prosrc diff).
-- Only the usau branch of the best-available block changes.
-- ─────────────────────────────────────────────────────────────────────────────

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

        -- Pre-event there are NO event stats (drafts close at event lock, so
        -- this is the normal case): fall back to any undrafted player
        -- rostered on the event's teams, name-ordered for determinism.
        if v_best.player_id is null then
          select r.player_id::text as player_id, up.display_name as player_name
          into v_best
          from public.usau_rosters r
          join public.usau_event_teams et on et.team_id = r.team_id
            and et.event_id = (v_contest.settings ->> 'eventId')::uuid
          join public.usau_players up on up.id = r.player_id
          where r.season = v_contest.season_year
            and not exists (
              select 1 from public.fantasy_draft_picks dp
              where dp.draft_id = p_draft and dp.player_league = 'usau' and dp.player_id = r.player_id::text
            )
          order by up.display_name
          limit 1;
        end if;

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

notify pgrst, 'reload schema';

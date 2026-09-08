-- ─────────────────────────────────────────────────────────────────────────────
-- Fantasy expansion, migration 6 of 9 — draft readiness, reschedule, and the
-- snake-draft RPC replacements needed to support both (4-team minimum,
-- on-complete hooks that seed ownership + schedules, eucs best-available).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.fantasy_drafts
  add column if not exists original_scheduled_at timestamptz,
  add column if not exists reschedule_count int not null default 0;

update public.fantasy_drafts
set original_scheduled_at = scheduled_at
where original_scheduled_at is null;

comment on column public.fantasy_drafts.original_scheduled_at is 'The FIRST scheduled_at ever set for this draft (never updated by reschedule) — the anchor the 2-day-after-missed reschedule floor is measured from.';
comment on column public.fantasy_drafts.reschedule_count is 'How many times fantasy_reschedule_draft has moved this draft. Display-only.';

-- ── fantasy_draft_rosters_ready — internal readiness helper ──────────────────
create or replace function public.fantasy_draft_rosters_ready(p_contest uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_competition text;
  v_season      int;
  v_event_id    text;
  v_event_uuid  uuid;
begin
  select competition, season_year, settings->>'eventId'
    into v_competition, v_season, v_event_id
  from public.fantasy_contests
  where id = p_contest;

  if v_competition in ('usau-club-nationals', 'usau-college-nationals') then
    if v_event_id is null then
      return false;
    end if;
    v_event_uuid := v_event_id::uuid;
    return exists (
      select 1
      from public.usau_rosters r
      join public.usau_event_teams et on et.team_id = r.team_id and et.event_id = v_event_uuid
      where r.season = v_season
    );
  elsif v_competition = 'wfdf-wucc' then
    if v_event_id is null then
      return false;
    end if;
    return exists (select 1 from public.wfdf_rosters where event_id = v_event_id::uuid);
  elsif v_competition = 'eucs' then
    if v_event_id is null then
      return false;
    end if;
    return exists (select 1 from public.euf_rosters where event_id = v_event_id::uuid);
  else
    -- weekly-stats (ufa/pul/wul): "ready" once the contest has periods.
    return exists (select 1 from public.fantasy_contest_periods where contest_id = p_contest);
  end if;
end;
$$;

revoke execute on function public.fantasy_draft_rosters_ready(uuid) from anon, authenticated, public;

-- ── fantasy_draft_source_label — internal display helper ─────────────────────
create or replace function public.fantasy_draft_source_label(p_competition text)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select case p_competition
    when 'ufa' then 'UFA'
    when 'pul' then 'PUL'
    when 'wul' then 'WUL'
    when 'usau-club-nationals' then 'USAU'
    when 'usau-college-nationals' then 'USAU'
    when 'wfdf-wucc' then 'WFDF'
    when 'eucs' then 'EUF'
    else null
  end;
$$;

revoke execute on function public.fantasy_draft_source_label(text) from anon, authenticated, public;

-- ── fantasy_draft_default_at — internal default-time helper ──────────────────
create or replace function public.fantasy_draft_default_at(p_contest uuid)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_competition text;
  v_event_id    text;
  v_start_date  date;
  v_floor       timestamptz;
  v_anchor      date;
  v_min_lock    timestamptz;
begin
  select competition, settings->>'eventId' into v_competition, v_event_id
  from public.fantasy_contests
  where id = p_contest;

  if v_competition in ('usau-club-nationals', 'usau-college-nationals', 'wfdf-wucc', 'eucs') then
    if v_event_id is null then
      return null;
    end if;
    if v_competition = 'wfdf-wucc' then
      select start_date into v_start_date from public.wfdf_events where id = v_event_id::uuid;
    elsif v_competition = 'eucs' then
      select start_date into v_start_date from public.euf_events where id = v_event_id::uuid;
    else
      select start_date into v_start_date from public.usau_events where id = v_event_id::uuid;
    end if;

    if v_start_date is null then
      return null;
    end if;

    v_floor := public.fantasy_draft_earliest_at(p_contest);
    v_anchor := greatest(v_start_date - 7, (v_floor at time zone 'America/New_York')::date);

    return (v_anchor::timestamp + time '20:00') at time zone 'America/New_York';
  else
    select min(lock_at) into v_min_lock
    from public.fantasy_contest_periods
    where contest_id = p_contest;

    if v_min_lock is null then
      return null;
    end if;

    return (((v_min_lock at time zone 'America/New_York')::date - 14)::timestamp + time '20:00')
           at time zone 'America/New_York';
  end if;
end;
$$;

revoke execute on function public.fantasy_draft_default_at(uuid) from anon, authenticated, public;

comment on function public.fantasy_draft_default_at is 'Suggested draft time: event contests = greatest(start-7d, earliest-draft floor) at 8pm ET; weekly contests = 14 days before the first period lock, 8pm ET. Null when there is nothing to anchor on yet (no eventId / no periods).';

-- ── fantasy_draft_best_available — internal, lifted from fantasy_resolve_clock
-- (20260827110000), extended with the eucs branch over euf_rosters. Excludes
-- both existing picks and (once migration 7 lands) open nominations, via the
-- p_exclude_nominated flag. ──
create or replace function public.fantasy_draft_best_available(p_draft uuid, p_contest public.fantasy_contests)
returns table (player_league text, player_id text, player_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_best record;
begin
  if p_contest.competition = 'ufa' then
    select p.id as player_id, p.full_name as player_name
    into v_best
    from public.ufa_players p
    join public.ufa_game_player_stats s on s.player_id = p.id
    join public.ufa_games g on g.id = s.game_id and g.year = p_contest.season_year
    where not exists (
      select 1 from public.fantasy_draft_picks dp
      where dp.draft_id = p_draft and dp.player_league = 'ufa' and dp.player_id = p.id
    )
    group by p.id, p.full_name
    order by sum(s.goals + s.assists + s.blocks) desc
    limit 1;

  elsif p_contest.competition in ('pul','wul') then
    if p_contest.competition = 'pul' then
      select pl.player_name as player_id, pl.player_name as player_name
      into v_best
      from public.pul_players pl
      where pl.season = p_contest.season_year
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
      where wl.season = p_contest.season_year
        and not exists (
          select 1 from public.fantasy_draft_picks dp
          where dp.draft_id = p_draft and dp.player_league = 'wul' and dp.player_id = wl.player_name
        )
      order by (wl.goals + wl.assists + wl.blocks) desc
      limit 1;
    end if;

  elsif p_contest.competition in ('usau-club-nationals','usau-college-nationals') then
    select pes.player_id::text as player_id, up.display_name as player_name
    into v_best
    from public.usau_player_event_stats pes
    join public.usau_players up on up.id = pes.player_id
    where pes.event_id = (p_contest.settings ->> 'eventId')::uuid
      and not exists (
        select 1 from public.fantasy_draft_picks dp
        where dp.draft_id = p_draft and dp.player_league = 'usau' and dp.player_id = pes.player_id::text
      )
    order by (coalesce(pes.goals,0) + coalesce(pes.assists,0)) desc
    limit 1;

    -- Pre-event there are NO event stats — fall back to any undrafted player
    -- rostered on the event's teams, name-ordered for determinism.
    if v_best.player_id is null then
      select r.player_id::text as player_id, up.display_name as player_name
      into v_best
      from public.usau_rosters r
      join public.usau_event_teams et on et.team_id = r.team_id
        and et.event_id = (p_contest.settings ->> 'eventId')::uuid
      join public.usau_players up on up.id = r.player_id
      where r.season = p_contest.season_year
        and not exists (
          select 1 from public.fantasy_draft_picks dp
          where dp.draft_id = p_draft and dp.player_league = 'usau' and dp.player_id = r.player_id::text
        )
      order by up.display_name
      limit 1;
    end if;

  elsif p_contest.competition = 'wfdf-wucc' then
    select r.id::text as player_id, r.full_name as player_name
    into v_best
    from public.wfdf_rosters r
    where r.event_id = (p_contest.settings ->> 'eventId')::uuid
      and not exists (
        select 1 from public.fantasy_draft_picks dp
        where dp.draft_id = p_draft and dp.player_league = 'wfdf' and dp.player_id = r.id::text
      )
    order by (coalesce(r.goals,0) + coalesce(r.assists,0) + coalesce(r.callahans,0)) desc
    limit 1;

  elsif p_contest.competition = 'eucs' then
    select r.id::text as player_id, r.full_name as player_name
    into v_best
    from public.euf_rosters r
    where r.event_id = (p_contest.settings ->> 'eventId')::uuid
      and not exists (
        select 1 from public.fantasy_draft_picks dp
        where dp.draft_id = p_draft and dp.player_league = 'euf' and dp.player_id = r.id::text
      )
    order by (coalesce(r.goals,0) + coalesce(r.assists,0)) desc
    limit 1;
  end if;

  if v_best.player_id is not null then
    return query select
      public.fantasy_draft_competition_player_league(p_contest.competition),
      v_best.player_id,
      coalesce(v_best.player_name, v_best.player_id);
  end if;
  return;
end;
$$;

revoke execute on function public.fantasy_draft_best_available(uuid, public.fantasy_contests) from anon, authenticated, public;

-- ── fantasy_draft_on_complete — internal completion hook ─────────────────────
create or replace function public.fantasy_draft_on_complete(p_draft uuid, p_contest public.fantasy_contests)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.fantasy_draft_seed_ownership(p_draft);

  perform public.fantasy_draft_seed_event_rosters(
    p_draft, coalesce(p_contest.settings ->> 'mode', 'weekly-stats'), coalesce((p_contest.settings ->> 'flex')::int, 7)
  );

  if coalesce(p_contest.settings ->> 'mode', 'weekly-stats') = 'weekly-stats'
     and coalesce(p_contest.settings ->> 'format', 'points') = 'h2h'
     and not exists (select 1 from public.fantasy_matchups where contest_id = p_contest.id)
  then
    begin
      perform public.fantasy_generate_schedule_internal(p_contest.id);
    exception when others then
      raise warning 'fantasy_draft_on_complete: schedule generation failed for contest % — %', p_contest.id, sqlerrm;
    end;
  end if;
end;
$$;

revoke execute on function public.fantasy_draft_on_complete(uuid, public.fantasy_contests) from anon, authenticated, public;

comment on function public.fantasy_draft_on_complete is 'Runs when a draft finishes: seeds fantasy_team_players ownership, seeds event-mode rosters, and (weekly h2h contests only) auto-generates the H2H schedule — non-fatal on failure (needs >=3 future periods; a fresh season may not have them yet).';

-- ── fantasy_draft_readiness — public read RPC ─────────────────────────────────
create or replace function public.fantasy_draft_readiness(p_contest uuid)
returns table (
  rosters_ready boolean,
  source_label text,
  earliest_at timestamptz,
  lock_at timestamptz,
  default_at timestamptz,
  team_count int,
  min_teams int,
  max_teams int,
  draft_id uuid,
  draft_status text,
  draft_type text,
  scheduled_at timestamptz,
  original_scheduled_at timestamptz,
  missed boolean,
  reschedule_floor timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_contest public.fantasy_contests;
  v_draft   public.fantasy_drafts;
  v_limits  record;
  v_lock    timestamptz;
  v_missed  boolean;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;

  select c.* into v_contest from public.fantasy_contests c where c.id = p_contest;
  if not found then
    raise exception 'unknown contest %', p_contest;
  end if;

  select d.* into v_draft from public.fantasy_drafts d where d.contest_id = p_contest;

  select * into v_limits from public.fantasy_contest_team_limits(p_contest);

  -- lock_at = the event period's lock_at (event contests), or the earliest
  -- still-future period's lock_at (weekly contests) — never an already-
  -- passed week, which "order by lock_at limit 1" alone would return.
  -- Columns are alias-qualified: the RETURNS TABLE out-params (lock_at,
  -- scheduled_at, …) would otherwise shadow the table columns (42702).
  select p.lock_at into v_lock
  from public.fantasy_contest_periods p
  where p.contest_id = p_contest and p.period = 'event';

  if v_lock is null then
    select min(p.lock_at) into v_lock
    from public.fantasy_contest_periods p
    where p.contest_id = p_contest and p.lock_at > now();
  end if;

  v_missed := v_draft.status = 'scheduled' and v_draft.scheduled_at < now() - interval '6 hours';

  return query select
    public.fantasy_draft_rosters_ready(p_contest),
    public.fantasy_draft_source_label(v_contest.competition),
    public.fantasy_draft_earliest_at(p_contest),
    v_lock,
    public.fantasy_draft_default_at(p_contest),
    v_limits.team_count,
    v_limits.min_teams,
    v_limits.max_teams,
    v_draft.id,
    v_draft.status,
    v_draft.draft_type,
    v_draft.scheduled_at,
    v_draft.original_scheduled_at,
    coalesce(v_missed, false),
    case when v_missed then v_draft.original_scheduled_at + interval '2 days' else null end;
end;
$$;

revoke all on function public.fantasy_draft_readiness(uuid) from public, anon;
grant execute on function public.fantasy_draft_readiness(uuid) to authenticated;

-- ── fantasy_reschedule_draft — commissioner-only RPC ──────────────────────────
create or replace function public.fantasy_reschedule_draft(p_draft uuid, p_at timestamptz)
returns public.fantasy_drafts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft    public.fantasy_drafts;
  v_contest  uuid;
  v_league   uuid;
  v_earliest timestamptz;
  v_lock     timestamptz;
  v_floor    timestamptz;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;

  select * into v_draft from public.fantasy_drafts where id = p_draft for update;
  if not found then
    raise exception 'unknown draft %', p_draft;
  end if;

  select contest_id into v_contest from public.fantasy_drafts where id = p_draft;
  select league_id into v_league from public.fantasy_contests where id = v_draft.contest_id;

  if not public.fantasy_is_commissioner(v_league) then
    raise exception 'not authorized — commissioner only';
  end if;

  if v_draft.status <> 'scheduled' then
    raise exception 'draft is not scheduled (status: %)', v_draft.status;
  end if;

  if p_at <= now() then
    raise exception 'reschedule time must be in the future';
  end if;

  v_earliest := public.fantasy_draft_earliest_at(v_draft.contest_id);
  select lock_at into v_lock
  from public.fantasy_contest_periods
  where contest_id = v_draft.contest_id and period = 'event';

  if v_earliest is not null and p_at < v_earliest then
    raise exception 'drafts open %, once teams and rosters are in',
      to_char(v_earliest at time zone 'America/New_York', 'Dy Mon FMDD');
  end if;
  if v_lock is not null and p_at >= v_lock then
    raise exception 'the draft must start before the tournament begins — pick an earlier time';
  end if;

  -- If the draft's original time has already passed (a missed draft), the new
  -- time must be at least 2 days after that original time — no re-scheduling
  -- a missed draft for "5 minutes from now".
  if now() >= v_draft.scheduled_at then
    v_floor := coalesce(v_draft.original_scheduled_at, v_draft.scheduled_at) + interval '2 days';
    if p_at < v_floor then
      raise exception 'a missed draft must be rescheduled at least 2 days out';
    end if;
  end if;

  update public.fantasy_drafts
  set scheduled_at = p_at, reschedule_count = reschedule_count + 1
  where id = p_draft
  returning * into v_draft;

  return v_draft;
end;
$$;

revoke all on function public.fantasy_reschedule_draft(uuid, timestamptz) from public, anon;
grant execute on function public.fantasy_reschedule_draft(uuid, timestamptz) to authenticated;

-- ── fantasy_schedule_draft — 4-team minimum, original_scheduled_at ────────────
-- Guard: abort if deployed body has diverged from committed 20260827100000.
do $$ begin
  if (select md5(prosrc) from pg_proc where oid = 'public.fantasy_schedule_draft(uuid, timestamptz, int, int)'::regprocedure)
     <> '1eee8494953a0c3f7095c6876e67f3c9' then
    raise exception 'fantasy_schedule_draft body has diverged from expected — aborting migration';
  end if;
end $$;

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
  v_caller   uuid := (select auth.uid());
  v_league   uuid;
  v_status   text;
  v_order    jsonb;
  v_draft    public.fantasy_drafts;
  v_earliest timestamptz;
  v_lock     timestamptz;
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

  -- Draft window: not before the earliest-draft floor, not once the event
  -- has locked. Only event contests have an 'event' period / a floor; a null
  -- p_at (manual start) is allowed — fantasy_start_draft gates the actual
  -- go-live.
  v_earliest := public.fantasy_draft_earliest_at(p_contest);
  select lock_at into v_lock
  from public.fantasy_contest_periods
  where contest_id = p_contest and period = 'event';

  if v_lock is not null and now() >= v_lock then
    raise exception 'the tournament has started — drafting is closed';
  end if;
  if p_at is not null and v_earliest is not null and p_at < v_earliest then
    raise exception 'drafts open %, once teams and rosters are in',
      to_char(v_earliest at time zone 'America/New_York', 'Dy Mon FMDD');
  end if;
  if p_at is not null and v_lock is not null and p_at >= v_lock then
    raise exception 'the draft must start before the tournament begins — pick an earlier time';
  end if;

  select coalesce(jsonb_agg(id order by random()), '[]'::jsonb) into v_order
  from public.fantasy_teams
  where contest_id = p_contest;

  if jsonb_array_length(v_order) < 4 then
    raise exception 'a draft needs at least 4 teams';
  end if;

  insert into public.fantasy_drafts (contest_id, status, rounds, pick_seconds, draft_order, scheduled_at, original_scheduled_at, created_by)
  values (p_contest, 'scheduled', p_rounds, p_pick_seconds, v_order, p_at, p_at, v_caller)
  returning * into v_draft;

  update public.fantasy_contests
  set settings = settings || jsonb_build_object('draft', true)
  where id = p_contest;

  return v_draft;
end;
$$;

revoke all on function public.fantasy_schedule_draft(uuid, timestamptz, int, int) from public;
grant execute on function public.fantasy_schedule_draft(uuid, timestamptz, int, int) to authenticated;

-- ── fantasy_start_draft — 4-team minimum, readiness helper, missed-time guard ─
do $$ begin
  if (select md5(prosrc) from pg_proc where oid = 'public.fantasy_start_draft(uuid)'::regprocedure)
     <> '55c8e51b3a6b1121312c26dd784a2236' then
    raise exception 'fantasy_start_draft body has diverged from expected — aborting migration';
  end if;
end $$;

create or replace function public.fantasy_start_draft(p_draft uuid)
returns public.fantasy_drafts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contest     uuid;
  v_league      uuid;
  v_status      text;
  v_order       jsonb;
  v_draft       public.fantasy_drafts;
  v_scheduled   timestamptz;
  v_earliest    timestamptz;
  v_lock        timestamptz;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;

  select contest_id, status, scheduled_at into v_contest, v_status, v_scheduled
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

  -- Draft window (event contests): no going live before the earliest-draft
  -- floor or after the event has locked.
  v_earliest := public.fantasy_draft_earliest_at(v_contest);
  select lock_at into v_lock
  from public.fantasy_contest_periods
  where contest_id = v_contest and period = 'event';

  if v_earliest is not null and now() < v_earliest then
    raise exception 'drafts open %, once teams and rosters are in',
      to_char(v_earliest at time zone 'America/New_York', 'Dy Mon FMDD');
  end if;
  if v_lock is not null and now() >= v_lock then
    raise exception 'the tournament has started — drafting is closed';
  end if;

  if v_scheduled is not null and now() > v_scheduled + interval '6 hours' then
    raise exception 'the scheduled time has passed — reschedule at least 2 days out';
  end if;

  -- Data gate: an empty pool would autopick nothing — refuse until the
  -- contest's rosters actually exist.
  if not public.fantasy_draft_rosters_ready(v_contest) then
    raise exception 'rosters for this contest aren''t published yet — drafting opens once they are';
  end if;

  -- Final shuffle at start (the schedule-time order was provisional).
  select coalesce(jsonb_agg(id order by random()), '[]'::jsonb) into v_order
  from public.fantasy_teams
  where contest_id = v_contest;

  if jsonb_array_length(v_order) < 4 then
    raise exception 'a draft needs at least 4 teams';
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

-- ── fantasy_make_pick — completion hook, snake-only guard ─────────────────────
do $$ begin
  if (select md5(prosrc) from pg_proc where oid = 'public.fantasy_make_pick(uuid, text, text, text)'::regprocedure)
     <> '1c0cc910f08133f535c8f09dd2cc6aed' then
    raise exception 'fantasy_make_pick body has diverged from expected — aborting migration';
  end if;
end $$;

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

  if v_draft.draft_type <> 'snake' then
    raise exception 'this draft is not a snake draft';
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

    perform public.fantasy_draft_on_complete(p_draft, v_contest);
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

comment on function public.fantasy_make_pick is 'Validates: draft is a snake draft, live, caller owns the on-clock team (snake math via fantasy_draft_team_on_clock), player not already picked, player_league valid for the contest competition. Advances the clock; on the final pick marks the draft complete and runs fantasy_draft_on_complete (ownership + event rosters + h2h schedule). Unique(draft_id, player_league, player_id) is the hard backstop against a race past the pre-check.';

-- ── fantasy_resolve_clock — snake-only guard, best-available helper, hook ────
do $$ begin
  if (select md5(prosrc) from pg_proc where oid = 'public.fantasy_resolve_clock(uuid)'::regprocedure)
     <> '29b953c3a50d0df91fb30f6f2159bb18' then
    raise exception 'fantasy_resolve_clock body has diverged from expected — aborting migration';
  end if;
end $$;

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

  if v_draft.draft_type <> 'snake' then
    return 0;
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
      -- 2) Best-available (shared helper).
      select bp.player_league, bp.player_id, bp.player_name
      into v_best
      from public.fantasy_draft_best_available(p_draft, v_contest) bp;

      if v_best.player_id is not null then
        v_round := (v_draft.current_overall - 1) / v_team_count + 1;
        insert into public.fantasy_draft_picks (draft_id, overall, round, team_id, player_league, player_id, player_name, auto)
        values (p_draft, v_draft.current_overall, v_round, v_team_on_clock,
                v_best.player_league, v_best.player_id, coalesce(v_best.player_name, v_best.player_id), true);
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

      perform public.fantasy_draft_on_complete(p_draft, v_contest);
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

comment on function public.fantasy_resolve_clock is 'Lazy clock resolution for SNAKE drafts only (no-ops for auction — see fantasy_resolve_auction). Any league member may call; loops while the current pick is expired (+3s grace), autopicking from the on-clock team''s queue else fantasy_draft_best_available (per-competition, now covers eucs/euf). Row lock makes concurrent callers race-safe. Returns count of autopicks applied.';

notify pgrst, 'reload schema';

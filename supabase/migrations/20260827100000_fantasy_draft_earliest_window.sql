-- ─────────────────────────────────────────────────────────────────────────────
-- Fantasy — draft window for event-mode contests (Club Nationals activation).
--
-- Rule (Hunter, 2026-08-27): a league can't draft until there is data. Event
-- rosters land the Saturday before the tournament, so event contests get an
-- earliest-draft floor of midnight ET on the Saturday strictly before the
-- event's start_date (Club Nats 2026: starts Thu Oct 22 → drafts open Sat
-- Oct 17). Weekly-stats games (UFA/PUL/WUL) have season data and no floor.
--
-- Enforcement:
--   fantasy_schedule_draft — a scheduled time may not be before the floor,
--     nor at/after the event lock; nothing schedules once the event started.
--   fantasy_start_draft   — may not go live before the floor or after the
--     event lock, and (the real data gate) refuses while the event has zero
--     published rosters — a draft over an empty pool would autopick nothing.
--
-- Deployed bodies of both RPCs were verified byte-identical to
-- 20260827010100_fantasy_draft_rpcs.sql before this replace (prosrc diff),
-- so create-or-replace from committed text is safe here.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── fantasy_draft_earliest_at — internal helper ─────────────────────────────
-- Mirrors draftOpensDate() in src/lib/fantasy/games.ts — keep in lockstep.
create or replace function public.fantasy_draft_earliest_at(p_contest uuid)
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
begin
  select competition, settings->>'eventId' into v_competition, v_event_id
  from public.fantasy_contests
  where id = p_contest;

  if v_competition in ('usau-club-nationals', 'usau-college-nationals') then
    select start_date into v_start_date from public.usau_events where id = v_event_id::uuid;
  elsif v_competition = 'wfdf-wucc' then
    select start_date into v_start_date from public.wfdf_events where id = v_event_id::uuid;
  else
    return null;  -- weekly-stats games: season data exists, no draft floor
  end if;

  if v_start_date is null then
    raise exception 'contest % has no resolvable event start date', p_contest;
  end if;

  -- Saturday strictly before the event start, midnight ET. dow: Sun=0..Sat=6
  -- → days back = dow+1 (a Saturday start goes back a full week).
  -- ::timestamp BEFORE `at time zone` — bare-date promotion converts the
  -- wrong way (see 20260815023000).
  return (v_start_date - (extract(dow from v_start_date)::int + 1))::timestamp
         at time zone 'America/New_York';
end;
$$;

-- Internal only: SECURITY DEFINER callers execute as owner; no client grant.
revoke all on function public.fantasy_draft_earliest_at(uuid) from public;

comment on function public.fantasy_draft_earliest_at is 'Earliest allowed draft time for a contest: midnight ET on the Saturday strictly before an event contest''s event start_date (rosters are published by then); null for weekly-stats contests. Mirrors draftOpensDate() in src/lib/fantasy/games.ts.';

-- ── fantasy_schedule_draft — add the draft-window checks ────────────────────
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

-- ── fantasy_start_draft — window + data-exists gates ────────────────────────
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
  v_competition text;
  v_season      int;
  v_event_uuid  uuid;
  v_earliest    timestamptz;
  v_lock        timestamptz;
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

  select league_id, competition, season_year, (settings->>'eventId')::uuid
    into v_league, v_competition, v_season, v_event_uuid
  from public.fantasy_contests where id = v_contest;

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

  -- Data gate: an event draft over an empty pool would autopick nothing —
  -- refuse until the event actually has published rosters.
  if v_competition in ('usau-club-nationals', 'usau-college-nationals') then
    if not exists (
      select 1
      from public.usau_rosters r
      join public.usau_event_teams et on et.team_id = r.team_id
      where et.event_id = v_event_uuid and r.season = v_season
    ) then
      raise exception 'rosters for this tournament aren''t published yet — drafting opens once they are';
    end if;
  elsif v_competition = 'wfdf-wucc' then
    if not exists (select 1 from public.wfdf_rosters where event_id = v_event_uuid) then
      raise exception 'rosters for this event aren''t published yet — drafting opens once they are';
    end if;
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

notify pgrst, 'reload schema';

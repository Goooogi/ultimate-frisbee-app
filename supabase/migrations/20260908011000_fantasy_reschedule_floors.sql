-- Fantasy expansion, migration 11 — reschedule floors (Hunter, 2026-09-08).
--
-- Two cases when a commissioner moves a scheduled draft:
--   • MISSED (the scheduled time passed without going live — typically the
--     source hasn't posted rosters yet): new time ≥ ORIGINAL scheduled time
--     + 1 day (was 2 days).
--   • NOT missed (moving it ahead of time): new time ≥ now() + 30 minutes so
--     members always get a heads-up.
-- fantasy_draft_readiness reports the applicable floor in reschedule_floor
-- for both cases so clients can pre-validate.

create or replace function public.fantasy_reschedule_draft(p_draft uuid, p_at timestamptz)
returns public.fantasy_drafts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft    public.fantasy_drafts;
  v_league   uuid;
  v_earliest timestamptz;
  v_lock     timestamptz;
  v_floor    timestamptz;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;

  select d.* into v_draft from public.fantasy_drafts d where d.id = p_draft for update;
  if not found then
    raise exception 'unknown draft %', p_draft;
  end if;

  select c.league_id into v_league from public.fantasy_contests c where c.id = v_draft.contest_id;

  if not public.fantasy_is_commissioner(v_league) then
    raise exception 'not authorized — commissioner only';
  end if;

  if v_draft.status <> 'scheduled' then
    raise exception 'draft is not scheduled (status: %)', v_draft.status;
  end if;

  v_earliest := public.fantasy_draft_earliest_at(v_draft.contest_id);
  select p.lock_at into v_lock
  from public.fantasy_contest_periods p
  where p.contest_id = v_draft.contest_id and p.period = 'event';

  if v_earliest is not null and p_at < v_earliest then
    raise exception 'drafts open %, once teams and rosters are in',
      to_char(v_earliest at time zone 'America/New_York', 'Dy Mon FMDD');
  end if;
  if v_lock is not null and p_at >= v_lock then
    raise exception 'the draft must start before the tournament begins — pick an earlier time';
  end if;

  if v_draft.scheduled_at is not null and now() >= v_draft.scheduled_at then
    -- Missed draft: at least a day after the ORIGINAL time.
    v_floor := coalesce(v_draft.original_scheduled_at, v_draft.scheduled_at) + interval '1 day';
    if p_at < v_floor then
      raise exception 'a missed draft must be rescheduled at least a day after the original time';
    end if;
  else
    -- Moving a future draft: members get at least 30 minutes'' notice.
    v_floor := now() + interval '30 minutes';
    if p_at < v_floor then
      raise exception 'give the league at least 30 minutes'' notice — pick a later time';
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

  select p.lock_at into v_lock
  from public.fantasy_contest_periods p
  where p.contest_id = p_contest and p.period = 'event';

  if v_lock is null then
    select min(p.lock_at) into v_lock
    from public.fantasy_contest_periods p
    where p.contest_id = p_contest and p.lock_at > now();
  end if;

  -- "Missed" = the scheduled time has passed and the draft never went live.
  v_missed := v_draft.status = 'scheduled' and v_draft.scheduled_at is not null and now() >= v_draft.scheduled_at;

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
    case
      when v_draft.id is null or v_draft.status <> 'scheduled' then null
      when v_missed then coalesce(v_draft.original_scheduled_at, v_draft.scheduled_at) + interval '1 day'
      else now() + interval '30 minutes'
    end;
end;
$$;

revoke all on function public.fantasy_draft_readiness(uuid) from public, anon;
grant execute on function public.fantasy_draft_readiness(uuid) to authenticated;

notify pgrst, 'reload schema';

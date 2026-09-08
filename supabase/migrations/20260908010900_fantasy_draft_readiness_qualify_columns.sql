-- Fantasy expansion, migration 10 — fix: fantasy_draft_readiness's unqualified
-- `lock_at` collided with its own RETURNS TABLE out-param (42702 ambiguous
-- column), found by the proof run. Body identical to the corrected text in
-- 20260908010500 (kept in sync there so a fresh apply is right first time).

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

notify pgrst, 'reload schema';

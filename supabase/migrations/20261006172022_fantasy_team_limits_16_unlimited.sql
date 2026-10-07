-- ─────────────────────────────────────────────────────────────────────────────
-- Fantasy team limits: options are now 4,5,6,7,8,9,10,12,16 or unlimited (∞),
-- for EVERY competition (Hunter, 2026-10-06 — the Club-Nationals-only
-- "No limit" toggle is replaced by an ∞ step after 16 in Settings → Teams).
--
-- Rebased on the LIVE bodies (20260912143822_fantasy_strip_global_contest_branches
-- removed the global-contest branches from the trigger and the helper — keep
-- them removed). Changes vs live:
--   • fantasy_set_contest_limits        — p_max_teams 4..12 → 4..16 (null rejected);
--                                         p_unlimited no longer limited to
--                                         usau-club-nationals; null p_unlimited = false.
--   • fantasy_teams_enforce_contest_cap — unlimitedTeams honoured for every competition.
--   • fantasy_contest_team_limits       — max_teams is null whenever unlimitedTeams.
-- The draft-readiness RPCs read limits through fantasy_contest_team_limits, so
-- they pick this up unchanged. The H2H schedule generator has no upper team
-- bound. Commissioner check, draft lock, can't-go-below-current-count,
-- security definer + empty search_path and grants are unchanged.
--
-- Live md5(prosrc) these replace, verified 2026-10-06 — re-check before applying
-- (shared DB with mobile; if any differ, re-diff against pg_get_functiondef):
--   fantasy_teams_enforce_contest_cap  50e346de7075307236345c8c6588769f
--   fantasy_contest_team_limits        967f79e0b61d258e46fde40f6208f82d
--   fantasy_set_contest_limits         5505af9d37bd68360e1d690b90a824c2
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.fantasy_teams_enforce_contest_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings       jsonb;
  v_max_teams      int;
  v_unlimited      boolean;
  v_draft_status   text;
  v_team_count     int;
begin
  select settings
    into v_settings
  from public.fantasy_contests
  where id = NEW.contest_id
  for update;

  select status into v_draft_status
  from public.fantasy_drafts
  where contest_id = NEW.contest_id;

  if v_draft_status in ('live', 'complete') then
    raise exception 'this league has already drafted — no new teams';
  end if;

  v_unlimited := coalesce((v_settings->>'unlimitedTeams')::boolean, false);
  if v_unlimited then
    return NEW;
  end if;

  v_max_teams := coalesce((v_settings->>'maxTeams')::int, 12);

  select count(*) into v_team_count
  from public.fantasy_teams
  where contest_id = NEW.contest_id;

  if v_team_count >= v_max_teams then
    raise exception 'this league is full (max % teams)', v_max_teams;
  end if;

  return NEW;
end;
$$;

revoke execute on function public.fantasy_teams_enforce_contest_cap() from anon, authenticated, public;

create or replace function public.fantasy_contest_team_limits(p_contest uuid)
returns table (team_count int, min_teams int, max_teams int)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*)::int from public.fantasy_teams where contest_id = p_contest),
    4,
    case
      when coalesce((c.settings->>'unlimitedTeams')::boolean, false) then null
      else coalesce((c.settings->>'maxTeams')::int, 12)
    end
  from public.fantasy_contests c
  where c.id = p_contest;
$$;

revoke execute on function public.fantasy_contest_team_limits(uuid) from anon, authenticated, public;

create or replace function public.fantasy_set_contest_limits(
  p_contest uuid,
  p_max_teams int,
  p_unlimited boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_league_id    uuid;
  v_draft_status text;
  v_team_count   int;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;

  select league_id into v_league_id
  from public.fantasy_contests
  where id = p_contest
  for update;

  if not found then
    raise exception 'unknown contest %', p_contest;
  end if;

  if v_league_id is null then
    raise exception 'this contest is not editable';
  end if;

  if not public.fantasy_is_commissioner(v_league_id) then
    raise exception 'not authorized — commissioner only';
  end if;

  if p_max_teams is null or p_max_teams < 4 or p_max_teams > 16 then
    raise exception 'max teams must be between 4 and 16';
  end if;

  select status into v_draft_status
  from public.fantasy_drafts
  where contest_id = p_contest;

  if v_draft_status in ('live', 'complete') then
    raise exception 'this league has already drafted — team limits are locked';
  end if;

  if not coalesce(p_unlimited, false) then
    select count(*) into v_team_count
    from public.fantasy_teams
    where contest_id = p_contest;

    if p_max_teams < v_team_count then
      raise exception 'this league already has % teams — max teams cannot go below that', v_team_count;
    end if;
  end if;

  update public.fantasy_contests
  set settings = settings || jsonb_build_object('maxTeams', p_max_teams, 'unlimitedTeams', coalesce(p_unlimited, false))
  where id = p_contest;
end;
$$;

revoke all on function public.fantasy_set_contest_limits(uuid, int, boolean) from public, anon;
grant execute on function public.fantasy_set_contest_limits(uuid, int, boolean) to authenticated;

notify pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────────
-- Fantasy expansion, migration 2 of 9 — league team-cap limits.
--
-- Teams are created by a direct client INSERT under RLS (createContestTeam in
-- src/lib/fantasy/leagues.ts), not an RPC — so the cap has to live in a
-- BEFORE INSERT trigger on fantasy_teams, not application code. Cap lives in
-- fantasy_contests.settings: maxTeams (4..12), unlimitedTeams (honoured only
-- for competition='usau-club-nationals'). minTeams is a constant 4 (matches
-- the draft's own >=4-team floor added in migration 6). League MEMBERSHIP
-- itself stays uncapped — only team creation (i.e. contest participation) is
-- capped.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.fantasy_teams_enforce_contest_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_league_id      uuid;
  v_settings       jsonb;
  v_max_teams      int;
  v_unlimited      boolean;
  v_competition    text;
  v_draft_status   text;
  v_team_count     int;
begin
  if NEW.contest_id is null then
    return NEW;
  end if;

  select league_id, settings, competition
    into v_league_id, v_settings, v_competition
  from public.fantasy_contests
  where id = NEW.contest_id
  for update;

  if v_league_id is null then
    -- Global/service-managed contests (e.g. the Public League) are uncapped.
    return NEW;
  end if;

  select status into v_draft_status
  from public.fantasy_drafts
  where contest_id = NEW.contest_id;

  if v_draft_status in ('live', 'complete') then
    raise exception 'this league has already drafted — no new teams';
  end if;

  v_unlimited := coalesce((v_settings->>'unlimitedTeams')::boolean, false);
  if v_unlimited and v_competition = 'usau-club-nationals' then
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

drop trigger if exists fantasy_teams_contest_cap on public.fantasy_teams;
create trigger fantasy_teams_contest_cap
  before insert on public.fantasy_teams
  for each row execute function public.fantasy_teams_enforce_contest_cap();

-- ── Guard against removing a team once the contest's draft has gone live ────
create or replace function public.fantasy_teams_guard_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft_status text;
begin
  if OLD.contest_id is null then
    return OLD;
  end if;

  select status into v_draft_status
  from public.fantasy_drafts
  where contest_id = OLD.contest_id;

  if v_draft_status = 'live' then
    raise exception 'this league''s draft is live — teams cannot be removed';
  end if;

  return OLD;
end;
$$;

revoke execute on function public.fantasy_teams_guard_delete() from anon, authenticated, public;

drop trigger if exists fantasy_teams_delete_guard on public.fantasy_teams;
create trigger fantasy_teams_delete_guard
  before delete on public.fantasy_teams
  for each row execute function public.fantasy_teams_guard_delete();

-- ── fantasy_contest_team_limits — internal read helper ────────────────────────
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
      when c.league_id is null then null
      when coalesce((c.settings->>'unlimitedTeams')::boolean, false) and c.competition = 'usau-club-nationals' then null
      else coalesce((c.settings->>'maxTeams')::int, 12)
    end
  from public.fantasy_contests c
  where c.id = p_contest;
$$;

revoke execute on function public.fantasy_contest_team_limits(uuid) from anon, authenticated, public;

-- ── fantasy_set_contest_limits — commissioner-only RPC ────────────────────────
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
  v_competition  text;
  v_draft_status text;
  v_team_count   int;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;

  select league_id, competition into v_league_id, v_competition
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

  if p_max_teams < 4 or p_max_teams > 12 then
    raise exception 'max teams must be between 4 and 12';
  end if;

  if p_unlimited and v_competition <> 'usau-club-nationals' then
    raise exception 'unlimited teams is only available for USAU Club Nationals';
  end if;

  select status into v_draft_status
  from public.fantasy_drafts
  where contest_id = p_contest;

  if v_draft_status in ('live', 'complete') then
    raise exception 'this league has already drafted — team limits are locked';
  end if;

  if not p_unlimited then
    select count(*) into v_team_count
    from public.fantasy_teams
    where contest_id = p_contest;

    if p_max_teams < v_team_count then
      raise exception 'this league already has % teams — max teams cannot go below that', v_team_count;
    end if;
  end if;

  update public.fantasy_contests
  set settings = settings || jsonb_build_object('maxTeams', p_max_teams, 'unlimitedTeams', p_unlimited)
  where id = p_contest;
end;
$$;

revoke all on function public.fantasy_set_contest_limits(uuid, int, boolean) from public, anon;
grant execute on function public.fantasy_set_contest_limits(uuid, int, boolean) to authenticated;

notify pgrst, 'reload schema';

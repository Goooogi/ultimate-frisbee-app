-- ─────────────────────────────────────────────────────────────────────────────
-- Fantasy V2 — draft-room ownership rule on lineups (plan §5, §3 of the
-- draft-room backend scope).
--
-- Extends fantasy_enforce_roster_composition (20260815015539) — every branch
-- above this point is untouched byte-for-byte; this adds ONE new check right
-- before the contest_id-not-null branches return: when the contest's
-- settings carry "draft": true, a fantasy_roster_slots write must reference
-- a (player_league, player_id) that team drafted in that contest's draft.
-- Public League contests (no draft flag, including the legacy contest_id
-- NULL fallback) are unaffected — pick-anyone stays pick-anyone.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.fantasy_enforce_roster_composition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contest_id uuid;
  v_settings   jsonb;
  v_mode       text;
  v_max_off    int;
  v_max_def    int;
  v_max_flex   int;
  n_off        int;
  n_def        int;
  n_flex       int;
  v_drafted    boolean;
begin
  select contest_id into v_contest_id
  from public.fantasy_teams
  where id = NEW.team_id;

  if v_contest_id is null then
    -- Legacy fallback: hardcoded 4 offender / 3 defender, flex forbidden.
    if NEW.role = 'flex' then
      raise exception 'Roster cap: flex slots are not allowed for this team';
    end if;

    select
      count(*) filter (where role = 'offender'),
      count(*) filter (where role = 'defender')
    into n_off, n_def
    from public.fantasy_roster_slots
    where team_id = NEW.team_id and week = NEW.week
      and id <> NEW.id;

    if NEW.role = 'offender' then n_off := n_off + 1; else n_def := n_def + 1; end if;

    if n_off > 4 then
      raise exception 'Roster cap: max 4 offenders per week (team %, week %)', NEW.team_id, NEW.week;
    end if;
    if n_def > 3 then
      raise exception 'Roster cap: max 3 defenders per week (team %, week %)', NEW.team_id, NEW.week;
    end if;

    return NEW;
  end if;

  select settings into v_settings
  from public.fantasy_contests
  where id = v_contest_id;

  v_mode := coalesce(v_settings->>'mode', 'weekly-stats');

  select
    count(*) filter (where role = 'offender'),
    count(*) filter (where role = 'defender'),
    count(*) filter (where role = 'flex')
  into n_off, n_def, n_flex
  from public.fantasy_roster_slots
  where team_id = NEW.team_id and week = NEW.week
    and id <> NEW.id;

  if NEW.role = 'offender' then n_off := n_off + 1;
  elsif NEW.role = 'defender' then n_def := n_def + 1;
  else n_flex := n_flex + 1;
  end if;

  if v_mode = 'weekly-stats' then
    if NEW.role = 'flex' then
      raise exception 'Roster cap: flex slots are not allowed in weekly-stats mode (contest %)', v_contest_id;
    end if;
    v_max_off := coalesce((v_settings->>'offenders')::int, 4);
    v_max_def := coalesce((v_settings->>'defenders')::int, 3);
    if n_off > v_max_off then
      raise exception 'Roster cap: max % offenders per week (team %, week %)', v_max_off, NEW.team_id, NEW.week;
    end if;
    if n_def > v_max_def then
      raise exception 'Roster cap: max % defenders per week (team %, week %)', v_max_def, NEW.team_id, NEW.week;
    end if;
  elsif v_mode = 'event' then
    if NEW.role in ('offender','defender') then
      raise exception 'Roster cap: offender/defender roles are not allowed in event mode (contest %)', v_contest_id;
    end if;
    v_max_flex := coalesce((v_settings->>'flex')::int, 7);
    if n_flex > v_max_flex then
      raise exception 'Roster cap: max % flex slots per period (team %, period %)', v_max_flex, NEW.team_id, NEW.week;
    end if;
  else
    raise exception 'Unknown contest mode % for contest %', v_mode, v_contest_id;
  end if;

  -- Drafted-league exclusivity: settings."draft" = true means this contest
  -- ran a draft, and lineups may only use players THAT TEAM drafted in it.
  -- Public League / undrafted contests (flag absent or false) are unaffected.
  if coalesce((v_settings->>'draft')::boolean, false) then
    select exists (
      select 1
      from public.fantasy_draft_picks dp
      join public.fantasy_drafts d on d.id = dp.draft_id
      where d.contest_id = v_contest_id
        and dp.team_id = NEW.team_id
        and dp.player_league = NEW.player_league
        and dp.player_id = NEW.player_id
    ) into v_drafted;

    if not v_drafted then
      raise exception 'This league is drafted — you can only roster players your team drafted (contest %, player % %)',
        v_contest_id, NEW.player_league, NEW.player_id;
    end if;
  end if;

  return NEW;
end;
$$;

revoke execute on function public.fantasy_enforce_roster_composition() from anon, authenticated, public;

notify pgrst, 'reload schema';

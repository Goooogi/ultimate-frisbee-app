-- ─────────────────────────────────────────────────────────────────────────────
-- Fantasy Leagues & Contests — Phase 1, migration 6 of 8.
--
-- fantasy_roster_slots goes multi-league:
--   - player_league + (player_league, player_id) replaces the UFA-only FK.
--     UFA=slug, USAU=uuid (as text), PUL/WUL=player_name, WFDF=roster name —
--     natural keys per league's own tables, consistent with player_edges.
--   - role widens to include 'flex' (event-mode contests).
--   - week format check widens from UFA-only '^week-[0-9]+$' to a generic
--     sanity bound (blocks PUL 'semifinals' / event-mode 'event' periods
--     under the old regex — known blocker from the beta migration notes).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.fantasy_roster_slots
  add column if not exists player_league text not null default 'ufa'
    check (player_league in ('ufa','usau','pul','wul','wfdf'));

-- Drop the UFA-only FK — player_id is now a natural key whose meaning depends
-- on player_league, so no single-table FK can express it. Data stays as-is.
alter table public.fantasy_roster_slots
  drop constraint if exists fantasy_roster_slots_player_id_fkey;

alter table public.fantasy_roster_slots
  drop constraint if exists fantasy_roster_slots_role_check;
alter table public.fantasy_roster_slots
  add constraint fantasy_roster_slots_role_check
  check (role in ('offender','defender','flex'));

alter table public.fantasy_roster_slots
  drop constraint if exists fantasy_roster_slots_team_id_week_player_id_key;
alter table public.fantasy_roster_slots
  add constraint fantasy_roster_slots_team_week_player_key
  unique (team_id, week, player_league, player_id);

alter table public.fantasy_roster_slots
  drop constraint if exists fantasy_slots_week_format;
alter table public.fantasy_roster_slots
  add constraint fantasy_slots_week_format
  check (char_length(week) between 1 and 40 and week !~ '^\s*$');

alter table public.fantasy_scores
  drop constraint if exists fantasy_scores_week_format;
alter table public.fantasy_scores
  add constraint fantasy_scores_week_format
  check (char_length(week) between 1 and 40 and week !~ '^\s*$');

comment on column public.fantasy_roster_slots.player_league is 'Which league player_id is keyed against. ufa=player slug, usau=uuid (as text), pul/wul=player_name, wfdf=roster full_name. No cross-table FK — validity is enforced app-side per league.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Composition trigger (generic, settings-aware) — replaces
-- fantasy_enforce_roster_caps. Reads the owning contest's settings jsonb:
--   contest_id NULL  → legacy fallback: hardcoded 4 offender / 3 defender,
--                       flex forbidden (byte-for-byte the old beta behavior).
--   mode 'weekly-stats' → cap offenders/defenders at settings values
--                       (default 4/3 if key missing), flex forbidden.
--   mode 'event'        → cap flex at settings.flex (default 7), offender/
--                       defender forbidden.
-- Same two-layer design as before: this is the live cap check (rejects a row
-- that would exceed the max); fantasy_roster_is_valid() below is the
-- completeness check called at submit time.
-- ─────────────────────────────────────────────────────────────────────────────

drop trigger if exists fantasy_roster_caps on public.fantasy_roster_slots;
drop function if exists public.fantasy_enforce_roster_caps();

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

  return NEW;
end;
$$;

create trigger fantasy_roster_composition
  before insert or update on public.fantasy_roster_slots
  for each row execute function public.fantasy_enforce_roster_composition();

revoke execute on function public.fantasy_enforce_roster_composition() from anon, authenticated, public;

-- ── Completeness check — settings-aware, replaces fantasy_roster_is_valid. ──
create or replace function public.fantasy_roster_is_valid(t_id uuid, wk text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_contest_id uuid;
  v_settings   jsonb;
  v_mode       text;
  v_off        int;
  v_def        int;
  v_flex       int;
  v_total      int;
begin
  select contest_id into v_contest_id from public.fantasy_teams where id = t_id;

  select
    count(*) filter (where role = 'offender'),
    count(*) filter (where role = 'defender'),
    count(*) filter (where role = 'flex'),
    count(*)
  into v_off, v_def, v_flex, v_total
  from public.fantasy_roster_slots
  where team_id = t_id and week = wk;

  if v_contest_id is null then
    return v_off = 4 and v_def = 3 and v_total = 7;
  end if;

  select settings into v_settings from public.fantasy_contests where id = v_contest_id;
  v_mode := coalesce(v_settings->>'mode', 'weekly-stats');

  if v_mode = 'weekly-stats' then
    return v_off = coalesce((v_settings->>'offenders')::int, 4)
       and v_def = coalesce((v_settings->>'defenders')::int, 3)
       and v_flex = 0;
  elsif v_mode = 'event' then
    return v_flex = coalesce((v_settings->>'flex')::int, 7)
       and v_off = 0 and v_def = 0;
  else
    return false;
  end if;
end;
$$;

comment on function public.fantasy_roster_is_valid is 'True when (team, week/period) roster exactly matches its contest''s settings-defined composition (legacy NULL contest_id = hardcoded 4 offender + 3 defender). App calls this before locking/submitting a period. Live caps enforced by fantasy_roster_composition trigger.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Lock trigger — generic, contest_id-aware, replaces fantasy_check_roster_lock.
--   contest_id NULL → legacy fallback: verbatim body of the UFA first-game/
--                      Monday-ET trigger from 20260706015731.
--   contest_id set  → look up fantasy_contest_periods; missing row = fail
--                      loud (RAISE EXCEPTION, never silently allow); block
--                      writes while now() is within [lock_at, unlock_at)
--                      (unlock_at NULL = locked forever once past lock_at).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.fantasy_check_roster_lock()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  wk           text;
  t_id         uuid;
  yr           int;
  v_contest_id uuid;
  v_period     record;
  lock_time    timestamptz;
begin
  wk   := coalesce(NEW.week, OLD.week);
  t_id := coalesce(NEW.team_id, OLD.team_id);

  select season_year, contest_id into yr, v_contest_id
  from public.fantasy_teams where id = t_id;

  if yr is null then
    return coalesce(NEW, OLD);  -- orphan/edge; let FK handle it
  end if;

  if v_contest_id is null then
    -- Legacy fallback: verbatim UFA first-weekend-game / Monday-ET logic
    -- from 20260706015731_fantasy_roster_lock_first_game.sql.
    select min(start_timestamp) into lock_time
    from public.ufa_games
    where week = wk and year = yr and start_timestamp is not null
      and extract(dow from start_timestamp at time zone 'America/New_York') in (5, 6, 0);
    if lock_time is null then
      select min(start_timestamp) into lock_time
      from public.ufa_games
      where week = wk and year = yr and start_timestamp is not null;
    end if;

    if lock_time is not null and now() >= lock_time then
      raise exception 'This week is locked — games have started. Roster changes are disabled until Monday.'
        using errcode = 'P0001';
    end if;

    return coalesce(NEW, OLD);
  end if;

  -- Contest-scoped: fantasy_contest_periods is the single lock authority.
  select * into v_period
  from public.fantasy_contest_periods
  where contest_id = v_contest_id and period = wk;

  if not found then
    raise exception 'unknown period % for contest %', wk, v_contest_id
      using errcode = 'P0001';
  end if;

  if now() >= v_period.lock_at
     and (v_period.unlock_at is null or now() < v_period.unlock_at) then
    raise exception 'This period is locked — roster changes are disabled.'
      using errcode = 'P0001';
  end if;

  return coalesce(NEW, OLD);
end;
$function$;

comment on function public.fantasy_check_roster_lock is 'Backstop for app-layer period locks: contest_id NULL uses the legacy UFA-beta first-game/Monday-ET rule inline; contest_id set looks up fantasy_contest_periods (the single lock authority) and fails loud if no period row exists for that (contest, week). unlock_at NULL = locked forever once past lock_at (event-mode contests).';

notify pgrst, 'reload schema';

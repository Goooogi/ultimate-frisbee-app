-- ─── Roster composition rules ────────────────────────────────────────────────
-- Two layers:
--  1) A hard DB invariant that is ALWAYS safe during drafting: never more than
--     7 slots, never more than 4 offenders or 3 defenders per (team, week).
--     (Allows partial rosters — you can add players one at a time.)
--  2) A completeness check (exactly 4 O + 3 D) enforced at SUBMIT time via
--     fantasy_roster_is_valid(), which the app/RPC calls before locking a week.

-- Layer 1: cap trigger — rejects a slot that would exceed role/total maxima.
create or replace function public.fantasy_enforce_roster_caps()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  n_off int;
  n_def int;
begin
  select
    count(*) filter (where role = 'offender'),
    count(*) filter (where role = 'defender')
  into n_off, n_def
  from public.fantasy_roster_slots
  where team_id = NEW.team_id and week = NEW.week
    and id <> NEW.id;  -- exclude the row being updated

  if NEW.role = 'offender' then
    n_off := n_off + 1;
  else
    n_def := n_def + 1;
  end if;

  if n_off > 4 then
    raise exception 'Roster cap: max 4 offenders per week (team %, week %)', NEW.team_id, NEW.week;
  end if;
  if n_def > 3 then
    raise exception 'Roster cap: max 3 defenders per week (team %, week %)', NEW.team_id, NEW.week;
  end if;

  return NEW;
end;
$$;

create trigger fantasy_roster_caps
  before insert or update on public.fantasy_roster_slots
  for each row execute function public.fantasy_enforce_roster_caps();

-- Layer 2: completeness — exactly 4 offenders + 3 defenders. Called at submit.
create or replace function public.fantasy_roster_is_valid(t_id uuid, wk text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    count(*) filter (where role = 'offender') = 4
    and count(*) filter (where role = 'defender') = 3
    and count(*) = 7
  from public.fantasy_roster_slots
  where team_id = t_id and week = wk;
$$;

comment on function public.fantasy_roster_is_valid is 'True when (team, week) roster is exactly 4 offenders + 3 defenders. App calls this before locking/submitting a week. Caps are enforced live by the fantasy_roster_caps trigger.';
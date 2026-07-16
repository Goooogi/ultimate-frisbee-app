-- [HIGH fix] DB-level roster lock enforcement.
--
-- The app checks week-lock in saveRoster(), but that's client-side — a user
-- with their own JWT can call PostgREST directly to DELETE+INSERT roster slots
-- for a week whose games have already started, then pick the players who
-- already scored (hindsight cheating). RLS proves ownership but does NOT check
-- time. This trigger is the authoritative backstop: it rejects any
-- INSERT/UPDATE/DELETE on a roster slot once that week's earliest UFA game has
-- started, for the season the team actually belongs to.
create or replace function public.fantasy_check_roster_lock()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  wk        text;
  t_id      uuid;
  yr        int;
  lock_time timestamptz;
begin
  -- Row being changed (NEW on insert/update, OLD on delete).
  wk   := coalesce(NEW.week, OLD.week);
  t_id := coalesce(NEW.team_id, OLD.team_id);

  -- Season comes from the owning team, not the wall clock — robust across
  -- year boundaries and future backfills.
  select season_year into yr from public.fantasy_teams where id = t_id;
  if yr is null then
    return coalesce(NEW, OLD);  -- orphan/edge; let FK handle it
  end if;

  select min(start_timestamp) into lock_time
  from public.ufa_games
  where week = wk and year = yr and start_timestamp is not null;

  if lock_time is not null and now() >= lock_time then
    raise exception 'This week is locked — its games have started.'
      using errcode = 'P0001';
  end if;

  return coalesce(NEW, OLD);
end;
$$;

create trigger fantasy_enforce_roster_lock
  before insert or update or delete on public.fantasy_roster_slots
  for each row execute function public.fantasy_check_roster_lock();

-- Trigger fn — never an RPC.
revoke execute on function public.fantasy_check_roster_lock() from anon, authenticated, public;

comment on function public.fantasy_check_roster_lock is 'Backstop for the app-layer week-lock: rejects roster slot writes once the week''s earliest ufa_games.start_timestamp (for the team''s season) has passed. Prevents hindsight roster editing via direct PostgREST calls.';
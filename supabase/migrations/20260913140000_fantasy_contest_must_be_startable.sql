-- Fantasy: a contest can only be created while its game still has a lock
-- ahead (2026-09-13). NOT YET APPLIED — Hunter's go needed.
--
-- Web and mobile both check this before inserting (game-dates.ts:
-- nextStartForGame), but fantasy_contests takes a direct INSERT from the
-- client, so the rule was only as strong as the app calling it — a raw REST
-- insert, an old app build, or a page left open past the event's start could
-- still create a league that locks the moment it exists.
--
-- The check reuses the lock schedule itself: after the insert, build the
-- contest's periods with fantasy_rebuild_contest_periods (the same function
-- both clients already call right after inserting, and the hourly rebuild
-- runs) and require at least one period whose lock_at is still ahead. So
-- "startable" can never drift from how locks are actually built:
--   • UFA: any week whose first game hasn't started (joining mid-season is
--     fine — the league starts with the next open week);
--   • USAU Nationals / WFDF / EUCS: the event hasn't started (00:00 ET);
--   • PUL / WUL: a scheduled week still ahead.
-- A season with no games yet, an unknown competition, or an event contest
-- with no eventId has no future lock either, so those are refused too.
-- Raising here rolls back the contest row and the periods built for it.
--
-- SECURITY INVOKER on purpose: fantasy_rebuild_contest_periods is already
-- SECURITY DEFINER and does its own membership check (the inserting
-- commissioner is a league member), and fantasy_contest_periods is public-read.

create function public.fantasy_contests_require_open_lock()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform public.fantasy_rebuild_contest_periods(new.id);

  if not exists (
    select 1
    from public.fantasy_contest_periods p
    where p.contest_id = new.id
      and p.lock_at > now()
  ) then
    raise exception 'That game has already started or isn''t scheduled yet, so a league can''t start on it — pick another game.'
      using detail = format('competition %s, season %s: no period locks after now()', new.competition, new.season_year);
  end if;

  return null;
end;
$$;

revoke all on function public.fantasy_contests_require_open_lock() from public, anon, authenticated;

create trigger fantasy_contests_require_open_lock
  after insert on public.fantasy_contests
  for each row execute function public.fantasy_contests_require_open_lock();

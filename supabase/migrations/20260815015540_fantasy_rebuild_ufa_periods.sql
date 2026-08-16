-- ─────────────────────────────────────────────────────────────────────────────
-- Fantasy Leagues & Contests — Phase 1, migration 7 of 8.
--
-- fantasy_rebuild_ufa_periods(): ports the ET lock-time computation out of the
-- old UFA-only trigger (20260706015731) into a reusable function that
-- populates fantasy_contest_periods for a UFA contest. Will be called by a
-- background job going forward (not by the client — service-role/postgres
-- only, revoked from PUBLIC/anon/authenticated).
--
-- lock_at    = earliest Fri/Sat/Sun ET game start for that week (fallback:
--              earliest game of the week if no weekend game exists) — same
--              anchor rule as the trigger it replaces for UFA.
-- unlock_at  = the following Monday 00:00 ET.
-- complete   = true iff every ufa_games row for that (year, week) has
--              status = 'Final' (confirmed values: 'Final' / 'Upcoming').
--
-- Run once here for p_year=2026 against the global UFA contest created in
-- migration 5, so fantasy_contest_periods is populated before the generic
-- lock trigger's contest-scoped branch needs it.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.fantasy_rebuild_ufa_periods(p_contest uuid, p_year int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.fantasy_contest_periods (contest_id, period, lock_at, unlock_at, game_count, complete, updated_at)
  select
    p_contest,
    g.week,
    -- Earliest Fri/Sat/Sun (ET) game start; fall back to earliest game overall.
    coalesce(
      min(g.start_timestamp) filter (
        where extract(dow from g.start_timestamp at time zone 'America/New_York') in (5, 6, 0)
      ),
      min(g.start_timestamp)
    ) as lock_at,
    -- Following Monday 00:00 ET after the lock anchor's ET calendar day.
    (
      date_trunc('day', coalesce(
        min(g.start_timestamp) filter (
          where extract(dow from g.start_timestamp at time zone 'America/New_York') in (5, 6, 0)
        ),
        min(g.start_timestamp)
      ) at time zone 'America/New_York')
      + (
          ((8 - extract(dow from coalesce(
            min(g.start_timestamp) filter (
              where extract(dow from g.start_timestamp at time zone 'America/New_York') in (5, 6, 0)
            ),
            min(g.start_timestamp)
          ) at time zone 'America/New_York')::int - 1) % 7) + 1
        ) * interval '1 day'
    ) at time zone 'America/New_York' as unlock_at,
    count(*) as game_count,
    bool_and(g.status = 'Final') as complete,
    now() as updated_at
  from public.ufa_games g
  where g.year = p_year and g.week is not null and trim(g.week) <> ''
  group by g.week
  on conflict (contest_id, period) do update set
    lock_at    = excluded.lock_at,
    unlock_at  = excluded.unlock_at,
    game_count = excluded.game_count,
    complete   = excluded.complete,
    updated_at = now();
end;
$$;

comment on function public.fantasy_rebuild_ufa_periods is 'Upserts fantasy_contest_periods for a UFA contest from ufa_games, one row per distinct week. lock_at = earliest Fri/Sat/Sun ET game (fallback: earliest game); unlock_at = following Monday 00:00 ET; complete = all that week''s games are status=Final. Service-role/postgres only — intended for a background job, not client calls.';

revoke all on function public.fantasy_rebuild_ufa_periods(uuid, int) from public, anon, authenticated;

-- ── Seed periods for the global UFA 2026 contest created in migration 5. ──
do $$
declare
  v_contest_id uuid;
begin
  select id into v_contest_id
  from public.fantasy_contests
  where league_id is null and competition = 'ufa' and season_year = 2026;

  if v_contest_id is not null then
    perform public.fantasy_rebuild_ufa_periods(v_contest_id, 2026);
  end if;
end $$;

notify pgrst, 'reload schema';

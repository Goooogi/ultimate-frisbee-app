-- ─────────────────────────────────────────────────────────────────────────────
-- Correction 3 (from Hunter, post-report): replace the UFA-only
-- fantasy_rebuild_ufa_periods with a generalized per-contest period builder
-- that dispatches on fantasy_contests.competition. The app calls
-- fantasy_rebuild_contest_periods() right after contest creation so rosters
-- open immediately; a service-role/postgres-only fantasy_rebuild_all_periods()
-- sweeps every non-complete contest for the scoring edge fn to call on a
-- schedule (no cron wired here — per standing rule, ask before scheduling).
--
-- Monday-rollover arithmetic ((8 - dow - 1) % 7) + 1 reused verbatim from the
-- first pass: it correctly returns the STRICTLY NEXT Monday even when the
-- lock anchor itself falls on a Monday (the naive (8-dow)%7 formula returns 0
-- in that case, which is wrong — verified during the original UFA-only pass).
--
-- Per-competition period shape:
--   ufa                    → one row per ufa_games.week (timestamp games)
--   pul                    → one row per pul_games.week_label (date-only games)
--   wul                    → no week label; synthesized via date_trunc('week',
--                             game_date) Monday-anchored ISO buckets, ordered
--                             chronologically, period = 'week-' || dense_rank()
--   usau-club-nationals    → single 'event' period, event id from
--   usau-college-nationals   settings->>'eventId', locked forever once past
--                             lock_at (unlock_at NULL)
--   wfdf-wucc              → same single 'event' shape, wfdf_events source
-- ─────────────────────────────────────────────────────────────────────────────

drop function if exists public.fantasy_rebuild_ufa_periods(uuid, int);

create or replace function public.fantasy_rebuild_contest_periods(p_contest uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_competition text;
  v_season      int;
  v_event_id    text;
  v_event_uuid  uuid;
  v_start_date  date;
  v_end_date    date;
begin
  select competition, season_year, settings->>'eventId'
    into v_competition, v_season, v_event_id
  from public.fantasy_contests
  where id = p_contest;

  if v_competition is null then
    raise exception 'unknown contest %', p_contest;
  end if;

  if v_competition = 'ufa' then

    insert into public.fantasy_contest_periods (contest_id, period, lock_at, unlock_at, game_count, complete, updated_at)
    select
      p_contest,
      g.week,
      coalesce(
        min(g.start_timestamp) filter (
          where extract(dow from g.start_timestamp at time zone 'America/New_York') in (5, 6, 0)
        ),
        min(g.start_timestamp)
      ) as lock_at,
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
    where g.year = v_season and g.week is not null and trim(g.week) <> ''
    group by g.week
    on conflict (contest_id, period) do update set
      lock_at    = excluded.lock_at,
      unlock_at  = excluded.unlock_at,
      game_count = excluded.game_count,
      complete   = excluded.complete,
      updated_at = now();

  elsif v_competition = 'pul' then

    insert into public.fantasy_contest_periods (contest_id, period, lock_at, unlock_at, game_count, complete, updated_at)
    select
      p_contest,
      g.week_label,
      -- Date-only games: lock_at = ET midnight of the earliest Fri/Sat/Sun
      -- game_date in the label; fallback earliest date in the label.
      (
        coalesce(
          min(g.game_date) filter (where extract(dow from g.game_date) in (5, 6, 0)),
          min(g.game_date)
        )
      ) at time zone 'America/New_York' as lock_at,
      (
        (
          coalesce(
            min(g.game_date) filter (where extract(dow from g.game_date) in (5, 6, 0)),
            min(g.game_date)
          )
          + (
              ((8 - extract(dow from coalesce(
                min(g.game_date) filter (where extract(dow from g.game_date) in (5, 6, 0)),
                min(g.game_date)
              ))::int - 1) % 7) + 1
            ) * interval '1 day'
        )
      ) at time zone 'America/New_York' as unlock_at,
      count(*) as game_count,
      bool_and(g.status = 'final') as complete,
      now() as updated_at
    from public.pul_games g
    where g.season = v_season and g.week_label is not null and trim(g.week_label) <> ''
    group by g.week_label
    on conflict (contest_id, period) do update set
      lock_at    = excluded.lock_at,
      unlock_at  = excluded.unlock_at,
      game_count = excluded.game_count,
      complete   = excluded.complete,
      updated_at = now();

  elsif v_competition = 'wul' then

    -- wul_games has no week label: bucket by Monday-anchored ISO week
    -- (date_trunc('week', game_date) is ISO-week Monday-anchored by default
    -- in Postgres), then number the buckets chronologically as week-N.
    with buckets as (
      select
        date_trunc('week', g.game_date)::date as bucket_start,
        min(g.game_date) as earliest_date,
        count(*) as game_count,
        bool_and(g.status = 'final') as complete
      from public.wul_games g
      where g.season = v_season and g.game_date is not null
      group by date_trunc('week', g.game_date)::date
    ),
    numbered as (
      select
        'week-' || dense_rank() over (order by bucket_start) as period,
        bucket_start,
        earliest_date,
        game_count,
        complete
      from buckets
    )
    insert into public.fantasy_contest_periods (contest_id, period, lock_at, unlock_at, game_count, complete, updated_at)
    select
      p_contest,
      n.period,
      n.earliest_date at time zone 'America/New_York' as lock_at,
      (
        n.earliest_date
        + (((8 - extract(dow from n.earliest_date)::int - 1) % 7) + 1) * interval '1 day'
      ) at time zone 'America/New_York' as unlock_at,
      n.game_count,
      n.complete,
      now() as updated_at
    from numbered n
    on conflict (contest_id, period) do update set
      lock_at    = excluded.lock_at,
      unlock_at  = excluded.unlock_at,
      game_count = excluded.game_count,
      complete   = excluded.complete,
      updated_at = now();

  elsif v_competition in ('usau-club-nationals', 'usau-college-nationals') then

    if v_event_id is null then
      raise exception 'contest % (%) has no settings.eventId', p_contest, v_competition;
    end if;
    v_event_uuid := v_event_id::uuid;

    select start_date, end_date into v_start_date, v_end_date
    from public.usau_events where id = v_event_uuid;

    if v_start_date is null then
      raise exception 'usau_events % not found or has no start_date', v_event_uuid;
    end if;

    insert into public.fantasy_contest_periods (contest_id, period, lock_at, unlock_at, game_count, complete, updated_at)
    values (
      p_contest,
      'event',
      v_start_date at time zone 'America/New_York',
      null,  -- event mode: never reopens once locked
      null,
      current_date > coalesce(v_end_date, v_start_date + 5),
      now()
    )
    on conflict (contest_id, period) do update set
      lock_at    = excluded.lock_at,
      complete   = excluded.complete,
      updated_at = now();

  elsif v_competition = 'wfdf-wucc' then

    if v_event_id is null then
      raise exception 'contest % (wfdf-wucc) has no settings.eventId', p_contest;
    end if;
    v_event_uuid := v_event_id::uuid;

    select start_date, end_date into v_start_date, v_end_date
    from public.wfdf_events where id = v_event_uuid;

    if v_start_date is null then
      raise exception 'wfdf_events % not found or has no start_date', v_event_uuid;
    end if;

    insert into public.fantasy_contest_periods (contest_id, period, lock_at, unlock_at, game_count, complete, updated_at)
    values (
      p_contest,
      'event',
      v_start_date at time zone 'America/New_York',
      null,
      null,
      current_date > coalesce(v_end_date, v_start_date + 5),
      now()
    )
    on conflict (contest_id, period) do update set
      lock_at    = excluded.lock_at,
      complete   = excluded.complete,
      updated_at = now();

  else
    raise exception 'unknown competition % for contest %', v_competition, p_contest;
  end if;
end;
$$;

comment on function public.fantasy_rebuild_contest_periods is 'Upserts fantasy_contest_periods for one contest, dispatching on fantasy_contests.competition. weekly-stats competitions (ufa/pul/wul) get one row per week; event competitions (usau-*, wfdf-wucc) get a single "event" row sourced from settings->>''eventId'' with unlock_at NULL (locked forever once past lock_at). Callable by authenticated so the app can invoke it right after contest creation.';

revoke all on function public.fantasy_rebuild_contest_periods(uuid) from public, anon;
grant execute on function public.fantasy_rebuild_contest_periods(uuid) to authenticated;

-- ── fantasy_rebuild_all_periods: sweeps every non-complete contest. ──
create or replace function public.fantasy_rebuild_all_periods()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in select id from public.fantasy_contests where status <> 'complete' loop
    perform public.fantasy_rebuild_contest_periods(r.id);
  end loop;
end;
$$;

comment on function public.fantasy_rebuild_all_periods is 'Sweeps every fantasy_contests row with status <> ''complete'' and rebuilds its periods. Service-role/postgres only — intended for the scoring edge fn to call on a schedule, not client code. No cron wired by this migration.';

revoke all on function public.fantasy_rebuild_all_periods() from public, anon, authenticated;

-- ── Re-seed periods for the global UFA 2026 contest via the generalized fn. ──
do $$
declare
  v_contest_id uuid;
begin
  select id into v_contest_id
  from public.fantasy_contests
  where league_id is null and competition = 'ufa' and season_year = 2026;

  if v_contest_id is not null then
    perform public.fantasy_rebuild_contest_periods(v_contest_id);
  end if;
end $$;

notify pgrst, 'reload schema';

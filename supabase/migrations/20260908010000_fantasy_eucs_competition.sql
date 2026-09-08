-- ─────────────────────────────────────────────────────────────────────────────
-- Fantasy expansion, migration 1 of 9 — EUCS (EUF/EUCF) competition.
--
-- Adds 'eucs' as a competition (event mode, player pool = euf_rosters, keyed
-- by euf_rosters.id::text — mirrors how wfdf-wucc keys off wfdf_rosters.id).
-- EUCS event = euf_events where year = season_year and kind = 'eucf'.
--
-- Widens: fantasy_contests.competition, fantasy_draft_picks.player_league,
-- fantasy_roster_slots.player_league. Extends the competition<->player_league
-- helpers, the draft-window floor helper, and fantasy_rebuild_contest_periods
-- (PATCH-ONLY — see below).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Widen CHECK constraints (real names looked up via pg_constraint) ─────────

alter table public.fantasy_contests drop constraint fantasy_contests_competition_check;
alter table public.fantasy_contests add constraint fantasy_contests_competition_check
  check (competition in (
    'ufa','pul','wul','usau-club-nationals','usau-college-nationals','wfdf-wucc','eucs'
  ));

alter table public.fantasy_draft_picks drop constraint fantasy_draft_picks_player_league_check;
alter table public.fantasy_draft_picks add constraint fantasy_draft_picks_player_league_check
  check (player_league in ('ufa','usau','pul','wul','wfdf','euf'));

alter table public.fantasy_roster_slots drop constraint fantasy_roster_slots_player_league_check;
alter table public.fantasy_roster_slots add constraint fantasy_roster_slots_player_league_check
  check (player_league in ('ufa','usau','pul','wul','wfdf','euf'));

-- ── fantasy_draft_player_league_valid — add eucs -> euf ───────────────────────
-- Guard: abort if the deployed body has diverged from the committed text this
-- create-or-replace is based on (20260827010100_fantasy_draft_rpcs.sql).
do $$ begin
  if (select md5(prosrc) from pg_proc where oid = 'public.fantasy_draft_player_league_valid(text, text)'::regprocedure)
     <> '4a5c20cda52ef755e5071f1f5bba4517' then
    raise exception 'fantasy_draft_player_league_valid body has diverged from expected — aborting migration';
  end if;
end $$;

create or replace function public.fantasy_draft_player_league_valid(p_competition text, p_player_league text)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select case p_competition
    when 'ufa' then p_player_league = 'ufa'
    when 'pul' then p_player_league = 'pul'
    when 'wul' then p_player_league = 'wul'
    when 'usau-club-nationals' then p_player_league = 'usau'
    when 'usau-college-nationals' then p_player_league = 'usau'
    when 'wfdf-wucc' then p_player_league = 'wfdf'
    when 'eucs' then p_player_league = 'euf'
    else false
  end;
$$;

revoke all on function public.fantasy_draft_player_league_valid(text, text) from public;
grant execute on function public.fantasy_draft_player_league_valid(text, text) to authenticated;

-- ── fantasy_draft_competition_player_league — add eucs -> euf ────────────────
do $$ begin
  if (select md5(prosrc) from pg_proc where oid = 'public.fantasy_draft_competition_player_league(text)'::regprocedure)
     <> 'eacb2f5a5beb1511bd58237b4d87404f' then
    raise exception 'fantasy_draft_competition_player_league body has diverged from expected — aborting migration';
  end if;
end $$;

create or replace function public.fantasy_draft_competition_player_league(p_competition text)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select case p_competition
    when 'ufa' then 'ufa'
    when 'pul' then 'pul'
    when 'wul' then 'wul'
    when 'usau-club-nationals' then 'usau'
    when 'usau-college-nationals' then 'usau'
    when 'wfdf-wucc' then 'wfdf'
    when 'eucs' then 'euf'
    else null
  end;
$$;

revoke all on function public.fantasy_draft_competition_player_league(text) from public;
grant execute on function public.fantasy_draft_competition_player_league(text) to authenticated;

-- ── fantasy_draft_earliest_at — add eucs event floor ──────────────────────────
do $$ begin
  if (select md5(prosrc) from pg_proc where oid = 'public.fantasy_draft_earliest_at(uuid)'::regprocedure)
     <> '4727bd1d5349d992d8689f2837548eaa' then
    raise exception 'fantasy_draft_earliest_at body has diverged from expected — aborting migration';
  end if;
end $$;

create or replace function public.fantasy_draft_earliest_at(p_contest uuid)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_competition text;
  v_event_id    text;
  v_start_date  date;
begin
  select competition, settings->>'eventId' into v_competition, v_event_id
  from public.fantasy_contests
  where id = p_contest;

  if v_competition in ('usau-club-nationals', 'usau-college-nationals') then
    select start_date into v_start_date from public.usau_events where id = v_event_id::uuid;
  elsif v_competition = 'wfdf-wucc' then
    select start_date into v_start_date from public.wfdf_events where id = v_event_id::uuid;
  elsif v_competition = 'eucs' then
    select start_date into v_start_date from public.euf_events where id = v_event_id::uuid;
  else
    return null;  -- weekly-stats games: season data exists, no draft floor
  end if;

  if v_start_date is null then
    raise exception 'contest % has no resolvable event start date', p_contest;
  end if;

  -- Saturday strictly before the event start, midnight ET. dow: Sun=0..Sat=6
  -- → days back = dow+1 (a Saturday start goes back a full week).
  -- ::timestamp BEFORE `at time zone` — bare-date promotion converts the
  -- wrong way (see 20260815023000).
  return (v_start_date - (extract(dow from v_start_date)::int + 1))::timestamp
         at time zone 'America/New_York';
end;
$$;

-- Internal only: SECURITY DEFINER callers execute as owner; no client grant.
revoke all on function public.fantasy_draft_earliest_at(uuid) from public;

comment on function public.fantasy_draft_earliest_at is 'Earliest allowed draft time for a contest: midnight ET on the Saturday strictly before an event contest''s event start_date (rosters are published by then); null for weekly-stats contests. Mirrors draftOpensDate() in src/lib/fantasy/games.ts. Now covers eucs (euf_events).';

-- ── fantasy_rebuild_contest_periods — PATCH-ONLY (never create-or-replace) ───
-- Deployed body has diverged from every committed migration's text (carries
-- the fantasy_is_league_member gate from 20260816010000 PLUS the Wednesday-
-- week UFA lock/unlock rewrite from 20260827050000 — confirmed live via
-- execute_sql immediately before writing this file). Insert an eucs branch
-- sourcing euf_events, anchored on the same terminal "unknown competition"
-- raise used by every other branch. Preserve the live search_path=public.
do $mig$
declare
  v_src    text;
  v_new    text;
  v_anchor text;
  v_insert text;
begin
  select prosrc into v_src
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fantasy_rebuild_contest_periods';

  if v_src is null then
    raise exception 'fantasy_rebuild_contest_periods not found';
  end if;

  v_anchor :=
    '  else' || E'\n' ||
    '    raise exception ''unknown competition % for contest %'', v_competition, p_contest;' || E'\n' ||
    '  end if;';

  if position(v_anchor in v_src) = 0 then
    raise exception 'fantasy_rebuild_contest_periods: anchor text not found in deployed body — aborting rather than guessing';
  end if;

  v_insert :=
    '  elsif v_competition = ''eucs'' then' || E'\n' ||
    E'\n' ||
    '    if v_event_id is null then' || E'\n' ||
    '      raise exception ''contest % (eucs) has no settings.eventId'', p_contest;' || E'\n' ||
    '    end if;' || E'\n' ||
    '    v_event_uuid := v_event_id::uuid;' || E'\n' ||
    E'\n' ||
    '    select start_date, end_date into v_start_date, v_end_date' || E'\n' ||
    '    from public.euf_events where id = v_event_uuid;' || E'\n' ||
    E'\n' ||
    '    if v_start_date is null then' || E'\n' ||
    '      raise exception ''euf_events % not found or has no start_date'', v_event_uuid;' || E'\n' ||
    '    end if;' || E'\n' ||
    E'\n' ||
    '    insert into public.fantasy_contest_periods (contest_id, period, lock_at, unlock_at, game_count, complete, updated_at)' || E'\n' ||
    '    values (' || E'\n' ||
    '      p_contest,' || E'\n' ||
    '      ''event'',' || E'\n' ||
    '      v_start_date::timestamp at time zone ''America/New_York'',' || E'\n' ||
    '      null,' || E'\n' ||
    '      null,' || E'\n' ||
    '      current_date > coalesce(v_end_date, v_start_date + 5),' || E'\n' ||
    '      now()' || E'\n' ||
    '    )' || E'\n' ||
    '    on conflict (contest_id, period) do update set' || E'\n' ||
    '      lock_at    = excluded.lock_at,' || E'\n' ||
    '      complete   = excluded.complete,' || E'\n' ||
    '      updated_at = now();' || E'\n' ||
    E'\n' ||
    v_anchor;

  v_new := replace(v_src, v_anchor, v_insert);

  if v_new = v_src then
    raise exception 'fantasy_rebuild_contest_periods: replacement made no change — aborting';
  end if;

  execute format(
    'create or replace function public.fantasy_rebuild_contest_periods(p_contest uuid)
       returns void language plpgsql security definer set search_path = public as %L',
    v_new
  );
end
$mig$;

revoke all on function public.fantasy_rebuild_contest_periods(uuid) from public, anon;
grant execute on function public.fantasy_rebuild_contest_periods(uuid) to authenticated;

notify pgrst, 'reload schema';

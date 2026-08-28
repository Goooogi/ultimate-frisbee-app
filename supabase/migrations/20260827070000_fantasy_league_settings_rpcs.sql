-- League settings: commissioner-only rename + roster-composition update.
--
-- Scope (Hunter 2026-08-27, informed by ESPN/Yahoo/Sleeper): those platforms
-- expose Basic (name/visibility), Roster, Scoring, Draft, Waivers, Trades,
-- Keepers, Playoffs. Most of that has NO representation in our data model —
-- there are no waivers, trades, keepers, FAAB, or H2H playoff brackets (the
-- vault marks them explicitly out of v1), and scoring is a fixed matrix
-- mirrored in TS + Deno that a commissioner must NOT be able to diverge per
-- league. So this ships only what is real and enforceable:
--   • league name          (fantasy_leagues.name)
--   • roster composition   (fantasy_contests.settings offenders/defenders/flex)
-- Draft config already has its own RPC (fantasy_schedule_draft).
--
-- Roster composition is DB-enforced at write time by
-- fantasy_enforce_roster_composition, which reads contest.settings on every
-- slot insert — so a change takes effect immediately for future writes.
-- It does NOT retro-validate existing rosters: shrinking a roster leaves
-- already-saved lineups over the new cap until their next edit. Guarded below
-- by refusing to shrink once any roster exists for the contest, which is the
-- cheap correct answer (no bulk rewrite of user lineups on a settings click).

-- ── Rename a league ──────────────────────────────────────────────────────────
create or replace function public.fantasy_rename_league(p_league uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(p_name);
begin
  if auth.uid() is null then
    raise exception 'Not signed in.' using errcode = 'P0001';
  end if;
  if not public.fantasy_is_commissioner(p_league) then
    raise exception 'Only the commissioner can change league settings.' using errcode = 'P0001';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 60 then
    raise exception 'League name must be 1–60 characters.' using errcode = 'P0001';
  end if;

  update public.fantasy_leagues set name = v_name where id = p_league;
end;
$$;

revoke all on function public.fantasy_rename_league(uuid, text) from public, anon;
grant execute on function public.fantasy_rename_league(uuid, text) to authenticated;

-- ── Update roster composition for one contest ────────────────────────────────
-- weekly-stats: p_offenders / p_defenders. event: p_flex. The mode itself is
-- NOT settable — it's a property of the competition, not a league preference.
create or replace function public.fantasy_update_contest_roster(
  p_contest   uuid,
  p_offenders int default null,
  p_defenders int default null,
  p_flex      int default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_league   uuid;
  v_settings jsonb;
  v_mode     text;
  v_cur_off  int;
  v_cur_def  int;
  v_cur_flex int;
  v_has_rosters boolean;
begin
  if auth.uid() is null then
    raise exception 'Not signed in.' using errcode = 'P0001';
  end if;

  select league_id, settings into v_league, v_settings
  from public.fantasy_contests where id = p_contest;

  if v_league is null then
    -- Public/global contests (league_id NULL) have no commissioner and are
    -- service-managed; nobody edits their roster shape from the app.
    raise exception 'This contest is not editable.' using errcode = 'P0001';
  end if;
  if not public.fantasy_is_commissioner(v_league) then
    raise exception 'Only the commissioner can change league settings.' using errcode = 'P0001';
  end if;

  v_mode := coalesce(v_settings->>'mode', 'weekly-stats');

  select exists(
    select 1 from public.fantasy_roster_slots s
    join public.fantasy_teams t on t.id = s.team_id
    where t.contest_id = p_contest
  ) into v_has_rosters;

  if v_mode = 'weekly-stats' then
    v_cur_off := coalesce((v_settings->>'offenders')::int, 4);
    v_cur_def := coalesce((v_settings->>'defenders')::int, 3);
    if p_offenders is null or p_defenders is null then
      raise exception 'Offenders and defenders are required for this game.' using errcode = 'P0001';
    end if;
    if p_offenders < 1 or p_offenders > 10 or p_defenders < 1 or p_defenders > 10 then
      raise exception 'Each line must be between 1 and 10 players.' using errcode = 'P0001';
    end if;
    -- Shrinking would strand already-saved lineups above the new cap; the
    -- composition trigger only validates on write, so they'd sit invalid until
    -- next edited. Refuse rather than silently rewriting user rosters.
    if v_has_rosters and (p_offenders < v_cur_off or p_defenders < v_cur_def) then
      raise exception 'Rosters already exist — you can add slots but not remove them this season.'
        using errcode = 'P0001';
    end if;

    update public.fantasy_contests
    set settings = v_settings
                   || jsonb_build_object('offenders', p_offenders, 'defenders', p_defenders)
    where id = p_contest;

  else
    v_cur_flex := coalesce((v_settings->>'flex')::int, 7);
    if p_flex is null then
      raise exception 'Roster size is required for this game.' using errcode = 'P0001';
    end if;
    if p_flex < 1 or p_flex > 20 then
      raise exception 'Roster size must be between 1 and 20 players.' using errcode = 'P0001';
    end if;
    if v_has_rosters and p_flex < v_cur_flex then
      raise exception 'Rosters already exist — you can add slots but not remove them this season.'
        using errcode = 'P0001';
    end if;

    update public.fantasy_contests
    set settings = v_settings || jsonb_build_object('flex', p_flex)
    where id = p_contest;
  end if;
end;
$$;

revoke all on function public.fantasy_update_contest_roster(uuid, int, int, int) from public, anon;
grant execute on function public.fantasy_update_contest_roster(uuid, int, int, int) to authenticated;

notify pgrst, 'reload schema';

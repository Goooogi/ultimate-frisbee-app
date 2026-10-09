-- Fantasy: fixed team sizes per game (Hunter, 2026-10-07). APPLIED to prod
-- 2026-10-07 on Hunter's go (remote version 20261007154637).
--
--   * Weekly leagues (UFA / PUL / WUL): a team is 12 players — the draft is
--     always 12 rounds — but only 7 start any week (offense + defense = 7),
--     so 5 sit on the bench.
--   * Event leagues (USAU Club/College Nationals, WFDF, EUCS): team size is 7,
--     the draft is 7 rounds, no bench — every drafted player is in the event
--     lineup (fantasy_draft_seed_event_rosters seeds the first `flex` picks)
--     and the team stays as drafted for the whole event.
--
-- p_rounds stays in both schedule RPCs' signatures (shipped mobile builds
-- still send it) but is now ignored; the game decides. No backfill: prod has
-- no drafts and every contest is an event contest already at flex 7.
--
-- PATCHED IN PLACE from the LIVE definitions with anchors asserted to occur
-- exactly once (the 20260913160000 pattern; shared DB with mobile).
-- CREATE OR REPLACE keeps each function's ACL. Live md5(prosrc) (2026-10-07):
--   fantasy_schedule_draft          83122891d34f5d41db4d500a22273388
--   fantasy_schedule_auction_draft  f02af108b0b9e10231eb3edc6c71c61a
--   fantasy_update_contest_roster   99e7ac15e44b0e6df365d24b7129e6a3

create or replace function pg_temp.replace_once(p_src text, p_old text, p_new text, p_what text)
returns text
language plpgsql
as $$
begin
  if (length(p_src) - length(replace(p_src, p_old, ''))) / length(p_old) <> 1 then
    raise exception '%: anchor not found exactly once — aborting rather than guessing', p_what;
  end if;
  return replace(p_src, p_old, p_new);
end;
$$;

do $mig$
declare
  v text;
  v_rounds_check constant text :=
'  if p_rounds < 1 or p_rounds > 40 then
    raise exception ''rounds must be between 1 and 40'';
  end if;';
  v_fixed_rounds constant text :=
'  -- Team size is fixed by the game: weekly 12 (7 starters + 5 bench), event
  -- 7 (no bench). p_rounds is ignored (kept for shipped clients).
  p_rounds := case
    when coalesce((select settings->>''mode'' from public.fantasy_contests where id = p_contest), ''weekly-stats'') = ''event''
      then 7
    else 12
  end;';
begin
  v := pg_get_functiondef('public.fantasy_schedule_draft(uuid, timestamptz, integer, integer)'::regprocedure);
  v := pg_temp.replace_once(v, v_rounds_check, v_fixed_rounds, 'fantasy_schedule_draft rounds');
  execute v;

  -- Auction: the fixed size also feeds the budget >= rounds x min_bid check below it.
  v := pg_get_functiondef('public.fantasy_schedule_auction_draft(uuid, timestamptz, integer, integer, integer, integer, integer)'::regprocedure);
  v := pg_temp.replace_once(v, v_rounds_check, v_fixed_rounds, 'fantasy_schedule_auction_draft rounds');
  execute v;

  v := pg_get_functiondef('public.fantasy_update_contest_roster(uuid, integer, integer, integer)'::regprocedure);
  v := pg_temp.replace_once(v,
'    if p_offenders < 1 or p_offenders > 10 or p_defenders < 1 or p_defenders > 10 then
      raise exception ''Each line must be between 1 and 10 players.'' using errcode = ''P0001'';
    end if;',
'    if p_offenders < 1 or p_offenders > 10 or p_defenders < 1 or p_defenders > 10 then
      raise exception ''Each line must be between 1 and 10 players.'' using errcode = ''P0001'';
    end if;
    if p_offenders + p_defenders <> 7 then
      raise exception ''Weekly lineups have 7 starters — offense and defense must add up to 7.'' using errcode = ''P0001'';
    end if;',
    'fantasy_update_contest_roster weekly total');
  v := pg_temp.replace_once(v,
'    if p_flex < 1 or p_flex > 20 then
      raise exception ''Roster size must be between 1 and 20 players.'' using errcode = ''P0001'';
    end if;',
'    if p_flex <> 7 then
      raise exception ''Event leagues use 7-player teams.'' using errcode = ''P0001'';
    end if;',
    'fantasy_update_contest_roster event flex');
  execute v;
end;
$mig$;

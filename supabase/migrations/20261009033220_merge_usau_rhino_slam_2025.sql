-- Merge USAU's two 2025 rows for Rhino Slam! (Portland, Men's club) into one
-- (Hunter, 2026-10-09: "this is one team just put under a different name for
-- the back half of the season. 0 overlapping tournaments").
-- APPLIED to prod 2026-10-09 (remote version 20261009033220); rollback dry run
-- first: 5 events, 218 roster rows, 25 games on the survivor.
--
--   Rhino Slam!  f1af3e66…  2025 Pro-Elite Challenge West (Jul 12)   25 roster, 3 games
--   Rhino        69d5370f…  U.S. Open, Pro Champs, NW Regionals, Club Nationals
--                           (Aug 1 → Oct 23)                          4 events, 22 games
--
-- No event has both rows. The survivor is the richer row (69d5370f, USAU team
-- 40737), renamed "Rhino Slam!" so 2025 joins the team's 2018-2026 history
-- (cross-season identity is name + division + level). The name-variant normalizer in
-- 20260823090000 can't catch this — the names genuinely differ — so it's a
-- manual pair.
--
-- Mechanics follow 20260823090000 (repoint every FK, then drop the loser),
-- plus usau_games.winner_team_id, which that migration predates. Affected
-- players' cached profiles are marked stale so the trickle job rebuilds them.

do $mig$
declare
  v_loser  constant uuid := 'f1af3e66-f5ee-44b2-8e64-aee0aaf58330';
  v_winner constant uuid := '69d5370f-d929-4afe-9759-504ebca62274';
  v_names  text[];
begin
  if (select count(*) from public.usau_teams where id in (v_loser, v_winner)) <> 2 then
    raise exception 'Rhino rows not found as expected — aborting';
  end if;
  if exists (
    select 1 from public.usau_event_teams a join public.usau_event_teams b on b.event_id = a.event_id
    where a.team_id = v_loser and b.team_id = v_winner
  ) then
    raise exception 'the two Rhino rows share an event — not a clean rename, aborting';
  end if;

  select array_agg(distinct lower(p.display_name)) into v_names
  from public.usau_rosters r join public.usau_players p on p.id = r.player_id
  where r.team_id in (v_loser, v_winner);

  update public.usau_event_teams set team_id = v_winner where team_id = v_loser;

  delete from public.usau_rosters r
  where r.team_id = v_loser
    and exists (select 1 from public.usau_rosters w
                where w.team_id = v_winner and w.season = r.season
                  and w.player_id = r.player_id
                  and w.event_id is not distinct from r.event_id);
  update public.usau_rosters set team_id = v_winner where team_id = v_loser;

  update public.usau_player_event_stats set team_id = v_winner where team_id = v_loser;
  update public.usau_games set team_a_id = v_winner where team_a_id = v_loser;
  update public.usau_games set team_b_id = v_winner where team_b_id = v_loser;
  update public.usau_games set winner_team_id = v_winner where winner_team_id = v_loser;
  update public.usau_rankings set team_id = v_winner where team_id = v_loser;

  delete from public.usau_teams where id = v_loser;
  update public.usau_teams set name = 'Rhino Slam!' where id = v_winner;

  update public.player_profiles
  set built_at = '-infinity'
  where lower(profile ->> 'displayName') = any (v_names)
    and built_at <> '-infinity';
end;
$mig$;

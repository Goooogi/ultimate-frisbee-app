-- 2015 Club Nationals was filed competition_level OTHER, so every CLUB-only
-- Nationals filter skipped it: 2015 champions Revolver, Brute Squad and Drag'n
-- Thrust had no champion badge, and the event dropped out of standouts/prestige.
--
-- Same root as the level: an ultirzr ingest (2026-08-21) created a second,
-- division-less "Seattle Mixtape" row (usau_team_id 4975, level OTHER) that
-- holds the team's 7 games at this event, while the canonical Mixed CLUB row
-- (usau_team_id 7680) holds its roster, stats and placement. Merge the games
-- onto the canonical row, same pattern as 20260821160000.
-- Re-running the ultirzr ingest for 2015 would recreate the stray row.
DO $migration$
DECLARE
  c_event  constant uuid := '1f0327ca-80f7-4771-b082-06d65bcbec49';
  c_loser  constant uuid := '5d251d1f-bba2-4717-b8aa-8e98b08ca1d0';
  c_winner constant uuid := '88661de4-de1d-47e7-92dd-8e8dbb7df5c5';
  v_games int;
BEGIN
  IF (select count(*) from usau_rosters where team_id = c_loser) <> 0
     OR (select count(*) from usau_player_event_stats where team_id = c_loser) <> 0
     OR (select count(*) from usau_rankings where team_id = c_loser) <> 0
     OR (select count(*) from usau_event_teams where team_id = c_loser) <> 1
     OR (select count(*) from usau_event_teams where team_id = c_winner and event_id = c_event) <> 1 THEN
    RAISE EXCEPTION 'Seattle Mixtape 2015 merge preconditions changed; not merging';
  END IF;

  update usau_games set team_a_id = c_winner where team_a_id = c_loser;
  GET DIAGNOSTICS v_games = ROW_COUNT;
  update usau_games set team_b_id = c_winner where team_b_id = c_loser;
  RAISE NOTICE 'repointed % team_a + % team_b', v_games, (select count(*) from usau_games where event_id = c_event and team_b_id = c_winner);

  delete from usau_event_teams where team_id = c_loser;
  delete from usau_teams where id = c_loser;

  update usau_events set competition_level = 'CLUB'
  where id = c_event and competition_level = 'OTHER';

  -- Every cached profile touching this event can change (champion years,
  -- Nationals labels); the trickle job rebuilds them at its capped rate.
  update player_profiles set built_at = '-infinity'
  where built_at <> '-infinity'
    and profile -> 'usauClusterIds' ?| (
      select array_agg(distinct r.player_id::text) from usau_rosters r where r.event_id = c_event
    );
END
$migration$;

-- "Arizona Mixed 1" (2021, usau_team_id 27211) is Lawless — Arizona's mixed club.
-- USAU's 2021 Nationals Mixed schedule lists the seed-7 team as "Lawless"
-- (probed 2026-09-22), and every later season's row is named Lawless. The
-- ultirzr-era name made the URL resolver miss it three times (09-07/11/14), so
-- its 2021 Nationals roster and goals/assists were never fetched, and the team
-- page history split 2021 off from 2022-2026. No 2021 Lawless row exists, so
-- the rename can't collide.
DO $migration$
DECLARE
  c_team  constant uuid := 'b49a8070-d682-442e-8a04-549a18005476';
  c_event constant uuid := (select id from usau_events where usau_slug = 'usa-ultimate-national-championships-2021');
BEGIN
  update usau_teams set name = 'Lawless' where id = c_team and name = 'Arizona Mixed 1';
  update usau_event_teams
     set usau_event_team_url_id = 'x/4ExUE/NHNqghs68cAQO/YfsCbJP2SHL45+spO55kI='
   where event_id = c_event and team_id = c_team and usau_event_team_url_id is null;

  update player_profiles set built_at = '-infinity'
  where built_at <> '-infinity'
    and profile -> 'usauClusterIds' ?| (
      select array_agg(distinct r.player_id::text) from usau_rosters r where r.team_id = c_team
    );
END
$migration$;

-- Manual override: Chain Lightning is Atlanta, Georgia.
--
-- Same failure mode as 20260709190049_curate_usau_team_state_overrides.sql: the
-- venue-modal backfill derived 'NC' because the Southeast sectional/regional
-- venues Chain Lightning plays are frequently hosted in North Carolina. Team
-- home locations are static, so this hand-verified correction is durable.
-- Keyed by (name, gender_division) to hit every season's row.

UPDATE usau_teams SET state = v.st, city = v.city
FROM (VALUES
  ('Chain Lightning', 'Men', 'GA', 'Atlanta')
) AS v(name, gd, st, city)
WHERE usau_teams.name = v.name
  AND usau_teams.gender_division::text = v.gd;

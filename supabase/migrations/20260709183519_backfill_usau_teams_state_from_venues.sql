-- Backfill usau_teams.state (was 0% populated). USAU has no per-team home
-- location, but a team's home state is derivable: pool the venue states of all
-- events a real team played, weighted toward the geographically-local series
-- (sectionals > regionals/conference > neutral-site invites/nationals), and take
-- the modal state. Real-team identity = (name, gender_division, competition_level)
-- because usau_team_id is unpopulated (one row per team-per-event-season).
-- Validated: Brute Squad→MA, Fury→CA, Sockeye→WA, Johnny Bravo→CO, etc.
-- ~87% of teams get a state; the rest have no venue-state signal (left null).

WITH votes AS (
  SELECT t.name, t.gender_division, t.competition_level, e.state AS st,
    sum(CASE
      WHEN e.name ILIKE '%sectional%'  THEN 3
      WHEN e.name ILIKE '%regional%'   THEN 2
      WHEN e.name ILIKE '%conference%' THEN 2
      ELSE 1 END) AS wt
  FROM usau_teams t
  JOIN usau_event_teams et ON et.team_id = t.id
  JOIN usau_events e ON e.id = et.event_id
  WHERE e.state IS NOT NULL AND e.state <> ''
  GROUP BY t.name, t.gender_division, t.competition_level, e.state
),
ranked AS (
  SELECT name, gender_division, competition_level, st,
    row_number() OVER (
      PARTITION BY name, gender_division, competition_level
      ORDER BY wt DESC, st
    ) AS rn
  FROM votes
),
derived AS (
  SELECT name, gender_division, competition_level, st
  FROM ranked WHERE rn = 1
)
UPDATE usau_teams t
SET state = d.st
FROM derived d
WHERE t.name = d.name
  AND t.gender_division = d.gender_division
  AND t.competition_level = d.competition_level
  AND (t.state IS NULL OR t.state = '');
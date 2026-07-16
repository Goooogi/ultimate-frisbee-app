-- Curated USAU team home-state overrides. The venue-modal backfill mislabels
-- teams in MULTI-STATE sections whose sectionals rotate venues (e.g. PoNY plays
-- "Metro New York" but a given year's venue was in MA) and a couple of Canadian
-- teams as US states. Team home locations are effectively static, so these
-- hand-verified corrections are durable. Keyed by (name, gender_division) —
-- unique per club team. Applies to ALL rows of that real team (every season).
-- Confident, well-known-team corrections only; ambiguous derivations left as-is.

UPDATE usau_teams SET state = v.st
FROM (VALUES
  ('PoNY',                      'Men',   'NY'),  -- New York
  ('Chicago Machine',           'Men',   'IL'),  -- Chicago
  ('Truck Stop',                'Men',   'DC'),  -- Washington
  ('GOAT',                      'Men',   'ON'),  -- Toronto, Canada
  ('Philadelphia Pacmen',       'Men',   'PA'),  -- Philadelphia
  ('Florida Untied',            'Men',   'FL'),  -- Florida (name typo is in source)
  ('Garden State Ultimate',     'Men',   'NJ'),  -- Garden State = New Jersey
  ('AMP',                       'Mixed', 'PA'),  -- Philadelphia
  ('Pittsburgh Port Authority', 'Mixed', 'PA'),  -- Pittsburgh
  ('Chicago Parlay',            'Mixed', 'IL'),  -- Chicago
  ('Scandal',                   'Women', 'DC'),  -- Washington
  ('6ixers',                    'Women', 'ON'),  -- Toronto ("the 6ix"), Canada
  ('Indy Rogue',                'Women', 'IN')   -- Indianapolis
) AS v(name, gd, st)
WHERE usau_teams.name = v.name
  AND usau_teams.gender_division::text = v.gd;
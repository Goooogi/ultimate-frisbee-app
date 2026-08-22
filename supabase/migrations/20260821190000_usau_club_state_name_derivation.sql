-- Repair USAU CLUB team states. The venue-modal backfill
-- (20260709183519_backfill_usau_teams_state_from_venues.sql) is unreliable for
-- club: re-running its vote, the winning state usually holds only 16-40% of the
-- weight spread over 5-17 states, because club teams travel and their sectional
-- venues rotate across a multi-state section. Measured against 102 teams whose
-- own name contains their city, 34% of derived states were WRONG.
--
-- Three passes, in order (later passes must not clobber earlier ones):
--   1. Name-derived  — a team whose name STARTS with a city names its own home.
--   2. Curated       — hand-verified teams whose name carries no city token.
--   3. Null the rest — where the venue vote was a coin flip, show nothing
--                      rather than presenting a 20%-confidence guess as fact.
--
-- Pass 1 is prefix-anchored (name ILIKE 'atlanta%'), never a substring match,
-- and excludes bare city names. Substring matching produces false positives:
-- "Phoenix" (Women/NC, Men/NY) and "Central Wisconsin Phoenix" are bird-named,
-- not Arizona; "Columbia"/"Madison" alone are colleges. Only "Phoenix Uprising"
-- is the real AZ club, and the prefix rule picks it up correctly.
-- Validated before apply: 0 false positives, 60 rows already agreed with the
-- rule, 31 corrected, 23 filled from null.

-- ---------------------------------------------------------------- pass 1
CREATE TEMP TABLE city_state(pat text, st text) ON COMMIT DROP;
INSERT INTO city_state VALUES
  ('atlanta','GA'),('chicago','IL'),('boston','MA'),('seattle','WA'),
  ('portland','OR'),('denver','CO'),('austin','TX'),('dallas','TX'),
  ('houston','TX'),('philadelphia','PA'),('pittsburgh','PA'),('kansas city','MO'),
  ('minneapolis','MN'),('milwaukee','WI'),('nashville','TN'),('memphis','TN'),
  ('raleigh','NC'),('durham','NC'),('charleston','SC'),('huntsville','AL'),
  ('birmingham','AL'),('orlando','FL'),('tampa','FL'),('miami','FL'),
  ('tucson','AZ'),('san diego','CA'),('long beach','CA'),('los angeles','CA'),
  ('sacramento','CA'),('las vegas','NV'),('salt lake','UT'),('indianapolis','IN'),
  ('cleveland','OH'),('cincinnati','OH'),('detroit','MI'),('st. louis','MO'),
  ('new orleans','LA'),('baltimore','MD'),('omaha','NE'),('buffalo','NY'),
  ('richmond','VA'),('charlotte','NC'),('rochester','NY'),('boise','ID'),
  ('phoenix uprising','AZ');

UPDATE usau_teams t SET state = c.st
FROM city_state c
WHERE t.competition_level::text = 'CLUB'
  AND t.name ILIKE c.pat || '%'
  AND lower(t.name) <> c.pat            -- bare city name = ambiguous, skip
  AND (t.state IS DISTINCT FROM c.st);

-- ---------------------------------------------------------------- pass 2
-- Hand-verified teams whose name carries no city token, so pass 1 can't reach
-- them. Extends 20260709190049_curate_usau_team_state_overrides.sql.
UPDATE usau_teams t SET state = v.st
FROM (VALUES
  ('Chain Lightning', 'Men',   'GA'),  -- Atlanta (also set city, see 20260821180000)
  ('Bullet',          'Men',   'GA'),  -- Atlanta
  ('H.O.G. Ultimate', 'Men',   'GA'),  -- Atlanta ("Hogs of Georgia")
  ('Rush Hour ATL',   'Men',   'GA'),  -- Atlanta (ATL in name)
  ('Tanasi',          'Men',   'TN'),  -- Tennessee (Tanasi = origin of the name)
  ('MoonPi',          'Mixed', 'TN'),  -- Chattanooga (MoonPie)
  ('Freaks',          'Men',   'AL'),  -- Alabama
  ('Space Force',     'Mixed', 'AL'),  -- Huntsville (Space & Rocket City)
  ('Space Cowboys',   'Men',   'AL'),  -- Huntsville
  ('DeMo',            'Men',   'IA'),  -- Des Moines
  ('Scythe',          'Men',   'IA'),  -- Iowa
  ('Stellar',         'Women', 'IA'),  -- Iowa
  ('Iowa Wild Rose',  'Women', 'IA'),  -- Iowa
  ('Sub Zero',        'Men',   'MN'),  -- Minneapolis
  ('Crackle',         'Women', 'MN'),  -- Minneapolis
  ('Wicked',          'Women', 'WI'),  -- Madison
  ('Chalice',         'Mixed', 'WI'),  -- Madison
  ('Brickyard',       'Men',   'IN'),  -- Indianapolis (Brickyard = the Speedway)
  ('Black Market',    'Men',   'IN'),  -- Indianapolis
  ('Black Market II', 'Men',   'IN'),  -- Indianapolis
  ('BENT',            'Women', 'NY'),  -- New York
  ('Grand Army',      'Mixed', 'NY'),  -- Brooklyn (Grand Army Plaza)
  ('Heat Wave',       'Mixed', 'NY'),  -- New York
  ('Ignite',          'Women', 'NY'),  -- New York
  ('Alloy',           'Mixed', 'PA'),  -- Pittsburgh
  ('Zephyr',          'Women', 'PA'),  -- Philadelphia
  ('Grit',            'Women', 'PA'),  -- Philadelphia
  ('Flight',          'Women', 'PA'),  -- Philadelphia
  ('Monsoon',         'Men',   'AZ'),  -- Phoenix
  ('Instant Karma',   'Mixed', 'AZ'),  -- Phoenix
  ('Rogue',           'Mixed', 'AZ'),  -- Phoenix
  ('7 Figures',       'Mixed', 'AZ'),  -- Phoenix
  ('Sprawl',          'Men',   'TX'),  -- Dallas
  ('Calypso',         'Women', 'FL'),  -- Florida
  ('Weird',           'Mixed', 'FL'),  -- Florida
  ('B-Unit',          'Mixed', 'FL'),  -- Florida
  ('Lochsa',          'Mixed', 'MT'),  -- Missoula (Lochsa River)
  ('Prairie Fire',    'Men',   'MN')   -- Minnesota
) AS v(name, gd, st)
WHERE t.name = v.name
  AND t.gender_division::text = v.gd
  AND t.competition_level::text = 'CLUB';

-- ---------------------------------------------------------------- pass 3
-- Null out states that came from a weak venue vote. Confidence = the winning
-- state's share of total weighted votes; a tie (margin 0) is a coin flip no
-- matter how high the share. Keep >=50% with a real margin; blank the rest.
-- Rows fixed by pass 1 or 2 are exempt: those are name-derived / hand-verified,
-- not venue-derived, so the vote's confidence says nothing about them.
WITH votes AS (
  SELECT t.name, t.gender_division AS gd, t.competition_level AS lvl, e.state AS st,
    sum(CASE WHEN e.name ILIKE '%sectional%'  THEN 3
             WHEN e.name ILIKE '%regional%'   THEN 2
             WHEN e.name ILIKE '%conference%' THEN 2
             ELSE 1 END) AS wt
  FROM usau_teams t
  JOIN usau_event_teams et ON et.team_id = t.id
  JOIN usau_events e ON e.id = et.event_id
  WHERE e.state IS NOT NULL AND e.state <> ''
  GROUP BY 1,2,3,4
),
agg AS (
  SELECT name, gd, lvl,
         sum(wt) AS total,
         max(wt) AS top,
         (array_agg(wt ORDER BY wt DESC, st))[2] AS second
  FROM votes GROUP BY 1,2,3
),
low_conf AS (
  SELECT name, gd, lvl FROM agg
  WHERE 100.0 * top / total < 50 OR top - coalesce(second, 0) = 0
)
UPDATE usau_teams t SET state = NULL
FROM low_conf l
WHERE t.name = l.name
  AND t.gender_division = l.gd
  AND t.competition_level = l.lvl
  AND t.competition_level::text = 'CLUB'
  AND t.state IS NOT NULL
  AND NOT EXISTS (                      -- exempt pass-1 name-derived rows
    -- No `lower(name) <> pat` guard here, unlike pass 1. A full-name entry like
    -- 'phoenix uprising' IS the whole team name, so that guard would cancel its
    -- own exemption and pass 3 would null the row pass 1 just set.
    SELECT 1 FROM city_state c
    WHERE t.name ILIKE c.pat || '%'
  )
  AND NOT EXISTS (                      -- exempt pass-2 curated rows
    SELECT 1 FROM (VALUES
      ('Chain Lightning','Men'),('Bullet','Men'),('H.O.G. Ultimate','Men'),
      ('Rush Hour ATL','Men'),('Tanasi','Men'),('MoonPi','Mixed'),
      ('Freaks','Men'),('Space Force','Mixed'),('Space Cowboys','Men'),
      ('DeMo','Men'),('Scythe','Men'),('Stellar','Women'),('Iowa Wild Rose','Women'),
      ('Sub Zero','Men'),('Crackle','Women'),('Wicked','Women'),('Chalice','Mixed'),
      ('Brickyard','Men'),('Black Market','Men'),('Black Market II','Men'),
      ('BENT','Women'),('Grand Army','Mixed'),('Heat Wave','Mixed'),('Ignite','Women'),
      ('Alloy','Mixed'),('Zephyr','Women'),('Grit','Women'),('Flight','Women'),
      ('Monsoon','Men'),('Instant Karma','Mixed'),('Rogue','Mixed'),('7 Figures','Mixed'),
      ('Sprawl','Men'),('Calypso','Women'),('Weird','Mixed'),('B-Unit','Mixed'),
      ('Lochsa','Mixed'),('Prairie Fire','Men')
    ) AS k(name, gd)
    WHERE t.name = k.name AND t.gender_division::text = k.gd
  );

-- 'TBD' leaked in from the source as a literal state value.
UPDATE usau_teams SET state = NULL WHERE state = 'TBD';

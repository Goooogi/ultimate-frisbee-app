-- Two follow-ups to 20260821190000_usau_club_state_name_derivation.sql:
--
--   1. Gate the venue backfill at >=50% confidence, so NEW club teams don't get
--      a coin-flip state reintroduced on the next backfill run. Without this the
--      root cause stays live and the 34%-wrong problem regrows.
--   2. Populate usau_teams.city from the same prefix-anchored city list, so team
--      pages can show "Atlanta, GA" instead of a bare state.

-- ------------------------------------------------------------------ part 1
-- Re-runnable gated backfill. Same weighting as the original (sectionals 3,
-- regionals/conference 2, else 1), but only writes when the winning state holds
-- >=50% of total weight AND beats the runner-up. Only fills NULLs — it never
-- overwrites a name-derived or hand-curated value.
CREATE OR REPLACE FUNCTION backfill_usau_team_state_confident()
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  WITH votes AS (
    SELECT t.name, t.gender_division AS gd, t.competition_level AS lvl, e.state AS st,
      sum(CASE WHEN e.name ILIKE '%sectional%'  THEN 3
               WHEN e.name ILIKE '%regional%'   THEN 2
               WHEN e.name ILIKE '%conference%' THEN 2
               ELSE 1 END) AS wt
    FROM usau_teams t
    JOIN usau_event_teams et ON et.team_id = t.id
    JOIN usau_events e ON e.id = et.event_id
    WHERE e.state IS NOT NULL AND e.state <> '' AND e.state <> 'TBD'
    GROUP BY 1,2,3,4
  ),
  agg AS (
    SELECT name, gd, lvl,
           sum(wt) AS total,
           max(wt) AS top,
           (array_agg(st ORDER BY wt DESC, st))[1] AS top_st,
           (array_agg(wt ORDER BY wt DESC, st))[2] AS second
    FROM votes GROUP BY 1,2,3
  ),
  confident AS (
    SELECT name, gd, lvl, top_st FROM agg
    WHERE 100.0 * top / total >= 50
      AND top - coalesce(second, 0) > 0
  )
  -- NOTE: only fills rows that have NO city either. A club row with a city was
  -- set by the name-derived / curated passes, and a club row that is null with
  -- no city was DELIBERATELY blanked as low-confidence -- refilling it from the
  -- same weak vote would undo that. The confidence test above is per-state; a
  -- team nulled for a team-level tie can still have one state clearing 50%.
  UPDATE usau_teams t SET state = c.top_st
  FROM confident c
  WHERE t.name = c.name
    AND t.gender_division = c.gd
    AND t.competition_level = c.lvl
    AND (t.state IS NULL OR t.state = '' OR t.state = 'TBD')
    AND (t.competition_level::text <> 'CLUB' OR t.city IS NOT NULL);

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION backfill_usau_team_state_confident() FROM PUBLIC;

-- ------------------------------------------------------------------ part 2
-- City from the same prefix-anchored rule as pass 1 of the previous migration.
-- Prefix-anchored, bare-name excluded — a substring match would put bird-named
-- "Phoenix" teams in Arizona. Only fills NULL/blank city.
UPDATE usau_teams t SET city = v.city
FROM (VALUES
  ('atlanta','Atlanta'),           ('chicago','Chicago'),
  ('boston','Boston'),             ('seattle','Seattle'),
  ('portland','Portland'),         ('denver','Denver'),
  ('austin','Austin'),             ('dallas','Dallas'),
  ('houston','Houston'),           ('philadelphia','Philadelphia'),
  ('pittsburgh','Pittsburgh'),     ('kansas city','Kansas City'),
  ('minneapolis','Minneapolis'),   ('milwaukee','Milwaukee'),
  ('nashville','Nashville'),       ('memphis','Memphis'),
  ('raleigh','Raleigh'),           ('durham','Durham'),
  ('charleston','Charleston'),     ('huntsville','Huntsville'),
  ('birmingham','Birmingham'),     ('orlando','Orlando'),
  ('tampa','Tampa'),               ('miami','Miami'),
  ('tucson','Tucson'),             ('san diego','San Diego'),
  ('long beach','Long Beach'),     ('los angeles','Los Angeles'),
  ('sacramento','Sacramento'),     ('las vegas','Las Vegas'),
  ('salt lake','Salt Lake City'),  ('indianapolis','Indianapolis'),
  ('cleveland','Cleveland'),       ('cincinnati','Cincinnati'),
  ('detroit','Detroit'),           ('st. louis','St. Louis'),
  ('new orleans','New Orleans'),   ('baltimore','Baltimore'),
  ('omaha','Omaha'),               ('buffalo','Buffalo'),
  ('richmond','Richmond'),         ('charlotte','Charlotte'),
  ('rochester','Rochester'),       ('boise','Boise'),
  ('phoenix uprising','Phoenix')
) AS v(pat, city)
WHERE t.competition_level::text = 'CLUB'
  AND t.name ILIKE v.pat || '%'
  AND lower(t.name) <> v.pat
  AND (t.city IS NULL OR t.city = '');

-- Curated cities for the hand-verified teams whose names carry no city token
-- (same set as pass 2 of the previous migration, where the city is known).
UPDATE usau_teams t SET city = v.city
FROM (VALUES
  ('Chain Lightning', 'Men',   'Atlanta'),
  ('Bullet',          'Men',   'Atlanta'),
  ('H.O.G. Ultimate', 'Men',   'Atlanta'),
  ('Rush Hour ATL',   'Men',   'Atlanta'),
  ('MoonPi',          'Mixed', 'Chattanooga'),
  ('Space Force',     'Mixed', 'Huntsville'),
  ('Space Cowboys',   'Men',   'Huntsville'),
  ('DeMo',            'Men',   'Des Moines'),
  ('Sub Zero',        'Men',   'Minneapolis'),
  ('Crackle',         'Women', 'Minneapolis'),
  ('Wicked',          'Women', 'Madison'),
  ('Chalice',         'Mixed', 'Madison'),
  ('Brickyard',       'Men',   'Indianapolis'),
  ('Black Market',    'Men',   'Indianapolis'),
  ('Black Market II', 'Men',   'Indianapolis'),
  ('BENT',            'Women', 'New York'),
  ('Grand Army',      'Mixed', 'Brooklyn'),
  ('Heat Wave',       'Mixed', 'New York'),
  ('Ignite',          'Women', 'New York'),
  ('Alloy',           'Mixed', 'Pittsburgh'),
  ('Zephyr',          'Women', 'Philadelphia'),
  ('Grit',            'Women', 'Philadelphia'),
  ('Flight',          'Women', 'Philadelphia'),
  ('Monsoon',         'Men',   'Phoenix'),
  ('Instant Karma',   'Mixed', 'Phoenix'),
  ('Rogue',           'Mixed', 'Phoenix'),
  ('7 Figures',       'Mixed', 'Phoenix'),
  ('Sprawl',          'Men',   'Dallas'),
  ('Lochsa',          'Mixed', 'Missoula')
) AS v(name, gd, city)
WHERE t.name = v.name
  AND t.gender_division::text = v.gd
  AND t.competition_level::text = 'CLUB'
  AND (t.city IS NULL OR t.city = '');

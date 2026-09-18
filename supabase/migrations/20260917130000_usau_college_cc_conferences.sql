-- College Conferences, pre-2024 spelling (Hunter, 2026-09-17).
--
-- USAU named the college conference round "CC" (Conference Championships)
-- through 2023: "Big Sky D-I College Men's CC 2021", "Colonial D-I College
-- Women's CC-2023". 545 such events (2017-2023) already carry teams, games and
-- rosters but fell out of 20260917120000 (which only knew "Conferences"), so
-- the stage would have started in 2024. This adds the CC spelling to the kind
-- and region functions; everything downstream is unchanged.
--
-- Same rules as 20260911200000: SET EXPRESSION on all five generated columns
-- in this transaction; the region alias map is untouched.

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION usau_series_kind(name text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public AS $$
  SELECT CASE
    WHEN n ~ '\mpre[- ]?(sectional|regional)|\mtalent\M|\mhangout\M|\mporch\M|\m4s\M|\mtune[- ]?up|\mwarm[- ]?up|\mclinic|\mtryout|\mcamp\M|\mshowcase|\msanction' THEN NULL
    WHEN n ~ '\msuper\s+qua[a-z]*fier\M' AND n ~ '\mmasters?\M' THEN 'super-qualifier'
    WHEN n ~ '\msectionals?(\s+club)?(\s+cham[a-z]*ships?)?(\s+20\d\d)?\s*(\(.*)?$' THEN 'sectionals'
    -- "Conferences" (2024+) or "CC" (≤2023); the year may follow a hyphen ("CC-2023").
    WHEN n ~ '\m(conferences?|cc)(\s+cham[a-z]*ships?)?([\s-]+20\d\d)?\s*(\(.*)?$' THEN 'conferences'
    WHEN n ~ '\mregionals?(\s+club)?(\s+cham[a-z]*ships?)?(\s+20\d\d)?\s*(\(.*|[a-z]{2}\.?/[a-z]{2}\s+super regional\)?)?$' THEN 'regionals'
  END
  FROM (SELECT lower(usau_series_norm(coalesce(name, '')))) t(n);
$$;

-- Only change: "CC" joins the stripped stage words.
CREATE OR REPLACE FUNCTION usau_series_region(name text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public AS $$
  SELECT CASE lower(regexp_replace(r, '[^A-Za-z]', '', 'g'))
    WHEN 'norcal' THEN 'NorCal'
    WHEN 'socal' THEN 'SoCal'
    WHEN 'metrony' THEN 'Metro New York'
    WHEN 'metronewyork' THEN 'Metro New York'
    WHEN 'upstateny' THEN 'Upstate New York'
    WHEN 'upstatenewyork' THEN 'Upstate New York'
    WHEN 'ozark' THEN 'Ozarks'
    WHEN 'ozarks' THEN 'Ozarks'
    WHEN 'midatlantic' THEN 'Mid-Atlantic'
    WHEN 'washingtonbc' THEN 'Washington/BC'
    WHEN 'midatlanticnortheast' THEN 'Mid-Atlantic/Northeast'
    WHEN 'greatlakessoutheast' THEN 'Great Lakes/Southeast'
    WHEN 'northcentralsouthcentral' THEN 'North Central/South Central'
    WHEN 'northwestsouthwest' THEN 'Northwest/Southwest'
    ELSE r
  END
  FROM (SELECT btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
      usau_series_norm(coalesce(name, '')),
      '\s*\(.*$', ''),
      '\s*[A-Za-z]{2}\.?/[A-Za-z]{2}\s+Super\s+Regional\)?', '', 'i'),
      '\s+[A-Za-z]{2}\s+[A-Za-z]{2}\s+Super\s+Regional\s*$', '', 'i'),
      '\m(19|20)\d\d\M', '', 'g'),
      '\mUSA Ultimate\M', '', 'gi'),
      '\m(wo)?m[ae]n(''s|s)?\M|\mmixed\M|\mopen\M|\mclub\M|\mcollege\M|\md-?i{1,3}\M|\mdev(elopmental)?\M|\mdivision i{1,3}\M|\mgreat\s+grand\s+masters?\M|\mgrand\s+masters?\M|\mmasters?\M|\m(sectional|regional|conference)s?\M|\mcc\M|\mcham[a-z]*ships?\M|\msuper\s+qua[a-z]*fier\M', '', 'gi'),
      '\s+', ' ', 'g'), ' -:,')) t(r);
$$;

ALTER TABLE usau_events
  ALTER COLUMN series_stage      SET EXPRESSION AS (usau_series_stage(name)),
  ALTER COLUMN series_tier       SET EXPRESSION AS (CASE WHEN usau_series_stage(name) IS NOT NULL THEN usau_series_tier(name) END),
  ALTER COLUMN series_division   SET EXPRESSION AS (usau_series_division(name)),
  ALTER COLUMN series_group_name SET EXPRESSION AS (usau_series_group_name(name, season)),
  ALTER COLUMN series_group_key  SET EXPRESSION AS (usau_series_group_key(name, season));

NOTIFY pgrst, 'reload schema';

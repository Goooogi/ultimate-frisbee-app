-- College Conferences as a series stage (Hunter, 2026-09-17).
--
-- USAU's college sectional round is called "Conferences" ("Illinois D-I Men's
-- Conferences", "Atlantic Coast Dev Women's Conferences"), so every one of the
-- ~300 conference rows (2024-2026) fell out of the 20260911200000 grouping
-- with series_stage NULL. This adds
--
--   kind  'conferences'          (name ends in Conference(s))
--   stage 'college-conferences'  (conferences × d-i | d-iii | dev)
--
-- and teaches the tier gate that "Dev" alone is college: 2025+ names drop the
-- word "College" ("Colonial Dev Men's Conferences"), which the old gate read as
-- club. Same read-time merge as club sectionals; no rows created or rewritten.
--
-- Per the rules in 20260911200000: every function edit is followed by SET
-- EXPRESSION on all five generated columns in this transaction, and the
-- region alias map is untouched (append-only).

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION usau_series_kind(name text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public AS $$
  SELECT CASE
    WHEN n ~ '\mpre[- ]?(sectional|regional)|\mtalent\M|\mhangout\M|\mporch\M|\m4s\M|\mtune[- ]?up|\mwarm[- ]?up|\mclinic|\mtryout|\mcamp\M|\mshowcase|\msanction' THEN NULL
    WHEN n ~ '\msuper\s+qua[a-z]*fier\M' AND n ~ '\mmasters?\M' THEN 'super-qualifier'
    WHEN n ~ '\msectionals?(\s+club)?(\s+cham[a-z]*ships?)?(\s+20\d\d)?\s*(\(.*)?$' THEN 'sectionals'
    WHEN n ~ '\mconferences?(\s+cham[a-z]*ships?)?(\s+20\d\d)?\s*(\(.*)?$' THEN 'conferences'
    WHEN n ~ '\mregionals?(\s+club)?(\s+cham[a-z]*ships?)?(\s+20\d\d)?\s*(\(.*|[a-z]{2}\.?/[a-z]{2}\s+super regional\)?)?$' THEN 'regionals'
  END
  FROM (SELECT lower(usau_series_norm(coalesce(name, '')))) t(n);
$$;

CREATE OR REPLACE FUNCTION usau_series_tier(name text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public AS $$
  SELECT CASE
    WHEN usau_series_kind(name) IS NULL THEN NULL
    WHEN n ~ '\mcollege\M|\md-?i{1,3}\M|\mdivision i{1,3}\M|\mdev(elopmental)?\M' THEN
      CASE WHEN n ~ '\md-?iii\M|\mdivision iii\M' THEN 'd-iii'
           WHEN n ~ '\mdev(elopmental)?\M' THEN 'dev'
           ELSE 'd-i' END
    WHEN n ~ '\mgreat grand masters?\M' THEN 'great-grand-masters'
    WHEN n ~ '\mgrand masters?\M' THEN 'grand-masters'
    WHEN n ~ '\mmasters?\M' THEN 'masters'
    ELSE 'club'
  END
  FROM (SELECT lower(usau_series_norm(coalesce(name, '')))) t(n);
$$;

CREATE OR REPLACE FUNCTION usau_series_stage(name text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public AS $$
  SELECT CASE
    WHEN k = 'sectionals'  AND t = 'club' THEN 'club-sectionals'
    WHEN k = 'regionals'   AND t = 'club' THEN 'club-regionals'
    WHEN k = 'conferences' AND t IN ('d-i', 'd-iii', 'dev') THEN 'college-conferences'
    WHEN k = 'regionals'   AND t IN ('d-i', 'd-iii', 'dev') THEN 'college-regionals'
    WHEN k IN ('regionals', 'super-qualifier') AND t IN ('masters', 'grand-masters', 'great-grand-masters') THEN 'masters-regionals'
  END
  FROM (SELECT usau_series_kind(name), usau_series_tier(name)) s(k, t);
$$;

-- Only change: "Conference(s)" joins the stripped stage words.
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
      '\m(wo)?m[ae]n(''s|s)?\M|\mmixed\M|\mopen\M|\mclub\M|\mcollege\M|\md-?i{1,3}\M|\mdev(elopmental)?\M|\mdivision i{1,3}\M|\mgreat\s+grand\s+masters?\M|\mgrand\s+masters?\M|\mmasters?\M|\m(sectional|regional|conference)s?\M|\mcham[a-z]*ships?\M|\msuper\s+qua[a-z]*fier\M', '', 'gi'),
      '\s+', ' ', 'g'), ' -:,')) t(r);
$$;

CREATE OR REPLACE FUNCTION usau_series_group_name(name text, season integer)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public AS $$
  SELECT CASE
    WHEN usau_series_stage(name) IS NULL OR season IS NULL OR usau_series_region(name) = '' THEN NULL
    ELSE season::text || ' ' || usau_series_region(name) || ' ' ||
      CASE usau_series_kind(name) || '/' || usau_series_tier(name)
        WHEN 'sectionals/club' THEN 'Sectional Championship'
        WHEN 'regionals/club' THEN 'Club Regional Championship'
        WHEN 'conferences/d-i' THEN 'D-I College Conferences'
        WHEN 'conferences/d-iii' THEN 'D-III College Conferences'
        WHEN 'conferences/dev' THEN 'Developmental College Conferences'
        WHEN 'regionals/d-i' THEN 'D-I College Regionals'
        WHEN 'regionals/d-iii' THEN 'D-III College Regionals'
        WHEN 'regionals/dev' THEN 'Developmental College Regionals'
        WHEN 'regionals/masters' THEN 'Masters Regionals'
        WHEN 'regionals/grand-masters' THEN 'Grand Masters Regionals'
        WHEN 'regionals/great-grand-masters' THEN 'Great Grand Masters Regionals'
        WHEN 'super-qualifier/masters' THEN 'Masters Super Qualifier'
        WHEN 'super-qualifier/grand-masters' THEN 'Grand Masters Super Qualifier'
        WHEN 'super-qualifier/great-grand-masters' THEN 'Great Grand Masters Super Qualifier'
      END
  END;
$$;

-- Recompute every stored value (CREATE OR REPLACE alone leaves old rows stale).
ALTER TABLE usau_events
  ALTER COLUMN series_stage      SET EXPRESSION AS (usau_series_stage(name)),
  ALTER COLUMN series_tier       SET EXPRESSION AS (CASE WHEN usau_series_stage(name) IS NOT NULL THEN usau_series_tier(name) END),
  ALTER COLUMN series_division   SET EXPRESSION AS (usau_series_division(name)),
  ALTER COLUMN series_group_name SET EXPRESSION AS (usau_series_group_name(name, season)),
  ALTER COLUMN series_group_key  SET EXPRESSION AS (usau_series_group_key(name, season));

NOTIFY pgrst, 'reload schema';

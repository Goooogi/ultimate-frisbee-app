-- USAU series grouping (Hunter, 2026-09-11).
--
-- USAU publishes every Club Sectional/Regional, College D-I/D-III Regional
-- and Masters/GM/GGM Regional (+ Super Qualifier) as one event PER DIVISION:
-- "2026 Rocky Mountain Mens Sectional Championship", "... Mixed ...",
-- "... Womens ...". The app merges those sibling rows into ONE event with
-- division tabs, and groups every section/region of a stage behind one card.
--
-- Merge happens at READ time. These generated columns only label each row;
-- no row is created, merged or rewritten, and no scraper changes are needed
-- (every writer uses explicit column lists).
--
--   series_stage       club-sectionals | club-regionals | college-regionals
--                      | masters-regionals | NULL (not a series event)
--   series_tier        club | d-i | d-iii | dev | masters | grand-masters
--                      | great-grand-masters
--   series_division    Men | Women | Mixed | NULL (combined / no gender word)
--   series_group_name  "2026 Rocky Mountain Sectional Championship"
--   series_group_key   slugified group name = the merged event's URL slug
--
-- Everything derives from the NAME (and season): competition_level is wrong
-- on 22+ series rows (GGM stored as GRAND_MASTERS, one regional as OTHER),
-- and enum_out is STABLE, so it can't feed a generated column anyway.
--
-- RULES FOR FUTURE EDITS
-- 1. CREATE OR REPLACE never recomputes stored values. After changing any
--    function body, in the SAME transaction run
--      ALTER TABLE usau_events
--        ALTER COLUMN series_stage      SET EXPRESSION AS (usau_series_stage(name)),
--        ALTER COLUMN series_tier       SET EXPRESSION AS (CASE WHEN usau_series_stage(name) IS NOT NULL THEN usau_series_tier(name) END),
--        ALTER COLUMN series_division   SET EXPRESSION AS (usau_series_division(name)),
--        ALTER COLUMN series_group_name SET EXPRESSION AS (usau_series_group_name(name, season)),
--        ALTER COLUMN series_group_key  SET EXPRESSION AS (usau_series_group_key(name, season));
--    (one table rewrite, fires no triggers). A bare CREATE OR REPLACE splits
--    groups silently: new scrapes get new keys, old rows keep old ones.
-- 2. The region alias map in usau_series_region is APPEND-ONLY. The region
--    feeds series_group_key, which is a public URL.
-- 3. Stub names: sync-event-details ensureEvent inserts name = slug with
--    dashes as spaces ("... D I College Mens Regionals 2026", "men s") until
--    sync-events overwrites it. usau_series_norm maps those spellings back so
--    the stub and the real name produce the same key.

SET lock_timeout = '5s';

-- Quote/space cleanup + stub-spelling repair. Every other function reads
-- names through this one.
CREATE OR REPLACE FUNCTION usau_series_norm(name text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SET search_path = public AS $$
  SELECT btrim(
    regexp_replace(
      regexp_replace(
        regexp_replace(translate(name, '’‘"', ''''''''), '\s+', ' ', 'g'),
        '\m[d][\s-]+(i{1,3})\M', 'D-\1', 'gi'),
      '\m((wo)?m[ae]n) s\M', '\1''s', 'gi'));
$$;

-- sectionals | regionals | super-qualifier | NULL. The stage word must END the
-- name (allowing "club", "championship(s)" incl. typos, a year, and a
-- parenthetical / "XX/YY Super Regional" suffix), so "Regional Talent ID Camp"
-- and "Regional Competition Hangout (PORCH)" never match.
CREATE OR REPLACE FUNCTION usau_series_kind(name text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public AS $$
  SELECT CASE
    WHEN n ~ '\mpre[- ]?(sectional|regional)|\mtalent\M|\mhangout\M|\mporch\M|\m4s\M|\mtune[- ]?up|\mwarm[- ]?up|\mclinic|\mtryout|\mcamp\M|\mshowcase|\msanction' THEN NULL
    WHEN n ~ '\msuper\s+qua[a-z]*fier\M' AND n ~ '\mmasters?\M' THEN 'super-qualifier'
    WHEN n ~ '\msectionals?(\s+club)?(\s+cham[a-z]*ships?)?(\s+20\d\d)?\s*(\(.*)?$' THEN 'sectionals'
    WHEN n ~ '\mregionals?(\s+club)?(\s+cham[a-z]*ships?)?(\s+20\d\d)?\s*(\(.*|[a-z]{2}\.?/[a-z]{2}\s+super regional\)?)?$' THEN 'regionals'
  END
  FROM (SELECT lower(usau_series_norm(coalesce(name, '')))) t(n);
$$;

CREATE OR REPLACE FUNCTION usau_series_tier(name text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public AS $$
  SELECT CASE
    WHEN usau_series_kind(name) IS NULL THEN NULL
    WHEN n ~ '\mcollege\M|\md-?i{1,3}\M|\mdivision i{1,3}\M' THEN
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
    WHEN k = 'sectionals' AND t = 'club' THEN 'club-sectionals'
    WHEN k = 'regionals'  AND t = 'club' THEN 'club-regionals'
    WHEN k = 'regionals'  AND t IN ('d-i', 'd-iii', 'dev') THEN 'college-regionals'
    WHEN k IN ('regionals', 'super-qualifier') AND t IN ('masters', 'grand-masters', 'great-grand-masters') THEN 'masters-regionals'
  END
  FROM (SELECT usau_series_kind(name), usau_series_tier(name)) s(k, t);
$$;

CREATE OR REPLACE FUNCTION usau_series_division(name text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public AS $$
  SELECT CASE
    WHEN usau_series_stage(name) IS NULL THEN NULL
    WHEN n ~ '\mmixed\M' THEN 'Mixed'
    WHEN n ~ '\mwom[ae]n(''s|s)?\M|\mgirls\M' THEN 'Women'
    WHEN n ~ '\mm[ae]n(''s|s)?\M|\mopen\M|\mboys\M' THEN 'Men'
  END
  FROM (SELECT lower(usau_series_norm(coalesce(name, '')))) t(n);
$$;

-- The section/region phrase: strips the year, "USA Ultimate", gender / tier /
-- stage words and suffixes, then canonicalises spelling drift. APPEND-ONLY.
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
      -- stub spelling of "(NW/SW Super Regional)": "nw sw super regional"
      '\s+[A-Za-z]{2}\s+[A-Za-z]{2}\s+Super\s+Regional\s*$', '', 'i'),
      '\m(19|20)\d\d\M', '', 'g'),
      '\mUSA Ultimate\M', '', 'gi'),
      '\m(wo)?m[ae]n(''s|s)?\M|\mmixed\M|\mopen\M|\mclub\M|\mcollege\M|\md-?i{1,3}\M|\mdev(elopmental)?\M|\mdivision i{1,3}\M|\mgreat\s+grand\s+masters?\M|\mgrand\s+masters?\M|\mmasters?\M|\m(sectional|regional)s?\M|\mcham[a-z]*ships?\M|\msuper\s+qua[a-z]*fier\M', '', 'gi'),
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

CREATE OR REPLACE FUNCTION usau_series_group_key(name text, season integer)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public AS $$
  SELECT btrim(regexp_replace(lower(usau_series_group_name(name, season)), '[^a-z0-9]+', '-', 'g'), '-');
$$;

ALTER TABLE usau_events
  ADD COLUMN series_stage      text GENERATED ALWAYS AS (usau_series_stage(name)) STORED,
  ADD COLUMN series_tier       text GENERATED ALWAYS AS (CASE WHEN usau_series_stage(name) IS NOT NULL THEN usau_series_tier(name) END) STORED,
  ADD COLUMN series_division   text GENERATED ALWAYS AS (usau_series_division(name)) STORED,
  ADD COLUMN series_group_name text GENERATED ALWAYS AS (usau_series_group_name(name, season)) STORED,
  ADD COLUMN series_group_key  text GENERATED ALWAYS AS (usau_series_group_key(name, season)) STORED;

-- getEvent's sibling lookup + member-slug redirect.
CREATE INDEX usau_events_series_group_key_idx
  ON usau_events (series_group_key) WHERE series_group_key IS NOT NULL;
-- Stage cards / series lists (season + stage, date-ordered).
CREATE INDEX usau_events_series_stage_idx
  ON usau_events (series_stage, season, start_date) WHERE series_stage IS NOT NULL;

NOTIFY pgrst, 'reload schema';

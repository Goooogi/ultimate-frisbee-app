-- Sortable TCT flight rank on usau_events (Hunter, 2026-08-22).
--
-- THE BUG: /scores ordered by end_date DESC with `id ASC` as the tiebreaker.
-- Eight club tournaments share the 2026-08-23 end date, so the top card was
-- decided by a random UUID — "Midas the III" (42 games, no flight) outranked
-- the Elite Select Challenge (144 games, Elite Flight). The date sort was
-- already correct; the TIEBREAKER was meaningless.
--
-- WHY THIS LIVES IN SQL: flight is derived from the event NAME in TypeScript
-- (src/lib/usau/flights.ts, flightForName) because USAU publishes no scrapeable
-- flight field. The /scores query pages SERVER-SIDE, so it must be able to
-- ORDER BY flight — which a TS-only derivation can't reach.
--
-- KEEP IN SYNC: usau_flight_rank() MUST mirror FLIGHT_RULES in
-- src/lib/usau/flights.ts. Rules are ordered (first match wins) and CASE
-- evaluates top-to-bottom, so the branch order below matches that array.
-- Adding or reordering a rule there means updating this function too.
-- Verified identical across all 1,697 club events at time of writing.
--
-- Ranks ASCEND with prestige, so `ORDER BY flight_rank ASC` floats the marquee
-- event. 9 = unclassified (most events: local invites, sectionals, regionals).

-- Mirrors normalizeEventName(): lowercase, punctuation -> space, collapse runs.
CREATE OR REPLACE FUNCTION usau_normalize_event_name(name text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path = public AS $$
  SELECT btrim(regexp_replace(regexp_replace(lower(name), '[.,()\-/&]', ' ', 'g'), '\s+', ' ', 'g'));
$$;

CREATE OR REPLACE FUNCTION usau_flight_rank(name text)
RETURNS smallint LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    -- ── Triple Crown (0) ──
    -- US Open FIRST: it is also titled "...Club Championships", so the generic
    -- Nationals rule below would otherwise swallow it.
    WHEN n LIKE '%us open%' OR n LIKE '%u s open%' THEN 0
    -- Club Nationals (renamed from "Club Championships" in 2025). Excludes the
    -- WORLD club championship (WUCC) and college/regional/sectional events.
    WHEN n LIKE '%club%'
      AND (n LIKE '%nationals%' OR n LIKE '%championship%')
      AND n NOT LIKE '%open%' AND n NOT LIKE '%world%' AND n NOT LIKE '%wucc%'
      AND n NOT LIKE '%regional%' AND n NOT LIKE '%sectional%' AND n NOT LIKE '%college%'
      THEN 0
    -- Pro Championships (season-ending TCT pro event).
    WHEN n LIKE '%pro%' AND n LIKE '%championship%' THEN 0
    -- ── Regular-season flights ──
    WHEN n LIKE '%pro elite challenge%' OR n LIKE '%pro elite plus%' THEN 1
    WHEN n LIKE '%elite select challenge%' THEN 2
    WHEN n LIKE '%select flight%' THEN 3
    ELSE 9
  END::smallint
  FROM (SELECT usau_normalize_event_name(coalesce(name, ''))) AS t(n);
$$;

ALTER TABLE usau_events
  ADD COLUMN flight_rank smallint
  GENERATED ALWAYS AS (usau_flight_rank(name)) STORED;

-- Matches the /scores ORDER BY (end_date DESC, flight_rank, id) so the sort
-- stays index-ordered instead of a full re-sort.
CREATE INDEX usau_events_recent_order_idx
  ON usau_events (competition_level, end_date DESC, flight_rank, id);

NOTIFY pgrst, 'reload schema';

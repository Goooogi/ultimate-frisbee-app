-- Derive final_placement from bracket results.
--
-- EUCS publishes NO final placements — only games. But its brackets are full
-- placement brackets: a "Bracket 1-8 Finals" group is FOUR games deciding
-- 1st/3rd/5th/7th simultaneously, so "Finals" alone doesn't tell you which is
-- the gold game.
--
-- The tree is recoverable from results alone. Within one bracket group
-- (e.g. "Bracket 1-8" + its Semifinals + Finals), order the final games by:
--   1. prior wins inside the bracket (DESC) — the gold game's two teams have
--      won every round to get there; the 7th-place game's teams have won none.
--   2. first-loss depth (DESC) — separates the two games that tie on prior
--      wins: 3rd-place contestants lost in the SEMIS (depth 2), 5th-place
--      contestants lost in the QUARTERS (depth 1).
-- The Nth game in that order awards places (lo + 2N, lo + 2N + 1), where `lo`
-- is the bracket's low bound parsed from "Bracket {lo}-{hi}".
--
-- Verified on EUCF 2025 Open: Mooncatchers 1st, Wall City 2nd, Clapham 3rd,
-- Chevron 4th, BFD LaFotta 5th, Grut 6th, Cotarica 7th, Bad Skid 8th.
-- Across all 2025 events: 128 teams placed, 0 duplicate places, 0 games where
-- the derived 1st-place team wasn't the actual winner of the top final.
--
-- NOTE: the front end (src/components/euf/euf-bracket-tree.tsx) MIRRORS this
-- ordering to label each placement game. Keep the two in sync.
CREATE OR REPLACE FUNCTION derive_euf_placements(p_event_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated integer;
BEGIN
  WITH br AS (
    SELECT gm.event_id, gm.division,
           regexp_replace(gm.round_name, '\s+(Semifinals|Finals)$', '') AS bracket,
           gm.stage,
           gm.home_team_id AS h, gm.away_team_id AS a,
           gm.home_score AS hs, gm.away_score AS a_s,
           CASE WHEN gm.round_name ~ 'Semifinals$' THEN 2
                WHEN gm.round_name ~ 'Finals$'     THEN 3
                ELSE 1 END AS depth
      FROM euf_games gm
     WHERE gm.round_name ~ '^Bracket \d+-\d+'
       AND gm.home_team_id IS NOT NULL AND gm.away_team_id IS NOT NULL
       AND gm.home_score IS NOT NULL AND gm.away_score IS NOT NULL
       AND gm.home_score <> gm.away_score
       AND (p_event_id IS NULL OR gm.event_id = p_event_id)
  ),
  res AS (
    SELECT event_id, division, bracket, depth, stage,
           CASE WHEN hs > a_s THEN h ELSE a END AS w,
           CASE WHEN hs > a_s THEN a ELSE h END AS l
      FROM br
  ),
  prior_wins AS (
    SELECT event_id, division, bracket, w AS tid, count(*)::int AS n
      FROM res WHERE stage <> 'final' GROUP BY 1,2,3,4
  ),
  first_loss AS (
    SELECT event_id, division, bracket, l AS tid, min(depth)::int AS d
      FROM res WHERE stage <> 'final' GROUP BY 1,2,3,4
  ),
  finals AS (
    SELECT b.*,
           COALESCE(pw.n,0) + COALESCE(pa.n,0) AS prior_sum,
           COALESCE(fh.d,9) + COALESCE(fa.d,9) AS loss_sum,
           (regexp_match(b.bracket, '^Bracket (\d+)-'))[1]::int AS lo
      FROM br b
      LEFT JOIN prior_wins pw ON (pw.event_id,pw.division,pw.bracket,pw.tid)=(b.event_id,b.division,b.bracket,b.h)
      LEFT JOIN prior_wins pa ON (pa.event_id,pa.division,pa.bracket,pa.tid)=(b.event_id,b.division,b.bracket,b.a)
      LEFT JOIN first_loss fh ON (fh.event_id,fh.division,fh.bracket,fh.tid)=(b.event_id,b.division,b.bracket,b.h)
      LEFT JOIN first_loss fa ON (fa.event_id,fa.division,fa.bracket,fa.tid)=(b.event_id,b.division,b.bracket,b.a)
     WHERE b.stage = 'final'
  ),
  ranked AS (
    SELECT f.*,
           row_number() OVER (
             PARTITION BY f.event_id, f.division, f.bracket
             ORDER BY f.prior_sum DESC, f.loss_sum DESC, f.h
           ) - 1 AS idx
      FROM finals f
  ),
  places AS (
    SELECT CASE WHEN hs > a_s THEN h ELSE a END AS tid, lo + idx*2     AS place FROM ranked
    UNION ALL
    SELECT CASE WHEN hs > a_s THEN a ELSE h END AS tid, lo + idx*2 + 1 AS place FROM ranked
  ),
  best AS (  -- a team can appear in only one final per bracket; min() is a guard
    SELECT tid, min(place) AS place FROM places GROUP BY tid
  )
  UPDATE euf_teams t
     SET final_placement = b.place, updated_at = now()
    FROM best b
   WHERE t.id = b.tid
     AND t.final_placement IS DISTINCT FROM b.place;

  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN updated;
END;
$$;

-- Writes to euf_teams — service role only, never the browser.
-- MUST revoke from PUBLIC: Postgres grants EXECUTE to PUBLIC by default on
-- CREATE FUNCTION, and every role is implicitly a PUBLIC member, so revoking
-- only from anon/authenticated is a NO-OP (they hold no explicit grant).
REVOKE EXECUTE ON FUNCTION derive_euf_placements(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION derive_euf_placements(uuid) FROM anon, authenticated;

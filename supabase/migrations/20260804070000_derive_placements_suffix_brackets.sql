-- derive_euf_placements: accept BOTH bracket name shapes.
--
-- The fn filtered on round_name ~ '^Bracket \d+-\d+' — the prefix shape the
-- tour stops use. EUCF 2023's Open division writes the range on the OTHER side
-- ("1-16 Bracket Finals", "17-24 Bracket"), so its entire division was invisible
-- to the derivation and euf_teams.final_placement stayed NULL there — which in
-- turn left the front end's bracket trees unlabeled and unsplittable. Same bug
-- class bracketOf() had in TS (fixed 2026-08-04); this is the SQL counterpart.
--
-- Also: depth now distinguishes a bare opening round (1) from an explicit
-- Quarterfinals round (2) — they previously shared depth 1, blurring the
-- first-loss tiebreak in 4-round brackets. Depth is only compared within a
-- bracket, so renumbering is safe.
CREATE OR REPLACE FUNCTION public.derive_euf_placements(p_event_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  updated integer;
BEGIN
  WITH br AS (
    SELECT gm.event_id, gm.division,
           -- Normalize both shapes to one bracket key: strip the round word,
           -- then rewrite "1-16 Bracket" -> "Bracket 1-16".
           regexp_replace(
             regexp_replace(gm.round_name, '\s+(Quarterfinals|Semifinals|Finals)$', ''),
             '^(\d+)-(\d+) Bracket$', 'Bracket \1-\2'
           ) AS bracket,
           gm.stage,
           gm.home_team_id AS h, gm.away_team_id AS a,
           gm.home_score AS hs, gm.away_score AS a_s,
           CASE WHEN gm.round_name ~ 'Quarterfinals$' THEN 2
                WHEN gm.round_name ~ 'Semifinals$'    THEN 3
                WHEN gm.round_name ~ 'Finals$'        THEN 4
                ELSE 1 END AS depth
      FROM euf_games gm
     WHERE (gm.round_name ~ '^Bracket \d+-\d+' OR gm.round_name ~ '^\d+-\d+ Bracket')
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
           -- "Bracket 9-16" -> 9
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
$function$;

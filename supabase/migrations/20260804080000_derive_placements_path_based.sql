-- derive_euf_placements: path-based placement, replacing the win-count ranking.
--
-- The previous fn RANKED a bracket's finals by (prior wins, first-loss depth)
-- and dealt places off the top. That heuristic holds for 8-team brackets but
-- breaks on EUCF 2023's nested 1-16 structure: the 9th-place finalists carry
-- MORE prior wins (R16 loss, then two consolation wins) than the 7th-place
-- finalists (QF loss, consolation semi loss), so the 7/8 and 9/10 pairs came
-- out swapped — and the bracket trees rendered overlapping "5th–10th Place"
-- ranges.
--
-- Placement brackets are deterministic: a finalist's place follows from its
-- win/loss PATH. Start at the bracket's low place with the full span; each
-- round halves the span, and a loss drops the team into the lower half:
--   off += span >> round_position  (on a loss)
-- The final's winner takes lo+off, the loser lo+off+1. Exact for full
-- single-elimination placement brackets of any size; teams with missing
-- early-round rows (byes, unscored forfeits) degrade the same way the old
-- heuristic did.
--
-- Round positions are ranked per bracket (dense_rank over distinct depths),
-- because depth numbers aren't positional: an 8-team bracket's rounds are
-- {bare=1, Semifinals=3, Finals=4} — using raw depth as the exponent would
-- halve the span twice between quarters and semis.
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
           -- Normalize both name shapes to one bracket key: strip the round
           -- word, then rewrite "1-16 Bracket" -> "Bracket 1-16".
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
  -- Positional rank of each pre-final round within its bracket.
  depth_pos AS (
    SELECT event_id, division, bracket, depth,
           dense_rank() OVER (
             PARTITION BY event_id, division, bracket ORDER BY depth
           )::int AS pos
      FROM (SELECT DISTINCT event_id, division, bracket, depth
              FROM br WHERE stage <> 'final') x
  ),
  finals AS (
    SELECT b.*,
           (regexp_match(b.bracket, '^Bracket (\d+)-'))[1]::int AS lo,
           ((regexp_match(b.bracket, '-(\d+)$'))[1]::int
             - (regexp_match(b.bracket, '^Bracket (\d+)-'))[1]::int + 1) AS span
      FROM br b
     WHERE b.stage = 'final'
  ),
  finalists AS (
    SELECT event_id, division, bracket, lo, span, h AS tid, (hs > a_s) AS won_final FROM finals
    UNION ALL
    SELECT event_id, division, bracket, lo, span, a, (a_s > hs) FROM finals
  ),
  path AS (
    SELECT fl.tid, fl.lo, fl.won_final,
           COALESCE(SUM(
             CASE WHEN r.l = fl.tid THEN fl.span >> dp.pos ELSE 0 END
           ), 0)::int AS off
      FROM finalists fl
      LEFT JOIN res r
        ON (r.event_id, r.division, r.bracket) = (fl.event_id, fl.division, fl.bracket)
       AND r.stage <> 'final'
       AND (r.w = fl.tid OR r.l = fl.tid)
      LEFT JOIN depth_pos dp
        ON (dp.event_id, dp.division, dp.bracket, dp.depth)
         = (r.event_id, r.division, r.bracket, r.depth)
     GROUP BY fl.tid, fl.lo, fl.won_final, fl.event_id, fl.division, fl.bracket, fl.span
  ),
  best AS (  -- a team can appear in only one final per bracket; min() is a guard
    SELECT tid, min(lo + off + CASE WHEN won_final THEN 0 ELSE 1 END) AS place
      FROM path GROUP BY tid
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

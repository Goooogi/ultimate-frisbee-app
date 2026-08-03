-- Add final_placement to the standings RPC + order by it when present, so
-- bracket events rank by actual finish rather than raw win count (at EUCF 2025
-- Clapham had a better differential than champion Mooncatchers, and outranked
-- them before this).
DROP FUNCTION IF EXISTS get_euf_standings(text);

CREATE FUNCTION get_euf_standings(p_event_slug text)
RETURNS TABLE (
  team_id uuid, team_name text, division euf_division, country_name text,
  games integer, wins integer, losses integer,
  scores_for integer, scores_against integer, point_diff integer,
  final_placement integer
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  WITH sides AS (
    SELECT g.home_team_id AS tid, g.home_score AS gf, g.away_score AS ga
      FROM euf_games g JOIN euf_events e ON e.id = g.event_id
     WHERE e.slug = p_event_slug AND g.home_team_id IS NOT NULL
    UNION ALL
    SELECT g.away_team_id, g.away_score, g.home_score
      FROM euf_games g JOIN euf_events e ON e.id = g.event_id
     WHERE e.slug = p_event_slug AND g.away_team_id IS NOT NULL
  )
  SELECT
    t.id, t.name, t.division, t.country_name,
    COUNT(s.tid)::int,
    COUNT(*) FILTER (WHERE s.gf > s.ga)::int,
    COUNT(*) FILTER (WHERE s.gf < s.ga)::int,
    COALESCE(SUM(s.gf), 0)::int,
    COALESCE(SUM(s.ga), 0)::int,
    COALESCE(SUM(s.gf - s.ga), 0)::int,
    t.final_placement
  FROM euf_teams t
  LEFT JOIN sides s ON s.tid = t.id
  JOIN euf_events e ON e.id = t.event_id
  WHERE e.slug = p_event_slug
  GROUP BY t.id, t.name, t.division, t.country_name, t.final_placement
  ORDER BY t.division,
           t.final_placement NULLS LAST,
           COUNT(*) FILTER (WHERE s.gf > s.ga) DESC,
           COALESCE(SUM(s.gf - s.ga), 0) DESC,
           t.name;
$$;

GRANT EXECUTE ON FUNCTION get_euf_standings(text) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';

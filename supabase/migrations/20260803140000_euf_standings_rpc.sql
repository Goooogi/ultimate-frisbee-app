-- EUCS publishes no team records or final placements — only raw games. Derive
-- W/L and point differential from euf_games so the front end never has to pull
-- every game to render a standings table.
--
-- Forfeits (euf_game_id IS NULL) still carry a real 0-15 result, so they count.
-- Superseded later the same day by 20260803160000 (adds final_placement); kept
-- here so the migration history replays in order.
CREATE OR REPLACE FUNCTION get_euf_standings(p_event_slug text)
RETURNS TABLE (
  team_id uuid, team_name text, division euf_division, country_name text,
  games integer, wins integer, losses integer,
  scores_for integer, scores_against integer, point_diff integer
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
  SELECT t.id, t.name, t.division, t.country_name,
    COUNT(s.tid)::int,
    COUNT(*) FILTER (WHERE s.gf > s.ga)::int,
    COUNT(*) FILTER (WHERE s.gf < s.ga)::int,
    COALESCE(SUM(s.gf), 0)::int,
    COALESCE(SUM(s.ga), 0)::int,
    COALESCE(SUM(s.gf - s.ga), 0)::int
  FROM euf_teams t
  LEFT JOIN sides s ON s.tid = t.id
  JOIN euf_events e ON e.id = t.event_id
  WHERE e.slug = p_event_slug
  GROUP BY t.id, t.name, t.division, t.country_name
  ORDER BY t.division,
           COUNT(*) FILTER (WHERE s.gf > s.ga) DESC,
           COALESCE(SUM(s.gf - s.ga), 0) DESC,
           t.name;
$$;

GRANT EXECUTE ON FUNCTION get_euf_standings(text) TO anon, authenticated;

-- New functions are invisible to PostgREST until the schema cache reloads.
NOTIFY pgrst, 'reload schema';

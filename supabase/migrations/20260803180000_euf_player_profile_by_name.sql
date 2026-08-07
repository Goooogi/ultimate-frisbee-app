-- One EUF "player" = one NAME.
--
-- EUF player ids are per-event (the same human gets a new id at every event), so
-- there is no stable person key upstream. We merge by normalized name — the
-- simplest rule that gets ~90% of the way there.
--
-- Why this is safe enough HERE (measured 2026-08-03 over 9,691 roster rows /
-- 4,109 distinct names): there are ZERO cases of one name appearing on two
-- different teams within the SAME event, which is the signal you'd expect if two
-- distinct humans shared a name. Names spanning multiple divisions are real
-- people playing both Mixed and single-gender, which is normal in EU club play.
--
-- KNOWN LIMIT: two genuinely different humans with identical names WILL merge
-- into one profile. Accepted deliberately — same trade-off already live for
-- USAU/PUL/WUL. If it needs fixing, that's a real identity layer, not a tweak.
CREATE OR REPLACE FUNCTION get_euf_player_profile(p_name text)
RETURNS TABLE (
  full_name text, event_id uuid, event_name text, event_slug text, year integer,
  team_id uuid, team_name text, division euf_division, country_name text,
  jersey_number text, games integer, goals integer, assists integer, total integer,
  final_placement integer
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT
    r.full_name, ev.id, ev.name, ev.slug, ev.year,
    t.id, t.name, t.division, t.country_name,
    r.jersey_number, r.games, r.goals, r.assists, r.total,
    t.final_placement
  FROM euf_rosters r
  JOIN euf_teams t  ON t.id = r.team_id
  JOIN euf_events ev ON ev.id = t.event_id
  WHERE lower(r.full_name) = lower(p_name)
  ORDER BY ev.year DESC, ev.name, t.name;
$$;

GRANT EXECUTE ON FUNCTION get_euf_player_profile(text) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';

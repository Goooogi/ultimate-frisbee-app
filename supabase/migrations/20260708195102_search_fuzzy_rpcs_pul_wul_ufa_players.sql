-- PUL players: one row per distinct name (most-recent season), team name joined.
CREATE OR REPLACE FUNCTION public.search_pul_players_fuzzy(q text, lim integer DEFAULT 24)
RETURNS TABLE(id uuid, player_name text, team_id text, team_name text, season integer, score real)
LANGUAGE sql STABLE SET search_path TO 'public', 'extensions'
AS $$
  select d.id, d.player_name, d.team_id, d.team_name, d.season, d.score
  from (
    select distinct on (lower(p.player_name))
           p.id, p.player_name, p.team_id, t.name as team_name, p.season,
           greatest(case when p.player_name ilike '%' || q || '%' then 1.0 else 0 end,
                    word_similarity(q, p.player_name))::real as score
    from public.pul_players p
    left join public.pul_teams t on t.id = p.team_id
    where p.player_name ilike '%' || q || '%' or word_similarity(q, p.player_name) >= 0.5
    order by lower(p.player_name), p.season desc, score desc
  ) d
  order by d.score desc, d.player_name
  limit least(coalesce(lim, 24), 50);
$$;

-- WUL players: same shape.
CREATE OR REPLACE FUNCTION public.search_wul_players_fuzzy(q text, lim integer DEFAULT 24)
RETURNS TABLE(id uuid, player_name text, team_id text, team_name text, season integer, score real)
LANGUAGE sql STABLE SET search_path TO 'public', 'extensions'
AS $$
  select d.id, d.player_name, d.team_id, d.team_name, d.season, d.score
  from (
    select distinct on (lower(p.player_name))
           p.id, p.player_name, p.team_id, t.name as team_name, p.season,
           greatest(case when p.player_name ilike '%' || q || '%' then 1.0 else 0 end,
                    word_similarity(q, p.player_name))::real as score
    from public.wul_players p
    left join public.wul_teams t on t.id = p.team_id
    where p.player_name ilike '%' || q || '%' or word_similarity(q, p.player_name) >= 0.5
    order by lower(p.player_name), p.season desc, score desc
  ) d
  order by d.score desc, d.player_name
  limit least(coalesce(lim, 24), 50);
$$;

-- UFA players: ufa_players is already one row per player id.
CREATE OR REPLACE FUNCTION public.search_ufa_players_fuzzy(q text, lim integer DEFAULT 24)
RETURNS TABLE(id text, full_name text, current_team_id text, score real)
LANGUAGE sql STABLE SET search_path TO 'public', 'extensions'
AS $$
  select p.id, p.full_name, p.current_team_id,
         greatest(case when p.full_name ilike '%' || q || '%' then 1.0 else 0 end,
                  word_similarity(q, p.full_name))::real as score
  from public.ufa_players p
  where p.full_name ilike '%' || q || '%' or word_similarity(q, p.full_name) >= 0.5
  order by score desc, p.full_name
  limit least(coalesce(lim, 24), 50);
$$;

GRANT EXECUTE ON FUNCTION public.search_pul_players_fuzzy(text,integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_wul_players_fuzzy(text,integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_ufa_players_fuzzy(text,integer) TO anon, authenticated, service_role;
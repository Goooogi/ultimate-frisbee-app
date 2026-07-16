
-- Fix: dedupe by name FIRST, then rank by score + limit (the DISTINCT ON order
-- can't also be the score order, so wrap it).
create or replace function public.search_wfdf_players_fuzzy(q text, lim int default 24)
returns table (full_name text, team_id uuid, team_name text, country_code text, event_name text, score real)
language sql stable
as $$
  select d.full_name, d.team_id, d.team_name, d.country_code, d.event_name, d.score
  from (
    select distinct on (lower(r.full_name))
           r.full_name, r.team_id, t.name as team_name, t.country_code, ev.name as event_name,
           greatest(
             case when r.full_name ilike '%' || q || '%' then 1.0 else 0 end,
             word_similarity(q, r.full_name)
           )::real as score
    from public.wfdf_rosters r
    join public.wfdf_teams t on t.id = r.team_id
    join public.wfdf_events ev on ev.id = t.event_id
    where r.full_name ilike '%' || q || '%' or word_similarity(q, r.full_name) >= 0.5
    -- keep the highest-scoring appearance per distinct name (most recent event wins ties)
    order by lower(r.full_name), score desc, ev.year desc
  ) d
  order by d.score desc, d.full_name
  limit lim;
$$;

notify pgrst, 'reload schema';

-- Applied via MCP 2026-07-23.
-- Prioritize FIRST-NAME matches in player search.
--
-- Before: score = greatest(ilike '%q%' ? 1.0 : 0, word_similarity). Typing
-- "hunter" scored "Hunter Smith" (first name) and "John Hunter" (last name)
-- IDENTICALLY at 1.0, so the tiebreak (alphabetical) let last-name Hunters
-- outrank first-name Hunters.
--
-- After: a tiered rank via name_search_rank(q, name) —
--   4.0  whole name starts with q  ("hunter" -> "Hunter Smith")  [first name]
--   3.0  any word starts with q    ("hunter" -> "John Hunter")   [surname/middle prefix]
--   1.0  substring anywhere        ("hunter" -> "Ghunterson")
--   <1.0 trigram-only fuzzy        (typos / reordering)
-- Ties within a tier fall back to name length (shorter = closer) then alpha,
-- so exact "Hunter" beats "Hunterrr". One shared helper keeps all five league
-- RPCs in lockstep.

create or replace function public.name_search_rank(q text, name text)
returns real
language sql
immutable
set search_path to 'public','extensions'
as $$
  select greatest(
    case
      when name ilike q || '%'                    then 4.0   -- first name prefix
      when name ~* ('\m' || regexp_replace(q, '([^\w])', '\\\1', 'g')) then 3.0  -- any word prefix
      when name ilike '%' || q || '%'             then 1.0   -- substring
      else 0
    end,
    word_similarity(q, name)                                  -- fuzzy floor
  )::real;
$$;

create or replace function public.search_usau_players_fuzzy(q text, lim integer default 24)
 returns table(id uuid, display_name text, score real)
 language sql stable set search_path to 'public','extensions'
as $function$
  select p.id, p.display_name, public.name_search_rank(q, p.display_name) as score
  from public.usau_players p
  where p.display_name ilike '%' || q || '%' or word_similarity(q, p.display_name) >= 0.5
  order by score desc, length(p.display_name), p.display_name
  limit least(coalesce(lim, 24), 50);
$function$;

create or replace function public.search_ufa_players_fuzzy(q text, lim integer default 24)
 returns table(id text, full_name text, current_team_id text, score real)
 language sql stable set search_path to 'public','extensions'
as $function$
  select p.id, p.full_name, p.current_team_id, public.name_search_rank(q, p.full_name) as score
  from public.ufa_players p
  where p.full_name ilike '%' || q || '%' or word_similarity(q, p.full_name) >= 0.5
  order by score desc, length(p.full_name), p.full_name
  limit least(coalesce(lim, 24), 50);
$function$;

create or replace function public.search_pul_players_fuzzy(q text, lim integer default 24)
 returns table(id uuid, player_name text, team_id text, team_name text, season integer, score real)
 language sql stable set search_path to 'public','extensions'
as $function$
  select d.id, d.player_name, d.team_id, d.team_name, d.season, d.score
  from (
    select distinct on (lower(p.player_name))
           p.id, p.player_name, p.team_id, t.name as team_name, p.season,
           public.name_search_rank(q, p.player_name) as score
    from public.pul_players p
    left join public.pul_teams t on t.id = p.team_id
    where p.player_name ilike '%' || q || '%' or word_similarity(q, p.player_name) >= 0.5
    order by lower(p.player_name), p.season desc, score desc
  ) d
  order by d.score desc, length(d.player_name), d.player_name
  limit least(coalesce(lim, 24), 50);
$function$;

create or replace function public.search_wul_players_fuzzy(q text, lim integer default 24)
 returns table(id uuid, player_name text, team_id text, team_name text, season integer, score real)
 language sql stable set search_path to 'public','extensions'
as $function$
  select d.id, d.player_name, d.team_id, d.team_name, d.season, d.score
  from (
    select distinct on (lower(p.player_name))
           p.id, p.player_name, p.team_id, t.name as team_name, p.season,
           public.name_search_rank(q, p.player_name) as score
    from public.wul_players p
    left join public.wul_teams t on t.id = p.team_id
    where p.player_name ilike '%' || q || '%' or word_similarity(q, p.player_name) >= 0.5
    order by lower(p.player_name), p.season desc, score desc
  ) d
  order by d.score desc, length(d.player_name), d.player_name
  limit least(coalesce(lim, 24), 50);
$function$;

create or replace function public.search_wfdf_players_fuzzy(q text, lim integer default 24)
 returns table(full_name text, team_id uuid, team_name text, country_code text, event_name text, score real)
 language sql stable set search_path to 'public','extensions'
as $function$
  select d.full_name, d.team_id, d.team_name, d.country_code, d.event_name, d.score
  from (
    select distinct on (lower(r.full_name))
           r.full_name, r.team_id, t.name as team_name, t.country_code, ev.name as event_name,
           public.name_search_rank(q, r.full_name) as score
    from public.wfdf_rosters r
    join public.wfdf_teams t on t.id = r.team_id
    join public.wfdf_events ev on ev.id = t.event_id
    where r.full_name ilike '%' || q || '%' or word_similarity(q, r.full_name) >= 0.5
    order by lower(r.full_name), score desc, ev.year desc
  ) d
  order by d.score desc, length(d.full_name), d.full_name
  limit least(coalesce(lim, 24), 50);
$function$;

notify pgrst, 'reload schema';

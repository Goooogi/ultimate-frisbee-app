-- Applied via MCP 2026-07-22.
-- get_player_connections: the on-profile "Connections" section. Given a player
-- name, return second-hop players (teammates of your teammates) you have NOT
-- directly played with, ranked by bridge strength (how many of your teammates
-- connect to them) with a notability (twelve_oh rating) tiebreak; one "via"
-- example teammate each.
--
-- PERF: caps the direct-teammate set to the top 40 strongest bonds (by weight)
-- and each teammate's onward edges to their top 40 before the 2-hop expansion,
-- so a very dense player (~400 teammates) still runs in ~27ms instead of ~770ms.
-- The strongest bonds give the best suggestions anyway.
create or replace function public.get_player_connections(p_name text, p_limit int default 5)
returns table(
  name text, display_name text, leagues text[], score numeric,
  bridge_count int, via_display text
)
language sql
stable
set search_path to 'public'
as $function$
  with me as (select public.normalize_player_name(p_name) as n),
  direct_all as (
    select case when e.name_a = m.n then e.name_b else e.name_a end as t, e.weight
    from public.player_edges e, me m
    where e.name_a = m.n or e.name_b = m.n
  ),
  direct as (select t from direct_all order by weight desc limit 40),
  second as (
    select cand, via from (
      select case when e.name_a = d.t then e.name_b else e.name_a end as cand,
             d.t as via,
             row_number() over (partition by d.t order by e.weight desc) as rn
      from direct d
      join public.player_edges e on (e.name_a = d.t or e.name_b = d.t)
    ) z where rn <= 40
  ),
  filtered as (
    select s.cand, s.via from second s, me m
    where s.cand <> m.n and s.cand not in (select t from direct)
  ),
  ranked as (
    select f.cand, count(distinct f.via) as bridge_count,
           (array_agg(f.via order by f.via))[1] as via_name
    from filtered f group by f.cand
  )
  select r.cand, pn.display_name, pn.leagues, pn.ufa_career_score,
         r.bridge_count::int, vn.display_name
  from ranked r
  join public.player_nodes pn on pn.name = r.cand
  left join public.player_nodes vn on vn.name = r.via_name
  order by r.bridge_count desc, coalesce(pn.ufa_career_score, 0) desc, pn.teammate_count desc
  limit p_limit
$function$;

notify pgrst, 'reload schema';

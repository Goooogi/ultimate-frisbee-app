-- Applied via MCP 2026-07-23.
-- CLEVER connections: someone you've NEVER played with, reachable through a
-- shared teammate A, where you-A and A-B were teammates on DIFFERENT team-seasons
-- (no overlapping context). This filters out "we were all on the same roster last
-- year" — that isn't a discovery. bridge_count counts only cross-context bridges.
-- Requires player_edges.ctx (see 20260723140000).
create or replace function public.get_player_connections(p_name text, p_limit integer default 5)
 returns table(name text, display_name text, leagues text[], score numeric, bridge_count integer, via_display text)
 language sql
 stable
 set search_path to 'public'
as $function$
  with me as (select public.normalize_player_name(p_name) as n),
  -- my direct teammates, with the exact team-seasons I shared with each (my_ctx)
  direct_all as (
    select case when e.name_a = m.n then e.name_b else e.name_a end as t,
           e.weight, e.ctx as my_ctx
    from public.player_edges e, me m
    where e.name_a = m.n or e.name_b = m.n
  ),
  -- the SET of everyone I've directly played with — used to exclude them entirely
  my_teammates as (select t from direct_all),
  -- keep the top 60 teammates by bond for the second hop (perf cap)
  direct as (select t, my_ctx from direct_all order by weight desc limit 60),
  -- second hop: A's teammates B, capped to A's top 60, carrying A-B's contexts
  second as (
    select cand, via, my_ctx, ab_ctx from (
      select case when e.name_a = d.t then e.name_b else e.name_a end as cand,
             d.t as via, d.my_ctx, e.ctx as ab_ctx,
             row_number() over (partition by d.t order by e.weight desc) as rn
      from direct d
      join public.player_edges e on (e.name_a = d.t or e.name_b = d.t)
    ) z where rn <= 60
  ),
  -- a bridge counts only if: B isn't me, I've NEVER played with B, and the
  -- you-A context and A-B context DON'T overlap (cross-team / cross-season).
  bridges as (
    select s.cand, s.via
    from second s, me m
    where s.cand <> m.n
      and s.cand not in (select t from my_teammates)
      and not (s.my_ctx && s.ab_ctx)          -- no shared team-season on the bridge
  ),
  ranked as (
    select b.cand, count(distinct b.via) as bridge_count,
           (array_agg(b.via order by b.via))[1] as via_name
    from bridges b group by b.cand
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

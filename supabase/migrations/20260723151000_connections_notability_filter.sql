-- Applied via MCP 2026-07-23.
-- Connections, curated. A cross-context bridge alone is no longer enough — a
-- candidate must ALSO be notable in one of the ways Hunter actually cares about:
--   pro       — mid-high pro (twelve_oh score >= 78 on the 50-99 scale, UFA/PUL/WUL)
--   nationals — attended USAU Club Nationals (player_nodes.nationals_seasons)
--   alumni    — played for one of the anchor's programs in a DIFFERENT era
--               (teams overlap; same team-season would make them direct teammates)
--   mutual    — reached through >= 2 distinct shared teammates
-- Ranked: most reasons first, then score, then bridge strength.
--
-- The Thread additionally prunes ring 1: a teammate renders only if they bridge
-- to at least one surviving connection (secondary) OR share history with another
-- ring-1 teammate (mutual). Dead-end teammates — "played together once, leads
-- nowhere" — no longer clutter the web.
-- Requires player_nodes.teams + nationals_seasons (20260723150000).

drop function if exists public.get_player_connections(text, integer);
-- stale 2-arg overload from 20260723090000 — made get_player_thread('x') ambiguous
drop function if exists public.get_player_thread(text, integer);
create function public.get_player_connections(p_name text, p_limit integer default 5)
 returns table(name text, display_name text, leagues text[], score numeric,
               bridge_count integer, via_display text,
               is_pro boolean, is_nationals boolean, is_alumni boolean)
 language sql
 stable
 set search_path to 'public'
as $function$
  with me as (select public.normalize_player_name(p_name) as n),
  anchor as (select pn.teams from public.player_nodes pn where pn.name = (select n from me)),
  -- my direct teammates, with the exact team-seasons I shared with each (my_ctx)
  direct_all as (
    select case when e.name_a = (select n from me) then e.name_b else e.name_a end as t,
           e.weight, e.ctx as my_ctx
    from public.player_edges e
    where e.name_a = (select n from me) or e.name_b = (select n from me)
  ),
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
    from second s
    where s.cand <> (select n from me)
      and s.cand not in (select t from my_teammates)
      and not (s.my_ctx && s.ab_ctx)
  ),
  ranked as (
    select b.cand, count(distinct b.via) as bridge_count,
           (array_agg(b.via order by b.via))[1] as via_name
    from bridges b group by b.cand
  ),
  qualified as (
    select r.cand, r.bridge_count, r.via_name,
           pn.display_name, pn.leagues, pn.ufa_career_score as score,
           (coalesce(pn.ufa_career_score, 0) >= 78 and pn.leagues && array['ufa','pul','wul']) as is_pro,
           coalesce(array_length(pn.nationals_seasons, 1), 0) > 0 as is_nationals,
           coalesce(pn.teams && (select teams from anchor), false) as is_alumni
    from ranked r join public.player_nodes pn on pn.name = r.cand
  )
  select q.cand, q.display_name, q.leagues, q.score, q.bridge_count::int,
         vn.display_name, q.is_pro, q.is_nationals, q.is_alumni
  from qualified q
  left join public.player_nodes vn on vn.name = q.via_name
  where q.is_pro or q.is_nationals or q.is_alumni or q.bridge_count >= 2
  order by (q.is_pro::int + q.is_nationals::int + q.is_alumni::int + (q.bridge_count >= 2)::int) desc,
           coalesce(q.score, 0) desc, q.bridge_count desc
  limit least(greatest(coalesce(p_limit, 5), 1), 20)
$function$;

create or replace function public.get_player_thread(p_name text, p_teammates int default 12, p_conns int default 40)
returns jsonb
language sql
stable
set search_path to 'public'
as $function$
  with me as materialized (select public.normalize_player_name(p_name) as n),
  anchor_teams as materialized (
    select pn.teams from public.player_nodes pn where pn.name = (select n from me)
  ),
  my_all as materialized (
    select case when e.name_a=(select n from me) then e.name_b else e.name_a end as t,
           e.weight, e.ctx as my_ctx
    from public.player_edges e
    where e.name_a=(select n from me) or e.name_b=(select n from me)
  ),
  my_set as materialized (select t from my_all),
  -- oversized ring-1 pool: the keep-rule below prunes dead-ends, so start from
  -- 3x the render budget and cap back down after filtering.
  pool as materialized (
    select t, weight, my_ctx from my_all order by weight desc
    limit least(greatest(coalesce(p_teammates, 12), 1), 24) * 3
  ),
  -- every cross-context bridge out of the pool (candidate never played with me)
  xctx as materialized (
    select cand, via, bridge_w from (
      select case when e.name_a=p.t then e.name_b else e.name_a end as cand,
             p.t as via, e.weight as bridge_w, e.ctx as ab_ctx, p.my_ctx,
             row_number() over (partition by p.t order by e.weight desc) as rn
      from pool p join public.player_edges e on (e.name_a=p.t or e.name_b=p.t)
    ) z
    where rn <= 60
      and cand <> (select n from me)
      and cand not in (select t from my_set)
      and not (my_ctx && ab_ctx)
  ),
  -- notability gate: pro / nationals / alumni / multiple mutual teammates
  qual as materialized (
    select a.cand, a.mutuals, pn.ufa_career_score as sc,
           (coalesce(pn.ufa_career_score, 0) >= 78 and pn.leagues && array['ufa','pul','wul']) as is_pro,
           coalesce(array_length(pn.nationals_seasons, 1), 0) > 0 as is_nat,
           coalesce(pn.teams && (select teams from anchor_teams), false) as is_alum
    from (select cand, count(distinct via) as mutuals from xctx group by cand) a
    join public.player_nodes pn on pn.name = a.cand
    where (coalesce(pn.ufa_career_score, 0) >= 78 and pn.leagues && array['ufa','pul','wul'])
       or coalesce(array_length(pn.nationals_seasons, 1), 0) > 0
       or coalesce(pn.teams && (select teams from anchor_teams), false)
       or a.mutuals >= 2
  ),
  -- ring-1 keep rule: bridges a surviving connection OR shares history with
  -- another pool teammate. Then cap to the render budget.
  tt as materialized (
    select p.t, p.weight from pool p
    where exists (select 1 from xctx x join qual q on q.cand = x.cand where x.via = p.t)
       or exists (select 1 from public.player_edges e, pool p2
                  where p2.t <> p.t
                    and ((e.name_a = p.t and e.name_b = p2.t) or (e.name_b = p.t and e.name_a = p2.t)))
    order by p.weight desc limit least(greatest(coalesce(p_teammates, 12), 1), 24)
  ),
  -- one node per surviving connection, bridged through its strongest KEPT teammate
  hops as materialized (
    select distinct on (x.cand)
           x.cand, x.via, x.bridge_w, q.sc, q.is_pro, q.is_nat, q.is_alum, q.mutuals
    from xctx x
    join qual q on q.cand = x.cand
    join tt on tt.t = x.via
    order by x.cand, x.bridge_w desc
  ),
  hops_top as materialized (
    select * from hops
    order by (is_pro::int + is_nat::int + is_alum::int + (mutuals >= 2)::int) desc,
             sc desc nulls last, bridge_w desc
    limit least(greatest(coalesce(p_conns, 40), 1), 80)
  ),
  anchor_node as (
    select jsonb_build_object('id', pn.name, 'label', pn.display_name, 'kind','anchor',
      'score', pn.ufa_career_score, 'leagues', pn.leagues) as j
    from public.player_nodes pn where pn.name = (select n from me)
  ),
  tt_nodes as (
    select coalesce(jsonb_agg(jsonb_build_object('id', pn.name, 'label', pn.display_name,
      'kind','teammate', 'score', pn.ufa_career_score, 'leagues', pn.leagues, 'weight', tt.weight)),'[]'::jsonb) as arr
    from tt join public.player_nodes pn on pn.name = tt.t
  ),
  conn_nodes as (
    select coalesce(jsonb_agg(jsonb_build_object('id',h.cand,'label',pn.display_name,
      'kind', case when h.sc >= 85 then 'elite' else 'connection' end,
      'score',h.sc,'leagues',pn.leagues,'via',h.via,'mutuals',h.mutuals,
      'reasons', to_jsonb(array_remove(array[
        case when h.is_pro then 'pro' end,
        case when h.is_nat then 'nationals' end,
        case when h.is_alum then 'alumni' end,
        case when h.mutuals >= 2 then 'mutual' end], null)))),'[]'::jsonb) as arr
    from hops_top h join public.player_nodes pn on pn.name=h.cand
  ),
  anchor_edges as (
    select coalesce(jsonb_agg(jsonb_build_object('a',(select n from me),'b',tt.t,'weight',tt.weight,
      'kind','direct','last_season',null::int)),'[]'::jsonb) as arr from tt
  ),
  inner_edges as (
    select coalesce(jsonb_agg(jsonb_build_object('a',e.name_a,'b',e.name_b,'weight',e.weight,
      'kind','shared','last_season',e.last_season)),'[]'::jsonb) as arr
    from public.player_edges e join tt x on x.t=e.name_a join tt y on y.t=e.name_b
  ),
  bridge_edges as (
    select coalesce(jsonb_agg(jsonb_build_object('a',h.via,'b',h.cand,'weight',h.bridge_w,
      'kind', case when h.sc >= 85 then 'elite' else 'bridge' end)),'[]'::jsonb) as arr
    from hops_top h
  )
  select jsonb_build_object(
    'anchor',(select j from anchor_node),
    'nodes',(select arr from tt_nodes)||(select arr from conn_nodes),
    'edges',(select arr from anchor_edges)||(select arr from inner_edges)||(select arr from bridge_edges)
  )
$function$;

notify pgrst, 'reload schema';

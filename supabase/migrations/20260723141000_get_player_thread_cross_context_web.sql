-- Applied via MCP 2026-07-23.
-- The Thread graph, reworked around REAL discovery:
--   • anchor (center)
--   • ring 1: the anchor's top teammates (direct bonds)
--   • ring 2: "connections" — people the anchor has NEVER played with, reached
--     through a teammate on a DIFFERENT team-season (cross-context bridge). These
--     are the interesting far-out nodes. Elite (twelve_oh >= 85) ones are flagged
--     so the UI can gold-ring them; non-elite connections are included too so the
--     web is dense enough to explore.
-- Edges: anchor->teammate (direct), teammate<->teammate (shared), teammate->
-- connection (bridge, or elite if notable). Requires player_edges.ctx.
--
-- p_teammates ring-1 fanout, p_conns ring-2 fanout. Materialized CTEs + per-hop
-- caps keep it ~15ms even for a 400-teammate anchor.
create or replace function public.get_player_thread(p_name text, p_teammates int default 12, p_conns int default 40)
returns jsonb
language sql
stable
set search_path to 'public'
as $function$
  with me as materialized (select public.normalize_player_name(p_name) as n),
  my_all as materialized (
    select case when e.name_a=(select n from me) then e.name_b else e.name_a end as t,
           e.weight, e.ctx as my_ctx
    from public.player_edges e
    where e.name_a=(select n from me) or e.name_b=(select n from me)
  ),
  my_set as materialized (select t from my_all),
  tt as materialized (
    select t, weight, my_ctx from my_all order by weight desc limit p_teammates
  ),
  hops as materialized (
    select cand, via, bridge_w, sc from (
      select cand, via, bridge_w, sc,
             row_number() over (partition by cand order by bridge_w desc) as rn2
      from (
        select case when e.name_a=tt.t then e.name_b else e.name_a end as cand,
               tt.t as via, e.weight as bridge_w, e.ctx as ab_ctx, tt.my_ctx,
               row_number() over (partition by tt.t order by e.weight desc) as rn
        from tt join public.player_edges e on (e.name_a=tt.t or e.name_b=tt.t)
      ) top
      join public.player_nodes pn on pn.name = top.cand
      cross join lateral (select pn.ufa_career_score as sc) s
      where top.rn <= 40
        and top.cand <> (select n from me)
        and top.cand not in (select t from my_set)     -- never played with me
        and not (top.my_ctx && top.ab_ctx)             -- cross-context bridge only
    ) z where rn2 = 1
    order by sc desc nulls last, bridge_w desc
    limit p_conns
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
      'score',h.sc,'leagues',pn.leagues,'via',h.via)),'[]'::jsonb) as arr
    from hops h join public.player_nodes pn on pn.name=h.cand
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
    from hops h
  )
  select jsonb_build_object(
    'anchor',(select j from anchor_node),
    'nodes',(select arr from tt_nodes)||(select arr from conn_nodes),
    'edges',(select arr from anchor_edges)||(select arr from inner_edges)||(select arr from bridge_edges)
  )
$function$;

notify pgrst, 'reload schema';

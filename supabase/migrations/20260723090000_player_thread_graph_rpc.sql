-- Applied via MCP 2026-07-23.
-- get_player_thread: the graph behind "The Thread" page. Returns a small,
-- render-ready web centered on the anchor as one jsonb blob { anchor, nodes,
-- edges }:
--   • anchor's top direct teammates (by bond weight),
--   • edges AMONG those teammates (shared-history clusters — lens: shared past),
--   • notable second-hop players (twelve_oh rating >= 88) with the bridging
--     teammate (lens: path to elite / stars in your web).
-- Materialized CTEs + a top-30 onward-edge cap keep even a very dense anchor
-- (~400 teammates) under ~400ms — fine for a one-shot page load.
create or replace function public.get_player_thread(p_name text, p_teammates int default 8)
returns jsonb
language sql
stable
set search_path to 'public'
as $function$
  with me as materialized (select public.normalize_player_name(p_name) as n),
  tt as materialized (
    select case when e.name_a = (select n from me) then e.name_b else e.name_a end as t,
           e.weight, e.last_season
    from public.player_edges e
    where e.name_a = (select n from me) or e.name_b = (select n from me)
    order by e.weight desc
    limit p_teammates
  ),
  elite_hops as materialized (
    select cand, via, sc, w from (
      select cand, via, sc, w,
             row_number() over (partition by cand order by w desc) as rn2
      from (
        select case when e.name_a=tt.t then e.name_b else e.name_a end as cand,
               tt.t as via, e.weight as w,
               row_number() over (partition by tt.t order by e.weight desc) as rn
        from tt join public.player_edges e on (e.name_a=tt.t or e.name_b=tt.t)
      ) top
      join public.player_nodes pn on pn.name = top.cand
      cross join lateral (select pn.ufa_career_score as sc) s
      where top.rn <= 30 and pn.ufa_career_score >= 88
        and top.cand <> (select n from me)
        and top.cand not in (select t from tt)
    ) z where rn2=1 order by sc desc, w desc limit 8
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
  anchor_edges as (
    select coalesce(jsonb_agg(jsonb_build_object('a',(select n from me),'b',tt.t,'weight',tt.weight,
      'kind','direct','last_season',tt.last_season)),'[]'::jsonb) as arr from tt
  ),
  inner_edges as (
    select coalesce(jsonb_agg(jsonb_build_object('a',e.name_a,'b',e.name_b,'weight',e.weight,
      'kind','shared','last_season',e.last_season)),'[]'::jsonb) as arr
    from public.player_edges e join tt x on x.t=e.name_a join tt y on y.t=e.name_b
  ),
  elite_nodes as (
    select coalesce(jsonb_agg(jsonb_build_object('id',h.cand,'label',pn.display_name,'kind','elite',
      'score',h.sc,'leagues',pn.leagues,'via',h.via)),'[]'::jsonb) as arr
    from elite_hops h join public.player_nodes pn on pn.name=h.cand
  ),
  elite_edges as (
    select coalesce(jsonb_agg(jsonb_build_object('a',h.via,'b',h.cand,'weight',h.w,'kind','elite')),'[]'::jsonb) as arr
    from elite_hops h
  )
  select jsonb_build_object(
    'anchor',(select j from anchor_node),
    'nodes',(select arr from tt_nodes)||(select arr from elite_nodes),
    'edges',(select arr from anchor_edges)||(select arr from inner_edges)||(select arr from elite_edges)
  )
$function$;

notify pgrst, 'reload schema';

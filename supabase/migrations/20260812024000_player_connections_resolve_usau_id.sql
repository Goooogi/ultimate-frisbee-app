-- Batch the connection href resolution into get_player_connections.
--
-- Before: the web caller ran this RPC, then fired find_usau_player_by_name once
-- per returned row. That 5:1 amplification made find_usau_player_by_name the
-- single largest consumer on the instance: 267k calls / 10.2 CPU-hours in a 12h
-- window = 69% of all DB time.
--
-- The per-call query is NOT slow (234 buffers, min 1ms, ~17ms avg measured
-- in-DB). The 137ms MEAN with a 297ms stddev and a 2999ms max (pinned to anon's
-- 3s statement_timeout) is queueing on a saturated 2-core instance. So the fix
-- is cutting the NUMBER of concurrent round-trips, not the cost of each one.
-- Measured end-to-end over PostgREST: 6 requests / ~1.05s -> 1 request / ~0.22s.
--
-- Adding a column requires DROP+CREATE (a return type cannot be changed in
-- place). Both run in this one transaction, so no request ever observes the
-- function as missing. The column is APPENDED, so mobile's existing 9-column
-- select is unaffected.
--
-- Body otherwise captured verbatim via pg_get_functiondef(), per the shared-RPC
-- divergence rule: the committed repo text for shared functions is NOT
-- authoritative -- mobile ships changes to this DB with no git signal here.
drop function if exists public.get_player_connections(text, integer);

CREATE FUNCTION public.get_player_connections(p_name text, p_limit integer DEFAULT 5)
 RETURNS TABLE(name text, display_name text, leagues text[], score numeric, bridge_count integer, via_display text, is_pro boolean, is_nationals boolean, is_alumni boolean, usau_id uuid)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with me as (select public.normalize_player_name(p_name) as n),
  anchor as (select pn.teams from public.player_nodes pn where pn.name = (select n from me)),
  direct_all as (
    select case when e.name_a = (select n from me) then e.name_b else e.name_a end as t,
           e.weight, e.ctx as my_ctx
    from public.player_edges e
    where e.name_a = (select n from me) or e.name_b = (select n from me)
  ),
  my_teammates as (select t from direct_all),
  direct as (select t, my_ctx from direct_all order by weight desc limit 60),
  second as (
    select cand, via, my_ctx, ab_ctx from (
      select case when e.name_a = d.t then e.name_b else e.name_a end as cand,
             d.t as via, d.my_ctx, e.ctx as ab_ctx,
             row_number() over (partition by d.t order by e.weight desc) as rn
      from direct d
      join public.player_edges e on (e.name_a = d.t or e.name_b = d.t)
    ) z where rn <= 60
  ),
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
  ),
  final as (
    select q.cand, q.display_name, q.leagues, q.score, q.bridge_count::int as bridge_count,
           vn.display_name as via_display, q.is_pro, q.is_nationals, q.is_alumni,
           (q.is_pro::int + q.is_nationals::int + q.is_alumni::int + (q.bridge_count >= 2)::int) as rank_reasons
    from qualified q
    left join public.player_nodes vn on vn.name = q.via_name
    where q.is_pro or q.is_nationals or q.is_alumni or q.bridge_count >= 2
    order by rank_reasons desc, coalesce(q.score, 0) desc, q.bridge_count desc
    limit least(greatest(coalesce(p_limit, 5), 1), 20)
  )
  -- Resolve AFTER the limit so this is <=20 lookups, never one per candidate.
  select f.cand, f.display_name, f.leagues, f.score, f.bridge_count, f.via_display,
         f.is_pro, f.is_nationals, f.is_alumni,
         public.find_usau_player_by_name(f.display_name) as usau_id
  from final f
  order by f.rank_reasons desc, coalesce(f.score, 0) desc, f.bridge_count desc
$function$;

grant execute on function public.get_player_connections(text, integer) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

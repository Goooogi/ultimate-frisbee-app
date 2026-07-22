-- Applied via MCP 2026-07-22.
-- Pack store rebalance: raise prices, add Silver, rename Elite -> Platinum.
-- Ladder = Bronze 500 / Silver 1200 / Gold 2500 / Platinum 5000.
-- guarantee_rank: contributor=3, solidPro=4, star=5 (aligned with TS packs.ts
-- guarantees — the old config had free/bronze at rank 2, a mismatch vs TS).
-- TS mirror: src/lib/utcg/packs.ts PACKS + STORE_ORDER + PackKind.
-- NOTE: 'elite' is dropped as a pack kind; any historical utcg_pack_openings
-- rows with pack_kind='elite' are untouched (that column is free text).
create or replace function public.utcg_pack_config(p_kind text)
returns table(size integer, price integer, guarantee_rank integer,
  w_greatest numeric, w_elite numeric, w_star numeric, w_solidpro numeric,
  w_contributor numeric, w_leagueavg numeric, w_fringe numeric)
language sql
immutable
set search_path to 'public'
as $function$
  select t.size, t.price, t.guarantee_rank,
         t.w_greatest, t.w_elite, t.w_star, t.w_solidpro,
         t.w_contributor, t.w_leagueavg, t.w_fringe
  from (values
    ('free',     7, 0,    3, 0.2,  1.0,  4.0,  6.0, 16.0, 30.0, 42.8),
    ('bronze',   7, 500,  3, 0.2,  1.0,  4.0,  6.0, 18.0, 34.0, 36.8),
    ('silver',   7, 1200, 4, 0.35, 2.0,  7.0, 10.0, 24.0, 32.0, 24.65),
    ('gold',     7, 2500, 4, 0.6,  4.0, 12.0, 15.0, 26.0, 26.0, 16.4),
    ('platinum', 7, 5000, 5, 1.8, 10.0, 26.0, 20.0, 24.0, 12.0,  6.2)
  ) as t(kind, size, price, guarantee_rank,
         w_greatest, w_elite, w_star, w_solidpro, w_contributor, w_leagueavg, w_fringe)
  where t.kind = p_kind;
$function$;

notify pgrst, 'reload schema';

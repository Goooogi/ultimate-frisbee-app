-- Applied via MCP 2026-07-22.
-- rebuild_player_edges(): repopulate player_edges + player_nodes from every
-- league's co-appearance data, keyed by normalized name. Re-runnable (truncates
-- first). ~2.6M raw pairs aggregate into ~1.58M weighted edges / ~57.8k nodes.
-- Run manually after new roster/game data lands (no cron per project policy).
create or replace function public.rebuild_player_edges()
returns table(nodes int, edges int)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare n_nodes int; n_edges int;
begin
  drop table if exists tmp_appear;
  create temp table tmp_appear on commit drop as
    select 'usau:'||r.team_id||':'||r.season as gkey,
           public.normalize_player_name(p.display_name) as name,
           'usau'::text as league, r.season as season, p.display_name as raw_name
      from usau_rosters r join usau_players p on p.id = r.player_id
     where p.display_name is not null
    union all
    select 'ufa:'||s.game_id||':'||s.team_id,
           public.normalize_player_name(p.full_name), 'ufa', g.year, p.full_name
      from ufa_game_player_stats s
      join ufa_players p on p.id = s.player_id
      join ufa_games g on g.id = s.game_id
     where p.full_name is not null
    union all
    select 'pul:'||s.game_id||':'||s.team_id,
           public.normalize_player_name(s.player_name), 'pul', gg.season, s.player_name
      from pul_game_player_stats s join pul_games gg on gg.id = s.game_id
     where s.player_name is not null
    union all
    select 'wul:'||s.game_id||':'||s.team_id,
           public.normalize_player_name(s.player_name), 'wul', wg.season, s.player_name
      from wul_game_player_stats s join wul_games wg on wg.id = s.game_id
     where s.player_name is not null;

  delete from tmp_appear where name is null;

  drop table if exists tmp_ga;
  create temp table tmp_ga on commit drop as
    select distinct gkey, name, league, season from tmp_appear;
  create index on tmp_ga (gkey);

  truncate public.player_nodes;
  insert into public.player_nodes (name, display_name, leagues, last_season)
  select a.name, (array_agg(a.raw_name order by a.raw_name))[1],
         array_agg(distinct a.league), max(a.season)
    from tmp_appear a group by a.name;

  truncate public.player_edges;
  insert into public.player_edges (name_a, name_b, weight, leagues, last_season)
  select least(x.name, y.name), greatest(x.name, y.name),
         count(*), array_agg(distinct x.league), max(greatest(x.season, y.season))
    from tmp_ga x join tmp_ga y on y.gkey = x.gkey and x.name < y.name
   group by least(x.name, y.name), greatest(x.name, y.name);

  update public.player_nodes pn set teammate_count = d.deg
    from (select name, count(*) deg from (
            select name_a as name from public.player_edges
            union all select name_b from public.player_edges) z group by name) d
   where d.name = pn.name;

  -- notability: best twelve_oh rating per normalized name (the "elite" signal
  -- for the Path-to-elite / Champions lenses).
  update public.player_nodes pn set ufa_career_score = t.best
    from (select public.normalize_player_name(p.name) as name, max(p.player_score::numeric) as best
            from twelve_oh_players p where p.name is not null
           group by public.normalize_player_name(p.name)) t
   where t.name = pn.name;

  select count(*) into n_nodes from public.player_nodes;
  select count(*) into n_edges from public.player_edges;
  return query select n_nodes, n_edges;
end $function$;

revoke execute on function public.rebuild_player_edges() from public, anon, authenticated;

-- Applied via MCP 2026-07-23.
-- Notability inputs for the Connections filter (see 20260723151000):
--   player_nodes.teams             — season-stripped team keys ('league:team_id')
--                                    the player ever appeared for. Anchor∩candidate
--                                    overlap = "program alumni" (same team, different
--                                    era — same team-SEASON would make them direct
--                                    teammates, which connections exclude).
--   player_nodes.nationals_seasons — seasons the player was on the roster of a team
--                                    that attended USAU CLUB Nationals. Detected by
--                                    template_key='club_nationals' (2025+) or name
--                                    pattern (2014-2024 naming drifted: "National
--                                    Championships" / "Club Championships" / "Club
--                                    Nationals"). 2019 nationals + 2014/15 rosters
--                                    are upstream data gaps; 2020 didn't happen.
-- rebuild_player_edges() repopulates both — run manually after applying.

alter table public.player_nodes add column if not exists teams text[] not null default '{}';
alter table public.player_nodes add column if not exists nationals_seasons int[] not null default '{}';

create or replace function public.rebuild_player_edges()
 returns table(nodes integer, edges integer)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare n_nodes int; n_edges int;
begin
  -- One row per (player, team-season context). team-season context = the real
  -- roster a player was on: 'league:team:season'. USAU rosters are already per
  -- team-season; UFA/PUL/WUL game-stat rows collapse to their team + season.
  drop table if exists tmp_appear;
  create temp table tmp_appear on commit drop as
    select 'usau:'||r.team_id||':'||r.season as ctx,
           public.normalize_player_name(p.display_name) as name,
           'usau'::text as league, r.season as season, p.display_name as raw_name
      from usau_rosters r join usau_players p on p.id = r.player_id where p.display_name is not null
    union all
    select 'ufa:'||s.team_id||':'||g.year, public.normalize_player_name(p.full_name), 'ufa', g.year, p.full_name
      from ufa_game_player_stats s join ufa_players p on p.id = s.player_id join ufa_games g on g.id = s.game_id where p.full_name is not null
    union all
    select 'pul:'||s.team_id||':'||gg.season, public.normalize_player_name(s.player_name), 'pul', gg.season, s.player_name
      from pul_game_player_stats s join pul_games gg on gg.id = s.game_id where s.player_name is not null
    union all
    select 'wul:'||s.team_id||':'||wg.season, public.normalize_player_name(s.player_name), 'wul', wg.season, s.player_name
      from wul_game_player_stats s join wul_games wg on wg.id = s.game_id where s.player_name is not null;
  delete from tmp_appear where name is null;

  -- distinct (context, player) — a player appears once per team-season regardless
  -- of how many games they logged there.
  drop table if exists tmp_ga;
  create temp table tmp_ga on commit drop as
    select distinct ctx, name, league, season from tmp_appear;
  create index on tmp_ga (ctx);

  -- team-season contexts that were at CLUB Nationals (team attended that season).
  drop table if exists tmp_nat;
  create temp table tmp_nat on commit drop as
    select distinct 'usau:'||et.team_id||':'||ev.season as ctx, ev.season
      from usau_event_teams et
      join usau_events ev on ev.id = et.event_id
     where ev.competition_level = 'CLUB'
       and (ev.template_key = 'club_nationals'
            or ev.name ~* 'usa ultimate (national championships|club championships|club nationals)');
  create index on tmp_nat (ctx);

  truncate public.player_nodes;
  insert into public.player_nodes (name, display_name, leagues, last_season)
  select a.name, (array_agg(a.raw_name order by a.raw_name))[1], array_agg(distinct a.league), max(a.season)
    from tmp_appear a group by a.name;

  update public.player_nodes pn set teams = t.teams
    from (select g.name, array_agg(distinct regexp_replace(g.ctx, ':[^:]*$', '')) as teams
            from tmp_ga g group by g.name) t
   where t.name = pn.name;

  update public.player_nodes pn set nationals_seasons = t.seasons
    from (select g.name, array_agg(distinct g.season) as seasons
            from tmp_ga g join tmp_nat n on n.ctx = g.ctx group by g.name) t
   where t.name = pn.name;

  -- edges: for each co-appearing pair, weight = # shared team-seasons, and ctx =
  -- the actual set of those team-seasons (the discriminator the connection logic
  -- needs).  last_season = most recent shared team-season.
  truncate public.player_edges;
  insert into public.player_edges (name_a, name_b, weight, leagues, last_season, ctx)
  select least(x.name, y.name), greatest(x.name, y.name),
         count(*),
         array_agg(distinct x.league),
         max(greatest(x.season, y.season)),
         array_agg(distinct x.ctx)
    from tmp_ga x join tmp_ga y on y.ctx = x.ctx and x.name < y.name
   group by least(x.name, y.name), greatest(x.name, y.name);

  update public.player_nodes pn set teammate_count = d.deg
    from (select name, count(*) deg from (select name_a as name from public.player_edges union all select name_b from public.player_edges) z group by name) d
   where d.name = pn.name;

  update public.player_nodes pn set ufa_career_score = t.best
    from (select public.normalize_player_name(p.name) as name, max(p.player_score::numeric) as best
            from twelve_oh_players p where p.name is not null group by public.normalize_player_name(p.name)) t
   where t.name = pn.name;

  select count(*) into n_nodes from public.player_nodes;
  select count(*) into n_edges from public.player_edges;
  return query select n_nodes, n_edges;
end $function$;

notify pgrst, 'reload schema';

-- Per-player, per-period stat averages for a weekly contest's season (the
-- projection input; the client scores the line by roster role with the
-- shared scoring matrix). Public stats only → anon-readable. Event
-- contests return no rows.
create or replace function public.fantasy_player_projections(p_contest uuid)
returns table (
  player_league text, player_id text, player_name text, periods int,
  goals numeric, assists numeric, blocks numeric, turnovers numeric, yards numeric
)
language plpgsql stable security definer set search_path = ''
as $$
declare v_comp text; v_year int;
begin
  select c.competition, c.season_year into v_comp, v_year from public.fantasy_contests c where c.id = p_contest;
  if v_comp = 'ufa' then
    return query
    select 'ufa'::text, p.id::text, p.full_name::text, count(distinct g.week)::int,
      round(sum(coalesce(s.goals, 0))::numeric / count(distinct g.week), 2),
      round(sum(coalesce(s.assists, 0))::numeric / count(distinct g.week), 2),
      round(sum(coalesce(s.blocks, 0))::numeric / count(distinct g.week), 2),
      round(sum(coalesce(s.throwaways, 0) + coalesce(s.drops, 0) + coalesce(s.stalls, 0))::numeric / count(distinct g.week), 2),
      round(sum(coalesce(s.yards_thrown, 0) + coalesce(s.yards_received, 0))::numeric / count(distinct g.week), 1)
    from public.ufa_game_player_stats s
    join public.ufa_games g on g.id = s.game_id and g.year = v_year and g.week is not null
    join public.ufa_players p on p.id = s.player_id
    group by p.id, p.full_name;
  elsif v_comp = 'pul' then
    return query
    select 'pul'::text, s.player_name::text, s.player_name::text, count(distinct g.week_label)::int,
      round(sum(coalesce(s.goals, 0))::numeric / count(distinct g.week_label), 2),
      round(sum(coalesce(s.assists, 0))::numeric / count(distinct g.week_label), 2),
      round(sum(coalesce(s.blocks, 0))::numeric / count(distinct g.week_label), 2),
      round(sum(coalesce(s.turnovers, 0))::numeric / count(distinct g.week_label), 2),
      0::numeric
    from public.pul_game_player_stats s
    join public.pul_games g on g.id = s.game_id and g.season = v_year and g.week_label is not null
    group by s.player_name;
  elsif v_comp = 'wul' then
    return query
    select 'wul'::text, s.player_name::text, s.player_name::text, count(distinct date_trunc('week', g.game_date))::int,
      round(sum(coalesce(s.goals, 0))::numeric / count(distinct date_trunc('week', g.game_date)), 2),
      round(sum(coalesce(s.assists, 0))::numeric / count(distinct date_trunc('week', g.game_date)), 2),
      round(sum(coalesce(s.blocks, 0))::numeric / count(distinct date_trunc('week', g.game_date)), 2),
      round(sum(coalesce(s.turnovers, 0))::numeric / count(distinct date_trunc('week', g.game_date)), 2),
      round(sum(coalesce(s.total_yards, coalesce(s.throw_yards, 0) + coalesce(s.receive_yards, 0)))::numeric / count(distinct date_trunc('week', g.game_date)), 1)
    from public.wul_game_player_stats s
    join public.wul_games g on g.id = s.game_id and g.season = v_year and g.game_date is not null
    group by s.player_name;
  end if;
end;
$$;
revoke all on function public.fantasy_player_projections(uuid) from public;
grant execute on function public.fantasy_player_projections(uuid) to anon, authenticated;

notify pgrst, 'reload schema';

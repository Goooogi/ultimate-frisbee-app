-- Applied via MCP 2026-07-23.
-- Helper for the sync-ufa edge fn: of the given game ids, which Final games have
-- COMPLETE per-player stats? Complete = each side's summed player goals equals
-- the team's final score (callahans are already counted inside `goals` upstream,
-- verified on 2026-06-19-LV-ATL). Games with no stat rows aren't returned (the
-- join), so callers treat absence as incomplete.
--
-- WHY: sync-ufa used to skip Final games that had ANY stat rows. A game synced
-- while InProgress froze at that mid-game snapshot the moment it flipped Final —
-- 10 of the Jul 17-19 weekend's games (incl. Hawkins' 14A Jul 19 game) were
-- stuck partial, silently feeding standouts + fantasy scoring bad lines.
-- 22 partial Final games existed across the 2026 season when this landed.
--
-- Service-role only (the edge fn) — no reason for browser exposure.

create or replace function public.ufa_complete_stat_game_ids(p_ids text[])
returns table(game_id text)
language sql
stable
set search_path to 'public'
as $function$
  select g.id
  from public.ufa_games g
  join public.ufa_game_player_stats s on s.game_id = g.id
  where g.id = any(p_ids)
  group by g.id, g.home_score, g.away_score, g.home_team_id, g.away_team_id
  having coalesce(sum(s.goals) filter (where s.team_id = g.home_team_id), 0) = coalesce(g.home_score, -1)
     and coalesce(sum(s.goals) filter (where s.team_id = g.away_team_id), 0) = coalesce(g.away_score, -1)
$function$;

revoke execute on function public.ufa_complete_stat_game_ids(text[]) from anon, authenticated;

notify pgrst, 'reload schema';

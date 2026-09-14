-- Fantasy PUL/WUL: a contest's player pool is its season's players PLUS the
-- season before's (2026-09-13). NOT YET APPLIED — Hunter's go needed.
--
-- pul_players / wul_players rows for a season only appear with a player's
-- first game of it, and the pool checks read ONLY the contest's season. So a
-- league created before opening day (the schedule now lands ~3 months early)
-- found no players to add, and auto-pick had nobody to pick; in-season, anyone
-- who hadn't played yet couldn't be added. UFA's pool is every ufa_players row,
-- so only PUL/WUL had this. The web draft search (src/lib/fantasy/draft.ts
-- poolFirstSeason) uses the same rule.
--
-- PATCHED IN PLACE from the LIVE definitions with anchors asserted to occur
-- exactly once (the 20260729 / 20260801 pattern; shared DB with mobile).
-- Live md5(prosrc) the anchors were written against (2026-09-13):
--   fantasy_add_drop               7fbbaf9378e60bdf1569d4e1b4e7837a
--   fantasy_claim_waiver           c5947ba04050201eebe75101bc997687
--   fantasy_draft_best_available   06455f387ed122fb3d25418fdfbab8dd

create function public.fantasy_pool_first_season(p_league text, p_season int)
returns int
language sql
stable
set search_path = ''
as $$
  -- The newest earlier season with player rows; the contest's own season when
  -- there is none (the league's first season).
  select coalesce(
    case p_league
      when 'pul' then (select max(season) from public.pul_players where season < p_season)
      when 'wul' then (select max(season) from public.wul_players where season < p_season)
    end,
    p_season
  );
$$;

-- Only called from the SECURITY DEFINER fantasy functions below.
revoke all on function public.fantasy_pool_first_season(text, int) from public, anon, authenticated;

create function pg_temp.replace_once(p_src text, p_old text, p_new text, p_what text)
returns text
language plpgsql
as $$
begin
  if (length(p_src) - length(replace(p_src, p_old, ''))) / length(p_old) <> 1 then
    raise exception '%: anchor not found exactly once — aborting rather than guessing', p_what;
  end if;
  return replace(p_src, p_old, p_new);
end;
$$;

do $mig$
declare
  v text;
begin
  -- add/drop and waiver claims: the "is this player in the pool" check.
  v := pg_get_functiondef('public.fantasy_add_drop(uuid, text, text, text, text, text)'::regprocedure);
  v := pg_temp.replace_once(v,
    'public.pul_players where player_name = p_add_id and season = v_contest.season_year',
    'public.pul_players where player_name = p_add_id and season between public.fantasy_pool_first_season(''pul'', v_contest.season_year) and v_contest.season_year',
    'fantasy_add_drop pul pool');
  v := pg_temp.replace_once(v,
    'public.wul_players where player_name = p_add_id and season = v_contest.season_year',
    'public.wul_players where player_name = p_add_id and season between public.fantasy_pool_first_season(''wul'', v_contest.season_year) and v_contest.season_year',
    'fantasy_add_drop wul pool');
  execute v;

  v := pg_get_functiondef('public.fantasy_claim_waiver(uuid, text, text, text, integer, text, text)'::regprocedure);
  v := pg_temp.replace_once(v,
    'public.pul_players where player_name = p_add_id and season = v_contest.season_year',
    'public.pul_players where player_name = p_add_id and season between public.fantasy_pool_first_season(''pul'', v_contest.season_year) and v_contest.season_year',
    'fantasy_claim_waiver pul pool');
  v := pg_temp.replace_once(v,
    'public.wul_players where player_name = p_add_id and season = v_contest.season_year',
    'public.wul_players where player_name = p_add_id and season between public.fantasy_pool_first_season(''wul'', v_contest.season_year) and v_contest.season_year',
    'fantasy_claim_waiver wul pool');
  execute v;

  -- Auto-pick (timed-out clock): ranks by that row's season totals, so before
  -- opening day it picks from last season's leaders.
  v := pg_get_functiondef('public.fantasy_draft_best_available(uuid, public.fantasy_contests)'::regprocedure);
  v := pg_temp.replace_once(v,
    'where pl.season = p_contest.season_year',
    'where pl.season between public.fantasy_pool_first_season(''pul'', p_contest.season_year) and p_contest.season_year',
    'fantasy_draft_best_available pul pool');
  v := pg_temp.replace_once(v,
    'where wl.season = p_contest.season_year',
    'where wl.season between public.fantasy_pool_first_season(''wul'', p_contest.season_year) and p_contest.season_year',
    'fantasy_draft_best_available wul pool');
  execute v;
end
$mig$;

notify pgrst, 'reload schema';

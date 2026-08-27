-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: the draft-room migration's 4 internal helpers (fantasy_draft_team_on_clock,
-- fantasy_draft_player_league_valid, fantasy_draft_competition_player_league,
-- fantasy_draft_seed_event_rosters) were granted EXECUTE to authenticated so the
-- SECURITY DEFINER RPCs that call them would work — but SECURITY DEFINER
-- functions execute as their owner regardless of caller grants, so that grant
-- was unnecessary and only widened the client-callable surface (flagged by
-- get_advisors: anon_security_definer_function_executable /
-- authenticated_security_definer_function_executable). These are internal-only,
-- same as fantasy_enforce_roster_composition — revoke from anon/authenticated/
-- public entirely. fantasy_schedule_draft/fantasy_start_draft/fantasy_make_pick/
-- fantasy_resolve_clock/fantasy_set_queue (the actual client contract) keep
-- their authenticated grants, untouched.
-- ─────────────────────────────────────────────────────────────────────────────

revoke execute on function public.fantasy_draft_team_on_clock(jsonb, int) from anon, authenticated, public;
revoke execute on function public.fantasy_draft_player_league_valid(text, text) from anon, authenticated, public;
revoke execute on function public.fantasy_draft_competition_player_league(text) from anon, authenticated, public;
revoke execute on function public.fantasy_draft_seed_event_rosters(uuid, text, int) from anon, authenticated, public;

notify pgrst, 'reload schema';

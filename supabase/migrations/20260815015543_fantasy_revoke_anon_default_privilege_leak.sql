-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: Supabase applies ALTER DEFAULT PRIVILEGES that GRANT EXECUTE directly
-- to anon/authenticated/service_role on every newly created function — this
-- grant bypasses PUBLIC entirely. "REVOKE ... FROM PUBLIC" in the prior
-- migrations therefore did NOT remove anon's ability to call these functions;
-- get_advisors confirmed post-apply that fantasy_create_league,
-- fantasy_join_league, fantasy_accept_league_invite, fantasy_leave_league,
-- fantasy_remove_league_member, fantasy_get_league_code,
-- fantasy_regenerate_league_code, fantasy_create_league_invite,
-- fantasy_owns_team, and fantasy_roster_is_valid were all still
-- anon-executable. This is the same class of issue as the codebase's
-- "REVOKE must target PUBLIC" incident, except here PUBLIC isn't even the
-- gap — the default-privilege grant to anon is direct and separate.
--
-- Fix: explicitly revoke EXECUTE from anon on every function that should be
-- authenticated-only. fantasy_preview_league_invite is intentionally left
-- anon-executable (unauthenticated invite preview, by design).
-- ─────────────────────────────────────────────────────────────────────────────

revoke execute on function public.fantasy_create_league(text) from anon;
revoke execute on function public.fantasy_get_league_code(uuid) from anon;
revoke execute on function public.fantasy_regenerate_league_code(uuid) from anon;
revoke execute on function public.fantasy_join_league(text) from anon;
revoke execute on function public.fantasy_create_league_invite(uuid, text) from anon;
revoke execute on function public.fantasy_accept_league_invite(text) from anon;
revoke execute on function public.fantasy_remove_league_member(uuid, uuid) from anon;
revoke execute on function public.fantasy_leave_league(uuid) from anon;
revoke execute on function public.fantasy_owns_team(uuid) from anon;
revoke execute on function public.fantasy_roster_is_valid(uuid, text) from anon;

notify pgrst, 'reload schema';

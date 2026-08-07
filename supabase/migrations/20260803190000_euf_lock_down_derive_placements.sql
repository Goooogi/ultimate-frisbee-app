-- SECURITY FIX. 20260803150000 tried to lock derive_euf_placements() with
--   REVOKE EXECUTE ... FROM anon, authenticated;
-- which was a NO-OP: those roles never held an explicit grant. Postgres grants
-- EXECUTE to PUBLIC by default on CREATE FUNCTION, and every role is implicitly
-- a member of PUBLIC — so anon could still call it, and it is SECURITY DEFINER
-- and WRITES to euf_teams. Caught by security review 2026-08-03; verified live
-- with has_function_privilege('anon', ...) = true before the fix, false after.
--
-- RULE for this repo: any SECURITY DEFINER function that must not be callable
-- by the browser needs REVOKE ... FROM PUBLIC, not just FROM anon/authenticated.
REVOKE EXECUTE ON FUNCTION derive_euf_placements(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION derive_euf_placements(uuid) FROM anon, authenticated;

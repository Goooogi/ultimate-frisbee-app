-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: fantasy_owns_team and fantasy_roster_is_valid still carried an EXECUTE
-- grant to PUBLIC itself (from CREATE FUNCTION's implicit default, never
-- explicitly revoked for these two — the original 20260701 migrations only
-- revoked anon for fantasy_owns_team, and this Phase 1 rewrite of
-- fantasy_roster_is_valid didn't add a revoke at all). Every role inherits
-- from PUBLIC, so anon could still call both despite the anon-specific
-- revoke in the prior migration having succeeded. These are meant to be
-- authenticated-only helpers (RLS/RPC-internal booleans) — revoke PUBLIC,
-- keep authenticated.
-- ─────────────────────────────────────────────────────────────────────────────

revoke execute on function public.fantasy_owns_team(uuid) from public;
grant execute on function public.fantasy_owns_team(uuid) to authenticated;

revoke execute on function public.fantasy_roster_is_valid(uuid, text) from public;
grant execute on function public.fantasy_roster_is_valid(uuid, text) to authenticated;

notify pgrst, 'reload schema';

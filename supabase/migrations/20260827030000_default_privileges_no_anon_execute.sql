-- POLICY FLIP (Hunter, 2026-08-27): stop auto-granting anon EXECUTE on new
-- public functions. This leak bit 4 separate times (last: the draft RPCs,
-- 20260827020000) — Supabase's default privileges granted anon on every new
-- function, silently bypassing each migration's REVOKE FROM PUBLIC.
--
-- ⚠️ NEW CONVENTION: a function that SHOULD be anon-callable (public search
-- RPCs like search_*_fuzzy, public read RPCs) now needs an explicit
--   grant execute on function ... to anon;
-- in its migration. Existing functions keep their current grants — this
-- changes defaults for FUTURE functions only.
alter default privileges for role postgres in schema public
  revoke execute on functions from anon;

-- The anon entry alone is NOT enough: Postgres's built-in default also
-- grants EXECUTE to PUBLIC (the `=X` ACL entry) on every new function, and
-- anon inherits through it — verified with a probe function. Revoke the
-- PUBLIC default too. Supabase's explicit `authenticated` and `service_role`
-- default grants remain, so normal RPCs keep working with zero extra lines;
-- ONLY intentionally-anon functions need the explicit grant.
alter default privileges for role postgres in schema public
  revoke execute on functions from public;


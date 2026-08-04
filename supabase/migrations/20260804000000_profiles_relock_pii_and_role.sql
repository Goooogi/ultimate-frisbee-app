-- Re-lock profiles: strip anon's PII grants, restore the role-column REVOKE.
--
-- Two drifts found on the LIVE db on 2026-08-04 while debugging the profile-icon
-- regression. Both are defense-in-depth, not open holes today — RLS on profiles
-- has no policy for `anon` at all (only profiles_select_authenticated /
-- _update_own / _insert_self, all scoped to `authenticated`), so an anon caller
-- gets 0 rows regardless of the column grant. Verified both empirically as
-- `anon` before writing this: SELECT email/phone -> 0 rows, UPDATE role ->
-- 0 rows. We close them anyway: the grants are one accidentally-permissive
-- policy away from becoming a real PII leak / privilege-escalation path.
--
-- Drift 1 — anon held SELECT/INSERT/UPDATE on profiles.email and .phone.
--   Mobile's 20260802000100_profiles_restrict_pii.sql revoked SELECT on the base
--   table FROM `authenticated` and re-granted a column list without email/phone
--   (they moved to the profile_contact view). It never touched `anon`.
--
-- Drift 2 — the role-column REVOKE from 20260722160000_user_roles_beta.sql was
--   NOT in effect: both anon and authenticated held UPDATE/INSERT on
--   profiles.role. guard_profile_role_change() still blocked escalation, so the
--   hole itself stayed shut, but the column layer was gone.
--
-- ⚠️ THE GOTCHA THAT MADE BOTH DRIFTS POSSIBLE — read before editing grants here.
-- `profiles` relacl was {anon=arwdDxtm/postgres, authenticated=awdDxtm/postgres},
-- i.e. TABLE-LEVEL insert/select/update grants. A column-level
-- `revoke update (role) ... ` is a SILENT NO-OP against a table-level grant:
-- the table grant already implies every column, present and future. The first
-- attempt at this migration did exactly that and changed nothing (its assertion
-- block caught it — keep that assertion).
--
-- The only thing that works: REVOKE AT TABLE LEVEL, then re-GRANT the explicit
-- column list. Which also means any future plain `grant update on profiles to
-- authenticated` will silently blow away every column restriction in this file.
-- Don't write one.
--
-- Deliberately kept: `authenticated` retains INSERT/UPDATE on email/phone
-- (profiles_update_own scopes those writes to your own row, and signup writes
-- them) and SELECT on `role` (the app reads its own role to gate admin/beta UI).
-- `authenticated` does NOT get SELECT on email/phone — that's mobile's
-- 20260802000100 restriction, which we preserve; own contact info is read via
-- the profile_contact view.
--
-- Admin role changes are unaffected: set_user_role() is SECURITY DEFINER, so it
-- bypasses these column grants entirely.

-- ── 1. Drop the table-wide grants that make column control impossible ───────
revoke select, insert, update on public.profiles from anon, authenticated;

-- ── 2. Re-grant, column by column ──────────────────────────────────────────
-- anon: read-only, and only the columns that are already public elsewhere
-- (profiles_public view). No email, no phone, no role writes. RLS still gates
-- rows — this is the second lock, not the first.
grant select (id, display_name, username, avatar_url, avatar_icon, created_at, updated_at)
  on public.profiles to anon;

-- authenticated: everything except email/phone SELECT (per mobile's restriction)
-- and any write to `role`.
grant select (id, display_name, username, avatar_url, avatar_icon, role, created_at, updated_at)
  on public.profiles to authenticated;
grant insert (id, email, phone, display_name, username, avatar_url, avatar_icon)
  on public.profiles to authenticated;
grant update (email, phone, display_name, username, avatar_url, avatar_icon)
  on public.profiles to authenticated;

-- ── 3. Belt and braces: PUBLIC must not carry a role write either ───────────
-- Postgres grants to PUBLIC implicitly and every role inherits it, so revoking
-- from anon/authenticated alone can be a silent no-op. This repo has been bitten
-- by exactly that (see 20260803190000_euf_lock_down_derive_placements.sql).
revoke update (role), insert (role) on public.profiles from public;

-- ── 4. Assert the end state, so a silent no-op fails loudly ────────────────
do $$
declare bad text;
begin
  select string_agg(format('%s:%s:%s', grantee, privilege_type, column_name), ', ')
    into bad
  from information_schema.column_privileges
  where table_schema = 'public'
    and table_name = 'profiles'
    and (
      -- anon must hold nothing on email/phone
      (grantee = 'anon' and column_name in ('email', 'phone')
        and privilege_type in ('SELECT', 'INSERT', 'UPDATE'))
      -- nobody web-facing may write role
      or (grantee in ('anon', 'authenticated', 'PUBLIC') and column_name = 'role'
        and privilege_type in ('INSERT', 'UPDATE'))
      -- authenticated must not regain SELECT on PII (mobile's restriction)
      or (grantee = 'authenticated' and column_name in ('email', 'phone')
        and privilege_type = 'SELECT')
    );

  if bad is not null then
    raise exception 'profiles re-lock failed, still granted: %', bad;
  end if;
end $$;

-- The app reads profiles over PostgREST, which caches the schema/privileges.
notify pgrst, 'reload schema';

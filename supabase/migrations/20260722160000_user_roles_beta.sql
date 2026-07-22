-- Applied via MCP 2026-07-22.
-- Role management for beta testing: adds a 'beta' role and an admin UI path to
-- assign roles, plus closes a privilege-escalation hole.
--
-- NOTE: `alter type ... add value` cannot run inside a transaction block and the
-- new value can't be used in the same txn it's added, so it was applied as its
-- own standalone statement before the rest of this migration:
--     alter type public.user_role add value if not exists 'beta';
-- It's repeated here (idempotent) for a clean-DB replay; if your migration
-- runner wraps files in a txn, run this one line separately first.
alter type public.user_role add value if not exists 'beta';

-- Every account still defaults to 'user' (profiles.role default is unchanged).

-- ── SECURITY: only admins may set a non-default role ────────────────────────
-- Two self-promotion vectors existed via RLS self-write policies, neither of
-- which constrained `role`:
--   * profiles_update_own (UPDATE where auth.uid()=id) → self-promote to admin.
--   * profiles_insert_self (INSERT where auth.uid()=id) → insert own row as admin
--     (e.g. if the profile row is missing / after a self-delete).
-- This trigger guards BOTH: a non-admin may only create a profile with the
-- default 'user' role, and may not change an existing role. (Same bypassable-
-- client-gating class as the moderation backstops.) Admin role changes flow
-- through the admin-only set_user_role() RPC below.
-- auth.uid() is null for service-role / SECURITY DEFINER internal contexts
-- (migrations, handle_new_user, the set_user_role RPC) — those are allowed.
create or replace function public.guard_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if tg_op = 'INSERT' then
    if new.role is distinct from 'user'::public.user_role
       and auth.uid() is not null and not public.is_admin() then
      raise exception 'cannot self-assign a non-default role';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.role is distinct from old.role
       and auth.uid() is not null and not public.is_admin() then
      raise exception 'only admins can change roles';
    end if;
  end if;
  return new;
end $function$;

drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role
  before insert or update on public.profiles
  for each row execute function public.guard_profile_role_change();

-- A pre-existing UPDATE-only trigger (profiles_guard_role_change) called this
-- same function; now that profiles_guard_role covers INSERT+UPDATE, the old one
-- just double-runs the check — drop it to avoid drift.
drop trigger if exists profiles_guard_role_change on public.profiles;

-- Defense in depth: revoke the column-level write privilege on profiles.role
-- from clients entirely, so the column is literally unwritable via the REST
-- self-write policies even if a trigger were ever dropped. Legit profile updates
-- only patch non-role columns (avatar/name/username), so this breaks nothing.
-- set_user_role() is SECURITY DEFINER (runs as owner), unaffected.
revoke insert (role), update (role) on public.profiles from authenticated, anon;

-- ── set_user_role: admin-gated role assignment ─────────────────────────────
create or replace function public.set_user_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if not public.is_admin() then raise exception 'not authorized'; end if;
  if p_role not in ('user','beta','admin') then raise exception 'invalid role %', p_role; end if;

  -- Prevent an admin from demoting THEMSELVES out of admin (lockout guard).
  if p_user_id = uid and p_role <> 'admin' then
    raise exception 'you cannot change your own admin role';
  end if;

  update public.profiles set role = p_role::public.user_role where id = p_user_id;
  if not found then raise exception 'user not found'; end if;
end $function$;

-- ── admin_list_users: admin-only user directory (joins auth email) ─────────
-- Profiles alone don't carry email; the picker needs a human identifier. This
-- SECURITY DEFINER fn exposes email ONLY to admins (guarded), never broadly.
create or replace function public.admin_list_users()
returns table(id uuid, email text, display_name text, username text, role text, created_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'not authorized';
  end if;
  return query
    select p.id, u.email::text, p.display_name, p.username, p.role::text, u.created_at
    from public.profiles p
    join auth.users u on u.id = p.id
    order by u.created_at desc;
end $function$;

revoke execute on function public.admin_list_users() from public, anon;
revoke execute on function public.set_user_role(uuid, text) from public, anon;

notify pgrst, 'reload schema';

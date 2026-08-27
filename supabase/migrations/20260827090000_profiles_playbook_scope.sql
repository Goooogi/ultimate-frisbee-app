-- Persist the playbook scope (personal vs a team) per PROFILE, across
-- sessions and devices (Hunter, 2026-08-27). Values: 'personal' or a
-- pb_teams uuid. The client validates the value against the user's current
-- memberships on load, so a stale team id degrades to the default instead of
-- erroring — no FK on purpose (team deletion must not break profile rows).
alter table public.profiles
  add column if not exists playbook_scope text
  constraint profiles_playbook_scope_shape check (
    playbook_scope is null
    or playbook_scope = 'personal'
    or playbook_scope ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  );

-- profiles is COLUMN-grant locked (the role self-promotion fix revoked
-- table-wide privileges) — a new column is invisible/read-only until granted
-- explicitly. Own-row scoping comes from the existing RLS policies; no anon
-- grants (the preference is private to the account).
grant select (playbook_scope), insert (playbook_scope), update (playbook_scope)
  on public.profiles to authenticated;

notify pgrst, 'reload schema';

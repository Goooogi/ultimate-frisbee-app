-- POLICY FLIP, part 2 (Hunter, 2026-08-27). Part 1 (20260827030000) removed
-- anon from the postgres default-ACL, but PROBED FALSE-SAFE: Postgres's
-- hard-wired `EXECUTE TO PUBLIC` on new functions is ADDITIVE to pg_default_acl
-- and cannot be removed through ALTER DEFAULT PRIVILEGES (verified with probe
-- functions — new fns still carried the `=X` PUBLIC ACE, which anon inherits).
--
-- The working mechanism:
--   1. SNAPSHOT: every existing public-schema function anon can currently
--      execute gets an EXPLICIT anon grant — freezing today's behavior so
--      nothing public-facing (search_*_fuzzy, profile reads, …) breaks now or
--      on a future CREATE OR REPLACE.
--   2. EVENT TRIGGER: on every future CREATE FUNCTION in public (extensions
--      excluded via in_extension), revoke the implicit PUBLIC grant. anon then
--      has access ONLY when a migration grants it explicitly.
--
-- ⚠️ NEW CONVENTION: intentionally-anon functions MUST carry
--     grant execute on function ... to anon;
--   in their migration (and again after any CREATE OR REPLACE if the explicit
--   grant was never added). authenticated/service_role keep their Supabase
--   default grants — normal RPCs need zero extra lines.

-- 1. Snapshot: make implicit-anon explicit on existing functions.
do $$
declare r record;
begin
  for r in
    select p.oid, p.oid::regprocedure::text as ident
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and has_function_privilege('anon', p.oid, 'execute')
      and p.prokind = 'f'
  loop
    execute format('grant execute on function %s to anon', r.ident);
  end loop;
end $$;

-- 2. Event trigger: strip the implicit PUBLIC grant from new functions.
create or replace function public._strip_public_execute()
returns event_trigger
language plpgsql
security definer
set search_path = ''
as $$
declare r record;
begin
  for r in
    select object_identity, in_extension
    from pg_event_trigger_ddl_commands()
    where command_tag = 'CREATE FUNCTION'
      and schema_name = 'public'
      and not in_extension
  loop
    execute format('revoke execute on function %s from public', r.object_identity);
  end loop;
end;
$$;

drop event trigger if exists strip_public_execute;
create event trigger strip_public_execute
  on ddl_command_end
  when tag in ('CREATE FUNCTION')
  execute function public._strip_public_execute();

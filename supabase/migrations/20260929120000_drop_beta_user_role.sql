-- Retire the 'beta' role (added 20260722160000). UTCG is public on web now, so
-- the role gates nothing. Beta accounts become plain 'user'; the enum drops the
-- value; set_user_role stops accepting it.
--
-- The 6 accounts demoted on 2026-09-29:
--   0152b454-fd49-49a1-9a76-5ed269cecedd, 1c97c210-77a0-44fe-a090-a949be7983dc,
--   589c61f5-71f4-4c34-bedf-06bcb4ee469c, 61edfc27-764a-4749-a185-02c9852e6168,
--   a7948a28-a7f6-4a5d-bc6d-987e49c94922, ff489143-2c28-4de2-8cde-01bbd659ca9a

update public.profiles set role = 'user' where role = 'beta';

-- prosrc patch from the LIVE definition (shared with mobile) — same pattern as
-- 20260922200000.
DO $migration$
DECLARE
  v_oid oid;
  v_def text;
  c_old constant text := $q$if p_role not in ('user','beta','admin') then$q$;
  c_new constant text := $q$if p_role not in ('user','admin') then$q$;
BEGIN
  v_oid := to_regprocedure('public.set_user_role(uuid,text)');
  IF v_oid IS NULL THEN RAISE EXCEPTION 'set_user_role not found'; END IF;
  v_def := pg_get_functiondef(v_oid);

  IF position(c_new in v_def) > 0 THEN
    RAISE NOTICE 'set_user_role already patched; skipping'; RETURN;
  END IF;
  IF (length(v_def) - length(replace(v_def, c_old, ''))) / length(c_old) <> 1 THEN
    RAISE EXCEPTION 'set_user_role anchor not unique';
  END IF;

  EXECUTE replace(v_def, c_old, c_new);
END
$migration$;

-- Postgres can't drop an enum value in place: swap the type. profiles.role is
-- the only column on it (checked 2026-09-29); is_admin() and the role guard
-- trigger are string-bodied, so they don't pin the old type.
alter type public.user_role rename to user_role_old;
create type public.user_role as enum ('user', 'admin');
alter table public.profiles alter column role drop default;
alter table public.profiles
  alter column role type public.user_role using role::text::public.user_role;
alter table public.profiles alter column role set default 'user'::public.user_role;
drop type public.user_role_old;

notify pgrst, 'reload schema';

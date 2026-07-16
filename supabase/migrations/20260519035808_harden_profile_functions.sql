-- Lock down the trigger functions per Supabase advisor recommendations.
-- 1) Set a fixed search_path on profiles_set_updated_at.
-- 2) Revoke EXECUTE on handle_new_user from anon/authenticated so it can
--    only run via the auth.users INSERT trigger, not via RPC.

create or replace function public.profiles_set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from anon, authenticated, public;
revoke execute on function public.profiles_set_updated_at() from anon, authenticated, public;

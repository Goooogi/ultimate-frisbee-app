-- Trigger now also picks up `phone` from raw_user_meta_data when provided
-- at signup. NULL when missing (phone is optional). EXECUTE still revoked
-- from anon/authenticated so this can only run via the auth.users trigger.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name, phone)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'phone'
  );
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from anon, authenticated, public;

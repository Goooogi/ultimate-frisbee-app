-- Extend the signup trigger to persist a chosen username from signup metadata.
-- The registration form now requires a handle and passes it as user_metadata
-- ('username'). We lowercase-normalize it here as a safety net. NULL-safe: if
-- somehow absent, the profile still creates (username stays null) rather than
-- failing signup — the app/UI is the primary enforcer.
create or replace function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path to ''
as $function$
declare
  uname text;
begin
  uname := lower(nullif(trim(new.raw_user_meta_data->>'username'), ''));
  -- Only accept a well-formed handle; otherwise leave null (settings/fantasy
  -- flows can set it later). Guards against a malformed metadata value
  -- violating the CHECK and blocking the whole signup.
  if uname is not null and uname !~ '^[a-z0-9_]{3,30}$' then
    uname := null;
  end if;

  insert into public.profiles (id, email, display_name, phone, username)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'phone',
    uname
  );
  return new;
end;
$function$;
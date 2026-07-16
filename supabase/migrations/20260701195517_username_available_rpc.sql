-- Handle-availability check as a SECURITY DEFINER function returning ONLY a
-- boolean. Two reasons:
--   1. Correctness: profiles SELECT is `to authenticated` only, so the anon
--      client (used at signup, before a session exists) reads profiles as empty
--      and the old .eq('username',...) check ALWAYS returned "available" — a
--      broken UX (user told a taken handle is free, save then fails on the
--      UNIQUE constraint). The definer function can see the row.
--   2. Least disclosure: returns a bool, never row data — no id/email/etc. leaks,
--      unlike widening the profiles SELECT policy to anon.
-- Format-validates first so it doubles as a cheap guard. Case-insensitive.
create or replace function public.fantasy_handle_available(p_handle text)
  returns boolean
  language sql
  security definer
  set search_path = public
  stable
as $$
  select
    case
      when p_handle is null or lower(trim(p_handle)) !~ '^[a-z0-9_]{3,30}$' then false
      else not exists (
        select 1 from public.profiles where username = lower(trim(p_handle))
      )
    end;
$$;

-- Callable pre-auth (signup) and post-auth (settings). Boolean-only, so safe.
grant execute on function public.fantasy_handle_available(text) to anon, authenticated;
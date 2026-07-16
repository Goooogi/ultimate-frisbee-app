-- Make the INSERT path on profiles explicit instead of relying on the
-- implicit RLS deny. The handle_new_user trigger runs as SECURITY DEFINER
-- so it bypasses RLS — this policy covers the direct-API path only and
-- guarantees a user can never insert a row for someone else's auth.uid().
create policy "profiles_insert_self"
  on public.profiles
  for insert
  to authenticated
  with check ((select auth.uid()) = id);

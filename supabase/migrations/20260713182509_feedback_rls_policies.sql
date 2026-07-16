-- The feedback table had RLS ENABLED but ZERO policies → deny-all: every
-- submit was silently rejected (0 rows ever saved), which is why the feedback
-- modal appeared "broken". The app code always assumed these policies existed
-- (feedback_insert_self, feedback_select_admin_or_own) but they were never
-- applied to this database. Recreate them, mirroring the player_content pattern
-- (is_admin() helper already exists and is used there).

-- INSERT: a signed-in user may submit feedback ONLY as themselves. status
-- defaults to 'new' server-side; the row is theirs. Matches submitFeedback()
-- which sets user_id = auth.uid().
drop policy if exists feedback_insert_self on public.feedback;
create policy feedback_insert_self on public.feedback
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- SELECT: admins see everything (the inbox); a normal user sees only their own
-- submissions. Defence-in-depth with the /admin/feedback page's role gate.
drop policy if exists feedback_select_admin_or_own on public.feedback;
create policy feedback_select_admin_or_own on public.feedback
  for select to authenticated
  using (is_admin() or user_id = (select auth.uid()));

-- UPDATE: only admins triage (status new/read/resolved, reviewed_by/at).
drop policy if exists feedback_update_admin on public.feedback;
create policy feedback_update_admin on public.feedback
  for update to authenticated
  using (is_admin())
  with check (is_admin());

-- DELETE: only admins can remove feedback.
drop policy if exists feedback_delete_admin on public.feedback;
create policy feedback_delete_admin on public.feedback
  for delete to authenticated
  using (is_admin());
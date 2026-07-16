drop policy if exists player_content_select_admin           on public.player_content;
drop policy if exists player_content_select_own             on public.player_content;
drop policy if exists player_content_select_public_approved on public.player_content;

create policy player_content_select_combined on public.player_content
  for select to authenticated
  using (
    is_admin()
    or uploaded_by = (select auth.uid())
    or status = 'approved'::player_content_status
  );

create policy player_content_select_approved_anon on public.player_content
  for select to anon
  using (status = 'approved'::player_content_status);

drop policy if exists player_content_delete_admin         on public.player_content;
drop policy if exists player_content_delete_owner_pending on public.player_content;

create policy player_content_delete_combined on public.player_content
  for delete to authenticated
  using (
    is_admin()
    or (uploaded_by = (select auth.uid()) and status = 'pending'::player_content_status)
  );

drop policy if exists player_content_insert_self_pending on public.player_content;

create policy player_content_insert_self_pending on public.player_content
  for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and status = 'pending'::player_content_status
    and reviewed_by is null
    and reviewed_at is null
  );
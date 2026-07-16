
-- User feedback inbox. Any signed-in user can submit; only admins can read the
-- full list + update status. Mirrors the player_content RLS model (user-insert-
-- own, admin-read-all via the existing is_admin() helper).

create type feedback_status as enum ('new', 'read', 'resolved');

create table public.feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  message     text not null check (char_length(message) between 1 and 4000),
  -- Optional freeform category the user can pick (bug / idea / other); kept as
  -- text (not an enum) so we can add categories without a migration.
  category    text,
  -- Denormalised context so the admin sees where the feedback came from without
  -- a join (page path at submit time). Never trusted for auth — display only.
  page_path   text,
  status      feedback_status not null default 'new',
  created_at  timestamptz not null default now(),
  -- Admin triage fields.
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz
);

create index feedback_status_created_idx on public.feedback (status, created_at desc);
create index feedback_user_idx on public.feedback (user_id);

alter table public.feedback enable row level security;

-- INSERT: a signed-in user may only insert their OWN feedback, always as 'new'
-- and un-triaged. reviewed_* must be null on insert (only admins set them later).
create policy feedback_insert_self on public.feedback
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'new'
    and reviewed_by is null
    and reviewed_at is null
  );

-- SELECT: admins see everything; a user may see their own submissions.
create policy feedback_select_admin_or_own on public.feedback
  for select to authenticated
  using (is_admin() or user_id = (select auth.uid()));

-- UPDATE: admins only (triage: set status / reviewed_by / reviewed_at).
create policy feedback_update_admin on public.feedback
  for update to authenticated
  using (is_admin())
  with check (is_admin());

-- DELETE: admins only.
create policy feedback_delete_admin on public.feedback
  for delete to authenticated
  using (is_admin());

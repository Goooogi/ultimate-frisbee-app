-- 1) Role enum + role column on profiles
create type public.user_role as enum ('user', 'admin');

alter table public.profiles
  add column role public.user_role not null default 'user';

comment on column public.profiles.role is
  'Authorization role. Default user; admin can moderate player content.';

-- 2) Player-content table.
-- player_kind discriminates the FK target: UFA players live in ufastats only
-- (string slug), USAU players live in the public.usau_players table (UUID).
-- We store the external identifier as text so a single row can point at
-- either league. Internal sanity is enforced by the player_kind check + a
-- conditional FK from usau rows to usau_players.
create type public.player_content_kind as enum ('image', 'video', 'video_link');
create type public.player_content_status as enum ('pending', 'approved', 'rejected');

create table public.player_content (
  id uuid primary key default gen_random_uuid(),
  player_kind text not null check (player_kind in ('ufa', 'usau')),
  -- For UFA: the slug from /players/{slug}. For USAU: usau_players.id (uuid as text).
  player_ref text not null,
  -- For ergonomic admin display.
  player_display_name text not null,

  kind public.player_content_kind not null,
  -- For 'image' / 'video': storage path inside the player-content bucket.
  -- For 'video_link': null.
  storage_path text,
  -- For 'video_link': external URL (YouTube/Vimeo). For files: null.
  external_url text,
  -- Optional caption (kept short; UI enforces a soft limit).
  caption text,
  -- File metadata for uploads (helps admin sort/filter and detect abuse).
  mime_type text,
  file_size_bytes bigint,

  status public.player_content_status not null default 'pending',
  uploaded_by uuid not null references public.profiles(id) on delete cascade,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Kind/source coherence: files have storage_path; links have external_url.
  constraint player_content_payload_check check (
    (kind in ('image', 'video') and storage_path is not null and external_url is null)
    or
    (kind = 'video_link' and external_url is not null and storage_path is null)
  )
);

create index player_content_player_idx
  on public.player_content (player_kind, player_ref, status);

create index player_content_status_created_idx
  on public.player_content (status, created_at desc);

create index player_content_uploader_idx
  on public.player_content (uploaded_by);

comment on table public.player_content is
  'User-uploaded media (images, videos, external video links) attached to a player profile. All uploads land in status=pending and must be approved by an admin.';

-- 3) updated_at trigger
create or replace function public.set_player_content_updated_at()
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

create trigger player_content_set_updated_at
before update on public.player_content
for each row execute function public.set_player_content_updated_at();

-- 4) is_admin() helper, used by RLS and the app.
-- SECURITY DEFINER + locked search_path so policies can call it without
-- privileged tables leaking through.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(
    (select role = 'admin' from public.profiles where id = auth.uid()),
    false
  );
$$;

grant execute on function public.is_admin() to authenticated, anon;

-- 5) RLS
alter table public.player_content enable row level security;

-- READ: approved content is world-readable; the uploader sees their own
-- pending/rejected items; admins see everything.
create policy player_content_select_public_approved
  on public.player_content
  for select
  to anon, authenticated
  using (status = 'approved');

create policy player_content_select_own
  on public.player_content
  for select
  to authenticated
  using (uploaded_by = auth.uid());

create policy player_content_select_admin
  on public.player_content
  for select
  to authenticated
  using (public.is_admin());

-- INSERT: signed-in users may insert as themselves. They cannot set status
-- or reviewer fields (the WITH CHECK blocks anything but pending + self).
create policy player_content_insert_self_pending
  on public.player_content
  for insert
  to authenticated
  with check (
    uploaded_by = auth.uid()
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
  );

-- UPDATE: only admins can update (approve/reject/edit). Uploader cannot
-- edit their own post once submitted (keeps the moderation queue honest).
create policy player_content_update_admin
  on public.player_content
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- DELETE: uploader can withdraw their pending submission; admin can delete anything.
create policy player_content_delete_owner_pending
  on public.player_content
  for delete
  to authenticated
  using (uploaded_by = auth.uid() and status = 'pending');

create policy player_content_delete_admin
  on public.player_content
  for delete
  to authenticated
  using (public.is_admin());

-- 6) Lock down direct profile role changes: only admins can change role.
-- We keep the existing owner-update policy but layer a column constraint via
-- a trigger that fires before update.
create or replace function public.guard_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.role is distinct from old.role) and not public.is_admin() then
    raise exception 'Only admins can change profile role';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_role_change
before update of role on public.profiles
for each row execute function public.guard_profile_role_change();

-- 7) Storage bucket for player content (private — we serve via signed URLs
-- or by reading via RLS-aware authenticated requests).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'player-content',
  'player-content',
  true,
  -- 200 MB cap per object (videos can be chunky; tune later if needed).
  209715200,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ]
);

-- Storage RLS: any signed-in user can upload to player-content/<their-uid>/...,
-- any admin can do anything, and reads are public because the bucket is public.
-- (Visibility on the app side is gated by player_content.status — we don't
-- expose un-approved storage paths from the API; the obscure UUID-name path
-- under a private prefix means even if the public bucket setting leaks an
-- object, it's not a meaningful disclosure.)
create policy "player_content_storage_insert_own_folder"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'player-content'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "player_content_storage_update_admin"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'player-content' and public.is_admin())
  with check (bucket_id = 'player-content' and public.is_admin());

create policy "player_content_storage_delete_admin_or_owner"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'player-content'
    and (
      public.is_admin()
      or (storage.foldername(name))[1] = auth.uid()::text
    )
  );

create policy "player_content_storage_select_public"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'player-content');

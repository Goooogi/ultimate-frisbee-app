-- Profiles table — mirrors auth.users 1:1, holds public-readable user data.
-- We never store passwords or PII beyond display info here.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  username text unique,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Public-facing user profile data. 1:1 with auth.users.';
comment on column public.profiles.id is 'References auth.users.id — never set manually; populated by trigger on signup.';
comment on column public.profiles.username is 'Optional unique handle. Lowercase, alphanumeric + underscores.';

-- Username constraint: 3-30 chars, lowercase alphanumeric + underscores (when set).
alter table public.profiles
  add constraint profiles_username_format
  check (username is null or username ~ '^[a-z0-9_]{3,30}$');

-- Indexes
create index profiles_username_idx on public.profiles (username) where username is not null;

-- ─── RLS ───
-- Profiles are world-readable (so we can show display names / avatars), but
-- only the owner can update their own row. Inserts only happen via the signup
-- trigger; nobody can insert directly. Deletes cascade from auth.users.

alter table public.profiles enable row level security;

create policy "profiles_select_all"
  on public.profiles
  for select
  to authenticated, anon
  using (true);

create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- ─── Trigger: keep updated_at fresh ───
create or replace function public.profiles_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.profiles_set_updated_at();

-- ─── Trigger: auto-create profile row on auth.users insert ───
-- Runs as security definer so it can write to public.profiles regardless of
-- the calling user (the signup hook runs as the anon role). Search path is
-- locked down to prevent search-path injection.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

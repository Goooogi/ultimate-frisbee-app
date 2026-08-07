-- Jersey marketplace — listings core (tables, storage, RLS, profanity backstop).
--
-- WHAT THIS IS: a community board for trading/selling real jerseys. We connect
-- people; we do NOT process transactions. `price_cents` is indicative only —
-- there is no payment, no escrow, no custody of funds anywhere in this feature.
-- Taking custody would make us a marketplace-of-record / money transmitter.
--
-- ⚠️ NAMING: `utcg_listings` already exists for the VIRTUAL card game. Everything
-- here is `jersey_`-prefixed so the two are never confused.
--
-- ⚠️ NO APPROVAL QUEUE — BY DESIGN (Hunter, 2026-08-02). Listings publish the
-- instant a user posts them. The status enum is active/completed/withdrawn and
-- deliberately has NO 'pending' value, so there is structurally nowhere for a
-- listing to sit waiting on an admin. This is the OPPOSITE of player_content
-- (which does gate on approval) because a trading board dies if listings queue
-- behind a human. Admin involvement happens only when a user REPORTS something
-- (see the reports table in the next migration). Do not add a pending state.

-- ── Enums ───────────────────────────────────────────────────────────────────
do $$ begin
  create type public.jersey_listing_kind as enum ('trade', 'sell', 'both');
exception when duplicate_object then null; end $$;

do $$ begin
  -- No 'pending'. See the note above — this is load-bearing.
  create type public.jersey_listing_status as enum ('active', 'completed', 'withdrawn');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.jersey_condition as enum ('new', 'excellent', 'good', 'worn');
exception when duplicate_object then null; end $$;

-- ── Listings ────────────────────────────────────────────────────────────────
create table if not exists public.jersey_listings (
  id            uuid primary key default gen_random_uuid(),
  -- FK to profiles (not just auth.users) so PostgREST can embed the seller in
  -- one query — same trick as 20260713234841_feedback_user_profiles_fk_for_embed.
  owner_id      uuid not null references public.profiles(id) on delete cascade,
  kind          public.jersey_listing_kind not null default 'trade',

  title         text not null check (char_length(btrim(title)) between 3 and 120),
  description   text check (description is null or char_length(description) <= 2000),
  size          text check (size is null or char_length(size) <= 20),
  condition     public.jersey_condition,
  -- Indicative asking price ONLY. Nothing in this app moves money.
  price_cents   int check (price_cents is null or (price_cents >= 0 and price_cents <= 100000000)),

  -- Cross-league team reference, DENORMALIZED with no FK: team ids are
  -- heterogeneous across leagues (UFA slug, PUL slug, USAU uuid, WFDF uuid).
  -- Exactly the shape user_favorite_teams uses (20260708231004).
  league        text check (league is null or league in ('ufa','usau','pul','wul','wfdf')),
  team_id       text,
  team_name     text check (team_name is null or char_length(team_name) <= 120),
  team_logo_url text,
  -- Free text, not an id: WFDF players are keyed by NAME, not uuid.
  player_name   text check (player_name is null or char_length(player_name) <= 120),
  year          int check (year is null or (year between 1960 and 2100)),

  city          text check (city is null or char_length(city) <= 100),
  state         text check (state is null or char_length(state) <= 60),

  status        public.jersey_listing_status not null default 'active',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists jersey_listings_active_idx
  on public.jersey_listings (created_at desc) where status = 'active';
create index if not exists jersey_listings_owner_idx
  on public.jersey_listings (owner_id, created_at desc);
create index if not exists jersey_listings_team_idx
  on public.jersey_listings (league, team_id) where status = 'active';
create index if not exists jersey_listings_state_idx
  on public.jersey_listings (state) where status = 'active';
-- Player-name search: trigram, matching the search_*_fuzzy family's approach.
create index if not exists jersey_listings_player_trgm_idx
  on public.jersey_listings using gin (lower(player_name) gin_trgm_ops);

-- ── Photos ──────────────────────────────────────────────────────────────────
-- Photos are FIRST-CLASS: a jersey nobody can see won't trade. Multiple per
-- listing, published instantly with it (no review step).
create table if not exists public.jersey_photos (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references public.jersey_listings(id) on delete cascade,
  storage_path text not null,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists jersey_photos_listing_idx
  on public.jersey_photos (listing_id, sort_order);

-- ── Tournament tagging ──────────────────────────────────────────────────────
-- "I'll be at these tournaments" — the overlap signal that makes a meetup
-- plannable. want_id is added by the NEXT migration (wants don't exist yet);
-- it's declared nullable here so the CHECK can be widened in place.
create table if not exists public.jersey_listing_events (
  id             uuid primary key default gen_random_uuid(),
  listing_id     uuid references public.jersey_listings(id) on delete cascade,
  usau_event_id  uuid not null references public.usau_events(id) on delete cascade,
  created_at     timestamptz not null default now(),
  unique (listing_id, usau_event_id)
);

create index if not exists jersey_listing_events_event_idx
  on public.jersey_listing_events (usau_event_id);

-- ── updated_at ──────────────────────────────────────────────────────────────
create or replace function public.set_jersey_updated_at()
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

drop trigger if exists jersey_listings_set_updated_at on public.jersey_listings;
create trigger jersey_listings_set_updated_at
before update on public.jersey_listings
for each row execute function public.set_jersey_updated_at();

-- ── Profanity backstop ──────────────────────────────────────────────────────
/**
 * The app's profanity filter (src/lib/moderation.ts, `obscenity` package) runs
 * CLIENT-side only and is trivially bypassed by POSTing raw REST. That has been
 * an accepted gap for profiles/fantasy/feedback — but those are either
 * low-traffic or admin-only-visible. Jersey listings are PUBLIC, photo-bearing
 * UGC, so this one gets a database backstop.
 *
 * ⚠️ THIS IS DELIBERATELY NARROWER THAN THE CLIENT FILTER, AND THAT IS FINE.
 * `obscenity` is TypeScript and cannot run in Postgres, so this is a plain
 * word-list covering the egregious cases. The client still catches far more
 * (leetspeak, spacing tricks, a much longer list). Do NOT "fix" this into a
 * claimed equivalence — it is a floor, not a mirror. Defense in depth: the
 * client is the UX, this is the guarantee.
 */
create or replace function public.jersey_text_is_clean(p_text text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_text is null
      or lower(regexp_replace(p_text, '[^a-zA-Z]', '', 'g')) !~
         '(nigg|faggot|fagg0t|retard|kike|spic|chink|tranny|rapist|cunt)';
$$;

create or replace function public.jersey_reject_profanity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.jersey_text_is_clean(new.title)
     or not public.jersey_text_is_clean(new.description) then
    raise exception 'That text isn''t allowed. Please reword it.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists jersey_listings_profanity on public.jersey_listings;
create trigger jersey_listings_profanity
before insert or update of title, description on public.jersey_listings
for each row execute function public.jersey_reject_profanity();

-- ── Rate limit: 20 active listings per user ─────────────────────────────────
-- Mirrors player_content_rate_limit and the UTCG marketplace's 20-listing cap.
create or replace function public.jersey_listings_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare n int;
begin
  if public.is_admin() then return new; end if;
  select count(*) into n
    from public.jersey_listings
    where owner_id = new.owner_id and status = 'active';
  if n >= 20 then
    raise exception 'You already have 20 active listings. Close one first.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists jersey_listings_cap on public.jersey_listings;
create trigger jersey_listings_cap
before insert on public.jersey_listings
for each row execute function public.jersey_listings_rate_limit();

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.jersey_listings       enable row level security;
alter table public.jersey_photos         enable row level security;
alter table public.jersey_listing_events enable row level security;

-- Listings: active rows are world-readable (browse works signed out, which is
-- how the board grows); owners always see their own; admins see everything.
drop policy if exists jersey_listings_select_public on public.jersey_listings;
create policy jersey_listings_select_public on public.jersey_listings
  for select to anon, authenticated
  using (status = 'active' or owner_id = (select auth.uid()) or public.is_admin());

drop policy if exists jersey_listings_insert_self on public.jersey_listings;
create policy jersey_listings_insert_self on public.jersey_listings
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists jersey_listings_update_own on public.jersey_listings;
create policy jersey_listings_update_own on public.jersey_listings
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists jersey_listings_delete_own_or_admin on public.jersey_listings;
create policy jersey_listings_delete_own_or_admin on public.jersey_listings
  for delete to authenticated
  using (owner_id = (select auth.uid()) or public.is_admin());

-- Admins can take a reported listing down without owning it.
drop policy if exists jersey_listings_update_admin on public.jersey_listings;
create policy jersey_listings_update_admin on public.jersey_listings
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Photos + event tags: visibility follows the parent listing.
drop policy if exists jersey_photos_select_public on public.jersey_photos;
create policy jersey_photos_select_public on public.jersey_photos
  for select to anon, authenticated
  using (exists (
    select 1 from public.jersey_listings l
    where l.id = listing_id
      and (l.status = 'active' or l.owner_id = (select auth.uid()) or public.is_admin())
  ));

drop policy if exists jersey_photos_write_owner on public.jersey_photos;
create policy jersey_photos_write_owner on public.jersey_photos
  for all to authenticated
  using (exists (
    select 1 from public.jersey_listings l
    where l.id = listing_id and (l.owner_id = (select auth.uid()) or public.is_admin())
  ))
  with check (exists (
    select 1 from public.jersey_listings l
    where l.id = listing_id and l.owner_id = (select auth.uid())
  ));

drop policy if exists jersey_listing_events_select_public on public.jersey_listing_events;
create policy jersey_listing_events_select_public on public.jersey_listing_events
  for select to anon, authenticated
  using (exists (
    select 1 from public.jersey_listings l
    where l.id = listing_id
      and (l.status = 'active' or l.owner_id = (select auth.uid()) or public.is_admin())
  ));

drop policy if exists jersey_listing_events_write_owner on public.jersey_listing_events;
create policy jersey_listing_events_write_owner on public.jersey_listing_events
  for all to authenticated
  using (exists (
    select 1 from public.jersey_listings l
    where l.id = listing_id and (l.owner_id = (select auth.uid()) or public.is_admin())
  ))
  with check (exists (
    select 1 from public.jersey_listings l
    where l.id = listing_id and l.owner_id = (select auth.uid())
  ));

-- ── Storage bucket ──────────────────────────────────────────────────────────
-- Public bucket, images only, 5 MB. Object path MUST be
-- `{auth.uid()}/{listing_id}/{uuid}.{ext}` — the insert policy enforces that
-- the first folder segment is the uploader's uid.
--
-- ⚠️ Serve plain /object/ URLs. NEVER /render/image or transform:{} — the Pro
-- plan's 100/cycle image-transform quota was already blown once. Resize on the
-- CLIENT before upload instead (see avatar-upload-modal.tsx).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('jersey-photos', 'jersey-photos', true, 5242880,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "jersey_photos_storage_insert_own_folder" on storage.objects;
create policy "jersey_photos_storage_insert_own_folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'jersey-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "jersey_photos_storage_delete_owner_or_admin" on storage.objects;
create policy "jersey_photos_storage_delete_owner_or_admin"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'jersey-photos'
    and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)
  );

drop policy if exists "jersey_photos_storage_select_public" on storage.objects;
create policy "jersey_photos_storage_select_public"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'jersey-photos');

notify pgrst, 'reload schema';

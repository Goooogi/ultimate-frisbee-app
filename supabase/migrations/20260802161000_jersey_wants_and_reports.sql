-- Jersey marketplace — wants ("ISO" posts) + reports.
--
-- WANTS: the inverse of a listing. A user says what they're LOOKING FOR, with
-- every identifying field optional — player AND/OR team AND/OR year — because
-- people search at wildly different specificity ("any Johnny Bravo jersey",
-- "2019 Machine", "anything Truck Stop, size L").
--
-- REPORTS: the ONLY admin surface in this feature. Listings never queue for
-- approval (see 20260802160000). A report is what summons a human. It can point
-- at a listing, a want, or a message thread — and for threads it is ALSO the
-- key that unlocks admin read access to otherwise-private DMs (see the next
-- migration's jersey_thread_messages_for_admin function).

-- ── Wants ───────────────────────────────────────────────────────────────────
create table if not exists public.jersey_wants (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,

  -- All three targeting fields optional and independent, by design.
  league        text check (league is null or league in ('ufa','usau','pul','wul','wfdf')),
  team_id       text,
  team_name     text check (team_name is null or char_length(team_name) <= 120),
  team_logo_url text,
  player_name   text check (player_name is null or char_length(player_name) <= 120),
  year          int check (year is null or (year between 1960 and 2100)),

  size          text check (size is null or char_length(size) <= 20),
  note          text check (note is null or char_length(note) <= 2000),
  city          text check (city is null or char_length(city) <= 100),
  state         text check (state is null or char_length(state) <= 60),

  status        public.jersey_listing_status not null default 'active',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- A want with NO target at all is just noise on the board.
  constraint jersey_wants_has_a_target
    check (team_id is not null or player_name is not null or year is not null)
);

create index if not exists jersey_wants_active_idx
  on public.jersey_wants (created_at desc) where status = 'active';
create index if not exists jersey_wants_user_idx
  on public.jersey_wants (user_id, created_at desc);
create index if not exists jersey_wants_team_idx
  on public.jersey_wants (league, team_id) where status = 'active';
create index if not exists jersey_wants_player_trgm_idx
  on public.jersey_wants using gin (lower(player_name) gin_trgm_ops);

drop trigger if exists jersey_wants_set_updated_at on public.jersey_wants;
create trigger jersey_wants_set_updated_at
before update on public.jersey_wants
for each row execute function public.set_jersey_updated_at();

-- Profanity backstop on the free-text field. Same narrow-by-design floor as
-- listings — see the long note in 20260802160000.
create or replace function public.jersey_wants_reject_profanity()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if not public.jersey_text_is_clean(new.note) then
    raise exception 'That text isn''t allowed. Please reword it.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists jersey_wants_profanity on public.jersey_wants;
create trigger jersey_wants_profanity
before insert or update of note on public.jersey_wants
for each row execute function public.jersey_wants_reject_profanity();

-- Same 20-active cap as listings.
create or replace function public.jersey_wants_rate_limit()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare n int;
begin
  if public.is_admin() then return new; end if;
  select count(*) into n from public.jersey_wants
    where user_id = new.user_id and status = 'active';
  if n >= 20 then
    raise exception 'You already have 20 active wanted posts. Close one first.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists jersey_wants_cap on public.jersey_wants;
create trigger jersey_wants_cap
before insert on public.jersey_wants
for each row execute function public.jersey_wants_rate_limit();

-- ── Tournament tagging for wants ────────────────────────────────────────────
-- Widen jersey_listing_events to reference EITHER a listing or a want. The
-- table was created listing-only; adding the column here keeps one tag table
-- rather than two near-identical ones.
alter table public.jersey_listing_events
  add column if not exists want_id uuid references public.jersey_wants(id) on delete cascade;

do $$ begin
  alter table public.jersey_listing_events
    add constraint jersey_listing_events_one_parent
    check (num_nonnulls(listing_id, want_id) = 1);
exception when duplicate_object then null; end $$;

create unique index if not exists jersey_listing_events_want_uniq
  on public.jersey_listing_events (want_id, usau_event_id) where want_id is not null;

-- ── Reports ─────────────────────────────────────────────────────────────────
do $$ begin
  create type public.jersey_report_status as enum ('new', 'reviewed', 'actioned', 'dismissed');
exception when duplicate_object then null; end $$;

create table if not exists public.jersey_reports (
  id               uuid primary key default gen_random_uuid(),
  reporter_id      uuid not null references public.profiles(id) on delete cascade,
  -- Exactly one target. thread_id's FK is added by the messaging migration,
  -- since jersey_threads doesn't exist yet.
  listing_id       uuid references public.jersey_listings(id) on delete cascade,
  want_id          uuid references public.jersey_wants(id) on delete cascade,
  thread_id        uuid,
  -- Who is being reported. Denormalized so the row survives the content being
  -- deleted — otherwise a bad actor could erase the evidence by withdrawing.
  reported_user_id uuid references public.profiles(id) on delete set null,
  reason           text not null check (char_length(btrim(reason)) between 2 and 60),
  detail           text check (detail is null or char_length(detail) <= 2000),
  status           public.jersey_report_status not null default 'new',
  created_at       timestamptz not null default now(),
  reviewed_at      timestamptz,
  reviewed_by      uuid references public.profiles(id) on delete set null,

  constraint jersey_reports_one_target
    check (num_nonnulls(listing_id, want_id, thread_id) = 1)
);

create index if not exists jersey_reports_open_idx
  on public.jersey_reports (created_at desc) where status = 'new';
create index if not exists jersey_reports_reporter_idx
  on public.jersey_reports (reporter_id);
create index if not exists jersey_reports_thread_idx
  on public.jersey_reports (thread_id) where thread_id is not null;

-- One open report per user per target: stops one person spamming the queue.
create unique index if not exists jersey_reports_dedupe_listing
  on public.jersey_reports (reporter_id, listing_id)
  where listing_id is not null and status = 'new';
create unique index if not exists jersey_reports_dedupe_want
  on public.jersey_reports (reporter_id, want_id)
  where want_id is not null and status = 'new';
create unique index if not exists jersey_reports_dedupe_thread
  on public.jersey_reports (reporter_id, thread_id)
  where thread_id is not null and status = 'new';

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.jersey_wants   enable row level security;
alter table public.jersey_reports enable row level security;

drop policy if exists jersey_wants_select_public on public.jersey_wants;
create policy jersey_wants_select_public on public.jersey_wants
  for select to anon, authenticated
  using (status = 'active' or user_id = (select auth.uid()) or public.is_admin());

drop policy if exists jersey_wants_insert_self on public.jersey_wants;
create policy jersey_wants_insert_self on public.jersey_wants
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists jersey_wants_update_own on public.jersey_wants;
create policy jersey_wants_update_own on public.jersey_wants
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists jersey_wants_update_admin on public.jersey_wants;
create policy jersey_wants_update_admin on public.jersey_wants
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists jersey_wants_delete_own_or_admin on public.jersey_wants;
create policy jersey_wants_delete_own_or_admin on public.jersey_wants
  for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

-- Reports: a reporter sees only their own; admins see all. Nobody can edit a
-- report after filing — only admins triage it.
drop policy if exists jersey_reports_select_own_or_admin on public.jersey_reports;
create policy jersey_reports_select_own_or_admin on public.jersey_reports
  for select to authenticated
  using (reporter_id = (select auth.uid()) or public.is_admin());

-- Reporting a THREAD requires being one of its two participants. Without that
-- clause, anyone who learned a thread's UUID could file a bogus report and
-- thereby unlock admin read access to a private conversation between two
-- strangers — defeating the report-gated design in the messaging migration.
-- Listing/want reports stay open to any signed-in user: that content is public.
drop policy if exists jersey_reports_insert_self on public.jersey_reports;
create policy jersey_reports_insert_self on public.jersey_reports
  for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and status = 'new'
    and (
      thread_id is null
      or public.jersey_is_thread_participant(thread_id, (select auth.uid()))
    )
  );

drop policy if exists jersey_reports_update_admin on public.jersey_reports;
create policy jersey_reports_update_admin on public.jersey_reports
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists jersey_reports_delete_admin on public.jersey_reports;
create policy jersey_reports_delete_admin on public.jersey_reports
  for delete to authenticated
  using (public.is_admin());

notify pgrst, 'reload schema';

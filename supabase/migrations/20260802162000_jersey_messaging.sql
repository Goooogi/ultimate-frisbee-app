-- Jersey marketplace — messaging (the app's FIRST person-to-person DM system).
--
-- SCOPED, NOT GENERAL. A thread always hangs off a specific listing or want.
-- You cannot cold-DM an arbitrary user. That keeps every conversation in
-- context, makes "report this thread" meaningful, and avoids shipping a
-- general-purpose social inbox (and its harassment surface) by accident.
--
-- ⚠️ PRIVACY LINE — READ BEFORE CHANGING ANY POLICY HERE.
-- These are private conversations between two real people arranging to meet up.
-- Admins CANNOT read them in the normal path — there is deliberately no
-- `or public.is_admin()` on the message select policy. The ONLY way an admin
-- reads a thread is via jersey_thread_messages_for_admin(), which requires an
-- existing report row pointing at that thread. Reporting is the key; being an
-- admin is not. Do not "simplify" this by adding is_admin() to the RLS policy.

-- ── Threads ─────────────────────────────────────────────────────────────────
create table if not exists public.jersey_threads (
  id            uuid primary key default gen_random_uuid(),
  -- Exactly one parent: the listing or want this conversation is about.
  listing_id    uuid references public.jersey_listings(id) on delete cascade,
  want_id       uuid references public.jersey_wants(id) on delete cascade,
  -- owner = whoever posted the listing/want. requester = who reached out.
  owner_id      uuid not null references public.profiles(id) on delete cascade,
  requester_id  uuid not null references public.profiles(id) on delete cascade,

  last_message_at        timestamptz,
  owner_last_read_at     timestamptz,
  requester_last_read_at timestamptz,
  created_at             timestamptz not null default now(),

  constraint jersey_threads_one_parent check (num_nonnulls(listing_id, want_id) = 1),
  -- Messaging yourself is nonsense and would break the two-party read model.
  constraint jersey_threads_distinct_parties check (owner_id <> requester_id)
);

-- One thread per (listing, requester) — re-contacting reopens the same
-- conversation rather than fragmenting history across duplicates.
create unique index if not exists jersey_threads_listing_requester_uniq
  on public.jersey_threads (listing_id, requester_id) where listing_id is not null;
create unique index if not exists jersey_threads_want_requester_uniq
  on public.jersey_threads (want_id, requester_id) where want_id is not null;

create index if not exists jersey_threads_owner_idx
  on public.jersey_threads (owner_id, last_message_at desc nulls last);
create index if not exists jersey_threads_requester_idx
  on public.jersey_threads (requester_id, last_message_at desc nulls last);

-- ── Messages ────────────────────────────────────────────────────────────────
create table if not exists public.jersey_messages (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references public.jersey_threads(id) on delete cascade,
  sender_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists jersey_messages_thread_idx
  on public.jersey_messages (thread_id, created_at);

-- Now that threads exist, point reports at them.
do $$ begin
  alter table public.jersey_reports
    add constraint jersey_reports_thread_fk
    foreign key (thread_id) references public.jersey_threads(id) on delete cascade;
exception when duplicate_object then null; end $$;

-- ── Membership helper ───────────────────────────────────────────────────────
-- SECURITY DEFINER so the message policies can check thread membership without
-- recursing through jersey_threads' own RLS.
create or replace function public.jersey_is_thread_participant(p_thread uuid, p_user uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.jersey_threads t
    where t.id = p_thread and (t.owner_id = p_user or t.requester_id = p_user)
  );
$$;

-- ── Message hygiene: profanity floor + rate limit + thread bump ─────────────
create or replace function public.jersey_messages_reject_profanity()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if not public.jersey_text_is_clean(new.body) then
    raise exception 'That message isn''t allowed. Please reword it.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists jersey_messages_profanity on public.jersey_messages;
create trigger jersey_messages_profanity
before insert or update of body on public.jersey_messages
for each row execute function public.jersey_messages_reject_profanity();

-- 30 messages/hour/user. Blunt anti-spam so a single account can't blast the
-- whole board; generous enough that a real back-and-forth never trips it.
create or replace function public.jersey_messages_rate_limit()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare n int;
begin
  select count(*) into n from public.jersey_messages
    where sender_id = new.sender_id and created_at > now() - interval '1 hour';
  if n >= 30 then
    raise exception 'Too many messages in the last hour. Try again shortly.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists jersey_messages_cap on public.jersey_messages;
create trigger jersey_messages_cap
before insert on public.jersey_messages
for each row execute function public.jersey_messages_rate_limit();

-- Keep last_message_at current so the inbox can sort without a subquery, and
-- mark the SENDER caught up (they've obviously read their own message).
create or replace function public.jersey_messages_touch_thread()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  update public.jersey_threads
    set last_message_at = new.created_at,
        owner_last_read_at = case when owner_id = new.sender_id
                                  then new.created_at else owner_last_read_at end,
        requester_last_read_at = case when requester_id = new.sender_id
                                      then new.created_at else requester_last_read_at end
    where id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists jersey_messages_bump on public.jersey_messages;
create trigger jersey_messages_bump
after insert on public.jersey_messages
for each row execute function public.jersey_messages_touch_thread();

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.jersey_threads  enable row level security;
alter table public.jersey_messages enable row level security;

-- PARTICIPANTS ONLY. Note the absence of is_admin() — that's the privacy line.
drop policy if exists jersey_threads_select_participant on public.jersey_threads;
create policy jersey_threads_select_participant on public.jersey_threads
  for select to authenticated
  using (owner_id = (select auth.uid()) or requester_id = (select auth.uid()));

-- The requester opens the thread, and must not be able to forge who the owner
-- is: the owner_id has to genuinely match the parent listing/want's poster.
drop policy if exists jersey_threads_insert_requester on public.jersey_threads;
create policy jersey_threads_insert_requester on public.jersey_threads
  for insert to authenticated
  with check (
    requester_id = (select auth.uid())
    and owner_id <> (select auth.uid())
    and (
      (listing_id is not null and exists (
        select 1 from public.jersey_listings l
        where l.id = listing_id and l.owner_id = jersey_threads.owner_id and l.status = 'active'))
      or
      (want_id is not null and exists (
        select 1 from public.jersey_wants w
        where w.id = want_id and w.user_id = jersey_threads.owner_id and w.status = 'active'))
    )
  );

-- Participants may update ONLY their own read-receipt column. Enforced by a
-- trigger below, since RLS can't express "only these columns".
drop policy if exists jersey_threads_update_participant on public.jersey_threads;
create policy jersey_threads_update_participant on public.jersey_threads
  for update to authenticated
  using (owner_id = (select auth.uid()) or requester_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) or requester_id = (select auth.uid()));

create or replace function public.jersey_threads_guard_update()
returns trigger language plpgsql set search_path = ''
as $$
begin
  -- Everything except the read-receipt timestamps is immutable from the client.
  if new.id is distinct from old.id
     or new.listing_id is distinct from old.listing_id
     or new.want_id is distinct from old.want_id
     or new.owner_id is distinct from old.owner_id
     or new.requester_id is distinct from old.requester_id
     or new.created_at is distinct from old.created_at
     or new.last_message_at is distinct from old.last_message_at then
    raise exception 'Only read receipts can be updated on a thread.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists jersey_threads_guard on public.jersey_threads;
create trigger jersey_threads_guard
before update on public.jersey_threads
for each row
when (pg_trigger_depth() = 0)   -- let jersey_messages_touch_thread() bump freely
execute function public.jersey_threads_guard_update();

drop policy if exists jersey_messages_select_participant on public.jersey_messages;
create policy jersey_messages_select_participant on public.jersey_messages
  for select to authenticated
  using (public.jersey_is_thread_participant(thread_id, (select auth.uid())));

drop policy if exists jersey_messages_insert_participant on public.jersey_messages;
create policy jersey_messages_insert_participant on public.jersey_messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and public.jersey_is_thread_participant(thread_id, (select auth.uid()))
  );

-- No update policy at all: messages are immutable once sent. A sender may
-- delete their own (a retraction); nobody can rewrite history.
drop policy if exists jersey_messages_delete_own on public.jersey_messages;
create policy jersey_messages_delete_own on public.jersey_messages
  for delete to authenticated
  using (sender_id = (select auth.uid()));

-- ── Report-gated admin read ─────────────────────────────────────────────────
/**
 * The ONLY path by which an admin reads a private thread. Requires BOTH
 * is_admin() AND an existing jersey_reports row targeting this thread — so
 * being an admin is not by itself sufficient. If nobody reported it, nobody
 * reads it.
 */
create or replace function public.jersey_thread_messages_for_admin(p_thread uuid)
returns table (id uuid, sender_id uuid, body text, created_at timestamptz)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  if not exists (select 1 from public.jersey_reports r where r.thread_id = p_thread) then
    raise exception 'This thread has not been reported — it cannot be opened.';
  end if;

  return query
    select m.id, m.sender_id, m.body, m.created_at
    from public.jersey_messages m
    where m.thread_id = p_thread
    order by m.created_at;
end;
$$;

revoke all on function public.jersey_thread_messages_for_admin(uuid) from public, anon;
grant execute on function public.jersey_thread_messages_for_admin(uuid) to authenticated;

notify pgrst, 'reload schema';

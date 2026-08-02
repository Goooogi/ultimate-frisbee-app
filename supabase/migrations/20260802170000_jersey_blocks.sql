-- Jersey marketplace — blocking.
--
-- WHY THIS IS A DATABASE CONCERN, NOT A UI ONE: hiding a blocked person's
-- content client-side is theatre. A blocked user could still POST a message
-- via raw REST, or read the listing they were blocked from, because RLS never
-- knew about the block. So blocking is enforced in policies + triggers here,
-- and the UI merely reflects it.
--
-- SEMANTICS (deliberately symmetric — "block" here means "we are done"):
--   * Neither party sees the other's listings or wants on the board.
--   * Neither party can open a new thread with the other.
--   * Neither party can send a message into an existing shared thread.
--   * Existing threads are NOT deleted. The history stays readable to each
--     side (evidence survives; a block shouldn't destroy proof of harassment),
--     it just becomes read-only.
--   * Blocking is one-directional to CREATE but symmetric in EFFECT: if A
--     blocks B, B also can't reach A. Otherwise blocking would just hide the
--     harassment from the victim while leaving the channel open.
--
-- Blocks are PRIVATE: B is never told that A blocked them. Content simply
-- stops appearing. jersey_blocks is readable only by the blocker.

create table if not exists public.jersey_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  reason     text check (reason is null or char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint jersey_blocks_not_self check (blocker_id <> blocked_id)
);

create index if not exists jersey_blocks_blocked_idx on public.jersey_blocks (blocked_id);

/**
 * True when EITHER user has blocked the other. Used by every policy below.
 *
 * SECURITY DEFINER so it can see rows in jersey_blocks that the calling user
 * cannot select — B must not be able to enumerate who blocked them, but the
 * policies still need the answer.
 */
create or replace function public.jersey_is_blocked(p_a uuid, p_b uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.jersey_blocks b
    where (b.blocker_id = p_a and b.blocked_id = p_b)
       or (b.blocker_id = p_b and b.blocked_id = p_a)
  );
$$;

-- ── RLS on the block list itself ────────────────────────────────────────────
alter table public.jersey_blocks enable row level security;

-- Only the blocker sees their own list. Notably NOT visible to the blocked
-- user — being told "you were blocked" invites retaliation.
drop policy if exists jersey_blocks_select_own on public.jersey_blocks;
create policy jersey_blocks_select_own on public.jersey_blocks
  for select to authenticated
  using (blocker_id = (select auth.uid()));

drop policy if exists jersey_blocks_insert_own on public.jersey_blocks;
create policy jersey_blocks_insert_own on public.jersey_blocks
  for insert to authenticated
  with check (blocker_id = (select auth.uid()));

drop policy if exists jersey_blocks_delete_own on public.jersey_blocks;
create policy jersey_blocks_delete_own on public.jersey_blocks
  for delete to authenticated
  using (blocker_id = (select auth.uid()));

-- ── Hide content both ways ──────────────────────────────────────────────────
-- Anon browsing is unaffected (no auth.uid() → jersey_is_blocked is false for
-- a null, so the extra clause is a no-op for signed-out visitors).

drop policy if exists jersey_listings_select_public on public.jersey_listings;
create policy jersey_listings_select_public on public.jersey_listings
  for select to anon, authenticated
  using (
    (
      status = 'active'
      or owner_id = (select auth.uid())
      or public.is_admin()
    )
    -- Own rows and the admin view are never hidden by a block.
    and (
      owner_id = (select auth.uid())
      or public.is_admin()
      or (select auth.uid()) is null
      or not public.jersey_is_blocked(owner_id, (select auth.uid()))
    )
  );

drop policy if exists jersey_wants_select_public on public.jersey_wants;
create policy jersey_wants_select_public on public.jersey_wants
  for select to anon, authenticated
  using (
    (
      status = 'active'
      or user_id = (select auth.uid())
      or public.is_admin()
    )
    and (
      user_id = (select auth.uid())
      or public.is_admin()
      or (select auth.uid()) is null
      or not public.jersey_is_blocked(user_id, (select auth.uid()))
    )
  );

-- ── Stop new contact ────────────────────────────────────────────────────────
drop policy if exists jersey_threads_insert_requester on public.jersey_threads;
create policy jersey_threads_insert_requester on public.jersey_threads
  for insert to authenticated
  with check (
    requester_id = (select auth.uid())
    and owner_id <> (select auth.uid())
    -- A block prevents opening a conversation in EITHER direction.
    and not public.jersey_is_blocked(owner_id, (select auth.uid()))
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

-- Existing threads go read-only rather than disappearing: the history stays as
-- evidence, but nothing new can be sent.
create or replace function public.jersey_messages_block_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare other uuid;
begin
  select case when t.owner_id = new.sender_id then t.requester_id else t.owner_id end
    into other
    from public.jersey_threads t where t.id = new.thread_id;

  if other is not null and public.jersey_is_blocked(new.sender_id, other) then
    raise exception 'You can no longer message this person.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists jersey_messages_blocked on public.jersey_messages;
create trigger jersey_messages_blocked
before insert on public.jersey_messages
for each row execute function public.jersey_messages_block_check();

notify pgrst, 'reload schema';

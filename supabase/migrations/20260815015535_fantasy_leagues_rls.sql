-- ─────────────────────────────────────────────────────────────────────────────
-- Fantasy Leagues & Contests — Phase 1, migration 2 of 8.
--
-- fantasy_is_commissioner helper + RLS for fantasy_leagues / fantasy_league_members.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.fantasy_is_commissioner(p_league uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.fantasy_league_members m
    where m.league_id = p_league
      and m.user_id = (select auth.uid())
      and m.role = 'commissioner'
  );
$$;

comment on function public.fantasy_is_commissioner(uuid) is 'RLS helper + RPC-internal check. SECURITY DEFINER + authenticated EXECUTE required so policies can call it. Returns only a boolean about the caller. Do NOT revoke from authenticated.';

revoke all on function public.fantasy_is_commissioner(uuid) from public, anon;
grant execute on function public.fantasy_is_commissioner(uuid) to authenticated;

-- ── fantasy_leagues RLS: public SELECT (minus invite_token via column
-- privileges below), UPDATE restricted to commissioners, no direct client
-- INSERT/DELETE (insert goes through fantasy_create_league; no delete in v1). ──
drop policy if exists "fantasy_leagues read own" on public.fantasy_leagues;
drop policy if exists "fantasy_leagues insert own" on public.fantasy_leagues;
drop policy if exists "fantasy_leagues update own" on public.fantasy_leagues;
drop policy if exists "fantasy_leagues delete own" on public.fantasy_leagues;

create policy "fantasy_leagues public read"
  on public.fantasy_leagues for select
  to anon, authenticated
  using (true);

create policy "fantasy_leagues update commissioner"
  on public.fantasy_leagues for update
  to authenticated
  using (public.fantasy_is_commissioner(id))
  with check (public.fantasy_is_commissioner(id));

-- Column-level lockdown: invite_token must never leave via a direct
-- PostgREST select, even though the row is public-readable. Only
-- fantasy_get_league_code()/fantasy_regenerate_league_code() (SECURITY
-- DEFINER, migration 8) can read/return it.
revoke select (invite_token) on public.fantasy_leagues from anon, authenticated;

-- ── fantasy_league_members RLS: public SELECT, no direct client
-- INSERT/UPDATE (membership only via RPCs), DELETE = self-leave only. ──
alter table public.fantasy_league_members enable row level security;

create policy "fantasy_league_members public read"
  on public.fantasy_league_members for select
  to anon, authenticated
  using (true);

create policy "fantasy_league_members delete self"
  on public.fantasy_league_members for delete
  to authenticated
  using (user_id = (select auth.uid()));

notify pgrst, 'reload schema';

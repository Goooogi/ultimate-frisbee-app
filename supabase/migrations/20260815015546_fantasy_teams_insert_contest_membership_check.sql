-- ─────────────────────────────────────────────────────────────────────────────
-- Correction 2 (from Hunter, post-report): fantasy_teams INSERT policy was
-- missing a contest-membership check. As shipped, any signed-in user could
-- INSERT a fantasy_teams row with owner_id = themselves but contest_id set to
-- a private league's contest they were never invited to — planting a team
-- inside someone else's league.
--
-- Fix: WITH CHECK now also requires that contest_id is either NULL (legacy/
-- global path, unchanged) or points at a contest whose league is public
-- (league_id IS NULL, i.e. a global contest like the beta UFA pool) or one
-- the caller is an actual fantasy_league_members row for.
--
-- fantasy_is_league_member() is a new SECURITY DEFINER helper (mirrors
-- fantasy_is_commissioner) so the policy can check membership without RLS
-- recursion — evaluating fantasy_league_members' own RLS from inside a
-- fantasy_teams policy would be circular if done as a plain subquery under
-- RLS; SECURITY DEFINER sidesteps that by running as the function owner.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.fantasy_is_league_member(p_league uuid)
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
  );
$$;

comment on function public.fantasy_is_league_member(uuid) is 'RLS helper. SECURITY DEFINER + authenticated EXECUTE required so policies can call it without RLS recursion. Returns only a boolean about the caller. Do NOT revoke from authenticated.';

revoke all on function public.fantasy_is_league_member(uuid) from public, anon;
grant execute on function public.fantasy_is_league_member(uuid) to authenticated;

drop policy if exists "fantasy_teams insert own" on public.fantasy_teams;

create policy "fantasy_teams insert own"
  on public.fantasy_teams for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and (
      contest_id is null
      or exists (
        select 1 from public.fantasy_contests c
        where c.id = contest_id
          and (c.league_id is null or public.fantasy_is_league_member(c.league_id))
      )
    )
  );

notify pgrst, 'reload schema';

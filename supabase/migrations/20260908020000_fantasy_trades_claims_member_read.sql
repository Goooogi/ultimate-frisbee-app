-- Same rule as fantasy_league_activity (20260908019000): trade contents and
-- settled FAAB bids of invite-only leagues are for members, not the world.
drop policy if exists "fantasy_trades public read" on public.fantasy_trades;
create policy "fantasy_trades member read" on public.fantasy_trades
  for select to authenticated
  using (
    exists (
      select 1 from public.fantasy_contests c
      where c.id = fantasy_trades.contest_id and public.fantasy_is_league_member(c.league_id)
    )
  );
revoke select on public.fantasy_trades from anon;

drop policy if exists "fantasy_waiver_claims own read" on public.fantasy_waiver_claims;
create policy "fantasy_waiver_claims own or member read" on public.fantasy_waiver_claims
  for select to authenticated
  using (
    public.fantasy_owns_team(team_id)
    or (
      status <> 'pending'
      and exists (
        select 1 from public.fantasy_contests c
        where c.id = fantasy_waiver_claims.contest_id and public.fantasy_is_league_member(c.league_id)
      )
    )
  );

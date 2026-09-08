-- Activity rows now carry trade contents and FAAB bid amounts; leagues are
-- invite-only, so scope reads to members (same rule as messages).
drop policy if exists "fantasy_league_activity public read" on public.fantasy_league_activity;
create policy "fantasy_league_activity member read" on public.fantasy_league_activity
  for select to authenticated
  using (public.fantasy_is_league_member(league_id));
revoke select on public.fantasy_league_activity from anon;

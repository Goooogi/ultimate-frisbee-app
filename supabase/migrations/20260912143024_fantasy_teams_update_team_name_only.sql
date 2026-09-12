-- fantasy_teams: clients may only rename their team. The "update own" policy
-- checks owner_id alone, so with a table-wide UPDATE grant a signed-in user
-- could PATCH contest_id and move their team into a league they never joined.
-- team_name is the only column web or mobile writes; owner labels are set by
-- the fantasy_sync_owner_username trigger and SECURITY DEFINER functions, which
-- column grants don't restrict.
revoke update on public.fantasy_teams from authenticated, anon;
grant update (team_name) on public.fantasy_teams to authenticated;

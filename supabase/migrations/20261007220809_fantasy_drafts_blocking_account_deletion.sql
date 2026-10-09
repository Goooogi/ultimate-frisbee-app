-- Fantasy: account deletion is refused while the user has a team in a live
-- draft (Hunter, 2026-10-07: "if a draft is in progress then no you shouldn't
-- be allowed to delete your account"). Supersedes the mid-draft-deletion plan.
-- APPLIED to prod 2026-10-07 (remote version 20261007220809).
--
-- Same condition fantasy_teams_guard_delete raises on (status = 'live',
-- paused or not), so the pre-flight and the delete cascade agree. Clients call
-- it before showing the delete step; the delete-account edge function (v7)
-- calls it with the caller's token and returns 409 draft_in_progress before
-- deleting anything. Raises when signed out so the function fails closed.

create function public.fantasy_drafts_blocking_account_deletion()
returns table(league_id uuid, league_name text, contest_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;

  return query
  select l.id, l.name, c.id
  from public.fantasy_teams t
  join public.fantasy_contests c on c.id = t.contest_id
  join public.fantasy_leagues l on l.id = c.league_id
  join public.fantasy_drafts d on d.contest_id = c.id
  where t.owner_id = (select auth.uid())
    and d.status = 'live'
  order by l.name, c.id;
end;
$$;

revoke all on function public.fantasy_drafts_blocking_account_deletion() from public, anon, authenticated;
grant execute on function public.fantasy_drafts_blocking_account_deletion() to authenticated;

notify pgrst, 'reload schema';

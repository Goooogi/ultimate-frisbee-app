-- The "cannot remove the last owner" guard fires on every team_members
-- DELETE — including the cascade that runs when the parent team is being
-- deleted. That's wrong: deleting the team should remove all members,
-- owner included.
--
-- Fix: skip the check when the parent team no longer exists (or is being
-- deleted in the same statement). EXISTS is evaluated at trigger time, so
-- once the teams row is gone the guard becomes a no-op.
create or replace function public.guard_team_member_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- If the team row is gone (cascade in progress) or about to be gone,
  -- there's nothing to guard against — the whole team is being torn down.
  if not exists (select 1 from public.teams where id = old.team_id) then
    return old;
  end if;

  if old.role = 'owner' then
    if (
      select count(*) from public.team_members
      where team_id = old.team_id and role = 'owner'
    ) <= 1 then
      raise exception 'cannot remove the last owner of a team';
    end if;
  end if;
  return old;
end;
$$;

revoke execute on function public.guard_team_member_delete() from anon, authenticated, public;

-- When a user edits their display_name/username (e.g. in settings), refresh the
-- denormalized copies on their fantasy teams so the leaderboard stays current.
-- Without this, the fantasy_teams trigger only fires on team writes, leaving the
-- denorm stale after a profile edit.
create or replace function public.fantasy_resync_owner_labels()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if new.display_name is distinct from old.display_name
     or new.username is distinct from old.username then
    update public.fantasy_teams
      set owner_display_name = new.display_name,
          owner_username = new.username
      where owner_id = new.id;
  end if;
  return new;
end;
$$;

create trigger fantasy_resync_owner_labels_on_profile
  after update on public.profiles
  for each row execute function public.fantasy_resync_owner_labels();

revoke execute on function public.fantasy_resync_owner_labels() from anon, authenticated, public;
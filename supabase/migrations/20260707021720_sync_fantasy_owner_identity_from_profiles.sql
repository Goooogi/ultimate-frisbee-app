-- fantasy_teams denormalizes owner_display_name / owner_username so the
-- PUBLIC leaderboard never needs to read the (own-row-RLS'd) profiles table.
-- That snapshot went stale whenever a user later changed their display name
-- or username in settings. Sync it at the source: any profiles update that
-- touches display_name or username fans out to that owner's fantasy teams.
--
-- SECURITY DEFINER is required: the updating user owns their profiles row but
-- fantasy_teams UPDATE policies are scoped to team ownership — same person
-- here (owner_id = NEW.id), but the definer context keeps the trigger
-- independent of any future policy shuffle. search_path pinned.

create or replace function public.sync_fantasy_owner_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update fantasy_teams
     set owner_display_name = new.display_name,
         owner_username     = new.username
   where owner_id = new.id
     and (owner_display_name is distinct from new.display_name
       or owner_username     is distinct from new.username);
  return new;
end;
$$;

drop trigger if exists trg_sync_fantasy_owner_identity on public.profiles;
create trigger trg_sync_fantasy_owner_identity
  after update of display_name, username on public.profiles
  for each row
  execute function public.sync_fantasy_owner_identity();

-- One-time backfill: reconcile any snapshots that already drifted.
update fantasy_teams ft
   set owner_display_name = p.display_name,
       owner_username     = p.username
  from profiles p
 where ft.owner_id = p.id
   and (ft.owner_display_name is distinct from p.display_name
     or ft.owner_username     is distinct from p.username);
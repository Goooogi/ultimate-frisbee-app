-- Leaderboard now shows the owner's DISPLAY NAME (with @handle as secondary),
-- per Hunter. Add a denormalized owner_display_name alongside owner_username so
-- the public leaderboard reads only fantasy_teams (profiles isn't anon-readable)
-- and never needs a join. Both are force-synced from profiles by the trigger.
alter table public.fantasy_teams
  add column if not exists owner_display_name text;

-- Extend the existing sync trigger fn to populate BOTH display name + handle.
create or replace function public.fantasy_sync_owner_username()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  select username, display_name
    into new.owner_username, new.owner_display_name
  from public.profiles
  where id = new.owner_id;
  return new;
end;
$$;

-- Backfill existing team rows' display name from profiles (idempotent).
update public.fantasy_teams t
  set owner_display_name = p.display_name
  from public.profiles p
  where p.id = t.owner_id
    and t.owner_display_name is distinct from p.display_name;

comment on column public.fantasy_teams.owner_display_name is 'Denormalized profiles.display_name — the primary label shown on the public leaderboard (@owner_username is the secondary disambiguator). Force-synced by fantasy_sync_owner_username trigger.';
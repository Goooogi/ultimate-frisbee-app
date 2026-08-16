-- ─────────────────────────────────────────────────────────────────────────────
-- Fantasy Leagues & Contests — Phase 1, migration 1 of 8.
--
-- fantasy_leagues cleanup + fantasy_league_members.
--
-- fantasy_leagues was a scaffold (season_year int not null, never populated
-- meaningfully). Drop season_year — a league is a group of people, not
-- season-scoped; season scoping now lives on fantasy_contests.
--
-- invite_token stays column-level non-selectable: the code is a secret. RLS
-- SELECT is public (league existence/name is not sensitive — the invite page
-- needs to resolve a league name), but PostgREST column privileges block the
-- token itself from ever leaving via a direct table read. It's exposed only
-- through fantasy_get_league_code() (commissioner-only RPC, migration 8).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.fantasy_leagues drop column if exists season_year;

-- Rename: fantasy_leagues.owner_id was always "the creator", which is also
-- the first commissioner. Keep the column as-is (owner_id) — it's the FK
-- anchor for ON DELETE CASCADE and matches fantasy_teams' naming. Commissioner
-- status is expressed via fantasy_league_members.role, not a second column.

create table public.fantasy_league_members (
  id                  uuid primary key default gen_random_uuid(),
  league_id           uuid not null references public.fantasy_leagues(id) on delete cascade,
  user_id             uuid not null references public.profiles(id) on delete cascade,
  role                text not null default 'member' check (role in ('commissioner','member')),
  -- Denormalized from profiles (authenticated-only RLS since 20260804) so the
  -- PUBLIC league member list never needs to read profiles directly.
  member_display_name text,
  member_username     text,
  joined_at           timestamptz not null default now(),
  unique (league_id, user_id)
);

create index fantasy_league_members_league_idx on public.fantasy_league_members(league_id);
create index fantasy_league_members_user_idx on public.fantasy_league_members(user_id);

comment on table public.fantasy_league_members is 'Membership + role for a fantasy_leagues group. Public read (league pages are public-view). No direct client INSERT/UPDATE — membership only changes via RPCs (fantasy_create_league, fantasy_join_league, fantasy_accept_league_invite, fantasy_remove_league_member). DELETE allowed only for self (user_id = auth.uid()); commissioner-initiated removal goes through fantasy_remove_league_member.';
comment on column public.fantasy_league_members.member_display_name is 'Denormalized profiles.display_name. Synced by fantasy_sync_league_member_identity on insert/update, and fanned out from profiles on display_name/username edits (mirrors fantasy_teams.owner_display_name pattern).';

-- ── Denormalization trigger: force member_display_name/member_username from
-- profiles on every insert/update, mirroring fantasy_sync_owner_username. ──
create or replace function public.fantasy_sync_league_member_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select display_name, username
    into new.member_display_name, new.member_username
  from public.profiles
  where id = new.user_id;
  return new;
end;
$$;

create trigger fantasy_league_members_sync_identity
  before insert or update on public.fantasy_league_members
  for each row execute function public.fantasy_sync_league_member_identity();

revoke execute on function public.fantasy_sync_league_member_identity() from anon, authenticated, public;

-- ── Fan-out: propagate profile display_name/username edits to any league
-- memberships, same as sync_fantasy_owner_identity does for fantasy_teams. ──
create or replace function public.fantasy_resync_league_member_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.display_name is distinct from old.display_name
     or new.username is distinct from old.username then
    update public.fantasy_league_members
      set member_display_name = new.display_name,
          member_username     = new.username
      where user_id = new.id;
  end if;
  return new;
end;
$$;

create trigger fantasy_resync_league_member_identity_on_profile
  after update of display_name, username on public.profiles
  for each row execute function public.fantasy_resync_league_member_identity();

revoke execute on function public.fantasy_resync_league_member_identity() from anon, authenticated, public;

-- ── Auto-membership: owner becomes commissioner on league creation. ──
create or replace function public.fantasy_seed_league_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.fantasy_league_members (league_id, user_id, role)
  values (new.id, new.owner_id, 'commissioner');
  return new;
end;
$$;

create trigger fantasy_leagues_seed_owner_membership
  after insert on public.fantasy_leagues
  for each row execute function public.fantasy_seed_league_owner_membership();

revoke execute on function public.fantasy_seed_league_owner_membership() from anon, authenticated, public;

notify pgrst, 'reload schema';

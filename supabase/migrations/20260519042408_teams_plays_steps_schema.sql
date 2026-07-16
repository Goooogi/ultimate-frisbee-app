-- ─────────────────────────────────────────────────────────────
-- Teams / Plays / Steps schema for The Playbook
-- ─────────────────────────────────────────────────────────────

-- Roles for membership + pending invites. owner is the team creator (one
-- per team, transferable later if needed); coach can edit plays + manage
-- invites; member is view-only.
create type public.team_role as enum ('owner', 'coach', 'member');

-- ── teams ───────────────────────────────────────────────────────────────
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  short_name text not null check (short_name ~ '^[A-Z0-9]{2,4}$'),
  color text not null check (color ~* '^#[0-9a-f]{6}$'),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index teams_owner_idx on public.teams (owner_id);

-- ── team_members ────────────────────────────────────────────────────────
create table public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.team_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create index team_members_user_idx on public.team_members (user_id);

-- ── team_invites ────────────────────────────────────────────────────────
create table public.team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  email text not null,
  role public.team_role not null default 'member',
  token text not null unique,
  invited_by uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  -- An email can have only one outstanding invite per team at a time.
  -- Once accepted, accepted_at is set and a new invite can be issued.
  constraint team_invites_email_lower check (email = lower(email))
);

create unique index team_invites_unique_pending
  on public.team_invites (team_id, email)
  where accepted_at is null;

create index team_invites_email_idx on public.team_invites (email);

-- ── plays ───────────────────────────────────────────────────────────────
-- Exactly one of owner_id (personal) / team_id (team-scoped) must be set.
create table public.plays (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  formation text not null check (formation in ('vert','ho','hex','split-23','split-32','empty','custom')),
  field_type text not null default 'full' check (field_type in ('full','half','horizontal')),
  owner_id uuid references public.profiles(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plays_owner_xor_team check (
    (owner_id is null) <> (team_id is null)
  )
);

create index plays_owner_idx on public.plays (owner_id) where owner_id is not null;
create index plays_team_idx on public.plays (team_id) where team_id is not null;
create index plays_created_by_idx on public.plays (created_by);

-- ── play_steps ──────────────────────────────────────────────────────────
-- One row per step. `payload` holds the editor state (players, defenders,
-- disc, drawings) — same shape as our localStorage Step today. Keeping it
-- as JSONB means each step write is a single row update, which matches the
-- editor's "save as you drag" cadence without burning per-piece rows.
create table public.play_steps (
  id uuid primary key default gen_random_uuid(),
  play_id uuid not null references public.plays(id) on delete cascade,
  position int not null check (position >= 0),
  duration_ms int not null default 700 check (duration_ms between 0 and 10000),
  note text,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (play_id, position)
);

create index play_steps_play_idx on public.play_steps (play_id, position);

-- ── updated_at triggers ─────────────────────────────────────────────────
-- Reuse the helper pattern from profiles. One generic function we attach
-- to every table that has updated_at.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.set_updated_at() from anon, authenticated, public;

create trigger teams_set_updated_at
  before update on public.teams
  for each row execute function public.set_updated_at();

create trigger plays_set_updated_at
  before update on public.plays
  for each row execute function public.set_updated_at();

create trigger play_steps_set_updated_at
  before update on public.play_steps
  for each row execute function public.set_updated_at();

-- ── teams ownership trigger ─────────────────────────────────────────────
-- When a team is created we auto-insert the creator as the owner in
-- team_members. SECURITY DEFINER so we can write to team_members even
-- though the policy hasn't seen this membership yet.
create or replace function public.handle_new_team()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.team_members (team_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;

revoke execute on function public.handle_new_team() from anon, authenticated, public;

create trigger teams_seed_owner
  after insert on public.teams
  for each row execute function public.handle_new_team();

-- ─────────────────────────────────────────────────────────────
-- Helper functions used inside RLS policies. Keeping them as
-- STABLE SECURITY DEFINER lets policies stay readable.
-- ─────────────────────────────────────────────────────────────

-- Is the caller a member of the given team?
create or replace function public.is_team_member(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.team_members tm
    where tm.team_id = p_team_id
      and tm.user_id = (select auth.uid())
  );
$$;

revoke execute on function public.is_team_member(uuid) from public;
grant execute on function public.is_team_member(uuid) to authenticated;

-- Does the caller have editor rights on the team? (owner or coach)
create or replace function public.is_team_editor(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.team_members tm
    where tm.team_id = p_team_id
      and tm.user_id = (select auth.uid())
      and tm.role in ('owner','coach')
  );
$$;

revoke execute on function public.is_team_editor(uuid) from public;
grant execute on function public.is_team_editor(uuid) to authenticated;

-- Does the caller own the given play (personal play check)?
create or replace function public.can_edit_play(p_play_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.plays p
    where p.id = p_play_id
      and (
        p.owner_id = (select auth.uid())
        or (p.team_id is not null and public.is_team_editor(p.team_id))
      )
  );
$$;

revoke execute on function public.can_edit_play(uuid) from public;
grant execute on function public.can_edit_play(uuid) to authenticated;

create or replace function public.can_view_play(p_play_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.plays p
    where p.id = p_play_id
      and (
        p.owner_id = (select auth.uid())
        or (p.team_id is not null and public.is_team_member(p.team_id))
      )
  );
$$;

revoke execute on function public.can_view_play(uuid) from public;
grant execute on function public.can_view_play(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- RLS policies
-- ─────────────────────────────────────────────────────────────

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_invites enable row level security;
alter table public.plays enable row level security;
alter table public.play_steps enable row level security;

-- ── teams ───────────────────────────────────────────────────
create policy "teams_select_member"
  on public.teams for select to authenticated
  using (public.is_team_member(id));

create policy "teams_insert_self_owner"
  on public.teams for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "teams_update_owner"
  on public.teams for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "teams_delete_owner"
  on public.teams for delete to authenticated
  using (owner_id = (select auth.uid()));

-- ── team_members ────────────────────────────────────────────
-- Members can see their own teams' rosters.
create policy "team_members_select_member"
  on public.team_members for select to authenticated
  using (public.is_team_member(team_id));

-- Inserts: editors (owner+coach) can add anyone; the seed insert from the
-- handle_new_team trigger bypasses RLS because it's SECURITY DEFINER.
create policy "team_members_insert_editor"
  on public.team_members for insert to authenticated
  with check (public.is_team_editor(team_id));

-- Updates (role changes): owner only.
create policy "team_members_update_owner"
  on public.team_members for update to authenticated
  using (exists (
    select 1 from public.teams t
    where t.id = team_id and t.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.teams t
    where t.id = team_id and t.owner_id = (select auth.uid())
  ));

-- Deletes: editor can remove anyone OR a user can remove themselves.
create policy "team_members_delete_editor_or_self"
  on public.team_members for delete to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_team_editor(team_id)
  );

-- ── team_invites ────────────────────────────────────────────
-- Editors (owner + coach) of the team can see invites for that team.
-- The invitee reads their own invite via the accept_team_invite RPC,
-- which runs SECURITY DEFINER, so we don't need a row-readable policy
-- for the invitee.
create policy "team_invites_select_editor"
  on public.team_invites for select to authenticated
  using (public.is_team_editor(team_id));

create policy "team_invites_insert_editor"
  on public.team_invites for insert to authenticated
  with check (public.is_team_editor(team_id) and invited_by = (select auth.uid()));

create policy "team_invites_delete_editor"
  on public.team_invites for delete to authenticated
  using (public.is_team_editor(team_id));

-- ── plays ───────────────────────────────────────────────────
create policy "plays_select_owner_or_team"
  on public.plays for select to authenticated
  using (
    owner_id = (select auth.uid())
    or (team_id is not null and public.is_team_member(team_id))
  );

-- Inserts:
--   • personal plays: owner_id = me, team_id is null, created_by = me
--   • team plays:     team_id is one I can edit, owner_id is null, created_by = me
create policy "plays_insert_self_or_team_editor"
  on public.plays for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (
      (owner_id = (select auth.uid()) and team_id is null)
      or (owner_id is null and team_id is not null and public.is_team_editor(team_id))
    )
  );

create policy "plays_update_owner_or_team_editor"
  on public.plays for update to authenticated
  using (
    owner_id = (select auth.uid())
    or (team_id is not null and public.is_team_editor(team_id))
  )
  with check (
    owner_id = (select auth.uid())
    or (team_id is not null and public.is_team_editor(team_id))
  );

create policy "plays_delete_owner_or_team_editor"
  on public.plays for delete to authenticated
  using (
    owner_id = (select auth.uid())
    or (team_id is not null and public.is_team_editor(team_id))
  );

-- ── play_steps ──────────────────────────────────────────────
-- Read/write depends on the parent play. We push the check into helper
-- functions so the policies stay short and consistent across all 4 ops.
create policy "play_steps_select_via_play"
  on public.play_steps for select to authenticated
  using (public.can_view_play(play_id));

create policy "play_steps_insert_via_play"
  on public.play_steps for insert to authenticated
  with check (public.can_edit_play(play_id));

create policy "play_steps_update_via_play"
  on public.play_steps for update to authenticated
  using (public.can_edit_play(play_id))
  with check (public.can_edit_play(play_id));

create policy "play_steps_delete_via_play"
  on public.play_steps for delete to authenticated
  using (public.can_edit_play(play_id));

-- ─────────────────────────────────────────────────────────────
-- Rename playbook tables to pb_* so The Playbook namespace stays
-- distinct from upcoming USAU scraper tables (usau_*).
--
-- Strategy: rename tables in place (ALTER TABLE RENAME) so all FK
-- relationships, indexes, and existing rows are preserved. Then
-- drop+recreate every policy, trigger, and function that references
-- the old names, since RLS body text doesn't auto-update on rename.
--
-- profiles is intentionally left alone — it's a general user table,
-- not playbook-specific.
-- ─────────────────────────────────────────────────────────────

-- ── 1. Drop policies (they reference table names in bodies) ───────────
drop policy if exists "teams_select_owner_or_member" on public.teams;
drop policy if exists "teams_insert_self_owner" on public.teams;
drop policy if exists "teams_update_owner" on public.teams;
drop policy if exists "teams_delete_owner" on public.teams;

drop policy if exists "team_members_select_member" on public.team_members;
drop policy if exists "team_members_insert_editor" on public.team_members;
drop policy if exists "team_members_update_owner" on public.team_members;
drop policy if exists "team_members_delete_guarded" on public.team_members;

drop policy if exists "team_invites_select_editor" on public.team_invites;
drop policy if exists "team_invites_insert_editor" on public.team_invites;
drop policy if exists "team_invites_delete_editor" on public.team_invites;

drop policy if exists "plays_select_owner_or_team" on public.plays;
drop policy if exists "plays_insert_self_or_team_editor" on public.plays;
drop policy if exists "plays_update_owner_or_team_editor" on public.plays;
drop policy if exists "plays_delete_owner_or_team_editor" on public.plays;

drop policy if exists "play_steps_select_via_play" on public.play_steps;
drop policy if exists "play_steps_insert_via_play" on public.play_steps;
drop policy if exists "play_steps_update_via_play" on public.play_steps;
drop policy if exists "play_steps_delete_via_play" on public.play_steps;

-- ── 2. Drop the playbook-specific triggers (we'll recreate after rename) ──
drop trigger if exists teams_set_updated_at on public.teams;
drop trigger if exists teams_seed_owner on public.teams;
drop trigger if exists team_members_guard_delete on public.team_members;
drop trigger if exists plays_set_updated_at on public.plays;
drop trigger if exists play_steps_set_updated_at on public.play_steps;

-- ── 3. Rename the tables ─────────────────────────────────────────────
alter table public.teams         rename to pb_teams;
alter table public.team_members  rename to pb_team_members;
alter table public.team_invites  rename to pb_team_invites;
alter table public.plays         rename to pb_plays;
alter table public.play_steps    rename to pb_play_steps;

-- Rename the team_role enum to pb_team_role so it doesn't collide if
-- USAU later wants its own role concept.
alter type public.team_role rename to pb_team_role;

-- ── 4. Recreate helper functions with new table names ────────────────
-- (Comments noting "do not revoke from authenticated" preserved verbatim.)
create or replace function public.is_team_member(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.pb_team_members tm
    where tm.team_id = p_team_id
      and tm.user_id = (select auth.uid())
  );
$$;
revoke execute on function public.is_team_member(uuid) from public;
grant execute on function public.is_team_member(uuid) to authenticated;
comment on function public.is_team_member(uuid) is
  'RLS helper. SECURITY DEFINER + authenticated EXECUTE is required so policies can call it. Returns only a boolean about the caller. Do NOT revoke from authenticated.';

create or replace function public.is_team_editor(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.pb_team_members tm
    where tm.team_id = p_team_id
      and tm.user_id = (select auth.uid())
      and tm.role in ('owner','coach')
  );
$$;
revoke execute on function public.is_team_editor(uuid) from public;
grant execute on function public.is_team_editor(uuid) to authenticated;
comment on function public.is_team_editor(uuid) is
  'RLS helper. SECURITY DEFINER + authenticated EXECUTE is required so policies can call it. Returns only a boolean about the caller. Do NOT revoke from authenticated.';

create or replace function public.can_view_play(p_play_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.pb_plays p
    where p.id = p_play_id
      and (
        p.owner_id = (select auth.uid())
        or (p.team_id is not null and public.is_team_member(p.team_id))
      )
  );
$$;
revoke execute on function public.can_view_play(uuid) from public;
grant execute on function public.can_view_play(uuid) to authenticated;
comment on function public.can_view_play(uuid) is
  'RLS helper. SECURITY DEFINER + authenticated EXECUTE is required so policies can call it. Returns only a boolean about the caller. Do NOT revoke from authenticated.';

create or replace function public.can_edit_play(p_play_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.pb_plays p
    where p.id = p_play_id
      and (
        p.owner_id = (select auth.uid())
        or (p.team_id is not null and public.is_team_editor(p.team_id))
      )
  );
$$;
revoke execute on function public.can_edit_play(uuid) from public;
grant execute on function public.can_edit_play(uuid) to authenticated;
comment on function public.can_edit_play(uuid) is
  'RLS helper. SECURITY DEFINER + authenticated EXECUTE is required so policies can call it. Returns only a boolean about the caller. Do NOT revoke from authenticated.';

-- ── 5. Recreate the seed-owner-on-insert trigger function ────────────
create or replace function public.handle_new_team()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.pb_team_members (team_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;
revoke execute on function public.handle_new_team() from anon, authenticated, public;

-- ── 6. Recreate the last-owner guard ─────────────────────────────────
create or replace function public.guard_team_member_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.pb_teams where id = old.team_id) then
    return old;
  end if;
  if old.role = 'owner' then
    if (
      select count(*) from public.pb_team_members
      where team_id = old.team_id and role = 'owner'
    ) <= 1 then
      raise exception 'cannot remove the last owner of a team';
    end if;
  end if;
  return old;
end;
$$;
revoke execute on function public.guard_team_member_delete() from anon, authenticated, public;

-- ── 7. Recreate the invite RPCs ──────────────────────────────────────
create or replace function public.create_team_invite(
  p_team_id uuid,
  p_email text,
  p_role public.pb_team_role default 'member'
)
returns table (token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_token text;
  v_expires_at timestamptz;
  v_email text := lower(trim(p_email));
begin
  if v_caller is null then
    raise exception 'not authenticated';
  end if;

  if not public.is_team_editor(p_team_id) then
    raise exception 'not authorized to invite to this team';
  end if;

  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid email';
  end if;

  if p_role = 'owner' then
    raise exception 'cannot invite as owner';
  end if;

  v_token := translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');
  v_expires_at := now() + interval '14 days';

  insert into public.pb_team_invites (team_id, email, role, token, invited_by, expires_at)
  values (p_team_id, v_email, p_role, v_token, v_caller, v_expires_at)
  on conflict (team_id, email) where accepted_at is null
  do update set
    token = excluded.token,
    role = excluded.role,
    invited_by = excluded.invited_by,
    expires_at = excluded.expires_at;

  return query select v_token, v_expires_at;
end;
$$;
revoke execute on function public.create_team_invite(uuid, text, public.pb_team_role) from public, anon;
grant execute on function public.create_team_invite(uuid, text, public.pb_team_role) to authenticated;
comment on function public.create_team_invite(uuid, text, public.pb_team_role) is
  'RPC. Authenticated team editors create invite rows server-side so token entropy is controlled.';

create or replace function public.accept_team_invite(p_token text)
returns table (team_id uuid, team_name text, role public.pb_team_role)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_caller_email text;
  v_invite public.pb_team_invites%rowtype;
  v_team_name text;
begin
  if v_caller is null then
    raise exception 'not authenticated';
  end if;

  select lower(email) into v_caller_email
  from auth.users
  where id = v_caller;

  update public.pb_team_invites
  set accepted_at = now()
  where token = p_token
    and accepted_at is null
    and expires_at > now()
    and email = v_caller_email
  returning * into v_invite;

  if not found then
    if exists (select 1 from public.pb_team_invites where token = p_token) then
      if exists (
        select 1 from public.pb_team_invites
        where token = p_token and accepted_at is not null
      ) then
        raise exception 'invite already used';
      elsif exists (
        select 1 from public.pb_team_invites
        where token = p_token and expires_at <= now()
      ) then
        raise exception 'invite expired';
      else
        raise exception 'invite was sent to a different email';
      end if;
    else
      raise exception 'invite not found';
    end if;
  end if;

  insert into public.pb_team_members (team_id, user_id, role)
  values (v_invite.team_id, v_caller, v_invite.role)
  on conflict (team_id, user_id) do update
    set role = excluded.role;

  select name into v_team_name from public.pb_teams where id = v_invite.team_id;

  return query select v_invite.team_id, v_team_name, v_invite.role;
end;
$$;
revoke execute on function public.accept_team_invite(text) from public, anon;
grant execute on function public.accept_team_invite(text) to authenticated;
comment on function public.accept_team_invite(text) is
  'RPC. Validates token + email against invite, attaches caller to team. SECURITY DEFINER because invitees do not have direct read on the invite row.';

-- ── 8. Recreate triggers on the renamed tables ───────────────────────
create trigger pb_teams_set_updated_at
  before update on public.pb_teams
  for each row execute function public.set_updated_at();

create trigger pb_teams_seed_owner
  after insert on public.pb_teams
  for each row execute function public.handle_new_team();

create trigger pb_team_members_guard_delete
  before delete on public.pb_team_members
  for each row execute function public.guard_team_member_delete();

create trigger pb_plays_set_updated_at
  before update on public.pb_plays
  for each row execute function public.set_updated_at();

create trigger pb_play_steps_set_updated_at
  before update on public.pb_play_steps
  for each row execute function public.set_updated_at();

-- ── 9. Recreate RLS policies on the renamed tables ───────────────────
-- pb_teams
create policy "pb_teams_select_owner_or_member"
  on public.pb_teams for select to authenticated
  using (
    owner_id = (select auth.uid())
    or public.is_team_member(id)
  );
create policy "pb_teams_insert_self_owner"
  on public.pb_teams for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "pb_teams_update_owner"
  on public.pb_teams for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "pb_teams_delete_owner"
  on public.pb_teams for delete to authenticated
  using (owner_id = (select auth.uid()));

-- pb_team_members
create policy "pb_team_members_select_member"
  on public.pb_team_members for select to authenticated
  using (public.is_team_member(team_id));
create policy "pb_team_members_insert_editor"
  on public.pb_team_members for insert to authenticated
  with check (public.is_team_editor(team_id));
create policy "pb_team_members_update_owner"
  on public.pb_team_members for update to authenticated
  using (exists (
    select 1 from public.pb_teams t
    where t.id = team_id and t.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.pb_teams t
    where t.id = team_id and t.owner_id = (select auth.uid())
  ));
create policy "pb_team_members_delete_guarded"
  on public.pb_team_members for delete to authenticated
  using (
    user_id = (select auth.uid())
    or (public.is_team_editor(team_id) and role <> 'owner')
  );

-- pb_team_invites
create policy "pb_team_invites_select_editor"
  on public.pb_team_invites for select to authenticated
  using (public.is_team_editor(team_id));
create policy "pb_team_invites_insert_editor"
  on public.pb_team_invites for insert to authenticated
  with check (public.is_team_editor(team_id) and invited_by = (select auth.uid()));
create policy "pb_team_invites_delete_editor"
  on public.pb_team_invites for delete to authenticated
  using (public.is_team_editor(team_id));

-- pb_plays
create policy "pb_plays_select_owner_or_team"
  on public.pb_plays for select to authenticated
  using (
    owner_id = (select auth.uid())
    or (team_id is not null and public.is_team_member(team_id))
  );
create policy "pb_plays_insert_self_or_team_editor"
  on public.pb_plays for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (
      (owner_id = (select auth.uid()) and team_id is null)
      or (owner_id is null and team_id is not null and public.is_team_editor(team_id))
    )
  );
create policy "pb_plays_update_owner_or_team_editor"
  on public.pb_plays for update to authenticated
  using (
    owner_id = (select auth.uid())
    or (team_id is not null and public.is_team_editor(team_id))
  )
  with check (
    owner_id = (select auth.uid())
    or (team_id is not null and public.is_team_editor(team_id))
  );
create policy "pb_plays_delete_owner_or_team_editor"
  on public.pb_plays for delete to authenticated
  using (
    owner_id = (select auth.uid())
    or (team_id is not null and public.is_team_editor(team_id))
  );

-- pb_play_steps
create policy "pb_play_steps_select_via_play"
  on public.pb_play_steps for select to authenticated
  using (public.can_view_play(play_id));
create policy "pb_play_steps_insert_via_play"
  on public.pb_play_steps for insert to authenticated
  with check (public.can_edit_play(play_id));
create policy "pb_play_steps_update_via_play"
  on public.pb_play_steps for update to authenticated
  using (public.can_edit_play(play_id))
  with check (public.can_edit_play(play_id));
create policy "pb_play_steps_delete_via_play"
  on public.pb_play_steps for delete to authenticated
  using (public.can_edit_play(play_id));

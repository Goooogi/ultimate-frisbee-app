-- ─────────────────────────────────────────────────────────────
-- Tighten team membership operations per security review:
--   1. last-owner self-removal would leave the team ownerless
--   2. accept_team_invite race lets the same token accept twice
--   3. direct DELETE on team_members lets a coach kick the owner
-- ─────────────────────────────────────────────────────────────

-- ── 1 + 3: replace the permissive DELETE policy with a thin guard ───
--   • A user may always remove THEMSELVES — unless they're the last owner,
--     in which case raise (handled by the trigger below).
--   • Editors may remove members and coaches, but NOT owners.
drop policy if exists "team_members_delete_editor_or_self" on public.team_members;

create policy "team_members_delete_guarded"
  on public.team_members for delete to authenticated
  using (
    -- Self-leave (last-owner check enforced in trigger)
    user_id = (select auth.uid())
    or (
      -- Editor removing a non-owner
      public.is_team_editor(team_id)
      and role <> 'owner'
    )
  );

-- Trigger guards what RLS can't express atomically: never let the last
-- owner's row disappear, regardless of how it's deleted (self or admin).
create or replace function public.guard_team_member_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
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

create trigger team_members_guard_delete
  before delete on public.team_members
  for each row execute function public.guard_team_member_delete();

-- ── 2: make accept_team_invite atomic ────────────────────────────────
-- The previous version SELECTed the invite, validated it, then UPDATEd
-- accepted_at in a separate statement. Two concurrent calls could pass
-- the SELECT check before either wrote — the second one would then fail
-- on the team_members PK collision (lucky) but the RPC would still
-- return a "success" via mismatched state. Move the accept into a single
-- UPDATE ... RETURNING so only the call that wins the race proceeds.
create or replace function public.accept_team_invite(p_token text)
returns table (team_id uuid, team_name text, role public.team_role)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_caller_email text;
  v_invite public.team_invites%rowtype;
  v_team_name text;
begin
  if v_caller is null then
    raise exception 'not authenticated';
  end if;

  select lower(email) into v_caller_email
  from auth.users
  where id = v_caller;

  -- Atomic: claim the invite by setting accepted_at IF it's still null,
  -- not expired, and the email matches. Anyone losing the race gets zero
  -- rows back here and we surface a clean error.
  update public.team_invites
  set accepted_at = now()
  where token = p_token
    and accepted_at is null
    and expires_at > now()
    and email = v_caller_email
  returning * into v_invite;

  if not found then
    -- Distinguish the failure case so the UI can show a real reason.
    if exists (select 1 from public.team_invites where token = p_token) then
      if exists (
        select 1 from public.team_invites
        where token = p_token and accepted_at is not null
      ) then
        raise exception 'invite already used';
      elsif exists (
        select 1 from public.team_invites
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

  insert into public.team_members (team_id, user_id, role)
  values (v_invite.team_id, v_caller, v_invite.role)
  on conflict (team_id, user_id) do update
    set role = excluded.role;

  select name into v_team_name from public.teams where id = v_invite.team_id;

  return query select v_invite.team_id, v_team_name, v_invite.role;
end;
$$;

revoke execute on function public.accept_team_invite(text) from public, anon;
grant execute on function public.accept_team_invite(text) to authenticated;

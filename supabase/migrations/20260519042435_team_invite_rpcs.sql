-- ─────────────────────────────────────────────────────────────
-- RPCs for the invite flow.
-- ─────────────────────────────────────────────────────────────

-- create_team_invite — generates a random token + inserts the row in one
-- call. We do this server-side instead of letting the client pick the
-- token so the token has a known entropy and format. Returns the token so
-- the client can build the share link.
create or replace function public.create_team_invite(
  p_team_id uuid,
  p_email text,
  p_role public.team_role default 'member'
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

  -- Owner role can't be granted via invite. Owners are created at team-
  -- create time only; transferring ownership is a future operation.
  if p_role = 'owner' then
    raise exception 'cannot invite as owner';
  end if;

  -- 32-byte url-safe-ish base64 token. We strip the padding + replace the
  -- two non-url-safe chars so this can drop into a URL without encoding.
  v_token := translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');
  v_expires_at := now() + interval '14 days';

  insert into public.team_invites (team_id, email, role, token, invited_by, expires_at)
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

revoke execute on function public.create_team_invite(uuid, text, public.team_role) from public, anon;
grant execute on function public.create_team_invite(uuid, text, public.team_role) to authenticated;

-- accept_team_invite — looks up an invite by token, validates expiry +
-- email match against the signed-in user, attaches them as a team member,
-- and marks the invite accepted. SECURITY DEFINER because the invitee
-- doesn't yet have a row-readable policy on the invite.
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

  select * into v_invite
  from public.team_invites
  where token = p_token
  limit 1;

  if not found then
    raise exception 'invite not found';
  end if;

  if v_invite.accepted_at is not null then
    raise exception 'invite already used';
  end if;

  if v_invite.expires_at < now() then
    raise exception 'invite expired';
  end if;

  if v_invite.email <> v_caller_email then
    -- Don't leak the expected email — just say it doesn't belong to us.
    raise exception 'invite was sent to a different email';
  end if;

  -- Insert membership (or update role if already a member somehow).
  insert into public.team_members (team_id, user_id, role)
  values (v_invite.team_id, v_caller, v_invite.role)
  on conflict (team_id, user_id) do update
    set role = excluded.role;

  update public.team_invites
  set accepted_at = now()
  where id = v_invite.id;

  select name into v_team_name from public.teams where id = v_invite.team_id;

  return query select v_invite.team_id, v_team_name, v_invite.role;
end;
$$;

revoke execute on function public.accept_team_invite(text) from public, anon;
grant execute on function public.accept_team_invite(text) to authenticated;

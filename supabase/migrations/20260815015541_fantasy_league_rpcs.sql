-- ─────────────────────────────────────────────────────────────────────────────
-- Fantasy Leagues & Contests — Phase 1, migration 8 of 8.
--
-- League/invite RPCs. All: SECURITY DEFINER, search_path='', REVOKE ALL FROM
-- PUBLIC (explicit — revoking only anon/authenticated is a silent no-op per
-- this codebase's prior incident), then GRANT EXECUTE to authenticated
-- (+anon for the preview RPC only). Token generation mirrors
-- create_team_invite: translate(encode(gen_random_bytes(32),'base64'),'+/=','-_').
-- ─────────────────────────────────────────────────────────────────────────────

-- ── fantasy_create_league ──
create or replace function public.fantasy_create_league(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_name text := trim(p_name);
  v_token text;
  v_id uuid;
begin
  if v_caller is null then
    raise exception 'not authenticated';
  end if;

  if char_length(v_name) < 1 or char_length(v_name) > 60 then
    raise exception 'league name must be between 1 and 60 characters';
  end if;

  v_token := translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');

  insert into public.fantasy_leagues (owner_id, name, invite_token)
  values (v_caller, v_name, v_token)
  returning id into v_id;

  -- Owner membership row is inserted by fantasy_leagues_seed_owner_membership.
  return v_id;
end;
$$;

revoke all on function public.fantasy_create_league(text) from public;
grant execute on function public.fantasy_create_league(text) to authenticated;

-- ── fantasy_get_league_code ──
create or replace function public.fantasy_get_league_code(p_league uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  if not public.fantasy_is_commissioner(p_league) then
    raise exception 'not authorized';
  end if;

  select invite_token into v_token from public.fantasy_leagues where id = p_league;
  return v_token;
end;
$$;

revoke all on function public.fantasy_get_league_code(uuid) from public;
grant execute on function public.fantasy_get_league_code(uuid) to authenticated;

-- ── fantasy_regenerate_league_code ──
create or replace function public.fantasy_regenerate_league_code(p_league uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  if not public.fantasy_is_commissioner(p_league) then
    raise exception 'not authorized';
  end if;

  v_token := translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');

  update public.fantasy_leagues set invite_token = v_token where id = p_league;

  return v_token;
end;
$$;

revoke all on function public.fantasy_regenerate_league_code(uuid) from public;
grant execute on function public.fantasy_regenerate_league_code(uuid) to authenticated;

-- ── fantasy_join_league (by shareable code) ──
create or replace function public.fantasy_join_league(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_league_id uuid;
begin
  if v_caller is null then
    raise exception 'not authenticated';
  end if;

  select id into v_league_id from public.fantasy_leagues where invite_token = p_code;

  if v_league_id is null then
    raise exception 'invite code not found';
  end if;

  insert into public.fantasy_league_members (league_id, user_id, role)
  values (v_league_id, v_caller, 'member')
  on conflict (league_id, user_id) do nothing;

  return v_league_id;
end;
$$;

revoke all on function public.fantasy_join_league(text) from public;
grant execute on function public.fantasy_join_league(text) to authenticated;

-- ── fantasy_create_league_invite (email) ──
create or replace function public.fantasy_create_league_invite(p_league uuid, p_email text)
returns table (token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_email text := lower(trim(p_email));
  v_token text;
  v_expires_at timestamptz;
begin
  if v_caller is null then
    raise exception 'not authenticated';
  end if;

  if not public.fantasy_is_commissioner(p_league) then
    raise exception 'not authorized to invite to this league';
  end if;

  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid email';
  end if;

  v_token := translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');
  v_expires_at := now() + interval '14 days';

  insert into public.fantasy_league_invites (league_id, email, token, invited_by, expires_at, last_sent_at)
  values (p_league, v_email, v_token, v_caller, v_expires_at, now())
  on conflict (league_id, email) where accepted_at is null
  do update set
    token = excluded.token,
    invited_by = excluded.invited_by,
    expires_at = excluded.expires_at,
    last_sent_at = now();

  return query select v_token, v_expires_at;
end;
$$;

revoke all on function public.fantasy_create_league_invite(uuid, text) from public;
grant execute on function public.fantasy_create_league_invite(uuid, text) to authenticated;

-- ── fantasy_preview_league_invite (unauthenticated preview) ──
create or replace function public.fantasy_preview_league_invite(p_token text)
returns table (league_name text, email text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select l.name, i.email
  from public.fantasy_league_invites i
  join public.fantasy_leagues l on l.id = i.league_id
  where i.token = p_token
    and i.accepted_at is null
    and i.expires_at > now()
  limit 1;
end;
$$;

revoke all on function public.fantasy_preview_league_invite(text) from public;
grant execute on function public.fantasy_preview_league_invite(text) to anon, authenticated;

-- ── fantasy_accept_league_invite ──
create or replace function public.fantasy_accept_league_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_caller_email text;
  v_invite public.fantasy_league_invites%rowtype;
begin
  if v_caller is null then
    raise exception 'not authenticated';
  end if;

  select lower(email) into v_caller_email from auth.users where id = v_caller;

  update public.fantasy_league_invites
  set accepted_at = now()
  where token = p_token
    and accepted_at is null
    and expires_at > now()
    and email = v_caller_email
  returning * into v_invite;

  if not found then
    if exists (select 1 from public.fantasy_league_invites where token = p_token) then
      if exists (select 1 from public.fantasy_league_invites where token = p_token and accepted_at is not null) then
        raise exception 'invite already used';
      elsif exists (select 1 from public.fantasy_league_invites where token = p_token and expires_at <= now()) then
        raise exception 'invite expired';
      else
        raise exception 'invite was sent to a different email';
      end if;
    else
      raise exception 'invite not found';
    end if;
  end if;

  insert into public.fantasy_league_members (league_id, user_id, role)
  values (v_invite.league_id, v_caller, 'member')
  on conflict (league_id, user_id) do nothing;

  return v_invite.league_id;
end;
$$;

revoke all on function public.fantasy_accept_league_invite(text) from public;
grant execute on function public.fantasy_accept_league_invite(text) to authenticated;

-- ── fantasy_remove_league_member (commissioner-initiated removal) ──
create or replace function public.fantasy_remove_league_member(p_league uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid;
begin
  if not public.fantasy_is_commissioner(p_league) then
    raise exception 'not authorized';
  end if;

  select owner_id into v_owner_id from public.fantasy_leagues where id = p_league;

  if p_user = v_owner_id then
    raise exception 'cannot remove the league owner';
  end if;

  delete from public.fantasy_league_members
  where league_id = p_league and user_id = p_user;
end;
$$;

revoke all on function public.fantasy_remove_league_member(uuid, uuid) from public;
grant execute on function public.fantasy_remove_league_member(uuid, uuid) to authenticated;

-- ── fantasy_leave_league (self-leave; owner blocked) ──
create or replace function public.fantasy_leave_league(p_league uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_owner_id uuid;
begin
  if v_caller is null then
    raise exception 'not authenticated';
  end if;

  select owner_id into v_owner_id from public.fantasy_leagues where id = p_league;

  if v_caller = v_owner_id then
    raise exception 'the league owner cannot leave — transfer ownership or delete the league instead';
  end if;

  delete from public.fantasy_league_members
  where league_id = p_league and user_id = v_caller;
end;
$$;

revoke all on function public.fantasy_leave_league(uuid) from public;
grant execute on function public.fantasy_leave_league(uuid) to authenticated;

notify pgrst, 'reload schema';

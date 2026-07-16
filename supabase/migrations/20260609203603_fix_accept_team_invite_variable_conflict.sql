CREATE OR REPLACE FUNCTION public.accept_team_invite(p_token text)
 RETURNS TABLE(team_id uuid, team_name text, role pb_team_role)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare
  v_caller uuid := (select auth.uid());
  v_caller_email text;
  v_invite public.pb_team_invites%rowtype;
  v_team_name text;
  v_out_team_id uuid;
  v_out_role public.pb_team_role;
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

  v_out_team_id := v_invite.team_id;
  v_out_role := v_invite.role;

  insert into public.pb_team_members (team_id, user_id, role)
  values (v_out_team_id, v_caller, v_out_role)
  on conflict (team_id, user_id) do update
    set role = excluded.role;

  select name into v_team_name from public.pb_teams where id = v_out_team_id;

  team_id   := v_out_team_id;
  team_name := v_team_name;
  role      := v_out_role;
  return next;
end;
$function$;
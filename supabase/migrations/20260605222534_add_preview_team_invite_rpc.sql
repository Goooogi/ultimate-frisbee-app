-- preview_team_invite: given an invite token, return ONLY the invited email +
-- team name, for prefilling the signup form on the accept page. Returns no row
-- if the token is invalid/expired/already-accepted (so the UI just doesn't
-- prefill). Safe to call anonymously: whoever has the token already received it
-- in the email, so revealing the address it was sent to leaks nothing new. We
-- deliberately expose nothing beyond email + team name (no role, ids, inviter).
create or replace function public.preview_team_invite(p_token text)
returns table(email text, team_name text)
language plpgsql
security definer
set search_path to ''
as $$
begin
  return query
  select i.email, t.name
  from public.pb_team_invites i
  join public.pb_teams t on t.id = i.team_id
  where i.token = p_token
    and i.accepted_at is null
    and i.expires_at > now()
  limit 1;
end;
$$;

-- Allow anon + authenticated to call it (the accept page runs pre-auth).
grant execute on function public.preview_team_invite(text) to anon, authenticated;
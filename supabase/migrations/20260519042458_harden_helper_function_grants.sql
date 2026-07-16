-- The is_*/can_* helpers are used inside RLS policies, not as REST RPCs.
-- Revoke from anon (already done) and leave authenticated grants in place
-- only so policy evaluation can call them. The advisor flags any
-- authenticated-callable SECURITY DEFINER function — these intentionally
-- are, since RLS-time evaluation runs as the calling role. The risk is
-- minimal: each helper only ever returns a boolean indicating something
-- the caller could already learn by attempting the query directly.
--
-- Documenting that decision in-DB via comments so a future reviewer
-- doesn't try to revoke the grant and break RLS.
comment on function public.is_team_member(uuid) is
  'RLS helper. SECURITY DEFINER + authenticated EXECUTE is required so policies can call it. Returns only a boolean about the caller. Do NOT revoke from authenticated.';

comment on function public.is_team_editor(uuid) is
  'RLS helper. SECURITY DEFINER + authenticated EXECUTE is required so policies can call it. Returns only a boolean about the caller. Do NOT revoke from authenticated.';

comment on function public.can_view_play(uuid) is
  'RLS helper. SECURITY DEFINER + authenticated EXECUTE is required so policies can call it. Returns only a boolean about the caller. Do NOT revoke from authenticated.';

comment on function public.can_edit_play(uuid) is
  'RLS helper. SECURITY DEFINER + authenticated EXECUTE is required so policies can call it. Returns only a boolean about the caller. Do NOT revoke from authenticated.';

comment on function public.create_team_invite(uuid, text, public.team_role) is
  'RPC. Authenticated team editors create invite rows server-side so token entropy is controlled.';

comment on function public.accept_team_invite(text) is
  'RPC. Validates token + email against invite, attaches caller to team. SECURITY DEFINER because invitees do not have direct read on the invite row.';

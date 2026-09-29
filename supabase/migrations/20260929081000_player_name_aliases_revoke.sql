-- Hygiene for 20260929080000: postgres's default ACL grants EXECUTE on new
-- public functions to anon/authenticated directly, so revoking from PUBLIC
-- alone left them callable. Trigger functions can't be invoked outside a
-- trigger anyway; this just clears the grant (and the security advisor).
revoke execute on function public._player_name_aliases_stale_profiles() from public, anon, authenticated;
revoke execute on function public._player_name_aliases_normalize() from public, anon, authenticated;

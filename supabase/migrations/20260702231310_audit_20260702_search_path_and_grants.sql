alter function public.top_usau_club_teams(p_gender_division text, p_limit integer) set search_path = '';
alter function public.distinct_usau_seasons() set search_path = '';

revoke execute on function public.check_player_content_rate_limit() from public, anon, authenticated;
revoke execute on function public.guard_profile_role_change()       from public, anon, authenticated;
revoke execute on function public.set_player_content_updated_at()   from public, anon, authenticated;
revoke execute on function public.rls_auto_enable()                 from public, anon, authenticated;
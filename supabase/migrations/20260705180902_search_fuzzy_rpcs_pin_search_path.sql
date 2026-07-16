
-- Harden the fuzzy search functions: pin search_path so name resolution is fixed
-- (public + extensions for word_similarity/%). Addresses the advisor
-- function_search_path_mutable warning.
alter function public.search_usau_teams_fuzzy(text, int)   set search_path = public, extensions;
alter function public.search_usau_players_fuzzy(text, int)  set search_path = public, extensions;
alter function public.search_usau_events_fuzzy(text, int)   set search_path = public, extensions;
alter function public.search_wfdf_teams_fuzzy(text, int)    set search_path = public, extensions;
alter function public.search_wfdf_players_fuzzy(text, int)  set search_path = public, extensions;
alter function public.search_wfdf_events_fuzzy(text, int)   set search_path = public, extensions;

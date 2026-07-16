-- Correction: these two functions reference public tables unqualified, so an
-- empty search_path breaks them. Pin to 'public' instead — still non-mutable
-- (clears the advisor) and resolves their unqualified table references.
alter function public.top_usau_club_teams(p_gender_division text, p_limit integer) set search_path = public;
alter function public.distinct_usau_seasons() set search_path = public;
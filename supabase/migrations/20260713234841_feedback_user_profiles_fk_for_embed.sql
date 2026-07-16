
-- The admin feedback inbox (getAllFeedback) embeds
--   feedback.select('..., profiles:user_id(display_name, username)')
-- PostgREST resolves an embed of the `profiles` table via a FK from feedback to
-- profiles. feedback.user_id only had a FK to auth.users(id) — NOT to profiles —
-- so PostgREST couldn't build a feedback→profiles relationship and returned
-- PGRST200; getAllFeedback threw and /admin/content crashed.
--
-- profiles.id == auth.users.id (profiles PK mirrors the auth user id), so adding
-- a second FK from feedback.user_id to profiles(id) is safe and is the standard
-- Supabase pattern for enabling a profiles embed. Distinct constraint name
-- (…_profiles_fkey) since …_user_id_fkey already exists for the auth.users FK.
-- The embed is disambiguated in the query by this constraint name.

ALTER TABLE public.feedback
  ADD CONSTRAINT feedback_user_id_profiles_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';

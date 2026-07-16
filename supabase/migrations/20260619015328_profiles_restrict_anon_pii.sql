DROP POLICY IF EXISTS profiles_select_all ON public.profiles;

CREATE POLICY profiles_select_authenticated ON public.profiles
  FOR SELECT TO authenticated
  USING (true);

CREATE OR REPLACE VIEW public.profiles_public
  WITH (security_invoker = on) AS
  SELECT id, display_name, username, avatar_url
  FROM public.profiles;

GRANT SELECT ON public.profiles_public TO anon, authenticated;
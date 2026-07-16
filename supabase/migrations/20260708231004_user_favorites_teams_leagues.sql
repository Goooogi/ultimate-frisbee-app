-- Per-user favorite teams and leagues. Private to the owner (unlike profiles,
-- whose SELECT is authenticated-wide). A favorite team is stored as the
-- (league, team_id) pair the app already routes on (resultHref), with name +
-- logo denormalized so lists render without joining 6 league tables.

CREATE TABLE IF NOT EXISTS public.user_favorite_teams (
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  league     text NOT NULL CHECK (league IN ('ufa','usau','pul','wul','wfdf')),
  team_id    text NOT NULL,
  name       text NOT NULL,
  logo_url   text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, league, team_id)
);

CREATE TABLE IF NOT EXISTS public.user_favorite_leagues (
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  league     text NOT NULL CHECK (league IN ('ufa','usau','pul','wul','wfdf')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, league)
);

-- Fast "my favorites" lookups (PK already leads with user_id, but be explicit).
CREATE INDEX IF NOT EXISTS user_favorite_teams_user_idx
  ON public.user_favorite_teams (user_id, created_at DESC);

ALTER TABLE public.user_favorite_teams   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_favorite_leagues ENABLE ROW LEVEL SECURITY;

-- Owner-only on EVERY command (private data — no authenticated-wide SELECT).
CREATE POLICY user_favorite_teams_select_own ON public.user_favorite_teams
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY user_favorite_teams_insert_own ON public.user_favorite_teams
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY user_favorite_teams_update_own ON public.user_favorite_teams
  FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY user_favorite_teams_delete_own ON public.user_favorite_teams
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

CREATE POLICY user_favorite_leagues_select_own ON public.user_favorite_leagues
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY user_favorite_leagues_insert_own ON public.user_favorite_leagues
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY user_favorite_leagues_delete_own ON public.user_favorite_leagues
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);
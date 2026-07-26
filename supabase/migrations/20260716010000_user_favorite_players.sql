-- Per-user favorite PLAYERS — the third favorite kind alongside teams + leagues
-- (For You feature, phase 1). Private to the owner, same RLS shape as
-- user_favorite_teams. A favorite player is stored as the (league, player_id)
-- pair the app already routes on (resultHref's player branch), with name /
-- team / headshot denormalized so the feed renders without joining league
-- player tables.
--
-- player_id semantics mirror SearchResult.id for players:
--   - anchor leagues (ufa/usau/pul/wul) → the player's UUID → /players/{id}
--   - wfdf                              → the player's NAME  → /wfdf/players/by-name/{name}
-- so the (league, player_id) pair is exactly what resultHref needs. team_name
-- is the SearchResult.hint (their team) for the feed's secondary line;
-- headshot_url is UFA-only (the only league with player headshots) and null
-- elsewhere → the card falls back to an initials monogram.

CREATE TABLE IF NOT EXISTS public.user_favorite_players (
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  league       text NOT NULL CHECK (league IN ('ufa','usau','pul','wul','wfdf')),
  player_id    text NOT NULL,
  name         text NOT NULL,
  team_name    text,
  headshot_url text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, league, player_id)
);

-- Fast "my favorites" lookups (PK already leads with user_id, but be explicit).
CREATE INDEX IF NOT EXISTS user_favorite_players_user_idx
  ON public.user_favorite_players (user_id, created_at DESC);

ALTER TABLE public.user_favorite_players ENABLE ROW LEVEL SECURITY;

-- Owner-only on EVERY command (private data — no authenticated-wide SELECT).
CREATE POLICY user_favorite_players_select_own ON public.user_favorite_players
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY user_favorite_players_insert_own ON public.user_favorite_players
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY user_favorite_players_update_own ON public.user_favorite_players
  FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY user_favorite_players_delete_own ON public.user_favorite_players
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

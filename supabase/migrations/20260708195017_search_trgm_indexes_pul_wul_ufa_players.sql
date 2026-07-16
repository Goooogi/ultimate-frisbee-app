-- Trigram indexes so PUL/WUL/UFA player search can run DB-side (word_similarity
-- + ilike) instead of fetch-all-then-filter-in-Node. Mirrors the existing
-- wfdf_rosters / usau_players trigram indexes.
CREATE INDEX IF NOT EXISTS pul_players_player_name_trgm
  ON public.pul_players USING gin (player_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS wul_players_player_name_trgm
  ON public.wul_players USING gin (player_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ufa_players_full_name_trgm
  ON public.ufa_players USING gin (full_name gin_trgm_ops);
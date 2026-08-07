-- PostgREST's on_conflict= can only target a real UNIQUE CONSTRAINT, not a
-- partial unique INDEX. The init migration used
--   CREATE UNIQUE INDEX ... WHERE euf_game_id IS NOT NULL
-- and every games upsert failed with "no unique or exclusion constraint
-- matching the ON CONFLICT specification".
--
-- Swap it for a plain constraint: Postgres treats NULLs as distinct in
-- uniqueness, so id-less forfeit rows (games with no gameplay page) still
-- insert. euf-ingest keeps those idempotent by deleting them before re-insert.
DROP INDEX IF EXISTS idx_euf_games_source;

ALTER TABLE euf_games
  ADD CONSTRAINT euf_games_event_source_key UNIQUE (event_id, euf_game_id);

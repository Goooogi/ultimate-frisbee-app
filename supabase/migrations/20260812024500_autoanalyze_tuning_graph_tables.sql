-- player_edges (411 MB / 1.58M rows) and player_nodes (53 MB / 57k rows) had
-- NEVER been analyzed: last_analyze and last_autoanalyze were both null, so
-- there were no column statistics for the name_a/name_b lookups that every
-- get_player_connections call drives. (reltuples was populated, so row counts
-- were right -- it was the distribution data that was missing.)
--
-- These are rebuild-in-bulk tables (rebuild_player_edges() truncates + reloads),
-- so the default 0.1 scale factor fits them poorly for the same reason it
-- misfit the scrape tables in autoanalyze_tuning_scrape_tables: the rebuild
-- replaces everything at once, then nothing changes for days.
alter table public.player_edges set (autovacuum_analyze_scale_factor = 0.02);
alter table public.player_nodes set (autovacuum_analyze_scale_factor = 0.02);

analyze public.player_edges;
analyze public.player_nodes;

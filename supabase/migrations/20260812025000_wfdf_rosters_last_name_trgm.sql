-- getWfdfPlayerStints() filters `last_name ILIKE '%frag%'` (src/lib/wfdf/data.ts).
--
-- The code comment there claimed this was "indexed on lower(last_name)", but a
-- btree on lower(last_name) cannot serve a LEADING-wildcard ILIKE on the RAW
-- column, and the pre-existing trgm index is on normalize_player_name(last_name)
-- -- also a different expression. Neither was usable.
--
-- Result: Seq Scan with 24,480 rows removed by filter, on all 68,694 calls
-- = 1.9 CPU-hours / 13% of total DB time in a 12h window.
-- After: Bitmap Index Scan, 562 buffers -> 12, 48.8ms -> 0.21ms.
--
-- gin_trgm_ops on the EXACT expression the query uses is what makes a
-- leading-wildcard ilike indexable.
--
-- Applied to the live DB as a raw CREATE INDEX CONCURRENTLY (which cannot run
-- inside a migration's transaction block); this idempotent form is a no-op
-- there and meaningful when replaying onto a fresh database.
create index if not exists wfdf_rosters_last_name_raw_trgm
  on public.wfdf_rosters using gin (last_name gin_trgm_ops);

analyze public.wfdf_rosters;

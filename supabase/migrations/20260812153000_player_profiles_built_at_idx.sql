-- player_profiles.built_at index — prerequisite for the async trickle rebuild.
--
-- Background (2026-08-12 outage, vault "Supabase Load Diagnosis 2026-08-11"):
-- get_player_profile rebuilds INLINE on read once a row passes its 24h TTL, so
-- a crawler sweeping 182k profiles turns nearly every hit into a ~300ms cold
-- rebuild. The fix is to serve stale and rebuild in a bounded background
-- trickle — but that trickle's "find the oldest stale rows" query would itself
-- be a full scan of 182k rows / 552MB on every tick, because the ONLY index on
-- this table was pkey(anchor_id). That would add load rather than remove it.
--
-- CONCURRENTLY so the 552MB table keeps serving reads while the index builds.
-- Note: this cannot run inside a transaction block, so it must be applied on
-- its own (the Supabase migration runner handles single statements fine).
create index concurrently if not exists player_profiles_built_at_idx
  on public.player_profiles (built_at);

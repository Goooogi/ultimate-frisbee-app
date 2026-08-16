-- Field number for WFDF game cards ("Field 12"). Sourced from the modern
-- live-cache reference.json reservations[] (id → fieldname), joined by
-- wfdf games' reservation id at ingest (wfdf-ingest modern path; fieldname,
-- falling back to name/location for events that shape it differently).
-- Nullable — legacy (Ultiorganizer) events and rows ingested before
-- 2026-08-16 stay null until re-ingested. WUCC 2026 backfilled 656/656 by
-- re-invoking the live ingest after deploy.
alter table public.wfdf_games add column if not exists field_name text;

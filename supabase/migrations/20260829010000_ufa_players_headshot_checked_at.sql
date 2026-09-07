-- Track WHEN we last looked for a player's headshot, so a player who genuinely
-- has no image on watchufa is not re-scraped on every sync/backfill run.
--
-- Why this exists: the sync has a 40-fetch-per-run budget and only skipped
-- players whose headshot_url was already set. Players with no upstream image
-- were therefore retried forever, burning the entire budget on the same
-- early-alphabet ids and leaving ~1,858 rows permanently null — players late in
-- the alphabet (e.g. wfrankenb) were never reached at all.
--
-- NULL  = never checked        → candidate for a fetch
-- set   = checked at that time → skip unless the row is stale / a forced re-run
alter table public.ufa_players
  add column if not exists headshot_checked_at timestamptz;

comment on column public.ufa_players.headshot_checked_at is
  'Last time we scraped watchufa for this player''s headshot. NULL = never checked. Set even when no image was found, so imageless players are not re-fetched every run.';

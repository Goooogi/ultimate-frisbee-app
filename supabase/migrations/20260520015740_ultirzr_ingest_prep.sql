-- Prep for ingest-from-ultirzr:
--
-- 1. Add usau_event_id (numeric USAU/ultirzr id) to usau_events. Lets us
--    match on a stable key even if a slug ever changes capitalization or
--    naming. Nullable because our existing rows came from HTML scraping
--    and don't have it yet — backfill happens on first ingest.
--
-- 2. Replace the strict UNIQUE on usau_slug with a case-insensitive unique
--    index. Reason: ultirzr returns lowercased slugs (e.g.
--    "2025-usau-pro-championships") but our existing rows are mixed-case
--    ("2025-USAU-Pro-Championships"). USAU routes are case-insensitive,
--    so these are the same event — without a CI index we'd dupe.

alter table public.usau_events
  add column if not exists usau_event_id bigint;

create unique index if not exists usau_events_usau_event_id_idx
  on public.usau_events (usau_event_id)
  where usau_event_id is not null;

-- Drop the existing case-sensitive unique constraint on usau_slug, replace
-- with a unique index on lower(usau_slug). Done in two steps so we don't
-- break any FK that depends on usau_events.id (none do, but defensive).
alter table public.usau_events
  drop constraint if exists usau_events_usau_slug_key;

create unique index if not exists usau_events_usau_slug_lower_idx
  on public.usau_events (lower(usau_slug));

comment on column public.usau_events.usau_event_id is
  'Numeric event id from USAU (via ultirzr). Stable across renames; nullable for legacy rows scraped before we discovered ultirzr.';

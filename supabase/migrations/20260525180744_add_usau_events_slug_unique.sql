
-- Plain unique constraint on usau_slug so PostgREST upsert with
-- onConflict='usau_slug' can resolve the conflict target. The existing
-- functional index on lower(usau_slug) is a separate object and PostgREST
-- doesn't introspect it. We keep the lower() index too — it covers
-- case-insensitive lookups used by some queries — but a literal unique
-- constraint is what the upsert needs.
alter table public.usau_events
  add constraint usau_events_usau_slug_key unique (usau_slug);

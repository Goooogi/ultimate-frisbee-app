-- USAU venue timezone, resolved at scrape time by sync-event-details: from the
-- event's US state, or — when USAU lists the venue as "TBD" (every 2026
-- Sectional) — inferred from the entrant teams' home states. The web/mobile
-- time formatters read it ahead of `state`, so game times render as the
-- venue's wall clock instead of being dropped to date-only.
alter table public.usau_events add column if not exists venue_tz text;

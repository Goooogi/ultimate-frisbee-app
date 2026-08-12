-- Keep usau_player_prestige (see 20260811230000) from going stale.
--
-- The matview feeds the prestige boost in search_usau_players_fuzzy. It's
-- derived from usau_rosters ⋈ usau_event_teams ⋈ usau_events, all of which only
-- change when the USAU scraper ingests. Nothing refreshes it automatically, so
-- without this a newly-crowned champion never gets their +30 search boost.
--
-- WHY CRON AND NOT A TRIGGER: the _stale_player_profile() triggers on the stat
-- tables are cheap because they only flip a flag. A refresh trigger would
-- rebuild the WHOLE matview per affected row — catastrophic during a bulk
-- roster scrape. This is periodic upkeep of derived data, not a backfill.
--
-- Cost measured 2026-08-11: 312 ms, CONCURRENTLY (non-blocking — readers keep
-- seeing the old snapshot until the swap). Matview is 1064 kB / 12,312 rows.
--
-- Timing: jobid 6 `sync-event-rosters-thu-sun` posts at 08:10 UTC and is the
-- job that writes rosters. 09:20 UTC leaves it a wide margin to finish, and
-- sits clear of the 03:00-06:00 resolver window and the :07/:22/:37/:52 and
-- */3 live-sync slots. Daily (not weekly) because placements land the same
-- weekend a championship finishes.
--
-- CONCURRENTLY requires the unique index usau_player_prestige_pk, created in
-- the previous migration. It also cannot run inside a transaction block, which
-- is why this is a plain cron command rather than a wrapped function call.

select cron.schedule(
  'refresh-usau-player-prestige-daily',
  '20 9 * * *',
  $$refresh materialized view concurrently public.usau_player_prestige$$
);

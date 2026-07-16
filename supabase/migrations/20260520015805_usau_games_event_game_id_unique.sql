-- ultirzr ingest will populate usau_event_game_id with its numeric
-- EventGameId (e.g. 702376532). Make it the canonical idempotency key
-- for game upserts.
--
-- Existing scraped values from sync-event-details are URL-encoded base64
-- ids — a different format but in the same column. We'll backfill or
-- clear them as part of re-ingesting from ultirzr.

create unique index if not exists usau_games_usau_event_game_id_key
  on public.usau_games (usau_event_game_id)
  where usau_event_game_id is not null;

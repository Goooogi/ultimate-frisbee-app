-- WUL schedule ingestion (2026-09-13). NOT YET APPLIED — Hunter's go needed.
-- Order: deploy the wul-schedule-sync edge function first (the cron below
-- calls it), and ship the web + mobile read-path changes that handle
-- 'scheduled' WUL rows before the first run writes any.
--
-- Until now wul_games only ever held finals (the stats dashboard has no
-- fixtures), so WUL looked off-season until its first result each March, and
-- a WUL fantasy contest had no weeks to lock. The league publishes the season's
-- schedule months ahead as a Google Sheet on its site; wul-schedule-sync reads
-- it daily and writes unplayed games as status 'scheduled'. ingest-wul.py
-- turns the same row 'final' when the result lands.

-- Kick-off as published ('4pm PT', '7:30pm PT'). Mirrors pul_games.game_time.
alter table public.wul_games add column if not exists game_time text;

-- Daily, year-round: the next season's schedule goes up around December, and
-- in-season the sheet carries time changes and moved games. Two page fetches a
-- day when nothing is published; well under a second of DB work.
select cron.schedule(
  'wul-schedule-sync-daily',
  '23 15 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'usau_project_url') || '/functions/v1/wul-schedule-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'usau_service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

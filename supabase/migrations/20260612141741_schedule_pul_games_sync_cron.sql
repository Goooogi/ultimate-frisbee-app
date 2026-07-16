-- Schedule pul-games-sync: hourly on Fri/Sat/Sun during the PUL season (Mar–Jul).
-- Cron fields: min hour dom month dow.  dow: 0=Sun, 5=Fri, 6=Sat.
--   0 * * 3-7 5,6,0  =  top of every hour, any day-of-month, months Mar–Jul,
--                       only on Fri/Sat/Sun.
--
-- TIMEZONE: pg_cron runs in the DB timezone (UTC). "Fri/Sat/Sun" is therefore
-- UTC — which in practice starts ~Thu evening PT and ends ~Sun evening PT, so
-- the whole weekend's games are covered with ≤1h latency. Good enough for a
-- "catch everything over the weekend" goal.
--
-- Reuses the project's existing vault secrets (usau_project_url /
-- usau_service_role_key) and the same net.http_post pattern as the USAU crons.
select cron.schedule(
  'pul-games-sync-weekend-hourly',
  '0 * * 3-7 5,6,0',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'usau_project_url') || '/functions/v1/pul-games-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'usau_service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
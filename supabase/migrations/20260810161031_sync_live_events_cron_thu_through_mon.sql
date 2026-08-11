-- sync-live-events previously fired only Thu/Fri/Sun (Central). Two gaps:
--   * SATURDAY never fired — no live updates all Saturday of a tournament.
--   * MONDAY never fired — USAU posts Sunday-evening finals Monday morning;
--     with Mon-Wed dark and the 2-day trailing window expiring before
--     Thursday, late-reported finals were never captured (half the weekend's
--     events had no champion, e.g. 2026-08-08/09).
-- Now: every 3 min, gated to Thu-Mon in US Central. Cron runs on all UTC days
-- so Central-evening spillover past 00:00 UTC is always covered.
select cron.unschedule('sync-live-events-every-3-min-thu-fri-sun');
select cron.schedule(
  'sync-live-events-every-3-min-thu-mon',
  '*/3 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'usau_project_url') || '/functions/v1/sync-live-events',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'usau_service_role_key')
    ),
    body := jsonb_build_object(),
    timeout_milliseconds := 150000
  )
  where extract(dow from now() at time zone 'America/Chicago') in (0, 1, 4, 5, 6);
  $$
);

-- Roster auto-scrape: every 15 min, Thursday–Sunday only.
-- Calls sync-event-rosters-dispatch in LIVE mode (no slug) → it selects every
-- flagship event currently in its date window (same scope as sync-live-events:
-- CLUB/COLLEGE_D1/COLLEGE_D3/MASTERS/GRAND_MASTERS, start≤tomorrow AND end≥today),
-- resolves each event's team URLs, then fans out one fast per-team roster scrape.
-- Idempotent (skips teams already rostered this season), so repeated runs are cheap.
--
-- Cron DOW: Sun=0 … Thu=4, Fri=5, Sat=6. Thu–Sun = 4,5,6,0. (Ultimate runs
-- Fri–Sun with rosters posting Thursday night; restricting to Thu–Sun saves the
-- weekday runs that would always find 0 live events.) Times are UTC — fine here
-- since the window check uses date math, not wall-clock.
--
-- Separate from sync-live-events (which stays daily) per Hunter's request.
-- Reuses the same vault secrets + net.http_post pattern as the other crons.
select cron.schedule(
  'sync-event-rosters-thu-sun',
  '*/15 * * * 4,5,6,0',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'usau_project_url') || '/functions/v1/sync-event-rosters-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'usau_service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
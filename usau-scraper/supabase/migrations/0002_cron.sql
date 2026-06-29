-- pg_cron schedules. Run AFTER edge functions are deployed.
--
-- PREREQ: Set up Vault secrets first. In the Supabase SQL editor, run:
--   select vault.create_secret('https://YOUR_REF.supabase.co', 'project_url');
--   select vault.create_secret('YOUR_SERVICE_ROLE_KEY', 'service_role_key');
--
-- Then `supabase db push` to apply this migration.

-- ----------------------------------------------------------------
-- sync-events: daily at 06:00 UTC
-- ----------------------------------------------------------------
select cron.schedule(
  'sync-events-daily',
  '0 6 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/sync-events',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ----------------------------------------------------------------
-- sync-event-details: daily at 06:15 UTC (after events run)
-- ----------------------------------------------------------------
select cron.schedule(
  'sync-event-details-daily',
  '15 6 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/sync-event-details',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ----------------------------------------------------------------
-- sync-event-details: every 15 min if any tournament is in progress
-- ----------------------------------------------------------------
select cron.schedule(
  'sync-event-details-live',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/sync-event-details',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  )
  where exists (
    select 1 from events
    where current_date between start_date and end_date
  );
  $$
);

-- ----------------------------------------------------------------
-- sync-rankings: Tuesday 12:00 UTC (USAU updates rankings weekly)
-- ----------------------------------------------------------------
select cron.schedule(
  'sync-rankings-weekly',
  '0 12 * * 2',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/sync-rankings',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ----------------------------------------------------------------
-- Useful queries
-- ----------------------------------------------------------------
-- View scheduled jobs:   select * from cron.job;
-- View recent run history:   select * from cron.job_run_details order by start_time desc limit 20;
-- Unschedule a job:   select cron.unschedule('sync-events-daily');

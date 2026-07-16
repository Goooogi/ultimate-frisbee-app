
-- Drain the resolver backlog overnight (3 AM - 7 AM UTC = 10 PM - 2 AM PT).
-- Every 5 minutes, invoke sync-resolver-batch which processes 2 events
-- and exits. This keeps each Edge Function invocation well under CPU
-- limits AND lets USAU's rate-limit window cool between bursts.
--
-- Drops itself out of pg_cron's job list once usau_event_teams has no
-- unresolved url_ids (the function returns 0 rows processed; this
-- schedule keeps running but does nothing).
select cron.schedule(
  'sync-resolver-batch-overnight',
  '*/5 3-6 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'usau_project_url') || '/functions/v1/sync-resolver-batch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'usau_service_role_key')
    ),
    body := jsonb_build_object('limit', 2)
  );
  $$
);

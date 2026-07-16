
-- Store the service-role key + project URL in vault so cron can read them.
-- Vault encrypts secrets at rest and only service-role can decrypt.
-- NOTE: The service-role key literal that was here has been redacted from
-- version control. This migration already ran against the remote DB (which
-- created the vault secret). On a fresh/reset DB, set the real key first:
--   select vault.create_secret('<SERVICE_ROLE_KEY>', 'usau_service_role_key',
--     'Service role key for invoking USAU sync edge functions from pg_cron');
-- Do NOT commit the real key. See the cron docs in the vault.
select vault.create_secret(
  '<SERVICE_ROLE_KEY_REDACTED>',
  'usau_service_role_key',
  'Service role key for invoking USAU sync edge functions from pg_cron'
)
where not exists (select 1 from vault.secrets where name = 'usau_service_role_key');

select vault.create_secret(
  'https://efjipdmylkqwmupvoxab.supabase.co',
  'usau_project_url',
  'Supabase project URL for invoking edge functions'
)
where not exists (select 1 from vault.secrets where name = 'usau_project_url');

-- Schedule sync-live-events every 15 minutes.
-- pg_net.http_post fires the request asynchronously and returns immediately
-- (we don't need to wait for the response — the function logs to scrape_runs).
select cron.schedule(
  'sync-live-events-every-15-min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'usau_project_url') || '/functions/v1/sync-live-events',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'usau_service_role_key')
    ),
    body := jsonb_build_object()
  );
  $$
);

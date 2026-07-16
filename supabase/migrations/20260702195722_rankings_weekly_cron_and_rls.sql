-- RLS: usau_rankings is public sports data — world-readable, never writable by
-- anon/authenticated (writes come only from the service-role scraper). Assert
-- idempotently so intent is committed and survives future hardening.
alter table if exists usau_rankings enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'usau_rankings'
      and policyname = 'usau_rankings_select_public'
  ) then
    create policy usau_rankings_select_public
      on usau_rankings for select
      to anon, authenticated
      using (true);
  end if;
end $$;

-- Weekly USAU official-rankings scrape. Monday 05:00 UTC = Sunday night US.
-- Uses the usau_* Vault secrets the other scraper crons use (confirmed present).
select cron.schedule(
  'sync-usau-rankings-weekly',
  '0 5 * * 1',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'usau_project_url') || '/functions/v1/sync-usau-rankings',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'usau_service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
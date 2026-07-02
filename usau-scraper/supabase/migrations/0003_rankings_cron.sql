-- Weekly USAU official-rankings scrape. Run AFTER the sync-usau-rankings
-- edge function is deployed and after a manual dry-run confirms the function
-- can reach USAU from the Deno Deploy egress IP (WAF risk — see CLAUDE.md).

-- ----------------------------------------------------------------
-- RLS: usau_rankings is public sports data — world-readable, never
-- writable by anon/authenticated (writes come only from the service-role
-- scraper, which bypasses RLS). The live DB already has this; we assert it
-- idempotently here so the intent is committed and survives a clean rebuild
-- or a future `revoke all ... from anon` hardening pass. (security review)
-- ----------------------------------------------------------------
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
--
-- PREREQ: Vault secrets 'usau_project_url' and 'usau_service_role_key' already
-- exist (used by the other usau-scraper crons). Confirmed present. No new
-- secrets needed.
--
-- Schedule: Monday 05:00 UTC = Sunday evening/night across US timezones
-- (Sun 9pm PT / midnight–1am ET). USAU refreshes its rankings on a weekly
-- cadence during the season; a Sunday-night pull captures the latest week
-- after the weekend's results are in.

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

-- To remove: select cron.unschedule('sync-usau-rankings-weekly');

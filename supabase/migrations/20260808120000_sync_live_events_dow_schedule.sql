-- Record the live sync-live-events schedule in version control.
--
-- The job was re-created directly in the database during an incident-response
-- pass on 2026-08-04+ and has been firing correctly since. Nothing here changes
-- runtime behaviour on the remote project — this migration exists so the
-- schedule is not live-edit-only state that a fresh env or `db reset` loses.
--
-- ── What changed vs. the committed history ─────────────────────────────────
-- 20260522190036_schedule_sync_live_events.sql scheduled
-- 'sync-live-events-every-15-min' at '*/15 * * * *' with no HTTP timeout.
-- 20260804020000_cron_schedule_hardening.sql then altered that job by jobid
-- (1) to add timeout_milliseconds. Neither file describes the job that is
-- actually live now: a differently-named job on a day-of-week schedule. The
-- old name is unscheduled below so a reset DB doesn't end up with two
-- definitions racing each other on the same edge function.
--
-- ── Why the schedule looks wrong ───────────────────────────────────────────
-- The cron expression runs on FIVE UTC days (Thu/Fri/Sat/Sun/Mon) but the
-- WHERE guard narrows actual execution to Thu/Fri/Sun in America/Chicago. The
-- extra UTC days cover Central evening games that cross midnight UTC. Doing
-- the day-of-week test in SQL against a named timezone — rather than encoding
-- it in the cron string, which pg_cron evaluates in UTC — is what makes this
-- DST-safe without editing the schedule twice a year. Don't "fix" the cron
-- expression to 4,5,0 and drop the guard; that silently loses late games.

-- Guarded so this is re-runnable and safe on a DB that never had the old job.
select cron.unschedule('sync-live-events-every-15-min')
where exists (
  select 1 from cron.job where jobname = 'sync-live-events-every-15-min'
);

select cron.unschedule('sync-live-events-every-3-min-thu-fri-sun')
where exists (
  select 1 from cron.job where jobname = 'sync-live-events-every-3-min-thu-fri-sun'
);

-- Secrets are read from Vault at run time; never inline the key literal here.
select cron.schedule(
  'sync-live-events-every-3-min-thu-fri-sun',
  '*/3 * * * 4,5,6,0,1',
  $job$
  -- Fires only when it is Thu/Fri/Sun in US Central (DST-aware); the extra
  -- UTC days (Sat/Mon) exist to cover Central evenings that spill past 00:00 UTC.
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'usau_project_url') || '/functions/v1/sync-live-events',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'usau_service_role_key')
    ),
    body := jsonb_build_object(),
    timeout_milliseconds := 150000
  )
  where extract(dow from now() at time zone 'America/Chicago') in (0, 4, 5);
  $job$
);

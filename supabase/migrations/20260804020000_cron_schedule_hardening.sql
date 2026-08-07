-- Cron hardening: explicit HTTP timeouts, staggered minutes, EUCS refresh job.
--
-- Applied live 2026-08-04. Committed so the live schedule has a source of truth
-- (several jobs had already drifted from their original migrations).
--
-- ── The 5-second bug (the important one) ────────────────────────────────────
-- net.http_post defaults to a 5s timeout when timeout_milliseconds is omitted.
-- Jobs 1, 2, 6 and 12 omitted it, so every run died at exactly 5000ms — 84
-- recorded "Timeout of 5000 ms reached" responses. It was INVISIBLE in
-- cron.job_run_details because pg_cron marks the run SUCCEEDED: net.http_post
-- fired correctly, and pg_cron never sees the HTTP outcome.
--
-- jobid 1 (USAU sync-live-events, every 3 min) was the worst hit — the live
-- USAU sync had effectively not been completing at all. After adding a timeout
-- it immediately returned 200 with `liveEvents: 15, windowCount: 15`.
--
-- This is very likely WHY jobid 1 was set to */3 out-of-band (its migration
-- says */15): the runs weren't completing, so the rate was raised to compensate.
-- Hunter chose to KEEP */3 for now; the timeout is the actual fix.
--
-- ── Worker starvation ───────────────────────────────────────────────────────
-- cron.max_running_jobs = 32 but max_worker_processes = 6, so jobs sharing a
-- minute starve for a worker and log "job startup timeout" (99 runs in 3 days).
-- Since jobid 1 fires on every multiple of 3, every other job is moved OFF
-- multiples of 3 (and off :00/:15/:30/:45 where they previously collided).
--   jobid  2: '*/5 3-6 * * *'  -> '2,17,32,47 3-6 * * *'
--   jobid  8: '*/15 * * * *'   -> '7,22,37,52 * * * *'
--   jobid  9: '20 * * * …'     -> '22 * * * …'
--   jobid 10: '5 * * * …'      -> '7 * * * …'
--   jobid 11: '50 * * * *'     -> '53 * * * *'
--   jobid 13: '35 5 * * *'     -> '34 5 * * *'
-- These self-heal on the next tick, but a REAL outage looks identical — which
-- is why 20260804010000_cron_health_monitor.sql now records them.

-- ── 1. Explicit timeouts on the four jobs that had none ─────────────────────
select cron.alter_job(1, command := $j$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'usau_project_url') || '/functions/v1/sync-live-events',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'usau_service_role_key')
    ),
    body := jsonb_build_object(),
    timeout_milliseconds := 150000
  );
$j$);

select cron.alter_job(2, command := $j$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'usau_project_url') || '/functions/v1/sync-resolver-batch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'usau_service_role_key')
    ),
    body := jsonb_build_object('limit', 2),
    timeout_milliseconds := 150000
  );
$j$);

select cron.alter_job(6, command := $j$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'usau_project_url') || '/functions/v1/sync-event-rosters-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'usau_service_role_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
$j$);

select cron.alter_job(12, command := $j$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'usau_project_url') || '/functions/v1/watch-usau-api-coverage',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'usau_service_role_key')
    ),
    body := '{"probeGroups": true}'::jsonb,
    timeout_milliseconds := 180000
  );
$j$);

-- ── 2. Stagger off multiples of 3 (jobid 1 owns those minutes) ─────────────
select cron.alter_job(2,  schedule := '2,17,32,47 3-6 * * *');
select cron.alter_job(8,  schedule := '7,22,37,52 * * * *');
select cron.alter_job(9,  schedule := '22 * * * 1,4,5,6,0');
select cron.alter_job(10, schedule := '7 * * * 1,4,5,6,0');
select cron.alter_job(11, schedule := '53 * * * *');

-- ── 3. New jobs ────────────────────────────────────────────────────────────
-- EUCS had NO scheduled jobs at all despite being a live 2026 season — every
-- refresh was manual. euf-ingest gained a {dispatch:"refresh"} mode that
-- re-ingests events in/near their window, echoing stored name/kind/slug/location
-- back so ingest() defaults can't overwrite good metadata.
--
-- EUCS discovery IS possible and is scheduled below (euf-discover-daily). The
-- season index is the Ultiorganizer <select name='selseason'> dropdown rendered
-- on every page — 32 <option value='ID'>Name</option> entries. (An earlier note
-- here claimed no index existed; that was wrong — it was looked for in
-- ?view=teams/tournaments/seasons and via `season=` link grepping, none of which
-- surface the dropdown.)
select cron.schedule(
  'euf-refresh-hourly',
  '41 * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'usau_project_url') || '/functions/v1/euf-ingest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'usau_service_role_key')
    ),
    body := jsonb_build_object('dispatch', 'refresh'),
    timeout_milliseconds := 280000
  );
  $job$
);

-- WFDF event discovery (see 2026-08-04 note in the vault).
select cron.schedule(
  'wfdf-discover-daily',
  '34 5 * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'usau_project_url') || '/functions/v1/wfdf-ingest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'usau_service_role_key')
    ),
    body := jsonb_build_object('dispatch', 'discover'),
    timeout_milliseconds := 280000
  );
  $job$
);

-- Hourly health snapshot. Pure SQL — no HTTP call that could itself fail
-- silently, and it still works when the Edge runtime is down.
select cron.schedule(
  'cron-health-check-hourly',
  '58 * * * *',
  $job$ select public.check_cron_health(interval '70 minutes'); $job$
);

-- EUCS event discovery — parses the selseason dropdown, ingests unknown seasons.
-- Runs 12 min after WFDF discovery to keep the two off the same minute.
select cron.schedule(
  'euf-discover-daily',
  '46 5 * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'usau_project_url') || '/functions/v1/euf-ingest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'usau_service_role_key')
    ),
    body := jsonb_build_object('dispatch', 'discover'),
    timeout_milliseconds := 280000
  );
  $job$
);

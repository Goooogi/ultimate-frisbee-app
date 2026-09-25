-- ── 1. check_cron_health logged still-running jobs as failures ──────────────
-- `d.status <> 'succeeded'` also matched runs that were merely in flight when
-- the checker ran, and ON CONFLICT DO NOTHING froze them as 'running' forever.
-- 1,479 of 1,651 'cron' rows were that noise (the checker logging itself, the
-- profile trickle) — a real failure would have been buried. Live-prosrc patch
-- (the live copy carries `#variable_conflict use_column`, the committed one
-- doesn't).
DO $migration$
DECLARE
  v_oid oid;
  v_def text;
  c_old constant text := '    and d.status <> ''succeeded''';
  c_new constant text := '    and d.status = ''failed''';
BEGIN
  v_oid := to_regprocedure('public.check_cron_health(interval)');
  IF v_oid IS NULL THEN RAISE EXCEPTION 'check_cron_health not found'; END IF;
  v_def := pg_get_functiondef(v_oid);

  IF position(c_new in v_def) > 0 THEN
    RAISE NOTICE 'check_cron_health already patched; skipping'; RETURN;
  END IF;
  IF (length(v_def) - length(replace(v_def, c_old, ''))) / length(c_old) <> 1 THEN
    RAISE EXCEPTION 'check_cron_health status anchor not unique';
  END IF;

  EXECUTE replace(v_def, c_old, c_new);
END
$migration$;

DELETE FROM public.cron_health_log WHERE failure_class = 'cron' AND status = 'running';

-- ── 2. Explicit HTTP timeouts on the jobs 20260804020000 didn't cover ───────
-- net.http_post defaults to 5s; sync-usau-rankings (job 7) hit "Timeout of
-- 5000 ms reached" on every run (its data still landed), wul-schedule-sync
-- (29) on 09-14. Same fix as jobs 1/2/6/12.
select cron.alter_job(5, command := $j$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'usau_project_url') || '/functions/v1/pul-games-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'usau_service_role_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
$j$);

select cron.alter_job(7, command := $j$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'usau_project_url') || '/functions/v1/sync-usau-rankings',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'usau_service_role_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
$j$);

select cron.alter_job(29, command := $j$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'usau_project_url') || '/functions/v1/wul-schedule-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'usau_service_role_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
$j$);

NOTIFY pgrst, 'reload schema';

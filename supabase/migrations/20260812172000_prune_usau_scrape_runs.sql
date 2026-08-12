-- Prune usau_scrape_runs (item 5 of the 2026-08-12 fix queue).
--
-- The table is an append-only operational log of every scrape attempt. It had
-- grown to 156,352 rows / 50 MB since 2026-05-19 with no retention policy —
-- 64,416 rows older than 30 days. Nothing reads runs that old; they just cost
-- disk, autovacuum passes and backup size on a 2 vCPU / 2 GB instance.
--
-- 30-day retention, pruned weekly. Mirrors the existing
-- purge-cron-history-weekly job (jobid 22), which does the same for
-- cron.job_run_details, and is scheduled just after it.
select cron.schedule(
  'prune-usau-scrape-runs-weekly',
  '25 7 * * 1',
  $cron$delete from public.usau_scrape_runs where started_at < now() - interval '30 days'$cron$
);

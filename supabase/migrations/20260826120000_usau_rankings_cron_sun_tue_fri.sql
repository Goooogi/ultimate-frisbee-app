-- sync-usau-rankings cadence: weekly Sunday-night run → Sunday, Tuesday &
-- Friday nights (Hunter, 2026-08-26).
--
-- The job fires at 05:00 UTC, which is ~11pm CT the PRIOR local day — the
-- original '0 5 * * 1' (Monday UTC) was the "Sunday" run. Keeping the same
-- slot on local Sun/Tue/Fri means UTC days 1,3,6 (Mon/Wed/Sat).
--
-- jobid 7 = 'sync-usau-rankings-weekly' (posts to the sync-usau-rankings
-- edge function). Altered by name-lookup so the migration doesn't depend on
-- a hardcoded jobid surviving.
select cron.alter_job(
  (select jobid from cron.job where jobname = 'sync-usau-rankings-weekly'),
  schedule => '0 5 * * 1,3,6'
);

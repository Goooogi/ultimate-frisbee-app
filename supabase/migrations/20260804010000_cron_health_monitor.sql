-- Cron health monitoring — make scheduled-job failures VISIBLE.
--
-- Why: on 2026-08-04 an audit found 99 failed cron runs in 3 days (68 on the
-- USAU sync alone) that nobody knew about — every one "job startup timeout",
-- pg_cron failing to get a worker slot because cron.max_running_jobs (32)
-- vastly exceeds max_worker_processes (6) and several jobs share the same
-- minute. Those runs self-heal on the next tick, so nothing was visibly broken,
-- and that is exactly the problem: a REAL outage would look identical.
--
-- Two failure classes exist and only the first is in cron.job_run_details:
--   1. pg_cron-level  — job never started / errored (status <> 'succeeded')
--   2. app-level      — job ran fine, but the edge function it POSTed to
--                       returned 5xx or {"ok":false}. pg_cron records SUCCESS
--                       for these because net.http_post itself succeeded.
-- check_cron_health() records BOTH. Note they cannot be correlated: pg_cron's
-- return_message is just "1 row", NOT the net request id (verified), so class-2
-- rows are logged standalone under jobname 'edge-http-response'.
--
-- Deliberately pure SQL: no edge function to deploy, no HTTP call that could
-- itself fail silently, and it works even when the Edge runtime is down.

-- ── 1. Durable failure log ──────────────────────────────────────────────────
-- cron.job_run_details is pruned, and net._http_response is pruned aggressively
-- (~100 rows). Snapshot failures so a Monday post-mortem can still see Friday.
create table if not exists public.cron_health_log (
  id            bigint generated always as identity primary key,
  jobid         bigint      not null,
  jobname       text        not null,
  runid         bigint,
  failure_class text        not null check (failure_class in ('cron', 'http')),
  status        text,
  detail        text,
  occurred_at   timestamptz not null,
  logged_at     timestamptz not null default now(),
  -- One row per (job, run, class) so re-running the checker is idempotent.
  unique (jobid, runid, failure_class)
);

comment on table public.cron_health_log is
  'Durable snapshot of failed scheduled-job runs. Written by check_cron_health(); read by the /admin health view. Source tables (cron.job_run_details, net._http_response) are both pruned, so this is the only long-term record.';

create index if not exists cron_health_log_occurred_idx
  on public.cron_health_log (occurred_at desc);

-- Service-role only. This is operational data, not user data: no policy grants
-- anon/authenticated access, and RLS denies by default with none present.
alter table public.cron_health_log enable row level security;
revoke all on public.cron_health_log from anon, authenticated;

-- ── 2. Live health view ─────────────────────────────────────────────────────
-- Per-job rollup over the last 24h + 7d, including app-level HTTP failures.
create or replace view public.cron_health as
with runs as (
  select d.jobid, j.jobname, d.status, d.start_time, d.end_time, d.return_message
  from cron.job_run_details d
  join cron.job j on j.jobid = d.jobid
  where d.start_time > now() - interval '7 days'
)
select
  j.jobid,
  j.jobname,
  j.schedule,
  j.active,
  count(*) filter (where r.start_time > now() - interval '24 hours')                          as runs_24h,
  count(*) filter (where r.start_time > now() - interval '24 hours'
                     and r.status <> 'succeeded')                                             as failed_24h,
  count(*) filter (where r.status <> 'succeeded')                                             as failed_7d,
  max(r.start_time)                                                                            as last_run_at,
  max(r.start_time) filter (where r.status = 'succeeded')                                     as last_success_at,
  (array_agg(r.return_message order by r.start_time desc)
     filter (where r.status <> 'succeeded'))[1]                                                as last_failure_msg
from cron.job j
left join runs r on r.jobid = j.jobid
group by j.jobid, j.jobname, j.schedule, j.active;

comment on view public.cron_health is
  'Per-job cron health for the last 24h/7d. NOTE: a job can read 0 failures here and still be broken at the APP level — pg_cron marks a run succeeded when net.http_post fires, regardless of the HTTP status. check_cron_health() logs those separately under jobname ''edge-http-response''.';

-- ── 3. The checker ──────────────────────────────────────────────────────────
-- Records both failure classes into cron_health_log and returns what it found,
-- so the scheduled run is also a queryable answer to "is anything broken?".
create or replace function public.check_cron_health(p_window interval default interval '1 hour')
returns table (jobid bigint, jobname text, failure_class text, failures bigint, detail text)
language plpgsql
security definer
set search_path = public, cron, net
as $$
begin
  -- (1) pg_cron-level failures.
  insert into public.cron_health_log (jobid, jobname, runid, failure_class, status, detail, occurred_at)
  select d.jobid, j.jobname, d.runid, 'cron', d.status,
         left(coalesce(d.return_message, ''), 500), coalesce(d.start_time, now())
  from cron.job_run_details d
  join cron.job j on j.jobid = d.jobid
  where d.start_time > now() - p_window
    and d.status <> 'succeeded'
  on conflict (jobid, runid, failure_class) do nothing;

  -- (2) App-level failures: the cron job "succeeded" but the HTTP call it made
  -- returned an error status or an {"ok":false} body. pg_cron records SUCCESS
  -- for these because net.http_post itself worked.
  --
  -- These CANNOT be joined to a specific run: cron.job_run_details.return_message
  -- is just "1 row" (verified — it does NOT carry the net request id), so there
  -- is no key linking a run to its response. We therefore record bad responses
  -- on their own, keyed by the response id in `runid`, and leave attribution to
  -- the operator via the timestamp + body. Logging an unattributed failure is
  -- far better than the join silently matching nothing and reporting all-clear.
  --
  -- net._http_response is pruned aggressively (~100 rows), so this only sees
  -- recent responses — hence the hourly cadence.
  insert into public.cron_health_log (jobid, jobname, runid, failure_class, status, detail, occurred_at)
  select 0, 'edge-http-response', r.id, 'http', coalesce(r.status_code::text, 'no-response'),
         left(coalesce(r.error_msg, r.content, ''), 500), coalesce(r.created, now())
  from net._http_response r
  where r.created > now() - p_window
    and (r.status_code is null or r.status_code >= 400 or r.content ilike '%"ok":false%')
  on conflict (jobid, runid, failure_class) do nothing;

  return query
  select l.jobid, l.jobname, l.failure_class, count(*)::bigint,
         (array_agg(l.detail order by l.occurred_at desc))[1]
  from public.cron_health_log l
  where l.occurred_at > now() - p_window
  group by l.jobid, l.jobname, l.failure_class
  order by count(*) desc;
end;
$$;

comment on function public.check_cron_health(interval) is
  'Snapshots failed cron runs (both pg_cron-level and app-level HTTP) into cron_health_log and returns the rollup. Scheduled hourly; also safe to call ad hoc.';

-- SECURITY DEFINER + it WRITES, so lock it down. REVOKE must target PUBLIC:
-- Postgres grants EXECUTE to PUBLIC by default and every role inherits it, so
-- revoking from anon/authenticated alone is a silent no-op (this repo has been
-- bitten by that twice — see 20260803190000 and 20260804000000).
revoke execute on function public.check_cron_health(interval) from public, anon, authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.check_cron_health(interval)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.check_cron_health(interval)', 'EXECUTE') then
    raise exception 'check_cron_health is still executable by anon/authenticated';
  end if;
end $$;

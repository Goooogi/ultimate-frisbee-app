-- Run history for the pul-games-sync edge function (Phase 2 scheduled scraper).
-- One row per invocation. The function reads the previous row to decide whether
-- this makes 2 consecutive failures (→ alert email).
create table if not exists public.pul_sync_log (
  id              uuid primary key default gen_random_uuid(),
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  status          text not null default 'running'
                    check (status in ('running','ok','error')),
  -- counts for a quick at-a-glance health read
  games_checked   integer not null default 0,   -- non-final games we re-fetched
  games_inserted  integer not null default 0,   -- brand-new games found on /schedule
  games_updated   integer not null default 0,   -- games whose row changed
  box_rows        integer not null default 0,   -- box-score rows written this run
  error           text,                          -- error message when status='error'
  alert_sent      boolean not null default false, -- did this run trigger the email
  created_at      timestamptz not null default now()
);

create index if not exists pul_sync_log_started_idx on public.pul_sync_log (started_at desc);

-- RLS: enabled, NO public policy. This is operational data — only the
-- service role (which bypasses RLS) reads/writes it. The app never queries it.
alter table public.pul_sync_log enable row level security;
create table if not exists public.delete_account_attempts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  attempted_at timestamptz not null default now()
);

create index if not exists delete_account_attempts_user_time_idx
  on public.delete_account_attempts (user_id, attempted_at desc);

alter table public.delete_account_attempts enable row level security;

revoke all on public.delete_account_attempts from anon, authenticated;
-- game_notifications: dedup ledger for the push sender
-- (supabase/functions/send-game-notifications). One row per
-- (league, game_id, category) push EVER sent — the function claims the row
-- with an insert-ignore before sending, so a game notifies at most once per
-- category no matter how often the cron fires or syncs rewrite the game row.
--
-- Service-role only: RLS enabled with NO policies — clients never read or
-- write this table.

create table if not exists public.game_notifications (
  league text not null,
  game_id text not null,
  category text not null check (category in ('game_start', 'game_final')),
  sent_at timestamptz not null default now(),
  -- Expo tickets accepted for this push (0 = claimed but nobody to send to).
  recipients integer not null default 0,
  primary key (league, game_id, category)
);

alter table public.game_notifications enable row level security;

-- The sender's candidate scans hit usau_games by (status, scheduled_at) every
-- 5 minutes over ~95k rows — give them an index. ufa_games is tiny.
create index if not exists usau_games_status_scheduled_idx
  on public.usau_games (status, scheduled_at);

-- Cron: every 5 minutes. The function exits in a few queries when no game is
-- near a start/final window. Secrets come from Vault (never inline).
select cron.schedule(
  'send-game-notifications-5min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'usau_project_url') || '/functions/v1/send-game-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'usau_service_role_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

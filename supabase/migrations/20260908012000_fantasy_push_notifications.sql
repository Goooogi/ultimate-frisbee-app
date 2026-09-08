-- ─────────────────────────────────────────────────────────────────────────────
-- Fantasy push notifications (Hunter, 2026-09-08 — depth backlog item 1).
--
-- Five new categories, sent by the new `notify-fantasy` edge function:
--   draft_reminder  — 24 h and 1 h before a scheduled draft   (cron-polled)
--   draft_live      — the draft went live                     (DB trigger)
--   draft_on_clock  — your team is on the clock / nominating  (DB trigger)
--   draft_complete  — the draft finished                      (DB trigger)
--   matchup_result  — your weekly H2H matchup was decided     (scorer)
-- Gated by a new notification_prefs.fantasy toggle (missing row = on, like
-- every other category) plus the push_enabled master switch.
--
-- Event-driven sends are the first DB-trigger → net.http_post in this
-- project: an AFTER UPDATE trigger on fantasy_drafts posts the state change
-- to the function (pg_net is async — the RPC that moved the draft is never
-- slowed or failed by the push). Dedup stays in game_notifications with
-- league = 'fantasy'.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.notification_prefs
  add column if not exists fantasy boolean not null default true;

alter table public.game_notifications drop constraint game_notifications_category_check;
alter table public.game_notifications
  add constraint game_notifications_category_check
  check (category = any (array[
    'game_start','game_final','event_start','event_bracket','event_final','player_stats',
    'draft_reminder','draft_live','draft_on_clock','draft_complete','matchup_result'
  ]::text[]));

-- ── Trigger: fantasy_drafts state changes → notify-fantasy ───────────────────
create or replace function public.fantasy_drafts_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'usau_project_url')
           || '/functions/v1/notify-fantasy',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'usau_service_role_key')
    ),
    body := jsonb_build_object(
      'event', 'draft',
      'draftId', NEW.id,
      'contestId', NEW.contest_id,
      'status', NEW.status,
      'oldStatus', OLD.status,
      'currentOverall', NEW.current_overall,
      'oldOverall', OLD.current_overall
    ),
    timeout_milliseconds := 30000
  );
  return NEW;
end;
$$;

revoke execute on function public.fantasy_drafts_notify() from anon, authenticated, public;

drop trigger if exists fantasy_drafts_notify on public.fantasy_drafts;
create trigger fantasy_drafts_notify
  after update on public.fantasy_drafts
  for each row
  when (old.status is distinct from new.status or old.current_overall is distinct from new.current_overall)
  execute function public.fantasy_drafts_notify();

-- ── Widen the existing 5-minute push cron to also poll draft reminders ──────
-- Not a new job (standing rule): the same tick posts a second request.
do $$
declare
  v_jobid int;
  v_cmd   text;
begin
  select jobid, command into v_jobid, v_cmd from cron.job where jobname = 'send-game-notifications-5min';
  if v_jobid is null then
    raise exception 'send-game-notifications-5min cron job not found';
  end if;
  if position('notify-fantasy' in v_cmd) > 0 then
    return; -- already widened
  end if;
  v_cmd := v_cmd || E'\n  select net.http_post(\n' ||
    E'    url := (select decrypted_secret from vault.decrypted_secrets where name = ''usau_project_url'') || ''/functions/v1/notify-fantasy'',\n' ||
    E'    headers := jsonb_build_object(\n' ||
    E'      ''Content-Type'', ''application/json'',\n' ||
    E'      ''Authorization'', ''Bearer '' || (select decrypted_secret from vault.decrypted_secrets where name = ''usau_service_role_key'')\n' ||
    E'    ),\n' ||
    E'    body := ''{"event":"reminders"}''::jsonb,\n' ||
    E'    timeout_milliseconds := 60000\n' ||
    E'  );\n';
  perform cron.alter_job(v_jobid, command := v_cmd);
end $$;

notify pgrst, 'reload schema';

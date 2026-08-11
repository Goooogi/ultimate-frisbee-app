-- In-app UGC reporting: users flag an approved player_content item with a
-- reason; admins triage (new -> resolved) in the admin screens.
-- Conventions mirror jersey_reports (insert_self / select_own_or_admin /
-- update_admin / delete_admin, is_admin() gate).

create type public.player_content_report_status as enum ('new', 'resolved');

create table public.player_content_reports (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.player_content(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (char_length(btrim(reason)) between 1 and 500),
  status public.player_content_report_status not null default 'new',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  -- one report per user per item; duplicate attempts are treated as success client-side
  unique (content_id, reporter_id)
);

create index player_content_reports_status_idx
  on public.player_content_reports (status, created_at desc);
create index player_content_reports_content_idx
  on public.player_content_reports (content_id);

alter table public.player_content_reports enable row level security;

-- Reporters can only file as themselves, only with status 'new', and only
-- against content they can actually see (the exists() runs under the caller's
-- RLS on player_content, so blind content_id enumeration fails).
create policy player_content_reports_insert_self
  on public.player_content_reports for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and status = 'new'
    and exists (
      select 1 from public.player_content pc where pc.id = content_id
    )
  );

create policy player_content_reports_select_own_or_admin
  on public.player_content_reports for select to authenticated
  using (reporter_id = (select auth.uid()) or is_admin());

create policy player_content_reports_update_admin
  on public.player_content_reports for update to authenticated
  using (is_admin()) with check (is_admin());

create policy player_content_reports_delete_admin
  on public.player_content_reports for delete to authenticated
  using (is_admin());

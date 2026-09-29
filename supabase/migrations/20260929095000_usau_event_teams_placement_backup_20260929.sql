-- Snapshot before the 20260929100000 placement re-derive (6 parts). Drop ~10/13.
create table public.usau_event_teams_placement_backup_20260929 as
  select event_id, team_id, final_placement from public.usau_event_teams;
alter table public.usau_event_teams_placement_backup_20260929 enable row level security;
revoke all on public.usau_event_teams_placement_backup_20260929 from anon, authenticated;

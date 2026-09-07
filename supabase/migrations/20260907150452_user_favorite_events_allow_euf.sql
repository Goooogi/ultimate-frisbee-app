-- Starred tournaments for every league with event pages (Hunter, 2026-09-07).
-- Keep in sync with FavoriteEvent['league'] in both app repos.
-- Applied to prod 2026-09-07 (remote version 20260907150452). The creating
-- migration (user_favorite_events_and_notification_pref_categories) was
-- applied remotely via MCP and lives only in the remote DB.
alter table public.user_favorite_events
  drop constraint user_favorite_events_league_check;
alter table public.user_favorite_events
  add constraint user_favorite_events_league_check
  check (league in ('usau', 'wfdf', 'euf'));

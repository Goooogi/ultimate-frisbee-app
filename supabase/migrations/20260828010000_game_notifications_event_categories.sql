-- ─────────────────────────────────────────────────────────────────────────────
-- Push notifications — widen the dedup table for event-level + player-stat
-- categories (USAU/WFDF notification expansion, plan + decisions in vault
-- Features/Push Notifications.md).
--
-- game_notifications (league, game_id, category) stays the single dedup
-- ledger: event-level rows store the EVENT id in game_id with an event_*
-- category; player-stat rows store "<game-or-event-id>:<player-id>" so each
-- player notifies once per game (WFDF) / event (USAU). The old CHECK only
-- allowed game_start/game_final and would have rejected every new claim.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.game_notifications
  drop constraint game_notifications_category_check;

alter table public.game_notifications
  add constraint game_notifications_category_check
  check (category = any (array[
    'game_start',
    'game_final',
    'event_start',
    'event_bracket',
    'event_final',
    'player_stats'
  ]::text[]));

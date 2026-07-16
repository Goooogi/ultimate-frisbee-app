-- The existing CHECK only allowed ufa/usau, which would REJECT the new
-- player_kind='pul' content the app now supports. Widen it to include 'pul'
-- so PUL player profiles can carry user content like UFA/USAU profiles do.
alter table public.player_content
  drop constraint player_content_player_kind_check;
alter table public.player_content
  add constraint player_content_player_kind_check
  check (player_kind in ('ufa', 'usau', 'pul'));
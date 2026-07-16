alter table player_content drop constraint player_content_player_kind_check;
alter table player_content add constraint player_content_player_kind_check
  check (player_kind = any (array['ufa'::text,'usau'::text,'pul'::text,'wul'::text]));
-- Widen the closed league sets to include EUF/EUCS.
--
-- These CHECKs are the DB half of a TS↔SQL pair: adding 'euf' to the TS unions
-- (FavoriteLeague in lib/favorites/data.ts, IconLeague in lib/profile/
-- avatar-icon.ts) WITHOUT this migration means every EUF favorite and every EUF
-- avatar icon is silently REJECTED at insert time. Same class of bug already
-- recorded for player_content.player_kind.
--
-- avatar_icon stores a formatted "league:teamId" reference, so its CHECK is a
-- regex rather than an enum list.
ALTER TABLE user_favorite_teams   DROP CONSTRAINT IF EXISTS user_favorite_teams_league_check;
ALTER TABLE user_favorite_teams   ADD CONSTRAINT user_favorite_teams_league_check
  CHECK (league = ANY (ARRAY['ufa','usau','pul','wul','wfdf','euf']::text[]));

ALTER TABLE user_favorite_leagues DROP CONSTRAINT IF EXISTS user_favorite_leagues_league_check;
ALTER TABLE user_favorite_leagues ADD CONSTRAINT user_favorite_leagues_league_check
  CHECK (league = ANY (ARRAY['ufa','usau','pul','wul','wfdf','euf']::text[]));

ALTER TABLE user_favorite_players DROP CONSTRAINT IF EXISTS user_favorite_players_league_check;
ALTER TABLE user_favorite_players ADD CONSTRAINT user_favorite_players_league_check
  CHECK (league = ANY (ARRAY['ufa','usau','pul','wul','wfdf','euf']::text[]));

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_avatar_icon_format;
ALTER TABLE profiles ADD CONSTRAINT profiles_avatar_icon_format
  CHECK (
    avatar_icon IS NULL
    OR avatar_icon ~ '^(ufa|usau|pul|wul|wfdf|euf):[A-Za-z0-9][A-Za-z0-9/_-]{0,79}$'
  );

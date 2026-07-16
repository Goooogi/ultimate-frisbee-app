-- The partial unique index `usau_games_usau_game_id_idx where usau_game_id
-- is not null` cannot be used as an ON CONFLICT target via PostgREST's
-- on_conflict= parameter (error 42P10). Replace it with a regular UNIQUE
-- constraint on usau_game_id — null values are allowed and don't collide
-- in Postgres unique constraints by default, so the semantics are
-- preserved without the partial-index restriction.

drop index if exists public.usau_games_usau_game_id_idx;

alter table public.usau_games
  add constraint usau_games_usau_game_id_key unique (usau_game_id);

comment on constraint usau_games_usau_game_id_key on public.usau_games is
  'Unique when set. Null allowed (Postgres treats nulls as distinct). PostgREST upsert target.';

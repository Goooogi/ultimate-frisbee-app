-- Two constraints were tuned for the HTML scraper's data model but conflict
-- with how ultirzr exposes IDs:
--
-- 1) `usau_games_usau_event_game_id_key` is a partial unique index
--    (`where usau_event_game_id is not null`). PostgREST's ON CONFLICT
--    can't target partial indexes — it throws 42P10. Replace with a
--    full UNIQUE constraint; NULLs are still allowed and don't collide
--    in Postgres unique constraints by default.
--
-- 2) `usau_event_teams_event_team_id_idx` is a UNIQUE index across the
--    whole table on usau_event_team_id. That was correct when each row
--    had a per-event base64 EventTeamId, but ultirzr gives us the
--    persistent USAU team id, which legitimately repeats across events.
--    Drop the unique-ness; keep the column for backwards-compat.

drop index if exists public.usau_games_usau_event_game_id_key;

alter table public.usau_games
  add constraint usau_games_usau_event_game_id_key unique (usau_event_game_id);

comment on constraint usau_games_usau_event_game_id_key on public.usau_games is
  'Unique when set. NULL allowed (Postgres treats NULLs as distinct). Used as the PostgREST upsert target for ultirzr-ingested games.';

drop index if exists public.usau_event_teams_event_team_id_idx;

-- Replace with a non-unique index so we can still query by it.
create index if not exists usau_event_teams_event_team_id_idx
  on public.usau_event_teams (usau_event_team_id);

-- Games arrived from two sources: HTML scrape (URL-encoded base64
-- `usau_event_game_id`) and ultirzr ingest (numeric id). After team
-- dedupe, the same physical game now has multiple rows pointing at the
-- same teams. Keep the ultirzr-sourced row (numeric id) as canonical.
--
-- "Numeric id" detection: usau_event_game_id is digits-only (no '+', '/', '=').

with dupes as (
  select id, event_id, team_a_id, team_b_id, round,
         usau_event_game_id,
         (usau_event_game_id is not null
          and usau_event_game_id ~ '^[0-9]+$') as is_numeric,
         row_number() over (
           partition by event_id, team_a_id, team_b_id, round
           order by
             (usau_event_game_id ~ '^[0-9]+$') desc nulls last,
             updated_at desc
         ) as rn
  from public.usau_games
  where team_a_id is not null and team_b_id is not null
)
delete from public.usau_games g
using dupes d
where g.id = d.id and d.rn > 1;

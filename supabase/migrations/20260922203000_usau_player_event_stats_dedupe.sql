-- 2,307 player-events carried TWO usau_player_event_stats rows under different
-- same-named player_ids: the current one (on that event's roster) and a stale
-- copy from an earlier scrape (older scraped_at, not on the event roster).
-- Profiles merge same-name ids and SUM per event, so the line doubled —
-- /players/ddemarre showed 40G/48A at 2025 Club Nationals, USAU says 20G/24A.
-- 15 events: 2025 Club Nationals (246), D-I/D-III College Championships
-- 2022-26 (~2,000), 2026 Masters (39). Cause: sync-event-rosters mapped
-- name → player_id with "last row wins" (fixed in the same change).
--
-- Hunter (2026-09-22): back up, then delete. Backup follows the
-- fantasy_scores_backup_20260815 convention; drop it after ~2 weeks.
create table public.usau_player_event_stats_backup_20260923 as
with s as (
  select st.*, lower(p.display_name) as nm,
         exists (select 1 from usau_rosters r where r.player_id = st.player_id and r.event_id = st.event_id) as on_ev
  from usau_player_event_stats st join usau_players p on p.id = st.player_id
)
select d.player_id, d.event_id, d.team_id, d.goals, d.assists, d.scraped_at
from s d
where not d.on_ev
  and exists (
    select 1 from s k
    where k.event_id = d.event_id and k.team_id = d.team_id and k.nm = d.nm
      and k.on_ev and k.player_id <> d.player_id and k.scraped_at > d.scraped_at
  );

alter table public.usau_player_event_stats_backup_20260923 enable row level security;
revoke all on public.usau_player_event_stats_backup_20260923 from anon, authenticated;

DO $migration$
BEGIN
  IF (select count(*) from public.usau_player_event_stats_backup_20260923) <> 2307 THEN
    RAISE EXCEPTION 'duplicate-stat preview drifted from 2307; not deleting';
  END IF;
END
$migration$;

delete from public.usau_player_event_stats s
using public.usau_player_event_stats_backup_20260923 b
where s.player_id = b.player_id and s.event_id = b.event_id;

-- Deletes don't fire the stats→profile stale trigger (INSERT/UPDATE only), so
-- flag the affected cached profiles for the capped trickle rebuild.
update public.player_profiles set built_at = '-infinity'
where built_at <> '-infinity'
  and profile -> 'usauClusterIds' ?| (
    select array_agg(distinct player_id::text) from public.usau_player_event_stats_backup_20260923
  );

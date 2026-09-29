-- Repair pool-game dates stamped with the wrong YEAR.
--
-- USAU pool tables print "Sat 11/8" with no year, and sync-event-details used
-- the CURRENT year for it (fixed in v33: the year now comes from the event's
-- start date). Every re-scrape of a past season since June 2026 therefore
-- stored its pool games a year or more late — a Nov 2025 NY Minute pool game
-- read 2026-11-08. ~9.9k rows across 510 events.
--
-- Only the CONFIDENT rows are shifted: the whole-year shift (-3..+3) that
-- brings the game closest to its event's start_date must land within 10 days
-- of it. The ~1.5k rows that stay far off after shifting (a wrong event date,
-- or a long event) are left alone. Measured before applying: 8,406 rows, 0
-- natural-key collisions. Old values are kept in a dated backup (RLS on, no
-- policies — same as the 20260923 backups); drop it ~10/12.
set local lock_timeout = '5s';

create table if not exists public.usau_games_scheduled_at_backup_20260928 as
select g.id, g.event_id, g.scheduled_at as old_scheduled_at,
       g.scheduled_at - make_interval(years => s.shift) as new_scheduled_at
from public.usau_games g
join public.usau_events e on e.id = g.event_id
cross join lateral (
  select sh as shift
  from generate_series(-3, 3) sh
  order by abs(extract(epoch from (g.scheduled_at - make_interval(years => sh) - e.start_date::timestamptz)))
  limit 1
) s
where g.scheduled_at is not null
  and e.start_date is not null
  and abs(extract(epoch from (g.scheduled_at - e.start_date::timestamptz))) / 86400 > 45
  and s.shift <> 0
  and abs(extract(epoch from (g.scheduled_at - make_interval(years => s.shift) - e.start_date::timestamptz))) / 86400 <= 10;

alter table public.usau_games_scheduled_at_backup_20260928 enable row level security;

-- Guarded on the old value so a re-run (or a row a scrape already corrected)
-- is a no-op.
update public.usau_games g
set scheduled_at = b.new_scheduled_at
from public.usau_games_scheduled_at_backup_20260928 b
where g.id = b.id
  and g.scheduled_at = b.old_scheduled_at;

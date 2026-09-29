-- The-New-York-Minute-2025 (a Nov 2025 fall event filed as season 2026) has no
-- start/end date, so the 20260928210000 year repair couldn't anchor it and v33's
-- pool-date year falls back to the current year for it. Its bracket games carry
-- full USAU dates (2025-11-09); its pool games were stamped 2026-11-08.
-- Set the event dates, then shift those pool rows back one year (backed up into
-- the same 20260928 backup table first).
set local lock_timeout = '5s';

update public.usau_events
set start_date = '2025-11-08', end_date = '2025-11-09'
where usau_slug = 'The-New-York-Minute-2025' and start_date is null;

insert into public.usau_games_scheduled_at_backup_20260928 (id, event_id, old_scheduled_at, new_scheduled_at)
select g.id, g.event_id, g.scheduled_at, g.scheduled_at - interval '1 year'
from public.usau_games g
join public.usau_events e on e.id = g.event_id
where e.usau_slug = 'The-New-York-Minute-2025'
  and g.scheduled_at >= '2026-06-01'
  and not exists (select 1 from public.usau_games_scheduled_at_backup_20260928 b where b.id = g.id);

update public.usau_games g
set scheduled_at = b.new_scheduled_at
from public.usau_games_scheduled_at_backup_20260928 b
join public.usau_events e on e.id = b.event_id
where g.id = b.id
  and e.usau_slug = 'The-New-York-Minute-2025'
  and g.scheduled_at = b.old_scheduled_at;

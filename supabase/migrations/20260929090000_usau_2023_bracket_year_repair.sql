-- Re-apply the 20260928210000 year repair to 27 bracket games the 09-29 forfeit
-- re-scrape reverted. USAU's bracket pages for these three 2023 college women's
-- events print a full date with the WRONG year (2020), and sync-event-details
-- trusts full bracket dates (only year-less pool dates go through yearNearest).
-- Keeps the fresh time of day; shifts only the year back to the backed-up
-- repaired year. A future re-scrape of these events will revert them again.
set local lock_timeout = '5s';

update public.usau_games g
set scheduled_at = g.scheduled_at
  + make_interval(years => extract(year from b.new_scheduled_at)::int - extract(year from g.scheduled_at)::int)
from public.usau_games_scheduled_at_backup_20260928 b, public.usau_events e
where b.id = g.id
  and e.id = g.event_id
  and e.usau_slug in (
    'Eastern-Metro-East-D-I-College-Womens-CC-2023',
    'Great-Lakes-D-I-College-Womens-Regionals-2023',
    'Metro-East-D-I-College-Womens-Regionals-2023'
  )
  and extract(year from g.scheduled_at) = 2020
  and extract(year from b.new_scheduled_at) = 2023;

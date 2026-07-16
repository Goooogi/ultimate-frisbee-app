-- Repair the corrupt merged Nationals event 3f34de6c... which held 740 games +
-- 208 team participations spanning 2014-2018 (USAU reused a year-less slug and
-- the ingest merged 5 seasons into one). Split by played-year into proper
-- per-year events. Transactional: all-or-nothing.

-- 1. Create per-year events for 2015-2018, dates from that year's games.
insert into usau_events (usau_slug, name, season, competition_level, start_date, end_date, url)
select 'usa-ultimate-national-championships-' || y.yr,
       'USA Ultimate National Championships ' || y.yr,
       y.yr, 'CLUB'::usau_competition_level, y.mn, y.mx,
       'https://play.usaultimate.org/events/usa-ultimate-national-championships/'
from (
  select extract(year from scheduled_at)::int as yr,
         min(scheduled_at::date) as mn, max(scheduled_at::date) as mx
  from usau_games
  where event_id = '3f34de6c-6362-47e5-af0d-cfa2f6a087d1'
    and extract(year from scheduled_at)::int between 2015 and 2018
  group by 1
) y;

-- 2. Re-point event_teams FIRST (their year comes from their team's games,
--    which must still be on the merged event when we compute the mapping).
update usau_event_teams et
set event_id = e.id
from (
  select et2.team_id, min(extract(year from g.scheduled_at)::int) as yr
  from usau_event_teams et2
  join usau_games g
    on g.event_id = '3f34de6c-6362-47e5-af0d-cfa2f6a087d1'
   and (g.team_a_id = et2.team_id or g.team_b_id = et2.team_id)
  where et2.event_id = '3f34de6c-6362-47e5-af0d-cfa2f6a087d1'
  group by et2.team_id
) ty
join usau_events e on e.usau_slug = 'usa-ultimate-national-championships-' || ty.yr
where et.event_id = '3f34de6c-6362-47e5-af0d-cfa2f6a087d1'
  and et.team_id = ty.team_id
  and ty.yr between 2015 and 2018;

-- 3. Re-point games by played-year.
update usau_games g
set event_id = e.id
from usau_events e
where g.event_id = '3f34de6c-6362-47e5-af0d-cfa2f6a087d1'
  and extract(year from g.scheduled_at)::int between 2015 and 2018
  and e.usau_slug = 'usa-ultimate-national-championships-' || extract(year from g.scheduled_at)::int;

-- 4. Fix the surviving 2014 event: give it a year (so the medal name-year guard
--    accepts it) and correct its dates to 2014 only.
update usau_events
set name = 'USA Ultimate National Championships 2014',
    usau_slug = 'usa-ultimate-national-championships-2014',
    start_date = (select min(scheduled_at::date) from usau_games where event_id = '3f34de6c-6362-47e5-af0d-cfa2f6a087d1'),
    end_date   = (select max(scheduled_at::date) from usau_games where event_id = '3f34de6c-6362-47e5-af0d-cfa2f6a087d1')
where id = '3f34de6c-6362-47e5-af0d-cfa2f6a087d1';
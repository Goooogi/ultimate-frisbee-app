-- 2016 D-III College Championships is missing from ultirzr (its 2016 search
-- only carries the D-I event), so the 2015/2016 college series ingest can't
-- create it. Hand-inserted like 2019 Club Nationals (20260922204000): the
-- sync-event-details auto-stub reads only a LEADING year and would file this
-- year-suffixed slug under 2026. Values from USAU's event page (probed
-- 2026-09-24): Winston-Salem, NC, 5/21/2016 - 5/22/2016, Men's + Women's.
-- Name follows the 2017/2018 D-III rows and carries the year (yearOf guard).
-- Stages 0-2 then load it (USAU Backfill Runbook).
insert into public.usau_events (usau_slug, name, season, competition_level, start_date, end_date, city, state, url)
values (
  'usa-ultimate-d-iii-college-championships-2016',
  'D-III College Championships 2016',
  2016,
  'COLLEGE_D3',
  '2016-05-21',
  '2016-05-22',
  'Winston-Salem',
  'NC',
  'https://play.usaultimate.org/events/usa-ultimate-d-iii-college-championships-2016/'
)
on conflict (usau_slug) do nothing;

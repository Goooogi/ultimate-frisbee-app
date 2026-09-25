-- 2019 Club Nationals was never in usau_events (not in ultirzr either), so its
-- teams, games, rosters and goals/assists were missing. Hand-inserted because
-- sync-event-details' auto-stub only reads a LEADING year from the slug: this
-- year-suffixed slug would be stubbed as season 2026, level OTHER, and its
-- teams attached to 2026 team rows. Values from USAU's event page (probed
-- 2026-09-22): San Diego, CA, 10/24/2019 - 10/27/2019. Name carries the year
-- (the medal/yearOf guard requires it); template_key stays NULL like the
-- 2016-2022 Nationals rows. Stages 0-2 then load it (USAU Backfill Runbook).
insert into public.usau_events (usau_slug, name, season, competition_level, start_date, end_date, city, state, url)
values (
  'usa-ultimate-national-championships-2019',
  'USA Ultimate National Championships 2019',
  2019,
  'CLUB',
  '2019-10-24',
  '2019-10-27',
  'San Diego',
  'CA',
  'https://play.usaultimate.org/events/usa-ultimate-national-championships-2019/'
)
on conflict (usau_slug) do nothing;

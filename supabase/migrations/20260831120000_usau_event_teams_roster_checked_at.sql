-- Per-event roster backfill re-scraped every event-team whose USAU page has no
-- roster, because "covered" was inferred from the presence of usau_rosters rows
-- and an empty page writes none. ~200 pages in 2021 alone, re-fetched against
-- the WAF on every pass. Record the CHECK itself, not just its output.
--
-- Null = never checked. Set = we fetched the Eventteam page at that time; a
-- (event, team) with no roster rows AND a non-null timestamp is a confirmed
-- upstream gap, not pending work.
alter table usau_event_teams
  add column if not exists roster_checked_at timestamptz;

comment on column usau_event_teams.roster_checked_at is
  'When sync-event-rosters last fetched this event-team page. Null = never checked. Set with zero usau_rosters rows = USAU publishes no roster for it; skip rather than re-scrape.';

-- Backfill the ones we can prove were already checked: rows we have a roster
-- for were, by definition, successfully scraped. Leaves the empty-page rows
-- null so the next run stamps them as it confirms each one.
update usau_event_teams et
set roster_checked_at = now()
where roster_checked_at is null
  and exists (select 1 from usau_rosters r
              where r.event_id = et.event_id and r.team_id = et.team_id);

-- Backfill's per-event lookup is (event_id, checked, has-url).
create index if not exists usau_event_teams_roster_checked_at_idx
  on usau_event_teams (event_id) where roster_checked_at is null;

-- USAU's team page URL takes a base64-encoded per-event id:
--   /teams/events/Eventteam/?EventTeamId={base64}
-- But ultirzr gives us the persistent NUMERIC team id, which works for
-- everything except that URL. We now store both:
--   - usau_event_team_id: numeric persistent team id (from ultirzr)
--   - usau_event_team_url_id: base64 per-event id (from USAU HTML), used
--     only when fetching the team page for rosters/stats

alter table public.usau_event_teams
  add column if not exists usau_event_team_url_id text;

create index if not exists usau_event_teams_url_id_idx
  on public.usau_event_teams (usau_event_team_url_id)
  where usau_event_team_url_id is not null;

comment on column public.usau_event_teams.usau_event_team_url_id is
  'Per-event base64 EventTeamId used by USAU team-page URLs (rosters, stats). Resolved from the event schedule HTML by resolve-event-team-urls.';

-- For events that were originally HTML-scraped (before ultirzr), we DID
-- have the base64 in usau_event_team_id. Copy it over so resolver doesn't
-- have to re-do them.
update public.usau_event_teams
set usau_event_team_url_id = usau_event_team_id
where usau_event_team_id like '%=%'
  or usau_event_team_id like '%/%'
  or usau_event_team_id like '%+%';

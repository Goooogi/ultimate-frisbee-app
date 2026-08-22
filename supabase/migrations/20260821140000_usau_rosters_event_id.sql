-- Per-event USAU rosters.
--
-- USAU publishes a roster PER EVENT, not per team-season: Chain Lightning's
-- 2026 Pro-Elite Challenge East page lists 19 players and its Elite Select
-- Challenge page lists 20, with only 12 in common. The per-event roster URL
-- token (usau_event_teams.usau_event_team_url_id) is itself per-event, which is
-- the source confirming this.
--
-- usau_rosters was keyed (team_id, season, player_id) — no event dimension — so
-- sync-event-rosters' upsert made the second event scraped overwrite the first.
-- PEC East's roster was clobbered by ESC's, which is why Will Selfridge (#05)
-- and Michael Poe (#69) vanished: they played PEC East but not ESC.
--
-- Fix: add event_id and widen the PK. NULLABLE by design — the ~1.5M existing
-- rows predate per-event tracking and their true event is NOT recoverable
-- (the roster they came from was already merged/overwritten). null therefore
-- means "season roster, event unknown", and we populate going forward only.
-- Guessing an event for legacy rows would invent associations that never
-- existed, so we deliberately don't.

alter table usau_rosters add column if not exists event_id uuid
  references usau_events(id) on delete cascade;

comment on column usau_rosters.event_id is
  'Event this roster row was scraped from. NULL = legacy row predating '
  'per-event rosters (event unknown, treat as a season-level roster). '
  'Populated going forward by sync-event-rosters.';

-- Widen the key so one team-season can hold several event rosters.
--
-- NULLS NOT DISTINCT (PG15+) is load-bearing twice over: it keeps the old
-- (team_id, season, player_id) uniqueness for legacy null-event rows (Postgres
-- would otherwise treat every NULL as distinct and let them duplicate), AND it
-- keeps this a FULL index. A partial index (WHERE event_id IS NOT NULL) cannot
-- be named by PostgREST's ON CONFLICT — the upsert fails with 42P10.
alter table usau_rosters drop constraint usau_rosters_pkey;

alter table usau_rosters
  add constraint usau_rosters_event_key_uidx
  unique nulls not distinct (team_id, season, event_id, player_id);

-- Reads filter by event, and by team+season for profiles.
create index if not exists usau_rosters_event_idx on usau_rosters (event_id);
create index if not exists usau_rosters_team_season_idx on usau_rosters (team_id, season);

notify pgrst, 'reload schema';

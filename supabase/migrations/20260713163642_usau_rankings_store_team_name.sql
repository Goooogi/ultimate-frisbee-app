-- Decouple rankings from the (duplicated + incomplete) usau_teams table so we
-- store EVERY ranked team, gap-free. USAU ranks ~214 club teams/division; the
-- old design required each to name-match a usau_teams row (team_id was in the
-- PK, NOT NULL) → ~20 teams/division silently dropped (no match, or a collision
-- when several duplicate usau_teams rows share a normalized name), leaving holes
-- in the rank sequence. Now the ranking carries the team's own name/city/state
-- and links team_id only when a confident match exists.

-- Store the ranked team's identity directly.
alter table usau_rankings add column if not exists team_name text;
alter table usau_rankings add column if not exists city text;
alter table usau_rankings add column if not exists state text;

-- Backfill team_name for existing rows from the linked team (so nothing is null
-- before we flip the constraint), then require it going forward.
update usau_rankings r
set team_name = t.name
from usau_teams t
where r.team_id = t.id and r.team_name is null;

-- The rank sequence is the real identity of a ranking row within a
-- (season, week, division). Rekey on rank so an UNMATCHED team (team_id null)
-- can still be stored, and re-runs upsert cleanly.
alter table usau_rankings drop constraint if exists usau_rankings_pkey;
alter table usau_rankings alter column team_id drop not null;
alter table usau_rankings add constraint usau_rankings_pkey
  primary key (season, week, division, rank);

-- team_name is now required (identity); team_id stays optional (the link).
alter table usau_rankings alter column team_name set not null;
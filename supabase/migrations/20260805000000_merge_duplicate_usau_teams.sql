-- Merge duplicate usau_teams rows.
--
-- APPLIED 2026-08-05 against prod. 2,428 team rows merged away, ZERO games /
-- rosters / event_teams / stats / rankings lost. See "USAU Scraper Pipeline.md".
--
-- TWO BUGS were found while running it — both are fixed below, so this file is
-- now the corrected, re-runnable version (it is idempotent: a second run finds
-- no duplicates and does nothing):
--
--   1. usau_player_event_stats (2,797 rows) and usau_rankings (623 rows) also
--      FK to usau_teams and were missing from the original plan. The stats FK is
--      NO ACTION so the DELETE errored loudly — but usau_rankings is ON DELETE
--      CASCADE, so had the stats FK not blocked first, 623 ranking rows would
--      have been silently destroyed. Both are now repointed before the delete.
--   2. The team_a_id / team_b_id updates were originally written as two CTEs in
--      ONE statement, so both read the same snapshot and team_b never saw
--      team_a's changes — 4,993 game rows kept pointing at deleted teams. They
--      are now SEPARATE statements, which is required for correctness.
--
-- ── What a duplicate actually is ─────────────────────────────────────────────
-- usau_team_id (the persistent USAU id) is NULL for our rows, so every scrape of
-- an event minted a fresh usau_teams row. The same club entering three events in
-- one season therefore has three rows, splitting its games, roster and profile.
--
-- The grouping key is (lower(name), gender_division, competition_level, SEASON).
-- The season is NOT optional: 96.7% of rows sharing name+division+level are
-- single-season, i.e. one row per team-season BY DESIGN. Merging without the
-- season collapses a club's whole history into one row and destroys ~6,485
-- legitimate team-seasons. Naive key: 2,408 groups / 8,944 rows. With season:
-- 1,508 groups / 2,459 rows.
--
-- ── Why this is safe to auto-merge ───────────────────────────────────────────
-- Two rows in the same group are the SAME club only if they never appear in the
-- same event. Measured across all 3,962 same-season pairs:
--   * 3,958 pairs never share an event  -> same club, scraped per-event
--   *     4 pairs DO share an event     -> real A/B squads, EXCLUDED below
-- Corroborating: all 663 pairs where both rows carry a roster have ZERO players
-- in common and come from different events (e.g. 6ixers 2026 = Select Flight
-- Invite East + U.S. Open ICC, 22 players each). A genuine A/B split would share
-- an event; a per-event scrape artifact cannot.
--
-- The 4 excluded pairs are all 2014 sectionals/regionals:
--   KOD (Southeast Mixed Regionals), PleasureTown (East New England Mixed
--   Sectionals + Northeast Mixed Regionals), BirdFruit (Northwest Mixed Regionals)
--
-- Scope: 1,505 groups, ~2,433 rows merged away.
--
-- ── Keep-row choice ──────────────────────────────────────────────────────────
-- Richest row wins: most roster rows, then most event entries, then oldest. Ties
-- break on id so the pick is deterministic and a re-run is a no-op.

begin;

-- Groups of same-season duplicate rows, minus any group whose rows share an
-- event (a real A/B squad, not a scrape artifact).
create temporary table _dupe_plan on commit drop as
with ts as (
  select t.id, lower(t.name) as lname, t.gender_division, t.competition_level, e.season
  from usau_teams t
  join usau_event_teams et on et.team_id = t.id
  join usau_events e on e.id = et.event_id
  group by 1,2,3,4,5
),
dupe as (
  select lname, gender_division, competition_level, season
  from ts group by 1,2,3,4 having count(distinct id) > 1
),
members as (
  select ts.* from ts join dupe d using (lname, gender_division, competition_level, season)
),
ab_squads as (
  select distinct a.lname, a.gender_division, a.competition_level, a.season
  from members a
  join members b
    on a.lname = b.lname and a.gender_division = b.gender_division
   and a.competition_level = b.competition_level and a.season = b.season
   and a.id < b.id
  where exists (
    select 1 from usau_event_teams ea
    join usau_event_teams eb on eb.event_id = ea.event_id and eb.team_id = b.id
    where ea.team_id = a.id
  )
),
eligible as (
  select m.* from members m
  where not exists (
    select 1 from ab_squads x
    where x.lname = m.lname and x.gender_division = m.gender_division
      and x.competition_level = m.competition_level and x.season = m.season
  )
),
ranked as (
  select e.*,
    (select count(*) from usau_rosters r where r.team_id = e.id and r.season = e.season) as roster_rows,
    (select count(*) from usau_event_teams et where et.team_id = e.id) as entries,
    (select created_at from usau_teams t where t.id = e.id) as created_at
  from eligible e
)
select
  id as dupe_id,
  first_value(id) over w as keep_id,
  season
from ranked
window w as (
  partition by lname, gender_division, competition_level, season
  order by roster_rows desc, entries desc, created_at asc, id asc
);

-- Repoint children onto the keep row. Guarded against the unique constraints so
-- a row that would collide with an existing keep-row row is dropped, not upserted.
update usau_event_teams et set team_id = p.keep_id
from _dupe_plan p
where et.team_id = p.dupe_id and p.dupe_id <> p.keep_id
  and not exists (
    select 1 from usau_event_teams x
    where x.event_id = et.event_id and x.team_id = p.keep_id
  );

-- SEPARATE statements, deliberately. Written as two CTEs in one statement they
-- share a snapshot and the second never sees the first's writes, stranding every
-- game whose OTHER side also pointed at a merged row (4,993 rows when this ran).
update usau_games g set team_a_id = p.keep_id
from _dupe_plan p where g.team_a_id = p.dupe_id and p.dupe_id <> p.keep_id;

update usau_games g set team_b_id = p.keep_id
from _dupe_plan p where g.team_b_id = p.dupe_id and p.dupe_id <> p.keep_id;

-- Also FK to usau_teams. usau_rankings is ON DELETE CASCADE, so skipping this
-- silently destroys ranking history instead of erroring. Neither primary key
-- includes team_id, so repointing can't collide.
update usau_player_event_stats st set team_id = p.keep_id
from _dupe_plan p where st.team_id = p.dupe_id and p.dupe_id <> p.keep_id;

update usau_rankings r set team_id = p.keep_id
from _dupe_plan p where r.team_id = p.dupe_id and p.dupe_id <> p.keep_id;

update usau_rosters r set team_id = p.keep_id
from _dupe_plan p
where r.team_id = p.dupe_id and p.dupe_id <> p.keep_id
  and not exists (
    select 1 from usau_rosters x
    where x.team_id = p.keep_id and x.season = r.season and x.player_id = r.player_id
  );

-- Anything left on a dupe row would violate a unique constraint on the keep row
-- (same event / same player+season) — it is redundant by definition.
delete from usau_event_teams et using _dupe_plan p
  where et.team_id = p.dupe_id and p.dupe_id <> p.keep_id;
delete from usau_rosters r using _dupe_plan p
  where r.team_id = p.dupe_id and p.dupe_id <> p.keep_id;

delete from usau_teams t using _dupe_plan p
  where t.id = p.dupe_id and p.dupe_id <> p.keep_id;

commit;

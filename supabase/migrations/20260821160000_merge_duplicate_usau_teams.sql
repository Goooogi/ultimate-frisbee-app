-- Merge duplicate usau_teams rows (same real team-season split across two ids).
--
-- USAU sometimes issues a SECOND EventTeamId for a team within one season —
-- typically for a one-off fall event. Example: Brown Men 2018 has
-- usau_team_id 15716 (regionals, nationals, Easterns, Stanford Invite, …) and
-- 19587 (the-lobster-pot-2018 only), each carrying its OWN roster (23 and 22).
-- A player who only appeared at Lobster Pot therefore looks like they never
-- played for Brown, and the team's history is split in two.
--
-- NOT to be confused with the normal case: usau_teams is a team-SEASON table,
-- so one franchise legitimately has one row per year (Chain Lightning Men has
-- 11 rows, 2014-2026 — all correct, not duplicates). Only rows sharing
-- (lower(name), gender_division, competition_level, SEASON) are merged.
--
-- Scope at time of writing: 19 survivors / 21 losers, all 2014-2019, none
-- 2020+. "(B)" squads keep their own rows — "northeastern" and
-- "northeastern (b)" are different names, so the key already separates them.
--
-- Ordering note: this runs AFTER 20260821140000 added usau_rosters.event_id.
-- That ordering is load-bearing — under the OLD (team_id, season, player_id)
-- key, repointing two rosters onto one team row would have collided and lost
-- one squad's players. With event_id in the key they coexist as per-event
-- rosters, so the merged roster is the union rather than one overwriting the
-- other.

begin;

-- Groups of >1 team row sharing name+division+level+season, with the survivor
-- chosen as the row with the most event participations (ties: most roster
-- rows, then id) so we keep the richest history.
-- gender_division is NULL on some historical rows (12 of the 33 groups), and
-- `gd = gd` is never true for NULL — so every comparison below uses
-- IS NOT DISTINCT FROM, or those groups are silently skipped.
create temporary table _merge_map on commit drop as
with ts as (
  select distinct t.id, lower(t.name) nm, t.gender_division gd,
         t.competition_level cl, e.season
  from usau_teams t
  join usau_event_teams et on et.team_id = t.id
  join usau_events e on e.id = et.event_id
),
dup as (
  select nm, gd, cl, season from ts group by 1, 2, 3, 4 having count(distinct id) > 1
),
ranked as (
  select
    ts.id, ts.nm, ts.gd, ts.cl, ts.season,
    row_number() over (
      partition by ts.nm, ts.gd, ts.cl, ts.season
      order by (select count(*) from usau_event_teams et where et.team_id = ts.id) desc,
               (select count(*) from usau_rosters r where r.team_id = ts.id) desc,
               ts.id
    ) as rk
  from ts join dup d
    on d.nm = ts.nm and d.gd is not distinct from ts.gd
   and d.cl = ts.cl and d.season = ts.season
)
select l.id as loser_id, w.id as winner_id
from ranked l
join ranked w
  on w.nm = l.nm and w.gd is not distinct from l.gd
 and w.cl = l.cl and w.season = l.season and w.rk = 1
where l.rk > 1;

-- ── usau_event_teams ──────────────────────────────────────────────────────
-- Rows collide on the (event_id, team_id) PK two ways: a loser may share an
-- event with the WINNER (the team double-registered — 5 such pairs), and a
-- group with 3+ rows may have TWO LOSERS sharing an event with each other, so
-- the second repoint collides with the first. Guarding only against the winner
-- misses the second case and aborts the migration.
--
-- Delete every loser row whose (event_id -> winner) target is already claimed,
-- keeping one row per target: prefer the winner's own row, else the
-- lowest-id loser (deterministic).
delete from usau_event_teams et
using _merge_map m
where et.team_id = m.loser_id
  and (
    exists (
      select 1 from usau_event_teams w
      where w.team_id = m.winner_id and w.event_id = et.event_id
    )
    or exists (
      select 1
      from usau_event_teams o
      join _merge_map m2 on m2.loser_id = o.team_id
      where m2.winner_id = m.winner_id
        and o.event_id = et.event_id
        and o.team_id < et.team_id
    )
  );

update usau_event_teams et set team_id = m.winner_id
from _merge_map m where et.team_id = m.loser_id;

-- ── usau_rosters ──────────────────────────────────────────────────────────
-- Same collision guard on (team_id, season, event_id, player_id). NULLS NOT
-- DISTINCT means two legacy (null-event) rows for the same player collide too,
-- which is what we want — keep the winner's.
-- Same two-way collision as usau_event_teams: against the winner's existing
-- row, and against a lower-id sibling loser repointing to the same target.
delete from usau_rosters r
using _merge_map m
where r.team_id = m.loser_id
  and (
    exists (
      select 1 from usau_rosters w
      where w.team_id = m.winner_id
        and w.season = r.season
        and w.player_id = r.player_id
        and w.event_id is not distinct from r.event_id
    )
    or exists (
      select 1
      from usau_rosters o
      join _merge_map m2 on m2.loser_id = o.team_id
      where m2.winner_id = m.winner_id
        and o.season = r.season
        and o.player_id = r.player_id
        and o.event_id is not distinct from r.event_id
        and o.team_id < r.team_id
    )
  );

update usau_rosters r set team_id = m.winner_id
from _merge_map m where r.team_id = m.loser_id;

-- ── usau_player_event_stats ───────────────────────────────────────────────
-- Keyed (player_id, event_id); team_id is carried metadata. Repoint it so the
-- stat line agrees with the surviving team row.
update usau_player_event_stats s set team_id = m.winner_id
from _merge_map m where s.team_id = m.loser_id;

-- ── usau_games ────────────────────────────────────────────────────────────
-- 354 games point at loser rows. usau_games' FKs have NO on-delete action, so
-- skipping this would abort the delete below on a foreign-key violation — and
-- the games are real results that must follow the surviving team anyway.
update usau_games g set team_a_id = m.winner_id
from _merge_map m where g.team_a_id = m.loser_id;

update usau_games g set team_b_id = m.winner_id
from _merge_map m where g.team_b_id = m.loser_id;

-- ── usau_rankings ─────────────────────────────────────────────────────────
-- ON DELETE CASCADE, so these would be silently DESTROYED by the delete below
-- rather than moved. Repoint instead. No collision guard needed: the PK is
-- (season, week, division, rank) and doesn't include team_id, so two rows can
-- never conflict on team_id alone.
update usau_rankings k set team_id = m.winner_id
from _merge_map m where k.team_id = m.loser_id;

-- ── drop the now-empty loser rows ─────────────────────────────────────────
delete from usau_teams t using _merge_map m where t.id = m.loser_id;

commit;

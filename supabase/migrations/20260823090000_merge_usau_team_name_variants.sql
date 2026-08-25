-- Merge usau_teams rows that are the SAME team-season under a typographic
-- variant of the name (Hunter, 2026-08-23).
--
-- WHY THIS EXISTS
-- 20260821160000 merged duplicates keyed on lower(name)+division+level+season.
-- That left zero same-name duplicates — but USAU also records one team under
-- two DIFFERENT spellings in the same season:
--
--   "The UPA" / "UPA"                                  (leading article)
--   "No Touching!" / "No Touching"                     (trailing punctuation)
--   "Grand Army." / "Grand Army"                       (trailing period)
--   "Stack Cats" / "Stackcats"                         (internal space)
--   "SUNY New Paltz" / "SUNY-New Paltz"                (hyphen vs space)
--   "University of Wisconsin - Madison" / "…-Madison"  (spacing around hyphen)
--   "Dix y Chix" / "Dix'Y'Chix"                        (apostrophes)
--   "Boston University (B)" / "Boston University B"    (parens on a B squad)
--   "Summit Middle School," / "Summit Middle School"   (trailing comma)
--   "The Leftovers" / "Leftovers"                      (leading article)
--
-- Each pair has real games on BOTH rows, so merging RECOVERS split history
-- rather than discarding anything. Scope: exactly 10 groups, 10 losers.
--
-- WHY THIS MATTERS BEYOND TIDINESS
-- These split rows make one player look like two people: the same human shows
-- up on "No Touching" and "No Touching!" at the same regional, which is the
-- hard "two teams at one series event" signal the player-identity split work
-- keys on. Cleaning them here removes false positives at the source rather
-- than teaching the identity logic to work around them.
-- See vault: Player Identity/USAU Identity Split Plan.md
--
-- NORMALIZATION — deliberately CONSERVATIVE
-- Strip a leading "the "/"a ", then remove every non-alphanumeric character.
-- This collapses only punctuation/spacing/article differences. It does NOT
-- merge teams with genuinely different names that happen to share players —
-- "Alloy"/"The Muff 'n Men" and "Black Market I"/"Black Market II" stay
-- separate, which is correct: those are distinct teams (often A/B squads) whose
-- rosters legitimately overlap.
--
-- Mechanics (collision guards, repoint order, cascade handling) are copied
-- verbatim from 20260821160000 — same hazards, same fixes. See that file's
-- comments for why each guard exists.

begin;

create temporary table _variant_merge_map on commit drop as
with ts as (
  select distinct t.id, e.season, t.gender_division gd, t.competition_level cl,
    -- Mirrors the grouping used to find these; keep the two in sync.
    regexp_replace(
      regexp_replace(lower(t.name), '^(the|a)\s+', ''),
      '[^a-z0-9]+', '', 'g'
    ) as nn
  from usau_teams t
  join usau_event_teams et on et.team_id = t.id
  join usau_events e on e.id = et.event_id
),
dup as (
  select nn, gd, cl, season from ts
  group by 1, 2, 3, 4 having count(distinct id) > 1
),
ranked as (
  select ts.id, ts.nn, ts.gd, ts.cl, ts.season,
    row_number() over (
      partition by ts.nn, ts.gd, ts.cl, ts.season
      -- Survivor = richest history: most events, then most roster rows, then id.
      order by (select count(*) from usau_event_teams et where et.team_id = ts.id) desc,
               (select count(*) from usau_rosters r where r.team_id = ts.id) desc,
               ts.id
    ) as rk
  from ts
  join dup d on d.nn = ts.nn and d.gd is not distinct from ts.gd
    and d.cl = ts.cl and d.season = ts.season
)
select l.id as loser_id, w.id as winner_id
from ranked l
join ranked w
  on w.nn = l.nn and w.gd is not distinct from l.gd
 and w.cl = l.cl and w.season = l.season and w.rk = 1
where l.rk > 1;

-- ── usau_event_teams ──────────────────────────────────────────────────────
delete from usau_event_teams et
using _variant_merge_map m
where et.team_id = m.loser_id
  and (
    exists (select 1 from usau_event_teams w
            where w.team_id = m.winner_id and w.event_id = et.event_id)
    or exists (select 1 from usau_event_teams o
               join _variant_merge_map m2 on m2.loser_id = o.team_id
               where m2.winner_id = m.winner_id and o.event_id = et.event_id
                 and o.team_id < et.team_id)
  );

update usau_event_teams et set team_id = m.winner_id
from _variant_merge_map m where et.team_id = m.loser_id;

-- ── usau_rosters ──────────────────────────────────────────────────────────
delete from usau_rosters r
using _variant_merge_map m
where r.team_id = m.loser_id
  and (
    exists (select 1 from usau_rosters w
            where w.team_id = m.winner_id and w.season = r.season
              and w.player_id = r.player_id
              and w.event_id is not distinct from r.event_id)
    or exists (select 1 from usau_rosters o
               join _variant_merge_map m2 on m2.loser_id = o.team_id
               where m2.winner_id = m.winner_id and o.season = r.season
                 and o.player_id = r.player_id
                 and o.event_id is not distinct from r.event_id
                 and o.team_id < r.team_id)
  );

update usau_rosters r set team_id = m.winner_id
from _variant_merge_map m where r.team_id = m.loser_id;

-- ── usau_player_event_stats ───────────────────────────────────────────────
update usau_player_event_stats s set team_id = m.winner_id
from _variant_merge_map m where s.team_id = m.loser_id;

-- ── usau_games ────────────────────────────────────────────────────────────
-- FKs have NO on-delete action; skipping this aborts the delete below.
update usau_games g set team_a_id = m.winner_id
from _variant_merge_map m where g.team_a_id = m.loser_id;

update usau_games g set team_b_id = m.winner_id
from _variant_merge_map m where g.team_b_id = m.loser_id;

-- ── usau_rankings ─────────────────────────────────────────────────────────
-- ON DELETE CASCADE — repoint or these are silently destroyed.
update usau_rankings k set team_id = m.winner_id
from _variant_merge_map m where k.team_id = m.loser_id;

-- ── drop the now-empty loser rows ─────────────────────────────────────────
delete from usau_teams t using _variant_merge_map m where t.id = m.loser_id;

commit;

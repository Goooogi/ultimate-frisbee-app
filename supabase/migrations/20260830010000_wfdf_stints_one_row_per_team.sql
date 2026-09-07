-- One WFDF roster row per team on a unified player profile.
--
-- Jacob Miller's profile listed the SAME team twice for WUCC 2026 — Wolves #43
-- (16G/5A) and Wolves #27 (3G/5A). Both rows are real, and they are two
-- different people: wfdf_player_id 1633 "Jacob Miller" and 1631 "Jacob
-- Rubin-Miller", teammates on the Chilean Wolves roster.
--
-- names_match merges them because normalize_player_name turns the hyphen into a
-- space: "Jacob Rubin-Miller" tokenizes as givens [jacob, rubin] + surname
-- miller, so the token-subset rule reads "rubin" as a middle name and accepts
-- {jacob} as a subset. A hyphenated surname is indistinguishable from a middle
-- name once the hyphen is gone.
--
-- We are NOT changing normalize_player_name/names_match — the token-subset rule
-- is load-bearing for legitimate cross-league merges ("Mitchell McCarthy" ↔
-- "Robert Mitchell McCarthy") and widening it would ripple through search dedup
-- and every league's attach.
--
-- Instead we use a fact that only holds inside a single roster: two rows on the
-- SAME team (wfdf_teams is per-event, so one team row = one team at one event in
-- one year) with different jersey numbers are necessarily two different humans.
-- One person cannot appear twice on the roster they played. So keep at most one
-- row per team and pick the best-matching one:
--   1. exact normalized full-name equality with the anchor wins outright
--   2. else the closest name (fewest tokens)
--   3. else roster id, so the choice is deterministic across rebuilds
--
-- This is symmetric: Jacob Miller's profile keeps #43, and Jacob Rubin-Miller's
-- keeps #27. Teams where only one row matches are untouched.
--
-- prosrc patch, NOT create-or-replace from committed text: _build_player_profile
-- is shared with the mobile repo and has remote-only migrations (per CLAUDE.md).
-- Recreate from pg_get_functiondef (the LIVE definition), not a hardcoded
-- header: the deployed attributes have already drifted — the function is
-- VOLATILE today while this repo's 20260804050000 header says STABLE — and a
-- hardcoded header would silently rewrite them.
DO $migration$
DECLARE
  v_oid oid;
  v_def text;
  c_old_select constant text :=
'wfdf_stints as (
    select
      r.full_name, r.jersey_number, r.goals, r.assists,';
  c_new_select constant text :=
'wfdf_stints as (
    select distinct on (t.id)
      r.full_name, r.jersey_number, r.goals, r.assists,';
  c_old_where constant text :=
'      and public.normalize_player_name(r.last_name) ilike ''%'' || ws.surname || ''%''
      and public.names_match(v_anchor_name, r.full_name)
  )';
  c_new_where constant text :=
'      and public.normalize_player_name(r.last_name) ilike ''%'' || ws.surname || ''%''
      and public.names_match(v_anchor_name, r.full_name)
    order by t.id,
      (public.normalize_player_name(r.full_name) = public.normalize_player_name(v_anchor_name)) desc,
      array_length(regexp_split_to_array(public.normalize_player_name(r.full_name), ''\s+''), 1) asc,
      r.id
  )';
BEGIN
  v_oid := to_regprocedure('public._build_player_profile(text)');
  IF v_oid IS NULL THEN RAISE EXCEPTION '_build_player_profile not found'; END IF;
  v_def := pg_get_functiondef(v_oid);

  -- guard on the exact text this migration inserts, so the euf twin
  -- (20260830020000) adding its own "select distinct on (t.id)" can never
  -- make this one think it already ran
  IF position(c_new_select in v_def) > 0 THEN
    RAISE NOTICE 'wfdf_stints already patched; skipping'; RETURN;
  END IF;

  IF (length(v_def) - length(replace(v_def, c_old_select, ''))) / length(c_old_select) <> 1 THEN
    RAISE EXCEPTION 'wfdf_stints select anchor not unique';
  END IF;
  IF (length(v_def) - length(replace(v_def, c_old_where, ''))) / length(c_old_where) <> 1 THEN
    RAISE EXCEPTION 'wfdf_stints where anchor not unique';
  END IF;

  EXECUTE replace(replace(v_def, c_old_select, c_new_select), c_old_where, c_new_where);
END
$migration$;

-- Only profiles that actually carry WFDF stints can change, so drop just those
-- from the cache rather than cold-starting every profile.
DELETE FROM player_profiles
WHERE coalesce(jsonb_array_length(profile -> 'wfdfStints'), 0) > 0;

NOTIFY pgrst, 'reload schema';

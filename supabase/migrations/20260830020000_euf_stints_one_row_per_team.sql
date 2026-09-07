-- One EUF roster row per team on a unified player profile — the euf_stints
-- twin of 20260830010000 (wfdf). Not prophylactic: "Joe Miller" (#15) and
-- "Joel Miller" (#42) are different humans co-rostered on Smash'D in BOTH
-- 2025 and 2026, names_match accepts each as the other, and each profile
-- currently double-lists those teams with both stat lines.
--
-- euf_teams is per-event, so two matching rows on one team row are two
-- different people. Keep at most one row per team:
--   1. exact normalized full-name equality with the anchor wins outright
--   2. else the closest name (fewest tokens)
--   3. else roster id, so the choice is deterministic across rebuilds
--
-- prosrc patch from pg_get_functiondef (the LIVE definition), not committed
-- text: _build_player_profile is shared with the mobile repo and has drifted
-- from committed SQL (per CLAUDE.md). The where-anchor below is the LIVE
-- symmetric name_last_norm prefilter, which itself differs from this repo's
-- 20260804050000 text — verified verbatim against prosrc before staging.
DO $migration$
DECLARE
  v_oid oid;
  v_def text;
  c_old_select constant text :=
'euf_stints as (
    select
      r.full_name, r.jersey_number, r.goals, r.assists, r.games, r.total,';
  c_new_select constant text :=
'euf_stints as (
    select distinct on (t.id)
      r.full_name, r.jersey_number, r.goals, r.assists, r.games, r.total,';
  c_old_where constant text :=
'      and (r.name_last_norm ilike ''%'' || (select surname from wfdf_surname) || ''%''
        or (select surname from wfdf_surname) ilike ''%'' || r.name_last_norm || ''%'')
      and public.names_match(v_anchor_name, r.full_name)
  ),';
  c_new_where constant text :=
'      and (r.name_last_norm ilike ''%'' || (select surname from wfdf_surname) || ''%''
        or (select surname from wfdf_surname) ilike ''%'' || r.name_last_norm || ''%'')
      and public.names_match(v_anchor_name, r.full_name)
    order by t.id,
      (public.normalize_player_name(r.full_name) = public.normalize_player_name(v_anchor_name)) desc,
      array_length(regexp_split_to_array(public.normalize_player_name(r.full_name), ''\s+''), 1) asc,
      r.id
  ),';
BEGIN
  v_oid := to_regprocedure('public._build_player_profile(text)');
  IF v_oid IS NULL THEN RAISE EXCEPTION '_build_player_profile not found'; END IF;
  v_def := pg_get_functiondef(v_oid);

  IF position(c_new_select in v_def) > 0 THEN
    RAISE NOTICE 'euf_stints already patched; skipping'; RETURN;
  END IF;

  IF (length(v_def) - length(replace(v_def, c_old_select, ''))) / length(c_old_select) <> 1 THEN
    RAISE EXCEPTION 'euf_stints select anchor not unique';
  END IF;
  IF (length(v_def) - length(replace(v_def, c_old_where, ''))) / length(c_old_where) <> 1 THEN
    RAISE EXCEPTION 'euf_stints where anchor not unique';
  END IF;

  EXECUTE replace(replace(v_def, c_old_select, c_new_select), c_old_where, c_new_where);
END
$migration$;

-- Only profiles carrying EUF stints can change.
DELETE FROM player_profiles
WHERE coalesce(jsonb_array_length(profile -> 'eufStints'), 0) > 0;

NOTIFY pgrst, 'reload schema';

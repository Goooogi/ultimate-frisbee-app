-- Make _build_player_profile's EUF surname prefilter symmetric.
--
-- names_match now accepts joined-vs-split particle surnames ("Daan DeMarree"
-- ↔ "Daan De Marrée"), but the euf_stints CTE's cheap prefilter only asked
-- "does the roster's LAST TOKEN contain the anchor surname?". That covers a
-- split anchor vs a joined roster ("demarree" contains "marree") but drops the
-- reverse before names_match ever runs: a JOINED anchor surname ("demarree")
-- is never contained in a split roster's last token ("marree"). Add the
-- reverse containment so both directions reach names_match.
--
-- prosrc patch, NOT create-or-replace from committed text: _build_player_profile
-- is shared with the mobile repo and has remote-only migrations (per CLAUDE.md).
-- The replaced fragment is the exact text inserted by 20260803200000.
DO $migration$
DECLARE
  v_src text;
  c_old constant text :=
'      and split_part(public.normalize_player_name(r.full_name), '' '',
            array_length(regexp_split_to_array(public.normalize_player_name(r.full_name), ''\s+''), 1))
          ilike ''%'' || ws.surname || ''%''
      and public.names_match(v_anchor_name, r.full_name)';
  c_new constant text :=
'      and (split_part(public.normalize_player_name(r.full_name), '' '',
            array_length(regexp_split_to_array(public.normalize_player_name(r.full_name), ''\s+''), 1))
          ilike ''%'' || ws.surname || ''%''
        or ws.surname ilike ''%'' || split_part(public.normalize_player_name(r.full_name), '' '',
            array_length(regexp_split_to_array(public.normalize_player_name(r.full_name), ''\s+''), 1)) || ''%'')
      and public.names_match(v_anchor_name, r.full_name)';
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE proname = '_build_player_profile';
  IF v_src IS NULL THEN RAISE EXCEPTION '_build_player_profile not found'; END IF;
  IF position('or ws.surname ilike' in v_src) > 0 THEN
    RAISE NOTICE 'already patched; skipping'; RETURN;
  END IF;

  IF (length(v_src) - length(replace(v_src, c_old, ''))) / length(c_old) <> 1 THEN
    RAISE EXCEPTION 'euf prefilter anchor not unique';
  END IF;

  v_src := replace(v_src, c_old, c_new);

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public._build_player_profile(p_anchor_id text) '
    'RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS %L',
    v_src);
END
$migration$;

-- Rebuild cached profiles with the widened matching.
DELETE FROM player_profiles;

NOTIFY pgrst, 'reload schema';

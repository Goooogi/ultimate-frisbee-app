-- Emit euf_events.kind on each EUF stint in the shared player profile.
--
-- Hunter's call (2026-08-04): gold "Champion" treatment is reserved for EUCF
-- wins; winning a tour stop or invite renders as a plain 1st. The front end
-- needs the event kind on each stint to make that distinction — name/slug
-- parsing is not an option (the two Wroclaw events have SWAPPED slugs).
--
-- prosrc patch (shared fn, remote-only sibling migrations — per CLAUDE.md).
-- Anchors are exact fragments of the euf_stints CTE inserted by 20260803200000;
-- both include euf-only identifiers (t.final_placement / ef.event_name) so they
-- can't collide with the wfdf block.
DO $migration$
DECLARE
  v_src text;
  c_sel_old constant text :=
'      t.final_placement,
      e.name as event_name, e.slug as event_slug, e.year';
  c_sel_new constant text :=
'      t.final_placement,
      e.name as event_name, e.slug as event_slug, e.kind::text as event_kind, e.year';
  c_emit_old constant text :=
'''eventName'', ef.event_name, ''eventSlug'', ef.event_slug,';
  c_emit_new constant text :=
'''eventName'', ef.event_name, ''eventSlug'', ef.event_slug, ''eventKind'', ef.event_kind,';
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE proname = '_build_player_profile';
  IF v_src IS NULL THEN RAISE EXCEPTION '_build_player_profile not found'; END IF;
  IF position('event_kind' in v_src) > 0 THEN
    RAISE NOTICE 'already patched; skipping'; RETURN;
  END IF;

  IF (length(v_src) - length(replace(v_src, c_sel_old, ''))) / length(c_sel_old) <> 1 THEN
    RAISE EXCEPTION 'select anchor not unique';
  END IF;
  IF (length(v_src) - length(replace(v_src, c_emit_old, ''))) / length(c_emit_old) <> 1 THEN
    RAISE EXCEPTION 'emit anchor not unique';
  END IF;

  v_src := replace(v_src, c_sel_old, c_sel_new);
  v_src := replace(v_src, c_emit_old, c_emit_new);

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public._build_player_profile(p_anchor_id text) '
    'RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS %L',
    v_src);
END
$migration$;

-- Cached profiles lack eventKind; rebuild on next read.
DELETE FROM player_profiles;

NOTIFY pgrst, 'reload schema';

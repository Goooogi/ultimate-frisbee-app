-- _build_player_profile crashed for any player with a USAU team-season that has
-- zero events (131 players on 2026-09-22, e.g. de2c3a83-a6df-441f-a485-6ae8f6721c3d):
-- usau_raw_stint_events.events is NULL for such a stint (no participation, or
-- every event dropped by the per-event roster gate), jsonb_agg turns it into
-- [null], and usau_merged_events' jsonb_array_elements then throws "cannot
-- extract elements from a scalar". Web fell back to its 6-10 query assembler on
-- every regen; mobile showed "couldn't find this player". An all-NULL group now
-- aggregates to NULL, which the downstream coalesce(..., '[]') already handles.
--
-- prosrc patch from the LIVE definition (shared with mobile, remote-only
-- migrations, attributes have drifted) — same pattern as 20260830010000.
DO $migration$
DECLARE
  v_oid oid;
  v_def text;
  c_old constant text := '      jsonb_agg(se.events) as event_arrays';
  c_new constant text := '      jsonb_agg(se.events) filter (where se.events is not null) as event_arrays';
BEGIN
  v_oid := to_regprocedure('public._build_player_profile(text)');
  IF v_oid IS NULL THEN RAISE EXCEPTION '_build_player_profile not found'; END IF;
  v_def := pg_get_functiondef(v_oid);

  IF position(c_new in v_def) > 0 THEN
    RAISE NOTICE 'usau_merge_groups already patched; skipping'; RETURN;
  END IF;
  IF (length(v_def) - length(replace(v_def, c_old, ''))) / length(c_old) <> 1 THEN
    RAISE EXCEPTION 'usau_merge_groups anchor not unique';
  END IF;

  EXECUTE replace(v_def, c_old, c_new);
END
$migration$;

-- _build_player_profile is SECURITY DEFINER and uncached: callable over REST it
-- lets anyone burn DB CPU around the player_profiles cache. Only the definer
-- _rebuild_and_cache_player_profile calls it; apps call get_player_profile.
REVOKE EXECUTE ON FUNCTION public._build_player_profile(text) FROM PUBLIC, anon, authenticated;

-- UTCG write RPCs are SECURITY DEFINER and reject a null auth.uid(), but anon
-- (and PUBLIC) could still invoke them. Signed-in users keep their explicit grant.
REVOKE EXECUTE ON FUNCTION
  public.utcg_draft_abandon(uuid),
  public.utcg_draft_pick(uuid, integer),
  public.utcg_draft_play(uuid),
  public.utcg_draft_start(text),
  public.utcg_ensure_wallet(),
  public.utcg_market_accept_offer(uuid),
  public.utcg_market_buy(uuid),
  public.utcg_market_cancel(uuid),
  public.utcg_market_decline_offer(uuid),
  public.utcg_market_list(text, text, integer, text, integer),
  public.utcg_market_make_offer(uuid, jsonb, integer),
  public.utcg_market_withdraw_offer(uuid),
  public.utcg_open_pack(text),
  public.utcg_quicksell(text, text, integer, integer),
  public.utcg_record_match(text, jsonb)
FROM PUBLIC, anon;

NOTIFY pgrst, 'reload schema';

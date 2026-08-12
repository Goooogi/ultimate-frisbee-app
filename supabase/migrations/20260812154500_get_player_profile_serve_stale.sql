-- get_player_profile: stop rebuilding INLINE on the read path.
--
-- Root cause of the 2026-08-12 OOM crash (vault "Supabase Load Diagnosis
-- 2026-08-11"): the function served the cache only while fresh, and on a miss
-- it ran _rebuild_and_cache_player_profile (~300ms) with the reader waiting.
-- A crawler sweeping 182k profiles revisits each one slower than the 24h TTL,
-- so essentially EVERY crawl hit was a cold rebuild — the cache structurally
-- could not absorb crawl traffic. Peaked at 48,838 calls/hr and the DB died.
--
-- New behaviour: ANY cached row is returned immediately, however stale. Only a
-- genuine cache MISS (no row at all — a profile we have never built) still
-- rebuilds inline, because there is nothing to serve otherwise; that is
-- bounded by the number of never-seen anchors, not by crawl volume.
-- Refresh now comes from the background trickle (see the companion cron
-- migration), which drains oldest-first using player_profiles_built_at_idx.
--
-- App Health Rule #1: no expensive work on the read path.
--
-- Shared-DB note (CLAUDE.md): this RPC is shared with the mobile Expo repo and
-- the deployed body can diverge from committed SQL, so we PATCH prosrc rather
-- than `create or replace` from committed text — this rewrites only the
-- decision branch and leaves the rest of the deployed body byte-identical.
-- Fails loudly if the expected text is not found.
do $$
declare
  v_src text;
  v_old text;
  v_new text;
begin
  select prosrc into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'get_player_profile'
    and pg_get_function_identity_arguments(p.oid) = 'p_anchor_id text';

  if v_src is null then
    raise exception 'get_player_profile(text) not found';
  end if;

  -- The freshness gate: only return the cache while inside the TTL.
  v_old := 'if v_cached is not null and v_built_at > now() - c_staleness_window then'
        || E'\n    return v_cached;\n  end if;';

  -- Serve ANY cached row, stale or not. The TTL no longer gates the read; it
  -- only informs the background trickle which rows to refresh first.
  v_new := '-- Serve stale unconditionally (2026-08-12): a cached row is always'
        || E'\n  -- returned, even past c_staleness_window. Refresh is the background'
        || E'\n  -- trickle''s job, never the reader''s. Only a true miss falls through.'
        || E'\n  if v_cached is not null then'
        || E'\n    return v_cached;\n  end if;';

  if position(v_old in v_src) = 0 then
    raise exception 'get_player_profile: expected freshness gate not found — deployed body changed, re-inspect prosrc before patching';
  end if;

  v_src := replace(v_src, v_old, v_new);

  -- search_path mirrors the deployed config exactly (public, pg_temp) — do not
  -- narrow it here or the SECURITY DEFINER body resolves differently.
  execute format(
    'create or replace function public.get_player_profile(p_anchor_id text) returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as %L',
    v_src
  );
end $$;

notify pgrst, 'reload schema';

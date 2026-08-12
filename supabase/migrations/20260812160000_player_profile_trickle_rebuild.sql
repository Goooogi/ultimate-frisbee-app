-- Background trickle rebuild for player_profiles (part 2 of the 2026-08-12 fix).
--
-- Part 1 made get_player_profile serve stale unconditionally, which removed the
-- crash vector but also removed the only thing that ever refreshed a profile.
-- This is that refresh path: a bounded, oldest-first drain that runs on cron
-- instead of on reader traffic (App Health Rule #1).
--
-- Rate: 50 profiles/min. Measured cost is ~128ms per rebuild on an idle DB
-- (25 rebuilds in 3.2s), so 50/min ≈ 6.4 CPU-seconds per 60s ≈ 11% of one core
-- on the 2-vCPU instance. The 120,638-row backlog clears in ~40 hours.
-- NOTE: the historical player_profiles.build_ms average (773ms) is NOT a valid
-- cost estimate — those rows were written during the outage when the DB was
-- saturated. Re-measure on an idle DB before changing the rate.
--
-- Ordering: built_at ascending via player_profiles_built_at_idx. The existing
-- staleness triggers set built_at = '-infinity', which sorts first, so
-- event-flagged profiles (new UFA/USAU stats) jump the queue automatically —
-- no separate queue table needed.
--
-- Unresolvable anchors: _rebuild_and_cache_player_profile returns null WITHOUT
-- writing a row when _build_player_profile can't resolve the anchor. Left
-- alone, such a row keeps its old built_at, gets re-selected every single tick,
-- and blocks the head of the queue forever. We stamp those rows to now() so
-- they rotate to the back instead. The profile jsonb is left untouched, so the
-- cached content readers see is unchanged.
create or replace function public.trickle_rebuild_player_profiles(p_limit int default 50)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  v_done int := 0;
begin
  for r in
    select anchor_id
    from public.player_profiles
    where built_at < now() - interval '24 hours'
    order by built_at asc
    limit p_limit
  loop
    begin
      if public._rebuild_and_cache_player_profile(r.anchor_id) is null then
        -- Unresolvable: rotate to the back of the queue so it stops blocking.
        update public.player_profiles
           set built_at = now()
         where anchor_id = r.anchor_id;
      end if;
      v_done := v_done + 1;
    exception when others then
      -- One bad profile must not abort the whole tick. Rotate it back and
      -- keep going; the error is logged for follow-up.
      raise warning 'trickle_rebuild: % failed: %', r.anchor_id, sqlerrm;
      update public.player_profiles
         set built_at = now()
       where anchor_id = r.anchor_id;
    end;
  end loop;
  return v_done;
end;
$$;

-- Cron-only: no reason for anon/authenticated to reach this. REVOKE must target
-- PUBLIC — revoking from anon/authenticated alone is a silent no-op.
revoke all on function public.trickle_rebuild_player_profiles(int) from public;
revoke all on function public.trickle_rebuild_player_profiles(int) from anon, authenticated;

select cron.schedule(
  'trickle-rebuild-player-profiles',
  '* * * * *',
  $cron$select public.trickle_rebuild_player_profiles(50)$cron$
);

-- Staleness trigger coverage for PUL / WUL / EUF / WFDF (part 3 of the
-- 2026-08-12 fix). Vault: "App Health Rules.md".
--
-- Before this, _stale_player_profile fired ONLY on ufa_game_player_stats and
-- usau_player_event_stats. The other four leagues never event-flagged a profile
-- stale, so their data only refreshed when the background trickle's oldest-first
-- sweep happened to reach the row (~40h worst case). That gap is why the old
-- blunt 24h TTL existed on the read path in the first place.
--
-- WHY A SEPARATE FUNCTION: the existing _stale_player_profile keys off
-- new.player_id and resolves the profile by anchor_id. None of these four tables
-- has a player_id column at all — PUL/WUL/EUF/WFDF key their stat rows by NAME
-- (player_name / full_name). So this variant resolves by display name instead.
--
-- WHY NAME MATCHING IS REQUIRED, NOT JUST CONVENIENT: a PUL player is very often
-- also merged into a USAU- or UFA-anchored profile (verified: a PUL stat change
-- for "Abby Hecko" must flag 14 profiles spanning pul, usau AND wul). Flagging
-- only the same-league anchor row would silently miss the merged profiles, which
-- are the ones most readers actually land on.
--
-- Index dependency: player_profiles_display_name_idx. Without it this trigger is
-- an unindexed scan of 182k jsonb rows on EVERY ingested stat row — that would
-- recreate the outage from the write side. With it, ~1.6ms per lookup.
create index concurrently if not exists player_profiles_display_name_idx
  on public.player_profiles (lower(profile->>'displayName'));

create or replace function public._stale_player_profile_by_name()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text;
begin
  -- to_jsonb(new) ->> tg_argv[0] rather than new.<column>: plpgsql compiles ALL
  -- branches of a CASE over new.*, so naming a column that exists on only some
  -- of this trigger's four tables raises "record new has no field ..." at
  -- runtime and BREAKS THE INGEST WRITE. Caught in testing against PUL.
  v_name := lower(trim(coalesce(to_jsonb(new) ->> tg_argv[0], '')));
  if v_name = '' then return null; end if;

  -- `built_at <> '-infinity'` keeps an already-flagged profile from being
  -- re-written thousands of times during a bulk ingest (same guard as the
  -- original trigger). '-infinity' sorts first on player_profiles_built_at_idx,
  -- so flagged profiles jump to the head of the trickle queue for free.
  update public.player_profiles
     set built_at = '-infinity'
   where lower(profile->>'displayName') = v_name
     and built_at <> '-infinity';
  return null;
end;
$$;

revoke all on function public._stale_player_profile_by_name() from public;
revoke all on function public._stale_player_profile_by_name() from anon, authenticated;

-- All UPDATE triggers carry WHEN (old.* is distinct from new.*), matching the
-- existing UFA/USAU convention: idempotent re-ingests (the common case) fire no
-- trigger work at all. Verified: a no-op update over 500 EUF rows flags nothing.
-- Worst case measured — a full EUF re-ingest where all 59,803 rows genuinely
-- change — flags 1,006 profiles, i.e. ~20 min of trickle at 50/min. Bounded.

drop trigger if exists stale_profile_on_pul_stats_ins on public.pul_game_player_stats;
drop trigger if exists stale_profile_on_pul_stats_upd on public.pul_game_player_stats;
create trigger stale_profile_on_pul_stats_ins after insert on public.pul_game_player_stats
  for each row execute function public._stale_player_profile_by_name('player_name');
create trigger stale_profile_on_pul_stats_upd after update on public.pul_game_player_stats
  for each row when (old.* is distinct from new.*)
  execute function public._stale_player_profile_by_name('player_name');

drop trigger if exists stale_profile_on_wul_stats_ins on public.wul_game_player_stats;
drop trigger if exists stale_profile_on_wul_stats_upd on public.wul_game_player_stats;
create trigger stale_profile_on_wul_stats_ins after insert on public.wul_game_player_stats
  for each row execute function public._stale_player_profile_by_name('player_name');
create trigger stale_profile_on_wul_stats_upd after update on public.wul_game_player_stats
  for each row when (old.* is distinct from new.*)
  execute function public._stale_player_profile_by_name('player_name');

drop trigger if exists stale_profile_on_euf_stats_ins on public.euf_game_player_stats;
drop trigger if exists stale_profile_on_euf_stats_upd on public.euf_game_player_stats;
create trigger stale_profile_on_euf_stats_ins after insert on public.euf_game_player_stats
  for each row execute function public._stale_player_profile_by_name('full_name');
create trigger stale_profile_on_euf_stats_upd after update on public.euf_game_player_stats
  for each row when (old.* is distinct from new.*)
  execute function public._stale_player_profile_by_name('full_name');

-- WFDF has no per-game player stats table; rosters are its player-level source.
drop trigger if exists stale_profile_on_wfdf_rosters_ins on public.wfdf_rosters;
drop trigger if exists stale_profile_on_wfdf_rosters_upd on public.wfdf_rosters;
create trigger stale_profile_on_wfdf_rosters_ins after insert on public.wfdf_rosters
  for each row execute function public._stale_player_profile_by_name('full_name');
create trigger stale_profile_on_wfdf_rosters_upd after update on public.wfdf_rosters
  for each row when (old.* is distinct from new.*)
  execute function public._stale_player_profile_by_name('full_name');

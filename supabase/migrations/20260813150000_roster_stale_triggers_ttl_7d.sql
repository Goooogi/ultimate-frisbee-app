-- Roster-time profile refresh + TTL 24h -> 7d (2026-08-13, Hunter's call).
--
-- Scrape-time freshness now covers roster-only pickups (player added to a team
-- before any stats exist): usau_rosters (id-keyed) and euf_rosters (by-name)
-- get the same stale-flag triggers the six stat tables + wfdf_rosters already
-- have. Flagged rows sort first in the trickle (built_at='-infinity'), so a
-- scraped roster shows on the profile within minutes.
--
-- With event-driven staleness on every ingest path, the 24h TTL's only
-- remaining job is the name-match/merge-drift backstop -> 7 days. At 24h the
-- backlog could mathematically never drain (inflow ~194k/day vs ~80k/day
-- rebuild capacity); at 7d inflow is ~28k/day and the queue actually clears.

create trigger stale_profile_on_usau_rosters_ins
  after insert on public.usau_rosters
  for each row execute function _stale_player_profile();

create trigger stale_profile_on_usau_rosters_upd
  after update on public.usau_rosters
  for each row when (old.* is distinct from new.*)
  execute function _stale_player_profile();

create trigger stale_profile_on_euf_rosters_ins
  after insert on public.euf_rosters
  for each row execute function _stale_player_profile_by_name('full_name');

create trigger stale_profile_on_euf_rosters_upd
  after update on public.euf_rosters
  for each row when (old.* is distinct from new.*)
  execute function _stale_player_profile_by_name('full_name');

-- TTL: body is the live prosrc (verified 2026-08-13) with only the interval
-- changed, per the shared-DB rule (never re-create a shared fn from repo text).
create or replace function public.trickle_rebuild_player_profiles(p_limit int default 50)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare r record; v_done int := 0;
begin
  for r in select anchor_id from public.player_profiles
    where built_at < now() - interval '7 days' order by built_at asc limit p_limit
  loop
    begin
      if public._rebuild_and_cache_player_profile(r.anchor_id) is null then
        update public.player_profiles set built_at = now() where anchor_id = r.anchor_id;
      end if;
      v_done := v_done + 1;
    exception when others then
      raise warning 'trickle_rebuild: % failed: %', r.anchor_id, sqlerrm;
      update public.player_profiles set built_at = now() where anchor_id = r.anchor_id;
    end;
  end loop;
  return v_done;
end;
$$;

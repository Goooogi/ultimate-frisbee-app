-- find_usau_player_by_name: rank namesakes by DISTINCT (team, season) stints.
--
-- Was `count(*) from usau_rosters` — the same raw-row metric list_usau_players
-- moved off in 20260821150000. usau_rosters is per-event now (event_id joined
-- the key in 20260821140000), so one player-season scores once per event that
-- team attended. 6,139 players already carry an inflated count (worst +3), and
-- that grows with every event scraped: a player on a team that played 5 events
-- would eventually outrank a genuinely longer-tenured namesake purely on
-- tournament count.
--
-- Measured before applying: 4,757 of 47,077 namesake groups resolve to a
-- different id under the new metric, but ALL of those are arbitrary tie-breaks
-- (both candidates have equal stints, so `p.id` decides) — 0 are genuine
-- ranking improvements, and there are currently 0 inverted pairs. This is
-- therefore a PRE-EMPTIVE fix: it keeps the resolver stable as roster scraping
-- fills in, rather than letting the ranking drift event by event.
--
-- Caught by the mobile repo session during the shared-DB audit.
create or replace function find_usau_player_by_name(p_name text)
returns uuid
language sql
stable
set search_path to 'public'
as $$
  select p.id
  from public.usau_players p
  where public.normalize_player_name(p.display_name) ilike
        '%' || split_part(public.normalize_player_name(p_name), ' ',
              array_length(regexp_split_to_array(public.normalize_player_name(p_name), '\s+'), 1)) || '%'
    and public.names_match(p_name, p.display_name)
  order by (
    select count(distinct (r.team_id, r.season))
    from public.usau_rosters r
    where r.player_id = p.id
  ) desc, p.id
  limit 1;
$$;

notify pgrst, 'reload schema';

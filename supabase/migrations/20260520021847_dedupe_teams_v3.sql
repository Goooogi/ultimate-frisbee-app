do $$
declare
  rec record;
  canonical_id uuid;
  dupe_ids uuid[];
begin
  for rec in
    select lower(name) as name_norm, competition_level
    from public.usau_teams
    group by lower(name), competition_level
    having count(*) > 1
  loop
    select id into canonical_id
    from public.usau_teams
    where lower(name) = rec.name_norm
      and (competition_level is not distinct from rec.competition_level)
    order by (usau_team_id is null) asc, created_at asc
    limit 1;

    select array_agg(id) into dupe_ids
    from public.usau_teams
    where lower(name) = rec.name_norm
      and (competition_level is not distinct from rec.competition_level)
      and id <> canonical_id;

    if dupe_ids is null or array_length(dupe_ids, 1) is null then
      continue;
    end if;

    -- Pre-delete colliding event_teams rows (dupe has a participation at
    -- an event where canonical already has one).
    delete from public.usau_event_teams
    where team_id = any(dupe_ids)
      and event_id in (
        select event_id from public.usau_event_teams where team_id = canonical_id
      );

    -- Pre-delete colliding rosters: same (season, player_id) on canonical
    -- means the dupe's row would collide.
    delete from public.usau_rosters r
    where r.team_id = any(dupe_ids)
      and exists (
        select 1 from public.usau_rosters c
        where c.team_id = canonical_id
          and c.season = r.season
          and c.player_id = r.player_id
      );

    -- Repoint remaining FK references to canonical.
    update public.usau_event_teams set team_id = canonical_id where team_id = any(dupe_ids);
    update public.usau_games set team_a_id = canonical_id where team_a_id = any(dupe_ids);
    update public.usau_games set team_b_id = canonical_id where team_b_id = any(dupe_ids);
    update public.usau_rosters set team_id = canonical_id where team_id = any(dupe_ids);
    update public.usau_player_event_stats set team_id = canonical_id where team_id = any(dupe_ids);

    delete from public.usau_teams where id = any(dupe_ids);
  end loop;
end $$;

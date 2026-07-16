create or replace function public.top_usau_club_teams(
  p_gender_division text default 'Men',
  p_limit int default 16
)
returns table(id uuid, name text, nationals_placement int)
language sql
stable
as $$
  with nats as (
    select e.id
    from usau_events e
    where e.competition_level = 'CLUB'
      and e.name ilike '%Nationals%'
      and exists (select 1 from usau_event_teams et where et.event_id = e.id)
    order by e.season desc
    limit 1
  )
  select t.id, t.name, et.final_placement as nationals_placement
  from usau_event_teams et
  join nats on nats.id = et.event_id
  join usau_teams t on t.id = et.team_id
  where t.gender_division::text = p_gender_division
  order by
    (et.final_placement is null),
    et.final_placement asc nulls last,
    et.seed asc nulls last,
    t.name asc
  limit p_limit;
$$;

grant execute on function public.top_usau_club_teams(text, int) to anon, authenticated;
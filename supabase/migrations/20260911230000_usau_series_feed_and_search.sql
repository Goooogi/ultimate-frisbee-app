-- USAU Series, phase 4: the Scores feed view + a grouped event search.
--
-- usau_event_feed — one row per ORDINARY event plus one row per series STAGE
-- (season × series_stage × level), so /scores pages sectionals weekend as one
-- card instead of 81 per-division rows. Series members (series_stage IS NOT
-- NULL) never appear as event rows, which also keeps GGM members stored as
-- GRAND_MASTERS out of the GM feed (level comes from series_tier, not the
-- stored competition_level).
--   • sort_date: events → end_date; stages → the Sunday of the weekend holding
--     the stage's first day, so a stage leads its weekend (kind_rank 0).
--   • Stage dates ignore members whose span > 4 days (placeholder-dated rows
--     span a month) unless every member is placeholder-dated.
--   • security_invoker: the anon caller's world-readable RLS applies.
--
-- search_usau_event_groups_fuzzy — the fuzzy event search collapsed to one row
-- per merged tournament (coalesce(series_group_key, usau_slug)). `division` is
-- the best-matching member's division when it matches uniquely, so "rocky
-- mountain womens" opens the Women tab; ties return NULL. The old
-- search_usau_events_fuzzy stays untouched (mobile calls it).

create view public.usau_event_feed
with (security_invoker = true) as
select
  'event'::text as kind,
  e.usau_slug as key,
  e.id as event_id,
  e.name,
  e.season,
  e.competition_level as level,
  null::text as series_stage,
  e.start_date,
  e.end_date,
  e.end_date as sort_date,
  1 as kind_rank,
  e.flight_rank,
  1::bigint as group_count,
  exists (select 1 from public.usau_games g where g.event_id = e.id) as has_games
from public.usau_events e
where e.series_stage is null
union all
select
  'series'::text,
  s.series_stage || ':' || s.season || ':' || s.level::text,
  null::uuid,
  null::text,
  s.season,
  s.level,
  s.series_stage,
  coalesce(min(s.start_date) filter (where s.end_date - s.start_date <= 4), min(s.start_date)),
  coalesce(max(s.end_date) filter (where s.end_date - s.start_date <= 4), max(s.end_date)),
  (coalesce(min(s.start_date) filter (where s.end_date - s.start_date <= 4), min(s.start_date))
    + (7 - extract(isodow from coalesce(min(s.start_date) filter (where s.end_date - s.start_date <= 4), min(s.start_date)))::int) % 7),
  0,
  0::smallint,
  count(distinct s.series_group_key),
  bool_or(exists (select 1 from public.usau_games g where g.event_id = s.id))
from (
  select
    e.id,
    e.season,
    e.series_stage,
    e.series_group_key,
    e.start_date,
    e.end_date,
    (case e.series_tier
      when 'club' then 'CLUB'
      when 'd-i' then 'COLLEGE_D1'
      when 'dev' then 'COLLEGE_D1'
      when 'd-iii' then 'COLLEGE_D3'
      when 'masters' then 'MASTERS'
      when 'grand-masters' then 'GRAND_MASTERS'
      when 'great-grand-masters' then 'GREAT_GRAND_MASTERS'
    end)::public.usau_competition_level as level
  from public.usau_events e
  where e.series_stage is not null and e.start_date is not null
) s
group by s.season, s.series_stage, s.level;

grant select on public.usau_event_feed to anon, authenticated;

create function public.search_usau_event_groups_fuzzy(q text, lim integer)
returns table(slug text, name text, season integer, start_date date, end_date date, division text, score real)
language sql
stable
set search_path = public, extensions
as $$
  with hits as (
    select
      coalesce(e.series_group_key, e.usau_slug) as slug,
      coalesce(e.series_group_name, e.name) as name,
      e.season,
      e.start_date,
      e.end_date,
      e.series_division,
      greatest(case when e.name ilike '%' || q || '%' then 1.0 else 0 end, word_similarity(q, e.name))::real as score
    from public.usau_events e
    where e.name ilike '%' || q || '%' or word_similarity(q, e.name) >= 0.4
  ), ranked as (
    select h.*, max(h.score) over (partition by h.slug) as top
    from hits h
  )
  select
    r.slug,
    min(r.name),
    min(r.season),
    min(r.start_date),
    max(r.end_date),
    case when count(*) filter (where r.score = r.top) = 1
      then max(r.series_division) filter (where r.score = r.top)
    end,
    max(r.score)
  from ranked r
  group by r.slug
  order by max(r.score) desc, min(r.start_date) desc nulls last
  limit least(coalesce(lim, 24), 50);
$$;

grant execute on function public.search_usau_event_groups_fuzzy(text, integer) to anon, authenticated;

notify pgrst, 'reload schema';

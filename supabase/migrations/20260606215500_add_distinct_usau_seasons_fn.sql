-- Distinct USAU seasons (newest first). Pre-aggregated so the season dropdown
-- isn't subject to supabase-js's 1000-row select cap (which was truncating the
-- list to only the newest 2-3 seasons despite data back to 2018).
create or replace function public.distinct_usau_seasons()
returns table(season int)
language sql
stable
as $$
  select distinct season
  from usau_events
  where season is not null
  order by season desc;
$$;

grant execute on function public.distinct_usau_seasons() to anon, authenticated;

create or replace function public.search_wfdf_events_fuzzy(q text, lim int default 24)
returns table (slug text, name text, year int, score real)
language sql stable
set search_path = public, extensions
as $$
  with labeled as (
    select e.slug, e.name, e.year,
      e.name || ' ' || coalesce(e.kind::text, '') || ' ' ||
      'World Worlds' || ' ' ||
      case
        when e.name ilike 'WMUC%' then 'Masters Ultimate Club Championships'
        when e.name ilike 'WBUC%' or e.name ilike 'AOBUC%' then 'Beach Ultimate Championships'
        when e.name ilike 'WJUC%' then 'Junior Ultimate Championships'
        when e.name ilike 'WU24%' then 'Under 24 U24 Championships'
        when e.name ilike 'WUCC%' or e.name ilike 'WUC %' or e.name ilike 'WUC2%' then 'Ultimate Club Championships'
        when e.name ilike 'WWUC%' then 'Women Ultimate Championships'
        when e.name ilike 'PAUC%' then 'Pan American Ultimate Championships'
        when e.name ilike 'AOUC%' or e.name ilike 'AOUGC%' then 'Asia Oceanic Ultimate Championships'
        when e.name ilike 'AAUC%' then 'All Africa Ultimate Championships'
        else 'Ultimate Championships'
      end as search_text
    from public.wfdf_events e
  )
  select l.slug, l.name, l.year,
    greatest(
      case when l.search_text ilike '%' || q || '%' then 1.0 else 0 end,
      word_similarity(q, l.search_text)
    )::real as score
  from labeled l
  where l.search_text ilike '%' || q || '%' or word_similarity(q, l.search_text) >= 0.35
  order by score desc, l.year desc
  limit lim;
$$;

notify pgrst, 'reload schema';

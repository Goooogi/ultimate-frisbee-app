
-- Clamp `lim` server-side (least(lim, 50)) so a direct anon RPC call can't pass
-- a huge limit and force an oversized sort. Backward-compatible — all app
-- callers use small limits well under 50.

create or replace function public.search_usau_teams_fuzzy(q text, lim int default 24)
returns table (id uuid, name text, state text, competition_level text, gender_division text, score real)
language sql stable set search_path = public, extensions
as $$
  select t.id, t.name, t.state, t.competition_level, t.gender_division,
         greatest(case when t.name ilike '%' || q || '%' then 1.0 else 0 end, word_similarity(q, t.name))::real as score
  from public.usau_teams t
  where t.name ilike '%' || q || '%' or word_similarity(q, t.name) >= 0.4
  order by score desc, t.name
  limit least(coalesce(lim, 24), 50);
$$;

create or replace function public.search_usau_players_fuzzy(q text, lim int default 24)
returns table (id uuid, display_name text, score real)
language sql stable set search_path = public, extensions
as $$
  select p.id, p.display_name,
         greatest(case when p.display_name ilike '%' || q || '%' then 1.0 else 0 end, word_similarity(q, p.display_name))::real as score
  from public.usau_players p
  where p.display_name ilike '%' || q || '%' or word_similarity(q, p.display_name) >= 0.5
  order by score desc, p.display_name
  limit least(coalesce(lim, 24), 50);
$$;

create or replace function public.search_usau_events_fuzzy(q text, lim int default 24)
returns table (usau_slug text, name text, season int, start_date date, end_date date, score real)
language sql stable set search_path = public, extensions
as $$
  select e.usau_slug, e.name, e.season, e.start_date, e.end_date,
         greatest(case when e.name ilike '%' || q || '%' then 1.0 else 0 end, word_similarity(q, e.name))::real as score
  from public.usau_events e
  where e.name ilike '%' || q || '%' or word_similarity(q, e.name) >= 0.4
  order by score desc, e.start_date desc nulls last
  limit least(coalesce(lim, 24), 50);
$$;

create or replace function public.search_wfdf_teams_fuzzy(q text, lim int default 24)
returns table (id uuid, name text, country_code text, event_name text, score real)
language sql stable set search_path = public, extensions
as $$
  select t.id, t.name, t.country_code, ev.name as event_name,
         greatest(case when t.name ilike '%' || q || '%' then 1.0 else 0 end, word_similarity(q, t.name))::real as score
  from public.wfdf_teams t
  join public.wfdf_events ev on ev.id = t.event_id
  where t.name ilike '%' || q || '%' or word_similarity(q, t.name) >= 0.4
  order by score desc, t.name
  limit least(coalesce(lim, 24), 50);
$$;

create or replace function public.search_wfdf_players_fuzzy(q text, lim int default 24)
returns table (full_name text, team_id uuid, team_name text, country_code text, event_name text, score real)
language sql stable set search_path = public, extensions
as $$
  select d.full_name, d.team_id, d.team_name, d.country_code, d.event_name, d.score
  from (
    select distinct on (lower(r.full_name))
           r.full_name, r.team_id, t.name as team_name, t.country_code, ev.name as event_name,
           greatest(case when r.full_name ilike '%' || q || '%' then 1.0 else 0 end, word_similarity(q, r.full_name))::real as score
    from public.wfdf_rosters r
    join public.wfdf_teams t on t.id = r.team_id
    join public.wfdf_events ev on ev.id = t.event_id
    where r.full_name ilike '%' || q || '%' or word_similarity(q, r.full_name) >= 0.5
    order by lower(r.full_name), score desc, ev.year desc
  ) d
  order by d.score desc, d.full_name
  limit least(coalesce(lim, 24), 50);
$$;

create or replace function public.search_wfdf_events_fuzzy(q text, lim int default 24)
returns table (slug text, name text, year int, score real)
language sql stable set search_path = public, extensions
as $$
  with labeled as (
    select e.slug, e.name, e.year,
      e.name || ' ' || coalesce(e.kind::text, '') || ' ' || 'World Worlds' || ' ' ||
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
    greatest(case when l.search_text ilike '%' || q || '%' then 1.0 else 0 end, word_similarity(q, l.search_text))::real as score
  from labeled l
  where l.search_text ilike '%' || q || '%' or word_similarity(q, l.search_text) >= 0.35
  order by score desc, l.year desc
  limit least(coalesce(lim, 24), 50);
$$;

notify pgrst, 'reload schema';

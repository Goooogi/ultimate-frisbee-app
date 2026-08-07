-- EUF/EUCS global-search RPCs. Mirrors the wfdf_* fuzzy search shape:
-- trigram-fuzzy, dedup by lowercased name, clamp lim<=50.
--
-- Players dedup by name because EUF player ids are PER-EVENT — the same human
-- has a different id at every event, so the NAME is the identity key (see the
-- euf-ingest header). We surface the most RECENT appearance as the row's
-- team/event context.

create or replace function public.search_euf_players_fuzzy(q text, lim integer default 24)
 returns table(full_name text, team_id uuid, team_name text, country_name text,
               event_name text, event_slug text, score real)
 language sql stable set search_path to 'public','extensions'
as $function$
  select d.full_name, d.team_id, d.team_name, d.country_name, d.event_name, d.event_slug, d.score
  from (
    select distinct on (lower(r.full_name))
           r.full_name, r.team_id, t.name as team_name, t.country_name,
           ev.name as event_name, ev.slug as event_slug,
           public.name_search_rank(q, r.full_name) as score
    from public.euf_rosters r
    join public.euf_teams t on t.id = r.team_id
    join public.euf_events ev on ev.id = t.event_id
    where r.full_name ilike '%' || q || '%' or word_similarity(q, r.full_name) >= 0.5
    order by lower(r.full_name), ev.year desc, score desc
  ) d
  order by d.score desc, length(d.full_name), d.full_name
  limit least(coalesce(lim, 24), 50);
$function$;

-- Teams also dedup by name: a club enters many events, and the same club can
-- field an Open AND a Women's team, so the key is (name, division).
create or replace function public.search_euf_teams_fuzzy(q text, lim integer default 24)
 returns table(id uuid, name text, division text, country_name text,
               event_name text, event_slug text, year integer, score real)
 language sql stable set search_path to 'public','extensions'
as $function$
  select d.id, d.name, d.division, d.country_name, d.event_name, d.event_slug, d.year, d.score
  from (
    select distinct on (lower(t.name), t.division)
           t.id, t.name, t.division::text as division, t.country_name,
           ev.name as event_name, ev.slug as event_slug, ev.year,
           public.name_search_rank(q, t.name) as score
    from public.euf_teams t
    join public.euf_events ev on ev.id = t.event_id
    where t.name ilike '%' || q || '%' or word_similarity(q, t.name) >= 0.5
    order by lower(t.name), t.division, ev.year desc, score desc
  ) d
  order by d.score desc, length(d.name), d.name
  limit least(coalesce(lim, 24), 50);
$function$;

create or replace function public.search_euf_events_fuzzy(q text, lim integer default 24)
 returns table(id uuid, name text, slug text, year integer, kind text,
               location text, score real)
 language sql stable set search_path to 'public','extensions'
as $function$
  select ev.id, ev.name, ev.slug, ev.year, ev.kind::text, ev.location,
         public.name_search_rank(q, ev.name) as score
  from public.euf_events ev
  where ev.name ilike '%' || q || '%' or word_similarity(q, ev.name) >= 0.5
  order by score desc, ev.year desc, ev.name
  limit least(coalesce(lim, 24), 50);
$function$;

grant execute on function public.search_euf_players_fuzzy(text, integer) to anon, authenticated;
grant execute on function public.search_euf_teams_fuzzy(text, integer)   to anon, authenticated;
grant execute on function public.search_euf_events_fuzzy(text, integer)  to anon, authenticated;

notify pgrst, 'reload schema';

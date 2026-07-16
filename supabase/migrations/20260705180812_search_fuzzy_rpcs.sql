
-- Fuzzy search RPCs. Each returns rows matching the query by substring (ilike)
-- OR trigram word-similarity (typo / reorder tolerance), ranked by a combined
-- score: exact-substring first, then by word_similarity. All read only
-- public-RLS tables; no SECURITY DEFINER needed (caller's anon role already has
-- select). set_config keeps the similarity floor local to the call.

-- ── USAU teams ────────────────────────────────────────────────────────────
create or replace function public.search_usau_teams_fuzzy(q text, lim int default 24)
returns table (id uuid, name text, state text, competition_level text, gender_division text, score real)
language sql stable
as $$
  select t.id, t.name, t.state, t.competition_level, t.gender_division,
         greatest(
           case when t.name ilike '%' || q || '%' then 1.0 else 0 end,
           word_similarity(q, t.name)
         )::real as score
  from public.usau_teams t
  where t.name ilike '%' || q || '%' or word_similarity(q, t.name) >= 0.4
  order by score desc, t.name
  limit lim;
$$;

-- ── USAU players ──────────────────────────────────────────────────────────
create or replace function public.search_usau_players_fuzzy(q text, lim int default 24)
returns table (id uuid, display_name text, score real)
language sql stable
as $$
  select p.id, p.display_name,
         greatest(
           case when p.display_name ilike '%' || q || '%' then 1.0 else 0 end,
           word_similarity(q, p.display_name)
         )::real as score
  from public.usau_players p
  where p.display_name ilike '%' || q || '%' or word_similarity(q, p.display_name) >= 0.5
  order by score desc, p.display_name
  limit lim;
$$;

-- ── USAU events / tournaments ─────────────────────────────────────────────
create or replace function public.search_usau_events_fuzzy(q text, lim int default 24)
returns table (usau_slug text, name text, season int, start_date date, end_date date, score real)
language sql stable
as $$
  select e.usau_slug, e.name, e.season, e.start_date, e.end_date,
         greatest(
           case when e.name ilike '%' || q || '%' then 1.0 else 0 end,
           word_similarity(q, e.name)
         )::real as score
  from public.usau_events e
  where e.name ilike '%' || q || '%' or word_similarity(q, e.name) >= 0.4
  order by score desc, e.start_date desc nulls last
  limit lim;
$$;

-- ── WFDF teams ────────────────────────────────────────────────────────────
create or replace function public.search_wfdf_teams_fuzzy(q text, lim int default 24)
returns table (id uuid, name text, country_code text, event_name text, score real)
language sql stable
as $$
  select t.id, t.name, t.country_code, ev.name as event_name,
         greatest(
           case when t.name ilike '%' || q || '%' then 1.0 else 0 end,
           word_similarity(q, t.name)
         )::real as score
  from public.wfdf_teams t
  join public.wfdf_events ev on ev.id = t.event_id
  where t.name ilike '%' || q || '%' or word_similarity(q, t.name) >= 0.4
  order by score desc, t.name
  limit lim;
$$;

-- ── WFDF players (roster names) ───────────────────────────────────────────
create or replace function public.search_wfdf_players_fuzzy(q text, lim int default 24)
returns table (full_name text, team_id uuid, team_name text, country_code text, event_name text, score real)
language sql stable
as $$
  select distinct on (lower(r.full_name))
         r.full_name, r.team_id, t.name as team_name, t.country_code, ev.name as event_name,
         greatest(
           case when r.full_name ilike '%' || q || '%' then 1.0 else 0 end,
           word_similarity(q, r.full_name)
         )::real as score
  from public.wfdf_rosters r
  join public.wfdf_teams t on t.id = r.team_id
  join public.wfdf_events ev on ev.id = t.event_id
  where r.full_name ilike '%' || q || '%' or word_similarity(q, r.full_name) >= 0.5
  order by lower(r.full_name), score desc
  limit lim;
$$;

-- ── WFDF events ───────────────────────────────────────────────────────────
create or replace function public.search_wfdf_events_fuzzy(q text, lim int default 24)
returns table (slug text, name text, year int, score real)
language sql stable
as $$
  select e.slug, e.name, e.year,
         greatest(
           case when e.name ilike '%' || q || '%' then 1.0 else 0 end,
           word_similarity(q, e.name)
         )::real as score
  from public.wfdf_events e
  where e.name ilike '%' || q || '%' or word_similarity(q, e.name) >= 0.4
  order by score desc, e.year desc
  limit lim;
$$;

-- PostgREST needs a schema reload to expose new RPCs over REST.
notify pgrst, 'reload schema';

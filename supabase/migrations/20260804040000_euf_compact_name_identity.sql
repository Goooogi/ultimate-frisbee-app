-- EUF identity keys: exact lowercased name → COMPACT normalized name.
--
-- The Ultiorganizer source free-types names, so the same human/club appears
-- under accent, hyphen, casing and SPACING variants across events:
--   "Daan DeMarree" / "Daan De Marrée"    "Conor O Brien" / "Conor O'Brien"
--   "BFD La Fotta" / "BFD LaFotta"        "Red Bulls" / "REDBULLS"
-- Measured 2026-08-04: 40+ player-name variant groups and 3 club splits, all
-- currently rendering as SEPARATE profiles.
--
-- Fix: every EUF name-identity key becomes compact_name_key() — unaccent,
-- lowercase, strip punctuation, then REMOVE spaces. Identical letter sequence
-- = same identity; display spelling = the most recent appearance. Same
-- accepted two-humans-one-name limit as before, no wider.

create or replace function public.compact_name_key(p text)
returns text
language sql
immutable
set search_path = public
as $$
  select replace(public.normalize_player_name(p), ' ', '');
$$;

-- ── Player profile (by name) ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_euf_player_profile(p_name text)
RETURNS TABLE (
  full_name text, event_id uuid, event_name text, event_slug text, year integer,
  team_id uuid, team_name text, division euf_division, country_name text,
  jersey_number text, games integer, goals integer, assists integer, total integer,
  final_placement integer
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT
    r.full_name, ev.id, ev.name, ev.slug, ev.year,
    t.id, t.name, t.division, t.country_name,
    r.jersey_number, r.games, r.goals, r.assists, r.total,
    t.final_placement
  FROM euf_rosters r
  JOIN euf_teams t  ON t.id = r.team_id
  JOIN euf_events ev ON ev.id = t.event_id
  WHERE public.compact_name_key(r.full_name) = public.compact_name_key(p_name)
  ORDER BY ev.year DESC, ev.name, t.name;
$$;

-- ── Player search ───────────────────────────────────────────────────────────
create or replace function public.search_euf_players_fuzzy(q text, lim integer default 24)
 returns table(full_name text, team_id uuid, team_name text, country_name text,
               event_name text, event_slug text, score real)
 language sql stable set search_path to 'public','extensions'
as $function$
  select d.full_name, d.team_id, d.team_name, d.country_name, d.event_name, d.event_slug, d.score
  from (
    select distinct on (public.compact_name_key(r.full_name))
           r.full_name, r.team_id, t.name as team_name, t.country_name,
           ev.name as event_name, ev.slug as event_slug,
           public.name_search_rank(q, r.full_name) as score
    from public.euf_rosters r
    join public.euf_teams t on t.id = r.team_id
    join public.euf_events ev on ev.id = t.event_id
    where r.full_name ilike '%' || q || '%' or word_similarity(q, r.full_name) >= 0.5
    order by public.compact_name_key(r.full_name), ev.year desc, score desc
  ) d
  order by d.score desc, length(d.full_name), d.full_name
  limit least(coalesce(lim, 24), 50);
$function$;

-- ── Players hub (top players) ───────────────────────────────────────────────
create or replace function public.list_euf_top_players(lim integer default 200)
 returns table(full_name text, team_name text, country_name text, division text,
               events integer, goals integer, assists integer, points integer)
 language sql stable set search_path = public
as $function$
  with agg as (
    select public.compact_name_key(r.full_name) as k,
           count(distinct r.event_id)::int as events,
           coalesce(sum(r.goals), 0)::int   as goals,
           coalesce(sum(r.assists), 0)::int as assists,
           coalesce(sum(r.total), 0)::int   as points
      from euf_rosters r
     group by public.compact_name_key(r.full_name)
  ),
  latest as (
    select distinct on (public.compact_name_key(r.full_name))
           public.compact_name_key(r.full_name) as k,
           r.full_name    as full_name,
           t.name         as team_name,
           t.country_name as country_name,
           t.division::text as division
      from euf_rosters r
      join euf_teams  t on t.id = r.team_id
      join euf_events e on e.id = t.event_id
     order by public.compact_name_key(r.full_name), e.year desc, e.start_date desc nulls last
  )
  select l.full_name::text,
         l.team_name::text,
         l.country_name::text,
         l.division,
         a.events,
         a.goals,
         a.assists,
         a.points
    from agg a
    join latest l on l.k = a.k
   order by a.points desc, a.goals desc, l.full_name
   limit greatest(1, least(coalesce(lim, 200), 500));
$function$;

-- ── Club index ──────────────────────────────────────────────────────────────
create or replace function public.list_euf_clubs()
returns table (
  club_key       text,
  club_name      text,
  division       text,
  country_name   text,
  appearances    int,
  events         int,
  first_year     int,
  last_year      int,
  best_placement int
)
language sql
stable
security invoker
set search_path = public
as $$
  select public.compact_name_key(t.name)::text as club_key,
         -- Display spelling: the most recent one, so a club that rebrands its
         -- casing shows its current form rather than an arbitrary pick.
         (array_agg(t.name::text order by e.year desc, e.start_date desc nulls last))[1] as club_name,
         t.division::text,
         max(t.country_name)::text as country_name,
         count(*)::int              as appearances,
         count(distinct e.id)::int  as events,
         min(e.year)::int           as first_year,
         max(e.year)::int           as last_year,
         min(t.final_placement)::int as best_placement
    from euf_teams t
    join euf_events e on e.id = t.event_id
   group by public.compact_name_key(t.name), t.division
   order by count(distinct e.id) desc, 2, 3;
$$;

-- ── Club profile ────────────────────────────────────────────────────────────
create or replace function public.get_euf_club_profile(p_name text, p_division text)
returns table (
  club_key         text,
  club_name        text,
  division         text,
  country_name     text,
  event_id         uuid,
  event_name       text,
  event_slug       text,
  year             int,
  kind             text,
  team_id          uuid,
  final_placement  int,
  games            int,
  wins             int,
  losses           int,
  scores_for       int,
  scores_against   int
)
language sql
stable
security invoker
set search_path = public
as $$
  with target as (
    select public.compact_name_key(p_name) as k, lower(trim(p_division)) as d
  ),
  rec as (
    select t.id as team_id,
           count(*) filter (where g.home_score is not null and g.away_score is not null)::int as games,
           count(*) filter (
             where (g.home_team_id = t.id and g.home_score > g.away_score)
                or (g.away_team_id = t.id and g.away_score > g.home_score)
           )::int as wins,
           count(*) filter (
             where (g.home_team_id = t.id and g.home_score < g.away_score)
                or (g.away_team_id = t.id and g.away_score < g.home_score)
           )::int as losses,
           coalesce(sum(case when g.home_team_id = t.id then g.home_score else g.away_score end), 0)::int as scores_for,
           coalesce(sum(case when g.home_team_id = t.id then g.away_score else g.home_score end), 0)::int as scores_against
      from euf_teams t
      join target on public.compact_name_key(t.name) = target.k
                 and lower(trim(t.division::text)) = target.d
      left join euf_games g
        on (g.home_team_id = t.id or g.away_team_id = t.id)
       and g.home_score is not null and g.away_score is not null
     group by t.id
  )
  select public.compact_name_key(t.name)::text as club_key,
         t.name::text              as club_name,
         t.division::text,
         t.country_name::text,
         e.id                      as event_id,
         e.name::text              as event_name,
         e.slug::text              as event_slug,
         e.year::int,
         e.kind::text,
         t.id                      as team_id,
         t.final_placement::int,
         coalesce(r.games, 0),
         coalesce(r.wins, 0),
         coalesce(r.losses, 0),
         coalesce(r.scores_for, 0),
         coalesce(r.scores_against, 0)
    from euf_teams t
    join target on public.compact_name_key(t.name) = target.k
               and lower(trim(t.division::text)) = target.d
    join euf_events e on e.id = t.event_id
    left join rec r on r.team_id = t.id
   order by e.year desc, e.start_date desc nulls last;
$$;

comment on function public.get_euf_club_profile(text, text) is
  'One EUCS club-division = every euf_teams row sharing (compact_name_key(name), division). Compact-name match; squad variants ("Mooncatchers Master") stay separate.';

-- ── Team search ─────────────────────────────────────────────────────────────
create or replace function public.search_euf_teams_fuzzy(q text, lim integer default 24)
 returns table(id uuid, name text, division text, country_name text,
               event_name text, event_slug text, year integer, score real)
 language sql stable set search_path to 'public','extensions'
as $function$
  select d.id, d.name, d.division, d.country_name, d.event_name, d.event_slug, d.year, d.score
  from (
    select distinct on (public.compact_name_key(t.name), t.division)
           t.id, t.name, t.division::text as division, t.country_name,
           ev.name as event_name, ev.slug as event_slug, ev.year,
           public.name_search_rank(q, t.name) as score
    from public.euf_teams t
    join public.euf_events ev on ev.id = t.event_id
    where t.name ilike '%' || q || '%' or word_similarity(q, t.name) >= 0.5
    order by public.compact_name_key(t.name), t.division, ev.year desc, score desc
  ) d
  order by d.score desc, length(d.name), d.name
  limit least(coalesce(lim, 24), 50);
$function$;

-- ── Club cross-league ───────────────────────────────────────────────────────
-- Name joins to WFDF/USAU go compact too: USAU registers "BFD LaFotta" joined
-- while EUCS also has "BFD La Fotta". Division/country guards unchanged.
create or replace function public.get_euf_club_cross_league(p_name text, p_division text)
returns table (
  league        text,
  ref_id        text,
  team_name     text,
  country_name  text,
  event_name    text,
  event_slug    text,
  year          int,
  division      text,
  placement     int
)
language sql
stable
security invoker
set search_path = public
as $$
  with target as (
    select public.compact_name_key(p_name) as k,
           lower(trim(p_division)) as d,
           (select max(country_name) from euf_teams
             where public.compact_name_key(name) = public.compact_name_key(p_name)
               and lower(trim(division::text)) = lower(trim(p_division))) as country
  )
  select 'wfdf'::text            as league,
         w.id::text              as ref_id,
         w.name::text            as team_name,
         w.country_name::text,
         e.name::text            as event_name,
         e.slug::text            as event_slug,
         e.year::int,
         d.name::text            as division,
         w.final_standing::int   as placement
    from wfdf_teams w
    join wfdf_divisions d on d.id = w.division_id
    join target on public.compact_name_key(w.name) = target.k
                and lower(trim(coalesce(w.country_name,''))) = lower(trim(coalesce(target.country,'')))
                and lower(regexp_replace(d.name, '^(Grand )?Master ', '')) = target.d
    join wfdf_events e on e.id = w.event_id

  union all

  select 'usau'::text,
         u.id::text,
         u.name::text,
         (select country from target),
         ev.name::text,
         ev.usau_slug::text,
         ev.season::int,
         u.gender_division::text,
         null::int
    from usau_teams u
    join target on public.compact_name_key(u.name) = target.k
                and case lower(trim(u.gender_division::text))
                      when 'men'   then 'open'
                      when 'women' then 'women''s'
                      when 'mixed' then 'mixed'
                      else lower(trim(u.gender_division::text))
                    end = target.d
    join lateral (
      select e2.*
        from usau_games g2
        join usau_events e2 on e2.id = g2.event_id
       where g2.team_a_id = u.id or g2.team_b_id = u.id
    ) ev on true
   where not exists (
     -- reject the row entirely if it EVER played a non-U.S.-Open event:
     -- that's a domestic American club that merely shares the name.
     select 1
       from usau_games g3
       join usau_events e3 on e3.id = g3.event_id
      where (g3.team_a_id = u.id or g3.team_b_id = u.id)
        and e3.name !~* '(u\.s\.|us) open'
        and e3.name !~* 'ICC'
   )
   group by u.id, u.name, ev.name, ev.usau_slug, ev.season, u.gender_division
   order by year desc, league;
$$;

grant execute on function public.compact_name_key(text) to anon, authenticated;

-- Cached unified profiles were built with the old names_match — drop so the
-- next read re-attaches the newly-matching EUF stints.
DELETE FROM player_profiles;

notify pgrst, 'reload schema';

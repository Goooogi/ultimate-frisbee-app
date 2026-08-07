-- EUF club identity layer.
--
-- A EUF "team" row is per-EVENT (Mooncatchers at EUCF 2025 and at Elite Invite
-- 2025 are two rows), so a club is the set of rows sharing a name AND a
-- division. Division is part of the key because clubs like Grut and SMOG field
-- Open, Women's AND Mixed teams — different rosters that merely share a club
-- name, so merging them would mix unrelated records and finishes.
--
-- 578 team rows → 196 club-divisions (181 distinct names; 13 clubs split).
--
-- Matching is EXACT on the normalized name: "Mooncatchers Master" stays its own
-- club and does NOT fold into Mooncatchers. Loose/prefix matching would merge
-- genuinely distinct clubs.
--
-- Verified: no (name, division) pair spans more than one country, so country is
-- a safe attribute of the key rather than part of it.

drop function if exists public.list_euf_clubs();
drop function if exists public.get_euf_club_profile(text);

-- Browsable club index: one row per club-division.
create function public.list_euf_clubs()
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
  select lower(trim(t.name))::text as club_key,
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
   group by lower(trim(t.name)), t.division
   order by count(distinct e.id) desc, 2, 3;
$$;

-- One club-division's full event history.
create function public.get_euf_club_profile(p_name text, p_division text)
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
    select lower(trim(p_name)) as k, lower(trim(p_division)) as d
  ),
  -- Records aren't published upstream; derive W/L from games like
  -- get_euf_standings does rather than trusting euf_teams' columns.
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
      join target on lower(trim(t.name)) = target.k
                 and lower(trim(t.division::text)) = target.d
      left join euf_games g
        on (g.home_team_id = t.id or g.away_team_id = t.id)
       and g.home_score is not null and g.away_score is not null
     group by t.id
  )
  select lower(trim(t.name))::text as club_key,
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
    join target on lower(trim(t.name)) = target.k
               and lower(trim(t.division::text)) = target.d
    join euf_events e on e.id = t.event_id
    left join rec r on r.team_id = t.id
   order by e.year desc, e.start_date desc nulls last;
$$;

comment on function public.get_euf_club_profile(text, text) is
  'One EUCS club-division = every euf_teams row sharing (lower(trim(name)), division). Exact-name match; squad variants stay separate.';

notify pgrst, 'reload schema';

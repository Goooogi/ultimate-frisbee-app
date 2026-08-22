-- list_usau_players: count DISTINCT (team, season) stints, not raw roster rows.
--
-- usau_rosters became per-event in 20260821140000 (event_id joined the key), so
-- one team-season can hold several rows for the same player — one per event
-- attended. The old count(*) would inflate every player's "stints" as more
-- events get scraped (Chain Lightning 2026 alone went from 1 row to 3), and it
-- already over-counted wherever duplicate usau_teams rows split a season.
--
-- A stint = one team for one season. That's what the profile page's
-- teamHistory shows, so the list and the profile now agree.
create or replace function list_usau_players(
  p_limit int default 60,
  p_season int default null,
  p_division text default null,
  p_level text default null,
  p_search text default null,
  p_champions jsonb default null
) returns jsonb
language sql
stable
set search_path to 'public'
as $$
with champs as (
  select (c->>'season')::int as season, c->>'division' as division, c->>'team_id' as team_id
  from jsonb_array_elements(coalesce(p_champions, '[]'::jsonb)) as c
),
stints as materialized (
  select r.player_id, r.season, r.team_id,
         p.display_name, lower(p.display_name) as name_key,
         t.name as team_name, t.gender_division::text as gender_division
  from usau_rosters r
  join usau_teams t on t.id = r.team_id
  join usau_players p on p.id = r.player_id
  where p.display_name is not null
    and (p_season is null or r.season = p_season)
    and (p_division is null or t.gender_division = p_division::usau_gender_division)
    and (p_level is null or t.competition_level = p_level::usau_competition_level)
    and (p_search is null or p.display_name ilike
         '%' || replace(replace(replace(p_search, '\', '\\'), '%', '\%'), '_', '\_') || '%')
),
grouped as (
  select name_key,
         count(distinct (team_id, season)) as appearances,
         max(season) as latest_season
  from stints group by name_key
),
anchor as (
  select distinct on (name_key) name_key, player_id as anchor_id, display_name
  from (
    select name_key, player_id, display_name, count(distinct (team_id, season)) as n
    from stints group by name_key, player_id, display_name
  ) per_player
  order by name_key, n desc, player_id
),
latest as (
  select distinct on (name_key) name_key, team_name as latest_team, team_id as latest_team_id
  from stints
  order by name_key, season desc
),
champ_years as (
  select s.name_key, array_agg(distinct s.season order by s.season desc) as years
  from stints s
  join champs c on c.season = s.season and s.team_id::text = c.team_id
    and c.division = s.gender_division
  group by s.name_key
)
select coalesce(jsonb_agg(to_jsonb(row)), '[]'::jsonb)
from (
  select a.anchor_id as "id",
         a.display_name as "displayName",
         l.latest_team as "latestTeam",
         l.latest_team_id as "latestTeamId",
         g.latest_season as "latestSeason",
         g.appearances as "appearances",
         coalesce(cy.years, '{}'::int[]) as "championYears"
  from grouped g
  join anchor a using (name_key)
  join latest l using (name_key)
  left join champ_years cy using (name_key)
  order by g.latest_season desc nulls last, g.appearances desc
  limit least(greatest(coalesce(p_limit, 60), 1), 500)
) as row;
$$;

notify pgrst, 'reload schema';

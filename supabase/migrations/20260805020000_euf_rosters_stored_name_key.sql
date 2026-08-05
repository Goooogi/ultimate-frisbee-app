-- Materialize euf_rosters' identity key as a stored generated column.
--
-- The expression index from 20260805010000 fixed the POINT lookups (profile by
-- name: 4259ms -> 18ms) because an index scan evaluates compact_name_key()
-- once, for the probe value. It does NOT help the aggregate on the players hub:
-- list_euf_top_players groups the whole table by compact_name_key(full_name),
-- so Postgres re-runs unaccent + two regexp_replace passes for all 12,267 rows
-- (twice — once for `agg`, once for `latest`). Measured 7,119 ms, which also
-- made `next build` blow its 60s static-generation worker budget on
-- /euf/players.
--
-- A STORED generated column computes the key once at write time. Reads become
-- a plain column reference, so both the grouping and the DISTINCT ON get a
-- cheap btree instead of a per-row function call.
--
-- compact_name_key / normalize_player_name / unaccent_safe are all IMMUTABLE,
-- which is what makes them legal in a generated-column expression.

alter table public.euf_rosters
  add column if not exists name_key text
  generated always as (public.compact_name_key(full_name)) stored;

create index if not exists idx_euf_rosters_name_key
  on public.euf_rosters (name_key);

-- Covers the `latest` DISTINCT ON (name_key ... order by year desc) probe.
create index if not exists idx_euf_rosters_name_key_team
  on public.euf_rosters (name_key, team_id);

analyze public.euf_rosters;

-- Rewrite the hub aggregate against the stored column. Logic is byte-for-byte
-- the same as 20260804040000 — only the key expression changes, so the grouping
-- semantics (and therefore the merged identities) are identical.
create or replace function public.list_euf_top_players(lim integer default 200)
 returns table(full_name text, team_name text, country_name text, division text,
               events integer, goals integer, assists integer, points integer)
 language sql stable set search_path = public
as $function$
  with agg as (
    select r.name_key as k,
           count(distinct r.event_id)::int as events,
           coalesce(sum(r.goals), 0)::int   as goals,
           coalesce(sum(r.assists), 0)::int as assists,
           coalesce(sum(r.total), 0)::int   as points
      from euf_rosters r
     group by r.name_key
  ),
  latest as (
    select distinct on (r.name_key)
           r.name_key      as k,
           r.full_name     as full_name,
           t.name          as team_name,
           t.country_name  as country_name,
           t.division::text as division
      from euf_rosters r
      join euf_teams  t on t.id = r.team_id
      join euf_events e on e.id = t.event_id
     order by r.name_key, e.year desc, e.start_date desc nulls last
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

-- Player profile by name: probe the stored column instead of the expression so
-- this uses the plain btree above.
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
  WHERE r.name_key = public.compact_name_key(p_name)
  ORDER BY ev.year DESC, ev.name, t.name;
$$;

notify pgrst, 'reload schema';

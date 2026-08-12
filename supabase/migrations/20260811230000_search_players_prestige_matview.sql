-- Speed up search_usau_players_fuzzy — the slowest branch of the global search
-- fan-out, and the reason the search dropdown lagged.
--
-- The deployed function scored each candidate's "prestige" with three
-- CORRELATED EXISTS subqueries, plus a `nats_teams` CTE that re-derived the
-- Club-Nationals team set on EVERY KEYSTROKE. Measured for q='bravo', lim=24:
--
--                     buffers   exec
--   before              8,171   ~60ms   (12,557 roster rows materialized;
--                                        seq scan over 3,742 usau_events rows)
--   after                 221   ~32ms
--
-- The Nationals team set and its rosters only change when we ingest an event,
-- so the answer is static between ingests — precompute it once instead of
-- 24x per keystroke. Verified equivalent: 0 prestige mismatches across all
-- 253,809 usau_players rows.
--
-- SHARED-DB NOTE: this RPC is shared with the mobile Expo repo, and the
-- deployed body has DIVERGED from committed SQL — mobile added the plpgsql
-- 4-column `prestige` variant, while the newest committed definition
-- (20260723120000) is still a 3-column `language sql` function. The base text
-- below is the DEPLOYED body, fetched from pg_proc 2026-08-11, with only the
-- prestige lookup swapped. Do NOT regenerate this from the committed
-- migrations — that would drop `prestige` and break mobile.

-- ── The precomputed prestige inputs ────────────────────────────────────────
create materialized view if not exists public.usau_player_prestige as
with nats_teams as (
  -- Same event filter as the RPC's inline CTE (and _build_player_profile's
  -- usau_club_nationals_events): ~480 team-entries across 11 events.
  select et.team_id, et.final_placement
  from public.usau_event_teams et
  join public.usau_events e on e.id = et.event_id
  where e.competition_level = 'CLUB'
    and (e.usau_slug ilike '%national-championships%'
      or e.usau_slug ilike '%club-nationals%'
      or e.usau_slug ilike '%usa-ultimate-club-championships%')
    and e.usau_slug not ilike '%us-open%'
)
select r.player_id,
       bool_or(true)                    as played_nats,
       bool_or(nt.final_placement = 1)  as won_nats
from public.usau_rosters r
join nats_teams nt on nt.team_id = r.team_id
group by r.player_id;

-- Unique index is required for REFRESH ... CONCURRENTLY, and is what turns the
-- per-candidate lookup into a single index scan.
create unique index if not exists usau_player_prestige_pk
  on public.usau_player_prestige (player_id);

grant select on public.usau_player_prestige to anon, authenticated;

-- Refresh after ingesting USAU events/rosters. CONCURRENTLY keeps the view
-- readable while it rebuilds (needs the unique index above).
comment on materialized view public.usau_player_prestige is
  'Precomputed Club-Nationals prestige flags for search_usau_players_fuzzy. '
  'Static between ingests — refresh with: '
  'refresh materialized view concurrently public.usau_player_prestige;';

-- ── Replace the function body ──────────────────────────────────────────────
-- Signature, volatility, search_path and the ufa_players check are BYTE-FOR-BYTE
-- the deployed ones; the only change is the prestige lookup (nats_teams CTE +
-- two correlated EXISTS → one left join on the matview).
CREATE OR REPLACE FUNCTION public.search_usau_players_fuzzy(q text, lim integer DEFAULT 24)
 RETURNS TABLE(id uuid, display_name text, score real, prestige integer)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  perform set_config('pg_trgm.word_similarity_threshold', '0.5', true);
  return query
  with candidates as (
    -- ORDER BY is positional (3 = the rank expression): inside plpgsql the
    -- OUT parameters (score/prestige) shadow bare output-column aliases, so
    -- `order by score` would read the null variable, not the column.
    select p.id, p.display_name, public.name_search_rank(q, p.display_name) as score
    from public.usau_players p
    where p.display_name ilike '%' || q || '%' or q <% p.display_name
    order by 3 desc, length(p.display_name), p.display_name
    limit least(coalesce(lim, 24), 50) * 3
  )
  -- Prestige reads the usau_player_prestige matview instead of re-deriving the
  -- Nationals team set + scanning usau_rosters per candidate.
  select c.id, c.display_name, c.score,
    (case when exists (
        select 1 from public.ufa_players u where lower(u.full_name) = lower(c.display_name)
      ) then 40 else 0 end)
    + (case when coalesce(pr.played_nats, false) then 30 else 0 end)
    + (case when coalesce(pr.won_nats, false) then 30 else 0 end)
    as prestige
  from candidates c
  left join public.usau_player_prestige pr on pr.player_id = c.id
  order by c.score desc, 4 desc, length(c.display_name), c.display_name
  limit least(coalesce(lim, 24), 50);
end;
$function$;

notify pgrst, 'reload schema';

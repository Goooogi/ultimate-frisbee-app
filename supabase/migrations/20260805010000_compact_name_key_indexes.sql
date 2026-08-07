-- Expression indexes matching the compact_name_key() identity predicates.
--
-- 20260804040000_euf_compact_name_identity.sql switched every name-identity
-- predicate from lower(name) to compact_name_key(name), but the indexes were
-- left on the OLD expression:
--   idx_euf_rosters_name  btree(lower(full_name))
--   idx_euf_teams_name    btree(lower(name))
--   idx_wfdf_teams_name   btree(lower(name))
--   usau_teams            no name btree at all (only a trigram gin)
--
-- An index on lower(x) cannot serve a predicate on compact_name_key(x), so
-- every profile lookup degraded to a Seq Scan that evaluates unaccent + two
-- regexp_replace passes PER ROW (~90us/row). Measured on prod 2026-08-05:
--
--   euf_rosters name filter          Seq Scan, 12260 rows removed   1097 ms
--   get_euf_player_profile                                          4259 ms
--   usau_teams filter (cross-league) Seq Scan, 11566 rows removed   4599 ms
--   get_euf_club_cross_league                                       6708 ms
--
-- With the euf_rosters index below the same filter plans as an Index Scan at
-- 22 ms — a ~50x drop. compact_name_key() is already IMMUTABLE (it wraps
-- normalize_player_name, likewise IMMUTABLE STRICT), so it is index-eligible
-- as written; no function changes are needed.
--
-- The euf_teams index is (key, division) because club identity is the PAIR —
-- get_euf_club_profile and get_euf_club_cross_league both filter on compact
-- name AND division, and list_euf_clubs groups by exactly that pair.

create index if not exists idx_euf_rosters_compact_name
  on public.euf_rosters (public.compact_name_key(full_name));

create index if not exists idx_euf_teams_compact_name_division
  on public.euf_teams (public.compact_name_key(name), division);

create index if not exists idx_wfdf_teams_compact_name
  on public.wfdf_teams (public.compact_name_key(name));

create index if not exists idx_usau_teams_compact_name
  on public.usau_teams (public.compact_name_key(name));

-- The planner needs stats on the new expressions to prefer them over a scan.
analyze public.euf_rosters;
analyze public.euf_teams;
analyze public.wfdf_teams;
analyze public.usau_teams;

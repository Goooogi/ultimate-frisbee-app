
-- Fuzzy search support: pg_trgm trigram similarity + GIN indexes on the name
-- columns the unified search queries. Enables typo-tolerant / reordering-tolerant
-- matching via similarity() and the % operator.

create extension if not exists pg_trgm with schema extensions;

-- USAU (largest corpus)
create index if not exists usau_teams_name_trgm on public.usau_teams using gin (name extensions.gin_trgm_ops);
create index if not exists usau_players_display_name_trgm on public.usau_players using gin (display_name extensions.gin_trgm_ops);
create index if not exists usau_events_name_trgm on public.usau_events using gin (name extensions.gin_trgm_ops);

-- WFDF
create index if not exists wfdf_teams_name_trgm on public.wfdf_teams using gin (name extensions.gin_trgm_ops);
create index if not exists wfdf_rosters_full_name_trgm on public.wfdf_rosters using gin (full_name extensions.gin_trgm_ops);
create index if not exists wfdf_events_name_trgm on public.wfdf_events using gin (name extensions.gin_trgm_ops);

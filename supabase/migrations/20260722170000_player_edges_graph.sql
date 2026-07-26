-- Applied via MCP 2026-07-22.
-- Player "Connections" / "The Thread" graph. A precomputed teammate-edge table
-- so the on-profile Connections section and the full graph page are fast indexed
-- lookups instead of a live ~160k-candidate traversal per view.
--
-- IDENTITY: normalized display name (mirrors src/lib/name-match.ts normalizeName
-- — NFD strip accents, lowercase, non-alphanumeric→space, collapse ws). Same
-- name-based identity the unified profile uses; two different people with the
-- same name merge, a typo splits one — accepted limitation, surfaced to users.
-- (namesMatch nickname/token-subset matching is NOT applied — exact normalized
-- equality only, which covers the large majority.)

create or replace function public.unaccent_safe(p text)
returns text
language sql
immutable
strict
set search_path to 'public'
as $function$
  select translate(
    p,
    'àáâãäåçèéêëìíîïñòóôõöùúûüýÿÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝ',
    'aaaaaaceeeeiiiinooooouuuuyyAAAAAACEEEEIIIINOOOOOUUUUY')
$function$;

create or replace function public.normalize_player_name(p text)
returns text
language sql
immutable
strict
set search_path to 'public'
as $function$
  select nullif(
    trim(regexp_replace(
      regexp_replace(lower(public.unaccent_safe(p)), '[^a-z0-9\s]', ' ', 'g'),
      '\s+', ' ', 'g')),
    '')
$function$;

-- One row per unordered pair of names who ever played together (name_a < name_b).
create table public.player_edges (
  name_a text not null,
  name_b text not null,
  weight int not null default 0,       -- # of shared team-seasons / games
  leagues text[] not null default '{}',
  last_season int,
  primary key (name_a, name_b)
);
create index player_edges_a_idx on public.player_edges (name_a);
create index player_edges_b_idx on public.player_edges (name_b);
create index player_edges_weight_idx on public.player_edges (weight desc);
alter table public.player_edges enable row level security;
create policy "player_edges_read" on public.player_edges for select using (true);

-- Canonical name → display + notability, for labeling + ranking.
create table public.player_nodes (
  name text primary key,               -- normalized
  display_name text not null,
  leagues text[] not null default '{}',
  teammate_count int not null default 0,
  ufa_career_score numeric,
  is_champion boolean not null default false,
  championships int not null default 0,
  last_season int
);
create index player_nodes_display_idx on public.player_nodes (display_name);
alter table public.player_nodes enable row level security;
create policy "player_nodes_read" on public.player_nodes for select using (true);

notify pgrst, 'reload schema';

-- Starred GAMES — the pro-league twin of starred tournaments (Hunter,
-- 2026-09-07). game_id is the league's own id and IS the route param (UFA
-- "2026-05-16-COL-NY"; PUL/WUL slash ids). Applied to prod 2026-09-07 via
-- Supabase MCP (remote version 20260907150822). Keep the league CHECK in sync
-- with FavoriteGame['league'] in both app repos.
create table public.user_favorite_games (
  user_id uuid not null references auth.users(id) on delete cascade,
  league text not null check (league in ('ufa', 'pul', 'wul')),
  game_id text not null,
  name text not null,
  game_date date,
  created_at timestamptz not null default now(),
  primary key (user_id, league, game_id)
);
create index user_favorite_games_league_game_idx on public.user_favorite_games (league, game_id);
alter table public.user_favorite_games enable row level security;
create policy user_favorite_games_select_own on public.user_favorite_games for select using ((select auth.uid()) = user_id);
create policy user_favorite_games_insert_own on public.user_favorite_games for insert with check ((select auth.uid()) = user_id);
create policy user_favorite_games_update_own on public.user_favorite_games for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy user_favorite_games_delete_own on public.user_favorite_games for delete using ((select auth.uid()) = user_id);

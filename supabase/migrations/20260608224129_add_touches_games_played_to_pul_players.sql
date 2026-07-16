alter table public.pul_players
  add column if not exists games_played int not null default 0,
  add column if not exists touches int not null default 0;
notify pgrst, 'reload schema';
-- Forfeits. USAU prints a forfeit as letters ("F - W" in a pool row, "W"/"F"
-- in a bracket cell) under a status cell that still reads "Final", so the
-- scraper stored these as status='final' with null scores: no winner shown,
-- and pool standings wrong (2026 SC Men 9th-12th: Riverside shown 0-2 where
-- USAU has 1-2 after Texas Tea's forfeit).
--
-- winner_team_id carries the result when there are no scores. Set only when
-- USAU reports letters; null for every scored game (the scores decide it). A
-- double forfeit ("F - F") stays null too, so it reads like an unreported
-- result.
-- status stays 'final' on purpose: ~30 web/mobile/SQL/push readers treat
-- status='final' as "game over", and a separate 'forfeit' status would have
-- dropped these games from all of them.
--
-- A team id, not an 'a'/'b' side: sync-event-details' natural-key reconcile
-- and ultirzr can store a row's teams in either orientation, and a side letter
-- would silently flip. No CHECK (winner in team_a/team_b): a violation inside
-- a batch write would freeze an event's sync (the KFC 23505 failure class).
-- Plain FK (NO ACTION), like team_a_id/team_b_id: a team-merge migration that
-- forgets to re-point winner_team_id fails loudly instead of silently nulling
-- forfeit results.
set local lock_timeout = '5s';

alter table public.usau_games
  add column if not exists winner_team_id uuid null references public.usau_teams(id);

comment on column public.usau_games.winner_team_id is
  'Winner when USAU reports a forfeit as letters (scores null). Null for scored games. Re-point on team merges.';

-- The FK check on every usau_teams delete scans by this column; the partial
-- index keeps that cheap (only forfeits are non-null).
create index if not exists usau_games_winner_team_id_idx
  on public.usau_games (winner_team_id)
  where winner_team_id is not null;

notify pgrst, 'reload schema';

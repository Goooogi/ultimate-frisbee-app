-- USAU bracket structure, captured from the source instead of re-guessed on
-- the client (2026-09-13, Rocky Mountain Sectionals).
--
-- play.usaultimate.org's bracket HTML encodes the whole graph:
--   <h3 class="slide_trigger">6th Place</h3>                       → bracket_name (unchanged)
--     <div class="bracket_col"><h4 class="col_title">6th Place Semis</h4>   → bracket_stage / bracket_stage_index
--       <div id="game415243" class="bracket_game top_game has_next"
--            data-index="1" data-relation="game415244">            → bracket_slot / next_usau_game_id / next_slot_side
-- Columns appear in FINAL-FIRST document order, so index 0 is the deciding
-- game of its section. ultirzr's JSON mirrors this (Bracket → Stage[] final
-- first → Games[].GameName "G<n>") minus the relation.
--
-- All nullable: rows written before this migration, and pool rows, carry no
-- structure; readers fall back to the round-based heuristics when absent.

alter table public.usau_games
  add column if not exists bracket_stage text,
  add column if not exists bracket_stage_index smallint,
  add column if not exists bracket_slot smallint,
  add column if not exists next_usau_game_id text,
  add column if not exists next_slot_side text;

alter table public.usau_games
  drop constraint if exists usau_games_next_slot_side_check;
alter table public.usau_games
  add constraint usau_games_next_slot_side_check
  check (next_slot_side is null or next_slot_side in ('top', 'btm'));

comment on column public.usau_games.bracket_stage is
  'USAU bracket column label verbatim (h4.col_title / ultirzr StageName): "6th Place Quarters", "1st Semis", "Semifinals".';
comment on column public.usau_games.bracket_stage_index is
  '0 = the deciding column of its bracket_name section, 1 = the column feeding it, … (source order is final-first).';
comment on column public.usau_games.bracket_slot is
  'USAU sheet slot within the column (G<n>, data-index). Byes leave gaps — a quarters column can hold G2 and G3 only.';
comment on column public.usau_games.next_usau_game_id is
  'usau_game_id of the game this game''s winner feeds (HTML data-relation, "game" prefix stripped). Null from ultirzr.';
comment on column public.usau_games.next_slot_side is
  'Which side of next_usau_game_id the winner fills: top (home) or btm (away). From the top_game / btm_game class.';

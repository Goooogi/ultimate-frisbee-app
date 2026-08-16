-- ─────────────────────────────────────────────────────────────────────────────
-- Correction 1 (from Hunter, post-report): the legacy unique constraint
-- (owner_id, league_id, season_year) NULLS NOT DISTINCT is now a live bug, not
-- a backward-compat guard. league_id stays NULL on every row going forward
-- (contest_id is the new grouping key), so that constraint currently caps
-- every user at ONE fantasy team per season across ALL contests combined —
-- e.g. a user with a UFA 2026 team could never also field a WFDF WUCC 2026
-- team, since both rows would be (owner_id, NULL, 2026).
--
-- Replace with UNIQUE NULLS NOT DISTINCT (owner_id, contest_id, season_year).
-- This still caps legacy no-contest inserts (contest_id NULL, from an old
-- deployed client mid-transition) at one per season — same NULLS NOT DISTINCT
-- protection the original comment called out — while correctly allowing one
-- team per contest per season otherwise, since contest_id differs per row.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.fantasy_teams
  drop constraint fantasy_teams_owner_id_league_id_season_year_key;

alter table public.fantasy_teams
  add constraint fantasy_teams_owner_contest_season_key
  unique nulls not distinct (owner_id, contest_id, season_year);

comment on constraint fantasy_teams_owner_contest_season_key on public.fantasy_teams is
  'NULLS NOT DISTINCT is required: caps legacy contest_id-NULL inserts at one team per owner per season (old client mid-transition), while correctly allowing one team per contest per season for contest-scoped rows. Replaces the old (owner_id, league_id, season_year) constraint, which wrongly capped a user at one team per season across ALL contests since league_id stays NULL on every row going forward.';

notify pgrst, 'reload schema';

-- Public League (UFA beta) teardown, 2026-09-12. The beta contest, its 10 teams
-- and the Test UFA League were deleted by hand (ids are env-specific); this
-- migration carries the schema side.
--
-- Teams can now only be created inside a private league the caller belongs to:
-- no contest-less rows, no league_id-NULL (global) contests. Pre-Aug-27 mobile
-- store builds still ship the old Public League roster builder, which inserted
-- contest_id NULL teams; they now get an RLS error instead of an orphan row.

alter policy "fantasy_teams insert own" on public.fantasy_teams
  with check (
    owner_id = (select auth.uid())
    and contest_id is not null
    and exists (
      select 1 from public.fantasy_contests c
      where c.id = fantasy_teams.contest_id
        and c.league_id is not null
        and public.fantasy_is_league_member(c.league_id)
    )
  );

-- Pre-v3-scorer snapshot of beta scores (38 rows, all beta team ids).
drop table if exists public.fantasy_scores_backup_20260815;

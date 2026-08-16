-- ─────────────────────────────────────────────────────────────────────────────
-- Fantasy Leagues & Contests — Phase 1, migration 5 of 8.
--
-- fantasy_teams gets contest_id. Create the global UFA 2026 contest and
-- backfill every existing team onto it, so /fantasy keeps working unchanged
-- once the app layer switches to reading by contest_id.
--
-- The legacy unique(owner_id, league_id, season_year) NULLS NOT DISTINCT
-- constraint is NOT dropped — per the 20260701042853 hardening migration's
-- comment, it still guards legacy writes (any future insert that leaves
-- league_id/season_year set the old way). New unique(owner_id, contest_id)
-- is the constraint the app will actually rely on going forward.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.fantasy_teams
  add column if not exists contest_id uuid references public.fantasy_contests(id);

create index fantasy_teams_contest_idx on public.fantasy_teams(contest_id);

-- ── Seed the global UFA 2026 contest (league_id NULL = global/service-managed). ──
insert into public.fantasy_contests (league_id, competition, season_year, name, status, settings)
values (
  null,
  'ufa',
  2026,
  'Global — UFA 2026',
  'active',
  '{"mode":"weekly-stats","offenders":4,"defenders":3}'::jsonb
);

-- ── Backfill every existing fantasy_teams row onto that contest. ──
update public.fantasy_teams t
set contest_id = c.id
from public.fantasy_contests c
where c.league_id is null
  and c.competition = 'ufa'
  and c.season_year = 2026
  and t.contest_id is null;

-- New going-forward uniqueness: one team per owner per contest.
create unique index fantasy_teams_owner_contest_key
  on public.fantasy_teams (owner_id, contest_id);

comment on column public.fantasy_teams.contest_id is 'FK to fantasy_contests — the contest this team plays in. Replaces league_id/season_year as the primary scoping key going forward; league_id stays for backward compat (written NULL on new rows).';

notify pgrst, 'reload schema';

-- Public League teardown, part 5 (final audit follow-ups, 2026-09-12).
-- 1. fantasy_teams.contest_id cascades like every other contest child. Teams
--    used to go via fantasy_teams.league_id's cascade, but private-league teams
--    never set league_id, so deleting a league (and so deleting a
--    commissioner's account) failed with 23503 once the league had teams.
-- 2. fantasy_teams.league_id is filled from the contest on insert, ignoring
--    the client value. Bridge until the column is dropped: the iOS 33 /
--    Android 11 store builds still show a Public League leaderboard filtered
--    on league_id IS NULL, which would otherwise list every private team.
-- 3. Strip the last null-league / contest-less branches from shared functions
--    (patched in place from the live definition) and rewrite stale comments.
set lock_timeout = '5s';

alter table public.fantasy_teams
  drop constraint fantasy_teams_contest_id_fkey,
  add constraint fantasy_teams_contest_id_fkey
    foreign key (contest_id) references public.fantasy_contests(id) on delete cascade;

create or replace function public.fantasy_teams_set_league()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select c.league_id into NEW.league_id
  from public.fantasy_contests c
  where c.id = NEW.contest_id;
  return NEW;
end;
$$;
revoke all on function public.fantasy_teams_set_league() from public, anon, authenticated;

create trigger fantasy_teams_set_league
  before insert on public.fantasy_teams
  for each row execute function public.fantasy_teams_set_league();

do $$
declare v_def text; v_new text; f text;
begin
  foreach f in array array['public.fantasy_activity_add_drop()', 'public.fantasy_activity_draft()', 'public.fantasy_activity_draft_pick()'] loop
    v_def := pg_get_functiondef(f::regprocedure);
    if v_def like '%v_league is null then return new;%' then
      v_new := replace(v_def, E'  if v_league is null then return new; end if;\n', '');
      if v_new like '%v_league is null%' then raise exception '% anchor not found', f; end if;
      execute v_new;
    end if;
  end loop;

  v_def := pg_get_functiondef('public.fantasy_activity_team_created()'::regprocedure);
  if v_def like '%new.contest_id is null%' or v_def like '%v_league is null%' then
    v_new := replace(v_def, E'  if new.contest_id is null then return new; end if;\n', '');
    v_new := replace(v_new, E'  if v_league is null then return new; end if;\n', '');
    if v_new like '%is null then return new%' then
      raise exception 'fantasy_activity_team_created anchor not found';
    end if;
    execute v_new;
  end if;

  -- A null league skipped the membership check (fail-open); now it rejects.
  foreach f in array array['public.fantasy_resolve_auction(uuid)', 'public.fantasy_resolve_clock(uuid)'] loop
    v_def := pg_get_functiondef(f::regprocedure);
    if v_def like '%v_league is not null and not exists (%' then
      execute replace(v_def, 'v_league is not null and not exists (', 'not exists (');
    end if;
  end loop;

  v_def := pg_get_functiondef('public.fantasy_teams_guard_delete()'::regprocedure);
  if v_def like '%OLD.contest_id is null%' then
    v_new := replace(v_def, E'  if OLD.contest_id is null then\n    return OLD;\n  end if;\n\n', '');
    if v_new like '%OLD.contest_id is null%' then raise exception 'fantasy_teams_guard_delete anchor not found'; end if;
    execute v_new;
  end if;

  foreach f in array array[
    'public.fantasy_schedule_draft(uuid, timestamp with time zone, integer, integer)',
    'public.fantasy_schedule_auction_draft(uuid, timestamp with time zone, integer, integer, integer, integer, integer)'
  ] loop
    v_def := pg_get_functiondef(f::regprocedure);
    if v_def like '%the Public League never drafts%' then
      execute replace(v_def, 'the Public League never drafts', 'this contest is not editable');
    end if;
  end loop;
end $$;

comment on table public.fantasy_contests is 'One instance of a private league pointed at a real competition+season (league_id NOT NULL). settings jsonb carries mode + roster composition (e.g. {"mode":"weekly-stats","offenders":4,"defenders":3} / {"mode":"event","flex":7}) so DB triggers stay generic across competitions.';
comment on table public.fantasy_teams is 'Fantasy teams, one per owner per contest (contest_id NOT NULL). Public read (league standings); inserts gated to league members, client updates limited to team_name. league_id is filled from the contest by fantasy_teams_set_league and is scheduled to be dropped once the iOS 33 / Android 11 store builds are replaced.';
comment on table public.fantasy_leagues is 'Private fantasy leagues: members, invites, chat, and one or more contests.';
comment on table public.fantasy_roster_slots is 'Per-period roster. Shape comes from the contest settings (weekly-stats offenders/defenders or event flex), enforced by fantasy_roster_composition; player identity is (player_league, player_id). Public read; writes gated to team owner.';
comment on table public.fantasy_contest_periods is 'Single lock authority for roster edits, per (contest, period). Written by fantasy_rebuild_contest_periods / fantasy_rebuild_all_periods, never computed inline on the read/write path. unlock_at NULL = once locked, locked forever (correct for event-mode contests with a single "event" period).';
comment on column public.fantasy_teams.owner_display_name is 'Denormalized profiles.display_name, the primary label in league standings (@owner_username is the secondary disambiguator). Force-synced by fantasy_sync_owner_username trigger.';
comment on function public.fantasy_check_roster_lock() is 'Backstop for app-layer period locks: looks up fantasy_contest_periods (the single lock authority) and fails loud if no period row exists for that (contest, week).';
comment on function public.fantasy_roster_is_valid(uuid, text) is 'True when (team, week/period) roster exactly matches its contest''s settings-defined composition. App calls this before locking/submitting a period. Live caps enforced by fantasy_roster_composition trigger.';

notify pgrst, 'reload schema';

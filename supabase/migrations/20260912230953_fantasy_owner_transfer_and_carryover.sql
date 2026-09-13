-- Fantasy: league owner transfer + carry-over widened to all weekly-stats
-- contests (2026-09-12, Hunter's call).
--
-- 1. fantasy_leagues.owner_id -> profiles ON DELETE CASCADE, so deleting an
--    account cascades its owned leagues — silently wiping every other
--    member's teams the moment an owner with co-members deletes their
--    account. Three objects close that:
--      - fantasy_leagues_blocking_account_deletion(): pre-flight the client
--        calls before deleting an account. Lists leagues the caller owns
--        that have at least one other member; empty result = safe to delete.
--      - fantasy_transfer_league_ownership(): the only sanctioned way to move
--        owner_id. Caller must already be the owner (row locked FOR UPDATE so
--        two concurrent transfers can't race), the new owner must already be
--        a member and can't be the caller, and the role swap (new owner ->
--        commissioner, old owner -> member) happens in the same transaction
--        as the owner_id write.
--      - fantasy_leagues_block_delete_with_members trigger: BEFORE DELETE
--        backstop that fails loud if anything ever deletes a league that
--        still has non-owner members without transferring first — a client
--        that skips the pre-flight, or a future code path (e.g. an admin
--        script, or the account-deletion cascade itself). Turns silent data
--        loss into a hard error.
--
--    Audited before writing this: fantasy_leagues carries a permissive
--    "update commissioner" RLS policy (USING/WITH CHECK fantasy_is_commissioner(id),
--    which only checks fantasy_league_members role — it doesn't care what
--    columns change) plus a blanket table-level UPDATE grant to
--    anon/authenticated. Nothing in the app uses either for owner_id (rename
--    and logo both go through their own SECURITY DEFINER RPCs), so today any
--    commissioner can `update fantasy_leagues set owner_id = <anything>`
--    directly over PostgREST — skipping the membership check and the role
--    swap entirely, and setting owner_id to a non-member. Dead grant, real
--    hole: closed below by revoking UPDATE on the table entirely (verified —
--    Postgres has no "revoke this one column back out of a table-level
--    grant": a role with table-wide UPDATE can still write any column no
--    matter what column-level REVOKEs say, so `revoke update (owner_id)`
--    alone is a no-op here). Nothing else needs direct UPDATE either
--    (name/logo_url/logo_icon all go through their own RPCs already), so the
--    table-wide revoke costs nothing. fantasy_league_members has no UPDATE policy at all
--    (only "delete self" + public read), so `role` is already unreachable by
--    anon/authenticated despite carrying the same blanket column grant —
--    verified, no change needed there. fantasy_league_activity's kind CHECK
--    has no value that fits an ownership transfer (member_joined,
--    team_created, draft_*, add_drop, matchup_final, trade_*,
--    waiver_claimed — nothing about league membership/role changes), so per
--    the "skip if nothing fits" rule this migration does not write an
--    activity row for the transfer. fantasy_leagues' only existing trigger is
--    fantasy_leagues_seed_owner_membership (AFTER INSERT); no name collision.
--
-- 2. fantasy_carry_over_rosters (hourly cron) only ever carried UFA rosters
--    forward — PUL and WUL are also weekly-stats contests and were silently
--    getting no carry-over at all. Rewritten to cover every open
--    weekly-stats contest regardless of competition, and to find the prior
--    period to copy from off each contest's own fantasy_contest_periods lock
--    schedule instead of parsing 'week-N' text: PUL periods use ufa-style
--    free-text week_label names, so numeric parsing would silently misorder
--    or skip them. The calendar-derived default season (Apr-cutover
--    v_year computation) is dropped along with the UFA-only join — p_year
--    now only filters when explicitly passed.
--    Per this repo's rule (CLAUDE.md) against replacing a shared function
--    from stale committed text, the live definition's md5 is checked against
--    the value captured when this migration was written; a mismatch means
--    something else changed the function since, and the migration aborts
--    instead of silently clobbering that change. CREATE OR REPLACE keeps the
--    function's existing owner (postgres) and grants (EXECUTE: service_role
--    only) as-is.
set lock_timeout = '5s';

-- === Pre-flight: leagues an account deletion would silently gut ===
create or replace function public.fantasy_leagues_blocking_account_deletion()
returns table(league_id uuid, league_name text, other_member_count int)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;

  return query
  select l.id, l.name, count(m.user_id)::int
  from public.fantasy_leagues l
  join public.fantasy_league_members m
    on m.league_id = l.id and m.user_id <> l.owner_id
  where l.owner_id = (select auth.uid())
  group by l.id, l.name;
end;
$$;
revoke all on function public.fantasy_leagues_blocking_account_deletion() from public, anon;
grant execute on function public.fantasy_leagues_blocking_account_deletion() to authenticated;

-- === The only sanctioned way to move fantasy_leagues.owner_id ===
create or replace function public.fantasy_transfer_league_ownership(p_league uuid, p_new_owner uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_owner_id uuid;
begin
  if v_caller is null then
    raise exception 'not authenticated';
  end if;

  select owner_id into v_owner_id
  from public.fantasy_leagues
  where id = p_league
  for update;

  if v_owner_id is null or v_caller <> v_owner_id then
    raise exception 'only the league owner can transfer ownership';
  end if;

  -- Lock the target's membership row so a concurrent leave/remove can't delete
  -- it between this check and the role swap (owner_id would then point at a
  -- non-member and nobody would hold the commissioner role).
  perform 1 from public.fantasy_league_members
  where league_id = p_league and user_id = p_new_owner
  for update;
  if p_new_owner = v_caller or not found then
    raise exception 'the new owner must be a member of this league';
  end if;

  update public.fantasy_leagues
  set owner_id = p_new_owner
  where id = p_league;

  update public.fantasy_league_members
  set role = 'commissioner'
  where league_id = p_league and user_id = p_new_owner;

  update public.fantasy_league_members
  set role = 'member'
  where league_id = p_league and user_id = v_owner_id;
end;
$$;
revoke all on function public.fantasy_transfer_league_ownership(uuid, uuid) from public, anon;
grant execute on function public.fantasy_transfer_league_ownership(uuid, uuid) to authenticated;

-- === Close the direct-UPDATE path onto owner_id (see audit note above) ===
revoke update on public.fantasy_leagues from anon, authenticated;
-- TRUNCATE bypasses RLS and the delete backstop below; clients never need it.
-- fantasy_league_members has no UPDATE policy, so its blanket UPDATE grant is
-- inert today — revoked anyway so a future policy can't expose `role`.
revoke truncate on public.fantasy_leagues, public.fantasy_league_members from anon, authenticated;
revoke update on public.fantasy_league_members from anon, authenticated;

-- === Backstop: fail loud instead of cascading away other members' teams ===
create or replace function public.fantasy_leagues_block_delete_with_members()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.fantasy_league_members
    where league_id = OLD.id and user_id <> OLD.owner_id
  ) then
    raise exception 'fantasy_league_has_members: transfer ownership of "%" before deleting', OLD.name;
  end if;
  return OLD;
end;
$$;
revoke all on function public.fantasy_leagues_block_delete_with_members() from public, anon, authenticated;

create trigger fantasy_leagues_block_delete_with_members
  before delete on public.fantasy_leagues
  for each row execute function public.fantasy_leagues_block_delete_with_members();

-- === Carry-over: every open weekly-stats contest, not just UFA ===
do $$
declare
  v_expected_md5 text := '8e239c94bbb734e720ffac0242f50737';
  v_live_md5 text;
begin
  v_live_md5 := md5(pg_get_functiondef('public.fantasy_carry_over_rosters(integer)'::regprocedure));
  if v_live_md5 <> v_expected_md5 then
    raise exception 'fantasy_carry_over_rosters drift: live md5 % does not match % this migration was written against — re-check the live definition before rewriting', v_live_md5, v_expected_md5;
  end if;
end $$;

create or replace function public.fantasy_carry_over_rosters(p_year integer default null::integer)
returns table(team_id uuid, from_week text, into_week text, slots_copied integer)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  rec record;
  v_prev_week text;
  v_copied int;
begin
  -- Every open weekly-stats contest (UFA, PUL, WUL — event-mode contests are
  -- excluded by the mode filter, not by competition name) gets its active
  -- period carried forward. Active period per contest = the earliest
  -- fantasy_contest_periods row not yet locked — the same authority the
  -- roster-lock trigger checks.
  for rec in
    select t.id as tid, c.id as cid, ap.period as active_week, ap.lock_at as active_lock_at
    from public.fantasy_teams t
    join public.fantasy_contests c on c.id = t.contest_id
    cross join lateral (
      select cp.period, cp.lock_at
      from public.fantasy_contest_periods cp
      where cp.contest_id = c.id and cp.lock_at > now()
      order by cp.lock_at
      limit 1
    ) ap
    where coalesce(c.settings->>'mode', 'weekly-stats') = 'weekly-stats'
      and c.status <> 'complete'
      and (p_year is null or c.season_year = p_year)
      and not exists (
        select 1 from public.fantasy_roster_slots rs
        where rs.team_id = t.id and rs.week = ap.period
      )
  loop
    -- Most recent period this team has a roster for, ordered by this
    -- contest's own lock schedule — not by parsing 'week-N' text, since PUL
    -- periods use ufa-style free-text week_label names.
    select cp.period into v_prev_week
    from public.fantasy_contest_periods cp
    join public.fantasy_roster_slots rs
      on rs.team_id = rec.tid and rs.week = cp.period
    where cp.contest_id = rec.cid
      and cp.lock_at < rec.active_lock_at
    order by cp.lock_at desc
    limit 1;

    if v_prev_week is null then
      continue; -- team never set a roster in this contest → nothing to carry
    end if;

    -- One team's bad carry (e.g. a drafted league where it no longer owns a
    -- rostered player) must not abort the run for every other team.
    begin
      insert into public.fantasy_roster_slots (team_id, week, player_id, player_league, role)
      select rec.tid, rec.active_week, rs.player_id, rs.player_league, rs.role
      from public.fantasy_roster_slots rs
      where rs.team_id = rec.tid and rs.week = v_prev_week;
      get diagnostics v_copied = row_count;
    exception when others then
      raise warning 'fantasy_carry_over_rosters: skipped team % (% -> %): %', rec.tid, v_prev_week, rec.active_week, sqlerrm;
      continue;
    end;

    team_id := rec.tid; from_week := v_prev_week; into_week := rec.active_week; slots_copied := v_copied;
    return next;
  end loop;
end;
$function$;

notify pgrst, 'reload schema';

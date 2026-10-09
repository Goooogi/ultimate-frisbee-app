-- Fantasy: a league's owner can delete the league from Settings (Hunter,
-- 2026-10-07). APPLIED to prod 2026-10-07 on Hunter's go (remote version
-- 20261007154703).
--
-- Everything under fantasy_leagues already goes with it: every FK in the tree
-- is ON DELETE CASCADE (or SET NULL). Two delete guards matter:
--   * fantasy_leagues_block_delete_with_members — the account-deletion
--     backstop (owners must transfer first). It gets ONE narrow exception: a
--     transaction-local flag holding the id of the league being deleted, set
--     only by fantasy_delete_league after its owner check. Every other delete
--     path is still blocked exactly as before.
--   * fantasy_teams_guard_delete — teams can't go during a live draft. Not
--     bypassed; fantasy_delete_league refuses a league with a live draft first.
-- fantasy_check_roster_lock needs nothing: slots cascade after their team row
-- is gone, and it lets those through.
-- League logos stay in the league-logos bucket (Storage API only; the
-- commissioner-folder policy needs the membership that's being deleted).
--
-- The guard is PATCHED IN PLACE from its LIVE definition (anchor asserted to
-- occur exactly once). Live md5(prosrc) (2026-10-07):
--   fantasy_leagues_block_delete_with_members  1dee7c71aef34c09f4bea67734b6ff11

create or replace function pg_temp.replace_once(p_src text, p_old text, p_new text, p_what text)
returns text
language plpgsql
as $$
begin
  if (length(p_src) - length(replace(p_src, p_old, ''))) / length(p_old) <> 1 then
    raise exception '%: anchor not found exactly once — aborting rather than guessing', p_what;
  end if;
  return replace(p_src, p_old, p_new);
end;
$$;

do $mig$
declare
  v text;
begin
  v := pg_get_functiondef('public.fantasy_leagues_block_delete_with_members()'::regprocedure);
  v := pg_temp.replace_once(v,
'begin
  if exists (
    select 1 from public.fantasy_league_members',
'begin
  -- fantasy_delete_league (owner-only) flags the one league it is deleting.
  if current_setting(''fantasy.deleting_league'', true) = OLD.id::text then
    return OLD;
  end if;
  if exists (
    select 1 from public.fantasy_league_members',
    'fantasy_leagues_block_delete_with_members');
  execute v;
end;
$mig$;

create function public.fantasy_delete_league(p_league uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_owner  uuid;
begin
  if v_caller is null then
    raise exception 'not authenticated' using errcode = 'P0001';
  end if;

  select owner_id into v_owner
  from public.fantasy_leagues
  where id = p_league
  for update;

  if not found then
    raise exception 'That league no longer exists.' using errcode = 'P0001';
  end if;
  if v_owner is distinct from v_caller then
    raise exception 'Only the league owner can delete the league.' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.fantasy_drafts d
    join public.fantasy_contests c on c.id = d.contest_id
    where c.league_id = p_league and d.status = 'live'
  ) then
    raise exception 'Finish the live draft before deleting the league.' using errcode = 'P0001';
  end if;

  -- Transaction-local: lets the members guard through for this league only,
  -- and is cleared right after so it can't outlive the delete.
  perform set_config('fantasy.deleting_league', p_league::text, true);
  delete from public.fantasy_leagues where id = p_league;
  perform set_config('fantasy.deleting_league', '', true);
end;
$$;

revoke all on function public.fantasy_delete_league(uuid) from public, anon, authenticated;
grant execute on function public.fantasy_delete_league(uuid) to authenticated;

notify pgrst, 'reload schema';

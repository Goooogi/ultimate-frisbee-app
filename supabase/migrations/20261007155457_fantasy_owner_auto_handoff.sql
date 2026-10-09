-- Fantasy: league ownership passes on automatically when the owner leaves
-- (Hunter, 2026-10-07 — "option B, we can just force someone as owner").
-- APPLIED to prod 2026-10-07 (remote version 20261007155457).
--
-- When an owner's account is deleted, or the owner leaves the league, the
-- league goes to another member with no acceptance step: a member who has a
-- team in one of the league's contests first, then the longest-standing
-- member. A league with no other member still goes with the owner's account
-- (unchanged). fantasy_transfer_league_ownership stays the instant,
-- owner-picked hand-off.
--
--   * fantasy_hand_off_league(league, leaving) — the succession rule; locks
--     the league and the heir's membership row. Internal (no client EXECUTE).
--   * profiles BEFORE DELETE trigger — runs the hand-off inside the account-
--     deletion cascade (auth.users → profiles → owned leagues), so a league
--     with members survives. fantasy_leagues_block_delete_with_members stays
--     as the backstop and now never fires for those leagues.
--   * fantasy_leave_league — an owner may now leave: hand-off first, then the
--     membership row goes. A sole member is told to delete the league instead.
--   * fantasy_leagues_blocking_account_deletion — nothing blocks deletion any
--     more; returns no rows (kept so shipped clients' pre-flight passes).
-- The delete-account edge function's own league 409 is removed in its v6,
-- deployed AFTER this migration (before it, a league with members would hit
-- the backstop mid-delete).
--
-- Existing functions are PATCHED IN PLACE from their LIVE definitions (anchors
-- asserted to occur exactly once). Live md5(prosrc) (2026-10-07):
--   fantasy_leave_league                      72635c0c389468f03b61ccd2e0f2aea4
--   fantasy_leagues_blocking_account_deletion 54179572b64ec1c21d67a976e35b770c

create function public.fantasy_hand_off_league(p_league uuid, p_leaving uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_heir uuid;
begin
  -- Only while p_leaving still owns it; serializes with transfer/leave/delete.
  perform 1 from public.fantasy_leagues
  where id = p_league and owner_id = p_leaving
  for update;
  if not found then
    return false;
  end if;

  -- Locking the heir's row keeps a concurrent leave/remove from leaving
  -- owner_id pointing at a non-member.
  select m.user_id into v_heir
  from public.fantasy_league_members m
  where m.league_id = p_league and m.user_id <> p_leaving
  order by exists (
             select 1
             from public.fantasy_teams t
             join public.fantasy_contests c on c.id = t.contest_id
             where c.league_id = p_league and t.owner_id = m.user_id
           ) desc,
           m.joined_at,
           m.user_id
  limit 1
  for update of m;

  if v_heir is null then
    return false;
  end if;

  update public.fantasy_leagues set owner_id = v_heir where id = p_league;
  update public.fantasy_league_members set role = 'commissioner'
  where league_id = p_league and user_id = v_heir;
  update public.fantasy_league_members set role = 'member'
  where league_id = p_league and user_id = p_leaving;
  return true;
end;
$$;

revoke all on function public.fantasy_hand_off_league(uuid, uuid) from public, anon, authenticated;

create function public.fantasy_hand_off_leagues_on_profile_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_league uuid;
begin
  for v_league in
    select id from public.fantasy_leagues where owner_id = OLD.id order by id
  loop
    perform public.fantasy_hand_off_league(v_league, OLD.id);
  end loop;
  return OLD;
end;
$$;

revoke all on function public.fantasy_hand_off_leagues_on_profile_delete() from public, anon, authenticated;

create trigger fantasy_hand_off_leagues_on_profile_delete
  before delete on public.profiles
  for each row execute function public.fantasy_hand_off_leagues_on_profile_delete();

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
  v := pg_get_functiondef('public.fantasy_leave_league(uuid)'::regprocedure);
  v := pg_temp.replace_once(v,
'  if v_caller = v_owner_id then
    raise exception ''the league owner cannot leave — transfer ownership or delete the league instead'';
  end if;',
'  -- An owner may leave: the league passes to another member first.
  if v_caller = v_owner_id and not public.fantasy_hand_off_league(p_league, v_caller) then
    raise exception ''You''''re the only member — delete the league in Settings instead.'';
  end if;',
    'fantasy_leave_league owner');
  execute v;

  v := pg_get_functiondef('public.fantasy_leagues_blocking_account_deletion()'::regprocedure);
  v := pg_temp.replace_once(v,
'  return query
  select l.id, l.name, count(m.user_id)::int
  from public.fantasy_leagues l
  join public.fantasy_league_members m
    on m.league_id = l.id and m.user_id <> l.owner_id
  where l.owner_id = (select auth.uid())
  group by l.id, l.name;',
'  -- Owned leagues pass to another member when the account is deleted
  -- (fantasy_hand_off_leagues_on_profile_delete), so none block deletion.
  -- Kept, empty, so shipped clients'' pre-flight passes.
  return;',
    'fantasy_leagues_blocking_account_deletion');
  execute v;
end;
$mig$;

-- Fantasy ownership hardening (security review of 20261007155457, 2026-10-07).
-- APPLIED to prod 2026-10-07 (remote version 20261007164349).
-- Both gaps could leave a league owned by a non-member, with no commissioner:
--
--   1. Race: fantasy_leave_league / fantasy_remove_league_member read owner_id
--      without a lock, then delete a member row. If the chosen heir left (or
--      was removed) while a hand-off or transfer held their row, the delete
--      still went through after it committed. Both now take the league row
--      FOR UPDATE first — the same lock transfer, hand-off and delete_league
--      take first — so every ownership change serializes on it. remove also
--      re-checks the caller's commissioner role after the lock (a transfer
--      that committed meanwhile demotes them).
--   2. Bypass: the "delete self" RLS policy let an owner delete their own
--      membership row over REST, skipping the hand-off. It now excludes the
--      commissioner row (owner == commissioner); owners leave through
--      fantasy_leave_league. Neither app deletes member rows directly.
--
-- Functions PATCHED IN PLACE from their LIVE definitions (anchors asserted to
-- occur exactly once). Live md5(prosrc) (2026-10-07):
--   fantasy_leave_league          64faaeb6acde02ba0fd9d509b04f2e72
--   fantasy_remove_league_member  143575d0f0e3e7ab0cdd4bdc6c913434

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
'  select owner_id into v_owner_id from public.fantasy_leagues where id = p_league;',
'  -- Serialize with transfer / hand-off / delete (they lock this row first).
  select owner_id into v_owner_id from public.fantasy_leagues where id = p_league for update;',
    'fantasy_leave_league lock');
  execute v;

  v := pg_get_functiondef('public.fantasy_remove_league_member(uuid, uuid)'::regprocedure);
  v := pg_temp.replace_once(v,
'  select owner_id into v_owner_id from public.fantasy_leagues where id = p_league;',
'  -- Serialize with transfer / hand-off / delete (they lock this row first),
  -- then re-check the role: a transfer that committed meanwhile demotes us.
  select owner_id into v_owner_id from public.fantasy_leagues where id = p_league for update;
  if not public.fantasy_is_commissioner(p_league) then
    raise exception ''not authorized'';
  end if;',
    'fantasy_remove_league_member lock');
  execute v;
end;
$mig$;

drop policy "fantasy_league_members delete self" on public.fantasy_league_members;
create policy "fantasy_league_members delete self" on public.fantasy_league_members
  for delete to authenticated
  using (user_id = (select auth.uid()) and role <> 'commissioner');

-- Fantasy: weekly pro leagues (UFA / PUL / WUL) start exactly 4 offense +
-- 3 defense, plus 5 bench (Hunter, 2026-10-08). The O/D split is no longer a
-- commissioner setting; both apps show it read-only. This keeps an old build
-- or a raw RPC call from saving another split (mobile's lineup save assumes
-- 4/3 and would wipe that week's lineup). Prod had 0 weekly contests.
-- APPLIED to prod 2026-10-08 (remote version 20261008160703).
--
-- Patched IN PLACE from the LIVE definition (anchor asserted to occur once).
-- Live md5(prosrc) (2026-10-08):
--   fantasy_update_contest_roster 9227fdb02c3c973fdc8b555676a2c90b

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
  v := pg_get_functiondef('public.fantasy_update_contest_roster(uuid, integer, integer, integer)'::regprocedure);
  v := pg_temp.replace_once(v,
'    if p_offenders < 1 or p_offenders > 10 or p_defenders < 1 or p_defenders > 10 then
      raise exception ''Each line must be between 1 and 10 players.'' using errcode = ''P0001'';
    end if;
    if p_offenders + p_defenders <> 7 then
      raise exception ''Weekly lineups have 7 starters — offense and defense must add up to 7.'' using errcode = ''P0001'';
    end if;',
'    -- Fixed by the game (Hunter, 2026-10-08): 4 offense + 3 defense.
    if p_offenders <> 4 or p_defenders <> 3 then
      raise exception ''Weekly lineups are fixed at 4 offense + 3 defense.'' using errcode = ''P0001'';
    end if;',
    'fantasy_update_contest_roster weekly split');
  execute v;
end;
$mig$;

-- Fantasy USAU: the player pool is the contest event's own roster (2026-10-07).
-- APPLIED to prod 2026-10-07 on Hunter's go (remote version 20261007154649).
--
-- Both functions read "every usau_rosters row this season on the event's
-- teams", which mixes in other events' rosters (sectionals/regionals players
-- not at Nationals: 141 of 1,376 at 2026 Club Nats) and legacy season-only
-- ghost twins of real ids. Those ids never score — score-fantasy reads stats
-- for the contest event only. Before the event starts there are no
-- usau_player_event_stats rows, so every auto-pick takes the roster fallback,
-- and about a third of its alphabetical candidates were unscorable (picks 1-2
-- were both "Aaron Abraham": the real id and a ghost twin).
-- The web search (src/lib/fantasy/draft.ts) already filters on event_id.
--
-- PATCHED IN PLACE from the LIVE definitions with anchors asserted to occur
-- exactly once (the 20260913160000 pattern). Live md5(prosrc) (2026-10-07):
--   fantasy_draft_best_available  418cfc806a34293498d0875b656eb234
--   fantasy_draft_rosters_ready   f95a3e68f36d8373ee5f2fe2b45c9203

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
  -- Auto-pick fallback (no event stats yet): the event roster, one row per player.
  v := pg_get_functiondef('public.fantasy_draft_best_available(uuid, public.fantasy_contests)'::regprocedure);
  v := pg_temp.replace_once(v,
'      from public.usau_rosters r
      join public.usau_event_teams et on et.team_id = r.team_id
        and et.event_id = (p_contest.settings ->> ''eventId'')::uuid
      join public.usau_players up on up.id = r.player_id
      where r.season = p_contest.season_year',
'      from public.usau_rosters r
      join public.usau_players up on up.id = r.player_id
      where r.event_id = (p_contest.settings ->> ''eventId'')::uuid',
    'fantasy_draft_best_available usau fallback');
  execute v;

  -- Drafts can start once the event roster itself is in (not just any roster
  -- row for the event's teams), matching what search and auto-pick draw from.
  v := pg_get_functiondef('public.fantasy_draft_rosters_ready(uuid)'::regprocedure);
  v := pg_temp.replace_once(v,
'    return exists (
      select 1
      from public.usau_rosters r
      join public.usau_event_teams et on et.team_id = r.team_id and et.event_id = v_event_uuid
      where r.season = v_season
    );',
'    return exists (select 1 from public.usau_rosters r where r.event_id = v_event_uuid);',
    'fantasy_draft_rosters_ready usau');
  execute v;
end;
$mig$;

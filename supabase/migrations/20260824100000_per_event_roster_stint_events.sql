-- Per-EVENT roster filtering for profile stint events.
--
-- A stint's `events` were the TEAM's whole season (usau_event_teams join) —
-- a player who guested at one tournament inherited every event the team
-- played. Jon Nethercutt guested with Lotus at the 2021 TCT Pro-Elite
-- Challenge only, but his profile showed Lotus at Sectionals/Regionals/
-- Nationals too (and that projection is also what sank the identity-split
-- plan — see vault "USAU Identity Split Plan" §12).
--
-- Event-keyed usau_rosters rows (event_id NOT NULL — written by
-- sync-event-rosters since its 20260821140000 key change, backfilled by
-- usau-scraper/scripts/backfill-event-rosters.py) say who was actually
-- rostered AT each event. Where such rows exist for a (team, season, event),
-- the stint keeps the event only if this cluster is on that event's roster.
-- Events with no event-keyed coverage keep the whole-season projection, so
-- behavior upgrades per event as the backfill lands and regresses nowhere.
--
-- prosrc patch, NOT create-or-replace from committed text: _build_player_profile
-- is shared with the mobile repo and has remote-only migrations (per CLAUDE.md).
DO $migration$
DECLARE
  v_src text;
  c_old constant text :=
'    from usau_raw_stints rs
    left join usau_participation p on p.team_id = rs.team_id and p.event_season = rs.season
    left join usau_stats_by_event se on se.event_id = p.event_id';
  c_new constant text :=
'    from usau_raw_stints rs
    left join usau_participation p on p.team_id = rs.team_id and p.event_season = rs.season
      -- Per-event roster gate: where an event-keyed roster exists for this
      -- (team, season, event), require this cluster on it (guest stints must
      -- not inherit the whole season). No coverage -> whole-season fallback.
      and (
        not exists (
          select 1 from public.usau_rosters r2
          where r2.team_id = rs.team_id and r2.season = rs.season
            and r2.event_id = p.event_id
        )
        or exists (
          select 1 from public.usau_rosters r3
          where r3.team_id = rs.team_id and r3.season = rs.season
            and r3.event_id = p.event_id
            and r3.player_id in (select id from usau_cluster)
        )
      )
    left join usau_stats_by_event se on se.event_id = p.event_id';
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE proname = '_build_player_profile';
  IF v_src IS NULL THEN RAISE EXCEPTION '_build_player_profile not found'; END IF;
  IF position('r3.player_id in (select id from usau_cluster)' in v_src) > 0 THEN
    RAISE NOTICE 'already patched; skipping'; RETURN;
  END IF;

  IF (length(v_src) - length(replace(v_src, c_old, ''))) / length(c_old) <> 1 THEN
    RAISE EXCEPTION 'stint-events join anchor not found exactly once';
  END IF;

  v_src := replace(v_src, c_old, c_new);

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public._build_player_profile(p_anchor_id text) '
    'RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS %L',
    v_src);
END
$migration$;

-- Flag only the profiles the gate can change today — names holding an
-- event-keyed roster row. built_at = '-infinity' jumps the trickle queue
-- (player_profile_trickle_rebuild); no reader-path cost, no mass rebuild.
-- Profiles affected by FUTURE backfill batches refresh via the trickle's
-- normal 24h sweep.
UPDATE public.player_profiles pp
   SET built_at = '-infinity'
 WHERE lower(pp.profile->>'displayName') IN (
   SELECT DISTINCT lower(p.display_name)
   FROM public.usau_rosters r
   JOIN public.usau_players p ON p.id = r.player_id
   WHERE r.event_id IS NOT NULL
 );

NOTIFY pgrst, 'reload schema';

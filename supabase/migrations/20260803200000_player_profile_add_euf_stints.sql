-- Fold EUF/EUCS appearances into the shared cross-league player profile.
--
-- _build_player_profile is SHARED WITH THE MOBILE REPO and has migrations that
-- exist only in the remote DB, so committed text would NOT match the deployed
-- body. Per CLAUDE.md we PATCH prosrc rather than CREATE OR REPLACE from
-- committed source (same technique as the 20260729 / 20260801 migrations).
--
-- Two edits, both anchored on strings asserted unique at runtime:
--   1. add an `euf_stints` CTE immediately before `wfdf_stints`
--   2. add an `'eufStints'` key to the emitted jsonb, after `'wfdfStints'`
--
-- Matching mirrors the WFDF block: a surname ILIKE prefilter (cheap,
-- index-friendly) narrowed by public.names_match() (the token-subset rule).
-- euf_rosters has NO last_name column — only full_name — so the prefilter runs
-- against the last whitespace token of the normalized full_name.
--
-- Scope check at write time: 343 USAU display_names match an euf_rosters name,
-- attaching 1,163 EUF rows. Spot-checked as overwhelmingly real (e.g. Giovanni
-- Santucci carries jersey #27 in BOTH leagues for BFD La Fotta). Inherits the
-- known two-humans-same-name limit already accepted for USAU/PUL/WUL/WFDF.
DO $migration$
DECLARE
  v_src text;
  v_new text;
  c_cte_anchor  constant text := '  wfdf_stints as (';
  c_tail_anchor constant text := '    ), ''[]''::jsonb)

  ) into v_result;';
  c_euf_cte constant text :=
'  euf_stints as (
    select
      r.full_name, r.jersey_number, r.goals, r.assists, r.games, r.total,
      t.id as team_id, t.name as team_name, t.country_name, t.division::text as division_name,
      t.final_placement,
      e.name as event_name, e.slug as event_slug, e.year
    from public.euf_rosters r
    join public.euf_teams t on t.id = r.team_id
    join public.euf_events e on e.id = t.event_id
    cross join wfdf_surname ws
    where ws.surname is not null
      and split_part(public.normalize_player_name(r.full_name), '' '',
            array_length(regexp_split_to_array(public.normalize_player_name(r.full_name), ''\s+''), 1))
          ilike ''%'' || ws.surname || ''%''
      and public.names_match(v_anchor_name, r.full_name)
  ),
';
  c_euf_emit constant text :=
'    ), ''[]''::jsonb),

    ''eufStints'', coalesce((
      select jsonb_agg(jsonb_build_object(
        ''season'', ef.year, ''teamId'', ef.team_id, ''teamName'', ef.team_name,
        ''countryName'', ef.country_name, ''divisionName'', ef.division_name,
        ''eventName'', ef.event_name, ''eventSlug'', ef.event_slug,
        ''jerseyNumber'', ef.jersey_number,
        ''finalPlacement'', ef.final_placement,
        ''isChampion'', coalesce(ef.final_placement = 1, false),
        ''stats'', jsonb_build_object(
          ''goals'', ef.goals, ''assists'', ef.assists,
          ''games'', ef.games, ''points'', ef.total)
      ) order by ef.year desc)
      from euf_stints ef
    ), ''[]''::jsonb)

  ) into v_result;';
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE proname = '_build_player_profile';
  IF v_src IS NULL THEN RAISE EXCEPTION '_build_player_profile not found'; END IF;
  IF position('euf_stints' in v_src) > 0 THEN
    RAISE NOTICE 'already patched; skipping'; RETURN;
  END IF;

  IF (length(v_src) - length(replace(v_src, c_cte_anchor, ''))) / length(c_cte_anchor) <> 1 THEN
    RAISE EXCEPTION 'cte anchor not unique';
  END IF;
  IF (length(v_src) - length(replace(v_src, c_tail_anchor, ''))) / length(c_tail_anchor) <> 1 THEN
    RAISE EXCEPTION 'tail anchor not unique';
  END IF;

  v_new := replace(v_src, c_cte_anchor, c_euf_cte || c_cte_anchor);
  v_new := replace(v_new, c_tail_anchor, c_euf_emit);

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public._build_player_profile(p_anchor_id text) '
    'RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS %L',
    v_new);
END
$migration$;

-- Cached profiles predate EUF; drop so the next read rebuilds with eufStints.
DELETE FROM player_profiles;

NOTIFY pgrst, 'reload schema';

-- Add 'UT' to the northwest region and big sky section in
-- public.usau_states_for_event_name.
--
-- WHY: the TS map (src/lib/usau/regions.ts) gained 'UT' on both keys in the web
-- repo's commit 29724a7 (2026-08-04), but the SQL twin defined in
-- 20260729000000_player_profile_rpc_fixes.sql was never updated. Because
-- _build_player_profile builds the cached profile in SQL, every rebuild wrote a
-- homeStates WITHOUT 'UT', and the TS geography gate (shouldAttachUfa in
-- src/lib/players/unified.ts) then read Utah as a CONTRADICTION and dropped the
-- player's entire UFA career -- e.g. every Salt Lake Shred (UT) player whose
-- USAU events were Big Sky / Northwest.
--
-- The failure mode is silent: a MISSING state deletes real careers rather than
-- erroring, so this must stay in sync with the TS map. Verified at time of
-- writing that these two keys were the ONLY divergence across all 39 rows.
--
-- This was already hot-patched directly on the shared project; this migration
-- exists so a rebuild from supabase/migrations/ does not silently reintroduce
-- the bug. Re-running it against the patched database is a no-op.
--
-- IMMUTABLE: pure function of its argument (a constant lookup table). Pinned
-- search_path per house convention even though it touches no tables.
create or replace function public.usau_states_for_event_name(p_name text)
returns text[]
language sql
immutable
set search_path to 'public', 'pg_temp'
as $$
  with region_states(key, states) as (
    values
      -- ── Sections (granular) ──
      ('rocky mountain',      array['CO','WY','MT']),
      ('big sky',             array['MT','ID','WY','UT']),
      ('east plains',         array['OH','MI','IN','KY']),
      ('west plains',         array['IL','WI','MN','IA']),
      ('northwest plains',    array['MN','ND','SD']),
      ('central plains',      array['MO','KS','NE']),
      ('ozarks',              array['MO','AR','KS']),
      ('texas',               array['TX']),
      ('south texas',         array['TX']),
      ('gulf coast',          array['LA','MS','AL']),
      ('nor cal',             array['CA']),
      ('norcal',              array['CA']),
      ('so cal',              array['CA']),
      ('socal',               array['CA']),
      ('west bay',            array['CA']),
      ('oregon',              array['OR']),
      ('washington',          array['WA']),
      ('alaska',              array['AK']),
      ('metro new york',      array['NY']),
      ('metro ny',            array['NY']),
      ('upstate new york',    array['NY']),
      ('east new england',    array['MA','ME','NH','RI']),
      ('west new england',    array['MA','CT','VT']),
      ('south new england',   array['CT','RI']),
      ('east coast',          array['NJ','DE','MD']),
      ('capital',             array['DC','MD','VA']),
      ('founders',            array['PA','NJ']),
      ('north carolina',      array['NC']),
      ('central appalachia',  array['WV','VA','KY']),
      ('florida',             array['FL']),
      -- ── Regions (coarse fallback) ──
      ('rocky mountain region', array['CO','WY','MT','ID']),
      ('northwest',           array['WA','OR','AK','MT','ID','UT']),
      ('southwest',           array['CA','NV','AZ','HI']),
      ('north central',       array['MN','WI','IA','ND','SD','NE']),
      ('south central',       array['TX','CO','OK','AR','LA','NM','KS','MO']),
      ('great lakes',         array['OH','MI','IN','IL','WI','KY']),
      ('southeast',           array['FL','GA','AL','TN','SC','NC','MS']),
      ('northeast',           array['NY','MA','CT','VT','NH','ME','RI']),
      ('mid-atlantic',        array['PA','NJ','MD','DC','VA','DE','WV'])
  )
  select coalesce(
    (
      select rs.states
      from region_states rs
      where position(rs.key in lower(coalesce(p_name, ''))) > 0
      -- Longest matching key wins, mirroring statesForEventName()'s
      -- `key.length > best.key.length`. Tie-broken by key for determinism (the
      -- TS version keeps first-seen on a length tie; no two equal-length keys
      -- both match any real event name, so this is a stability guarantee, not
      -- a behavioral difference).
      order by length(rs.key) desc, rs.key
      limit 1
    ),
    array[]::text[]
  );
$$;

comment on function public.usau_states_for_event_name(text) is
  'Maps a USAU series event name ("Rocky Mountain Sectional") to the US state '
  'codes its section/region covers; empty array when unrecognized. SQL port of '
  'statesForEventName() in the web repo (src/lib/usau/regions.ts) -- longest '
  'matching section/region phrase wins, so a section outranks the region '
  'containing it. Derived from event names rather than usau_teams.city/state '
  'because those columns are effectively unpopulated on the club side, while '
  'series event names always carry the section/region. Feeds the profile '
  'payload''s homeStates, which gates cross-league UFA attribution for '
  'same-named players. Keep in sync with the TS map -- a missing state silently '
  'drops real UFA careers. IMMUTABLE, pinned search_path.';

revoke all on function public.usau_states_for_event_name(text) from public;
grant execute on function public.usau_states_for_event_name(text) to anon, authenticated;

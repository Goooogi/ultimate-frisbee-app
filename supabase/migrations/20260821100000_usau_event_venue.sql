-- USAU event venue.
--
-- USAU event pages carry the venue only in a free-text CMS blob the tournament
-- director writes ("Location: Grand Park Westfield, IN", "Fields Address: …",
-- a bare Google Maps link, or nothing at all) — unparseable across events, and
-- absent on most. So we do NOT scrape it.
--
-- The reliable source is the per-game field name we already ingest into
-- usau_games.location (ultirzr's FieldName; the .location cell in the HTML
-- scrape). When the TD fills it properly it already carries the venue:
-- "FC Dallas / Toyota Soccer Center - 14", "Devens - Rogers Field - 12".
-- Strip the trailing field designator and majority-vote per event.
--
-- ~52% of all events resolve a venue. The rest either have no games, or store
-- a bare "Field 3"/"7" with no venue prefix (common in the ultirzr era —
-- 2025/2026 are the WORST seasons for this). Those stay null and the UI
-- renders nothing, falling back to the city/state line it already shows.

alter table usau_events add column if not exists venue text;

comment on column usau_events.venue is
  'Venue name derived from usau_games.location by usau_derive_event_venue(). '
  'Null when games carry only a bare field number. Never scraped directly.';

-- Strip the trailing field designator off a game location, returning the
-- venue name — or null when nothing venue-like remains.
--
-- Immutable + no table access, so it is safe to call inline.
create or replace function usau_clean_venue(loc text)
returns text
language sql
immutable
parallel safe
set search_path to 'public'
as $$
  select nullif(
    btrim(
      regexp_replace(
        -- trailing "- 14", "#12", "Field 5", "Court 3", "4b"
        regexp_replace(
          loc,
          '\s*[-–—#:]?\s*(field|fld|court|pitch)?\s*#?\s*[0-9]+[a-z]?\s*$',
          '',
          'i'
        ),
        -- trailing lettered field designator: "Wainwright - W",
        -- "Reddan Soccer Park - F". Spaces around the dash are REQUIRED so
        -- venues whose real name contains a dash survive intact
        -- ("Devens - Rogers Field"), as do trailing words ("Robb Field").
        '\s+[-–—]\s+[A-Za-z]{1,2}$',
        ''
      )
    ),
    ''
  );
$$;

-- Whether a cleaned value is a real venue name rather than a field surface,
-- colour, or placeholder. Single letters and 1-3 char codes are pool/field
-- designators ("A", "D", "W"), not venues.
create or replace function usau_is_venue_name(v text)
returns boolean
language sql
immutable
parallel safe
set search_path to 'public'
as $$
  select v is not null
     and length(v) >= 4
     and v ~ '[A-Za-z]'
     -- placeholders, field surfaces, colours, and bare compass/division words
     and v !~* '^(tba|tbd|n/?a|turf|grass|dirt|sand|red|blue|green|white|black|gold|main|east|west|north|south|upper|lower|men''s|women''s|mixed|open|rec|home|away|stadium|indoor|outdoor|unknown|none)$'
     -- leading number = field designator, not a venue ("13-B", "6-West")
     and v !~ '^[0-9]'
     -- a bare generic noun is not a venue name
     and v !~* '^(field|fields|park|complex|courts?|sports?)$'
     -- short code + field number ("IMA 1")
     and v !~* '^[A-Z]{2,4}\s+[0-9]+$';
$$;

-- Recompute usau_events.venue for one event (or every event when null).
--
-- WRITE-PATH ONLY — call after ingesting games, never from a page render or
-- read RPC (app health rule #1: no expensive work on the read path).
create or replace function usau_derive_event_venue(target_event_id uuid default null)
returns integer
language plpgsql
set search_path to 'public'
as $$
declare
  updated integer;
begin
  with cleaned as (
    select g.event_id, usau_clean_venue(g.location) as v
    from usau_games g
    where g.location is not null
      and (target_event_id is null or g.event_id = target_event_id)
  ),
  kept as (
    select event_id, v from cleaned where usau_is_venue_name(v)
  ),
  ranked as (
    select
      event_id,
      v,
      row_number() over (
        -- majority vote; ties break on name so the result is deterministic
        partition by event_id order by count(*) desc, v
      ) as rk
    from kept
    group by event_id, v
  ),
  winner as (
    select event_id, v from ranked where rk = 1
  )
  update usau_events e
  set venue = w.v
  from winner w
  where e.id = w.event_id
    and e.venue is distinct from w.v;

  get diagnostics updated = row_count;
  return updated;
end;
$$;

-- Backfill every event.
select usau_derive_event_venue();

notify pgrst, 'reload schema';

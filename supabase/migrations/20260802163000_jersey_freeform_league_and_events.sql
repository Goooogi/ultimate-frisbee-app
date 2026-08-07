-- Jersey marketplace — make league / team / tournament FREE-FORM.
--
-- WHY: the original schema assumed every jersey maps to a league we have data
-- for (ufa/usau/pul/wul/wfdf) and every tournament to a row in usau_events.
-- That silently excludes most of the world — European club teams, Japanese and
-- Australian leagues, college intramural, hat tournaments, alumni teams, and
-- one-off jerseys with no league at all. Ultimate is international and this is
-- a global community board; our data coverage should be a CONVENIENCE, never a
-- gate on what someone is allowed to post.
--
-- SHAPE AFTER THIS MIGRATION — every target field is optional free text, with
-- an OPTIONAL structured reference layered on top when we happen to know the
-- entity:
--   league_name  text  -- "Windmill", "Tokyo Open", "UFA", anything
--   team_name    text  -- always free text; team_id/league only set when picked
--                         from our data, which lights up the logo + link
--   player_name  text  -- already free text (WFDF players are name-keyed)
--   event_name   text  -- free-text tournament; usau_event_id set when matched
--
-- The picker still offers our teams/events first (better UX, real logos, and
-- it keeps the data joinable) — it just no longer refuses everything else.

-- ── 1) league: drop the closed CHECK, add a free-text display name ──────────
alter table public.jersey_listings drop constraint if exists jersey_listings_league_check;
alter table public.jersey_wants    drop constraint if exists jersey_wants_league_check;

-- `league` is now the STRUCTURED slug (only set when the team came from our
-- data, so the logo/link resolvers keep working). `league_name` is what the
-- user typed/sees. Either may be null.
alter table public.jersey_listings
  add column if not exists league_name text
    check (league_name is null or char_length(league_name) <= 80);
alter table public.jersey_wants
  add column if not exists league_name text
    check (league_name is null or char_length(league_name) <= 80);

-- Keep the slug column constrained to values our resolvers understand — a
-- garbage slug would break logo lookup. Free text goes in league_name instead.
do $$ begin
  alter table public.jersey_listings add constraint jersey_listings_league_slug_known
    check (league is null or league in ('ufa','usau','pul','wul','wfdf'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.jersey_wants add constraint jersey_wants_league_slug_known
    check (league is null or league in ('ufa','usau','pul','wul','wfdf'));
exception when duplicate_object then null; end $$;

-- Backfill league_name from the slug so existing rows read sensibly.
update public.jersey_listings
  set league_name = upper(league) where league is not null and league_name is null;
update public.jersey_wants
  set league_name = upper(league) where league is not null and league_name is null;

-- ── 2) wants: a free-text team/league now counts as a valid target ──────────
-- The old constraint demanded team_id / player_name / year, which would reject
-- "any Clapham jersey" (a team we have no id for).
alter table public.jersey_wants drop constraint if exists jersey_wants_has_a_target;
do $$ begin
  alter table public.jersey_wants add constraint jersey_wants_has_a_target
    check (
      team_id is not null or team_name is not null or player_name is not null
      or year is not null or league_name is not null
    );
exception when duplicate_object then null; end $$;

-- ── 3) tournaments: free-text name, optional USAU link ─────────────────────
-- usau_event_id was NOT NULL, so a European tournament couldn't be tagged at
-- all. Now either side may carry the meaning: event_name always, usau_event_id
-- only when the user picked a real event from our calendar.
alter table public.jersey_listing_events
  alter column usau_event_id drop not null;

alter table public.jersey_listing_events
  add column if not exists event_name text
    check (event_name is null or char_length(event_name) <= 160);

-- Optional free-text dates for events we don't have. Kept as plain date columns
-- (not a range) so "sort by soonest" stays trivial.
alter table public.jersey_listing_events
  add column if not exists event_starts_on date;

do $$ begin
  alter table public.jersey_listing_events add constraint jersey_listing_events_has_identity
    check (usau_event_id is not null or event_name is not null);
exception when duplicate_object then null; end $$;

-- The old uniqueness assumed a non-null usau_event_id. Re-do it so free-text
-- events dedupe on name, and structured ones still dedupe on id.
drop index if exists public.jersey_listing_events_want_uniq;
alter table public.jersey_listing_events
  drop constraint if exists jersey_listing_events_listing_id_usau_event_id_key;

create unique index if not exists jersey_listing_events_listing_usau_uniq
  on public.jersey_listing_events (listing_id, usau_event_id)
  where listing_id is not null and usau_event_id is not null;
create unique index if not exists jersey_listing_events_want_usau_uniq
  on public.jersey_listing_events (want_id, usau_event_id)
  where want_id is not null and usau_event_id is not null;
create unique index if not exists jersey_listing_events_listing_name_uniq
  on public.jersey_listing_events (listing_id, lower(event_name))
  where listing_id is not null and event_name is not null and usau_event_id is null;
create unique index if not exists jersey_listing_events_want_name_uniq
  on public.jersey_listing_events (want_id, lower(event_name))
  where want_id is not null and event_name is not null and usau_event_id is null;

-- Free-text event names are user content → same profanity floor as everything
-- else, so a slur can't be smuggled in via a tournament tag.
create or replace function public.jersey_events_reject_profanity()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if not public.jersey_text_is_clean(new.event_name) then
    raise exception 'That text isn''t allowed. Please reword it.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists jersey_listing_events_profanity on public.jersey_listing_events;
create trigger jersey_listing_events_profanity
before insert or update of event_name on public.jersey_listing_events
for each row execute function public.jersey_events_reject_profanity();

-- Same floor on the free-text league/team names.
create or replace function public.jersey_listings_reject_profanity_v2()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if not public.jersey_text_is_clean(new.title)
     or not public.jersey_text_is_clean(new.description)
     or not public.jersey_text_is_clean(new.team_name)
     or not public.jersey_text_is_clean(new.league_name)
     or not public.jersey_text_is_clean(new.player_name) then
    raise exception 'That text isn''t allowed. Please reword it.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists jersey_listings_profanity on public.jersey_listings;
create trigger jersey_listings_profanity
before insert or update of title, description, team_name, league_name, player_name
on public.jersey_listings
for each row execute function public.jersey_listings_reject_profanity_v2();

create or replace function public.jersey_wants_reject_profanity_v2()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if not public.jersey_text_is_clean(new.note)
     or not public.jersey_text_is_clean(new.team_name)
     or not public.jersey_text_is_clean(new.league_name)
     or not public.jersey_text_is_clean(new.player_name) then
    raise exception 'That text isn''t allowed. Please reword it.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists jersey_wants_profanity on public.jersey_wants;
create trigger jersey_wants_profanity
before insert or update of note, team_name, league_name, player_name
on public.jersey_wants
for each row execute function public.jersey_wants_reject_profanity_v2();

-- Browse/filter by free-text league or team.
create index if not exists jersey_listings_league_name_trgm_idx
  on public.jersey_listings using gin (lower(league_name) gin_trgm_ops);
create index if not exists jersey_listings_team_name_trgm_idx
  on public.jersey_listings using gin (lower(team_name) gin_trgm_ops);
create index if not exists jersey_wants_team_name_trgm_idx
  on public.jersey_wants using gin (lower(team_name) gin_trgm_ops);

notify pgrst, 'reload schema';

-- ── 4) country (added 2026-08-02) ───────────────────────────────────────────
-- `state` stays for US/CA-style subdivisions; country makes "Copenhagen,
-- Denmark" render correctly instead of jamming the country into the state slot.
-- Nullable with NO default — we never assert a country the user didn't pick.
alter table public.jersey_listings
  add column if not exists country text
    check (country is null or char_length(country) <= 60);
alter table public.jersey_wants
  add column if not exists country text
    check (country is null or char_length(country) <= 60);

create index if not exists jersey_listings_country_idx
  on public.jersey_listings (country) where status = 'active';
create index if not exists jersey_wants_country_idx
  on public.jersey_wants (country) where status = 'active';

notify pgrst, 'reload schema';

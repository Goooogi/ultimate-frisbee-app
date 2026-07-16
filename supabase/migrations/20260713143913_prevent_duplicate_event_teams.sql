-- Structural backstop against duplicate teams at one event.
--
-- USAU can issue a DIFFERENT EventTeamId for the same squad across scrapes
-- (single-team re-registration OR whole-event dual-pipeline ingestion), which
-- historically created a SECOND usau_teams row + participation for the same
-- team at one event. The scraper's resolveTeam() now name-matches within an
-- event and adopts the existing row, so this trigger should never fire under
-- normal operation — it's the DB-level guarantee for any other write path
-- (raw REST, ultirzr ingest, manual inserts) so the bug is structurally
-- impossible, not merely avoided in one code path.
--
-- Identity within an event = (lower(name), gender_division, competition_level).
-- That tuple is unique per event on USAU (a name+division can't appear twice in
-- one tournament), so rejecting a second participation for it is always correct.

create or replace function reject_duplicate_event_team()
returns trigger as $$
declare
  v_name text;
  v_gender text;
  v_level text;
  v_existing uuid;
begin
  select lower(name), gender_division::text, competition_level::text
    into v_name, v_gender, v_level
  from usau_teams where id = NEW.team_id;

  -- Is another (different) team of the same identity already in this event?
  select et.team_id into v_existing
  from usau_event_teams et
  join usau_teams t on t.id = et.team_id
  where et.event_id = NEW.event_id
    and et.team_id <> NEW.team_id
    and lower(t.name) = v_name
    and t.gender_division::text is not distinct from v_gender
    and t.competition_level::text is not distinct from v_level
  limit 1;

  if v_existing is not null then
    raise exception using
      errcode = 'unique_violation',
      message = format(
        'duplicate team at event: "%s" (%s/%s) already participates in event %s as team %s; ' ||
        'resolve to that team row instead of creating a new one',
        v_name, coalesce(v_gender,'?'), coalesce(v_level,'?'), NEW.event_id, v_existing
      );
  end if;

  return NEW;
end $$ language plpgsql;

drop trigger if exists trg_reject_duplicate_event_team on usau_event_teams;
create trigger trg_reject_duplicate_event_team
  before insert on usau_event_teams
  for each row execute function reject_duplicate_event_team();
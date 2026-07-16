
-- Add template_key to usau_events: links an event row to a flagship-event family
-- (e.g. 'club_nationals', 'great_lakes_regional'). NULL = not a flagship.
alter table public.usau_events
  add column if not exists template_key text;

create index if not exists idx_usau_events_template_key_season
  on public.usau_events (template_key, season);

-- Add match_rules to usau_event_templates: JSON classifier rule shape:
--   {
--     "keywords": ["club","national"],   -- all must be tokens in event name
--     "anyKeywords": ["regional"],       -- optional: any one must be present
--     "excludeKeywords": ["college"],    -- optional: NONE may be present
--     "monthMin": 9,                     -- 1-12; event start_date must fall here
--     "monthMax": 11
--   }
alter table public.usau_event_templates
  add column if not exists match_rules jsonb;

-- Add a flagship flag so we can quickly query the recurring marquee events.
alter table public.usau_event_templates
  add column if not exists is_flagship boolean default false;

-- Clean up stale rows that were never used in production. The 15 existing
-- Men's-Club slug-guess templates are replaced by the keyword classifiers
-- in the data migration that follows.
delete from public.usau_event_templates;

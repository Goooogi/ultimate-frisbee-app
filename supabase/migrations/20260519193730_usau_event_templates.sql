-- Catalog of event "archetypes" — repeatable series that happen every
-- year (Pro Championships, Pro-Elite Challenge, Sectionals, etc.).
--
-- Each row stores:
--   - slug_pattern: a "{year}-..." template we can substitute and probe.
--     Use it for events whose slug only changes by year.
--   - known_slugs: a jsonb {year: slug} map of verified slugs. Use this
--     for events whose slug doesn't follow a strict pattern (Sectionals
--     vary year to year; Nationals naming changes).
--   - tried_slugs: a jsonb {year: {slug, status_code, last_tried_at}}
--     map of what we've probed and learned, so we don't waste calls
--     re-probing known 404s.
--
-- Lookup order at probe time:
--   1. known_slugs[year] → use that exact slug
--   2. else substitute slug_pattern with {year} and probe
--   3. record the result in tried_slugs

create table if not exists public.usau_event_templates (
  id uuid primary key default gen_random_uuid(),
  -- Logical key, like 'pro_championships'. Stable, snake_case, no spaces.
  key text not null unique check (key ~ '^[a-z][a-z0-9_]*$'),
  display_name text not null,
  -- e.g. 'CLUB', 'COLLEGE_D1'. Mostly informational for now.
  competition_level public.usau_competition_level not null default 'CLUB',
  -- 'Men' / 'Mixed' / 'Women' / null (= all).
  gender_division public.usau_gender_division,
  -- e.g. '{year}-USAU-Pro-Championships'. Nullable for events with no
  -- predictable pattern (in which case known_slugs carries everything).
  slug_pattern text,
  known_slugs jsonb not null default '{}'::jsonb,
  tried_slugs jsonb not null default '{}'::jsonb,
  -- Years we never want to probe even via pattern (e.g. event didn't exist).
  -- Stored as an int[] so we can drop quick checks.
  skip_years int[] not null default array[]::int[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists usau_event_templates_key_idx on public.usau_event_templates(key);

drop trigger if exists usau_event_templates_updated_at on public.usau_event_templates;
create trigger usau_event_templates_updated_at
  before update on public.usau_event_templates
  for each row execute function public.set_updated_at();

-- RLS: world-readable (matches the other usau_* tables), writes via service role.
alter table public.usau_event_templates enable row level security;
create policy "usau_event_templates_select_public"
  on public.usau_event_templates for select to anon, authenticated using (true);

-- ─── Seed: the 5 events we've already ingested ───────────────────────
-- known_slugs is what we have verified at this exact slug. slug_pattern
-- lets us probe other years.
insert into public.usau_event_templates (key, display_name, competition_level, gender_division, slug_pattern, known_slugs)
values
  ('pro_championships', 'USAU Pro Championships', 'CLUB', 'Men',
   '{year}-USAU-Pro-Championships',
   '{"2025":"2025-USAU-Pro-Championships"}'::jsonb),
  ('pro_elite_challenge_east', 'Pro-Elite Challenge East', 'CLUB', 'Men',
   '{year}-Pro-Elite-Challenge-East',
   '{"2025":"2025-Pro-Elite-Challenge-East"}'::jsonb),
  ('pro_elite_challenge_west', 'Pro-Elite Challenge West', 'CLUB', 'Men',
   '{year}-Pro-Elite-Challenge-West',
   '{"2025":"2025-Pro-Elite-Challenge-West"}'::jsonb),
  ('select_flight_invite_east', 'Select Flight Invite East', 'CLUB', 'Men',
   '{year}-Select-Flight-Invite-East',
   '{"2025":"2025-Select-Flight-Invite-East"}'::jsonb),
  ('elite_select_challenge', 'Elite-Select Challenge', 'CLUB', 'Men',
   '{year}-Elite-Select-Challenge',
   '{"2025":"2025-Elite-Select-Challenge"}'::jsonb)
on conflict (key) do nothing;

comment on table public.usau_event_templates is
  'Catalog of repeatable event series. Function discover-events uses slug_pattern + known_slugs to probe past/future years without manual rework.';

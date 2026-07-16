-- Seed templates for the 2025 Open Club series + New York Minute.
-- Each row carries a slug_pattern (for future-year automation) and the
-- verified 2025 slug. Regional patterns assume USAU keeps the same
-- "{year}-{Region}-Mens-Regional-Championship" convention.

insert into public.usau_event_templates
  (key, display_name, competition_level, gender_division, slug_pattern, known_slugs)
values
  ('club_nationals', 'USA Ultimate Club Nationals', 'CLUB', 'Men',
   '{year}-USA-Ultimate-Club-Nationals',
   '{"2025":"2025-USA-Ultimate-Club-Nationals"}'::jsonb),

  ('new_york_minute', 'The New York Minute', 'CLUB', 'Men',
   'The-New-York-Minute-{year}',
   '{"2025":"The-New-York-Minute-2025"}'::jsonb),

  ('great_lakes_mens_regional', 'Great Lakes Mens Regional Championship', 'CLUB', 'Men',
   '{year}-Great-Lakes-Mens-Regional-Championship',
   '{"2025":"2025-Great-Lakes-Mens-Regional-Championship"}'::jsonb),

  ('mid_atlantic_mens_regional', 'Mid-Atlantic Mens Regional Championship', 'CLUB', 'Men',
   '{year}-Mid-Atlantic-Mens-Regional-Championship',
   '{"2025":"2025-Mid-Atlantic-Mens-Regional-Championship"}'::jsonb),

  ('north_central_mens_regional', 'North Central Mens Regional Championship', 'CLUB', 'Men',
   '{year}-North-Central-Mens-Regional-Championship',
   '{"2025":"2025-North-Central-Mens-Regional-Championship"}'::jsonb),

  ('northeast_mens_regional', 'Northeast Mens Regional Championship', 'CLUB', 'Men',
   '{year}-Northeast-Mens-Regional-Championship',
   '{"2025":"2025-Northeast-Mens-Regional-Championship"}'::jsonb),

  ('northwest_mens_regional', 'Northwest Mens Regional Championship', 'CLUB', 'Men',
   '{year}-Northwest-Mens-Regional-Championship',
   '{"2025":"2025-Northwest-Mens-Regional-Championship"}'::jsonb),

  ('south_central_mens_regional', 'South Central Mens Regional Championship', 'CLUB', 'Men',
   '{year}-South-Central-Mens-Regional-Championship',
   '{"2025":"2025-South-Central-Mens-Regional-Championship"}'::jsonb),

  ('southeast_mens_regional', 'Southeast Mens Regional Championship', 'CLUB', 'Men',
   '{year}-Southeast-Mens-Regional-Championship',
   '{"2025":"2025-Southeast-Mens-Regional-Championship"}'::jsonb),

  ('southwest_mens_regional', 'Southwest Mens Regional Championship', 'CLUB', 'Men',
   '{year}-Southwest-Mens-Regional-Championship',
   '{"2025":"2025-Southwest-Mens-Regional-Championship"}'::jsonb)
on conflict (key) do nothing;

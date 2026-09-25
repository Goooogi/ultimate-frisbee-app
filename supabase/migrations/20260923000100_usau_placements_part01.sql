-- USAU per-event final placements — repair + fill, part 01 of 12.
--
-- The 2026-07-20 one-shot derivePlacements() backfill (Feature Backlog #18)
-- stored misread brackets, game-to-go losers kept 2nd, and ties that a later
-- game had settled; nothing derived placements after it. Regenerated with the
-- fixed algorithm by scripts/derive-usau-placements.ts on 2026-09-23T15:15:42.799Z —
-- do not hand-edit, re-run it.
--
-- This part: 210 events · fill 252 · correct 179 · clear 169 (conflict 21, contradicted 110, unsupported 38).
-- EXPECTED ROWS: 600. A row only updates while final_placement still holds
-- the value it was generated from ("old" below); the DO block raises, rolling
-- this part back, unless exactly 600 rows match. Regenerate instead of forcing it.
-- All 12 parts: 1469 events · fill 7901 · correct 428 · clear 247 (conflict 31, contradicted 127, unsupported 89).
--
-- Back up first (once, before part 01):
--   create table public.usau_event_teams_placement_backup_20260923 as
--     select event_id, team_id, final_placement from public.usau_event_teams;
--   alter table public.usau_event_teams_placement_backup_20260923 enable row level security;
--   revoke all on public.usau_event_teams_placement_backup_20260923 from anon, authenticated;
-- Restore from it:
--   update public.usau_event_teams et set final_placement = b.final_placement
--     from public.usau_event_teams_placement_backup_20260923 b
--    where et.event_id = b.event_id and et.team_id = b.team_id
--      and et.final_placement is distinct from b.final_placement;
--
-- Events (evaluated through PostgREST, end_date vs 2026-09-23 UTC); settled ones are
-- re-derived, unsettled ones only lose stored duplicates:
--   select e.id,
--          not exists (select 1 from usau_games g
--                      where g.event_id = e.id and g.status in ('scheduled', 'in_progress')
--                        and g.bracket_name !~* '^\s*([^·]*·\s*)?pool') as settled
--   from usau_events e
--   where e.end_date < current_date
--     and exists (select 1 from usau_event_teams et where et.event_id = e.id)
--     and exists (select 1 from usau_games g
--                 where g.event_id = e.id and g.status = 'final' and g.bracket_name !~* '^\s*([^·]*·\s*)?pool')

DO $migration$
DECLARE
  v_expected constant int := 600;
  v_updated int;
BEGIN
  update public.usau_event_teams et
     set final_placement = v.new_place
    from (values
      -- CLUB · 2014 · Club Terminus (club-terminus) · ended 2014-07-27
      ('c644ca05-d4db-481b-b373-4cdecdce76b0'::uuid, '505299d2-b5de-43d4-aae9-5fafc727dbeb'::uuid, null::int, 3::int),
      ('c644ca05-d4db-481b-b373-4cdecdce76b0', '31cdab74-f112-4d7d-a08b-433ce67328f4', null, 4),
      ('c644ca05-d4db-481b-b373-4cdecdce76b0', '986b4603-300b-4d25-aaff-7ac9650d5977', 2, null), -- clear-unsupported
      -- CLUB · 2014 · Motown Throwdown (motown-throwdown) · ended 2014-07-27
      ('4bbfff9b-cc57-43f1-9576-d1fef14e08a6', '90df8319-3eda-44e4-af3b-3f9b6f04a772', null, 19),
      -- CLUB · 2014 · White Mountain Mixed (white-mountain-mixed) · ended 2014-08-03
      ('62e9390e-46eb-45f3-beac-3a67b0d4d73d', '7dbb126c-7fef-400b-94cb-09e97c763888', null, 7),
      -- CLUB · 2014 · Cooler Classic (cooler-classic) · ended 2014-08-17
      ('240360e1-8f6c-45f2-b19c-71ef9cf12e71', '7047bd6f-0ee3-4ad9-aab2-39ebc947247a', null, 3),
      ('240360e1-8f6c-45f2-b19c-71ef9cf12e71', 'a9c9b030-0883-49f8-90c8-75313b08ae12', null, 4),
      ('240360e1-8f6c-45f2-b19c-71ef9cf12e71', '29a2e859-49af-4de4-889e-68a02b66c1aa', 2, null), -- clear-unsupported
      ('240360e1-8f6c-45f2-b19c-71ef9cf12e71', '619aebda-1634-424d-a2e5-03c23e5554cc', 3, null), -- clear-unsupported
      -- CLUB · 2014 · Semper Liberi (semper-liberi) · ended 2014-08-17
      ('05da7e2b-dbd8-4edc-9d76-798984c7f735', '1d1f90c5-ecce-4c54-970d-015436740baf', 3, null), -- clear-unsupported
      ('05da7e2b-dbd8-4edc-9d76-798984c7f735', '43fd9b7e-3cc7-40a2-a49e-d076af64b17f', 2, null), -- clear-unsupported
      -- CLUB · 2014 · Nor Cal Mixed Sectionals (nor-cal-mixed-sectionals) · ended 2014-09-07
      ('aa7b3b01-6e85-4b6c-9fac-74c1278fbc5d', '04f7af5b-4306-4c21-903b-8f5151f0b6e3', 4, null), -- clear-contradicted
      ('aa7b3b01-6e85-4b6c-9fac-74c1278fbc5d', '5e55a685-dd7f-40c8-9491-f67b701ad067', 6, null), -- clear-contradicted
      ('aa7b3b01-6e85-4b6c-9fac-74c1278fbc5d', '757f0550-3d2f-43d2-82d9-de64c2e41bc5', 14, null), -- clear-contradicted
      ('aa7b3b01-6e85-4b6c-9fac-74c1278fbc5d', '9575cdb4-55b5-4dbd-abff-04a5f1b3323c', 7, null), -- clear-contradicted
      ('aa7b3b01-6e85-4b6c-9fac-74c1278fbc5d', 'b23c1803-9cdb-4319-8dd3-67fd89602cbc', 13, null), -- clear-contradicted
      ('aa7b3b01-6e85-4b6c-9fac-74c1278fbc5d', 'c18c1167-e135-4897-824c-3b609fd7297a', 5, null), -- clear-contradicted
      ('aa7b3b01-6e85-4b6c-9fac-74c1278fbc5d', 'da574ef7-ba96-4a22-b686-7bce63dafa19', 3, null), -- clear-contradicted
      ('aa7b3b01-6e85-4b6c-9fac-74c1278fbc5d', 'f08a2a69-4376-4d01-8a44-97e4f8603be8', 2, null), -- clear-contradicted
      -- CLUB · 2014 · Oregon Mixed Sectionals (oregon-mixed-sectionals) · ended 2014-09-07
      ('8bc8dc2b-6fff-4931-943e-746c5947307f', '042d5bba-15f3-4077-bc6c-a915f9287eb1', 3, null), -- clear-contradicted
      ('8bc8dc2b-6fff-4931-943e-746c5947307f', '26fc9d3a-dc85-4c96-96d9-af7db8ca3e37', 8, null), -- clear-contradicted
      ('8bc8dc2b-6fff-4931-943e-746c5947307f', '750d3e4b-a83c-4a55-8741-551cd8674373', 5, null), -- clear-contradicted
      ('8bc8dc2b-6fff-4931-943e-746c5947307f', '7fb1ee2f-3c69-47ee-be55-db55196bd005', 5, null), -- clear-contradicted
      ('8bc8dc2b-6fff-4931-943e-746c5947307f', 'b04803fd-70f0-475e-8bfc-5a8e383d3b1a', 4, null), -- clear-contradicted
      ('8bc8dc2b-6fff-4931-943e-746c5947307f', 'b189cfab-c946-49a6-a417-5de586c9c478', 1, null), -- clear-contradicted
      ('8bc8dc2b-6fff-4931-943e-746c5947307f', 'e9b6b966-71db-4495-b025-7e651361a06b', 4, null), -- clear-contradicted
      ('8bc8dc2b-6fff-4931-943e-746c5947307f', 'ef02bb71-6e21-4f1b-8b7a-8cdff72a729d', 2, null), -- clear-contradicted
      -- CLUB · 2014 · Rocky Mountain Club Sectionals (rocky-mountain-club-sectionals) · ended 2014-09-07
      ('04647356-9732-46dc-99d4-f350a9cf2d75', '7b098efd-8c80-463e-833f-0265e299b5cb', 2, 3), -- correct
      ('04647356-9732-46dc-99d4-f350a9cf2d75', 'c827b687-48db-4887-8145-8aaf8837a6f2', 3, 4), -- correct
      -- CLUB · 2014 · So Cal Mixed Sectionals (so-cal-mixed-sectionals) · ended 2014-09-07
      ('031b1225-3261-4821-b386-9a03f38383d2', '0405d2f0-923f-4236-8f8d-a4a501cac582', 2, null), -- clear-contradicted
      ('031b1225-3261-4821-b386-9a03f38383d2', '0ddccf3f-a4d0-4bec-bc10-20656a6077dc', 8, null), -- clear-contradicted
      ('031b1225-3261-4821-b386-9a03f38383d2', '1241e7c6-beba-45d1-b5be-fd43b76ab1fd', 10, null), -- clear-contradicted
      ('031b1225-3261-4821-b386-9a03f38383d2', '4511e409-35e2-424b-80b1-5c5050aa8dd6', 7, null), -- clear-contradicted
      ('031b1225-3261-4821-b386-9a03f38383d2', '56270c37-4cbb-4b4a-8e34-6ea86d3e2537', 5, null), -- clear-contradicted
      ('031b1225-3261-4821-b386-9a03f38383d2', '65c7aee3-2205-4802-a451-52c1b587d638', 9, null), -- clear-contradicted
      ('031b1225-3261-4821-b386-9a03f38383d2', '6a4839dc-97f2-4bd4-8013-23de5913c219', 6, null), -- clear-contradicted
      ('031b1225-3261-4821-b386-9a03f38383d2', 'a7b2fbcb-ea17-492f-b64e-d4682044ca26', 3, null), -- clear-contradicted
      -- CLUB · 2014 · Upstate New York Mixed Sectionals (upstate-new-york-mixed-sectionals) · ended 2014-09-07
      ('ffd3680d-9cad-4353-a643-b2967d07ab29', '2265e6f8-fd4d-4ef5-965a-0dcec6252b39', 3, null), -- clear-contradicted
      ('ffd3680d-9cad-4353-a643-b2967d07ab29', '376200fc-681e-4e74-861b-4093724ab367', 1, null), -- clear-contradicted
      ('ffd3680d-9cad-4353-a643-b2967d07ab29', '410f2295-c380-4665-99bc-131c46218efc', 2, null), -- clear-contradicted
      ('ffd3680d-9cad-4353-a643-b2967d07ab29', '6611ec54-abf7-469d-939d-aa702b3c5e03', 2, null), -- clear-contradicted
      ('ffd3680d-9cad-4353-a643-b2967d07ab29', '84844fae-0775-46a9-9da7-ed5f8dd51bf3', 6, null), -- clear-contradicted
      ('ffd3680d-9cad-4353-a643-b2967d07ab29', '8d811cbe-2964-4a58-87ef-ce4fbf36ce52', 3, null), -- clear-contradicted
      ('ffd3680d-9cad-4353-a643-b2967d07ab29', 'a6d4e5a2-4f96-4e14-a29a-2e604260a4e4', 4, null), -- clear-contradicted
      -- CLUB · 2014 · Washington Mixed Sectionals (washington-mixed-sectionals) · ended 2014-09-07
      ('38b70a11-d4f8-416b-9528-357046d168e1', 'ffb0bc4f-8f86-470b-b8e5-d5fac5041b2b', 2, 3), -- correct
      ('38b70a11-d4f8-416b-9528-357046d168e1', 'c787ce6e-923d-4147-9659-cc7dd8c4b022', null, 6),
      -- CLUB · 2014 · West Plains Mixed Sectionals (west-plains-mixed-sectionals) · ended 2014-09-07
      ('9e1a1f65-df1f-436c-bb24-431b2bf8ba1e', '7047bd6f-0ee3-4ad9-aab2-39ebc947247a', 1, 2), -- correct
      ('9e1a1f65-df1f-436c-bb24-431b2bf8ba1e', '208ed93e-b303-4572-92b8-8a32c6c6f62b', 2, 3), -- correct
      ('9e1a1f65-df1f-436c-bb24-431b2bf8ba1e', '3572b84d-451c-4831-8b88-e2e7678cc27b', null, 4),
      ('9e1a1f65-df1f-436c-bb24-431b2bf8ba1e', 'db99a7e1-b90e-4cda-8eb5-e873b5dcf5ca', null, 5),
      ('9e1a1f65-df1f-436c-bb24-431b2bf8ba1e', '6fb0d7c8-12e3-43b6-9c54-0f7401405e2f', null, 6),
      ('9e1a1f65-df1f-436c-bb24-431b2bf8ba1e', '08dfd24a-c351-40be-9edd-4800cbcf6dbf', null, 7),
      -- CLUB · 2014 · Founders Mixed Sectionals (founders-mixed-sectionals) · ended 2014-09-14
      ('597d4ec0-8b7a-433b-9e68-eccf7e67e14b', '281d52da-b98f-4fc6-96b8-07c6f8e3bf37', 3, null), -- clear-contradicted
      ('597d4ec0-8b7a-433b-9e68-eccf7e67e14b', '46645dd2-13c2-46ad-b399-b5c354529658', 7, null), -- clear-contradicted
      ('597d4ec0-8b7a-433b-9e68-eccf7e67e14b', '732c9cbd-6d1a-4f82-8953-22e00409a05c', 4, null), -- clear-contradicted
      ('597d4ec0-8b7a-433b-9e68-eccf7e67e14b', '960d8407-308a-451f-b551-3b1dbc50914a', 6, null), -- clear-contradicted
      ('597d4ec0-8b7a-433b-9e68-eccf7e67e14b', '969673b5-b642-4ed3-af91-ad3601b34a7b', 9, null), -- clear-contradicted
      ('597d4ec0-8b7a-433b-9e68-eccf7e67e14b', 'ba9d55c9-56e5-4cef-a248-bd6f6d2b6134', 5, null), -- clear-contradicted
      ('597d4ec0-8b7a-433b-9e68-eccf7e67e14b', 'ce2cd808-762f-4b12-918a-fd05c824e309', 8, null), -- clear-contradicted
      ('597d4ec0-8b7a-433b-9e68-eccf7e67e14b', 'e679cd1c-58da-41c0-8baf-a64295884c9e', 2, null), -- clear-contradicted
      -- CLUB · 2014 · North Carolina Mixed Sectionals (north-carolina-mixed-sectionals) · ended 2014-09-14
      ('5de60ac7-8e97-4e81-93e4-a39756b7c97e', 'bf6af4fd-05e2-4ce8-920b-50cc14ca7068', null, 4),
      ('5de60ac7-8e97-4e81-93e4-a39756b7c97e', '123afc8e-8d4c-4aac-ad23-7bb7bac25620', null, 5),
      -- CLUB · 2014 · North Central Mixed Regionals (north-central-mixed-regionals) · ended 2014-09-21
      ('15f3cc73-98f2-408f-a75f-85353eed6ac3', '208ed93e-b303-4572-92b8-8a32c6c6f62b', 9, null), -- clear-contradicted
      ('15f3cc73-98f2-408f-a75f-85353eed6ac3', '3956777e-4076-4d60-bf63-66fd5651059f', 11, null), -- clear-contradicted
      ('15f3cc73-98f2-408f-a75f-85353eed6ac3', '7047bd6f-0ee3-4ad9-aab2-39ebc947247a', 4, null), -- clear-contradicted
      ('15f3cc73-98f2-408f-a75f-85353eed6ac3', 'a58fa913-3115-4801-bcc7-cb03a4fa0a9b', 3, null), -- clear-contradicted
      ('15f3cc73-98f2-408f-a75f-85353eed6ac3', 'a9c9b030-0883-49f8-90c8-75313b08ae12', 8, null), -- clear-contradicted
      ('15f3cc73-98f2-408f-a75f-85353eed6ac3', 'c6d8e4a6-4aed-4740-8125-8e9fddd5b5e9', 10, null), -- clear-contradicted
      ('15f3cc73-98f2-408f-a75f-85353eed6ac3', 'cc23f690-6d55-4a9d-9132-3c95d4375e80', 12, null), -- clear-contradicted
      ('15f3cc73-98f2-408f-a75f-85353eed6ac3', 'db99a7e1-b90e-4cda-8eb5-e873b5dcf5ca', 11, null), -- clear-contradicted
      ('15f3cc73-98f2-408f-a75f-85353eed6ac3', 'ef60b57a-01e3-478d-a498-f07958d5e9bf', 9, null), -- clear-contradicted
      -- CLUB · 2014 · Northwest Mixed Regionals (northwest-mixed-regionals) · ended 2014-09-21
      ('a14b53a4-444e-4c8a-9a12-cf1b548c5d1f', '042d5bba-15f3-4077-bc6c-a915f9287eb1', 5, null), -- clear-contradicted
      ('a14b53a4-444e-4c8a-9a12-cf1b548c5d1f', '2c0bb060-3ed5-4ff9-83eb-2c61023822b3', 3, null), -- clear-contradicted
      ('a14b53a4-444e-4c8a-9a12-cf1b548c5d1f', '77168365-ce97-4855-b422-d444e3ce6673', 6, null), -- clear-contradicted
      ('a14b53a4-444e-4c8a-9a12-cf1b548c5d1f', '89b31674-987e-4a43-9c61-9f5cc62d4ae6', 7, null), -- clear-contradicted
      ('a14b53a4-444e-4c8a-9a12-cf1b548c5d1f', '9d082039-d388-45d2-af1c-210a3c54d3be', 10, null), -- clear-contradicted
      ('a14b53a4-444e-4c8a-9a12-cf1b548c5d1f', 'b8c0b751-6c46-4e23-a1f6-3bb9046343ba', 4, null), -- clear-contradicted
      ('a14b53a4-444e-4c8a-9a12-cf1b548c5d1f', 'dbd2ca2c-ed08-4619-8f64-aa12750287a5', 10, null), -- clear-contradicted
      ('a14b53a4-444e-4c8a-9a12-cf1b548c5d1f', 'ef02bb71-6e21-4f1b-8b7a-8cdff72a729d', 9, null), -- clear-contradicted
      ('a14b53a4-444e-4c8a-9a12-cf1b548c5d1f', 'ffb0bc4f-8f86-470b-b8e5-d5fac5041b2b', 8, null), -- clear-contradicted
      -- CLUB · 2014 · Southwest Mixed Regionals (southwest-mixed-regionals) · ended 2014-09-21
      ('c7a47937-5dad-47aa-a8f2-0a87960c08ff', '5115ff6c-6d1f-445b-86de-f3cbe60ce78c', 5, null), -- clear-contradicted
      ('c7a47937-5dad-47aa-a8f2-0a87960c08ff', '56270c37-4cbb-4b4a-8e34-6ea86d3e2537', 13, null), -- clear-contradicted
      ('c7a47937-5dad-47aa-a8f2-0a87960c08ff', '5df46054-766a-4ec3-91ff-43d59a3925c5', 4, null), -- clear-contradicted
      ('c7a47937-5dad-47aa-a8f2-0a87960c08ff', 'a9536dff-c65b-43ed-a55e-6c77e89d4a0a', 3, null), -- clear-contradicted
      ('c7a47937-5dad-47aa-a8f2-0a87960c08ff', 'dcc84225-1bee-434f-9eea-578d74964f68', 2, null), -- clear-contradicted
      ('c7a47937-5dad-47aa-a8f2-0a87960c08ff', 'e112a4d6-0e05-4cb5-ad32-73839e143d0e', 14, null), -- clear-contradicted
      -- CLUB · 2014 · Mid-Atlantic Mixed Regionals (mid-atlantic-mixed-regionals) · ended 2014-09-28
      ('413fe8f6-23f8-43b7-a15b-41a9a243f4ae', '57546a17-5629-4dd6-85ee-7adc09b81878', 2, 4), -- correct
      ('413fe8f6-23f8-43b7-a15b-41a9a243f4ae', '281d52da-b98f-4fc6-96b8-07c6f8e3bf37', 2, null), -- clear-unsupported
      ('413fe8f6-23f8-43b7-a15b-41a9a243f4ae', '430af5aa-d93d-42d0-b18a-ab2ddd5d019d', 10, null), -- clear-unsupported
      ('413fe8f6-23f8-43b7-a15b-41a9a243f4ae', 'ba9d55c9-56e5-4cef-a248-bd6f6d2b6134', 6, null), -- clear-unsupported
      ('413fe8f6-23f8-43b7-a15b-41a9a243f4ae', 'e679cd1c-58da-41c0-8baf-a64295884c9e', 4, null), -- clear-unsupported
      -- CLUB · 2014 · Northeast Mixed Regionals (northeast-mixed-regionals) · ended 2014-09-28
      ('2fb2239d-66ee-4afc-819e-9e38dcf7a2db', '1fb4d105-5f6d-4504-aaa5-547c395e057e', 5, null), -- clear-contradicted
      ('2fb2239d-66ee-4afc-819e-9e38dcf7a2db', '2af1d1ee-fa4d-4eb1-a38e-fd3273fc8851', 6, null), -- clear-contradicted
      ('2fb2239d-66ee-4afc-819e-9e38dcf7a2db', '3750a858-34c5-4843-9caf-a6b482e8e1ce', 2, null), -- clear-contradicted
      ('2fb2239d-66ee-4afc-819e-9e38dcf7a2db', '3f1a4f47-2fe1-43c5-bf4b-4c68c5af1c8d', 5, null), -- clear-contradicted
      ('2fb2239d-66ee-4afc-819e-9e38dcf7a2db', '6611ec54-abf7-469d-939d-aa702b3c5e03', 12, null), -- clear-contradicted
      ('2fb2239d-66ee-4afc-819e-9e38dcf7a2db', '7f028c1a-fbfd-42c7-bd34-65d329cecb5c', 7, null), -- clear-contradicted
      ('2fb2239d-66ee-4afc-819e-9e38dcf7a2db', '8d811cbe-2964-4a58-87ef-ce4fbf36ce52', 14, null), -- clear-contradicted
      ('2fb2239d-66ee-4afc-819e-9e38dcf7a2db', 'b33587f4-abda-432c-bb90-b5a09f600fd5', 3, null), -- clear-contradicted
      ('2fb2239d-66ee-4afc-819e-9e38dcf7a2db', 'c080c2ba-d82d-4bdd-83c5-d2611f81b8be', 8, null), -- clear-contradicted
      ('2fb2239d-66ee-4afc-819e-9e38dcf7a2db', 'c723fd50-c3eb-4040-a535-74377a0f21e8', 7, null), -- clear-contradicted
      ('2fb2239d-66ee-4afc-819e-9e38dcf7a2db', 'e30c56ac-d182-4f42-8b41-da421b01982d', 8, null), -- clear-contradicted
      ('2fb2239d-66ee-4afc-819e-9e38dcf7a2db', 'e805dd43-5321-4e30-8094-64997fb36968', 4, null), -- clear-contradicted
      -- CLUB · 2014 · Southeast Mixed Regionals (southeast-mixed-regionals) · ended 2014-09-28
      ('f19ec419-a37c-471d-9c21-30d024e8e600', '06085052-5120-4734-af48-4ae9efbc1e4f', 12, null), -- clear-contradicted
      ('f19ec419-a37c-471d-9c21-30d024e8e600', '08c5a06c-7e1d-444b-8b06-ad08557d8642', 5, null), -- clear-contradicted
      ('f19ec419-a37c-471d-9c21-30d024e8e600', '123afc8e-8d4c-4aac-ad23-7bb7bac25620', 14, null), -- clear-contradicted
      ('f19ec419-a37c-471d-9c21-30d024e8e600', '20b595bb-f0ae-4607-a5ae-b103431a9c91', 3, null), -- clear-contradicted
      ('f19ec419-a37c-471d-9c21-30d024e8e600', '4438ec15-0160-4756-819c-2421093e3570', 7, null), -- clear-contradicted
      ('f19ec419-a37c-471d-9c21-30d024e8e600', '505299d2-b5de-43d4-aae9-5fafc727dbeb', 13, null), -- clear-contradicted
      ('f19ec419-a37c-471d-9c21-30d024e8e600', '5528a16d-cfb7-4478-9132-3eb0261916d5', 16, null), -- clear-contradicted
      ('f19ec419-a37c-471d-9c21-30d024e8e600', '5b63e4ea-93e7-4b7b-aafb-1b01168967c9', 6, null), -- clear-contradicted
      ('f19ec419-a37c-471d-9c21-30d024e8e600', '6e5f1982-97db-49fb-b736-676c0f3bbd21', 15, null), -- clear-contradicted
      ('f19ec419-a37c-471d-9c21-30d024e8e600', '6ea8d696-ee53-45ca-9e1a-95404b4f99c6', 4, null), -- clear-contradicted
      ('f19ec419-a37c-471d-9c21-30d024e8e600', '986b4603-300b-4d25-aaff-7ac9650d5977', 9, null), -- clear-contradicted
      ('f19ec419-a37c-471d-9c21-30d024e8e600', 'bf6af4fd-05e2-4ce8-920b-50cc14ca7068', 11, null), -- clear-contradicted
      ('f19ec419-a37c-471d-9c21-30d024e8e600', 'd06d93bc-a960-4c80-87a3-15c770b17a55', 8, null), -- clear-contradicted
      ('f19ec419-a37c-471d-9c21-30d024e8e600', 'e282ec13-b64c-4693-986c-68d485a6ae08', 10, null), -- clear-contradicted
      -- CLUB · 2015 · Cal States 2015 (cal-states-2015) · ended 2015-06-07
      ('070d1f2b-20aa-4b0d-86ee-65e943e99016', 'da574ef7-ba96-4a22-b686-7bce63dafa19', 2, 3), -- correct
      ('070d1f2b-20aa-4b0d-86ee-65e943e99016', 'c18c1167-e135-4897-824c-3b609fd7297a', 3, 4), -- correct
      ('070d1f2b-20aa-4b0d-86ee-65e943e99016', 'eebea432-f2c6-4a7d-83a8-06c46dfac9d1', 14, 15), -- correct
      ('070d1f2b-20aa-4b0d-86ee-65e943e99016', '4cf569b7-595b-43ee-a1a0-a14dc2980ac6', 14, 16), -- correct
      ('070d1f2b-20aa-4b0d-86ee-65e943e99016', 'e3cf1111-5243-4a56-8651-17337bb3b954', 16, 17), -- correct
      -- CLUB · 2015 · 2015 Fort Collins Solstice Ultimate Tournament (2015-fort-collins-solstice-ultimate-tournament) · ended 2015-06-21
      ('e2a98515-3db2-47f9-b3b6-e6899b9bfaf2', '7dfc1ade-91ee-4b17-ad1e-501518c82977', 10, 11), -- correct
      ('e2a98515-3db2-47f9-b3b6-e6899b9bfaf2', '921be20e-7c02-428d-9c56-b86c00accb28', null, 13),
      -- CLUB · 2015 · Revolution 2015 (revolution-2015) · ended 2015-07-19
      ('4017f5f1-85a8-4480-abd8-6c40c5d4a7be', 'da574ef7-ba96-4a22-b686-7bce63dafa19', null, 3),
      ('4017f5f1-85a8-4480-abd8-6c40c5d4a7be', '0d96e182-5694-45c3-86ae-2360212f011c', null, 4),
      -- CLUB · 2015 · Rocky Mountain Mixed Sectionals (rocky-mountain-mixed-sectionals) · ended 2015-08-30
      ('5841cfdc-6127-44da-a1b1-dcf4bfe7fc3a', '70c0824d-66d1-4bfd-9b40-35bae2c9d732', 7, null), -- clear-contradicted
      ('5841cfdc-6127-44da-a1b1-dcf4bfe7fc3a', '8a9c52ca-d31e-437e-a079-8447f4be4291', 3, null), -- clear-contradicted
      ('5841cfdc-6127-44da-a1b1-dcf4bfe7fc3a', '8aa9dcdc-9915-4bd7-9f86-15561db95278', 5, null), -- clear-contradicted
      ('5841cfdc-6127-44da-a1b1-dcf4bfe7fc3a', '921be20e-7c02-428d-9c56-b86c00accb28', 8, null), -- clear-contradicted
      ('5841cfdc-6127-44da-a1b1-dcf4bfe7fc3a', 'a7fd3983-ead4-4aa6-8486-cef2f81007df', 2, null), -- clear-contradicted
      ('5841cfdc-6127-44da-a1b1-dcf4bfe7fc3a', 'c7afb98f-8f20-4079-a2e3-6677e7e36999', 5, null), -- clear-contradicted
      ('5841cfdc-6127-44da-a1b1-dcf4bfe7fc3a', 'e64af073-3a7a-4811-83eb-c749b6f21762', 1, null), -- clear-contradicted
      ('5841cfdc-6127-44da-a1b1-dcf4bfe7fc3a', 'f29f832d-1e43-418c-89d7-cda75a79c6d2', 6, null), -- clear-contradicted
      ('5841cfdc-6127-44da-a1b1-dcf4bfe7fc3a', 'f852b598-6b97-4c74-aea4-54bcfee3fcd8', 6, null), -- clear-contradicted
      ('5841cfdc-6127-44da-a1b1-dcf4bfe7fc3a', 'fc54f7e8-25fd-47af-af4f-542c93e659f1', 3, null), -- clear-contradicted
      -- CLUB · 2015 · South Central Mixed Regionals (south-central-mixed-regionals) · ended 2015-09-13
      ('a1b9af5a-5c84-4ec7-9ba3-8d5d9aab55fd', '0110fbf0-166a-4343-ba1b-5ecfa46d152d', 7, null), -- clear-contradicted
      ('a1b9af5a-5c84-4ec7-9ba3-8d5d9aab55fd', '3522a667-0cba-479c-a373-79c5ab61743f', 10, null), -- clear-contradicted
      ('a1b9af5a-5c84-4ec7-9ba3-8d5d9aab55fd', '4e13e6da-ae9d-4345-837f-037471b2707d', 4, null), -- clear-contradicted
      ('a1b9af5a-5c84-4ec7-9ba3-8d5d9aab55fd', '7e12ebe4-e8ab-411e-aa83-e8f9bea90a8d', 11, null), -- clear-contradicted
      ('a1b9af5a-5c84-4ec7-9ba3-8d5d9aab55fd', 'a7fd3983-ead4-4aa6-8486-cef2f81007df', 8, null), -- clear-contradicted
      ('a1b9af5a-5c84-4ec7-9ba3-8d5d9aab55fd', 'd6cc1c28-85e0-4a9f-a2a0-f2d2e43ee4f5', 6, null), -- clear-contradicted
      ('a1b9af5a-5c84-4ec7-9ba3-8d5d9aab55fd', 'e07cc3b7-f4a0-45e1-b9a4-0b4b6a05a65c', 9, null), -- clear-contradicted
      ('a1b9af5a-5c84-4ec7-9ba3-8d5d9aab55fd', 'e64af073-3a7a-4811-83eb-c749b6f21762', 3, null), -- clear-contradicted
      ('a1b9af5a-5c84-4ec7-9ba3-8d5d9aab55fd', 'fc54f7e8-25fd-47af-af4f-542c93e659f1', 5, null), -- clear-contradicted
      -- CLUB · 2016 · Eugene Summer Solstice 2016 (eugene-summer-solstice-2016) · ended 2016-06-19
      ('44893bff-2d19-4924-84b3-4cc3edee2e68', '7fe2090d-56ee-4fbd-a4cb-2fd0cacaa00a', 3, 4), -- correct
      ('44893bff-2d19-4924-84b3-4cc3edee2e68', '99dfc504-df7c-47c9-b9b8-1e904a300e1e', 11, 12), -- correct
      -- CLUB · 2016 · Fort Collins Summer Solstice 2016 (fort-collins-summer-solstice-2016) · ended 2016-06-19
      ('c97320fb-9e0b-4c0e-9762-b1555d707350', '77168365-ce97-4855-b422-d444e3ce6673', 3, 4), -- correct
      ('c97320fb-9e0b-4c0e-9762-b1555d707350', 'f63fa86c-a316-477b-a60a-5da22a5a0b2f', 8, null), -- clear-contradicted
      -- CLUB · 2016 · SCINNY 2016 (scinny-2016) · ended 2016-06-26
      ('31ac08b2-bd32-453b-88f1-9ea58920ba1b', '93d46275-6f7c-4a62-82f0-bb5354d0f992', null, 9),
      -- CLUB · 2016 · Summer Glazed Daze 2016 (summer-glazed-daze-2016) · ended 2016-06-26
      ('39d7bca1-470e-4432-80c4-b00b206e4407', 'bf6af4fd-05e2-4ce8-920b-50cc14ca7068', 7, 8), -- correct
      -- CLUB · 2016 · US Open Ultimate Championships (us-open-ultimate-championships) · ended 2016-07-04
      ('e68b42b7-0c67-4373-bfcc-c531127a783f', '2881a46e-659e-4ce7-9219-63e13fbeefa9', null, 3),
      ('e68b42b7-0c67-4373-bfcc-c531127a783f', '6e54aec9-5ece-4f60-851a-22c857812907', null, 3),
      ('e68b42b7-0c67-4373-bfcc-c531127a783f', '3b46ad6e-7954-40fb-9460-4f25760567f3', null, 9),
      ('e68b42b7-0c67-4373-bfcc-c531127a783f', '988ceff6-2deb-4753-8de7-710737f42326', null, 10),
      -- CLUB · 2016 · Revolution 2016 (revolution-2016) · ended 2016-07-24 · unfinished bracket: duplicates cleared only
      ('ebb1c9ba-16dd-4d65-a50b-438ce41c9594', '2c0bb060-3ed5-4ff9-83eb-2c61023822b3', 2, null), -- clear-conflict
      ('ebb1c9ba-16dd-4d65-a50b-438ce41c9594', '51024f47-fbe1-4ea8-bb28-dec6ffec3c40', 4, null), -- clear-conflict
      ('ebb1c9ba-16dd-4d65-a50b-438ce41c9594', '77168365-ce97-4855-b422-d444e3ce6673', 4, null), -- clear-conflict
      ('ebb1c9ba-16dd-4d65-a50b-438ce41c9594', 'd5a39887-61b6-4404-b0e4-482a98893d06', 4, null), -- clear-conflict
      ('ebb1c9ba-16dd-4d65-a50b-438ce41c9594', 'dcc84225-1bee-434f-9eea-578d74964f68', 2, null), -- clear-conflict
      -- CLUB · 2016 · The Chillout 2016 Club Tournament (the-chillout-2016-club-tournament) · ended 2016-07-24
      ('e3204142-43d7-43b1-9e60-20062ba9ea4c', 'c5a1daea-46c3-464d-a1af-bd262c4dc004', null, 5),
      ('e3204142-43d7-43b1-9e60-20062ba9ea4c', '323fd29f-654f-4b9d-a5fe-aad51e96706f', null, 6),
      ('e3204142-43d7-43b1-9e60-20062ba9ea4c', 'e282ec13-b64c-4693-986c-68d485a6ae08', null, 7),
      -- CLUB · 2016 · Ok Corral 2016 (ok-corral-2016) · ended 2016-07-31
      ('32ade891-b587-4dd1-b1fa-f00fbd796d08', 'ad8f629a-ecfa-4e5a-a172-d9c09653b9b3', 2, null), -- clear-unsupported
      ('32ade891-b587-4dd1-b1fa-f00fbd796d08', 'b909ad88-4d20-414b-b5f1-4f44e745ae4b', 1, null), -- clear-unsupported
      -- CLUB · 2016 · Cooler Classic 28 (cooler-classic-28) · ended 2016-08-21
      ('22dff3c7-80dc-4d1b-8328-1a1e0a79b29c', 'db99a7e1-b90e-4cda-8eb5-e873b5dcf5ca', null, 11),
      ('22dff3c7-80dc-4d1b-8328-1a1e0a79b29c', '0231beef-bfb3-4d3c-aba9-54cf2b399483', 3, null), -- clear-unsupported
      ('22dff3c7-80dc-4d1b-8328-1a1e0a79b29c', '93f8ff16-2e48-4b31-a8bf-2d5300406506', 2, null), -- clear-unsupported
      -- CLUB · 2016 · Capital Men's Sectionals (capital-mens-sectionals) · ended 2016-08-28
      ('c9a5dbdd-19c2-4cc2-92fc-8aa9db602d43', 'cfa79a2a-61d6-490f-b5a6-8baee4018a85', 3, 4), -- correct
      -- CLUB · 2016 · East Coast Men's Sectionals (east-coast-mens-sectionals) · ended 2016-08-28
      ('5895f00b-4ffc-4841-9fbf-cf2ae45b7e70', '3a0d6571-3cb4-45ad-909c-f449320d0f97', null, 3),
      -- CLUB · 2016 · East New England Men's Sectionals (east-new-england-mens-sectionals) · ended 2016-08-28
      ('379f9697-35e5-445a-8d1c-620f431190a1', 'a8793612-4a6d-4184-8613-9093cae6e908', 3, 4), -- correct
      ('379f9697-35e5-445a-8d1c-620f431190a1', '0019937b-c3de-4be4-85b9-bca3abb529e3', null, 8),
      -- CLUB · 2016 · East New England Women's Sectionals (east-new-england-womens-sectionals) · ended 2016-08-28
      ('2e934808-4470-4b50-95d9-1014285a291b', '3b46ad6e-7954-40fb-9460-4f25760567f3', null, 1),
      ('2e934808-4470-4b50-95d9-1014285a291b', '00fc1802-af15-41c6-b7dc-d0e94585a036', null, 2),
      ('2e934808-4470-4b50-95d9-1014285a291b', 'ae6c25ba-1c53-4233-ad8e-2eeac97747b3', null, 3),
      ('2e934808-4470-4b50-95d9-1014285a291b', 'd267b8fd-0fe8-414e-b276-b8aaf2a10378', null, 4),
      ('2e934808-4470-4b50-95d9-1014285a291b', '8a971df6-ece6-4142-8c19-1699bfd09b8b', null, 5),
      -- CLUB · 2016 · Founders Women's Sectionals (founders-womens-sectionals) · ended 2016-08-28
      ('3e39d4a2-bd9e-4226-ab54-10f2076ff47d', '24097075-a87d-4f11-ac8f-b63aecd5f61f', 4, 5), -- correct
      -- CLUB · 2016 · Metro New York Men's Sectionals (metro-new-york-mens-sectionals) · ended 2016-08-28
      ('4304a085-5ca0-456b-9dc3-03c356115980', '94e19238-3392-4fff-84eb-46434dc25435', null, 4),
      ('4304a085-5ca0-456b-9dc3-03c356115980', 'ac054bdd-2814-4279-b20b-09d3a22b7be9', null, 5),
      ('4304a085-5ca0-456b-9dc3-03c356115980', '57f54426-3312-4b3b-b277-c4dad34025a0', null, 6),
      -- CLUB · 2016 · North Carolina Men's Sectionals (north-carolina-mens-sectionals) · ended 2016-08-28
      ('131c745b-ce9b-4126-a1a7-06daf54cbdf6', '461d0e79-4895-49a5-9119-2b4855575ce6', 3, 4), -- correct
      -- CLUB · 2016 · So Cal Men's Sectionals (so-cal-mens-sectionals) · ended 2016-08-28
      ('af45e638-9aeb-438e-95ee-02ab44cff891', '28cfbbfa-b6b1-4122-8c73-e471a50e57c7', 5, null), -- clear-unsupported
      ('af45e638-9aeb-438e-95ee-02ab44cff891', 'bc588475-a1b4-462b-807a-09e60fc8532a', 4, null), -- clear-unsupported
      -- CLUB · 2016 · So Cal Women's Sectionals (so-cal-womens-sectionals) · ended 2016-08-28
      ('4b2f2943-f88f-47f2-9c19-3ff175afaa14', '7dbb35e9-8b08-455d-8534-c6788c06c3e2', null, 2),
      ('4b2f2943-f88f-47f2-9c19-3ff175afaa14', 'b946ff18-1f1b-4e3a-a8fc-fc99cdc1c874', 2, 3), -- correct
      -- CLUB · 2016 · Upstate New York Men's Sectionals (upstate-new-york-mens-sectionals) · ended 2016-08-28
      ('2806f712-1461-46ec-a845-6abaf51d71ac', 'f0189993-a655-437f-b42a-f3ab550900c2', null, 4),
      -- CLUB · 2016 · Washington Women's Sectionals (washington-womens-sectionals) · ended 2016-08-28
      ('b4115a98-2542-4202-8038-2898167e3992', '99dfc504-df7c-47c9-b9b8-1e904a300e1e', 2, 3), -- correct
      ('b4115a98-2542-4202-8038-2898167e3992', '35df9c91-4e81-4e44-bce9-f83f9eab779b', null, 4),
      -- CLUB · 2016 · West Plains Men's Sectionals (west-plains-mens-sectionals) · ended 2016-08-28
      ('507cde17-5a54-41f0-9f41-085617e0a48d', '32536095-3ae0-4445-af80-ccf4671ae310', null, 3),
      ('507cde17-5a54-41f0-9f41-085617e0a48d', '67eb7e85-22ac-43da-b02c-d5f15d864cd6', null, 4),
      -- CLUB · 2016 · Mid-Atlantic Women's Regionals (mid-atlantic-womens-regionals) · ended 2016-09-11
      ('e1f5ced2-4d47-43f8-8232-e8a56bcbd639', 'd623a318-946b-4de8-82ec-cfe7e28985a7', 3, 4), -- correct
      ('e1f5ced2-4d47-43f8-8232-e8a56bcbd639', '589d2c30-c8a7-4d35-9908-485aa59a6888', 3, 5), -- correct
      -- CLUB · 2016 · North Central Men's Regionals (north-central-mens-regionals) · ended 2016-09-11
      ('dd80a6a4-86e3-46e3-bcfa-b609eba3b5d0', '5e2fcb0b-a410-407f-8d93-17072e3e53a1', 2, 3), -- correct
      ('dd80a6a4-86e3-46e3-bcfa-b609eba3b5d0', '61b9c7e6-cef7-4543-af56-b2202990bf7d', 3, 4), -- correct
      -- CLUB · 2016 · Northeast Men's Regionals (northeast-mens-regionals) · ended 2016-09-11
      ('ab9e49fd-a430-4e1c-b27b-48bf9b51ac93', 'b7df4ec8-ada2-44e5-b610-b4c14bbfdf46', 3, 4), -- correct
      ('ab9e49fd-a430-4e1c-b27b-48bf9b51ac93', '0807c7ff-8c0a-441c-a2dc-bf1e6eff3311', null, 5),
      -- CLUB · 2016 · Northeast Women's Regionals (northeast-womens-regionals) · ended 2016-09-11
      ('2490c56b-99e8-483d-8c53-32e69e02e263', 'e6a2698b-3de4-45ca-af65-2f3aa631b4da', 2, 3), -- correct
      ('2490c56b-99e8-483d-8c53-32e69e02e263', '3b46ad6e-7954-40fb-9460-4f25760567f3', null, 4),
      ('2490c56b-99e8-483d-8c53-32e69e02e263', 'bb5065a1-7a44-4b69-a2cf-fb51be5e3996', 3, 5), -- correct
      -- CLUB · 2016 · Northwest Men's Regionals (northwest-mens-regionals) · ended 2016-09-11
      ('2d4051c2-8048-447c-bf4c-1281774c2373', '45d7378b-c55a-4c5f-9315-fb28cef28b4d', null, 4),
      ('2d4051c2-8048-447c-bf4c-1281774c2373', '05b7643b-f533-497d-b0b8-171061623312', 3, 5), -- correct
      -- CLUB · 2016 · South Central Women's Regionals (south-central-women-s-regionals) · ended 2016-09-11
      ('59e75544-de88-44b1-b949-492b93b1219e', 'fb6378af-16ff-423d-959e-3c0c1af9b72e', null, 4),
      -- CLUB · 2017 · Fort Collins Summer Solstice 2017 (fort-collins-summer-solstice-2017) · ended 2017-06-18
      ('3621b3c9-2ec3-4b97-bbd5-dc22cf562f94', 'f2c2e998-ab5e-407e-a86d-d8aeed7a9113', 3, 4), -- correct
      -- CLUB · 2017 · Old Line Classic 2017 (old-line-classic-2017) · ended 2017-07-09
      ('c426eddf-9d72-45bc-8862-7fe8ee46f6e2', 'fe1e69e4-fbaf-4f06-9246-09ded7bef7e1', 3, 4), -- correct
      -- CLUB · 2017 · Swan Boat 2017 (swan-boat-2017) · ended 2017-07-09
      ('03528bd9-0340-4c7c-84a8-3083b1b8986a', '244307ed-d730-4e30-acb2-1714be74d15f', null, 5),
      -- CLUB · 2017 · Revolution 2017 (revolution-2017) · ended 2017-07-16
      ('cb23ec04-8066-49d1-8a65-fabd0530055f', '353c48e4-89a4-4876-a9a8-9e4610bc735c', 2, 5), -- correct
      ('cb23ec04-8066-49d1-8a65-fabd0530055f', '5fe57685-9e52-4d26-b8fc-84a06950c6d7', 3, 6), -- correct
      ('cb23ec04-8066-49d1-8a65-fabd0530055f', 'bb9e9ff2-3cbe-4381-9139-05e6fcb6aa37', null, 11),
      ('cb23ec04-8066-49d1-8a65-fabd0530055f', '45b22060-2fdc-48b0-b451-a91d1fbc6cea', null, 12),
      ('cb23ec04-8066-49d1-8a65-fabd0530055f', '2ddebc0f-31e6-41f9-9a23-8a346e8bbd70', 5, null), -- clear-unsupported
      ('cb23ec04-8066-49d1-8a65-fabd0530055f', '5acc338a-8d47-4ccb-992e-43246f7d70d1', 4, null), -- clear-unsupported
      -- CLUB · 2017 · Philly Open 2017 (philly-open-2017) · ended 2017-08-06
      ('3f162f02-d257-4c8e-a4af-52cca8bcadbf', '326500c4-9ccd-4e1f-8732-3cb9a4b50b73', 6, null), -- clear-contradicted
      -- CLUB · 2017 · Missoula Roundup 2017 (missoula-roundup-2017) · ended 2017-08-13
      ('6daa87c7-25fc-48b3-a139-44b05bc166c7', 'a52e989d-c640-43ca-a746-f536e5382a21', null, 1),
      ('6daa87c7-25fc-48b3-a139-44b05bc166c7', '13e383aa-e2bc-4582-90bd-bbcbd86ab9f3', null, 2),
      ('6daa87c7-25fc-48b3-a139-44b05bc166c7', '52e44b21-8794-49a3-a3f4-df61e3f550a5', null, 3),
      -- CLUB · 2017 · 2017 Capital Men's Sectionals (2017-capital-mens-sectionals) · ended 2017-09-10 · unfinished bracket: duplicates cleared only
      ('e208059f-2e7a-48fa-a454-bf92a661442f', '0f646952-2458-4f8b-bf18-f914e9b4fe5c', 2, null), -- clear-conflict
      ('e208059f-2e7a-48fa-a454-bf92a661442f', '3dae6044-25ce-4b3a-873d-2be8e7bdfe80', 2, null), -- clear-conflict
      -- CLUB · 2017 · 2017 Central Plains Mixed Sectionals (2017-central-plains-mixed-sectionals) · ended 2017-09-10
      ('ac139ac8-c24d-460f-99fd-72c6d3998307', 'b27ff1c9-81ea-45d0-97ac-c3c500caac89', 3, 4), -- correct
      ('ac139ac8-c24d-460f-99fd-72c6d3998307', 'a046debd-82dd-41ba-b558-3eb4523a35ed', 6, 7), -- correct
      ('ac139ac8-c24d-460f-99fd-72c6d3998307', '7a66f6e7-fddf-490e-90f8-a360dba13184', 7, 8), -- correct
      ('ac139ac8-c24d-460f-99fd-72c6d3998307', '45380a0d-d4de-4161-a9f3-9a84487fc22c', 8, 9), -- correct
      ('ac139ac8-c24d-460f-99fd-72c6d3998307', '687c454b-6c5f-4d17-ba16-6e4ebf27a3f6', 8, 10), -- correct
      -- CLUB · 2017 · 2017 East New England Men's Sectionals (2017-east-new-england-mens-sectionals) · ended 2017-09-10
      ('99bc21f0-c8d8-4954-b324-1fc02478e9b3', '098bcb40-99ea-41c3-94f9-9d33ecde1666', 3, 4), -- correct
      ('99bc21f0-c8d8-4954-b324-1fc02478e9b3', '87918643-2bd7-415f-9820-0794d856d320', null, 8),
      -- CLUB · 2017 · 2017 East Plains Men's Sectionals (2017-east-plains-mens-sectionals) · ended 2017-09-10
      ('61c4863d-1826-46ac-ab76-f5d932f9562c', 'f7b67ea3-4701-4fa4-abcd-cabb8fd70122', 2, 3), -- correct
      ('61c4863d-1826-46ac-ab76-f5d932f9562c', '91102c1f-abe3-4b37-8f66-405901c6cd1a', null, 8),
      ('61c4863d-1826-46ac-ab76-f5d932f9562c', 'd6f257f3-656f-4d3d-947e-2fa0705728ab', null, 9),
      ('61c4863d-1826-46ac-ab76-f5d932f9562c', '5a16eab9-b0a8-46a4-b5ad-8b94deec1521', null, 10),
      -- CLUB · 2017 · 2017 East Plains Mixed Sectionals (2017-east-plains-mixed-sectionals) · ended 2017-09-10
      ('23472c71-2928-436c-b600-cdf35d627ffe', 'f3b055c1-af83-4533-896c-4056a7b5c4b1', null, 3),
      ('23472c71-2928-436c-b600-cdf35d627ffe', 'c1190c29-8977-4672-bd85-c76b4696a9c4', null, 4),
      ('23472c71-2928-436c-b600-cdf35d627ffe', '1fa4c64f-1fda-497a-b336-4a17126d2d8d', 3, 7), -- correct
      ('23472c71-2928-436c-b600-cdf35d627ffe', 'b6ce7efb-45a6-46de-9316-04f218b05860', 3, 8), -- correct
      -- CLUB · 2017 · 2017 Founders Men's Sectionals (2017-founders-mens-sectionals) · ended 2017-09-10
      ('3862f313-60b9-42b0-b653-c99bb75ad725', '64036107-8c30-411e-8d2b-e23ee2887e2b', null, 10),
      -- CLUB · 2017 · 2017 Founders Mixed Sectionals (2017-founders-mixed-sectionals) · ended 2017-09-10
      ('883040df-8517-409e-9bff-0257ab9781bb', 'cfd132d1-06a5-4cec-8de4-db54fc6dcad7', 2, 3), -- correct
      ('883040df-8517-409e-9bff-0257ab9781bb', '646a2fbc-db75-438a-b36e-e251548aab6c', null, 10),
      -- CLUB · 2017 · 2017 Founders Women's Sectionals (2017-founders-womens-sectionals) · ended 2017-09-10
      ('b5bc779f-03c8-456d-a09c-78b694b48e0a', 'c60384c5-33ab-4658-9e51-273b63f777c1', null, 5),
      -- CLUB · 2017 · 2017 Metro New York Mixed Sectionals (2017-metro-new-york-mixed-sectionals) · ended 2017-09-10
      ('b5e6e819-4f0a-4375-9b19-9cecaacb58b2', '66e42e15-3236-4365-a91d-86f97fea930a', 3, 4), -- correct
      ('b5e6e819-4f0a-4375-9b19-9cecaacb58b2', '9dca5efc-bfc0-4e63-89b4-538ef7699bef', 3, 5), -- correct
      ('b5e6e819-4f0a-4375-9b19-9cecaacb58b2', '9254fb2c-f037-4b4d-a77f-962d9ad0a191', null, 6),
      -- CLUB · 2017 · 2017 Metro New York Women's Sectionals (2017-metro-new-york-womens-sectionals) · ended 2017-09-10
      ('7984cd4f-6fe4-48bb-887f-08a50cb36743', '01a65c36-3742-4310-8d93-04f9025ffdce', null, 3),
      -- CLUB · 2017 · 2017 Nor Cal Men's Sectionals (2017-nor-cal-mens-sectionals) · ended 2017-09-10
      ('266bbd34-f20b-40a4-8f6b-34510ed94a27', '65dbee0f-3424-4498-b818-72bbe7f7b9d0', null, 3),
      ('266bbd34-f20b-40a4-8f6b-34510ed94a27', '4801211d-8fbb-4f3b-96be-a9a4ee5ee844', null, 4),
      -- CLUB · 2017 · 2017 Nor Cal Mixed Sectionals (2017-nor-cal-mixed-sectionals) · ended 2017-09-10 · unfinished bracket: duplicates cleared only
      ('37499f7c-35e2-4432-8281-f2fdfa74e6b8', '35b1decf-8c23-4921-9705-48916f23a9b3', 2, null), -- clear-conflict
      ('37499f7c-35e2-4432-8281-f2fdfa74e6b8', 'd639b485-e828-4e79-ab4d-be87c487641a', 2, null), -- clear-conflict
      -- CLUB · 2017 · 2017 North Carolina Men's Sectionals (2017-north-carolina-mens-sectionals) · ended 2017-09-10
      ('ba9a8e99-bdb6-4098-a4e3-03ac696cfb7e', 'edb4555e-4b77-4bba-ae2d-232f594915d5', null, 4),
      ('ba9a8e99-bdb6-4098-a4e3-03ac696cfb7e', '91ea0682-9be9-4907-8fb8-cd21995ad0f9', null, 5),
      ('ba9a8e99-bdb6-4098-a4e3-03ac696cfb7e', '1c60829f-d622-4614-92ed-bf250634a8d9', null, 6),
      -- CLUB · 2017 · 2017 Northwest Plains Mixed Sectionals (2017-northwest-plains-mixed-sectionals) · ended 2017-09-10
      ('c6c2aa0d-9ab0-4ac7-9ef5-d08737741b62', 'cab9fc6e-5065-43dc-a437-4444eeeffbe1', 2, 3), -- correct
      ('c6c2aa0d-9ab0-4ac7-9ef5-d08737741b62', '6fe40a97-4134-43df-8983-82f2734e0308', null, 4),
      -- CLUB · 2017 · 2017 Northwest Plains Women's Sectionals (2017-northwest-plains-womens-sectionals) · ended 2017-09-10
      ('eb4d7089-ed2a-4c99-9d2f-df17ef9a9478', '01d531f9-88eb-4535-9fc5-c35c97ddef4a', null, 6),
      -- CLUB · 2017 · 2017 Oregon Mixed Sectionals (2017-oregon-mixed-sectionals) · ended 2017-09-10
      ('6106a9a7-fbb8-4648-8ca9-2ddd708c5d8d', '1c22db2d-c850-4393-90e8-18b6f09f81d3', 2, 3), -- correct
      ('6106a9a7-fbb8-4648-8ca9-2ddd708c5d8d', '353c48e4-89a4-4876-a9a8-9e4610bc735c', null, 6),
      -- CLUB · 2017 · 2017 Rocky Mountain Mixed Sectionals (2017-rocky-mountain-mixed-sectionals) · ended 2017-09-10
      ('3613a5ef-c835-4e03-a877-91fb485094b5', 'ff8451ba-647a-4bf7-b2cb-8b27cb932791', 5, 6), -- correct
      ('3613a5ef-c835-4e03-a877-91fb485094b5', '50ce6035-71bf-49f9-b10f-824aa0fff6b2', null, 7),
      -- CLUB · 2017 · 2017 So Cal Men's Sectionals (2017-so-cal-mens-sectionals) · ended 2017-09-10
      ('5df11d7b-a23b-4dcb-9598-8be768480700', 'b2b56972-7cad-4d85-802a-147c5c570ae3', 3, 5), -- correct
      -- CLUB · 2017 · 2017 So Cal Mixed Sectionals (2017-so-cal-mixed-sectionals) · ended 2017-09-10
      ('00e490b4-efa1-4729-9929-efed161375e2', '33434824-6e11-4c39-b2be-d04fdc187d50', 2, 3), -- correct
      ('00e490b4-efa1-4729-9929-efed161375e2', '906051c1-9e8a-4a42-ba55-1b714544bd50', null, 4),
      -- CLUB · 2017 · 2017 So Cal Women's Sectionals (2017-so-cal-womens-sectionals) · ended 2017-09-10
      ('bd5e6e00-80da-4c05-922d-e15a17524a27', '50604f91-72de-44f6-b728-53b7d771ffb4', null, 3),
      ('bd5e6e00-80da-4c05-922d-e15a17524a27', '25f9547e-b52f-4227-9c7c-4e7a597d4658', null, 4),
      -- CLUB · 2017 · 2017 Upstate New York Mixed Sectionals (2017-upstate-new-york-mixed-sectionals) · ended 2017-09-10
      ('07132a1e-6f9c-40f3-a5e0-97e8e4c9fbd3', '791cc7d9-ce19-4b77-a093-58d189abec51', null, 6),
      -- CLUB · 2017 · 2017 Washington Women's Sectionals (2017-washington-womens-sectionals) · ended 2017-09-10
      ('5a512a13-8e85-4b42-9f88-45265ac21b63', '0aed989e-99c0-43f7-8508-78008b36e310', null, 6),
      -- CLUB · 2017 · 2017 West Plains Men's Sectionals (2017-west-plains-mens-sectionals) · ended 2017-09-10
      ('4bc79851-183c-4cac-a4ed-1eb4a13daced', '718e5b58-2723-4b54-aa89-316c812f0e41', null, 6),
      -- CLUB · 2017 · 2017 West Plains Mixed Sectionals (2017-west-plains-mixed-sectionals) · ended 2017-09-10
      ('dba34f8c-e5cf-4aa0-a554-a21fa2a60653', '6a25b47e-5ce1-4212-af96-b75e5812a092', 2, 3), -- correct
      ('dba34f8c-e5cf-4aa0-a554-a21fa2a60653', 'f7c909f0-2297-421b-ae90-762ab4a4e4da', null, 6),
      -- CLUB · 2017 · 2017 Florida Men's Sectionals (2017-florida-mens-sectionals) · ended 2017-09-17
      ('ae57af0d-a759-48f2-b066-ac521066801d', 'aa129067-78d2-47e0-bd1b-2052fd2991ff', 3, 4), -- correct
      -- CLUB · 2017 · Great Lakes Men's Regional Championship 2017 (great-lakes-mens-regionals-2017) · ended 2017-09-24
      ('1b35ff9f-1f70-494b-b172-0e4c2af02c10', '47252a82-2da4-4688-bb5d-7ef6d5c0b3f0', 3, 4), -- correct
      -- CLUB · 2017 · Great Lakes Women's Regional Championship 2017 (great-lakes-womens-regionals-2017) · ended 2017-09-24
      ('ed300523-0e8f-48aa-9747-197af6af066d', '9ffbda42-b973-43b5-b08d-f2a9d00119f2', null, 4),
      ('ed300523-0e8f-48aa-9747-197af6af066d', '225ff4a8-5108-46a1-91c8-0cbf53fa6e2b', 3, 5), -- correct
      ('ed300523-0e8f-48aa-9747-197af6af066d', '02a5acba-9240-4829-b355-31a4271f870f', 3, 6), -- correct
      -- CLUB · 2017 · North Central Men's Regional Championship 2017 (north-central-mens-regionals-2017) · ended 2017-09-24
      ('adf0cf78-b4e7-40df-b78d-12e43f593f04', 'f2c2e998-ab5e-407e-a86d-d8aeed7a9113', null, 11),
      -- CLUB · 2017 · North Central Mixed Regional Championship 2017 (north-central-mixed-regionals-2017) · ended 2017-09-24
      ('9354afb6-f7e7-4999-a481-5819aba94e07', 'df5a6af6-aae5-48d7-9ae3-57b94cc1f7bb', 8, 9), -- correct
      ('9354afb6-f7e7-4999-a481-5819aba94e07', '6fe40a97-4134-43df-8983-82f2734e0308', null, 12),
      -- CLUB · 2017 · North Central Women's Regional Championship 2017 (north-central-womens-regionals-2017) · ended 2017-09-24
      ('cc8b8527-39e3-486b-a1d6-021db0885f0a', '540acaf1-555c-44eb-9760-6022494718ba', 3, 4), -- correct
      -- CLUB · 2017 · Northwest Mixed Regional Championship 2017 (northwest-mixed-regionals-2017) · ended 2017-09-24
      ('d9037279-b0cc-4002-a86a-afdb134554fa', 'fc5a5aab-2a03-48c1-998c-4ce80e751541', null, 4),
      ('d9037279-b0cc-4002-a86a-afdb134554fa', '684ee915-3842-4633-b6b2-3be18a39c8ad', 3, null), -- clear-unsupported
      -- CLUB · 2017 · Northwest Women's Regional Championship 2017 (northwest-womens-regionals-2017) · ended 2017-09-24
      ('816c0951-4114-4d39-9d68-a33e1371397e', '8f141f97-19dc-46f3-9be2-fd012e519e30', null, 6),
      -- CLUB · 2017 · South Central Women's Regional Championship 2017 (south-central-womens-regionals-2017) · ended 2017-09-24
      ('5a753c8e-98b0-4396-80df-a7312569b3df', 'd5e91e43-8122-44ae-94f2-c2ec8d7fcfd5', null, 3),
      -- CLUB · 2017 · Southwest Mixed Regional Club Championship 2017 (southwest-mixed-regionals-2017) · ended 2017-09-24
      ('9ff1f075-69e6-4eeb-a119-ec0dfa3ffacb', 'f44384bb-caf8-4012-a062-faadf6874f6f', 3, 4), -- correct
      -- CLUB · 2017 · Southwest Women's Regional Club Championship 2017 (southwest-womens-regionals-2017) · ended 2017-09-24
      ('1713a98c-7983-45b3-bb44-6cc6b739802d', '1e379566-b6a5-40e6-b67d-15f52e267ce6', 3, 4), -- correct
      -- CLUB · 2017 · USA Ultimate National Championships 2017 (usa-ultimate-national-championships-2017) · ended 2017-10-22
      ('c12e06d7-1505-489c-8482-6e9080905d6a', '300e6b40-349b-428a-8a31-991cf6a79c19', 3, 4), -- correct
      ('c12e06d7-1505-489c-8482-6e9080905d6a', 'e3766866-5dde-442b-a48e-776bf15e9f57', 3, 4), -- correct
      ('c12e06d7-1505-489c-8482-6e9080905d6a', '9f5f6845-f857-482c-b72f-7121a04ab6ba', 7, 8), -- correct
      -- CLUB · 2017 · US Beach Open 2017 (us-beach-open-2017) · ended 2017-11-12
      ('0220b25e-6874-4678-877b-986c9010f8f4', '2ba1de5d-c4eb-4596-9d79-91f1a58f47a3', 2, null), -- clear-conflict
      ('0220b25e-6874-4678-877b-986c9010f8f4', '9136a03c-42f8-4edd-87f1-58b5fabc98d6', 2, null), -- clear-conflict
      -- CLUB · 2018 · Summer Glazed Daze 2018 (summer-glazed-daze-2018) · ended 2018-06-24
      ('da02781c-53be-4787-9025-34dcb19da26c', '4639020f-1674-4707-95df-d93bcf1ea88b', null, 13),
      ('da02781c-53be-4787-9025-34dcb19da26c', 'd2196ef0-e012-4ad8-afb2-d68b85609d09', null, 14),
      ('da02781c-53be-4787-9025-34dcb19da26c', '1a083b66-124c-4c99-a14e-1b357795f5ca', null, 15),
      -- CLUB · 2018 · AntlerLock 2018 (antlerlock-2018) · ended 2018-07-08 · unfinished bracket: duplicates cleared only
      ('329aa877-cb1f-4319-bd11-ad660918c9e3', '7f55b47d-a054-42ee-bd0e-2c39f9b0525a', 1, null), -- clear-conflict
      ('329aa877-cb1f-4319-bd11-ad660918c9e3', 'af135b9f-41c0-4678-98d2-b1ca360383a4', 2, null), -- clear-conflict
      ('329aa877-cb1f-4319-bd11-ad660918c9e3', 'c00d6339-e8bd-4ca3-881d-c7abe05b86e1', 2, null), -- clear-conflict
      ('329aa877-cb1f-4319-bd11-ad660918c9e3', 'dda789ff-b7f7-4b65-a5d5-7d800337eea9', 1, null), -- clear-conflict
      -- CLUB · 2018 · Motown Throwdown 2018 (motown-throwdown-2018) · ended 2018-07-08
      ('94394d6a-4819-423c-8249-0288e405a833', 'ddf56fbf-ab70-414f-a6e9-987697e26576', null, 13),
      ('94394d6a-4819-423c-8249-0288e405a833', '8f0233cd-1a73-4ed9-b982-197ba65b8d3b', null, 14),
      ('94394d6a-4819-423c-8249-0288e405a833', '77d8bedb-5e76-4672-97e6-630ca82daa99', null, 15),
      -- CLUB · 2018 · Swan Boat 2018 (swan-boat-2018) · ended 2018-07-08
      ('2478f945-0085-49ae-88ec-6521d41a0dc5', '5a59bb7e-25ae-4e5d-b20d-be0f0fe3cbec', null, 5),
      -- CLUB · 2018 · Vacationland 2018  (vacationland-2018) · ended 2018-07-22
      ('01d8a11a-32e1-4a38-af7f-8d6ddc16b248', 'a3c5c401-642e-4eb4-a129-bb0fded4d593', null, 5),
      ('01d8a11a-32e1-4a38-af7f-8d6ddc16b248', 'daa3b6b0-ea67-448b-9e62-950643083345', null, 6),
      ('01d8a11a-32e1-4a38-af7f-8d6ddc16b248', 'c09ee29f-66a4-485b-96cc-958700f64a9f', null, 7),
      ('01d8a11a-32e1-4a38-af7f-8d6ddc16b248', 'cb236952-aa78-4f99-bc64-0c1ab8c4fb05', null, 7),
      ('01d8a11a-32e1-4a38-af7f-8d6ddc16b248', 'd32d0002-9bd7-4271-9441-1c8ae229d04d', null, 7),
      ('01d8a11a-32e1-4a38-af7f-8d6ddc16b248', 'b89720b9-f8ec-4526-abdc-c309866056b8', null, 8),
      -- CLUB · 2018 · Heavyweights 2018  (heavyweights-2018) · ended 2018-08-05
      ('27735b9c-1344-4637-8d40-94134133e7ba', '4ebe4d6c-9462-487d-acf8-4c3e276f1fef', 2, 3), -- correct
      ('27735b9c-1344-4637-8d40-94134133e7ba', '68a2c34f-9319-4a74-85d5-aa13c3f9f8e7', 3, 4), -- correct
      ('27735b9c-1344-4637-8d40-94134133e7ba', 'c1f34d74-31c7-4c8a-8077-63fceb9ed872', null, 13),
      ('27735b9c-1344-4637-8d40-94134133e7ba', '62016540-948c-4ff9-9ebf-a033dad141a4', null, 14),
      ('27735b9c-1344-4637-8d40-94134133e7ba', '407af527-d465-4234-8f38-83d55f03d632', 2, null), -- clear-unsupported
      ('27735b9c-1344-4637-8d40-94134133e7ba', '839ed6a9-063d-444e-a60c-9841026d3e26', 3, null), -- clear-unsupported
      -- CLUB · 2018 · PB&J 2018 (pb-j-2018) · ended 2018-08-05
      ('27d5095a-df73-4325-ad88-17fa99531481', 'fcce1b6b-7907-4c18-b394-daabef7b9843', null, 1),
      ('27d5095a-df73-4325-ad88-17fa99531481', '851bbdf4-af91-4926-aa64-cd5f2173edaa', null, 2),
      -- CLUB · 2018 · White Mountain Mixed 2018 (white-mountain-mixed-2018) · ended 2018-08-05
      ('62010a83-2140-4313-b15f-6da18b15ffa7', '5d36dd63-7173-403e-9865-8b8e07c3fd4c', null, 3),
      ('62010a83-2140-4313-b15f-6da18b15ffa7', '9f1b8065-ea10-4bc3-93a8-817adffedecd', null, 4),
      -- CLUB · 2018 · Chowdafest 2018 (chowdafest-2018) · ended 2018-08-19
      ('63fa5ce1-ae48-4996-9ffd-d0de21fe67b5', '35d6567a-c753-436f-924c-530660d56876', 1, 3), -- correct
      ('63fa5ce1-ae48-4996-9ffd-d0de21fe67b5', '9f1b8065-ea10-4bc3-93a8-817adffedecd', 2, 6), -- correct
      -- CLUB · 2018 · The Bropen 2018 (the-bropen-2018) · ended 2018-08-26
      ('189a7281-877c-455b-b513-893c9297dc4b', '321d5a0b-0425-4cb8-8504-caca25d45fe5', 11, null), -- clear-unsupported
      ('189a7281-877c-455b-b513-893c9297dc4b', '8f6b2fed-9dac-488d-8fe5-3b134901de67', 10, null), -- clear-unsupported
      -- CLUB · 2018 · Big Sky Mixed Sectional Championship (big-sky-mixed-sectional-championship) · ended 2018-09-09
      ('a9e12023-85b9-4589-82b8-64e6a2408d0b', '9356792d-d569-4e9f-a211-02e3af9049a1', 2, 3), -- correct
      ('a9e12023-85b9-4589-82b8-64e6a2408d0b', 'c204dbcc-0e9e-4ce9-8066-42a244c3e25d', null, 4),
      -- CLUB · 2018 · Capital Men's Sectional Championship (capital-men-s-sectional-championship) · ended 2018-09-09
      ('bb39fe54-7e6d-4d4c-bde5-20f634a997eb', 'b82f9919-ff1b-4cfa-9dff-16fcc487d011', 3, 4), -- correct
      -- CLUB · 2018 · Central Plains Men's Sectional Championship (central-plains-men-s-sectional-championship) · ended 2018-09-09
      ('995d41ac-61bf-417e-b8b6-6cecefbb44bc', '88975dfe-ef69-428a-88c7-b35c1f6c085f', 3, 4), -- correct
      -- CLUB · 2018 · Central Plains Mixed Sectional Championship (central-plains-mixed-sectional-championship) · ended 2018-09-09
      ('6872e319-0315-4930-a3dd-d033aa6c1b77', 'a87eff24-968b-4151-8a86-103fdc14bae9', 2, 3), -- correct
      ('6872e319-0315-4930-a3dd-d033aa6c1b77', 'e2366332-5e0e-4223-a2d0-948b26c41cb3', 3, 4), -- correct
      ('6872e319-0315-4930-a3dd-d033aa6c1b77', '70eb7732-3484-4b1e-8313-65bd12005acc', null, 8),
      -- CLUB · 2018 · Central Plains Women's Sectional Championship (central-plains-women-s-sectional-championship) · ended 2018-09-09
      ('7f7a4367-030d-466a-af35-d2e1b029fd47', '6f27e3b9-695f-4c2d-9582-53007fcb9980', 3, 4), -- correct
      -- CLUB · 2018 · East Coast Mixed Sectional Championship (east-coast-mixed-sectional-championship) · ended 2018-09-09
      ('f99eb786-9ca0-4845-aaf5-24950e61fc13', 'ec64dfee-e252-404a-9caf-3e957eb7c95a', 3, 4), -- correct
      ('f99eb786-9ca0-4845-aaf5-24950e61fc13', '898846a4-abff-4b98-8d5e-1f3c248d51e4', null, 10),
      -- CLUB · 2018 · East New England Mixed Sectional Championship (east-new-england-mixed-sectional-championship) · ended 2018-09-09
      ('127809a4-b8b1-4b55-a83f-4103c43c71e7', 'dda789ff-b7f7-4b65-a5d5-7d800337eea9', null, 4),
      ('127809a4-b8b1-4b55-a83f-4103c43c71e7', '5d36dd63-7173-403e-9865-8b8e07c3fd4c', 3, 6), -- correct
      -- CLUB · 2018 · Florida Men's Sectional Championship (florida-men-s-sectional-championship) · ended 2018-09-09
      ('139199c4-e38f-46f8-a0e9-da0bbff2a9b7', '3b462f56-e529-4c97-ada7-5c748d909eba', 3, null), -- clear-unsupported
      ('139199c4-e38f-46f8-a0e9-da0bbff2a9b7', 'ef9f1303-e77f-46c9-9811-6d24b4ee9ff8', 3, null), -- clear-unsupported
      -- CLUB · 2018 · Founders Mixed Sectional Championship (founders-mixed-sectional-championship) · ended 2018-09-09
      ('00ed2312-c26c-4234-8145-3491c8a17483', '9616cb70-a1c5-45c8-b4c0-d7bf81bea521', 3, 5), -- correct
      ('00ed2312-c26c-4234-8145-3491c8a17483', '1d73c207-0944-4c10-a36a-936df68b95bc', null, 8),
      -- CLUB · 2018 · Metro New York Men's Sectional Championship (metro-new-york-men-s-sectional-championship) · ended 2018-09-09
      ('2402e5ec-ebf3-4e41-88fd-facd546c048d', 'dbe00a71-73f6-4967-873f-6600b504b0b5', null, 3),
      ('2402e5ec-ebf3-4e41-88fd-facd546c048d', '468cd884-eaa5-40bf-bb6d-f4aabf6c011f', null, 4),
      -- CLUB · 2018 · Metro New York Mixed Sectional Championship (metro-new-york-mixed-sectional-championship) · ended 2018-09-09
      ('7e487a89-4ca2-4519-99ed-0f7bc3bd3106', 'a4e31b3c-4111-446c-a1ea-e006d69f19d4', 2, 3), -- correct
      ('7e487a89-4ca2-4519-99ed-0f7bc3bd3106', 'b11d082b-ceb1-484e-8f19-5186acb47190', 3, 4), -- correct
      ('7e487a89-4ca2-4519-99ed-0f7bc3bd3106', 'ddc25118-3d3d-48d3-801d-c43c27513b85', null, 6),
      -- CLUB · 2018 · Nor Cal Mixed Sectional Championship (nor-cal-mixed-sectional-championship) · ended 2018-09-09
      ('68b1af53-14b1-4794-8cd1-abdd18cb5c06', '4b6f1608-f464-44b0-b7bc-7d798ccf73c5', 2, 3), -- correct
      ('68b1af53-14b1-4794-8cd1-abdd18cb5c06', '57501bda-9ee2-42c9-acd5-60c5c602bb58', 3, 4), -- correct
      ('68b1af53-14b1-4794-8cd1-abdd18cb5c06', '0953f655-1d7b-4daf-9b4c-e4790c794913', null, 14),
      -- CLUB · 2018 · North Carolina Men's Sectional Championship (north-carolina-men-s-sectional-championship) · ended 2018-09-09
      ('f1a8b148-feb8-4f51-a5d6-cbab76afd7f9', '6f402abe-3a4a-4fe2-a57c-8a77504ba3c0', null, 4),
      -- CLUB · 2018 · Oregon Mixed Sectional Championship (oregon-mixed-sectional-championship) · ended 2018-09-09
      ('283677ab-b489-47c7-bf5a-6db74f7781ec', 'a92568a5-518f-444b-8736-2e4fab3fb225', 2, 3), -- correct
      ('283677ab-b489-47c7-bf5a-6db74f7781ec', '87a1271b-dad8-4eba-9339-cf4b2b4644d8', null, 4),
      ('283677ab-b489-47c7-bf5a-6db74f7781ec', 'a8acd10b-1c52-4d41-9938-39d47a2bfa15', 5, 7), -- correct
      ('283677ab-b489-47c7-bf5a-6db74f7781ec', 'f978f972-4956-4ae2-b1b4-f102bfc6a98b', 6, 10), -- correct
      -- CLUB · 2018 · Rocky Mountain Men's Sectional Championship (rocky-mountain-men-s-sectional-championship) · ended 2018-09-09
      ('c9f0976d-75ea-411a-9b91-9e218e5f902a', '77a89781-b24d-4ae5-8e02-417f50f1170e', null, 2),
      ('c9f0976d-75ea-411a-9b91-9e218e5f902a', '5eb08bb8-e85d-45a8-a176-a98c57af02ed', 2, 3), -- correct
      -- CLUB · 2018 · Rocky Mountain Mixed Sectional Championship (rocky-mountain-mixed-sectional-championship) · ended 2018-09-09
      ('e260734b-223d-420d-9fd5-d989f0fbb4fb', '7b2528ac-1705-4f5f-abd2-973905e19969', null, 6),
      -- CLUB · 2018 · So Cal Men's Sectional Championship (so-cal-men-s-sectional-championship) · ended 2018-09-09
      ('71148d3d-fe9a-4358-a8b0-8017c92dc25b', '892b967c-c595-4a09-b37a-e07c0222cf52', null, 6),
      -- CLUB · 2018 · Texas Men's Sectional Championship (texas-men-s-sectional-championship) · ended 2018-09-09
      ('ef9c1324-eb32-4379-ae03-81d92a5a7dc3', 'efa3a31b-5216-4f36-b2e7-9a6aec916b29', null, 10),
      -- CLUB · 2018 · Texas Mixed Sectional Championship (texas-mixed-sectional-championship) · ended 2018-09-09
      ('e65381cc-994c-4adb-a7d6-c5d0a002678d', 'f0f2ef2e-6997-445d-92c2-ccbf65237c4a', 3, 4), -- correct
      ('e65381cc-994c-4adb-a7d6-c5d0a002678d', '70f0c39b-fd78-4347-a1ee-04228a0a898f', null, 8),
      -- CLUB · 2018 · Upstate New York Men's Sectional Championship (upstate-new-york-men-s-sectional-championship) · ended 2018-09-09
      ('ca4026f3-1118-4999-bfaf-9e21995fbba2', '3d21826f-6b58-4638-8da6-5159bc2c6152', null, 4),
      -- CLUB · 2018 · Upstate New York Mixed Sectional Championship (upstate-new-york-mixed-sectional-championship) · ended 2018-09-09
      ('81188996-ebef-4e75-9ac4-b130ed9c9a25', '35d6567a-c753-436f-924c-530660d56876', null, 4),
      -- CLUB · 2018 · Washington Men's Sectional Championship (washington-men-s-sectional-championship) · ended 2018-09-09
      ('fe47ba62-c15d-4217-ba1b-c180c826e223', '1c4af31e-a5b1-4edf-9e7f-c4f5efdedafa', 3, 4), -- correct
      ('fe47ba62-c15d-4217-ba1b-c180c826e223', 'b7f95dd9-d709-408f-8833-977d9b7cae8d', 3, 5), -- correct
      -- CLUB · 2018 · Washington Women's Sectional Championship (washington-women-s-sectional-championship) · ended 2018-09-09
      ('8d9ddd3d-9d8a-4d67-a354-057873c29054', 'bbd26f81-9c17-4e68-a8bc-77cd3db2daf6', 3, 4), -- correct
      -- CLUB · 2018 · East Plains Mixed Sectional Championship (east-plains-mixed-sectional-championship) · ended 2018-09-16
      ('df280491-7b1a-495e-a734-6c444493491c', 'a4c3d1d4-312d-4ecd-9dfe-c7ed4c38c208', 2, 3), -- correct
      ('df280491-7b1a-495e-a734-6c444493491c', 'f21da567-fbf7-4efb-9e4a-5d36d3c9d52b', 3, 4), -- correct
      -- CLUB · 2018 · West Plains Mixed Sectional Championship (west-plains-mixed-sectional-championship) · ended 2018-09-16
      ('15a8e695-fc7d-44de-bc11-9ce4afcb8c39', '68a2c34f-9319-4a74-85d5-aa13c3f9f8e7', 2, 3), -- correct
      ('15a8e695-fc7d-44de-bc11-9ce4afcb8c39', 'fb98fa69-87b1-48c4-9828-058dff323478', 3, 4), -- correct
      -- CLUB · 2018 · Great Lakes Women's Regional Championship (great-lakes-women-s-regional-championship) · ended 2018-09-23
      ('f9ebd944-47d1-42d9-9aba-19ffd061919d', '33abb566-0550-427a-8f40-f0a430ba9171', 3, 4), -- correct
      -- CLUB · 2018 · North Central Men's Regional Championship (north-central-men-s-regional-championship) · ended 2018-09-23
      ('80c6b154-23f4-4d5c-8dea-d6c405ea5905', 'c2b5358d-658d-4163-8f2b-da2d74fc2047', null, 4),
      -- CLUB · 2018 · North Central Mixed Regional Championship (north-central-mixed-regional-championship) · ended 2018-09-23
      ('196aa405-e4e3-4edd-9802-056951bca245', '68a2c34f-9319-4a74-85d5-aa13c3f9f8e7', null, 4),
      ('196aa405-e4e3-4edd-9802-056951bca245', '147db4c5-406c-4f08-9214-fb6fc504d6fb', 3, null), -- clear-unsupported
      -- CLUB · 2018 · North Central Women's Regional Championship (north-central-women-s-regional-championship) · ended 2018-09-23
      ('6ad89b06-8e62-4cd8-9ba1-32af88800e25', '682e0557-5e4d-407f-be04-092714e7c71f', 3, 4), -- correct
      -- CLUB · 2018 · Northeast Men's Regional Championship (northeast-men-s-regional-championship) · ended 2018-09-23 · unfinished bracket: duplicates cleared only
      ('260adf8e-a36b-4446-9916-81afc4aeeee3', '2f200a7d-65c4-4d14-99e4-0490d59748c4', 2, null), -- clear-conflict
      ('260adf8e-a36b-4446-9916-81afc4aeeee3', '30b1d6bf-0138-4cf4-ba76-398bc4cd77b3', 2, null), -- clear-conflict
      -- CLUB · 2018 · Northeast Women's Regional Championship (northeast-women-s-regional-championship) · ended 2018-09-23
      ('24eae942-bce9-4ce4-a8f2-41dd50efb9c6', 'a7e5a266-2a6b-4cdb-8fd6-30cf827775ab', null, 4),
      ('24eae942-bce9-4ce4-a8f2-41dd50efb9c6', '4ab79ea2-3a97-43c7-a9bb-5909b3febcb8', 3, 5), -- correct
      -- CLUB · 2018 · Northwest Mixed Regional Championship (northwest-mixed-regional-championship) · ended 2018-09-23
      ('4ab9d010-7243-4e6b-ba9e-4f188cfce20f', 'e998e9a2-2434-4b20-b4f2-2ed9a42928f8', 3, 4), -- correct
      -- CLUB · 2018 · South Central Men's Regional Championship (south-central-men-s-regional-championship) · ended 2018-09-23
      ('3ac7d68d-f0cd-479e-9f1e-03d8166faa73', 'd98f01db-8d62-4a27-b00a-a95b3042cfb7', 3, 4), -- correct
      -- CLUB · 2018 · Southeast Men's Regional Championship (southeast-men-s-regional-championship) · ended 2018-09-23
      ('af5458d5-a3c8-428a-a6ae-e5189c5918ca', 'f8767c46-4124-4ad2-9a39-b2e0d811b07a', 3, 4), -- correct
      ('af5458d5-a3c8-428a-a6ae-e5189c5918ca', '3921399a-8ae9-4a59-bff4-ba16e43322fd', 3, null), -- clear-unsupported
      -- CLUB · 2018 · Southeast Women's Regional Championship (southeast-women-s-regional-championship) · ended 2018-09-23
      ('90c95bff-241b-4dc3-ada9-23aa1dde7786', '18b44dd6-0135-4ec2-a1eb-c8da33c9e464', null, 4),
      ('90c95bff-241b-4dc3-ada9-23aa1dde7786', '2752f61f-366f-45ec-8f95-c02314b14a19', 3, 5), -- correct
      -- CLUB · 2018 · Southwest Women's Regional Championship (southwest-women-s-regional-championship) · ended 2018-09-23
      ('5b7d60d5-1ae5-4273-9b6c-6beb9b2bdbba', 'ea9a055d-c189-43ee-9ee5-40b1744aa8bd', 3, 4), -- correct
      -- CLUB · 2019 · San Diego Slammer 2019 (san-diego-slammer-2019) · ended 2019-06-16
      ('c8a2d8cc-2942-4b23-8884-83b1e07da783', '44cec812-d0aa-46e8-9bc7-99ee5a12c45b', 3, 4), -- correct
      -- CLUB · 2019 · Capital District Classic 2019 (capital-district-classic-2019) · ended 2019-06-23
      ('873d08cc-98f3-4f42-a2fb-f46b2e420e8c', '0d2516aa-b2bc-4889-8a48-49a81005aecb', 2, 3), -- correct
      ('873d08cc-98f3-4f42-a2fb-f46b2e420e8c', '778d3706-0a98-4563-a0d9-cc739e00c575', 3, 4), -- correct
      -- CLUB · 2019 · Eugene Summer Solstice 2019 (eugene-summer-solstice-2019) · ended 2019-06-23
      ('6ad0e496-3e0a-428b-83dc-1c0e3107864d', '3f27d68c-7708-4521-983d-5e53dc47062d', 11, 12), -- correct
      -- CLUB · 2019 · Summer Glazed Daze 2019 (summer-glazed-daze-2019) · ended 2019-06-23
      ('9a0a00cd-12fc-48d1-ad9d-5b8618c162d4', 'ac0d38b1-cc59-453e-b92b-f5f576811bb9', 4, null), -- clear-unsupported
      ('9a0a00cd-12fc-48d1-ad9d-5b8618c162d4', 'fd91cca0-5596-48ed-9572-2857b853f9e6', 5, null), -- clear-unsupported
      -- CLUB · 2019 · Spirit of the Plains 2019 (spirit-of-the-plains-2019) · ended 2019-06-30
      ('47cd56be-dc39-4c03-b4fe-ac6360d733c8', 'c6006639-cf73-4256-8e53-8838b1465b56', 3, 4), -- correct
      -- CLUB · 2019 · Huntsville Huckfest 2019 (huntsville-huckfest-2019) · ended 2019-07-07
      ('6f5f64c3-9b2b-414c-bca1-37ab540adb65', '585406d9-9944-476e-b3af-bf63653abd9e', 2, 3), -- correct
      ('6f5f64c3-9b2b-414c-bca1-37ab540adb65', '96550e2b-1772-40ac-b14f-fb89aef13667', null, 6),
      ('6f5f64c3-9b2b-414c-bca1-37ab540adb65', '0bb34fad-58a1-4454-919b-c9a71aa175b7', null, 8),
      ('6f5f64c3-9b2b-414c-bca1-37ab540adb65', 'd18da4ff-8708-4ce5-a106-1fac24b894de', null, 9),
      ('6f5f64c3-9b2b-414c-bca1-37ab540adb65', '8cfc9597-78db-4f70-bf48-b20ea4966d92', null, 10),
      -- CLUB · 2019 · Battle for the Beltway 2019 (battle-for-the-beltway-2019) · ended 2019-07-14
      ('c14947fd-a8c3-4e78-a1be-2103ab71423f', 'b37907fb-f56d-40d3-a8ee-902ce2863b12', 2, 3), -- correct
      ('c14947fd-a8c3-4e78-a1be-2103ab71423f', 'aa9f3696-6287-46c4-8267-8089205718fb', 3, 4), -- correct
      -- CLUB · 2019 · The Royal Experience 2019 (the-royal-experience-2019) · ended 2019-07-21
      ('3df9bdc1-03ea-4ad1-8b8e-653e1217069f', '614dcbfc-df3d-4aaa-9856-7177d2569b6e', null, 3),
      ('3df9bdc1-03ea-4ad1-8b8e-653e1217069f', 'acc6bb8e-a4de-42a7-a80b-3510b2b40c39', null, 4),
      ('3df9bdc1-03ea-4ad1-8b8e-653e1217069f', '4644f10d-8d21-43c0-b78b-725d21b3020a', null, 5),
      ('3df9bdc1-03ea-4ad1-8b8e-653e1217069f', '58ced2ee-2649-485b-b247-a2ec7a7240fc', null, 7),
      -- CLUB · 2019 · Vacationland 2019 (vacationland-2019) · ended 2019-07-21
      ('8767a4dd-0438-421d-a4b7-74ed7deae41a', '314f8f2c-efb3-4816-b496-030f43f0677e', null, 1),
      ('8767a4dd-0438-421d-a4b7-74ed7deae41a', '564a7777-0434-46fd-8342-7c7dbdd49321', null, 2),
      ('8767a4dd-0438-421d-a4b7-74ed7deae41a', '98d75e9b-d771-4c52-8115-8604cf389125', 7, 8), -- correct
      -- CLUB · 2019 · Heavyweights 2019 (heavyweights-2019) · ended 2019-08-04
      ('d74e2f61-8068-4cf4-93f8-89227d1e5ede', 'bef46660-6bc9-4f84-a5a9-4b6bef2235a4', null, 3),
      ('d74e2f61-8068-4cf4-93f8-89227d1e5ede', '4c2026ee-30ea-49a6-bb5e-2862c6b151f1', null, 4),
      ('d74e2f61-8068-4cf4-93f8-89227d1e5ede', '8678bca8-da47-4ff8-b6de-14c85952fc34', null, 5),
      ('d74e2f61-8068-4cf4-93f8-89227d1e5ede', 'ad5f7f02-f20a-442e-ae1a-55558b58e87b', null, 6),
      ('d74e2f61-8068-4cf4-93f8-89227d1e5ede', '651d07fc-143d-4b49-b048-cd7065f0be0b', 2, 7), -- correct
      ('d74e2f61-8068-4cf4-93f8-89227d1e5ede', '9807df06-a9ba-4b08-8718-7aeee19bfe6c', null, 7),
      ('d74e2f61-8068-4cf4-93f8-89227d1e5ede', '36fed424-09d0-4184-b374-86c639b0aec0', 3, 10), -- correct
      ('d74e2f61-8068-4cf4-93f8-89227d1e5ede', '2bcff324-5825-4574-b053-8baf4e750548', 3, null), -- clear-unsupported
      ('d74e2f61-8068-4cf4-93f8-89227d1e5ede', '9ffd72b9-5965-4ade-ab55-0c5825924d50', 2, null), -- clear-unsupported
      -- CLUB · 2019 · Philly Open 2019 (philly-open-2019) · ended 2019-08-04
      ('ae380046-c2b1-470e-8c83-896d1e06bf44', 'b58064d5-9031-476e-ab6d-1caaa174cc5f', null, 19),
      -- CLUB · 2019 · Big Sky Mixed Club Sectional Championship 2019 (big-sky-mixed-club-sectional-championship-2019) · ended 2019-09-08
      ('b24071d1-93cc-44d0-b221-a44bcfafebe9', '88b0038d-b20a-49da-8ab9-799807cee4bf', 2, 3), -- correct
      ('b24071d1-93cc-44d0-b221-a44bcfafebe9', '8d6d2f43-d0e0-4348-a40e-fb1002b443a9', null, 4),
      -- CLUB · 2019 · Capital Men's Club Sectional Championship 2019 (capital-mens-club-sectional-championship-2019) · ended 2019-09-08
      ('392cc7f3-a058-4282-a181-9d1df7e8f235', '91c98485-0764-4354-912f-d64705d52c13', 7, 8), -- correct
      -- CLUB · 2019 · Capital Mixed Club Sectional Championship 2019 (capital-mixed-club-sectional-championship-2019) · ended 2019-09-08
      ('4b428674-a0c0-4fd0-901b-f366c212475b', '24944bf3-a18c-4a5d-81ea-b954e2da1385', 2, 3), -- correct
      ('4b428674-a0c0-4fd0-901b-f366c212475b', 'f6eb7458-b23c-4b27-8916-80b3301e8d18', 3, 6), -- correct
      ('4b428674-a0c0-4fd0-901b-f366c212475b', '88500b5f-a0c2-40e8-9db1-534cb1f57ba6', null, 12),
      -- CLUB · 2019 · Central Plains Men's Club Sectional Championship 2019 (central-plains-mens-club-sectional-championship-2019) · ended 2019-09-08
      ('575986aa-7c26-43dc-ba72-ce9c078d663b', '02a1e6e8-4646-4ac5-b4fd-9db0cb39af8c', null, 4),
      -- CLUB · 2019 · East New England Men's Club Sectional Championship 2019 (east-new-england-mens-club-sectional-championship-2019) · ended 2019-09-08
      ('9baf0d46-e86a-4108-b64a-a36d94f78b49', 'efaca4a2-3d66-4292-93f5-a68b254c4f4c', 2, 3), -- correct
      ('9baf0d46-e86a-4108-b64a-a36d94f78b49', 'dd951f99-e039-4d2e-a90e-a8a7e1d05767', null, 4),
      ('9baf0d46-e86a-4108-b64a-a36d94f78b49', 'd6ae6df9-90c0-43e5-b1d6-4325c1954e6a', null, 7),
      ('9baf0d46-e86a-4108-b64a-a36d94f78b49', 'f01512d9-9a42-432e-aba2-b5a07b2d4585', null, 7),
      -- CLUB · 2019 · East New England Mixed Club Sectional Championship 2019 (east-new-england-mixed-club-sectional-championship-2019) · ended 2019-09-08
      ('69fc58f8-3c2b-48d0-9dcd-b13f204a8764', 'c4324d1b-8c6f-42dd-b43e-cb8cbceea0dc', 1, 4), -- correct
      ('69fc58f8-3c2b-48d0-9dcd-b13f204a8764', '564a7777-0434-46fd-8342-7c7dbdd49321', 2, 7), -- correct
      ('69fc58f8-3c2b-48d0-9dcd-b13f204a8764', '3ab02de6-38e8-4112-8b26-53ff299dd854', 5, null), -- clear-unsupported
      ('69fc58f8-3c2b-48d0-9dcd-b13f204a8764', 'e4daaec1-505a-45d8-bf6e-f3034382a366', 6, null), -- clear-unsupported
      -- CLUB · 2019 · East Plains Mixed Club Sectional Championship 2019 (east-plains-mixed-club-sectional-championship-2019) · ended 2019-09-08
      ('8445ffd1-b061-4b9d-9596-529d307fe2b3', '2345236b-5592-4e51-9e8f-0752c4a30f86', 3, 4), -- correct
      ('8445ffd1-b061-4b9d-9596-529d307fe2b3', '21bf519f-d021-4160-8bad-5e371b4fa25d', null, 5),
      ('8445ffd1-b061-4b9d-9596-529d307fe2b3', '27aec2a3-794b-41ba-92f2-ba52ac2475ff', null, 6),
      -- CLUB · 2019 · Florida Women's Club Sectional Championship 2019 (florida-womens-club-sectional-championship-2019) · ended 2019-09-08
      ('9f143e4d-2191-49e3-be2a-a28b7f0fb718', '02ca76f0-525b-4a5a-8381-43411c501cbb', 1, null), -- clear-unsupported
      ('9f143e4d-2191-49e3-be2a-a28b7f0fb718', 'fbefee43-26da-4adf-b28d-9e24eb5c59bb', 2, null), -- clear-unsupported
      -- CLUB · 2019 · Founders Men's Club Sectional Championship 2019 (founders-mens-club-sectional-championship-2019) · ended 2019-09-08
      ('c52f4af8-325f-4dcf-962d-08551eecac86', '1668a145-dbc7-41ce-a35e-6743aaac170f', null, 3),
      ('c52f4af8-325f-4dcf-962d-08551eecac86', 'a33b22b9-0377-4e1b-acd5-9c8442ae294e', 3, 4), -- correct
      ('c52f4af8-325f-4dcf-962d-08551eecac86', '6f3b24f0-11f3-4a23-b309-22dda6e08156', 3, 5), -- correct
      ('c52f4af8-325f-4dcf-962d-08551eecac86', '32ae41f1-9718-45cc-b96f-04f138e8d719', null, 6),
      ('c52f4af8-325f-4dcf-962d-08551eecac86', 'f40027d3-9787-4f76-8dec-07a0a7a948eb', null, 7),
      ('c52f4af8-325f-4dcf-962d-08551eecac86', 'd07ee243-77b4-4148-bf52-321f167ea581', null, 8),
      ('c52f4af8-325f-4dcf-962d-08551eecac86', '632b938a-d180-4de0-9ea0-1d2733ec672e', null, 13),
      ('c52f4af8-325f-4dcf-962d-08551eecac86', '4619a2f3-7417-433f-bcdf-669eb0258633', null, 14),
      ('c52f4af8-325f-4dcf-962d-08551eecac86', 'f538bcc7-102f-47d2-bf62-a8d5e449c221', null, 15),
      -- CLUB · 2019 · Founders Mixed Club Sectional Championship 2019 (founders-mixed-club-sectional-championship-2019) · ended 2019-09-08
      ('bdb8786d-476e-4f01-a6d1-3e512623458f', 'd5263644-43de-4cd1-affb-0f1e8ea59b52', 3, 4), -- correct
      ('bdb8786d-476e-4f01-a6d1-3e512623458f', '36a704c2-a13c-40c7-87b2-9c16d696778b', 3, 7), -- correct
      -- CLUB · 2019 · Gulf Coast Men's Club Sectional Championship 2019 (gulf-coast-mens-club-sectional-championship-2019) · ended 2019-09-08
      ('36255b72-b1bc-45dd-a485-3b8a313b49ab', 'f9b0a22c-8e4e-4d3c-a1fb-a61cdc59a75e', 3, 4), -- correct
      -- CLUB · 2019 · Metro New York Men's Club Sectional Championship 2019 (metro-new-york-mens-club-sectional-championship-2019) · ended 2019-09-08
      ('7ef970b9-33ca-4c44-a145-fa8407b9c249', 'c4042f43-ff79-48dd-aabd-ceb7dcdc218d', null, 3),
      ('7ef970b9-33ca-4c44-a145-fa8407b9c249', '7d2a0ac4-fd21-486e-a993-27ae77e9571a', 3, 4), -- correct
      ('7ef970b9-33ca-4c44-a145-fa8407b9c249', '2d4d6634-b131-428d-9127-667855eca75d', 3, 5), -- correct
      ('7ef970b9-33ca-4c44-a145-fa8407b9c249', '6d0465a6-f4ef-4cf0-aaea-92edcdb7035f', null, 6),
      ('7ef970b9-33ca-4c44-a145-fa8407b9c249', '5c893a28-1b01-4340-a3e9-90b3a7c2587b', null, 7),
      -- CLUB · 2019 · Metro New York Mixed Club Sectional Championship 2019 (metro-new-york-mixed-club-sectional-championship-2019) · ended 2019-09-08
      ('042b8ea0-5457-4c54-8d21-5252085675bc', '4a733eb8-9dd2-40d5-9ccc-490182faebaa', 2, 3), -- correct
      ('042b8ea0-5457-4c54-8d21-5252085675bc', '50ff5cf2-2dec-4c6a-9046-58a8ad45df07', 3, 4), -- correct
      ('042b8ea0-5457-4c54-8d21-5252085675bc', 'ac53a570-40b8-46a2-9a90-45e5725b1f88', 3, 6), -- correct
      -- CLUB · 2019 · Nor Cal Men's Club Sectional Championship 2019 (nor-cal-mens-club-sectional-championship-2019) · ended 2019-09-08 · unfinished bracket: duplicates cleared only
      ('cf2abc23-8b91-47e7-8d20-634c03a72be7', '3a71fbc7-1b2d-4539-9104-c31664e7bb5e', 2, null), -- clear-conflict
      ('cf2abc23-8b91-47e7-8d20-634c03a72be7', 'd85de6d1-c4d4-49e8-adf5-dba9b8c8dd26', 2, null), -- clear-conflict
      -- CLUB · 2019 · Nor Cal Mixed Club Sectional Championship 2019 (nor-cal-mixed-club-sectional-championship-2019) · ended 2019-09-08
      ('3d9c7c12-23fd-4a16-90aa-3272ac834196', '8d1add7a-a40f-4749-b4c3-2e469bbb2b33', 3, 4), -- correct
      ('3d9c7c12-23fd-4a16-90aa-3272ac834196', '5d4e387d-e6c2-430d-906f-3c47a8bec52e', null, 5),
      ('3d9c7c12-23fd-4a16-90aa-3272ac834196', '51655ee4-b6a7-4cba-a86b-406a3ad3c1b4', null, 6),
      ('3d9c7c12-23fd-4a16-90aa-3272ac834196', 'dcbc4636-fe69-43ef-b11c-21cc3b27a290', null, 7),
      ('3d9c7c12-23fd-4a16-90aa-3272ac834196', 'b8f001f6-fb51-4c3f-9e24-cc6d8d8963ff', null, 8),
      ('3d9c7c12-23fd-4a16-90aa-3272ac834196', '30055c61-f188-4af2-b472-652030a9e4fe', null, 9),
      ('3d9c7c12-23fd-4a16-90aa-3272ac834196', '7aaa9266-7f47-4375-87eb-e5c9d498509e', null, 10),
      ('3d9c7c12-23fd-4a16-90aa-3272ac834196', '9579c6e7-406f-4c84-aaf2-8940ab512974', null, 11),
      ('3d9c7c12-23fd-4a16-90aa-3272ac834196', '89710c9d-6c23-402c-8071-a5df9e623195', null, 12),
      ('3d9c7c12-23fd-4a16-90aa-3272ac834196', '28c559cd-764f-46aa-9efc-5976e9703465', null, 13),
      ('3d9c7c12-23fd-4a16-90aa-3272ac834196', '2091c979-a8c0-4113-a15d-dbbeeaa5c6bc', null, 14),
      ('3d9c7c12-23fd-4a16-90aa-3272ac834196', 'f20c1119-bfc9-48db-96ff-90bb350f104a', null, 15),
      ('3d9c7c12-23fd-4a16-90aa-3272ac834196', '90b0c441-f761-4f5d-a5b9-35572ea5fe5d', null, 16),
      -- CLUB · 2019 · North Carolina Men's Club Sectional Championship 2019 (north-carolina-mens-club-sectional-championship-2019) · ended 2019-09-08 · unfinished bracket: duplicates cleared only
      ('b32d67d6-5f27-4733-9fd6-c4d1dced1203', '7a8a1df1-f1ba-42bf-978f-478b0903cbfc', 2, null), -- clear-conflict
      ('b32d67d6-5f27-4733-9fd6-c4d1dced1203', 'f052e37a-8d52-4053-af5d-ed1c728f2b02', 2, null), -- clear-conflict
      -- CLUB · 2019 · North Carolina Mixed Club Sectional Championship 2019 (north-carolina-mixed-club-sectional-championship-2019) · ended 2019-09-08
      ('ad4cd006-9b37-4f0b-b41c-124459815c28', '1438e86f-ea2e-4cd4-8f66-671d3d6f2be9', null, 2),
      ('ad4cd006-9b37-4f0b-b41c-124459815c28', 'e6dd3960-c4fb-42b8-afd7-7a55d0e2742d', 2, 3), -- correct
      ('ad4cd006-9b37-4f0b-b41c-124459815c28', '84bc79d3-5530-4ec2-9c65-06996081230d', 11, 12), -- correct
      -- CLUB · 2019 · Northwest Plains Men's Club Sectional Championship 2019 (northwest-plains-mens-club-sectional-championship-2019) · ended 2019-09-08
      ('f1565d3b-a502-41c1-99f9-b2f1e3655a92', '10d6e14c-8dac-4f58-83d9-c7c4873c7a0e', 2, 3), -- correct
      ('f1565d3b-a502-41c1-99f9-b2f1e3655a92', 'aa71bf88-4dc4-4d4b-b321-03a113530b64', null, 6),
      -- CLUB · 2019 · Northwest Plains Mixed Club Sectional Championship 2019 (northwest-plains-mixed-club-sectional-championship-2019) · ended 2019-09-08
      ('0d501a84-52f7-4f85-a1d1-2dceb281ecc8', '73e5b108-c9b9-411f-b94b-7aa5501a8486', null, 3),
      ('0d501a84-52f7-4f85-a1d1-2dceb281ecc8', '9ffd72b9-5965-4ade-ab55-0c5825924d50', 3, 4), -- correct
      ('0d501a84-52f7-4f85-a1d1-2dceb281ecc8', '3b746e58-483b-4419-8a24-db860017d0da', 3, 5), -- correct
      ('0d501a84-52f7-4f85-a1d1-2dceb281ecc8', '9236de3e-945e-475d-a5e5-eddc29aaaf93', null, 6),
      ('0d501a84-52f7-4f85-a1d1-2dceb281ecc8', '9807df06-a9ba-4b08-8718-7aeee19bfe6c', null, 7),
      ('0d501a84-52f7-4f85-a1d1-2dceb281ecc8', '2bcff324-5825-4574-b053-8baf4e750548', null, 8),
      ('0d501a84-52f7-4f85-a1d1-2dceb281ecc8', '3ef6dee0-1c48-41b5-aecb-8c2d4a846d08', null, 9),
      ('0d501a84-52f7-4f85-a1d1-2dceb281ecc8', 'ad5f7f02-f20a-442e-ae1a-55558b58e87b', null, 10),
      -- CLUB · 2019 · Oregon Mixed Club Sectional Championship 2019 (oregon-mixed-club-sectional-championship-2019) · ended 2019-09-08
      ('2290c95a-c6f2-43b6-a335-01d7bda6f6b6', 'db077528-cbf1-4e5e-b87f-5f7e4f631baa', 3, 4), -- correct
      -- CLUB · 2019 · Ozarks Men's Club Sectional Championship 2019 (ozarks-mens-club-sectional-championship-2019) · ended 2019-09-08
      ('0993ac9d-92d6-4a52-aa07-1c54f53d01d9', '9e4b4727-04c3-4618-a49a-eb8039f428ab', null, 3),
      -- CLUB · 2019 · Ozarks Mixed Club Sectional Championship 2019 (ozarks-mixed-club-sectional-championship-2019) · ended 2019-09-08
      ('2ff3c061-8d1d-468d-9b69-cae7107d0ccc', 'b8c135b2-8304-4d84-a41b-9afb74cea392', 3, 4), -- correct
      -- CLUB · 2019 · Rocky Mountain Mixed Club Sectional Championship 2019 (rocky-mountain-mixed-club-sectional-championship-2019) · ended 2019-09-08
      ('a78f3df3-06ec-47b7-bd13-2a5a4b0455ff', '557f83cf-e451-4097-9a71-afc59f417d90', 3, 4), -- correct
      -- CLUB · 2019 · Texas Men's Club Sectional Championship 2019 (texas-mens-club-sectional-championship-2019) · ended 2019-09-08
      ('3de383b5-3372-41dd-be07-ea062d16e83e', 'fcda55e9-5a3b-4e3c-97fd-d22c5d86990f', 2, 3), -- correct
      ('3de383b5-3372-41dd-be07-ea062d16e83e', 'ed289cad-9c52-408f-9e63-79c19267d8f8', 3, 4), -- correct
      ('3de383b5-3372-41dd-be07-ea062d16e83e', '9a5a9303-0d01-4dc0-ae33-4e35ec4d2a22', 3, 6), -- correct
      ('3de383b5-3372-41dd-be07-ea062d16e83e', 'ac58bd4c-229b-4488-9c7e-349ee2212b26', null, 10),
      -- CLUB · 2019 · Texas Mixed Club Sectional Championship 2019 (texas-mixed-club-sectional-championship-2019) · ended 2019-09-08
      ('dc7de865-eaf2-4a58-b9b2-7a5862a6705e', '139719b4-757d-4b5e-8fe0-b27ec35dd0c2', 3, 4), -- correct
      ('dc7de865-eaf2-4a58-b9b2-7a5862a6705e', '5419c9fd-817a-4398-85cb-59ad27a60c0b', null, 8),
      -- CLUB · 2019 · Upstate New York Men's Club Sectional Championship 2019 (upstate-new-york-mens-club-sectional-championship-2019) · ended 2019-09-08
      ('fe5b6a83-96cd-4d36-a595-bf44d9fd8604', '0836c64a-94bd-4748-8085-c7f86fb03fcf', 2, 3), -- correct
      ('fe5b6a83-96cd-4d36-a595-bf44d9fd8604', '662eb309-fa4f-476b-af35-1cd20e5c4a43', null, 4),
      -- CLUB · 2019 · Upstate New York Mixed Club Sectional Championship 2019 (upstate-new-york-mixed-club-sectional-championship-2019) · ended 2019-09-08
      ('9f954c29-ccd4-49ab-b39d-6c3b71489051', '0d2516aa-b2bc-4889-8a48-49a81005aecb', 2, 3), -- correct
      ('9f954c29-ccd4-49ab-b39d-6c3b71489051', '67d311ec-c96b-4d72-b27f-86b255a23d3f', null, 4),
      -- CLUB · 2019 · Upstate New York Women's Club Sectional Championship 2019 (upstate-new-york-womens-club-sectional-championship-2019) · ended 2019-09-08
      ('01f65dd8-0441-4963-946d-de3d644041aa', 'f365a4f4-99c6-4b66-a640-ef74098aa8dc', 3, 2), -- correct
      ('01f65dd8-0441-4963-946d-de3d644041aa', '4b87aad4-1b74-4dfb-bee1-1ca72fdcaeea', 2, 3), -- correct
      ('01f65dd8-0441-4963-946d-de3d644041aa', '96d7b432-b5b1-4d3e-8e00-d466c06dbf02', 3, 4), -- correct
      -- CLUB · 2019 · Washington Men's Club Sectional Championship 2019 (washington-mens-club-sectional-championship-2019) · ended 2019-09-08
      ('34330d5e-334d-426e-b3d5-d0372a5510d0', '03dc7d0c-9be3-4276-85f7-5b1f9bb93ff6', 3, 4), -- correct
      ('34330d5e-334d-426e-b3d5-d0372a5510d0', '1dd2fdc1-5108-4f7c-b3a2-81ab62df3e15', 3, 5), -- correct
      -- CLUB · 2019 · Washington Mixed Club Sectional Championship 2019 (washington-mixed-club-sectional-championship-2019) · ended 2019-09-08
      ('0b990cf9-b571-4152-bd77-32df55670a59', '39d2c6c4-e854-4e3c-8110-2520a868b439', 2, 3), -- correct
      ('0b990cf9-b571-4152-bd77-32df55670a59', 'd1364239-7027-485d-8d16-a3735bcfe1a6', null, 4),
      -- CLUB · 2019 · West Plains Men's Club Sectional Championship 2019 (west-plains-mens-club-sectional-championship-2019) · ended 2019-09-08
      ('0ecd704c-4b26-4d77-b466-0bcea47569ca', 'a2eba27f-6e59-46bb-93c4-e921cdb81b2d', 2, 3), -- correct
      ('0ecd704c-4b26-4d77-b466-0bcea47569ca', '58ced2ee-2649-485b-b247-a2ec7a7240fc', null, 6),
      -- CLUB · 2019 · West Plains Mixed Club Sectional Championship 2019 (west-plains-mixed-club-sectional-championship-2019) · ended 2019-09-08
      ('7e592439-aff8-4653-ba44-fbe386f22233', '114d25fa-8dd3-4332-9387-34fac6a7ef6f', 3, 4), -- correct
      -- CLUB · 2019 · Mid-Atlantic Men's Club Regional Championship 2019 (mid-atlantic-mens-club-regional-championship-2019) · ended 2019-09-22
      ('5c89f34a-3937-464e-a20a-7d6f6e4da615', 'e2439447-127f-4e3d-9b86-8b63ec60a3b1', 3, 4), -- correct
      -- CLUB · 2019 · Mid-Atlantic Mixed Club Regional Championship 2019 (mid-atlantic-mixed-club-regional-championship-2019) · ended 2019-09-22
      ('3b47e3b5-8aec-41e2-9ad5-ad2fb3b04cd4', '62e64e1c-8228-49f9-a01c-a55b2909c1f0', 3, 4), -- correct
      -- CLUB · 2019 · North Central Club Men's Regional Championship 2019 (north-central-club-mens-regional-championship) · ended 2019-09-22
      ('72e831bd-2e06-40c8-9ad7-50c5ee0be5bd', 'd5aeeaed-fe43-415d-919d-40d169ef0f84', 10, 11), -- correct
      ('72e831bd-2e06-40c8-9ad7-50c5ee0be5bd', 'bec0746c-6801-4d89-892b-22bcf57c4b44', null, 13),
      -- CLUB · 2019 · Northeast Club Women's Regional Championship 2019 (northeast-club-womens-regional-championship-2019) · ended 2019-09-22
      ('2082f49f-9ec6-47f6-9624-2b8674a192e4', '175eb7e2-1156-47ad-b629-2c511e7a82ff', null, 4),
      ('2082f49f-9ec6-47f6-9624-2b8674a192e4', '68b0f6b5-ddb9-453a-b003-5eaba4c60041', 3, 5), -- correct
      ('2082f49f-9ec6-47f6-9624-2b8674a192e4', 'cb6ca321-49f2-401f-8c99-89f76bf2f059', null, 8),
      -- CLUB · 2019 · Northwest Club Men's Regional Championship 2019 (northwest-club-mens-regional-championship-2019) · ended 2019-09-22
      ('1a7a3941-0a38-45db-a29a-3711bc2081e9', 'd1390d21-1af3-419a-91f1-764b06d70d72', 3, 4), -- correct
      -- CLUB · 2019 · South Central Club Men's Regional Championship 2019 (south-central-club-mens-regional-championship-2019) · ended 2019-09-22
      ('889ec3ef-ebc6-496f-a519-7bb01c7d594a', '9e7751ad-87a4-46ec-a511-285ca3c28947', 3, 4), -- correct
      -- CLUB · 2019 · South Central Club Mixed Regional Championship 2019 (south-central-club-mixed-regional-championship-2019) · ended 2019-09-22
      ('e57eb387-097d-401a-84f7-faabeab4078d', '84e05b71-e0ae-4970-a95d-40dfd6e0c521', null, 4),
      ('e57eb387-097d-401a-84f7-faabeab4078d', '33b52c06-b869-4c83-99b4-971698d6336d', 3, null), -- clear-unsupported
      -- CLUB · 2019 · Southeast Club Men's Regional Championship 2019 (southeast-club-mens-regional-championship-2019) · ended 2019-09-22
      ('f4753a30-db90-4379-b845-33cc06381c77', '585406d9-9944-476e-b3af-bf63653abd9e', 3, 4), -- correct
      -- CLUB · 2019 · Southeast Club Mixed Regional Championship 2019 (southeast-club-mixed-regional-championship-2019) · ended 2019-09-22
      ('29cebb79-a525-428f-a2a4-cc24b82e8fe8', '46b4390f-027e-44c6-afa6-d74ca46fd72f', 2, 3), -- correct
      ('29cebb79-a525-428f-a2a4-cc24b82e8fe8', 'e832704a-b8e3-4941-80b0-8d5f5374dd59', null, 4),
      ('29cebb79-a525-428f-a2a4-cc24b82e8fe8', '939c33e1-b5e0-4d19-9686-abb7c7ce56db', 3, null), -- clear-unsupported
      ('29cebb79-a525-428f-a2a4-cc24b82e8fe8', 'f7b14e6f-f8d2-468b-9c20-e19753d68605', 3, null), -- clear-unsupported
      -- CLUB · 2019 · Southeast Club Women's Regional Championship 2019 (southeast-club-womens-regional-championship-2019) · ended 2019-09-22
      ('0480042b-0fb0-4feb-b2ae-14519e9f9c0d', '9a0f630c-0e71-41dc-a5d7-9f905ea40afb', 3, 4), -- correct
      -- CLUB · 2019 · Southwest Club Men's Regional Championship 2019 (southwest-club-mens-regional-championship-2019) · ended 2019-09-22
      ('cce680f7-b351-49d1-a9c2-469cfec1b175', 'd85de6d1-c4d4-49e8-adf5-dba9b8c8dd26', null, 4),
      ('cce680f7-b351-49d1-a9c2-469cfec1b175', '41905666-2f63-45f6-89bb-98dae14ad5fa', 3, 6), -- correct
      -- CLUB · 2019 · Southwest Club Mixed Regional Championship 2019 (southwest-club-mixed-regional-championship-2019) · ended 2019-09-22
      ('829cd429-50ff-4d21-93d1-8861ee3a7a8a', '2b8d7fed-f58c-400c-8d30-667dbe7d3652', 2, 3), -- correct
      ('829cd429-50ff-4d21-93d1-8861ee3a7a8a', '6bdb8f65-8702-445f-82ef-dd7c524a0761', 3, 4), -- correct
      -- CLUB · 2019 · Southwest Club Women's Regional Championship 2019 (southwest-club-womens-regional-championship-2019) · ended 2019-09-22
      ('e99b66fc-4f69-456d-96b1-cd055c2c2cd3', 'c8ee4b1a-a9f1-4f7d-a62d-9e47686157bb', 3, 4), -- correct
      -- CLUB · 2019 · USA Ultimate National Championships 2019 (usa-ultimate-national-championships-2019) · ended 2019-10-27
      ('890a9af5-a48d-4906-aed7-22c4ccf2c125', '62ae853a-fba1-434d-8677-55242d1cc179', null, 1),
      ('890a9af5-a48d-4906-aed7-22c4ccf2c125', '873dec04-8644-43bd-885b-97c2cdd8bb17', null, 1),
      ('890a9af5-a48d-4906-aed7-22c4ccf2c125', 'd5d11d00-8498-4395-b8aa-2b9ca72b93ac', null, 1),
      ('890a9af5-a48d-4906-aed7-22c4ccf2c125', '277ad3c6-a1fb-4ab5-aaaf-6fc49d6681a3', null, 2),
      ('890a9af5-a48d-4906-aed7-22c4ccf2c125', '2b01055e-1590-44f1-93f2-d92b773c8833', null, 2),
      ('890a9af5-a48d-4906-aed7-22c4ccf2c125', '56faf1e8-5454-4006-9079-1e150aa2c1a5', null, 2),
      ('890a9af5-a48d-4906-aed7-22c4ccf2c125', '0575dabc-c81a-487b-aa81-b160c697896c', null, 3),
      ('890a9af5-a48d-4906-aed7-22c4ccf2c125', '2bbf2fd0-cd43-44e3-a7bf-c53fd803765c', null, 3),
      ('890a9af5-a48d-4906-aed7-22c4ccf2c125', '35f7f780-4c35-4c80-9804-7344a7225ebb', null, 3),
      ('890a9af5-a48d-4906-aed7-22c4ccf2c125', 'c0d9f9e3-cdb3-42af-862d-5e8ed6bdb78a', null, 3),
      ('890a9af5-a48d-4906-aed7-22c4ccf2c125', 'd246c14d-af6e-4ca4-93f3-729164dbcf48', null, 3),
      ('890a9af5-a48d-4906-aed7-22c4ccf2c125', 'f6462e6d-2389-4a83-a72c-23433f904ac6', null, 3),
      ('890a9af5-a48d-4906-aed7-22c4ccf2c125', '08a05448-282e-4349-9433-77e067e0d87f', null, 5),
      ('890a9af5-a48d-4906-aed7-22c4ccf2c125', '62ebc91b-ac7f-4c5d-b149-0b3238faef6d', null, 5),
      ('890a9af5-a48d-4906-aed7-22c4ccf2c125', 'ce2f771b-51a5-4119-b73e-7ecf933b6e78', null, 5),
      ('890a9af5-a48d-4906-aed7-22c4ccf2c125', '26a7029d-beca-457f-883c-dd1dcb3dd91e', null, 6),
      ('890a9af5-a48d-4906-aed7-22c4ccf2c125', '27584b3c-5539-4ca8-9046-bf4c3356acdb', null, 6),
      ('890a9af5-a48d-4906-aed7-22c4ccf2c125', '8398acc6-4afd-465b-9d92-12e8c7e62aac', null, 6),
      ('890a9af5-a48d-4906-aed7-22c4ccf2c125', '00324a2e-b984-4754-b17a-5bfa5f37bbef', null, 7),
      ('890a9af5-a48d-4906-aed7-22c4ccf2c125', '2be7b7a4-6367-46b2-8a5c-00c1cb8f8499', null, 7),
      ('890a9af5-a48d-4906-aed7-22c4ccf2c125', '370211ca-2063-4e45-8176-38274314b86b', null, 7),
      ('890a9af5-a48d-4906-aed7-22c4ccf2c125', '86fb38f6-8aba-493f-bcdc-af855342d4cc', null, 7),
      ('890a9af5-a48d-4906-aed7-22c4ccf2c125', 'bbc3031e-47ed-4329-98d4-9f92fc38a96f', null, 7),
      ('890a9af5-a48d-4906-aed7-22c4ccf2c125', 'c79c4862-0174-4580-9f30-12f91df64096', null, 7),
      ('890a9af5-a48d-4906-aed7-22c4ccf2c125', '8df2229b-e5f9-40f0-8e94-076409d120cc', null, 11),
      ('890a9af5-a48d-4906-aed7-22c4ccf2c125', 'b8a52fb5-459e-402d-b27c-7a4b1b2c9242', null, 11),
      ('890a9af5-a48d-4906-aed7-22c4ccf2c125', 'f0da4960-479d-496c-bd66-2d4e3deeeb19', null, 11),
      ('890a9af5-a48d-4906-aed7-22c4ccf2c125', '86c52683-a76e-4df2-a8a6-84622e7ab865', null, 12),
      ('890a9af5-a48d-4906-aed7-22c4ccf2c125', '88b0038d-b20a-49da-8ab9-799807cee4bf', null, 12),
      ('890a9af5-a48d-4906-aed7-22c4ccf2c125', 'c67d07ed-e97e-43ed-bb10-37fae2841ffa', null, 12),
      ('890a9af5-a48d-4906-aed7-22c4ccf2c125', '0fb8d4f3-876c-43f8-9cfb-0afde4fcedd5', null, 13),
      ('890a9af5-a48d-4906-aed7-22c4ccf2c125', '28c8336b-d5b8-42e1-882a-4cf83befa235', null, 13),
      ('890a9af5-a48d-4906-aed7-22c4ccf2c125', 'e086ef52-61c8-41d8-a3ce-12f89dce5999', null, 13),
      ('890a9af5-a48d-4906-aed7-22c4ccf2c125', '175eb7e2-1156-47ad-b629-2c511e7a82ff', null, 14),
      ('890a9af5-a48d-4906-aed7-22c4ccf2c125', '8400ec82-8bc9-49ee-b4d2-bde27683cb57', null, 14),
      ('890a9af5-a48d-4906-aed7-22c4ccf2c125', '915e0935-334e-4b64-8fc8-11e5b83acdda', null, 14),
      ('890a9af5-a48d-4906-aed7-22c4ccf2c125', '0f38312e-f83b-4cf5-a037-55fd44848395', null, 15),
      ('890a9af5-a48d-4906-aed7-22c4ccf2c125', '11bd3182-044b-4be1-b05c-87ef0abb4d0e', null, 15),
      ('890a9af5-a48d-4906-aed7-22c4ccf2c125', '654e3a50-3fe0-48f1-b095-1b18535a22c8', null, 15),
      ('890a9af5-a48d-4906-aed7-22c4ccf2c125', '67dede75-c674-476a-ada7-f6e1215ef552', null, 16),
      ('890a9af5-a48d-4906-aed7-22c4ccf2c125', '7a46c976-4018-4378-8c59-db2fa5ba43da', null, 16),
      ('890a9af5-a48d-4906-aed7-22c4ccf2c125', '882a2336-2e0a-45d6-95a0-268876e8914b', null, 16),
      -- CLUB · 2021 · HoDown ShowDown 24 (hodown-showdown-24) · ended 2021-08-15
      ('249cc975-eb6a-4145-85c1-7ad9ba900420', 'd1fcaa33-cac5-49ab-b1ed-caea443bf045', null, 13),
      ('249cc975-eb6a-4145-85c1-7ad9ba900420', '96cfb2d2-8e6f-4be6-b334-d263db2fb7df', null, 14),
      ('249cc975-eb6a-4145-85c1-7ad9ba900420', '2659083c-8638-4c1a-8093-1bea0caca96a', null, 15),
      -- CLUB · 2021 · Big Sky Mixed Club Sectional Championship 2021 (big-sky-mixed-club-sectional-championship-2021) · ended 2021-09-12
      ('c8dc65f7-1bf8-41b5-b999-6aab464a0e00', '7972c250-042c-483f-85d4-c7a8c5c101dc', null, 3),
      ('c8dc65f7-1bf8-41b5-b999-6aab464a0e00', '4de174f8-b015-496e-b33a-05130706e391', null, 4),
      ('c8dc65f7-1bf8-41b5-b999-6aab464a0e00', '6fb93c75-bbfd-4dc9-a0f0-fb5b579b37a6', null, 5),
      ('c8dc65f7-1bf8-41b5-b999-6aab464a0e00', '4be092f7-bf03-419b-a47b-4ed62136615d', null, 6),
      -- CLUB · 2021 · Capital Men's Club Sectional Championship 2021 (capital-mens-club-sectional-championship-2021) · ended 2021-09-12
      ('39646985-6672-4b91-8815-68e54a191042', '60e7b398-e0aa-46b4-b2ae-beae641355f2', null, 4),
      ('39646985-6672-4b91-8815-68e54a191042', 'c8522794-a142-4d02-b9d7-12483c595753', 3, 5), -- correct
      ('39646985-6672-4b91-8815-68e54a191042', '3c7b3bfe-1356-4f0c-9d48-475550d90d7e', null, 6),
      -- CLUB · 2021 · East Coast Mixed Club Sectional Championship 2021 (east-coast-mixed-club-sectional-championship-2021) · ended 2021-09-12
      ('be1f5d2b-e463-4fa5-b4c3-293c6573c904', '59d816fd-3ba8-4ec8-8e61-08655c83d6cf', 4, 5), -- correct
      ('be1f5d2b-e463-4fa5-b4c3-293c6573c904', 'f7273240-306f-467d-89f9-f9285c5ca4fd', null, 9),
      -- CLUB · 2021 · East New England Mixed Club Sectional Championship 2021 (east-new-england-mixed-club-sectional-championship-2021) · ended 2021-09-12
      ('e2b5edd6-c76d-4e82-9c48-ac14e6012ccc', '89badc9f-09ed-4911-b637-3c70b5569450', 3, 4), -- correct
      ('e2b5edd6-c76d-4e82-9c48-ac14e6012ccc', 'f19a7210-3c35-445c-aeba-d207f10a322b', null, 5),
      ('e2b5edd6-c76d-4e82-9c48-ac14e6012ccc', '468c3efd-a253-4fdf-a1a4-3ad5805a84a9', null, 6),
      -- CLUB · 2021 · East Plains Mixed Club Sectional Championship 2021 (east-plains-mixed-club-sectional-championship-2021) · ended 2021-09-12
      ('51cf4621-16ec-42d1-a9a3-063c55defe87', 'adcc6554-cf1e-492c-b0f8-998f74542750', null, 4),
      -- CLUB · 2021 · Founders Men's Club Sectional Championship 2021 (founders-mens-club-sectional-championship-2021) · ended 2021-09-12
      ('d1ab5810-3e83-4162-bca8-0115a433a525', 'dad35e63-4675-45fa-8bf9-2c2b73606c40', 2, 3), -- correct
      ('d1ab5810-3e83-4162-bca8-0115a433a525', '4cb9193a-6ceb-42fc-8778-25400508408c', null, 4),
      ('d1ab5810-3e83-4162-bca8-0115a433a525', 'bb15da2d-3b50-4a2a-bb05-b7ac9e23b766', 3, 5), -- correct
      ('d1ab5810-3e83-4162-bca8-0115a433a525', '3f8a5300-5d3d-45ce-954a-715485ddfdb8', 3, 6), -- correct
      -- CLUB · 2021 · Founders Mixed Club Sectional Championship 2021 (founders-mixed-club-sectional-championship-2021) · ended 2021-09-12
      ('41d98fab-4145-48c0-a8a8-9e0ada27bf27', '8262d388-cb2e-4135-bb9e-26e57736a201', 2, 3), -- correct
      ('41d98fab-4145-48c0-a8a8-9e0ada27bf27', 'eef421c5-acc5-458e-91fa-7f9fa510691b', 3, 4), -- correct
      ('41d98fab-4145-48c0-a8a8-9e0ada27bf27', 'ba05391d-9a64-4137-803c-f16a45048f81', null, 8),
      -- CLUB · 2021 · Metro New York Men's Club Sectional Championship 2021 (metro-new-york-mens-club-sectional-championship-2021) · ended 2021-09-12
      ('706b659f-11d1-4765-a304-ce79c10d641c', '8cec69d3-c6b5-466f-92bd-174c4b4bbb39', 3, 4), -- correct
      -- CLUB · 2021 · Northwest Plains Mixed Club Sectional Championship 2021 (northwest-plains-mixed-club-sectional-championship-2021) · ended 2021-09-12
      ('d0e6212b-a7f2-4034-a4a1-fe8f9e1d9df3', 'f7ef834f-e601-4dbf-9c35-15b133b881e2', 2, 3), -- correct
      ('d0e6212b-a7f2-4034-a4a1-fe8f9e1d9df3', '89e805da-ebdf-41af-a051-4efc02d8b567', 4, 5), -- correct
      ('d0e6212b-a7f2-4034-a4a1-fe8f9e1d9df3', '2e8f359d-6114-4361-a8d1-2f80c4b6227d', 5, 6), -- correct
      ('d0e6212b-a7f2-4034-a4a1-fe8f9e1d9df3', '0ca18a18-c04e-4538-9ee2-8c39e26ae970', null, 14),
      -- CLUB · 2021 · Oregon Mixed Club Sectional Championship 2021 (oregon-mixed-club-sectional-championship-2021) · ended 2021-09-12
      ('28aeab9d-1d4c-4466-972a-eb874ecc8a86', '782e8048-8ab5-4a0a-8be8-fc2d0e89b89c', 3, 6), -- correct
      ('28aeab9d-1d4c-4466-972a-eb874ecc8a86', '79148995-9451-4209-ba3f-0f41e86b087e', 3, null), -- clear-unsupported
      -- CLUB · 2021 · Rocky Mountain Mixed Club Sectional Championship 2021 (rocky-mountain-mixed-club-sectional-championship-2021) · ended 2021-09-12
      ('b00c2e28-e495-4088-b40d-07b527bf6d8c', '45855177-faaf-4472-9387-5f3b242a77fe', 3, 4), -- correct
      ('b00c2e28-e495-4088-b40d-07b527bf6d8c', 'df3848bf-a6cc-4f1f-80d0-bfc9d9a46d4a', null, 6),
      ('b00c2e28-e495-4088-b40d-07b527bf6d8c', '39e57eb1-9e7f-4abd-b107-c014e2bb314d', null, 7),
      ('b00c2e28-e495-4088-b40d-07b527bf6d8c', '7374f45c-c0a9-4cc0-a403-670aee953c20', null, 10)
    ) as v(event_id, team_id, old_place, new_place)
   where et.event_id = v.event_id
     and et.team_id = v.team_id
     and et.final_placement is not distinct from v.old_place;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> v_expected THEN
    RAISE EXCEPTION 'usau placements part 01: expected % rows, matched %; data drifted since generation, re-run scripts/derive-usau-placements.ts', v_expected, v_updated;
  END IF;
  RAISE NOTICE 'usau placements part 01: updated % rows', v_updated;
END
$migration$;

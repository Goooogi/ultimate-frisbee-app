-- USAU per-event final placements — repair + fill, part 01 of 01.
--
-- The 2026-07-20 one-shot derivePlacements() backfill (Feature Backlog #18)
-- stored misread brackets, game-to-go losers kept 2nd, and ties that a later
-- game had settled; nothing derived placements after it. Regenerated with the
-- fixed algorithm by scripts/derive-usau-placements.ts on 2026-10-04T01:01:14.293Z —
-- do not hand-edit, re-run it.
--
-- This part: 56 events · fill 134 · correct 6 · clear 5 (conflict 0, contradicted 0, unsupported 5).
-- EXPECTED ROWS: 145. A row only updates while final_placement still holds
-- the value it was generated from ("old" below); the DO block raises, rolling
-- this part back, unless exactly 145 rows match. Regenerate instead of forcing it.
-- All 1 parts: 56 events · fill 134 · correct 6 · clear 5 (conflict 0, contradicted 0, unsupported 5).
--
-- Back up first (once, before part 01):
--   create table public.usau_event_teams_placement_backup_20261003 as
--     select event_id, team_id, final_placement from public.usau_event_teams;
--   alter table public.usau_event_teams_placement_backup_20261003 enable row level security;
--   revoke all on public.usau_event_teams_placement_backup_20261003 from anon, authenticated;
-- Restore from it:
--   update public.usau_event_teams et set final_placement = b.final_placement
--     from public.usau_event_teams_placement_backup_20261003 b
--    where et.event_id = b.event_id and et.team_id = b.team_id
--      and et.final_placement is distinct from b.final_placement;
--
-- Events (evaluated through PostgREST, end_date vs 2026-10-04 UTC); settled ones are
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
  v_expected constant int := 145;
  v_updated int;
BEGIN
  update public.usau_event_teams et
     set final_placement = v.new_place
    from (values
      -- CLUB · 2025 · 2025 Red River Men's Sectional Championship (2025-red-river-mens-sectional-championship) · ended 2025-09-07
      ('859f94e6-ce2f-4376-8cf7-729fc1f48bb7'::uuid, 'e2d88971-d9a2-4e69-8ca2-13449b177285'::uuid, null::int, 4::int),
      ('859f94e6-ce2f-4376-8cf7-729fc1f48bb7', '6b766675-73f0-4721-97bb-7582f679d0e3', null, 5),
      ('859f94e6-ce2f-4376-8cf7-729fc1f48bb7', 'db3dcd97-f60f-430a-95d5-5ca13d003823', null, 6),
      -- CLUB · 2026 · Scuffletown Throwdown 2026 (Scuffletown-Throwdown-2026) · ended 2026-06-14
      ('777575f8-a634-4b1e-b35b-004df0fe65c2', '596ab7bc-f71c-4d60-9d9d-17f9df07762b', null, 5),
      ('777575f8-a634-4b1e-b35b-004df0fe65c2', '79adcc75-608f-4a57-88f6-4017f41ce0a7', null, 6),
      ('777575f8-a634-4b1e-b35b-004df0fe65c2', '3708592e-e3d7-4a0e-954c-389f174e8941', null, 7),
      -- CLUB · 2026 · Club Terminus 2026 (club-terminus-2026) · ended 2026-06-28
      ('742a2987-58f2-4092-a977-b44415003b78', '3e708995-5124-4e1b-82f2-7ba8c2b2b4bf', null, 5),
      ('742a2987-58f2-4092-a977-b44415003b78', 'c6b272ba-64fa-47ec-9fc5-0933eef8a225', null, 6),
      -- CLUB · 2026 · Flickel City Classic (Flickel-City-Classic) · ended 2026-07-12
      ('87c56ee8-a11b-4e4d-b2a2-0bc3782ca514', 'ccb52c9d-5567-404e-8590-b16ac6828fbf', null, 5),
      ('87c56ee8-a11b-4e4d-b2a2-0bc3782ca514', '9e7ed5ba-fc05-4bd2-975d-941e027af715', null, 6),
      ('87c56ee8-a11b-4e4d-b2a2-0bc3782ca514', 'e0d3cb9e-ebf7-4ff3-84b2-5119b8a19dd0', null, 7),
      -- CLUB · 2026 · Lehigh Valley Invite 2026 (Lehigh-Valley-Invite-2026) · ended 2026-08-02
      ('a509211f-14b1-4dc6-b034-967ed0a3b5a0', '2c6a2bd3-f5a6-4ac4-806d-9003081517b0', null, 5),
      ('a509211f-14b1-4dc6-b034-967ed0a3b5a0', '5a923b4e-10b2-4a96-bde5-17e7b809125c', null, 6),
      ('a509211f-14b1-4dc6-b034-967ed0a3b5a0', 'cd931074-a8bd-4456-9e79-d32a64ad52e9', null, 13),
      ('a509211f-14b1-4dc6-b034-967ed0a3b5a0', '69ff5c0c-ff78-4ff5-9fc7-d61ca2230826', null, 14),
      -- CLUB · 2026 · 2026 Gulf Coast Mixed Sectional Championship (2026-Gulf-Coast-Mixed-Sectional-Championship) · ended 2026-09-13
      ('b2d596d7-b884-4240-a960-43c418b5ad0a', '388a6094-4f7e-45e5-aa3e-d92acdc95b9d', null, 4),
      -- CLUB · 2026 · 2026 Northwest Plains Mixed Sectional Championship (2026-Northwest-Plains-Mixed-Sectional-Championship) · ended 2026-09-13
      ('ab6f97f6-531a-40dc-bde1-9f0ab2fb6589', '4c99e779-a419-4414-b105-95ef929c8f66', null, 5),
      ('ab6f97f6-531a-40dc-bde1-9f0ab2fb6589', '597ca6cb-d51a-4f30-9efd-5eba90b7a412', null, 6),
      -- CLUB · 2026 · 2026 South New England Mixed Sectional Championship (2026-South-New-England-Mixed-Sectional-Championship) · ended 2026-09-13
      ('4940e184-16d3-4243-9ecd-5dfb13d412b2', '98e0af34-e204-483a-86f4-dc9bcb4a81ba', null, 3),
      ('4940e184-16d3-4243-9ecd-5dfb13d412b2', '0c415e94-8ea2-4955-87cb-0f4f1c47d104', null, 4),
      ('4940e184-16d3-4243-9ecd-5dfb13d412b2', '0e217170-8329-4e1d-a8c0-b125dc911ecf', null, 5),
      ('4940e184-16d3-4243-9ecd-5dfb13d412b2', 'a3832427-cfc9-45db-9c18-84ed6318ce53', null, 5),
      -- CLUB · 2026 · 2026 Upstate New York Mixed Sectional Championship (2026-Upstate-New-York-Mixed-Sectional-Championship) · ended 2026-09-13
      ('f22f254c-7b6d-4fc5-a504-12c12fd3e28b', 'a6a5984c-0af3-45c1-8129-56bba0ad8cca', null, 4),
      ('f22f254c-7b6d-4fc5-a504-12c12fd3e28b', '7a5dcda5-6950-4ea5-b80d-10680f5c3a45', null, 5),
      ('f22f254c-7b6d-4fc5-a504-12c12fd3e28b', '931197de-4021-4967-8f13-5a805296a778', null, 6),
      -- CLUB · 2026 · 2026 West Bay Mixed Sectional Championship (2026-West-Bay-Mixed-Sectional-Championship) · ended 2026-09-13
      ('ab298c39-9279-40d6-b6c2-1bc1505283f8', 'e468f512-af04-4655-9090-33272173a770', null, 8),
      ('ab298c39-9279-40d6-b6c2-1bc1505283f8', 'a0a187ca-ff65-400d-b522-fc42ef74cd7a', null, 9),
      ('ab298c39-9279-40d6-b6c2-1bc1505283f8', '28288299-0b4f-4106-b0f0-8bda422a1a09', null, 10),
      -- CLUB · 2026 · 2026 West Plains Mixed Sectional Championship (2026-West-Plains-Mixed-Sectional-Championship) · ended 2026-09-13
      ('dc276646-25b7-47e8-8fd4-ac29c0f198f2', 'b75ad8ca-410e-4527-ab66-117bb17149b4', null, 4),
      ('dc276646-25b7-47e8-8fd4-ac29c0f198f2', '48c2dd97-33f4-480f-a098-e3e1f4cf15d3', null, 5),
      ('dc276646-25b7-47e8-8fd4-ac29c0f198f2', 'e8439a33-6642-4140-ac0f-90bd6a9c6b92', null, 6),
      -- CLUB · 2026 · 2026 Great Lakes Mens Club Regional Championship (2026-Great-Lakes-Mens-Club-Regional-Championship) · ended 2026-09-27
      ('e7b7ecae-10e0-4191-b5c9-4fc7a3a3dc5f', '22b13c83-1024-4c8c-bc6c-338f4bfcf96e', null, 1),
      ('e7b7ecae-10e0-4191-b5c9-4fc7a3a3dc5f', '7e546b45-d0bd-4122-9615-5d083354dee0', null, 2),
      ('e7b7ecae-10e0-4191-b5c9-4fc7a3a3dc5f', 'dc370a69-2b08-443a-b9e2-747a37d73af9', null, 3),
      ('e7b7ecae-10e0-4191-b5c9-4fc7a3a3dc5f', '86168270-63f8-4e84-b3ea-e5f83ff0ec04', null, 4),
      ('e7b7ecae-10e0-4191-b5c9-4fc7a3a3dc5f', '4807cde3-f585-4313-af32-a2c1d1f08a9e', null, 7),
      ('e7b7ecae-10e0-4191-b5c9-4fc7a3a3dc5f', '075623cf-f6ee-49b2-9cfa-f20f3636c7a7', null, 8),
      ('e7b7ecae-10e0-4191-b5c9-4fc7a3a3dc5f', 'f21edb9c-30ee-4979-80a1-2c9997cec60e', null, 9),
      ('e7b7ecae-10e0-4191-b5c9-4fc7a3a3dc5f', 'fd183891-5123-459e-bfac-67e2d1f25b24', null, 9),
      ('e7b7ecae-10e0-4191-b5c9-4fc7a3a3dc5f', '393677c9-df30-47d0-8931-fdfd6abb3e3f', null, 11),
      ('e7b7ecae-10e0-4191-b5c9-4fc7a3a3dc5f', 'b4751e99-d70a-4424-9e8c-834012639814', null, 12),
      -- CLUB · 2026 · 2026 Northeast Mixed Club Regional Championship (2026-Northeast-Mixed-Club-Regional-Championship) · ended 2026-09-27
      ('fc1fb52d-e713-4e1e-9b66-40e799bfd7cc', 'cd46ee4b-1027-4895-b9f3-add6535103d8', null, 4),
      -- CLUB · 2026 · 2026 Northeast Womens Club Regional Championship (2026-Northeast-Womens-Club-Regional-Championship) · ended 2026-09-27
      ('5536d42f-6e4a-493b-a5af-9ad80f9914b4', 'cb9f133e-6dae-4d96-9ad0-851c6a4e7eb6', null, 4),
      -- CLUB · 2026 · 2026 South Central Mens Club Regional Championship (2026-South-Central-Mens-Club-Regional-Championship) · ended 2026-09-27
      ('d8e243d0-ef67-481c-9a7c-79587924233f', 'c9e2ec95-6712-43a9-95e5-982a804be694', null, 4),
      -- CLUB · 2026 · 2026 South Central Womens Club Regional Championship (2026-South-Central-Womens-Regional-Championship) · ended 2026-09-27
      ('dc741305-af62-4902-86c2-311f40083a1d', '98d397d5-9a2b-46f0-a11c-23822fad1868', null, 4),
      -- COLLEGE_D1 · 2022 · Greater New England D-I College Men's CC (Greater-New-England-D-I-College-Mens-CC-2022) · ended 2022-04-17
      ('8600392b-8261-4c6c-83ab-5a3626e21ba8', '925103c5-a9be-44c6-afac-c556daeb3cb5', null, 5),
      ('8600392b-8261-4c6c-83ab-5a3626e21ba8', '95252c52-8014-4e11-9622-ae471724025a', null, 6),
      ('8600392b-8261-4c6c-83ab-5a3626e21ba8', 'e4e452a2-160d-418f-9b6e-c4ec24967118', null, 7),
      ('8600392b-8261-4c6c-83ab-5a3626e21ba8', 'e595c76f-7088-476b-bedc-57d35481ee16', null, 7),
      -- COLLEGE_D1 · 2022 · Ozarks D-I College Men's CC (Ozarks-D-I-College-Mens-CC-2022) · ended 2022-04-17
      ('5f1d318f-e77e-4177-b946-b108c9928dc5', 'd4f8cd2b-fa96-438e-a103-e0a260d7539f', null, 5),
      ('5f1d318f-e77e-4177-b946-b108c9928dc5', '38955388-1ec4-402d-a1f4-f884707cad45', null, 6),
      ('5f1d318f-e77e-4177-b946-b108c9928dc5', '4d4dbc07-3214-425c-a474-734d17451f78', null, 7),
      -- COLLEGE_D1 · 2023 · Cascadia D-I College Men's CC (Cascadia-D-I-College-Mens-CC-2023) · ended 2023-04-16
      ('cd8fa895-b971-4634-a2fd-b63085494a3e', '9367560d-fdff-4a18-95f3-718ace3357ec', 3, 2), -- correct
      ('cd8fa895-b971-4634-a2fd-b63085494a3e', 'f7d675cf-3d3d-4bcf-aecf-382935b54996', 2, 3), -- correct
      -- COLLEGE_D1 · 2023 · Greater New England Dev College Men's CC (Greater-New-England-Dev-College-Mens-CC-2023) · ended 2023-04-23
      ('b64e744a-a4d6-47db-b7fb-d536e903c90d', '7e0d691c-98d4-4018-807c-16b77d4dfbd6', null, 4),
      -- COLLEGE_D1 · 2024 · Metro Boston Dev College Men's Conferences (Metro-Boston-Dev-Mens-Conferences-2024) · ended 2024-04-14
      ('277bba3a-0b0f-4e10-8212-5f4205306a31', 'ceee98d5-8a09-4a30-9945-c081e2694cd2', null, 4),
      -- COLLEGE_D1 · 2024 · Michigan D-I College Men's Conferences (Michigan-D-I-Mens-Conferences-2024) · ended 2024-04-14
      ('fb0ff6c2-f24d-4b9e-986c-8129c6780462', '33ee1fa9-e245-42e3-be99-3aee8d5f8853', null, 1),
      ('fb0ff6c2-f24d-4b9e-986c-8129c6780462', 'f795d40b-2b48-4209-b669-c38ac0cadae4', null, 2),
      -- COLLEGE_D1 · 2024 · Southeast Dev College Men's Conferences (Southeast-Dev-Mens-Conferences-2024) · ended 2024-04-14
      ('6929ecca-1c93-4f2e-b7e6-5ece5e52da23', '3df6744c-5fb1-4c14-9d9f-50894d4ee7c6', null, 5),
      ('6929ecca-1c93-4f2e-b7e6-5ece5e52da23', '34a7b876-b763-4520-9401-b8ab4f677469', null, 6),
      -- COLLEGE_D1 · 2024 · Southern Appalachian D-I College Men's Conferences (Southern-Appalachian-D-I-Mens-Conferences-2024) · ended 2024-04-14
      ('b763b7c7-a316-47ce-a8a1-f8d63e606b23', '17fe023f-ed52-4dc6-bee8-f80b0599ca51', null, 4),
      ('b763b7c7-a316-47ce-a8a1-f8d63e606b23', 'f69bc1e0-15a6-41ba-b632-2ed0908ba02a', null, 5),
      ('b763b7c7-a316-47ce-a8a1-f8d63e606b23', '1f36adc1-f0e7-43e3-85ea-a1410ca65ca0', null, 6),
      ('b763b7c7-a316-47ce-a8a1-f8d63e606b23', '639d4bd2-b1fc-432e-84a3-69a6295c71b0', null, 7),
      ('b763b7c7-a316-47ce-a8a1-f8d63e606b23', 'e2da3b04-ac9f-4baa-b717-3b764f2bfee8', null, 8),
      -- COLLEGE_D1 · 2024 · New England Dev College Women's Conferences (New-England-Dev-Womens-Conferences-2024) · ended 2024-04-21
      ('4727dafd-f897-4a87-8398-fbfb9a0706a6', 'f78a2726-beaf-425e-bdfc-1c323c669b87', null, 4),
      -- COLLEGE_D1 · 2024 · West Penn D-I College Men's Conferences (West-Penn-D-I-Mens-Conferences-2024) · ended 2024-04-21
      ('5aa4346d-6c32-4c9a-b588-5d124fb6058a', '2c5c1595-5365-413f-933e-16ba5de207b6', null, 4),
      ('5aa4346d-6c32-4c9a-b588-5d124fb6058a', '05b76364-9ee4-4615-b8b1-87fe0131d7f5', null, 5),
      ('5aa4346d-6c32-4c9a-b588-5d124fb6058a', 'b69470e8-0ad2-44b1-9aed-1ddbef40123e', null, 6),
      -- COLLEGE_D1 · 2024 · North Central D-I College Men's Regionals (North-Central-D-I-College-Mens-Regionals-2024) · ended 2024-04-28
      ('ee0d9725-665a-45c4-b69c-dd4b18add967', 'eedac4e2-ac58-4c0a-b17e-8e5e5fa5b62e', null, 13),
      ('ee0d9725-665a-45c4-b69c-dd4b18add967', 'ddde10a1-bc5d-4372-9d80-95b18fb02ec8', null, 14),
      -- COLLEGE_D1 · 2025 · Great Lakes Dev Men's Conferences (Great-Lakes-Dev-Mens-Conferences-2025) · ended 2025-04-13
      ('cb77a750-90d8-4d82-9cd5-979dddf005df', 'afe9c050-b37e-4d5a-87e8-58d90395f763', null, 4),
      -- COLLEGE_D1 · 2025 · New England Dev Women's Conferences (New-England-Dev-Womens-Conferences-2025) · ended 2025-04-13
      ('b4a77517-ef4d-47a3-a60b-85a368d687fa', '41c24388-bf9f-47a7-ab73-3b22dc46aafa', null, 4),
      -- COLLEGE_D1 · 2025 · Ohio Valley Dev Men's Conferences (Ohio-Valley-Dev-Mens-Conferences-2025) · ended 2025-04-13
      ('833843f8-ecce-414c-a4e7-fa8dd06517fc', 'd479f3a9-e3cd-45f2-9218-34067c071f22', null, 4),
      -- COLLEGE_D1 · 2025 · South Texas D-I Men's Conferences (South-Texas-D-I-Mens-Conferences-2025) · ended 2025-04-13
      ('758db59e-1ea2-414f-9eb1-3ee249c2b26b', 'fe13c16f-2a30-4d36-9d9c-0fbf9694cef7', null, 3),
      ('758db59e-1ea2-414f-9eb1-3ee249c2b26b', 'e018f447-f185-4057-a87a-359c813a55eb', null, 4),
      -- COLLEGE_D1 · 2025 · Big Sky D-I Men's Conferences (Big-Sky-D-I-Mens-Conferences-2025) · ended 2025-04-20
      ('740a1d9b-2b75-4aca-88fe-3c7e3fd3f668', '1a9f3851-a2bb-4d9a-b374-841bdb721b07', null, 4),
      ('740a1d9b-2b75-4aca-88fe-3c7e3fd3f668', '36e40274-f24e-4986-9ac7-858bf952101a', null, 5),
      ('740a1d9b-2b75-4aca-88fe-3c7e3fd3f668', '49ec3072-89bf-49ee-a982-5d9c51d924fc', null, 6),
      ('740a1d9b-2b75-4aca-88fe-3c7e3fd3f668', 'e04cea82-d7c3-4f2b-8f3b-96487b17e58a', 3, null), -- clear-unsupported
      -- COLLEGE_D1 · 2025 · East Penn D-I Men's Conferences (East-Penn-D-I-Mens-Conferences) · ended 2025-04-20
      ('ae731c68-fa11-4100-917c-9131d7ccb705', '70c9d0d9-c8fc-40d3-9b2f-56bdc28f5a8c', null, 6),
      -- COLLEGE_D1 · 2026 · East Plains D-I Men's Conferences (East-Plains-D-I-Mens-Conferences-2026) · ended 2026-04-11
      ('98f94aa2-fe03-4178-b716-d6366cab5a50', '8fe0da85-e95c-4f14-8e59-b6d8d2edaaa7', null, 4),
      ('98f94aa2-fe03-4178-b716-d6366cab5a50', '45566fc3-dbe9-404a-bdb1-5a9ddfae2bc6', null, 5),
      ('98f94aa2-fe03-4178-b716-d6366cab5a50', '04e674ea-e3e2-4a40-a8d1-aa537bfb9965', null, 6),
      -- COLLEGE_D1 · 2026 · Cascadia D-I Men's Conferences (Cascadia-D-I-Mens-Conferences-2026) · ended 2026-04-12
      ('a06968b5-c5a6-44c2-afc6-1b31109c44b1', '2e262acd-22cd-4650-8a46-c3b8ee08d71f', null, 4),
      ('a06968b5-c5a6-44c2-afc6-1b31109c44b1', 'bc08b9ef-bde4-40b0-b3cd-bb2a2d54cfda', 3, 5), -- correct
      ('a06968b5-c5a6-44c2-afc6-1b31109c44b1', 'aad4d8f3-2ea8-4a78-a30a-76ef401c6146', 4, 6), -- correct
      -- COLLEGE_D1 · 2026 · Cascadia D-I Women's Conferences (Cascadia-D-I-Womens-Conferences-2026) · ended 2026-04-12
      ('13dbb2e0-70f1-4396-b73e-68b5febe4fa9', 'a4bba488-2bcc-4a0c-ad9c-12bb76969c4c', null, 3),
      ('13dbb2e0-70f1-4396-b73e-68b5febe4fa9', 'cd666a16-4a99-4818-ac38-dcb93263fced', null, 4),
      ('13dbb2e0-70f1-4396-b73e-68b5febe4fa9', '71c72088-d8fb-4e12-a49c-02e3b75f4699', null, 5),
      ('13dbb2e0-70f1-4396-b73e-68b5febe4fa9', 'a4648a2c-c11e-4c9e-b0df-2a0450c6e6c4', null, 5),
      -- COLLEGE_D1 · 2026 · Desert D-I Men's Conferences (Desert-D-I-Mens-Conferences-2026) · ended 2026-04-12
      ('fd8e9e7c-e4e1-45d9-bb1a-427106c64215', '641eab9f-4010-4c04-890b-b26314d10848', null, 4),
      -- COLLEGE_D1 · 2026 · Gulf Coast D-I Men's Conferences (Gulf-Coast-D-I-Mens-Conferences-2026) · ended 2026-04-12
      ('9f5ba454-637d-4da9-950c-befe7e88d3f9', '79bcf525-6e26-4c17-8851-a5c36e87672b', null, 5),
      ('9f5ba454-637d-4da9-950c-befe7e88d3f9', 'ebaf675c-9d62-4992-a963-de7f1d1c1f0f', null, 6),
      ('9f5ba454-637d-4da9-950c-befe7e88d3f9', 'b36520a7-1544-45c2-acfd-49ffea336224', null, 7),
      ('9f5ba454-637d-4da9-950c-befe7e88d3f9', 'dad28819-8543-4a23-905a-43b752825a6a', null, 7),
      -- COLLEGE_D1 · 2026 · NorCal D-I Men's Conferences (NorCal-D-I-Mens-Conferences-2026) · ended 2026-04-12
      ('000f2be2-9587-449a-843f-cff6ef4fc316', 'bad6a458-7471-4223-9ee6-6a62eeaa45d0', null, 4),
      ('000f2be2-9587-449a-843f-cff6ef4fc316', 'd194a3cd-7cb6-4832-a605-efa9e8ef772b', null, 5),
      ('000f2be2-9587-449a-843f-cff6ef4fc316', '12ce9d55-da04-4a5d-ae93-2d21e596e8cf', null, 6),
      -- COLLEGE_D1 · 2026 · Southern Appalachian D-I Men's Conferences (Southern-Appalachian-D-I-Mens-Conferences-2026) · ended 2026-04-12
      ('2a346282-41ed-476d-a12e-a997ad5e670a', '34521539-3379-4615-ad19-515d1a30f774', null, 1),
      ('2a346282-41ed-476d-a12e-a997ad5e670a', '73fcfd26-e347-4c51-80f9-53c3758080b4', null, 2),
      ('2a346282-41ed-476d-a12e-a997ad5e670a', 'ff46f3e8-6ea8-4992-b3ac-b03452dad7ab', null, 3),
      ('2a346282-41ed-476d-a12e-a997ad5e670a', '61aad094-5ab6-4cce-8a97-5c5c414ea9a6', null, 4),
      ('2a346282-41ed-476d-a12e-a997ad5e670a', '7aa2a2b6-bde1-4024-b621-5f9930d533ec', null, 5),
      ('2a346282-41ed-476d-a12e-a997ad5e670a', 'eef54f7f-327e-4ce9-96f8-91682b1d083b', null, 6),
      ('2a346282-41ed-476d-a12e-a997ad5e670a', 'eed2b132-d462-4f98-b3cb-35016e27d0e1', null, 7),
      ('2a346282-41ed-476d-a12e-a997ad5e670a', '180875ea-68db-461c-a6ff-ddf727dea789', null, 8),
      ('2a346282-41ed-476d-a12e-a997ad5e670a', 'accc68a8-afe0-4e6e-a4ac-51aac9fdaa45', null, 9),
      ('2a346282-41ed-476d-a12e-a997ad5e670a', '1c651135-723d-4981-8c67-c19b5e2fdc86', null, 10),
      ('2a346282-41ed-476d-a12e-a997ad5e670a', '3e2c056c-4b1f-4023-b655-5184d4f24686', null, 11),
      ('2a346282-41ed-476d-a12e-a997ad5e670a', 'f66d8d53-d4c9-4219-8ade-c0855dd6095b', null, 12),
      -- COLLEGE_D1 · 2026 · Southwest Dev Men's Conferences (Southwest-Dev-Mens-Conferences-2026) · ended 2026-04-12
      ('28c9af12-2820-4ae0-ac9b-495fb34eb4ee', 'd658086b-5cc6-48c5-a824-03e6d7e3582a', null, 4),
      -- COLLEGE_D1 · 2026 · New England Dev Men's Conferences (New-England-Dev-Mens-Conferences-2026) · ended 2026-04-19
      ('402fb887-078b-41ea-965c-8e0a72518abc', 'd58cd59c-b23e-40ae-b751-845c933af1a0', null, 4),
      ('402fb887-078b-41ea-965c-8e0a72518abc', '9ac82e7c-0b0d-4435-83bb-c512fe2e37e4', null, 5),
      ('402fb887-078b-41ea-965c-8e0a72518abc', '70d152cb-6f77-4791-a8a6-e13625a3bb84', null, 6),
      -- COLLEGE_D1 · 2026 · SoCal D-I Men's Conferences (SoCal-D-I-Mens-Conferences-2026) · ended 2026-04-19
      ('03e19e88-38be-494f-8b6c-f6bc67c4ee23', 'faa81503-761f-41ad-857d-3829d330dfca', null, 8),
      ('03e19e88-38be-494f-8b6c-f6bc67c4ee23', '339bd3b2-4bf6-40c3-8343-6b558bf7b7c7', null, 9),
      ('03e19e88-38be-494f-8b6c-f6bc67c4ee23', '587d15df-b246-46b3-b482-358388e041cc', null, 10),
      -- COLLEGE_D1 · 2026 · South Central D-I College Men's Regionals (South-Central-D-I-College-Mens-Regionals-2026) · ended 2026-04-26
      ('f51951be-3af5-44d4-a6df-093087a363d2', '248bbb9b-1ee4-4cb8-8a76-505d9ae74754', null, 4),
      -- COLLEGE_D3 · 2022 · Hudson Valley D-III College Men's CC (Hudson-Valley-D-III-College-Mens-CC-2022) · ended 2022-04-24
      ('55e07fcd-aad4-4072-b0c9-c3963ec0fcc3', 'd1e726b0-3805-47cb-9afc-35e0536aea5a', null, 8),
      -- COLLEGE_D3 · 2022 · North Central D-III College Men's Regionals (North-Central-D-III-College-Mens-Regionals-2022) · ended 2022-05-08
      ('7642d994-bfb3-43aa-8a75-76f6382dbdc3', 'b24a5206-3e25-4f20-9d5b-15d30c96b077', null, 2),
      ('7642d994-bfb3-43aa-8a75-76f6382dbdc3', '9a19e7c9-c0d6-41fe-814d-67b128b9a383', 2, 3), -- correct
      ('7642d994-bfb3-43aa-8a75-76f6382dbdc3', '52a6f3f7-e583-4b63-8b9a-a620a3d59512', 3, 4), -- correct
      ('7642d994-bfb3-43aa-8a75-76f6382dbdc3', '6cd21ebb-fb08-4570-8c9e-1d7febec14e6', 4, null), -- clear-unsupported
      -- COLLEGE_D3 · 2023 · Eastern Great Lakes D-III College Men's CC (Eastern-Great-Lakes-D-III-College-Mens-CC-2023) · ended 2023-04-16
      ('122436c7-c288-4cf1-ad89-3cb612b4d37e', '75ca4925-44f4-42cb-ae97-e7cb90c9fda6', 4, null), -- clear-unsupported
      ('122436c7-c288-4cf1-ad89-3cb612b4d37e', '851b95b4-07fe-4ede-914c-de27e9a90cf4', 5, null), -- clear-unsupported
      -- COLLEGE_D3 · 2023 · Ohio Valley D-III College Men's Regionals (Ohio-Valley-D-III-College-Mens-Regionals-2023) · ended 2023-04-30
      ('575bd867-2193-44b6-9794-20121985bb69', '4f6247fc-a282-40ce-9ac9-15cc2d07f7ad', null, 7),
      ('575bd867-2193-44b6-9794-20121985bb69', '79621b6e-12cc-43b0-b001-8551c8930e48', null, 7),
      -- COLLEGE_D3 · 2024 · East Penn D-III College Men's Conferences (East-Penn-D-III-Mens-Conferences-2024) · ended 2024-04-14
      ('04d2af55-d9ba-41d5-9870-8d50530fe326', 'ffbab09a-a5f5-4e07-aea1-fc962d2ea303', null, 2),
      ('04d2af55-d9ba-41d5-9870-8d50530fe326', '8967c906-7c3b-4395-8d21-3425cfc7cb97', null, 3),
      ('04d2af55-d9ba-41d5-9870-8d50530fe326', '4a3a8195-4efc-4058-9b74-4acc1376adaa', null, 4),
      -- COLLEGE_D3 · 2024 · Lake Superior D-III College Men's Conferences (Lake-Superior-D-III-Mens-Conferences-2024) · ended 2024-04-14
      ('351b8796-1d2b-47ef-b0aa-5136e17a35fa', '89fc24a3-f9a9-4fc8-9030-d00b14de2504', null, 2),
      ('351b8796-1d2b-47ef-b0aa-5136e17a35fa', '7faff7e6-3b9d-46e3-a9b5-c15e0db324f0', null, 3),
      -- COLLEGE_D3 · 2024 · Northwest D-III College Women's Conferences (Northwest-D-III-Womens-Conferences-2024) · ended 2024-04-14
      ('bc872064-84c4-4e00-be02-59a175429cf5', '9e658964-8cad-44a7-b9b7-2fc69e773229', null, 4),
      -- COLLEGE_D3 · 2024 · South Central D-III College Women's Conferences (South-Central-D-III-Womens-Conferences-2024) · ended 2024-04-14
      ('dd0a0288-0bdd-42b7-a5a0-e9d17ddd1ef5', '47e181ab-3aad-412f-bba3-eb75cc1dcfb1', null, 3),
      -- COLLEGE_D3 · 2024 · New England D-III College Men's Regionals (New-England-D-III-College-Mens-Regionals-2024) · ended 2024-05-05
      ('e54e0e96-8968-4e25-94d7-bfe8ac750481', 'baf9b8b6-2ac3-40b2-9ae5-173b94f78df7', null, 11),
      -- COLLEGE_D3 · 2025 · East Penn D-III Men's Conferences (East-Penn-D-III-Mens-Conferences-2025) · ended 2025-04-12
      ('d12618de-959a-45e8-b111-0fe31844f4fb', 'd0f01c03-5b25-44c6-ac80-ec8e379ef3df', null, 4),
      -- COLLEGE_D3 · 2026 · Hudson Valley D-III Men's Conferences (Hudson-Valley-D-III-Mens-Conferences-2026) · ended 2026-04-19
      ('0343f1f3-56c6-4c8a-8316-0eeaa6b1692c', '099d9966-e250-454a-bb53-d28b66beb395', null, 8),
      ('0343f1f3-56c6-4c8a-8316-0eeaa6b1692c', '19c650d1-5a51-41a1-8287-725bf71b8eff', null, 9),
      ('0343f1f3-56c6-4c8a-8316-0eeaa6b1692c', '18949768-d7d3-488d-9c18-1eb8a07daeeb', null, 10),
      ('0343f1f3-56c6-4c8a-8316-0eeaa6b1692c', '0c779d3b-f927-4219-9e6c-b86f2815e9e2', 7, null), -- clear-unsupported
      -- COLLEGE_D3 · 2026 · Southeast D-III Men's Conferences (Southeast-D-III-Mens-Conferences-2026) · ended 2026-04-26
      ('ef9fa447-e5f8-4e42-8f14-652a712307a4', 'b5321870-3224-4b5e-abca-445307b6276b', null, 5),
      ('ef9fa447-e5f8-4e42-8f14-652a712307a4', '4575a0bb-c69c-4e3c-bff6-3d230c990f3c', null, 6),
      ('ef9fa447-e5f8-4e42-8f14-652a712307a4', '12af58c8-52d0-4fa0-8467-0a70c046fefd', null, 7),
      ('ef9fa447-e5f8-4e42-8f14-652a712307a4', 'b540a44e-438d-49dd-84a6-63e65f30af47', null, 7)
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

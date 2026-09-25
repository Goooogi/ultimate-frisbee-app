-- USAU per-event final placements — repair + fill, part 12 of 12.
--
-- The 2026-07-20 one-shot derivePlacements() backfill (Feature Backlog #18)
-- stored misread brackets, game-to-go losers kept 2nd, and ties that a later
-- game had settled; nothing derived placements after it. Regenerated with the
-- fixed algorithm by scripts/derive-usau-placements.ts on 2026-09-23T15:15:42.828Z —
-- do not hand-edit, re-run it.
--
-- This part: 64 events · fill 376 · correct 34 · clear 18 (conflict 4, contradicted 2, unsupported 12).
-- EXPECTED ROWS: 428. A row only updates while final_placement still holds
-- the value it was generated from ("old" below); the DO block raises, rolling
-- this part back, unless exactly 428 rows match. Regenerate instead of forcing it.
-- All 12 parts: 1469 events · fill 7901 · correct 428 · clear 247 (conflict 31, contradicted 127, unsupported 89).

DO $migration$
DECLARE
  v_expected constant int := 428;
  v_updated int;
BEGIN
  update public.usau_event_teams et
     set final_placement = v.new_place
    from (values
      -- COLLEGE_D3 · 2026 · Western NY D-III Men's Conferences (Western-NY-D-III-Mens-Conferences-2026) · ended 2026-04-12
      ('2b37ef0f-7b5f-4f4b-9e06-8c37fc7cd50d'::uuid, '8d27b463-aacf-4b4e-ab05-3691551963c0'::uuid, null::int, 1::int),
      ('2b37ef0f-7b5f-4f4b-9e06-8c37fc7cd50d', '5d19f15f-88d7-402a-87ab-cb54795453e1', null, 2),
      ('2b37ef0f-7b5f-4f4b-9e06-8c37fc7cd50d', 'f3ca1931-28ae-4db2-8692-50e5c9da46be', null, 3),
      ('2b37ef0f-7b5f-4f4b-9e06-8c37fc7cd50d', '3d7e6a7a-46fb-4230-82c8-360f4ca5279a', null, 4),
      ('2b37ef0f-7b5f-4f4b-9e06-8c37fc7cd50d', '52ee31e9-76d3-44d8-9efb-0c8e9a911e89', null, 5),
      ('2b37ef0f-7b5f-4f4b-9e06-8c37fc7cd50d', 'c11f337c-d201-410f-9809-d54399994924', null, 6),
      -- COLLEGE_D3 · 2026 · Hudson Valley D-III Men's Conferences (Hudson-Valley-D-III-Mens-Conferences-2026) · ended 2026-04-19
      ('0343f1f3-56c6-4c8a-8316-0eeaa6b1692c', 'bc4b0b71-4521-4eaa-bc5e-c179da99f567', null, 1),
      ('0343f1f3-56c6-4c8a-8316-0eeaa6b1692c', 'c977864e-5d9b-459e-a837-ac0abdab595a', null, 2),
      ('0343f1f3-56c6-4c8a-8316-0eeaa6b1692c', '8470f342-1ed6-4df3-9704-f6f0b44c5efe', null, 3),
      ('0343f1f3-56c6-4c8a-8316-0eeaa6b1692c', '4f49aa49-44ef-478e-8554-73adb628c6e5', null, 4),
      ('0343f1f3-56c6-4c8a-8316-0eeaa6b1692c', 'c5c98cdb-5a10-4abf-9514-4923ec743722', null, 5),
      ('0343f1f3-56c6-4c8a-8316-0eeaa6b1692c', '9869ff5c-98d9-44cf-80f2-7df60df60197', null, 6),
      ('0343f1f3-56c6-4c8a-8316-0eeaa6b1692c', '0c779d3b-f927-4219-9e6c-b86f2815e9e2', null, 7),
      -- COLLEGE_D3 · 2026 · Metro East D-III College Men's Regionals (Metro-East-D-III-College-Mens-Regionals-2026) · ended 2026-04-26
      ('fe020937-a1d0-464b-ad01-b4676d5e11bb', '3d7e6a7a-46fb-4230-82c8-360f4ca5279a', null, 1),
      ('fe020937-a1d0-464b-ad01-b4676d5e11bb', '8d27b463-aacf-4b4e-ab05-3691551963c0', null, 2),
      ('fe020937-a1d0-464b-ad01-b4676d5e11bb', '5d19f15f-88d7-402a-87ab-cb54795453e1', null, 3),
      ('fe020937-a1d0-464b-ad01-b4676d5e11bb', '8470f342-1ed6-4df3-9704-f6f0b44c5efe', null, 3),
      ('fe020937-a1d0-464b-ad01-b4676d5e11bb', '9869ff5c-98d9-44cf-80f2-7df60df60197', null, 9),
      ('fe020937-a1d0-464b-ad01-b4676d5e11bb', 'c5c98cdb-5a10-4abf-9514-4923ec743722', null, 10),
      ('fe020937-a1d0-464b-ad01-b4676d5e11bb', '0c779d3b-f927-4219-9e6c-b86f2815e9e2', null, 11),
      ('fe020937-a1d0-464b-ad01-b4676d5e11bb', '099d9966-e250-454a-bb53-d28b66beb395', null, 12),
      -- COLLEGE_D3 · 2026 · Metro East D-III College Women's Regionals (Metro-East-D-III-College-Womens-Regionals-2026) · ended 2026-04-26
      ('f8c5c71e-bbb4-4dc9-be21-90641710d02a', 'c99df58d-ca9e-454b-9625-35cccc8dfe6f', null, 1),
      ('f8c5c71e-bbb4-4dc9-be21-90641710d02a', '8575515d-5554-4a7f-8ddc-79b3de16adb9', null, 2),
      ('f8c5c71e-bbb4-4dc9-be21-90641710d02a', 'b0faa4a8-da55-4c87-ab04-a8f090295486', null, 3),
      ('f8c5c71e-bbb4-4dc9-be21-90641710d02a', 'd72aedfa-0f8c-415f-8ec6-12bbfff53f05', null, 3),
      ('f8c5c71e-bbb4-4dc9-be21-90641710d02a', '2d181158-af72-4cc7-9ed6-2643c9455594', null, 5),
      ('f8c5c71e-bbb4-4dc9-be21-90641710d02a', '2117b53e-256c-4bb2-8391-f5b9f5e6da0f', null, 6),
      ('f8c5c71e-bbb4-4dc9-be21-90641710d02a', '90304604-6b4d-45d0-824d-88a8d3f65d74', null, 7),
      ('f8c5c71e-bbb4-4dc9-be21-90641710d02a', '879d477e-5105-400a-a896-84bdad2c9dcf', null, 8),
      -- COLLEGE_D3 · 2026 · New England D-III College Women's Regionals (New-England-D-III-College-Womens-Regionals-2026) · ended 2026-04-26
      ('cd3ce795-69f0-46d1-858d-21fa04c84b4f', 'd8506650-c9f5-4bee-96a1-41f0ef30ffd6', null, 1),
      ('cd3ce795-69f0-46d1-858d-21fa04c84b4f', '12cace19-0192-47f4-ae36-596eb9834c49', null, 2),
      ('cd3ce795-69f0-46d1-858d-21fa04c84b4f', 'b5d3e38d-e04a-4ffe-80a6-c0cd386921dd', null, 3),
      ('cd3ce795-69f0-46d1-858d-21fa04c84b4f', '55963c99-0562-427a-8030-ccedd89950fe', null, 4),
      ('cd3ce795-69f0-46d1-858d-21fa04c84b4f', 'ca9551ac-948a-424b-9438-f1f84558f1d1', null, 5),
      ('cd3ce795-69f0-46d1-858d-21fa04c84b4f', 'd5fc0af5-bb03-48a4-b96e-eb7a64fc2619', null, 6),
      -- COLLEGE_D3 · 2026 · North Central D-III College Men's Regionals (North-Central-D-III-College-Mens-Regionals-2026) · ended 2026-04-26
      ('34b8eec5-37c1-4038-b4d4-1a7fa68d8e6a', '46bde486-f8a1-4815-a60f-d8b63b741513', null, 1),
      ('34b8eec5-37c1-4038-b4d4-1a7fa68d8e6a', '5a547bb2-b910-4d1c-aec9-c45cb3a3d19c', null, 2),
      ('34b8eec5-37c1-4038-b4d4-1a7fa68d8e6a', 'b53f2373-973e-4e87-b47d-4b8d4a19e66f', null, 3),
      ('34b8eec5-37c1-4038-b4d4-1a7fa68d8e6a', 'a7af8e1c-0a89-4c15-b77b-30cb5e335459', null, 4),
      ('34b8eec5-37c1-4038-b4d4-1a7fa68d8e6a', '7c331352-c81c-47e1-93b9-0cdfbfd9a60d', null, 5),
      ('34b8eec5-37c1-4038-b4d4-1a7fa68d8e6a', 'd0f8e6eb-11ff-4367-8bf6-8712563c3c45', null, 5),
      ('34b8eec5-37c1-4038-b4d4-1a7fa68d8e6a', '6bfc8d7c-37c2-4fde-a213-2cdf4a9cf50e', null, 7),
      ('34b8eec5-37c1-4038-b4d4-1a7fa68d8e6a', '5ddd95ab-237d-4641-8de5-d8f011cb9dc9', null, 8),
      ('34b8eec5-37c1-4038-b4d4-1a7fa68d8e6a', 'f7d7dad7-542f-4b40-b916-d64c957cc217', null, 9),
      ('34b8eec5-37c1-4038-b4d4-1a7fa68d8e6a', 'ac7e3c2e-9958-4877-a687-af3ef50e18f6', null, 10),
      -- COLLEGE_D3 · 2026 · Ohio Valley D-III College Men's Regionals (Ohio-Valley-D-III-College-Mens-Regionals-2026) · ended 2026-04-26
      ('dcbf71ff-6f72-46df-809e-bca31521b64f', 'd96f221d-f95b-4f76-a371-401e5aeaefaa', null, 1),
      ('dcbf71ff-6f72-46df-809e-bca31521b64f', 'f014e8e1-2924-45a4-a00c-2af1d96743f4', null, 2),
      ('dcbf71ff-6f72-46df-809e-bca31521b64f', '91066665-580c-47c6-8de9-5e6dc54f65be', null, 3),
      ('dcbf71ff-6f72-46df-809e-bca31521b64f', '487c0251-b941-4023-a8fe-c1962bd63dd4', null, 4),
      ('dcbf71ff-6f72-46df-809e-bca31521b64f', 'fe2df970-6bde-495d-a85b-3b8fd4e9bb82', null, 5),
      ('dcbf71ff-6f72-46df-809e-bca31521b64f', '09eb4254-0b14-4c21-aa42-e2ae5ff7b7f4', null, 6),
      ('dcbf71ff-6f72-46df-809e-bca31521b64f', '4eab8843-a90e-4413-a1c4-391a7742d9c3', null, 7),
      ('dcbf71ff-6f72-46df-809e-bca31521b64f', 'f3122a2f-4ac3-421b-bb57-52fd7dd020b6', null, 8),
      ('dcbf71ff-6f72-46df-809e-bca31521b64f', '723b9bee-f675-46b9-9e84-30055b7b1a67', null, 9),
      ('dcbf71ff-6f72-46df-809e-bca31521b64f', '09700067-fe15-4534-9f60-1d87c478c69f', null, 10),
      -- COLLEGE_D3 · 2026 · Ohio Valley D-III College Women's Regionals (Ohio-Valley-D-III-College-Womens-Regionals-2026) · ended 2026-04-26
      ('f1a41d4d-9fee-438e-ad2a-bc5c15f67099', 'd0365f8d-e8cb-43a7-97b1-2065a47e61b4', null, 1),
      ('f1a41d4d-9fee-438e-ad2a-bc5c15f67099', '97e2e49a-6d52-4d72-b38e-596e5bb97a5b', null, 2),
      ('f1a41d4d-9fee-438e-ad2a-bc5c15f67099', '744d6d00-cd9e-419d-b6eb-4913a0f5663c', null, 3),
      ('f1a41d4d-9fee-438e-ad2a-bc5c15f67099', 'fb9f8119-51a7-482d-8fe7-ebeac6963508', null, 4),
      ('f1a41d4d-9fee-438e-ad2a-bc5c15f67099', '4109b494-c271-4eba-98d4-66113baf36b7', null, 5),
      ('f1a41d4d-9fee-438e-ad2a-bc5c15f67099', 'b6eb4f55-6882-46f1-8ed2-7c567f6cb9d3', null, 6),
      ('f1a41d4d-9fee-438e-ad2a-bc5c15f67099', '5d8894fb-aeab-42d3-a043-c52ed68c3583', null, 7),
      ('f1a41d4d-9fee-438e-ad2a-bc5c15f67099', '4f097086-eaad-4819-9eb6-f4ab90880e09', null, 8),
      -- COLLEGE_D3 · 2026 · South Central D-III College Men's Regionals (South-Central-D-III-College-Mens-Regionals-2026) · ended 2026-04-26
      ('6498298e-0358-44ca-9666-667a64248ddf', '3acc2003-34f0-406a-904c-2d80e41a1240', null, 1),
      ('6498298e-0358-44ca-9666-667a64248ddf', '2e977545-6564-4ce3-b9c2-db7229aee631', null, 2),
      ('6498298e-0358-44ca-9666-667a64248ddf', '530034ea-9784-42a2-ba6d-f8468116660a', null, 3),
      ('6498298e-0358-44ca-9666-667a64248ddf', '7d4fd2c8-b8b8-463d-9789-b06b4bc0b324', null, 4),
      ('6498298e-0358-44ca-9666-667a64248ddf', '4e2fe5fb-dee9-48d3-ae95-45871b68001e', null, 5),
      ('6498298e-0358-44ca-9666-667a64248ddf', 'aadd6033-1056-4457-b98f-f60e6a509d9a', null, 6),
      ('6498298e-0358-44ca-9666-667a64248ddf', '8ce50b21-b578-47e1-8063-c6ac5272ad01', null, 7),
      ('6498298e-0358-44ca-9666-667a64248ddf', 'a1576928-3ce6-4f06-b9e8-ee71dad94a29', null, 8),
      -- COLLEGE_D3 · 2026 · Southeast D-III Men's Conferences (Southeast-D-III-Mens-Conferences-2026) · ended 2026-04-26
      ('ef9fa447-e5f8-4e42-8f14-652a712307a4', 'cc2f1549-c958-4387-b4a9-ca7a179840b4', null, 1),
      ('ef9fa447-e5f8-4e42-8f14-652a712307a4', '8103441d-fa95-4340-9bee-94010dda6871', null, 2),
      ('ef9fa447-e5f8-4e42-8f14-652a712307a4', '01ec59bb-5d33-481c-a611-ea0b4ede2665', null, 3),
      ('ef9fa447-e5f8-4e42-8f14-652a712307a4', '42e6bb03-e48f-4b83-9034-bf5f940d32f0', null, 3),
      -- COLLEGE_D3 · 2026 · Great Lakes D-III College Men's Regionals (Great-Lakes-D-III-College-Mens-Regionals-2026) · ended 2026-05-03
      ('0e6f2b9a-f239-40b2-a203-d66c5ee4448c', '91557440-d61c-47df-bb62-ac4ba9ebb1f5', 3, 5), -- correct
      ('0e6f2b9a-f239-40b2-a203-d66c5ee4448c', '5d88e546-5dd3-4adb-a4cc-a705e666a4a5', 3, 6), -- correct
      -- COLLEGE_D3 · 2026 · New England D-III College Men's Regionals (New-England-D-III-College-Mens-Regionals-2026) · ended 2026-05-03
      ('cab1f385-2880-42e3-91d0-2f52eac6057c', '31c1c263-3f60-4a15-a247-b58f3c9de16a', null, 1),
      ('cab1f385-2880-42e3-91d0-2f52eac6057c', '653371f3-3226-4352-a986-b34581ebec07', null, 2),
      ('cab1f385-2880-42e3-91d0-2f52eac6057c', '1bc4308c-74d4-4eb0-900c-1958b0fdcccf', null, 3),
      ('cab1f385-2880-42e3-91d0-2f52eac6057c', 'f8544006-9e99-4980-9485-5353fc2ee0bb', null, 4),
      ('cab1f385-2880-42e3-91d0-2f52eac6057c', 'cdf59389-6968-49e0-8163-f06c90256af5', null, 5),
      ('cab1f385-2880-42e3-91d0-2f52eac6057c', '7668a09f-73de-4506-b68e-b9ffdba462bf', null, 6),
      ('cab1f385-2880-42e3-91d0-2f52eac6057c', '106a70a3-fc8f-45a0-88b9-e9de860fe637', null, 7),
      ('cab1f385-2880-42e3-91d0-2f52eac6057c', '42265d41-750a-413e-b2f4-cbddf4d4be01', null, 8),
      ('cab1f385-2880-42e3-91d0-2f52eac6057c', 'd72df8f5-91ee-465d-8e23-c001d53421b0', null, 9),
      ('cab1f385-2880-42e3-91d0-2f52eac6057c', '5091526a-b429-4a7b-b4b9-09d2b750f09e', null, 10),
      ('cab1f385-2880-42e3-91d0-2f52eac6057c', '0e5eead1-63d5-4dc8-8f41-2e0baf016c18', null, 11),
      ('cab1f385-2880-42e3-91d0-2f52eac6057c', '172558df-89ef-40b7-8f31-3b2fb3eb321a', null, 12),
      -- GRAND_MASTERS · 2022 · 2022 USA Ultimate Southwest Grand Masters Men's Regionals  (2022-usa-ultimate-southwest-grand-masters-mens-regionals) · ended 2022-06-05
      ('56b4257f-dfb4-4437-b789-7fc37de8b3d9', 'fd92986a-681f-49ad-a844-0cec3d7c7b36', 3, 4), -- correct
      -- GRAND_MASTERS · 2022 · 2022 USA Ultimate North Central Grand Masters Men's Regionals  (2022-usa-ultimate-north-central-grand-masters-mens-regionals) · ended 2022-06-12
      ('57049014-eac3-4cda-9923-b08463626a5d', '846732bd-f5dc-408e-a3c1-749e39852f51', null, 3),
      ('57049014-eac3-4cda-9923-b08463626a5d', '8836b0ec-6c76-465e-a1b4-550e58275c56', null, 4),
      -- GRAND_MASTERS · 2023 · 2023 USA Ultimate South Central Grand Masters Men's Regionals (NC/SC Super Regional) (2023-usa-ultimate-south-central-grand-masters-mens-regionals-nc-sc-super-regional) · ended 2023-06-11
      ('6ff53358-a78c-4422-8af2-a292d071567b', '3825027f-44ac-4728-9b63-43d6defcbab9', 3, null), -- clear-unsupported
      -- GRAND_MASTERS · 2024 · 2024 USA Ultimate North Central Grand Masters Men's Regionals (NC/SC Super Regional) (2024-usa-ultimate-north-central-grand-masters-mens-regionals-nc-sc-super-regional) · ended 2024-06-09
      ('88aa0b16-b6b6-4833-ab31-210b5c50e0fd', '0e085efe-a338-42e8-b2a4-6bf46f04c29d', null, 3),
      ('88aa0b16-b6b6-4833-ab31-210b5c50e0fd', 'c28168c4-a02d-4f5e-b6fa-39346b4c90f5', null, 4),
      ('88aa0b16-b6b6-4833-ab31-210b5c50e0fd', '427d95f1-d774-4240-ba28-9e1f6e4dd463', null, 5),
      ('88aa0b16-b6b6-4833-ab31-210b5c50e0fd', 'ad2697b9-3750-4718-9ef1-bf880358c213', null, 6),
      -- GRAND_MASTERS · 2024 · 2024 USA Ultimate Southeast Grand Masters Men's Regionals (GL/SE Super Regional) (2024-usa-ultimate-southeast-grand-masters-mens-regionals-gl-se-super-regional) · ended 2024-06-09
      ('eac4b36d-66f1-40ae-91d9-ec4485ac08c0', '6d1c9c36-70bf-490c-9d3a-4dd22c69238e', null, 2),
      ('eac4b36d-66f1-40ae-91d9-ec4485ac08c0', '846cb80d-7232-4d3b-8c77-c752812d31ad', 2, 3), -- correct
      -- GRAND_MASTERS · 2025 · 2025 USA Ultimate Mid-Atlantic/Northeast Grand Masters Men's Super Qualifier (2025-usa-ultimate-mid-atlantic-northeast-grand-masters-mens-super-qualifier) · ended 2025-06-08
      ('ad65e554-a510-4882-9134-9873ac9343be', '7cfa54e5-5e68-43ce-babd-9990de2ce60e', 2, 3), -- correct
      ('ad65e554-a510-4882-9134-9873ac9343be', '0f1ddc97-1f62-4fb8-9b6a-b9aeae94c6ac', 3, 4), -- correct
      -- GRAND_MASTERS · 2025 · 2025 USA Ultimate North Central/South Central Grand Masters Men's Super Quaifier  (2025-usa-ultimate-north-central-south-central-grand-masters-mens-super-quaifier) · ended 2025-06-08
      ('4fa2db3b-beac-4fcc-b5d1-def15f609614', '9aaf27b9-dd14-4d55-b041-71467c76c1e1', null, 4),
      ('4fa2db3b-beac-4fcc-b5d1-def15f609614', '6102f84a-7653-42b5-b094-ebfe03657a0d', null, 5),
      ('4fa2db3b-beac-4fcc-b5d1-def15f609614', 'c898a2cf-ef15-413f-997b-6359fb28e353', null, 6),
      -- GRAND_MASTERS · 2025 · 2025 USA Ultimate Great Lakes/Southeast Grand Masters Men's Super Qualifier (2025-usa-ultimate-great-lakes-southeast-grand-masters-mens-super-qualifier) · ended 2025-06-22
      ('6cf5e41f-8881-4663-a8e0-f0546f466d31', '7904eaab-ca43-4fc0-9613-b9e0977d4bda', null, 5),
      -- GRAND_MASTERS · 2026 · 2026 USA Ultimate Great Lakes/Southeast Grand Masters Men's Super Qualifier (2026-USA-Ultimate-Great-LakesSoutheast-Grand-Masters-Mens-Super-Qualifier) · ended 2026-06-07
      ('0aeb85cb-b4a4-4ccc-9cdb-24a10183cddf', 'fbf0ce58-e126-4c01-b625-2e0421656882', null, 3),
      -- GRAND_MASTERS · 2026 · 2026 USA Ultimate Northwest Grand Masters Men's Regionals (2026-USA-Ultimate-Northwest-Grand-Masters-Mens-Regionals) · ended 2026-06-14
      ('0f6e0dd5-703f-4402-875d-42808d0c10d9', 'c56c5831-3770-4180-84b1-91bf17f7f327', null, 3),
      ('0f6e0dd5-703f-4402-875d-42808d0c10d9', '4b3204e4-d828-48e6-8b92-e34a90540768', null, 4),
      ('0f6e0dd5-703f-4402-875d-42808d0c10d9', '61fde44e-1090-4c3c-b43c-942d0389903f', null, 5),
      -- GREAT_GRAND_MASTERS · 2022 · 2022 USA Ultimate Southwest Great Grand Masters Regionals  (2022-usa-ultimate-southwest-great-grand-masters-regionals) · ended 2022-06-05
      ('8dee1055-4839-4a21-ac6c-dcb46e4fc1b2', '81a0c015-008f-4721-89c0-e5a90996a9d4', 3, 2), -- correct
      ('8dee1055-4839-4a21-ac6c-dcb46e4fc1b2', 'e1bc0300-4ad0-4d8f-a362-94d85bc56038', 2, 3), -- correct
      ('8dee1055-4839-4a21-ac6c-dcb46e4fc1b2', '0412c870-3704-4aad-8276-00a5ab64741c', 3, 4), -- correct
      -- GREAT_GRAND_MASTERS · 2023 · 2023 USA Ultimate Northwest Great Grand Masters Men's Regionals (NW/SW Super Regional) (2023-usa-ultimate-northwest-great-grand-masters-mens-regionals-nw-sw-super-regional) · ended 2023-06-04
      ('e9432fb7-c9c6-4dfe-bea3-fe166eb2802e', '5459b6ef-b91f-47bc-9240-d99c383b93aa', 3, null), -- clear-unsupported
      -- GREAT_GRAND_MASTERS · 2023 · 2023 USA Ultimate Great Lakes Great Grand Masters Men's Regionals (GL/SE Super Regional) (2023-usa-ultimate-great-lakes-great-grand-masters-mens-regionals-gl-se-super-regional) · ended 2023-06-18
      ('d3f0dd26-8179-404a-977b-59d0404ff26e', '2b43f164-ff36-44ed-ab84-163cd00f91ff', null, 3),
      ('d3f0dd26-8179-404a-977b-59d0404ff26e', '24a41c28-dd16-4404-a255-b40508fe4c02', null, 4),
      ('d3f0dd26-8179-404a-977b-59d0404ff26e', '8eba236a-f349-4b58-a7b2-9a3a3e795dfd', null, 5),
      ('d3f0dd26-8179-404a-977b-59d0404ff26e', '97d82bc6-aa27-48c5-b5ee-627a55dceb86', null, 6),
      -- GREAT_GRAND_MASTERS · 2024 · 2024 USA Ultimate Southwest Great Grand Masters Men's Regionals (NW/SW Super Regional) (2024-usa-ultimate-southwest-great-grand-masters-mens-regionals-nw-sw-super-regional) · ended 2024-06-23
      ('787e15a3-d5df-4716-908b-8291a76647ea', 'a0ca8ed1-19d3-4989-bdfc-33faaba2dee0', null, 2),
      ('787e15a3-d5df-4716-908b-8291a76647ea', '83704307-f6cd-4201-997a-8fc4042c1285', 2, 3), -- correct
      -- GREAT_GRAND_MASTERS · 2025 · 2025 USA Ultimate North Central/South Central Great Grand Masters Men's Super Qualifier (2025-usa-ultimate-north-central-south-central-great-grand-masters-mens-super-qualifier) · ended 2025-06-08
      ('659a7a8c-004c-47ea-8559-b4a04b6bf7c2', 'd750cf2a-2fe6-43b4-9f81-f5eb3de588f0', 3, 4), -- correct
      -- GREAT_GRAND_MASTERS · 2025 · 2025 USA Ultimate Great Lakes/Southeast Great Grand Masters Men's Super Qualifier (2025-usa-ultimate-great-lakes-southeast-great-grand-masters-mens-super-qualifier) · ended 2025-06-22
      ('8ea35ebc-f75f-442a-8961-18db2b6f73c2', 'd10b9b70-16b2-42ce-a7cc-825208fc0ffe', null, 6),
      -- GREAT_GRAND_MASTERS · 2026 · 2026 USA Ultimate Great Lakes/Southeast Great Grand Masters Men's Super Qualifier (2026-USA-Ultimate-Great-LakesSoutheast-Great-Grand-Masters-Mens-Super-Qualifier) · ended 2026-06-07
      ('532ef2df-6878-42a4-8c32-a85dad1ace49', 'cca317c9-71a8-43d8-b535-3b89d152104e', 3, 4), -- correct
      -- GREAT_GRAND_MASTERS · 2026 · 2026 USA Ultimate Northwest/Southwest Great Grand Masters Men's Super Qualifier (2026-USA-Ultimate-NorthwestSouthwest-Great-Grand-Masters-Mens-Super-Qualifier) · ended 2026-06-07
      ('53fba2e1-7103-4cff-97bb-f52ed9ffaad7', 'd7950913-61d1-4074-b6f4-9f95132c49dc', 2, 3), -- correct
      ('53fba2e1-7103-4cff-97bb-f52ed9ffaad7', 'b0d6d2a2-49cc-401a-8149-421b3792f405', 3, null), -- clear-unsupported
      -- GREAT_GRAND_MASTERS · 2026 · 2026 USA Ultimate Mid-Atlantic/Northeast Great Grand Masters Men's Super Qualifier (2026-USA-Ultimate-Mid-AtlanticNortheast-Great-Grand-Masters-Mens-Super-Qualifier) · ended 2026-06-21
      ('1a93949c-b279-40dd-9950-ab84231e49e4', 'a94629f3-301f-44ac-9d3b-59b2c706b8cb', 2, 3), -- correct
      ('1a93949c-b279-40dd-9950-ab84231e49e4', 'c3f9b176-0b1a-4c34-a011-cc5868c62b06', 3, 4), -- correct
      -- MASTERS · 2021 · 2021 USA Ultimate Masters Championships (2021-usa-ultimate-masters-championships) · ended 2021-07-18
      ('8311e00d-1c0a-4920-88c8-1f1715d56409', '6bc69aea-a0b6-4c54-9e77-e91b19fc7c8d', null, 1),
      ('8311e00d-1c0a-4920-88c8-1f1715d56409', '7823000f-04a0-44e5-a984-3c28428177ac', null, 1),
      ('8311e00d-1c0a-4920-88c8-1f1715d56409', 'b028caba-925f-4bb0-b956-680c4c97f595', null, 1),
      ('8311e00d-1c0a-4920-88c8-1f1715d56409', 'eaae4dee-cc1d-4b8f-8782-8f7f5e7ce0fb', null, 1),
      ('8311e00d-1c0a-4920-88c8-1f1715d56409', '899bcf92-e349-4741-ae64-201e15018b17', null, 2),
      ('8311e00d-1c0a-4920-88c8-1f1715d56409', '9cf4325d-3d7e-4d6b-a4af-4de3566d246b', null, 2),
      ('8311e00d-1c0a-4920-88c8-1f1715d56409', 'eacdd4d4-fac0-4dca-8388-89c173840d98', null, 2),
      ('8311e00d-1c0a-4920-88c8-1f1715d56409', 'fb9e3a1e-729b-46d1-b6f2-3266c270cfef', null, 2),
      ('8311e00d-1c0a-4920-88c8-1f1715d56409', '090f65cd-51c5-4729-bdee-d09d5d15d955', null, 3),
      ('8311e00d-1c0a-4920-88c8-1f1715d56409', '6d000032-85a2-4aef-8b93-0ff74ab16def', null, 3),
      ('8311e00d-1c0a-4920-88c8-1f1715d56409', 'dd4ccad8-7c4d-48d6-9326-4340b4d38533', null, 3),
      ('8311e00d-1c0a-4920-88c8-1f1715d56409', 'e872802f-8e09-4df2-9e86-36c4ae923dff', null, 3),
      ('8311e00d-1c0a-4920-88c8-1f1715d56409', '3c6ff82f-c524-4e8b-a9a0-1a0124f00c98', null, 4),
      ('8311e00d-1c0a-4920-88c8-1f1715d56409', '415a8c71-a5ec-4326-9f03-580f6fab5cd6', null, 4),
      ('8311e00d-1c0a-4920-88c8-1f1715d56409', '73a39b22-56cd-4fe6-ac9a-6becfab1329f', null, 4),
      ('8311e00d-1c0a-4920-88c8-1f1715d56409', 'b6b96d6c-63b2-4d42-9ae8-3857a859c48a', null, 4),
      ('8311e00d-1c0a-4920-88c8-1f1715d56409', 'b4ff07d7-767d-428d-afa1-485eb2045f6e', null, 5),
      ('8311e00d-1c0a-4920-88c8-1f1715d56409', 'e3c06d9b-4f46-4f10-a43e-d6f468fac200', null, 5),
      ('8311e00d-1c0a-4920-88c8-1f1715d56409', 'e562e29a-7590-4189-b388-84cdb62e5dbe', null, 5),
      ('8311e00d-1c0a-4920-88c8-1f1715d56409', '1e8f0bdc-88fe-4021-97d6-ca1bea34d509', null, 6),
      ('8311e00d-1c0a-4920-88c8-1f1715d56409', 'b6208c9d-c362-4d16-8ba4-1d263d560012', null, 6),
      ('8311e00d-1c0a-4920-88c8-1f1715d56409', 'd1b10859-e38f-499c-bb76-55a3bfd1062f', null, 6),
      ('8311e00d-1c0a-4920-88c8-1f1715d56409', '2219dd3e-cc64-43ee-8ab9-8f2f9d7f5e36', null, 7),
      ('8311e00d-1c0a-4920-88c8-1f1715d56409', '83ede431-dc6c-4342-93b9-2eb2eb9686e3', null, 7),
      ('8311e00d-1c0a-4920-88c8-1f1715d56409', 'c89dd980-eb75-4c67-a184-b068d77c2aa2', null, 7),
      ('8311e00d-1c0a-4920-88c8-1f1715d56409', '5868e836-57d5-401c-9069-fc56c0ca1c45', null, 8),
      ('8311e00d-1c0a-4920-88c8-1f1715d56409', 'c36cd0f7-25c2-4839-b212-89050063f650', null, 8),
      ('8311e00d-1c0a-4920-88c8-1f1715d56409', 'cd699a72-8dcd-43d2-95b5-bbcf0e4bd812', null, 8),
      ('8311e00d-1c0a-4920-88c8-1f1715d56409', '00b741b1-b83a-4bb4-b416-bb9dd989151a', null, 9),
      ('8311e00d-1c0a-4920-88c8-1f1715d56409', 'f0ec1b4e-6e97-4b4e-b775-9c730f3df2d9', null, 9),
      ('8311e00d-1c0a-4920-88c8-1f1715d56409', '4ad145a5-2265-4cc6-93ba-4f0b00f71659', null, 10),
      ('8311e00d-1c0a-4920-88c8-1f1715d56409', 'c504412f-8bbf-4999-90e6-712f6b005dd6', null, 10),
      ('8311e00d-1c0a-4920-88c8-1f1715d56409', '66359c36-6b17-45c4-a4e0-1866eb172f49', null, 11),
      ('8311e00d-1c0a-4920-88c8-1f1715d56409', 'a04af53c-a158-4c52-b766-9bee483208ff', null, 11),
      ('8311e00d-1c0a-4920-88c8-1f1715d56409', '7260442f-97aa-433c-8ee7-4387ba86fdd8', null, 12),
      ('8311e00d-1c0a-4920-88c8-1f1715d56409', 'ea8a3363-3e9e-41fb-81d3-04e7d6f94b11', null, 13),
      ('8311e00d-1c0a-4920-88c8-1f1715d56409', '04d72382-27f0-4d46-b0c8-df535e75f015', null, 14),
      ('8311e00d-1c0a-4920-88c8-1f1715d56409', 'eed1c1f0-3e51-4c6a-8be9-7d92530a5279', null, 14),
      ('8311e00d-1c0a-4920-88c8-1f1715d56409', '8d3a56d8-be07-45d8-bcfa-435473775bde', null, 15),
      ('8311e00d-1c0a-4920-88c8-1f1715d56409', '9e83c06f-4a37-47f5-9583-50cc38d735f8', null, 15),
      ('8311e00d-1c0a-4920-88c8-1f1715d56409', '68058bfc-6709-4e43-91a7-9e58ef443961', null, 16),
      ('8311e00d-1c0a-4920-88c8-1f1715d56409', 'bc5380ae-98d5-4b76-b056-f5d41bbff9e0', null, 16),
      -- MASTERS · 2022 · 2022 USA Ultimate Southeast Masters Mixed Regionals  (2022-usa-ultimate-southeast-masters-mixed-regionals) · ended 2022-06-05
      ('5ae6f479-28da-443c-9c90-f1f9dec41938', 'aec2df9b-0edd-46e5-a079-b7049526df34', 3, 4), -- correct
      -- MASTERS · 2022 · 2022 USA Ultimate Northeast Masters Mixed Regionals  (2022-usa-ultimate-northeast-masters-mixed-regionals) · ended 2022-06-12
      ('9b28ffe4-51a8-4e1f-a7a0-22b1d3b7d33f', 'ea12bb41-3cef-4ede-a6ec-badf56718c6a', null, 3),
      ('9b28ffe4-51a8-4e1f-a7a0-22b1d3b7d33f', '201bc365-a46e-4830-8473-d5d0d9898ef3', null, 4),
      -- MASTERS · 2022 · 2022 USA Ultimate South Central Masters Men's  Regionals  (2022-usa-ultimate-south-central-masters-mens-regionals) · ended 2022-06-12
      ('63e2e95d-52cf-44a2-b79a-4971a6e83ec5', 'ce08e0ce-f3a5-4264-97c2-3b9d133e5b40', null, 3),
      -- MASTERS · 2022 · 2022 USA Ultimate South Central Masters Mixed Regionals  (2022-usa-ultimate-south-central-masters-mixed-regionals) · ended 2022-06-12
      ('f68fceea-c240-428a-bec0-64fa188dac15', '23881997-5dea-4adb-a595-0be893f07575', null, 2),
      ('f68fceea-c240-428a-bec0-64fa188dac15', 'f87c3bd9-7c6c-41e4-b4ae-97866b204270', 2, 3), -- correct
      ('f68fceea-c240-428a-bec0-64fa188dac15', '95c329c6-0c1f-424a-8c44-3bb472809756', 3, 4), -- correct
      ('f68fceea-c240-428a-bec0-64fa188dac15', 'b2e42e3a-9d81-4dad-9eca-316b4ef70307', 4, 5), -- correct
      -- MASTERS · 2023 · 2023 USA Ultimate North Central Masters Men's Regionals (NC/SC Super Regional) (2023-usa-ultimate-north-central-masters-mens-regionals-nc-sc-super-regional) · ended 2023-06-11
      ('35ee1df3-6488-4f45-ae7e-e5340f4ead35', '3f94e91b-b2c3-45f2-93d2-b726211bc2fb', null, 2),
      ('35ee1df3-6488-4f45-ae7e-e5340f4ead35', '6586b476-59be-43be-ac0e-a34e24948ea0', 2, 3), -- correct
      ('35ee1df3-6488-4f45-ae7e-e5340f4ead35', 'ae4c7ee3-b767-4de7-a89b-cb38ad12aed6', null, 4),
      ('35ee1df3-6488-4f45-ae7e-e5340f4ead35', 'ed6dd5a6-d35e-40e4-bfa0-00fc812baa6a', null, 5),
      ('35ee1df3-6488-4f45-ae7e-e5340f4ead35', '4cfd8dd9-75f5-4459-84cb-4c3c169b0c9a', null, 6),
      -- MASTERS · 2023 · 2023 USA Ultimate North Central Masters Mixed Regionals (NC/SC Super Regional) (2023-usa-ultimate-north-central-masters-mixed-regionals-nc-sc-super-regional) · ended 2023-06-11
      ('3a9b294d-b724-4043-ac94-565bbe960426', '52b4c325-1058-460d-9d67-84f5016e241c', null, 3),
      ('3a9b294d-b724-4043-ac94-565bbe960426', '9d85e3c1-1f3b-4d75-8e1c-5aa49e19010f', null, 4),
      -- MASTERS · 2023 · 2023 USA Ultimate Southeast Masters Mixed Regionals (GL/SE Super Regional) (2023-usa-ultimate-southeast-masters-mixed-regionals-gl-se-super-regional) · ended 2023-06-11
      ('4ec37ae7-74bb-4cc0-8320-93f17d6c0159', '7db7f37d-7a78-4f0d-a784-8cbabb0c8de0', null, 3),
      ('4ec37ae7-74bb-4cc0-8320-93f17d6c0159', '1843364a-65f7-436b-ae20-4c99ab12f923', 3, null), -- clear-unsupported
      ('4ec37ae7-74bb-4cc0-8320-93f17d6c0159', 'ff1f5c59-ad50-4c36-b72d-8550f6a58b49', 3, null), -- clear-unsupported
      -- MASTERS · 2023 · 2023 USA Ultimate Northeast Masters Men's  Regionals (MA./NE Super Regional) (2023-usa-ultimate-northeast-masters-mens-regionals-ma-ne-super-regional) · ended 2023-06-18
      ('b51fe3bf-cda5-4466-b990-e2a8d324030c', '4acb0dac-9a23-455f-9dcb-65fb9fcc18b1', 2, 3), -- correct
      ('b51fe3bf-cda5-4466-b990-e2a8d324030c', '6c7f7953-613d-4994-a6f6-d9409e5e2cd8', 3, 4), -- correct
      ('b51fe3bf-cda5-4466-b990-e2a8d324030c', '5ae80401-95fe-47d2-9be9-9dbe8086571d', null, 6),
      -- MASTERS · 2024 · 2024 USA Ultimate South Central Masters Mixed Regionals (2024-usa-ultimate-south-central-masters-mixed-regionals) · ended 2024-06-09
      ('4c18ff98-801d-4aec-8a08-d6b46bd1d12a', '9761d9f4-f174-48ab-905b-3beeca31cc94', null, 3),
      ('4c18ff98-801d-4aec-8a08-d6b46bd1d12a', '6ef08c1f-a289-4781-924d-5201f451f673', null, 4),
      ('4c18ff98-801d-4aec-8a08-d6b46bd1d12a', '0082b726-0b31-414d-a5dd-002f02359210', 3, 5), -- correct
      ('4c18ff98-801d-4aec-8a08-d6b46bd1d12a', '6dc7420c-5404-4a7e-828f-5d8203144a99', 3, 6), -- correct
      -- MASTERS · 2024 · 2024 USA Ultimate South Central Masters Women's Regionals (NC/SC Super Regional) (2024-usa-ultimate-south-central-masters-womens-regionals-nc-sc-super-regional) · ended 2024-06-09
      ('9e3c4e30-5837-4102-80ec-64c477b720e0', '5437d7b7-77e7-4492-a6c0-98d51cb912e6', 4, 5), -- correct
      -- MASTERS · 2024 · 2024 USA Ultimate Mid-Atlantic Masters Men's Regionals (MA/NE Super Regional) (2024-usa-ultimate-mid-atlantic-masters-mens-regionals-ma-ne-super-regional) · ended 2024-06-16
      ('2f98ec0c-c8e5-4450-b284-23f475f23746', '8dffdcad-b8ef-4337-9d93-b297b2378bba', null, 3),
      -- MASTERS · 2024 · 2024 USA Ultimate Mid-Atlantic Masters Women's Regionals (MA/NE Super Regional) (2024-usa-ultimate-mid-atlantic-masters-womens-regionals-ma-ne-super-regional) · ended 2024-06-16
      ('0bfa1e72-9281-4e58-8f6e-7b3ef57d6094', '5a2d5c67-6635-49a9-ab37-51a95670118b', 2, 3), -- correct
      ('0bfa1e72-9281-4e58-8f6e-7b3ef57d6094', 'c44944d1-104c-4420-93d1-c08afe476d97', 3, null), -- clear-unsupported
      -- MASTERS · 2024 · 2024 USA Ultimate Great Lakes Masters Men's Regionals (GL/SE Super Regional) (2024-usa-ultimate-great-lakes-masters-mens-regionals-gl-se-super-regional) · ended 2024-06-23
      ('b1aa633d-00dd-4605-96c0-a4ee4b89c83a', 'b0971d84-f89d-468e-8cdf-854f33bbb58d', null, 3),
      -- MASTERS · 2024 · 2024 USA Ultimate Great Lakes Masters Mixed Regionals (GL/SE Super Regional) (2024-usa-ultimate-great-lakes-masters-mixed-regionals-gl-se-super-regional) · ended 2024-06-23
      ('f5b62931-3f02-4828-87c5-f57b50fe76a7', '5bf157b7-f9f3-4550-9d4d-70a7bb3f3e81', 3, null), -- clear-unsupported
      -- MASTERS · 2024 · 2024 USA Ultimate Great Lakes Masters Women's Regionals (GL/SE Super Regional) (2024-usa-ultimate-great-lakes-masters-womens-regionals-gl-se-super-regional) · ended 2024-06-23
      ('eb26ca94-e299-4445-8ed0-8fbfbf442f2b', '8b60019d-6de9-4edf-a7a1-9ee41c9648f1', 3, 4), -- correct
      -- MASTERS · 2024 · 2024 USA Ultimate Masters Championships (2024-usa-ultimate-masters-championships) · ended 2024-07-22
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', '0e3696e7-dca1-4bea-961d-a10a8bbe507b', null, 1),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', '36bc63c0-4418-458c-be17-afdb1596cbbf', null, 1),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', '44166031-a9ae-4392-b8f7-de768f9060f1', null, 1),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', '685cd0e1-27b4-4386-9401-ec605d67c389', null, 1),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', '843dd976-a198-4012-b4f6-8ea78315f416', null, 1),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', 'ce23b888-4f5b-4eee-b8fb-70f6d4705e82', null, 1),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', 'dbea8194-6d89-410f-8eaf-b93ea6b1813a', null, 1),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', 'e2757abd-fe78-4f4e-bd91-32e19bbf4e72', null, 1),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', '3e3c376e-55fc-4d45-804c-30bc40621f2e', null, 2),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', '436b6fd9-a2f8-4412-8d66-881abfef3a80', null, 2),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', '4fc5ecfe-239f-4512-b4bc-bee525b7b687', null, 2),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', '87309b6f-c3c5-4f14-a696-6353f3ffbc0c', null, 2),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', 'ac6dad32-fdd5-4697-b5f3-db889205867f', null, 2),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', 'd14e878e-b1b2-4440-a4bb-8465059c668d', null, 2),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', 'e0e65d86-7f6f-45b0-8145-db18ecbf8ab4', null, 2),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', 'ed0ea0ac-1761-42aa-bfc7-3b06ddb81bf8', null, 2),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', '1dec5ac6-4836-4c95-8051-aa445feff2df', null, 3),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', '21900ffa-a3aa-4d04-a045-603823b1f46b', null, 3),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', '3e3229e0-fb1c-45c2-bfba-a326c0cc5e3e', null, 3),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', '57c159ff-aee3-4f13-8a55-9d1d45f03a63', null, 3),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', '83704307-f6cd-4201-997a-8fc4042c1285', null, 3),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', '9bd48dc4-09a7-4057-b8d1-a847a426b20e', null, 3),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', 'bb1c82d6-dafd-4a30-8dab-8dce5fd120ab', null, 3),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', 'cb0ec1e4-cbcd-4950-8162-f1969402e635', null, 3),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', '1b80034d-51ce-446b-a652-cc7dca338f33', null, 4),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', '3183b54e-6bf5-4f62-992d-28c009203020', null, 4),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', '5bf157b7-f9f3-4550-9d4d-70a7bb3f3e81', null, 4),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', '6b11f88a-b036-474d-98df-edcd364b26cd', null, 4),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', '8aa50c9a-bdfc-481f-9409-7eafeb3ccda9', null, 4),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', '8b0ae3a2-c31f-468d-8e1e-73b7746f6a0e', null, 4),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', 'c83fcdc9-7e9e-4a32-a10f-9f0707e1364d', null, 4),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', '1be90fcb-ed37-4a6c-b632-b6d4525bdb8d', null, 5),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', '2e7ae7e2-b820-4cc9-a98e-2ad3f29cf3ad', null, 5),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', '305cd8a2-d12e-461a-91e3-58a385959c76', null, 5),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', '4b3b63ad-7553-420f-8dac-827c2cbd32b8', null, 5),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', '5e52dc77-e23b-4e66-a848-2b1e3580316d', null, 5),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', 'a1104a34-fab7-4e47-82dc-855db1f291de', null, 5),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', 'a56adaf0-d897-4e70-9444-fdd6c06ca2f0', null, 5),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', 'd6f0da39-818b-459f-bdb9-842da62007a0', null, 5),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', '1cfaa454-771a-4ddd-a742-268bbf5ee874', null, 6),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', '33cb271f-92bf-4249-9715-dcd38fc835ac', null, 6),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', '74b66e74-a57e-4b73-b57e-f19a8d77004e', null, 6),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', 'a12705fd-59dd-49e2-80bd-7a559b8f63a2', null, 6),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', 'a2110d53-a861-40c2-95f5-ce0ffc7449fd', null, 6),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', 'ca41ff12-dac8-4fbe-9125-2251039f11ea', null, 6),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', 'cb9b94a0-64f4-4ddb-b5d5-b1524cea8896', null, 6),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', 'f498ef72-50a6-485c-8e8d-7e5eac153861', null, 6),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', '21c32e1f-11e6-40f7-828f-8c5cb51b4c6b', null, 7),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', '36995ee7-43a5-4218-8ac3-df525c41c0c1', null, 7),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', '5a2d5c67-6635-49a9-ab37-51a95670118b', null, 7),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', '85db261e-707a-4a33-abcb-372d66da5f34', null, 7),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', '9094fc92-d451-4dce-8b7a-d7b61e0075ef', null, 7),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', 'd7de0401-9413-4665-b9db-9ed19e5303da', null, 7),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', 'fe87540f-e433-4b62-ad3e-65e0ccaccfd8', null, 7),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', '020245e4-9753-4c61-b378-74c399bf0ed1', null, 8),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', '77945d7c-d1bb-43d2-a976-d031530bcfea', null, 8),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', 'a0ca8ed1-19d3-4989-bdfc-33faaba2dee0', null, 8),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', 'a73f68c8-c292-46a4-8573-ffceb388da42', null, 8),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', 'b3fbdc93-bf07-472f-a93d-56f0169cf54a', null, 8),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', 'c56240bf-6aa4-42a0-9d33-6ab5520acf47', null, 8),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', 'f2dc2ff9-cbe6-40e9-bc3d-a971588f3548', null, 8),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', '0442d767-a140-4bf3-b795-b8f112a7a832', null, 9),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', '1439fa6b-48e2-4d66-9fe3-1e4ef85a6567', null, 9),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', 'dab33eff-df66-4543-a388-93bbb99fc3fe', null, 9),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', '0ad36155-0047-4938-8a5d-034286aee238', null, 10),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', '558243d6-c08a-4d12-9026-f5a0a395c51a', null, 10),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', 'b0971d84-f89d-468e-8cdf-854f33bbb58d', null, 10),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', '166d3add-6cb1-417e-9836-46cf2057f8e7', null, 11),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', '596acd83-0e60-49a7-b6a0-d90e8389946b', null, 11),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', 'c28168c4-a02d-4f5e-b6fa-39346b4c90f5', null, 11),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', '0e085efe-a338-42e8-b2a4-6bf46f04c29d', null, 12),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', '6d27bebf-255c-41f7-8ba6-1b55e51c6643', null, 12),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', '97387311-9851-477a-a4de-2f9b9ee70f58', null, 12),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', '5f39e015-9a8b-4bc6-809e-137a41bc5421', null, 13),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', '71aef5cb-02d6-4d2d-af23-c639e216bbcd', null, 13),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', '9ea6bd89-79b6-4783-9e09-f4f581fa7532', null, 13),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', '6589e438-ef68-460b-8bae-ecaa9fc9f3ef', null, 14),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', 'a53a3dd0-02c0-4269-a3b6-8fffcf9e8671', null, 14),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', 'ee6e0b1a-4455-4a8b-933f-b1dc46ee0ab2', null, 14),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', '846cb80d-7232-4d3b-8c77-c752812d31ad', null, 15),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', '8dffdcad-b8ef-4337-9d93-b297b2378bba', null, 15),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', 'ba6b88db-acd4-4086-9546-575b61a7a6bb', null, 15),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', '6d1c9c36-70bf-490c-9d3a-4dd22c69238e', null, 16),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', '95406096-c3f8-49b7-8261-a4df0276bc9a', null, 16),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', 'c7696267-e2e4-4886-951c-45bfe39271c8', null, 16),
      ('1ebb19d0-c650-405e-b63b-2c176f2160b4', '925127a2-1656-421c-851f-c142367c4329', 12, null), -- clear-contradicted
      -- MASTERS · 2025 · 2025 USA Ultimate Great Lakes/Southeast Masters Mixed Super Qualifier (2025-usa-ultimate-great-lakes-southeast-masters-mixed-super-qualifier) · ended 2025-06-08
      ('f38fc962-82cb-4598-a7c9-b34f21023043', 'a09d56ff-1d95-4d4d-a441-930ef8d3d70a', 3, null), -- clear-unsupported
      -- MASTERS · 2025 · 2025 USA Ultimate Great Lakes/Southeast Masters Women's Super Qualifier (2025-usa-ultimate-great-lakes-southeast-masters-womens-super-qualifier) · ended 2025-06-08
      ('718da56a-84fb-413c-a177-8f0a5229d0f9', 'c697f17d-6512-413c-a3fd-8a72637f63bc', 4, 5), -- correct
      -- MASTERS · 2025 · 2025 USA Ultimate Northwest/Southwest Masters Men's Super Qualifier (2025-usa-ultimate-northwest-southwest-masters-mens-super-qualifier) · ended 2025-06-08
      ('b2fae7cc-5b2a-4e47-98e5-8b31b322e8fb', '2fecb394-9b63-4996-afe5-da29fe4c57e8', null, 2),
      ('b2fae7cc-5b2a-4e47-98e5-8b31b322e8fb', '7c0e7ce0-5c4d-4f51-acc7-5ca4b7392d46', 2, 3), -- correct
      ('b2fae7cc-5b2a-4e47-98e5-8b31b322e8fb', '37b72a0c-b860-4e0d-9a77-4ce0909b90dc', null, 4),
      ('b2fae7cc-5b2a-4e47-98e5-8b31b322e8fb', '6123ff9a-0890-4824-b9d2-436d8311c7ac', 7, null), -- clear-contradicted
      -- MASTERS · 2025 · 2025 USA Ultimate South Central Masters Men's Regionals (2025-usa-ultimate-south-central-masters-mens-regionals) · ended 2025-06-08
      ('5b92d533-8a57-42de-bb33-9c30f7c6b6c0', '98f30e43-f1a0-40fc-85f8-c0c1260e14ff', 3, 4), -- correct
      -- MASTERS · 2025 · 2025 USA Ultimate South Central Masters Mixed Regionals (2025-usa-ultimate-south-central-masters-mixed-regionals) · ended 2025-06-08
      ('15d80700-db05-46c9-81a8-9fec29fbf83c', 'ec0a3c54-af94-4b2c-ad22-7ff967565fae', null, 4),
      ('15d80700-db05-46c9-81a8-9fec29fbf83c', '11022a83-32fc-4b07-8415-cf2847e9b35e', 3, 6), -- correct
      -- MASTERS · 2025 · 2025 USA Ultimate Mid-Atlantic Masters Mixed Regionals (2025-usa-ultimate-mid-atlantic-masters-mixed-regionals) · ended 2025-06-15 · unfinished bracket: duplicates cleared only
      ('9195ced0-e67e-4962-abe8-3558cb517da7', 'f98a0b73-74f4-472d-9404-e312ca2fe8d9', 2, null), -- clear-conflict
      ('9195ced0-e67e-4962-abe8-3558cb517da7', 'fe632840-33ea-467d-932a-36cfd44f2d95', 2, null), -- clear-conflict
      -- MASTERS · 2025 · 2025 USA Ultimate Northwest/Southwest Masters Mixed Super Qualifier (2025-usa-ultimate-northwest-southwest-masters-mixed-super-qualifier) · ended 2025-06-15 · unfinished bracket: duplicates cleared only
      ('2a1f1565-f9d3-4164-ac0f-08644d7d4e37', '170a688e-66dc-4c2a-8f61-2a205e09157e', 2, null), -- clear-conflict
      ('2a1f1565-f9d3-4164-ac0f-08644d7d4e37', 'e6c64a3a-c503-47fa-bf05-575c929a8db6', 2, null), -- clear-conflict
      -- MASTERS · 2025 · 2025 USA Ultimate Great Lakes Masters Men's Regionals (2025-usa-ultimate-great-lakes-masters-mens-regionals) · ended 2025-06-22
      ('fd2e1548-a24c-4c7f-a717-d738e3d6de71', 'ba875eaf-5536-48c8-8c90-7f5b1defc381', null, 4),
      -- MASTERS · 2025 · 2025 USA Ultimate Masters Championships (2025-usa-ultimate-masters-championships) · ended 2025-07-21
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '002ade33-82ab-4be9-8761-690a27c41417', null, 1),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '26ddbe26-3a30-488e-87b5-2b8d6ab58b70', null, 1),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '3a5da306-2d49-4cce-a928-6a14a4e5b35c', null, 1),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '52378c3f-bf79-4d85-b037-7eec36068dd1', null, 1),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '5905d6c9-bc43-47d0-bb25-579974e08c7e', null, 1),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', 'bba2ce45-adb0-4423-9c2b-0c080893469d', null, 1),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', 'c00bf2fb-7d95-49db-a6a9-274973b8e747', null, 1),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', 'da7ae67c-f5df-4792-ad72-49dd13c04711', null, 1),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '12daf3a0-685e-4752-9e2d-73e08c84167c', null, 2),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '20bcaf04-a87e-49c4-a728-582133bb8056', null, 2),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '46bf5648-0376-40c9-a56b-3765ec77c80a', null, 2),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', 'c4bd67ab-0cd9-4193-a25b-f0899281a640', null, 2),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', 'da1ea4ea-13c2-4e50-851b-f7b1adadf4af', null, 2),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', 'ecc4007b-084a-4aa0-a24b-be425adacb72', null, 2),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', 'f8038606-b8ec-419b-ae2f-3b7e887bac7f', null, 2),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', 'fe6f4b4e-f224-4a61-b50e-4a55ef8dcb29', null, 2),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '267b253a-38f2-4ff1-ac52-b0255a4196f5', null, 3),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '2a85da49-6695-4c4e-82dc-3ee69b548ad9', null, 3),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '3ebb0f67-2e05-4923-8fb5-e7bf6ccdd9e9', null, 3),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '455c9396-bc0a-4e7c-8d17-dd6070d3add4', null, 3),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '6008a908-9077-4e94-a45d-394cb5503f0a', null, 3),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '645ee7fa-4c59-48db-9df2-efcc3147fbb7', null, 3),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '926bd5d0-c5ce-4288-bcda-b513d5d369ca', null, 3),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', 'ab6f2292-d35d-49d9-9ffd-945f1c1077f9', null, 3),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '170a688e-66dc-4c2a-8f61-2a205e09157e', null, 4),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '372ced86-7c3b-47ea-9d77-46eabd4deb0f', null, 4),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '7d620a11-1319-42ca-b1cd-5ca0c015f72e', null, 4),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '7e900a60-897e-48fa-bc77-1d4b9ad3d32a', null, 4),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '8f3a68d1-3bd6-4071-bae7-3e7c227d3621', null, 4),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '90335220-cbe5-4917-adfd-da816c79af3e', null, 4),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', 'd04f7dd4-0562-40d1-8df5-27d7ef745069', null, 4),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', 'd2c46850-54f6-4564-b8c0-0b79add9394d', null, 4),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', 'f7477dbf-4991-48ed-85b2-7cd0558c333e', null, 4),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '1eab7a4b-4f1a-4c2f-9cf5-1b08a150744a', null, 5),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '2074f355-79f1-4bff-b1b9-474ba2b9f491', null, 5),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '2fecb394-9b63-4996-afe5-da29fe4c57e8', null, 5),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '85deca47-c35f-4fd8-a754-2e723e9bb7ed', null, 5),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '92d33926-d56f-45f7-9cda-644121016420', null, 5),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', 'bd25fcca-de68-41b1-8d87-c588b2df3ad7', null, 5),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', 'd92ec0a4-fcf3-49ea-9206-a245781284b7', null, 5),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', 'ede6c5c1-0fb2-48e1-a337-4cc3d5e71cd4', null, 5),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '1d568723-0d1c-4e57-983f-e5776d1c0621', null, 6),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '25c7f9fc-56d8-41e3-901e-aa9f4d54cf36', null, 6),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '46908d59-44e4-4c89-9739-cda56c090765', null, 6),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '5576f370-de08-4f86-8955-c584a8f5c604', null, 6),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '78212197-e46d-47c1-ab16-047a173b1e13', null, 6),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '993960c3-aa9b-4837-be2c-3897054b6c1a', null, 6),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', 'bf550012-11c9-43ad-852c-abacdae6943d', null, 6),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', 'e6c64a3a-c503-47fa-bf05-575c929a8db6', null, 6),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '1d2d5961-418e-4412-8530-57d18b43e611', null, 7),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '59ff7f3b-5baa-4f47-ba7b-83894b834204', null, 7),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '6a754073-22c3-4ccd-9503-0b08e9695249', null, 7),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '6c506cb7-671c-43bf-91db-bb2706dece1b', null, 7),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '7cfa54e5-5e68-43ce-babd-9990de2ce60e', null, 7),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '9ab8bd14-247a-4cfb-8e03-b44505b7c0a7', null, 7),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', 'ae392866-2b01-46e2-844a-4b47ceaa60e3', null, 7),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', 'bb95d459-1578-4618-8149-b6e97c2fd8bb', null, 7),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', 'ded2ff0a-308f-45ab-b5ed-ab324a3292a5', null, 7),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '0933f292-d463-4fd4-bab6-048664a5f90a', null, 8),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '14f3f402-c818-4e11-99d1-2a2b62f0d5dc', null, 8),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '2236fb1f-4c80-4dce-a532-82945b06dfff', null, 8),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '2500d103-9fa6-4ebe-ae0d-4202889a230e', null, 8),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '3b61678d-85ec-41d1-a6b2-5116c26568bf', null, 8),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '512aeff5-e53d-4ef1-8306-be5d78730efd', null, 8),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '778704ec-85f9-40c5-9d5b-1b0c035b7e1a', null, 8),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', 'e15398b4-3b2d-49ba-b4d3-9285b4cad4de', null, 8),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '080f3e25-5552-47c4-b016-45584b67b51f', null, 9),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '574dceb1-c77d-4265-89c9-f820c14cf62a', null, 9),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '64b9e23c-7106-4637-8354-e68e8b084433', null, 9),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '6d8bf74a-3223-4095-bdde-668ac98e8c1c', null, 9),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '722a866a-3766-4d28-bf32-1156774d9aed', null, 9),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '9aaf27b9-dd14-4d55-b041-71467c76c1e1', null, 9),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '04bf89f0-a806-420f-9620-020a3b72b04b', null, 10),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '05a9b701-ad3d-4b15-9097-e958d53a7a7c', null, 10),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '18f1bf36-e5d3-45e3-b06f-ff5864db4a37', null, 10),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '6862de9c-3a63-4c13-aed5-7ae20bb48639', null, 10),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', 'a611d77b-1565-48fe-9620-a22af5a0b5e6', null, 10),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', 'd1949eae-d6e7-41c1-ba40-a33290ccfed1', null, 10),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '0865f16b-3d5e-47a9-a997-f11cce237569', null, 11),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '14856ddf-baa3-4d68-98e6-1d53573d66a6', null, 11),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '4b32f544-148f-4f3e-b123-32d07277ed01', null, 11),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '76ee5577-51cb-4f66-aaa7-d2871487f61f', null, 11),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '9674a0d4-0a79-49f9-b760-1587ffc6ffcf', null, 11),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '217fee94-588e-43d6-8a17-dc4868335c1a', null, 12),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '3f714abe-ad33-4033-a2f3-1b198d6a0d8b', null, 12),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '4c672e5c-efdf-4142-9558-bea998d0ca6a', null, 12),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '5439663c-ee1b-4fce-994f-072beb5a2513', null, 12),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '7c2641a4-cc52-4f82-8b74-fd9f4f025e2d', null, 12),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '5a88cc93-f31c-4e8f-a8d1-7ee95503d999', null, 13),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', 'b93f99b6-19b3-4a01-bbb8-c0d3ae975faf', null, 13),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', 'd9c7814d-3236-4408-b9fe-40c1cb907cd2', null, 13),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', 'e0caf053-cf5f-44ee-b6ef-bdc5f52862ef', null, 13),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', 'fb729709-a591-4ce8-9bcf-25b000416bd2', null, 13),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '042cd9cd-a095-4968-b97f-69bc1df5df09', null, 14),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '147beadf-daa8-47fb-8c44-2ea882b4fd3e', null, 14),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '1eb51aa2-17ef-4817-8eec-fde321d8ba61', null, 14),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '3ccdaf21-0355-4ca4-8cd4-0a2580299acb', null, 14),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', 'f98a0b73-74f4-472d-9404-e312ca2fe8d9', null, 14),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '3435de04-2b2d-4803-8e10-091f571876d6', null, 15),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '7c0e7ce0-5c4d-4f51-acc7-5ca4b7392d46', null, 15),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '9f02a95f-417c-43ef-80f5-a83906a0879e', null, 15),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', 'cf3170e7-3d00-4d0a-a407-94296ed3a803', null, 15),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', 'da3d0993-e206-4150-81db-c4adaba20fe0', null, 15),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '3a584fb0-4448-4134-9f29-c41656153888', null, 16),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '644cedc9-254c-4e07-bf04-b0e9076110f2', null, 16),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', '94c650f0-4141-45dc-81f0-5b2870fd4876', null, 16),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', 'aabf4669-6263-4166-8801-669e78e4fb13', null, 16),
      ('1a65a3a2-3b44-4963-8b7c-b7b298ed7edb', 'ab700627-1fe9-4d21-946f-a8914b21b7db', null, 16),
      -- MASTERS · 2026 · 2026 USA Ultimate Great Lakes/Southeast Masters Men's Super Qualifier (2026-USA-Ultimate-Great-LakesSoutheast-Masters-Mens-Super-Qualifier) · ended 2026-06-07
      ('e436ab74-d8d2-42d1-87ad-f031823d6f9e', '885684fa-d1cd-4b84-a60f-8f2446aa1e1c', 3, 4), -- correct
      -- MASTERS · 2026 · 2026 USA Ultimate Mid-Atlantic Masters Mixed Regionals (2026-USA-Ultimate-Mid-Atlantic-Masters-Mixed-Regionals) · ended 2026-06-07
      ('04b17a1a-6a2c-40a0-83a8-59696040cc8a', '96972551-f51d-4cae-bbf9-6ec0d406f42f', null, 3),
      -- MASTERS · 2026 · 2026 USA Ultimate North Central/South Central Masters Men's Super Qualifier (2026-USA-Ultimate-North-CentralSouth-Central-Masters-Mens-Super-Qualifier) · ended 2026-06-07
      ('0771834d-48c2-4553-b38a-d49a29048962', '0f48f90c-f4c3-46d6-9b38-7bb244d31384', null, 2),
      ('0771834d-48c2-4553-b38a-d49a29048962', '054de13e-7d71-4823-890d-9d1545170641', 2, 3), -- correct
      ('0771834d-48c2-4553-b38a-d49a29048962', 'ee7fec78-0e65-4d2c-ad44-b6a32c07608a', null, 4),
      ('0771834d-48c2-4553-b38a-d49a29048962', 'cea1b706-7219-4443-a3b6-571b9f08a687', null, 5),
      ('0771834d-48c2-4553-b38a-d49a29048962', 'f1829cf6-3cd3-4f67-aeee-26216dcd7365', null, 6),
      -- MASTERS · 2026 · 2026 USA Ultimate Southwest Masters Mixed Regionals (2026-USA-Ultimate-Southwest-Masters-Mixed-Regionals) · ended 2026-06-07
      ('5fe10e78-efaa-400c-aafb-4c99f3fe3da1', 'b0d636a7-dda3-4b29-83b6-93461499e33a', null, 2),
      ('5fe10e78-efaa-400c-aafb-4c99f3fe3da1', 'dd8f24d6-c707-4f5d-abfa-ff188c59c0c3', 2, 3), -- correct
      -- MASTERS · 2026 · 2026 USA Ultimate North Central Masters Mixed Regionals (2026-USA-Ultimate-North-Central-Masters-Mixed-Regionals) · ended 2026-06-14
      ('4c98769d-3e5a-4735-8589-6e002c049270', '5cf6f53c-93c6-43b2-be7b-2678d4456a8f', 4, null), -- clear-unsupported
      ('4c98769d-3e5a-4735-8589-6e002c049270', '6ef5a34b-68be-4d75-af27-df358940e92c', 6, null), -- clear-unsupported
      ('4c98769d-3e5a-4735-8589-6e002c049270', 'ac7ea236-8f20-44ca-8974-6c38b6e7088b', 5, null), -- clear-unsupported
      ('4c98769d-3e5a-4735-8589-6e002c049270', 'f281bf13-9304-4844-997b-744c2335535a', 3, null), -- clear-unsupported
      -- MASTERS · 2026 · 2026 USA Ultimate Northwest/Southwest Masters Men's Super Qualifier (2026-USA-Ultimate-NorthwestSouthwest-Masters-Mens-Super-Qualifier) · ended 2026-06-14
      ('85a8d6c7-56ed-4ad8-bf1b-e6ea1e2c7481', '10ba26dc-96f4-449c-95a4-fb26f65ae1d7', null, 3),
      ('85a8d6c7-56ed-4ad8-bf1b-e6ea1e2c7481', 'f3fc1789-2f87-4f63-9c09-6fa58f979bc9', null, 4),
      ('85a8d6c7-56ed-4ad8-bf1b-e6ea1e2c7481', 'b6215b71-4d9e-475f-b72a-3c0acc6cce3a', null, 5),
      ('85a8d6c7-56ed-4ad8-bf1b-e6ea1e2c7481', '54939da6-7d80-4e08-9feb-23bee0ce5772', null, 6),
      -- OTHER · 2019 · 2019 Fall Middle School Classic (2019-fall-middle-school-classic) · ended 2019-11-10
      ('a4852bfb-b09e-4bf1-8af4-67b39c327f12', 'eb59af3a-f1c6-4cf1-8596-97aadaaa1d17', null, 1),
      ('a4852bfb-b09e-4bf1-8af4-67b39c327f12', '7a23ecfc-285a-4ebc-a6da-71e83f31b441', null, 3),
      ('a4852bfb-b09e-4bf1-8af4-67b39c327f12', '86839823-e640-4fc7-8217-26d3e01005d5', null, 4)
    ) as v(event_id, team_id, old_place, new_place)
   where et.event_id = v.event_id
     and et.team_id = v.team_id
     and et.final_placement is not distinct from v.old_place;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> v_expected THEN
    RAISE EXCEPTION 'usau placements part 12: expected % rows, matched %; data drifted since generation, re-run scripts/derive-usau-placements.ts', v_expected, v_updated;
  END IF;
  RAISE NOTICE 'usau placements part 12: updated % rows', v_updated;
END
$migration$;

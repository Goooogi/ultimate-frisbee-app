-- USAU per-event final placements — repair + fill, part 09 of 12.
--
-- The 2026-07-20 one-shot derivePlacements() backfill (Feature Backlog #18)
-- stored misread brackets, game-to-go losers kept 2nd, and ties that a later
-- game had settled; nothing derived placements after it. Regenerated with the
-- fixed algorithm by scripts/derive-usau-placements.ts on 2026-09-23T15:15:42.822Z —
-- do not hand-edit, re-run it.
--
-- This part: 140 events · fill 708 · correct 16 · clear 1 (conflict 0, contradicted 0, unsupported 1).
-- EXPECTED ROWS: 725. A row only updates while final_placement still holds
-- the value it was generated from ("old" below); the DO block raises, rolling
-- this part back, unless exactly 725 rows match. Regenerate instead of forcing it.
-- All 12 parts: 1469 events · fill 7901 · correct 428 · clear 247 (conflict 31, contradicted 127, unsupported 89).

DO $migration$
DECLARE
  v_expected constant int := 725;
  v_updated int;
BEGIN
  update public.usau_event_teams et
     set final_placement = v.new_place
    from (values
      -- COLLEGE_D1 · 2023 · New York Minute 2023 (New-York-Minute-2023) · ended 2023-11-12
      ('8f7440e3-799b-4a8a-8037-d47b410c7928'::uuid, '6d04ee05-8d01-4a11-8212-1dbe9e471581'::uuid, null::int, 1::int),
      ('8f7440e3-799b-4a8a-8037-d47b410c7928', '99284e30-eb30-4162-8a34-a9f9578227c3', null, 1),
      ('8f7440e3-799b-4a8a-8037-d47b410c7928', 'b5176ad1-31e4-41b9-9544-b453fe743ff0', null, 2),
      ('8f7440e3-799b-4a8a-8037-d47b410c7928', 'efee2a2a-4e14-4384-96a4-c3810c8bea74', null, 2),
      ('8f7440e3-799b-4a8a-8037-d47b410c7928', '3c532f91-6026-4605-bfce-bf5452b8d9c0', null, 3),
      ('8f7440e3-799b-4a8a-8037-d47b410c7928', '5e6f9753-a191-4c87-bfaa-888ff8ae1ad4', null, 3),
      ('8f7440e3-799b-4a8a-8037-d47b410c7928', 'ad5e3429-f3ae-423e-b37e-e517876b0c35', null, 4),
      ('8f7440e3-799b-4a8a-8037-d47b410c7928', 'de8683e5-a780-4bb6-a111-74e90281f4a6', null, 4),
      ('8f7440e3-799b-4a8a-8037-d47b410c7928', '106a3143-e1ba-4a2a-943a-adeb99c1b262', null, 5),
      ('8f7440e3-799b-4a8a-8037-d47b410c7928', '9726a719-3145-4021-a90b-43610621600e', null, 6),
      ('8f7440e3-799b-4a8a-8037-d47b410c7928', '0b73de6a-1bd6-4159-b0e8-4078a501522a', null, 7),
      ('8f7440e3-799b-4a8a-8037-d47b410c7928', '1e246650-a49c-4704-8e4b-5229fcb1c2c3', null, 8),
      -- COLLEGE_D1 · 2024 · Lake Superior D-I College Women's Conferences (Lake-Superior-D-I-Womens-Conferences-2024) · ended 2024-04-13
      ('36777dcc-6691-4808-b272-9a5308f7a989', 'f21c2b84-513a-45bc-972a-e66f58b3533a', null, 1),
      ('36777dcc-6691-4808-b272-9a5308f7a989', '30c2e093-87a9-4d63-a0ab-4db01d284588', null, 2),
      ('36777dcc-6691-4808-b272-9a5308f7a989', '44d5f1cf-1ae9-4280-8fc9-8a04c874b36c', null, 3),
      ('36777dcc-6691-4808-b272-9a5308f7a989', 'e7d5d99a-4101-47ac-9874-4866ff1b07a1', null, 4),
      ('36777dcc-6691-4808-b272-9a5308f7a989', '76fa4976-a65f-4647-8961-0b9e953039f3', null, 5),
      ('36777dcc-6691-4808-b272-9a5308f7a989', 'bb38dfe0-5238-4fe2-9f26-f3900d76261f', null, 6),
      -- COLLEGE_D1 · 2024 · Rocky Mountain D-I College Women's Conferences (Rocky-Mountain-D-I-Womens-Conferences-2024) · ended 2024-04-13
      ('9ec1d891-7df2-42f4-b537-d5cb4c5707ae', 'fa0b9c19-315a-40e9-aacf-81bb8b825dc3', null, 1),
      ('9ec1d891-7df2-42f4-b537-d5cb4c5707ae', '6d1804cf-eb96-4e48-ab5a-c58f3e1d26fd', null, 2),
      ('9ec1d891-7df2-42f4-b537-d5cb4c5707ae', 'dc954e9a-4c07-4299-afb9-955f5d366987', null, 3),
      ('9ec1d891-7df2-42f4-b537-d5cb4c5707ae', 'f51dd3a4-e6a9-4d43-90eb-620770e7ac5c', null, 4),
      -- COLLEGE_D1 · 2024 · Western North Central D-I College Women's Conferences (Western-North-Central-D-I-Womens-Conferences-2024) · ended 2024-04-13
      ('a388be81-b3a9-4ed0-b785-869dd4e3f5ce', 'fa034c30-ba81-4313-8874-e1385b35f52f', null, 1),
      ('a388be81-b3a9-4ed0-b785-869dd4e3f5ce', '08406af0-d8ac-447a-800d-70d70b45e468', null, 2),
      ('a388be81-b3a9-4ed0-b785-869dd4e3f5ce', '50ed27b4-af0d-4ce7-9645-0c25810ec4e5', null, 3),
      ('a388be81-b3a9-4ed0-b785-869dd4e3f5ce', 'd2f4adc4-b809-476c-933e-0c0b305a9707', null, 4),
      ('a388be81-b3a9-4ed0-b785-869dd4e3f5ce', '3c7c4f2e-3e20-4689-a7d1-2b740241ac0c', null, 5),
      ('a388be81-b3a9-4ed0-b785-869dd4e3f5ce', 'cacf3ac6-fa2e-4c34-b162-1159b6ecfd20', null, 6),
      -- COLLEGE_D1 · 2024 · Atlantic Coast Dev College Women's Conferences (Atlantic-Coast-Dev-Womens-Conferences-2024) · ended 2024-04-14
      ('6234fe01-1ac6-43db-999b-7c689cb0995f', '1b4f8078-0da7-40c6-a48d-469f7e8411c9', null, 1),
      ('6234fe01-1ac6-43db-999b-7c689cb0995f', '4b798faf-cc78-47ee-bcb8-ecf04f63ef54', null, 2),
      ('6234fe01-1ac6-43db-999b-7c689cb0995f', 'e77f34a4-0186-4c90-8cb2-62530f1e1daf', null, 3),
      ('6234fe01-1ac6-43db-999b-7c689cb0995f', '594f4f1f-e250-4dd3-b9d2-94d1cc1ed4c0', null, 4),
      -- COLLEGE_D1 · 2024 · Big Sky D-I College Men's Conferences (Big-Sky-D-I-Mens-Conferences-2024) · ended 2024-04-14
      ('bb4aadf8-d0db-426f-a82d-5a0255d52639', 'ced523b2-2052-4419-89c5-1c75324af6b9', null, 1),
      ('bb4aadf8-d0db-426f-a82d-5a0255d52639', '4a1f4aaa-aa4f-4e50-bf8b-e4bceed0581c', null, 2),
      ('bb4aadf8-d0db-426f-a82d-5a0255d52639', '7c0ec330-17c1-4ece-b6ab-b4776589b6c9', null, 3),
      ('bb4aadf8-d0db-426f-a82d-5a0255d52639', '2045fd6f-0940-49fc-97fb-28ef3b278c65', null, 4),
      ('bb4aadf8-d0db-426f-a82d-5a0255d52639', 'bf0b62c6-fb95-4804-86d3-c7f6f28671bb', null, 5),
      ('bb4aadf8-d0db-426f-a82d-5a0255d52639', 'cb4a46c1-5191-4e3b-b001-1c4db9d91af2', null, 7),
      ('bb4aadf8-d0db-426f-a82d-5a0255d52639', 'c1018cdf-5e4c-476a-9071-554fe6670b0d', null, 8),
      -- COLLEGE_D1 · 2024 · Carolina D-I College Men's Conferences (Carolina-D-I-Mens-Conferences-2024) · ended 2024-04-14
      ('7ac712bd-8c66-45c3-91da-ecd901f70213', '4ae45328-4cec-44f5-9c31-1fb35dea993f', null, 1),
      ('7ac712bd-8c66-45c3-91da-ecd901f70213', '4d360b12-d2ce-48f5-83b0-fd5baf30d1ff', null, 2),
      ('7ac712bd-8c66-45c3-91da-ecd901f70213', '2b069cb8-57b6-4b96-9ccf-b0bafc5eba5a', null, 3),
      ('7ac712bd-8c66-45c3-91da-ecd901f70213', '5b9255b4-b710-4ae9-8baf-fb1dad650cd4', null, 4),
      ('7ac712bd-8c66-45c3-91da-ecd901f70213', 'b383a05b-d0bd-4b70-9fff-b62b81b55460', null, 7),
      ('7ac712bd-8c66-45c3-91da-ecd901f70213', '86cd72dc-ab7b-4bbb-aad8-f987f28c145b', null, 8),
      ('7ac712bd-8c66-45c3-91da-ecd901f70213', 'cf13defa-3fef-4839-8901-99514d3a23c0', null, 9),
      ('7ac712bd-8c66-45c3-91da-ecd901f70213', 'caca7684-2c85-4273-ba4e-6137d5d44849', null, 10),
      ('7ac712bd-8c66-45c3-91da-ecd901f70213', 'baea4bb6-7531-48a6-a2fd-15bb8fe143d2', null, 11),
      -- COLLEGE_D1 · 2024 · Carolina D-I College Women's Conferences (Carolina-D-I-Womens-Conferences-2024) · ended 2024-04-14
      ('7f86237a-6b7e-4518-be08-7655ad425c67', '61011631-c568-4ce0-8b98-76a240a73319', null, 1),
      ('7f86237a-6b7e-4518-be08-7655ad425c67', '8caf33ef-4c8f-447b-b44c-100a285283ea', null, 2),
      ('7f86237a-6b7e-4518-be08-7655ad425c67', 'a3f7e420-b28d-4538-88dc-7d60a10eea78', null, 3),
      ('7f86237a-6b7e-4518-be08-7655ad425c67', 'f20b58f7-ec0e-46a6-a71e-d0899c2f01cb', null, 4),
      ('7f86237a-6b7e-4518-be08-7655ad425c67', 'a027fce3-db8f-46c8-afde-5c100c05e8e9', null, 5),
      ('7f86237a-6b7e-4518-be08-7655ad425c67', '46239e7b-334a-43f3-ab97-1ce196065532', null, 6),
      ('7f86237a-6b7e-4518-be08-7655ad425c67', '9780f5cf-0933-4c35-b9a9-fe8cc173b350', null, 7),
      ('7f86237a-6b7e-4518-be08-7655ad425c67', '27817d4c-0812-4fa9-a03e-8e45fc249dc3', null, 8),
      ('7f86237a-6b7e-4518-be08-7655ad425c67', 'cb1c169d-7bf7-457a-92ff-3303ff607899', null, 9),
      ('7f86237a-6b7e-4518-be08-7655ad425c67', 'c8e6ba77-a512-4af1-be0a-a8e8dcd52fbd', null, 10),
      -- COLLEGE_D1 · 2024 · Cascadia D-I College Men's Conferences (Cascadia-D-I-Mens-Conferences-2024) · ended 2024-04-14
      ('e924f83f-84d6-4dba-8c1f-a16093d57e85', 'b5a146f3-c654-4db9-97a9-5859b415f017', null, 1),
      ('e924f83f-84d6-4dba-8c1f-a16093d57e85', '76591296-475f-4f1d-b202-aad7468b0b0d', null, 2),
      ('e924f83f-84d6-4dba-8c1f-a16093d57e85', 'ada3f66a-f50f-4dfa-a23e-a5bedce93932', null, 3),
      ('e924f83f-84d6-4dba-8c1f-a16093d57e85', '02341a52-6326-4206-87be-4723512fb812', null, 4),
      ('e924f83f-84d6-4dba-8c1f-a16093d57e85', '417f994b-2787-4e64-b2f9-228361ab0e26', null, 5),
      ('e924f83f-84d6-4dba-8c1f-a16093d57e85', '8033f727-c05f-4c4a-8eee-e8dcdc7052cb', null, 6),
      ('e924f83f-84d6-4dba-8c1f-a16093d57e85', '467a8454-63d8-4d02-aaae-eede616ca1eb', null, 7),
      ('e924f83f-84d6-4dba-8c1f-a16093d57e85', '56980d98-fe00-45e0-b8d1-834f0292d52c', null, 8),
      ('e924f83f-84d6-4dba-8c1f-a16093d57e85', '9fbc46ad-c6a7-47dc-90c0-f810f3ba6cb5', null, 9),
      ('e924f83f-84d6-4dba-8c1f-a16093d57e85', 'c578e42e-08d0-4d9c-afac-42603f6226e5', null, 10),
      -- COLLEGE_D1 · 2024 · Cascadia D-I College Women's Conferences (Cascadia-D-I-Womens-Conferences-2024) · ended 2024-04-14
      ('863e5220-c5e5-4341-ae9b-3568a2749cce', '8f84d3a0-a360-4985-b08b-0a973d21fb3d', null, 1),
      ('863e5220-c5e5-4341-ae9b-3568a2749cce', 'ab243871-a0fa-4815-a940-11926a920d0e', null, 2),
      ('863e5220-c5e5-4341-ae9b-3568a2749cce', 'cbdbcf05-71d0-41a2-b37a-d2a063f863a9', null, 3),
      ('863e5220-c5e5-4341-ae9b-3568a2749cce', '67921307-c204-47c7-b11f-ed367ab97fef', null, 4),
      -- COLLEGE_D1 · 2024 · Colonial Dev College Men's Conferences (Colonial-Dev-Mens-Conferences-2024) · ended 2024-04-14
      ('61f578ae-bbf3-440b-af76-4498f4dfbf9c', 'b15049c2-9628-4aec-9601-04c33894ac6d', null, 1),
      ('61f578ae-bbf3-440b-af76-4498f4dfbf9c', 'ab0f85b6-db30-49fd-b6d1-973df5b29fb0', null, 2),
      ('61f578ae-bbf3-440b-af76-4498f4dfbf9c', 'a0e1b1d7-bee8-46e8-9eee-7fc2133a204a', null, 3),
      ('61f578ae-bbf3-440b-af76-4498f4dfbf9c', 'f98d4171-f05e-425a-a7a0-5f6b121f082b', null, 4),
      ('61f578ae-bbf3-440b-af76-4498f4dfbf9c', 'f14ff085-637b-4744-bdca-9b991ac6cf42', null, 5),
      -- COLLEGE_D1 · 2024 · Desert D-I College Men's Conferences (Desert-D-I-Mens-Conferences-2024) · ended 2024-04-14
      ('f699839f-cc28-46f7-96c7-4b2b09bcbfd7', 'b53266f0-01f6-41cb-81ae-983e72b6b527', null, 1),
      ('f699839f-cc28-46f7-96c7-4b2b09bcbfd7', 'c6f0559a-757b-4307-a805-35be9896a8f0', null, 2),
      ('f699839f-cc28-46f7-96c7-4b2b09bcbfd7', 'd0bbd82e-d0e9-4300-9120-6ec8dee45375', null, 3),
      ('f699839f-cc28-46f7-96c7-4b2b09bcbfd7', '6c1c7142-dbe1-44a9-a55a-f6c38ecd0b8f', null, 4),
      -- COLLEGE_D1 · 2024 · East Penn D-I College Men's Conferences (East-Penn-D-I-Mens-Conferences-2024) · ended 2024-04-14
      ('6a035096-8e09-4cd3-99fa-ac0993eefda5', 'bb4a09cf-a3b0-4633-a233-7cc5932e34e7', null, 1),
      ('6a035096-8e09-4cd3-99fa-ac0993eefda5', 'e3d0a834-0a68-46f6-9193-6f9669e482c6', null, 2),
      ('6a035096-8e09-4cd3-99fa-ac0993eefda5', '044ab6ea-8a93-4983-a9b6-bd9c15765a50', null, 3),
      ('6a035096-8e09-4cd3-99fa-ac0993eefda5', '95395728-2896-4a3c-b02a-3977d9faf31a', null, 4),
      ('6a035096-8e09-4cd3-99fa-ac0993eefda5', '76e6cae2-4120-4204-8c5e-836d568bd737', null, 5),
      ('6a035096-8e09-4cd3-99fa-ac0993eefda5', '2b771c67-4b46-4284-b9b3-df60c7502bae', null, 6),
      -- COLLEGE_D1 · 2024 · Eastern Great Lakes D-I College Women's Conferences (Eastern-Great-Lakes-D-I-Womens-Conferences-2024) · ended 2024-04-14
      ('fbf917a3-c1a6-4b7b-9c53-0bc7da325a6f', 'fe1b4ffd-70ab-4a8c-bb7d-ad86bd11f54a', null, 1),
      ('fbf917a3-c1a6-4b7b-9c53-0bc7da325a6f', '8a31c30c-1b6a-411f-9885-08bc8f45574a', null, 2),
      ('fbf917a3-c1a6-4b7b-9c53-0bc7da325a6f', '22621b32-0163-4405-a496-c9315e44b295', null, 3),
      ('fbf917a3-c1a6-4b7b-9c53-0bc7da325a6f', '43cc5395-d951-4c9d-83fa-12ac99b0cdc9', null, 4),
      ('fbf917a3-c1a6-4b7b-9c53-0bc7da325a6f', 'f930cce9-afba-4f29-bc1c-ccfda1ee4916', null, 5),
      ('fbf917a3-c1a6-4b7b-9c53-0bc7da325a6f', 'a0614e8f-d546-4d62-ab62-c53e014b60cf', null, 6),
      ('fbf917a3-c1a6-4b7b-9c53-0bc7da325a6f', '0cb80fd6-bc0a-4290-b0db-be62bc348428', null, 7),
      ('fbf917a3-c1a6-4b7b-9c53-0bc7da325a6f', '2ec6835d-5abd-463e-976d-0230e3e0aa08', null, 7),
      ('fbf917a3-c1a6-4b7b-9c53-0bc7da325a6f', '7e2d8113-8fbf-4729-9d24-12101514348a', null, 9),
      ('fbf917a3-c1a6-4b7b-9c53-0bc7da325a6f', 'c113d631-694c-4aa8-8a55-c0cabe8db265', null, 10),
      -- COLLEGE_D1 · 2024 · Eastern Metro East D-I College Women's Conferences (Eastern-Metro-East-D-I-Womens-Conferences-2024) · ended 2024-04-14
      ('4bd1b074-c036-4feb-9122-63f441ea353f', '9a213f7f-af45-4c27-a960-4d472f37a3d8', null, 1),
      ('4bd1b074-c036-4feb-9122-63f441ea353f', 'c7522135-7eef-4487-9b5e-065b796a972a', null, 2),
      ('4bd1b074-c036-4feb-9122-63f441ea353f', 'df9341e1-9e37-4055-a685-5a29769654bf', null, 4),
      ('4bd1b074-c036-4feb-9122-63f441ea353f', '36ff3283-f9b2-457d-a0e0-2701006f5c86', null, 5),
      ('4bd1b074-c036-4feb-9122-63f441ea353f', '213cf2a0-ab69-47c1-a4ff-b9fdf0cd5e6e', null, 6),
      ('4bd1b074-c036-4feb-9122-63f441ea353f', '866e4254-64b8-450d-af13-af4e0c13422a', null, 7),
      ('4bd1b074-c036-4feb-9122-63f441ea353f', '9626cb63-4328-4ae4-9e6c-ab8eb2ce7b33', null, 8),
      -- COLLEGE_D1 · 2024 · Florida D-I College Men's Conferences (Florida-D-I-Mens-Conferences-2024) · ended 2024-04-14
      ('39f895a9-3c66-49de-bc64-d0d2e0ac0248', 'e030dc52-dff2-4352-a846-97a7b6a616fd', null, 1),
      ('39f895a9-3c66-49de-bc64-d0d2e0ac0248', 'b7951d1e-2682-4dca-a56f-eca674992360', null, 2),
      ('39f895a9-3c66-49de-bc64-d0d2e0ac0248', '614a8ae3-274b-4bce-9a75-6ddb5ddc463d', null, 3),
      ('39f895a9-3c66-49de-bc64-d0d2e0ac0248', 'd6cca8da-4c56-4b7c-b306-06ff058fe58d', null, 4),
      -- COLLEGE_D1 · 2024 · Florida D-I College Women's Conferences (Florida-D-I-Womens-Conferences-2024) · ended 2024-04-14
      ('e02b1d13-d93e-473b-8256-b54d66c6a2d6', 'd60133c9-3899-406b-88d9-616fb8ad9573', null, 1),
      ('e02b1d13-d93e-473b-8256-b54d66c6a2d6', 'ac6290be-6793-4ae0-a1d6-c7647b347d13', null, 2),
      ('e02b1d13-d93e-473b-8256-b54d66c6a2d6', 'd91d6569-97bf-4608-954d-d70187ff9325', null, 3),
      ('e02b1d13-d93e-473b-8256-b54d66c6a2d6', 'd2749398-4974-4ef4-88ed-258cea35a6f3', null, 4),
      ('e02b1d13-d93e-473b-8256-b54d66c6a2d6', '072130ee-2daf-4a2e-8abf-e070d1384fa3', null, 5),
      -- COLLEGE_D1 · 2024 · Great Lakes Dev College Men's Conferences (Great-Lakes-Dev-Mens-Conferences-2024) · ended 2024-04-14
      ('f60a8666-eb38-4311-8992-49bad8907528', '1cf463fc-ffc0-4ab7-9e3c-e30a4f47ab6b', null, 1),
      ('f60a8666-eb38-4311-8992-49bad8907528', '4a64e586-4d09-4bb9-9bdf-36c17cbe4c54', null, 2),
      ('f60a8666-eb38-4311-8992-49bad8907528', '103efe65-4789-4aa7-bce4-90e36877d43a', null, 5),
      ('f60a8666-eb38-4311-8992-49bad8907528', '62764a0b-1230-49b6-af39-63df11d903a6', null, 5),
      ('f60a8666-eb38-4311-8992-49bad8907528', '5f10e1b9-c659-4acc-93c1-b1739aa17653', null, 7),
      ('f60a8666-eb38-4311-8992-49bad8907528', 'dfe44464-9ad6-44ff-b428-b4d7c8701921', null, 8),
      -- COLLEGE_D1 · 2024 · Greater New England D-I College Men's Conferences (Greater-New-England-D-I-Mens-Conferences-2024) · ended 2024-04-14
      ('3032b028-df9d-4d96-b57d-2f2e46070a82', '8b0c9903-6810-4664-9593-2f05aa951fd2', null, 1),
      ('3032b028-df9d-4d96-b57d-2f2e46070a82', '340e03cc-5f80-4791-bf04-fba066e52a26', null, 2),
      -- COLLEGE_D1 · 2024 · Greater New England D-I College Women's Conferences (Greater-New-England-D-I-Womens-Conferences-2024) · ended 2024-04-14
      ('89fcbd13-f2e7-46c8-a763-50a194323299', '3ec6d2fc-7bdb-457b-8dd9-8481a2553215', null, 1),
      ('89fcbd13-f2e7-46c8-a763-50a194323299', '6be33b58-bbbd-4bd8-ba3d-d37d254ed4d9', null, 2),
      ('89fcbd13-f2e7-46c8-a763-50a194323299', 'da3faf4a-de3f-476b-8806-203330fcab07', null, 3),
      ('89fcbd13-f2e7-46c8-a763-50a194323299', 'd3b1fdf4-476c-44c8-8742-a318b2a6cd01', null, 4),
      ('89fcbd13-f2e7-46c8-a763-50a194323299', '10cbdb9d-8905-4156-9d54-5c9321158575', null, 5),
      ('89fcbd13-f2e7-46c8-a763-50a194323299', '30404637-9cbe-4aa9-93d6-12c4c9a33185', null, 6),
      -- COLLEGE_D1 · 2024 · Gulf Coast D-I College Men's Conferences (Gulf-Coast-D-I-Mens-Conferences-2024) · ended 2024-04-14
      ('e50e6775-5a42-4903-80d0-15acd81316a1', 'e6d1b093-8013-49d0-bd07-cbe350ef27f8', null, 1),
      ('e50e6775-5a42-4903-80d0-15acd81316a1', '356d0bf0-6432-4726-b3ef-c0df5c355e73', null, 2),
      ('e50e6775-5a42-4903-80d0-15acd81316a1', '04553841-92b5-4e41-80f8-a9fc56098dba', null, 3),
      ('e50e6775-5a42-4903-80d0-15acd81316a1', 'a960b24d-d36e-46b7-8cf6-260b7b17a759', null, 4),
      -- COLLEGE_D1 · 2024 · Gulf Coast D-I College Women's Conferences (Gulf-Coast-D-I-Womens-Conferences-2024) · ended 2024-04-14
      ('37835c7e-e1ba-4111-af9e-ccb31daa3b50', '332aea65-9434-45b7-939d-02bec8ceb5d2', null, 1),
      ('37835c7e-e1ba-4111-af9e-ccb31daa3b50', 'fbe12c9b-83ea-4542-8a74-dbc54d6bfc4b', null, 2),
      ('37835c7e-e1ba-4111-af9e-ccb31daa3b50', '76f14483-ae4e-4c1c-a89a-aebb64649aec', null, 3),
      ('37835c7e-e1ba-4111-af9e-ccb31daa3b50', 'fc04037f-6138-432a-9bdd-f7e5cdc86ca3', null, 4),
      ('37835c7e-e1ba-4111-af9e-ccb31daa3b50', '97ab9b24-cb66-453a-acdf-ae9baf2f1326', null, 5),
      ('37835c7e-e1ba-4111-af9e-ccb31daa3b50', 'ba44f598-7d3f-4561-9fc1-c25f7f498f5b', null, 5),
      ('37835c7e-e1ba-4111-af9e-ccb31daa3b50', '71301414-b76f-4b66-be56-20ddf8de9cf7', null, 7),
      ('37835c7e-e1ba-4111-af9e-ccb31daa3b50', '62cd3922-2d26-4ba9-9e6a-59b136971c16', null, 8),
      -- COLLEGE_D1 · 2024 · Hudson Valley D-I College Men's Conferences (Hudson-Valley-D-I-Mens-Conferences-2024) · ended 2024-04-14
      ('63eecb0a-5b7f-4266-b4b3-1fe35e80b4ee', '28e0b8ed-b199-408b-afa7-822870ac11b0', null, 2),
      ('63eecb0a-5b7f-4266-b4b3-1fe35e80b4ee', 'b36328d1-0f5e-4432-8904-6a4816766e19', null, 3),
      ('63eecb0a-5b7f-4266-b4b3-1fe35e80b4ee', '68114425-d16f-4c05-86a4-4f51e491c280', null, 4),
      ('63eecb0a-5b7f-4266-b4b3-1fe35e80b4ee', 'dbbd6df8-57e0-4d76-bf23-083a1d9857dd', null, 5),
      -- COLLEGE_D1 · 2024 · Illinois D-I College Men's Conferences (Illinois-D-I-Mens-Conferences-2024) · ended 2024-04-14
      ('5ee47542-b40c-4df1-bb27-14ee1299a69e', '59efa4f7-5071-4439-be54-46e783d084c9', null, 1),
      ('5ee47542-b40c-4df1-bb27-14ee1299a69e', '93b20dc4-a4a7-4120-9d55-49abd32f616c', null, 2),
      ('5ee47542-b40c-4df1-bb27-14ee1299a69e', '88f15a55-085e-476a-9568-f2166230048e', null, 5),
      ('5ee47542-b40c-4df1-bb27-14ee1299a69e', '712a712c-62ff-4f12-af91-af10ffa11a75', null, 6),
      ('5ee47542-b40c-4df1-bb27-14ee1299a69e', '1d561712-83d2-4601-af4a-eae893146fda', null, 7),
      ('5ee47542-b40c-4df1-bb27-14ee1299a69e', 'b3816495-9004-4ee4-a41a-6c6bd1535e6c', null, 8),
      -- COLLEGE_D1 · 2024 · Lake Superior D-I College Men's Conferences (Lake-Superior-D-I-Mens-Conferences-2024) · ended 2024-04-14
      ('cc0d8bc5-d3d6-44cf-9e6b-25d1bbf97a40', 'fd626956-bf66-40a5-9e16-4138fa933cf3', null, 1),
      ('cc0d8bc5-d3d6-44cf-9e6b-25d1bbf97a40', '70e5e451-2ac2-44cc-ba5f-d8e86a5c8fb0', null, 2),
      ('cc0d8bc5-d3d6-44cf-9e6b-25d1bbf97a40', 'a333585b-fb15-4fb1-a2d0-046f441e3a75', null, 3),
      ('cc0d8bc5-d3d6-44cf-9e6b-25d1bbf97a40', '448ea897-7c60-4cfb-b31e-5dab6e9339ce', null, 4),
      ('cc0d8bc5-d3d6-44cf-9e6b-25d1bbf97a40', 'a58357c9-3b97-49eb-9814-db91d6fb5813', null, 5),
      ('cc0d8bc5-d3d6-44cf-9e6b-25d1bbf97a40', '2b046a6d-8270-4108-b64e-aa4db556d215', null, 6),
      ('cc0d8bc5-d3d6-44cf-9e6b-25d1bbf97a40', '9c934324-83af-46ea-abca-43f1e7afb1d8', null, 7),
      ('cc0d8bc5-d3d6-44cf-9e6b-25d1bbf97a40', 'bb88e03a-8713-4698-ace0-5d6546cefa08', null, 8),
      -- COLLEGE_D1 · 2024 · Metro Boston D-I College Men's Conferences (Metro-Boston-D-I-Mens-Conferences-2024) · ended 2024-04-14
      ('a009e9a2-f16f-49e0-8f4b-07f66667ee65', 'd1ef84eb-28e7-44c6-a4c3-f0326f5dfb9d', null, 1),
      ('a009e9a2-f16f-49e0-8f4b-07f66667ee65', '9332894c-244d-49d3-b700-1b04cd09a615', null, 2),
      -- COLLEGE_D1 · 2024 · Metro Boston Dev College Men's Conferences (Metro-Boston-Dev-Mens-Conferences-2024) · ended 2024-04-14
      ('277bba3a-0b0f-4e10-8212-5f4205306a31', '816b3e0f-d301-478f-9b92-b543c08bd51f', null, 1),
      ('277bba3a-0b0f-4e10-8212-5f4205306a31', 'b040ebd5-7629-4567-8cfa-4572f568624a', null, 2),
      ('277bba3a-0b0f-4e10-8212-5f4205306a31', '7693c6fd-a651-4a86-adc9-a647e874c2b3', null, 3),
      ('277bba3a-0b0f-4e10-8212-5f4205306a31', '41a930b8-b84b-4457-8fee-5358a8e61dfb', null, 5),
      ('277bba3a-0b0f-4e10-8212-5f4205306a31', '7adf3e52-f1e0-4dc2-b228-756351e08b5a', null, 6),
      -- COLLEGE_D1 · 2024 · Metro East Dev College Men's Conferences (Metro-East-Dev-Mens-Conferences-2024) · ended 2024-04-14
      ('63b263f0-1cf7-4e56-a935-2caf93433339', 'cddfc30a-5f22-4621-89dc-4f0855e01bf6', null, 1),
      ('63b263f0-1cf7-4e56-a935-2caf93433339', '9a2838d1-9409-4758-b149-5ef4bd08793c', null, 2),
      ('63b263f0-1cf7-4e56-a935-2caf93433339', '86012572-43bb-485b-ae8d-b069d4bf19db', null, 3),
      ('63b263f0-1cf7-4e56-a935-2caf93433339', 'd0121e12-b90d-4c51-b525-e9eb2298d240', null, 4),
      -- COLLEGE_D1 · 2024 · Metro NY D-I College Men's Conferences (Metro-NY-D-I-Mens-Conferences-2024) · ended 2024-04-14
      ('e49a681b-6d34-448e-8e9b-02122b0e783f', 'af3a6364-4304-4929-904e-cd2fe823e672', null, 1),
      ('e49a681b-6d34-448e-8e9b-02122b0e783f', 'ac1d9e97-f6e1-483f-afad-e5cc1ad97c18', null, 2),
      ('e49a681b-6d34-448e-8e9b-02122b0e783f', 'f7f90bf5-ff1c-4743-a138-b4662be12b98', null, 3),
      ('e49a681b-6d34-448e-8e9b-02122b0e783f', '71fdcfb6-d3ef-4e5a-8279-835c945eab11', null, 4),
      ('e49a681b-6d34-448e-8e9b-02122b0e783f', '90be649e-7386-494a-9cd0-e10c2f554323', null, 5),
      ('e49a681b-6d34-448e-8e9b-02122b0e783f', 'a1c10a22-ee9a-4320-9b60-f50c9597c9bd', null, 6),
      ('e49a681b-6d34-448e-8e9b-02122b0e783f', '4ff4f9d8-bf51-4c44-aa18-7e575495e347', null, 7),
      ('e49a681b-6d34-448e-8e9b-02122b0e783f', 'f9185bce-5e0b-44e0-974e-c6e3fd48f1aa', null, 8),
      -- COLLEGE_D1 · 2024 · Michigan D-I College Men's Conferences (Michigan-D-I-Mens-Conferences-2024) · ended 2024-04-14
      ('fb0ff6c2-f24d-4b9e-986c-8129c6780462', 'a68aac0b-140b-4f79-b7d4-764fe4172d20', null, 3),
      ('fb0ff6c2-f24d-4b9e-986c-8129c6780462', '85aa191a-b22a-41de-b98b-ab8234fde11c', null, 4),
      ('fb0ff6c2-f24d-4b9e-986c-8129c6780462', '2dd8b869-03a3-423c-be90-b6ca789a3753', null, 5),
      -- COLLEGE_D1 · 2024 · NorCal D-I College Men's Conferences (NorCal-D-I-Mens-Conferences-2024) · ended 2024-04-14
      ('aa70e819-ab1d-48c1-804c-1172a0ba6af8', '985dbdb0-f7c8-4064-8134-5c10bac9967a', null, 1),
      ('aa70e819-ab1d-48c1-804c-1172a0ba6af8', '32cd2388-d433-4896-a77a-8a84c8ca2f03', null, 2),
      ('aa70e819-ab1d-48c1-804c-1172a0ba6af8', 'f837f5b6-452c-49bf-95ee-6ab5d5b8f044', null, 3),
      ('aa70e819-ab1d-48c1-804c-1172a0ba6af8', '75d01286-028a-44a7-8e7b-d9835e832245', null, 4),
      -- COLLEGE_D1 · 2024 · NorCal D-I College Women's Conferences (NorCal-D-I-Womens-Conferences-2024) · ended 2024-04-14
      ('900cdd54-ea57-412c-8e0e-772e6bf6a191', 'f198001b-0bb6-40aa-a139-c9b3bde5fc0e', null, 1),
      ('900cdd54-ea57-412c-8e0e-772e6bf6a191', '5f238033-8e7e-4304-a208-284758d16a3d', null, 2),
      -- COLLEGE_D1 · 2024 · North Central Dev College Men's Conferences (North-Central-Dev-Mens-Conferences-2024) · ended 2024-04-14
      ('6bb6f009-42e1-4ed5-a757-dcc1e6d76602', '152778ec-7354-4342-9a41-904ca8046e25', null, 1),
      ('6bb6f009-42e1-4ed5-a757-dcc1e6d76602', 'ddde10a1-bc5d-4372-9d80-95b18fb02ec8', null, 2),
      ('6bb6f009-42e1-4ed5-a757-dcc1e6d76602', 'b8956bce-8cb0-4d1d-a014-28fae15484a7', null, 3),
      ('6bb6f009-42e1-4ed5-a757-dcc1e6d76602', '7b587647-4169-452d-a352-1f78467e9b09', null, 4),
      -- COLLEGE_D1 · 2024 · North Texas D-I College Men's Conferences (North-Texas-D-I-Mens-Conferences-2024) · ended 2024-04-14
      ('4a9deaac-1da7-45c6-a245-a6f4fffdd30c', '2c003ee3-937b-4786-ba50-37e01a8a2a8b', null, 1),
      ('4a9deaac-1da7-45c6-a245-a6f4fffdd30c', '97e9313f-c7a7-488c-9762-42b6e5a649e6', null, 2),
      ('4a9deaac-1da7-45c6-a245-a6f4fffdd30c', '5c97555f-a1fd-44ef-96d0-5da023f45cd9', null, 3),
      ('4a9deaac-1da7-45c6-a245-a6f4fffdd30c', 'e80c10b1-acf5-4368-97b0-cdfc33d03c31', null, 4),
      -- COLLEGE_D1 · 2024 · Ohio D-I College Men's Conferences (Ohio-D-I-Mens-Conferences-2024) · ended 2024-04-14
      ('eec243c0-b434-4f37-bbab-2a6c8a92f0a1', 'e4eb66b5-d755-4bcc-9697-a1f701c70a02', null, 1),
      ('eec243c0-b434-4f37-bbab-2a6c8a92f0a1', '47dbd43a-db19-42ea-8212-bb18db643f4d', null, 2),
      ('eec243c0-b434-4f37-bbab-2a6c8a92f0a1', '74789ce7-759a-4057-a64b-21b533e93d26', null, 3),
      ('eec243c0-b434-4f37-bbab-2a6c8a92f0a1', 'd955e34f-2a7b-403b-a23a-c5eabd571822', null, 4),
      ('eec243c0-b434-4f37-bbab-2a6c8a92f0a1', '7964a6f2-9f58-4377-835c-d5073fc5ee74', null, 5),
      ('eec243c0-b434-4f37-bbab-2a6c8a92f0a1', 'e4c4197e-f1c2-4c22-96ea-75e346d9c6f7', null, 6),
      ('eec243c0-b434-4f37-bbab-2a6c8a92f0a1', 'd5156553-c719-425e-b85d-049a32448e34', null, 7),
      ('eec243c0-b434-4f37-bbab-2a6c8a92f0a1', '139954b1-c7bf-420e-9d4d-785614a01eac', null, 8),
      ('eec243c0-b434-4f37-bbab-2a6c8a92f0a1', 'ccc92763-3bc1-4c50-9720-96c5fd6dd77f', null, 9),
      ('eec243c0-b434-4f37-bbab-2a6c8a92f0a1', '58eafa54-f793-4099-a68c-10aef96c6764', null, 10),
      ('eec243c0-b434-4f37-bbab-2a6c8a92f0a1', '45764cc7-2b9c-49c9-968f-32a85706e7da', null, 11),
      -- COLLEGE_D1 · 2024 · Ozarks D-I College Men's Conferences (Ozarks-D-I-Mens-Conferences-2024) · ended 2024-04-14
      ('8cced9de-b7ba-4346-b5cd-d428133666e2', '257c754c-ac23-42dd-8b49-e224d9c82a0b', null, 1),
      ('8cced9de-b7ba-4346-b5cd-d428133666e2', 'f3fc432f-9d25-476e-b990-3e449f8fb23f', null, 2),
      ('8cced9de-b7ba-4346-b5cd-d428133666e2', 'e51d13a8-07da-4dd4-8b57-968afd5380d2', null, 3),
      ('8cced9de-b7ba-4346-b5cd-d428133666e2', 'aa4b7456-1f98-48cd-b9fe-c23f464fac8a', null, 4),
      ('8cced9de-b7ba-4346-b5cd-d428133666e2', '4e57ea63-6507-4930-ad95-1f11d7d984b8', null, 5),
      ('8cced9de-b7ba-4346-b5cd-d428133666e2', '9809f955-dd14-49f3-9c98-02514def9233', null, 6),
      ('8cced9de-b7ba-4346-b5cd-d428133666e2', 'cfbdbd52-930a-4510-a5f6-ce16420280cf', null, 7),
      ('8cced9de-b7ba-4346-b5cd-d428133666e2', 'a2a838b6-a3d0-48a2-992f-057cd478ff60', null, 8),
      ('8cced9de-b7ba-4346-b5cd-d428133666e2', '0a8431b5-e9f0-4296-9a75-59ed717b071b', null, 9),
      ('8cced9de-b7ba-4346-b5cd-d428133666e2', '04ef290d-b82d-4726-a8ae-f725224336dc', null, 10),
      ('8cced9de-b7ba-4346-b5cd-d428133666e2', 'da758656-4201-49da-b9db-57577635c51c', null, 11),
      -- COLLEGE_D1 · 2024 · Ozarks D-I College Women's Conferences (Ozarks-D-I-Womens-Conferences-2024) · ended 2024-04-14
      ('c358a256-2299-492d-a276-ab2c955ea569', '0cbac12c-9c5e-42c6-b4bb-9d046b09e472', null, 1),
      ('c358a256-2299-492d-a276-ab2c955ea569', '40c7e6e3-178d-41af-a4d8-2805578fc671', null, 2),
      -- COLLEGE_D1 · 2024 · Pennsylvania D-I College Women's Conferences (Pennsylvania-D-I-Womens-Conferences-2024) · ended 2024-04-14
      ('74a6da1f-bb22-4791-b7be-c082577ae383', '4752e684-ac6f-4520-a77c-f7d8e5c7001d', null, 1),
      ('74a6da1f-bb22-4791-b7be-c082577ae383', 'e13b4580-f112-4184-927b-51058c932bc0', null, 2),
      ('74a6da1f-bb22-4791-b7be-c082577ae383', 'a689cb79-f411-4769-8518-6435e8b0b59e', null, 3),
      ('74a6da1f-bb22-4791-b7be-c082577ae383', '67af4b45-5413-4669-b5d6-aa6f06aece00', null, 4),
      -- COLLEGE_D1 · 2024 · Rocky Mountain D-I College Men's Conferences (Rocky-Mountain-D-I-Mens-Conferences-2024) · ended 2024-04-14
      ('b1d9eb92-ee80-40ae-b373-5f21232b839a', 'b69e3cff-a578-432d-85b4-d301106aef14', null, 1),
      ('b1d9eb92-ee80-40ae-b373-5f21232b839a', '23abbb2b-49fe-47cc-8448-246552ed75f4', null, 2),
      ('b1d9eb92-ee80-40ae-b373-5f21232b839a', 'f7ef181a-63ef-4c8b-8fe1-324a823b87d4', null, 3),
      ('b1d9eb92-ee80-40ae-b373-5f21232b839a', '794ae985-c053-4c2a-a2e3-ba9c2b9a3cbd', null, 4),
      ('b1d9eb92-ee80-40ae-b373-5f21232b839a', '02ebc136-0033-46a0-9505-19f16f562025', null, 5),
      ('b1d9eb92-ee80-40ae-b373-5f21232b839a', '446f39aa-a0a9-4118-b218-ef383053075d', null, 6),
      ('b1d9eb92-ee80-40ae-b373-5f21232b839a', 'd2acb550-90f6-4082-8617-b37a76eb46af', null, 7),
      ('b1d9eb92-ee80-40ae-b373-5f21232b839a', '0cf12ac5-1101-4669-b686-a58e292f365c', null, 8),
      -- COLLEGE_D1 · 2024 · SoCal D-I Men's College Conferences (SoCal-D-I-Mens-Conferences-2024) · ended 2024-04-14
      ('308d91de-197f-495a-9910-64e664702809', '076df380-6e1e-44f3-9842-2be14188206f', null, 1),
      ('308d91de-197f-495a-9910-64e664702809', '7a111177-e9bb-43bd-941a-bd6010cbb083', null, 2),
      ('308d91de-197f-495a-9910-64e664702809', 'fb909246-a6ae-45c7-9e97-7f5051fa7f9e', null, 3),
      ('308d91de-197f-495a-9910-64e664702809', 'fcabc0f8-0b19-4b8b-9089-0fb169b8f4b7', null, 4),
      -- COLLEGE_D1 · 2024 · SoCal D-I College Women's Conferences (SoCal-D-I-Womens-Conferences-2024) · ended 2024-04-14
      ('0d465511-f275-4f92-a140-ff97ccf24156', '4afd9ee8-671b-4ec8-9d4a-019ec668e8c7', null, 1),
      ('0d465511-f275-4f92-a140-ff97ccf24156', 'e4950e11-7f67-4467-a7ee-a7c94dfea9e4', null, 2),
      ('0d465511-f275-4f92-a140-ff97ccf24156', 'aac56658-76c5-4666-a0d0-9ad81c541972', null, 3),
      ('0d465511-f275-4f92-a140-ff97ccf24156', '9cfc6ecb-36ec-444e-bd7c-b19d39f10370', null, 4),
      ('0d465511-f275-4f92-a140-ff97ccf24156', '90ee4dd4-2eba-4711-9c97-710a144bf629', null, 5),
      ('0d465511-f275-4f92-a140-ff97ccf24156', 'b42bec7c-e82e-47be-8eec-243f4b8842c7', null, 6),
      ('0d465511-f275-4f92-a140-ff97ccf24156', '26ad5e91-2552-4b9d-87ee-67665c2304c3', null, 7),
      ('0d465511-f275-4f92-a140-ff97ccf24156', '6dea462e-bc9d-408e-882b-6017bafd8728', null, 8),
      -- COLLEGE_D1 · 2024 · South Texas D-I College Men's Conferences (South-Texas-D-I-Mens-Conferences-2024) · ended 2024-04-14
      ('ae67578f-c9f6-4484-a641-7229d30c7f64', 'ee181730-7cea-443a-8353-8f2a61218504', null, 1),
      ('ae67578f-c9f6-4484-a641-7229d30c7f64', 'c558edc7-6ce2-493b-bb82-83a71d5a042e', null, 2),
      ('ae67578f-c9f6-4484-a641-7229d30c7f64', '1cd0dce4-f180-4944-bd64-086207778622', null, 3),
      ('ae67578f-c9f6-4484-a641-7229d30c7f64', '1b79d6a3-ff5e-47f9-bfd5-e3a81a6e4375', null, 4),
      ('ae67578f-c9f6-4484-a641-7229d30c7f64', 'd08d0ce1-4b89-4046-b0f7-55361e27d6d5', null, 5),
      ('ae67578f-c9f6-4484-a641-7229d30c7f64', '7af7faa3-35c7-426b-81b6-3eafcb298f7a', null, 6),
      ('ae67578f-c9f6-4484-a641-7229d30c7f64', '4cee573c-6c60-4e86-8a0a-2d177f4ed600', null, 7),
      ('ae67578f-c9f6-4484-a641-7229d30c7f64', '7f1ceea9-fdc2-423e-b1ec-2cbe6a10c225', null, 8),
      -- COLLEGE_D1 · 2024 · Southeast Dev College Men's Conferences (Southeast-Dev-Mens-Conferences-2024) · ended 2024-04-14
      ('6929ecca-1c93-4f2e-b7e6-5ece5e52da23', '251889ca-c95e-4406-abc1-b88d3d023fe1', null, 1),
      ('6929ecca-1c93-4f2e-b7e6-5ece5e52da23', '0bfc6bf9-39f3-4fed-b913-7c674f885e9e', null, 2),
      ('6929ecca-1c93-4f2e-b7e6-5ece5e52da23', 'b5ecc30a-7d27-465c-91bc-bde7fdfe34de', null, 3),
      ('6929ecca-1c93-4f2e-b7e6-5ece5e52da23', '74abb097-06dc-4a68-83f5-61d2925de3b8', null, 4),
      ('6929ecca-1c93-4f2e-b7e6-5ece5e52da23', 'aeca7300-84da-4868-b935-ee0b904f1737', null, 7),
      ('6929ecca-1c93-4f2e-b7e6-5ece5e52da23', 'fd5fe7ca-81af-41b3-be8f-31ce4c79a1db', null, 8),
      -- COLLEGE_D1 · 2024 · Southern Appalachian D-I College Men's Conferences (Southern-Appalachian-D-I-Mens-Conferences-2024) · ended 2024-04-14
      ('b763b7c7-a316-47ce-a8a1-f8d63e606b23', 'b5a0070d-ef42-409c-9a67-98e0ace4c585', null, 1),
      ('b763b7c7-a316-47ce-a8a1-f8d63e606b23', '6125041a-63a4-4865-9f7a-93e27361f18e', null, 2),
      ('b763b7c7-a316-47ce-a8a1-f8d63e606b23', 'b3b4dd1b-badd-4d48-a290-25f7ec9eefea', null, 3),
      -- COLLEGE_D1 · 2024 · Southern Appalachian D-I College Women's Conferences (Southern-Appalachian-D-I-Womens-Conferences-2024) · ended 2024-04-14
      ('aefd9892-3f5d-4122-a73b-9dd2c20c00a3', 'dad6b89f-f96f-4368-9830-b96f5fdd077a', null, 1),
      ('aefd9892-3f5d-4122-a73b-9dd2c20c00a3', '8da19f54-df2d-43cc-873d-e00297ef595c', null, 2),
      ('aefd9892-3f5d-4122-a73b-9dd2c20c00a3', '1ff4b050-0fba-44eb-ab0d-d7d87e605aa8', null, 3),
      ('aefd9892-3f5d-4122-a73b-9dd2c20c00a3', '64c5ac7a-5336-4f75-a232-86683a9e120f', null, 4),
      ('aefd9892-3f5d-4122-a73b-9dd2c20c00a3', '4a5a02b4-7419-47aa-b3d0-21bec31e78e4', null, 5),
      ('aefd9892-3f5d-4122-a73b-9dd2c20c00a3', 'c90d20aa-f6c8-4585-9432-125398b3fe5e', null, 6),
      ('aefd9892-3f5d-4122-a73b-9dd2c20c00a3', '7d899e03-835f-4bb5-b39e-97ad72f389f1', null, 7),
      ('aefd9892-3f5d-4122-a73b-9dd2c20c00a3', '7952212a-8a77-4ef5-8610-50bfdf18454c', null, 8),
      -- COLLEGE_D1 · 2024 · Southwest Dev College Women's Conferences (Southwest-Dev-Womens-Conferences-2024) · ended 2024-04-14
      ('c74654e1-f734-4621-82b2-64df49a434bb', '02d25162-89d6-42ff-98c2-62e4a6df1786', null, 1),
      ('c74654e1-f734-4621-82b2-64df49a434bb', '3cbf1583-c6b5-4b32-9f53-16c642b9e09e', null, 2),
      ('c74654e1-f734-4621-82b2-64df49a434bb', 'c5da3fee-1ebf-40c8-a93e-2aa5db77e435', null, 3),
      ('c74654e1-f734-4621-82b2-64df49a434bb', 'd7920210-4793-49fa-b87e-354bf3e9e857', null, 4),
      ('c74654e1-f734-4621-82b2-64df49a434bb', 'a9f73b74-6849-48f9-81f3-b07ab3298bff', null, 5),
      ('c74654e1-f734-4621-82b2-64df49a434bb', '418742db-f76d-471b-84f0-6ee81879b955', null, 6),
      ('c74654e1-f734-4621-82b2-64df49a434bb', 'e504f8e4-8cd7-4da0-85f4-494bfaace4a0', null, 7),
      -- COLLEGE_D1 · 2024 · Texas D-I College Women's Conferences (Texas-D-I-Womens-Conferences-2024) · ended 2024-04-14
      ('b2611ea7-07ba-453c-b6c1-7b2d07009025', 'ea5e7bca-2958-42b5-86e7-de058538543e', null, 1),
      ('b2611ea7-07ba-453c-b6c1-7b2d07009025', 'be069390-e123-4b60-9434-ac916c7ef1dc', null, 2),
      ('b2611ea7-07ba-453c-b6c1-7b2d07009025', '844957ff-9578-4817-8921-3216376946a7', null, 3),
      ('b2611ea7-07ba-453c-b6c1-7b2d07009025', 'c6a65363-c5e8-4a56-ae87-40775fe7c9b7', null, 4),
      -- COLLEGE_D1 · 2024 · Western NY D-I College Women's Conferences (Western-NY-D-I-Womens-Conferences-2024) · ended 2024-04-20
      ('a13a7c90-4474-4c69-b693-1219b8bfda3d', 'e1b02c67-7add-449b-88d1-54da56338a2a', null, 1),
      ('a13a7c90-4474-4c69-b693-1219b8bfda3d', '7696a9ba-781d-47fb-a73f-75ec53752f4e', null, 2),
      ('a13a7c90-4474-4c69-b693-1219b8bfda3d', 'f8be1814-9ba0-4b20-90fc-931d310be8fb', null, 3),
      ('a13a7c90-4474-4c69-b693-1219b8bfda3d', 'd4e9e939-0746-4a7d-8e34-3f7af8e5dc2d', null, 4),
      ('a13a7c90-4474-4c69-b693-1219b8bfda3d', 'cd12ffc0-e9f0-412c-b47c-6eabaf32e978', null, 5),
      ('a13a7c90-4474-4c69-b693-1219b8bfda3d', 'e67f8a37-d6dd-411e-b5c4-036da72b1319', null, 6),
      -- COLLEGE_D1 · 2024 · Colonial D-I College Men's Conferences (Colonial-D-I-Mens-Conferences-2024) · ended 2024-04-21
      ('3fb23557-e8fd-4106-9158-5e01b6c897f2', 'e53ea3b8-8bee-47d5-b3e6-b301dc32537e', null, 1),
      ('3fb23557-e8fd-4106-9158-5e01b6c897f2', '497f27b3-5c4a-4273-b1a3-4cd3dcd63a2c', null, 2),
      ('3fb23557-e8fd-4106-9158-5e01b6c897f2', '0dd38475-b45e-4856-bef6-2d802fcaa03b', null, 3),
      ('3fb23557-e8fd-4106-9158-5e01b6c897f2', '409685e4-28ce-4775-adb3-5e4aa0196912', null, 4),
      ('3fb23557-e8fd-4106-9158-5e01b6c897f2', '42a30e2f-a96e-46bd-bd6d-d7571ec0a08e', null, 5),
      ('3fb23557-e8fd-4106-9158-5e01b6c897f2', '074d7172-1078-4c17-b468-30275a774bf1', null, 6),
      ('3fb23557-e8fd-4106-9158-5e01b6c897f2', '173b3519-8e55-43d7-9ec8-0ebda7344ba3', null, 7),
      ('3fb23557-e8fd-4106-9158-5e01b6c897f2', 'df1381aa-701f-40f3-9a64-7b3b4049ae0c', null, 8),
      -- COLLEGE_D1 · 2024 · Colonial D-I College Women's Conferences (Colonial-D-I-Womens-Conferences-2024) · ended 2024-04-21
      ('a1b50994-fea4-4620-bdb1-2c26c7c813aa', 'de9c1b32-87d6-47b7-bdb0-0412c614f54d', null, 1),
      ('a1b50994-fea4-4620-bdb1-2c26c7c813aa', '447cd329-fccb-4da1-a637-2d080f471165', null, 2),
      ('a1b50994-fea4-4620-bdb1-2c26c7c813aa', 'da0d85fa-96fc-4198-9100-2f70e0fee6fc', null, 3),
      ('a1b50994-fea4-4620-bdb1-2c26c7c813aa', '23959d46-9691-4084-bfbf-e41c7b597c51', null, 4),
      ('a1b50994-fea4-4620-bdb1-2c26c7c813aa', 'e7c15d19-5c34-4c8a-995e-567c5f5af7fd', null, 5),
      ('a1b50994-fea4-4620-bdb1-2c26c7c813aa', 'f30f7605-0e2d-40eb-9ba4-50af9f70688b', null, 6),
      -- COLLEGE_D1 · 2024 · Metro Boston D-I College Women's Conferences (Metro-Boston-D-I-Womens-Conferences-2024) · ended 2024-04-21
      ('a0b99e66-c86f-4e2f-863c-0eb4562eec26', 'ea51ff91-5c39-474f-adfc-815c638a09ab', null, 1),
      ('a0b99e66-c86f-4e2f-863c-0eb4562eec26', '7c5b6f3e-4f7b-4bd6-b09c-85e8bbb808b2', null, 2),
      ('a0b99e66-c86f-4e2f-863c-0eb4562eec26', 'ff3c996b-dcf0-41ef-9f29-20bdafd576c3', null, 3),
      ('a0b99e66-c86f-4e2f-863c-0eb4562eec26', 'd85ac00e-e668-4aff-82a8-f816a8187552', null, 4),
      ('a0b99e66-c86f-4e2f-863c-0eb4562eec26', '017002fd-452a-471c-8267-615467fe9580', null, 5),
      ('a0b99e66-c86f-4e2f-863c-0eb4562eec26', '80a8fe97-3737-4486-a3cf-9ab3a49d0036', null, 6),
      -- COLLEGE_D1 · 2024 · New England Dev College Women's Conferences (New-England-Dev-Womens-Conferences-2024) · ended 2024-04-21
      ('4727dafd-f897-4a87-8398-fbfb9a0706a6', '75d9fe92-f720-4a57-a181-3ba766a87fa0', null, 1),
      ('4727dafd-f897-4a87-8398-fbfb9a0706a6', '0f564dfa-c65d-4fd3-ad23-bf6cfe960a64', null, 2),
      ('4727dafd-f897-4a87-8398-fbfb9a0706a6', '042bc12c-6a37-49b4-a16a-99a5558b773a', null, 3),
      -- COLLEGE_D1 · 2024 · Ohio Valley Dev College Men's Conferences (Ohio-Valley-Dev-Mens-Conferences-2024) · ended 2024-04-21
      ('74f810de-a941-4a91-bdaa-f4a02ec73444', '507f6890-8c5a-43c7-924f-9b3808d908f4', null, 1),
      ('74f810de-a941-4a91-bdaa-f4a02ec73444', 'ee24c8a7-8f4a-4816-997e-83a0b9093ce7', null, 2),
      ('74f810de-a941-4a91-bdaa-f4a02ec73444', '055c3afe-35cc-4715-b9ba-f48806d89106', null, 3),
      ('74f810de-a941-4a91-bdaa-f4a02ec73444', '7f62a3d4-cdac-43b2-89ed-b6c63388fa70', null, 4),
      -- COLLEGE_D1 · 2024 · Southern Atlantic Coast Dev College Men's Conferences (Southern-Atlantic-Coast-Dev-Mens-Conferences-2024) · ended 2024-04-21
      ('dfead39d-e944-4cf5-9616-793c6fb91862', '21fde05c-3a6f-49de-84da-38134f6de2c4', null, 1),
      ('dfead39d-e944-4cf5-9616-793c6fb91862', 'b95ff713-d98c-4e23-a000-16a2bc33ad6f', null, 2),
      ('dfead39d-e944-4cf5-9616-793c6fb91862', '22dd007d-7d41-42a9-a21d-17b3fb2e3ed4', null, 3),
      ('dfead39d-e944-4cf5-9616-793c6fb91862', '263eabe4-8dea-4468-9f00-ce032f4ca423', null, 4),
      ('dfead39d-e944-4cf5-9616-793c6fb91862', 'cec8f0ac-9c0a-4fc4-ac03-3fcf40ff7b66', null, 5),
      ('dfead39d-e944-4cf5-9616-793c6fb91862', 'cf7750ca-e2b1-4251-b7f2-dca1db3afb7a', null, 6),
      ('dfead39d-e944-4cf5-9616-793c6fb91862', '24bc3fda-52af-453a-8f0c-673449c2db76', null, 7),
      ('dfead39d-e944-4cf5-9616-793c6fb91862', 'f836e78c-fd68-4549-85ec-cde5a40bc52b', null, 8),
      -- COLLEGE_D1 · 2024 · Virginia D-I College Men's Conferences (Virginia-D-I-Mens-Conferences-2024) · ended 2024-04-21
      ('bf846541-2dc9-4992-9448-6de25e2f0be9', 'dbb84281-9b2d-42c2-9e1b-8e287b64bcbd', null, 1),
      ('bf846541-2dc9-4992-9448-6de25e2f0be9', '822a71ec-9826-48ec-bafe-4732d7ddba43', null, 2),
      -- COLLEGE_D1 · 2024 · West Penn D-I College Men's Conferences (West-Penn-D-I-Mens-Conferences-2024) · ended 2024-04-21
      ('5aa4346d-6c32-4c9a-b588-5d124fb6058a', '7ed0b8f2-6ac7-4d45-98ba-66e31e6f3b16', null, 1),
      ('5aa4346d-6c32-4c9a-b588-5d124fb6058a', '44621e10-6f67-4faa-a8e4-e3c6b5966d30', null, 2),
      ('5aa4346d-6c32-4c9a-b588-5d124fb6058a', 'c3f2b83e-cb29-430b-b781-d7fc59a0f288', null, 3),
      -- COLLEGE_D1 · 2024 · Western NY D-I College Men's Conferences (Western-NY-D-I-Mens-Conferences-2024) · ended 2024-04-21
      ('544b425b-2c9b-443c-a818-0f68bb199358', '4bbc90cc-78a7-4a6e-8c80-85f18b0d378b', null, 1),
      ('544b425b-2c9b-443c-a818-0f68bb199358', '33584581-d8db-4468-8c01-7606b3e60b43', null, 2),
      -- COLLEGE_D1 · 2024 · North Central D-I College Men's Regionals (North-Central-D-I-College-Mens-Regionals-2024) · ended 2024-04-28
      ('ee0d9725-665a-45c4-b69c-dd4b18add967', '5582254d-b7fd-414f-ab3a-909da8aace38', 3, 4), -- correct
      -- COLLEGE_D1 · 2024 · Southeast D-I College Men's Regionals (Southeast-D-I-College-Mens-Regionals-2024) · ended 2024-04-28
      ('09e2dbde-8c16-4cbf-8e28-b942be455f0b', '17fe023f-ed52-4dc6-bee8-f80b0599ca51', null, 4),
      ('09e2dbde-8c16-4cbf-8e28-b942be455f0b', '04553841-92b5-4e41-80f8-a9fc56098dba', 3, null), -- clear-unsupported
      -- COLLEGE_D1 · 2024 · Southwest D-I College Men's Regionals (Southwest-D-I-College-Mens-Regionals-2024) · ended 2024-04-28
      ('9013bbf9-7a76-4b54-868a-51e4284c34ef', '985dbdb0-f7c8-4064-8134-5c10bac9967a', 3, 2), -- correct
      ('9013bbf9-7a76-4b54-868a-51e4284c34ef', '32cd2388-d433-4896-a77a-8a84c8ca2f03', 2, 3), -- correct
      ('9013bbf9-7a76-4b54-868a-51e4284c34ef', 'fb909246-a6ae-45c7-9e97-7f5051fa7f9e', 3, 4), -- correct
      ('9013bbf9-7a76-4b54-868a-51e4284c34ef', '45e70884-7576-4a84-bd95-690cad6d40bc', null, 13),
      ('9013bbf9-7a76-4b54-868a-51e4284c34ef', '9ffce2c0-03ed-4a09-ac29-84f55a017328', null, 14),
      -- COLLEGE_D1 · 2024 · Southwest D-I College Women's Regionals (Southwest-D-I-College-Womens-Regionals-2024) · ended 2024-04-28
      ('b764e394-b394-42ed-a70c-c18fa6ad269e', '3da94b55-e01f-4e99-84e3-89a42b02542b', 3, 4), -- correct
      ('b764e394-b394-42ed-a70c-c18fa6ad269e', '5f238033-8e7e-4304-a208-284758d16a3d', null, 5),
      ('b764e394-b394-42ed-a70c-c18fa6ad269e', '9cfc6ecb-36ec-444e-bd7c-b19d39f10370', null, 6),
      ('b764e394-b394-42ed-a70c-c18fa6ad269e', '72cc3958-f3b4-4a82-bf53-9e3ec1619519', null, 7),
      ('b764e394-b394-42ed-a70c-c18fa6ad269e', 'aac56658-76c5-4666-a0d0-9ad81c541972', null, 8),
      ('b764e394-b394-42ed-a70c-c18fa6ad269e', '90ee4dd4-2eba-4711-9c97-710a144bf629', null, 9),
      ('b764e394-b394-42ed-a70c-c18fa6ad269e', 'b42bec7c-e82e-47be-8eec-243f4b8842c7', null, 10),
      -- COLLEGE_D1 · 2024 · Atlantic Coast D-I College Men's Regionals (Atlantic-Coast-D-I-College-Mens-Regionals-2024) · ended 2024-05-05
      ('d8533f4b-ce2b-4936-916b-f73c6bfe8480', '4d360b12-d2ce-48f5-83b0-fd5baf30d1ff', 3, 4), -- correct
      -- COLLEGE_D1 · 2024 · Atlantic Coast Dev College Men's Regionals (Atlantic-Coast-Dev-College-Mens-Regionals-2024) · ended 2024-05-05
      ('c98146c4-6ca1-4308-a9ab-3bc519624e9d', '21fde05c-3a6f-49de-84da-38134f6de2c4', null, 1),
      ('c98146c4-6ca1-4308-a9ab-3bc519624e9d', 'cec8f0ac-9c0a-4fc4-ac03-3fcf40ff7b66', null, 2),
      ('c98146c4-6ca1-4308-a9ab-3bc519624e9d', 'cf7750ca-e2b1-4251-b7f2-dca1db3afb7a', null, 3),
      ('c98146c4-6ca1-4308-a9ab-3bc519624e9d', 'b15049c2-9628-4aec-9601-04c33894ac6d', null, 4),
      ('c98146c4-6ca1-4308-a9ab-3bc519624e9d', '22dd007d-7d41-42a9-a21d-17b3fb2e3ed4', null, 5),
      ('c98146c4-6ca1-4308-a9ab-3bc519624e9d', 'a0e1b1d7-bee8-46e8-9eee-7fc2133a204a', null, 6),
      -- COLLEGE_D1 · 2024 · New England D-I College Women's Regionals (New-England-D-I-College-Womens-Regionals-2024) · ended 2024-05-05
      ('6628e16a-37c9-438a-8bbf-f9d9c1ec7304', 'ea51ff91-5c39-474f-adfc-815c638a09ab', 3, 4), -- correct
      -- COLLEGE_D1 · 2024 · Northwest D-I College Women's Regionals (Northwest-D-I-College-Womens-Regionals-2024) · ended 2024-05-05
      ('4af7f1f4-226a-4abd-9ccb-14360b0026ab', 'cab52019-2545-4a56-9007-050ce490ec90', 3, 4), -- correct
      -- COLLEGE_D1 · 2024 · Ohio Valley D-I College Men's Regionals (Ohio-Valley-D-I-College-Mens-Regionals-2024) · ended 2024-05-05
      ('3da559e5-7392-459f-b56b-8b9dc07d9ac5', 'bb4a09cf-a3b0-4633-a233-7cc5932e34e7', 3, 4), -- correct
      -- COLLEGE_D1 · 2025 · Desert D-I Women's Conferences (Desert-D-I-Womens-Conferences-2025) · ended 2025-04-12
      ('d3c6cf67-22a7-450a-95ae-1b787e9cba36', '8dac88a4-bb94-46fd-a9c2-7f885c208d2c', null, 1),
      ('d3c6cf67-22a7-450a-95ae-1b787e9cba36', '47829a06-c592-4e28-9f9b-78ea328d6cfc', null, 2),
      ('d3c6cf67-22a7-450a-95ae-1b787e9cba36', 'fd2fd52c-cf56-4a86-82d1-e1b11b482ab6', null, 3),
      ('d3c6cf67-22a7-450a-95ae-1b787e9cba36', 'b2d4e207-3986-403e-9a10-62be734cfe53', null, 4),
      -- COLLEGE_D1 · 2025 · Greater New England D-I Women's Conferences (Greater-New-England-D-I-Womens-Conferences-2025) · ended 2025-04-12
      ('85ed1b62-e1fd-41ec-b62f-fb9c400fdb2f', '12eb8f4d-9e32-4da6-b134-6bcdc7b37d00', null, 1),
      ('85ed1b62-e1fd-41ec-b62f-fb9c400fdb2f', 'b74616c4-3537-4374-a3ce-55b4911fcded', null, 2),
      ('85ed1b62-e1fd-41ec-b62f-fb9c400fdb2f', '8c9e3dfe-4d6c-4bdc-b0b9-a1455ff6e0d1', null, 3),
      ('85ed1b62-e1fd-41ec-b62f-fb9c400fdb2f', '7580506a-51a7-49f2-9289-99af70d4df53', null, 4),
      ('85ed1b62-e1fd-41ec-b62f-fb9c400fdb2f', '34a49bfa-3248-4fc6-872a-dc08cb0fe922', null, 5),
      ('85ed1b62-e1fd-41ec-b62f-fb9c400fdb2f', '692d63e1-307c-4848-8725-8822b98f5ec9', null, 6),
      -- COLLEGE_D1 · 2025 · Western North Central D-I Women's Conferences (Western-North-Central-D-I-Womens-Conferences-2025) · ended 2025-04-12
      ('8f9fa4a0-ba2a-4383-8c68-c6537e31ae49', '4a95e8b9-f201-4d31-a71d-2af743776966', null, 2),
      ('8f9fa4a0-ba2a-4383-8c68-c6537e31ae49', '1fa7bf05-ef78-4c5f-a256-36f86157d0c3', null, 3),
      ('8f9fa4a0-ba2a-4383-8c68-c6537e31ae49', 'b2a4a8b1-3435-4ee8-b14c-293b4c75bd2f', null, 4),
      ('8f9fa4a0-ba2a-4383-8c68-c6537e31ae49', '2d78460f-9e20-4dfc-8231-b4db80bbb2d1', null, 5),
      ('8f9fa4a0-ba2a-4383-8c68-c6537e31ae49', 'c82c6f25-7088-4f90-83cb-8b250e2dafe5', null, 6),
      -- COLLEGE_D1 · 2025 · Atlantic Coast Dev Women's Conferences (Atlantic-Coast-Dev-Womens-Conferences-2025) · ended 2025-04-13
      ('624a5acc-f000-4d1c-8cdd-b1740f4fc7da', 'f4755b62-d1cf-43e0-9837-e80fcdd7120f', null, 1),
      ('624a5acc-f000-4d1c-8cdd-b1740f4fc7da', 'eee66c20-7f7d-40bd-a26b-a198d10ba5a1', null, 2),
      ('624a5acc-f000-4d1c-8cdd-b1740f4fc7da', '200dcabd-d926-4a53-bbd3-29a6552d3f85', null, 3),
      ('624a5acc-f000-4d1c-8cdd-b1740f4fc7da', '8cbd9d06-d421-4c33-90ac-4f0c7e2afc5d', null, 4),
      ('624a5acc-f000-4d1c-8cdd-b1740f4fc7da', '669904f5-fec3-4f32-89f5-bf4483a47882', null, 5),
      ('624a5acc-f000-4d1c-8cdd-b1740f4fc7da', '0f295a94-c191-47d3-b02b-ef719f3b9509', null, 6),
      -- COLLEGE_D1 · 2025 · Carolina D-I Men's Conferences (Carolina-D-I-Mens-Conferences-2025) · ended 2025-04-13
      ('aec3f991-1a6e-4b9a-bde2-3460930b9b9b', 'd05b9d0e-263a-42c0-bc15-a6a51337c897', null, 1),
      ('aec3f991-1a6e-4b9a-bde2-3460930b9b9b', '9522b44d-3dbe-46d0-a9c0-86b75f52bcc2', null, 2),
      ('aec3f991-1a6e-4b9a-bde2-3460930b9b9b', 'e3f6550a-bdd8-4296-886e-e18bf98e5f58', null, 3),
      ('aec3f991-1a6e-4b9a-bde2-3460930b9b9b', '24a85073-7191-4c68-b0aa-87b0bbeb62f4', null, 4),
      ('aec3f991-1a6e-4b9a-bde2-3460930b9b9b', '1b02b107-7551-4d64-92c7-ad887f467246', null, 5),
      ('aec3f991-1a6e-4b9a-bde2-3460930b9b9b', '9534e022-9724-4156-8602-91161ea42e3e', null, 6),
      ('aec3f991-1a6e-4b9a-bde2-3460930b9b9b', '1d7ea7cb-a9ee-46d9-9f77-2a39ff9bf149', null, 7),
      ('aec3f991-1a6e-4b9a-bde2-3460930b9b9b', '092081cb-ecaa-4b58-85c2-8f7a771a42fe', null, 8),
      ('aec3f991-1a6e-4b9a-bde2-3460930b9b9b', '6100058e-3e87-409b-b2f5-92351698e67d', null, 9),
      ('aec3f991-1a6e-4b9a-bde2-3460930b9b9b', 'affebc57-7144-4b91-ae25-2680a5cb3f5a', null, 10),
      ('aec3f991-1a6e-4b9a-bde2-3460930b9b9b', '9558c53f-7239-47c3-bb62-91eefb06e91f', null, 11),
      -- COLLEGE_D1 · 2025 · Carolina D-I Women's Conferences (Carolina-D-I-Womens-Conferences-2025) · ended 2025-04-13
      ('8aff3aa7-9b5e-481c-bf9a-efc7352673f9', '31bbd8d1-5005-4fed-8461-419352505d5d', null, 1),
      ('8aff3aa7-9b5e-481c-bf9a-efc7352673f9', '56eeb629-7d97-41f4-b35c-b9c126e7331f', null, 2),
      ('8aff3aa7-9b5e-481c-bf9a-efc7352673f9', 'a4e871d1-5e75-4d39-885d-43a3a33348ea', null, 3),
      ('8aff3aa7-9b5e-481c-bf9a-efc7352673f9', '94adbd8a-8e8d-4405-8ff2-60944050a315', null, 4),
      ('8aff3aa7-9b5e-481c-bf9a-efc7352673f9', '830c2de0-3cc3-4c76-874c-b10982a71cba', null, 5),
      ('8aff3aa7-9b5e-481c-bf9a-efc7352673f9', 'b713e835-20dd-4f77-9265-50033771bb80', null, 6),
      ('8aff3aa7-9b5e-481c-bf9a-efc7352673f9', '8d49f18e-f1d7-4f75-a2b3-76a64a0cbf7c', null, 7),
      ('8aff3aa7-9b5e-481c-bf9a-efc7352673f9', '49d34b84-2d61-4c72-888e-aba86d82e8a7', null, 8),
      ('8aff3aa7-9b5e-481c-bf9a-efc7352673f9', 'a079c05e-cecb-4be6-bc0f-e9def5e0ac18', null, 9),
      ('8aff3aa7-9b5e-481c-bf9a-efc7352673f9', '133a4b63-babc-4bc2-a5d4-e2ad3a2a3ceb', null, 10),
      -- COLLEGE_D1 · 2025 · Cascadia D-I Women's Conferences (Cascadia-D-I-Womens-Conferences-2025) · ended 2025-04-13
      ('2a6d264a-d0a9-4b08-ac37-95edd2de35a5', '5d1e33f2-a82e-44dd-a6eb-691ffbe78a50', null, 3),
      ('2a6d264a-d0a9-4b08-ac37-95edd2de35a5', '8602561a-a791-4d0e-8957-32f334372791', null, 4),
      ('2a6d264a-d0a9-4b08-ac37-95edd2de35a5', '2f0ce7e7-b520-492c-a93c-7f8d3e3ceccf', null, 5),
      ('2a6d264a-d0a9-4b08-ac37-95edd2de35a5', '451e26ab-0834-437a-9c17-a9c2ec92edad', null, 6),
      -- COLLEGE_D1 · 2025 · Colonial D-I Men's Conferences (Colonial-D-I-Mens-Conferences-2025) · ended 2025-04-13
      ('0550356b-0994-4cb0-b7c1-f49b70762450', 'b66dc208-e4c6-4ec5-bbba-6418f28a4ec1', null, 1),
      ('0550356b-0994-4cb0-b7c1-f49b70762450', 'daf31316-2bde-4ff0-88aa-f4b827928c8b', null, 2),
      ('0550356b-0994-4cb0-b7c1-f49b70762450', '2f1d4833-82e3-46dc-9192-4c3abe435612', null, 3),
      ('0550356b-0994-4cb0-b7c1-f49b70762450', '4ff7715e-d5c4-441e-a2c0-889d6cbef3ce', null, 4),
      ('0550356b-0994-4cb0-b7c1-f49b70762450', '1b4b8694-683c-4163-b001-8ec40efd5292', null, 5),
      ('0550356b-0994-4cb0-b7c1-f49b70762450', 'dc49f6ee-3683-43ea-84ef-577985c3375b', null, 6),
      ('0550356b-0994-4cb0-b7c1-f49b70762450', '7ba463e5-fc15-4f15-af00-d8effbae2636', null, 7),
      ('0550356b-0994-4cb0-b7c1-f49b70762450', 'a9f74c18-7a8a-4e3b-8b1e-3cad0e0b7704', null, 8),
      -- COLLEGE_D1 · 2025 · Colonial D-I Women's Conferences (Colonial-D-I-Womens-Conferences-2025) · ended 2025-04-13
      ('94a73bca-30d7-42e1-bb40-7a0df62c8a9d', 'ddb0dffb-5174-43b0-be68-069d78c5fb22', null, 1),
      ('94a73bca-30d7-42e1-bb40-7a0df62c8a9d', 'de566040-25d4-4071-b418-713dc80aee55', null, 2),
      ('94a73bca-30d7-42e1-bb40-7a0df62c8a9d', '20823705-abc8-4d1c-b65a-6f2585092329', null, 3),
      ('94a73bca-30d7-42e1-bb40-7a0df62c8a9d', '0ccaf86b-ec6f-476b-9545-2591be288a79', null, 4),
      ('94a73bca-30d7-42e1-bb40-7a0df62c8a9d', 'e3bbeb57-a936-467d-8d90-4f7720b29327', null, 5),
      ('94a73bca-30d7-42e1-bb40-7a0df62c8a9d', 'cb04c995-83ac-424b-8788-191845a5a8d9', null, 6),
      ('94a73bca-30d7-42e1-bb40-7a0df62c8a9d', '9798f4c4-facc-4194-8e7a-4b0a561a5353', null, 7),
      -- COLLEGE_D1 · 2025 · Colonial Dev Men's Conferences (Colonial-Dev-Mens-Conferences-2025) · ended 2025-04-13
      ('2c87fa8d-a68a-4e3a-8ca0-cceed9ab2df4', '31a0986b-552c-4a1b-88d1-69f55b37a2a5', null, 2),
      ('2c87fa8d-a68a-4e3a-8ca0-cceed9ab2df4', 'ac3f43ce-ea7b-4afd-adfe-353766080bd9', null, 3),
      ('2c87fa8d-a68a-4e3a-8ca0-cceed9ab2df4', '6531b18d-8cfc-466f-a977-f49c1e96ccef', null, 4),
      ('2c87fa8d-a68a-4e3a-8ca0-cceed9ab2df4', 'a3e47f71-e470-4e9b-8a38-204d2e450eff', null, 5),
      -- COLLEGE_D1 · 2025 · Desert D-I Men's Conferences (Desert-D-I-Mens-Conferences-2025) · ended 2025-04-13
      ('6c7e957e-647b-4e3e-b89c-7e31aecdd760', '0de84316-2d06-4329-8f8d-a8f5570a52e4', null, 1),
      ('6c7e957e-647b-4e3e-b89c-7e31aecdd760', '388ccd0e-d55e-4f36-875a-4a42b1e4873e', null, 2),
      ('6c7e957e-647b-4e3e-b89c-7e31aecdd760', 'ca876b17-2036-438a-9a17-c4d6cc8ea933', null, 3),
      ('6c7e957e-647b-4e3e-b89c-7e31aecdd760', '420729eb-2fdf-4dee-8da9-abe84178e010', null, 4),
      -- COLLEGE_D1 · 2025 · Eastern Great Lakes D-I Women's Conferences (Eastern-Great-Lakes-D-I-Womens-Conferences-2025) · ended 2025-04-13
      ('b47cdfaf-783d-4917-a2a6-85d925992e55', '9556c30f-3d20-49ff-a2ed-30e90fcc3d11', null, 1),
      ('b47cdfaf-783d-4917-a2a6-85d925992e55', '8b961d89-c44d-49af-95a4-441cfe4cc8b7', null, 2),
      ('b47cdfaf-783d-4917-a2a6-85d925992e55', '1ef21836-b4fc-4280-a0c3-7e7e5b0fd2c1', null, 3),
      ('b47cdfaf-783d-4917-a2a6-85d925992e55', '89be4c70-9863-40d8-8e84-2eef60f2f1db', null, 3),
      -- COLLEGE_D1 · 2025 · Eastern Metro East D-I Women's Conferences (Eastern-Metro-East-D-I-Womens-Conferences-2025) · ended 2025-04-13
      ('3520f137-966e-4a82-afda-735b47c2135e', 'ebe2b703-f7a8-41ea-b34f-2f4ed89c08d6', null, 1),
      ('3520f137-966e-4a82-afda-735b47c2135e', '7be9459f-46d4-421c-94a6-75e63cb3283b', null, 2),
      ('3520f137-966e-4a82-afda-735b47c2135e', '77b9bb48-1927-419f-81bf-25e8ebddd5b3', null, 3),
      ('3520f137-966e-4a82-afda-735b47c2135e', '985d0e72-b511-4972-8cd5-7db8bda624f1', null, 4),
      ('3520f137-966e-4a82-afda-735b47c2135e', '11531d5c-e209-45ca-8bf3-a6db09d67758', null, 5),
      ('3520f137-966e-4a82-afda-735b47c2135e', '3e731bc9-abc6-4ad9-98e8-a1f69f18c612', null, 6),
      ('3520f137-966e-4a82-afda-735b47c2135e', '53b243a5-fc33-4fc0-b312-83207235b43e', null, 7),
      ('3520f137-966e-4a82-afda-735b47c2135e', 'd8dfa7b8-0dc6-4f21-b4b5-8cc8edcd83f6', null, 8),
      -- COLLEGE_D1 · 2025 · Florida D-I Men's Conferences (Florida-D-I-Mens-Conferences-2025) · ended 2025-04-13
      ('bc2f1496-c565-4d39-b7d7-49fcec30cfa5', 'f32e1f81-5564-4f87-9d40-1f58a84923d5', null, 1),
      ('bc2f1496-c565-4d39-b7d7-49fcec30cfa5', '5c3d5682-8ba9-4463-9991-93dcbfe070f0', null, 2),
      -- COLLEGE_D1 · 2025 · Florida D-I Women's Conferences (Florida-D-I-Womens-Conferences-2025) · ended 2025-04-13
      ('c467131a-fae1-43a1-847d-ecd359f9005e', 'a8f62b8b-77c6-4cdd-b647-932e8fbde8a5', null, 1),
      ('c467131a-fae1-43a1-847d-ecd359f9005e', 'b5fdaba0-9909-486d-9b50-c2488827ce44', null, 2),
      -- COLLEGE_D1 · 2025 · Great Lakes Dev Men's Conferences (Great-Lakes-Dev-Mens-Conferences-2025) · ended 2025-04-13
      ('cb77a750-90d8-4d82-9cd5-979dddf005df', '66c225da-f8f8-4463-ad7d-4771d26b1455', null, 1),
      ('cb77a750-90d8-4d82-9cd5-979dddf005df', 'fad80d34-79d7-4e3a-8a5c-09ce07ff45de', null, 2),
      ('cb77a750-90d8-4d82-9cd5-979dddf005df', 'c3960051-a1c8-4d8d-898f-cc3419e7c335', null, 3),
      ('cb77a750-90d8-4d82-9cd5-979dddf005df', '579bfe4c-874e-4e30-99a0-d0284e764de3', null, 5),
      ('cb77a750-90d8-4d82-9cd5-979dddf005df', '177e806a-9be8-4784-8c97-56dc2443d31e', null, 6),
      -- COLLEGE_D1 · 2025 · Greater New England D-I Men's Conferences (Greater-New-England-D-I-Mens-Conferences-2025) · ended 2025-04-13
      ('c833d667-f122-49a0-a1bc-518819f34589', 'bf8b58ab-1aa0-4af0-b778-678bbd6dfb1c', null, 1),
      ('c833d667-f122-49a0-a1bc-518819f34589', '54580784-7b00-45fb-a14f-bba1204798c0', null, 2),
      -- COLLEGE_D1 · 2025 · Gulf Coast D-I Men's Conferences (Gulf-Coast-D-I-Mens-Conferences-2025) · ended 2025-04-13
      ('6d9cde71-6683-4494-8add-ea7e9662cb10', '0b7c23c7-6200-4b1e-b383-71ea1b66b484', null, 1),
      ('6d9cde71-6683-4494-8add-ea7e9662cb10', '43cf25b4-0129-43b8-b01b-86c95a28e5bd', null, 2),
      ('6d9cde71-6683-4494-8add-ea7e9662cb10', '98af0252-2cfc-4b7e-ae5e-9476f6216e25', null, 3),
      ('6d9cde71-6683-4494-8add-ea7e9662cb10', 'b5aca85c-e9af-4c21-828a-25130519acaf', null, 4),
      -- COLLEGE_D1 · 2025 · Gulf Coast D-I Women's Conferences (Gulf-Coast-D-I-Womens-Conferences-2025) · ended 2025-04-13
      ('e870a51f-cb3f-43b2-bd8d-f78a7518241a', 'f0524940-1d74-49bb-8fcf-6c4b93e2de39', null, 1),
      ('e870a51f-cb3f-43b2-bd8d-f78a7518241a', 'ef8a3bd0-0c71-4f89-ac1c-4b05c5cd857c', null, 2),
      ('e870a51f-cb3f-43b2-bd8d-f78a7518241a', '3e9e0124-0ef5-4f56-9cfa-2702937eb87e', null, 3),
      -- COLLEGE_D1 · 2025 · Hudson Valley D-I Men's Conferences (Hudson-Valley-D-I-Mens-Conferences-2025) · ended 2025-04-13
      ('85e494f2-045b-4466-b6d0-721d0ff99376', '432e5b1f-051b-4cb8-b2f0-1fcde458c354', null, 2),
      ('85e494f2-045b-4466-b6d0-721d0ff99376', '976fe35e-6402-4bc9-a362-d74b104538ed', null, 3),
      ('85e494f2-045b-4466-b6d0-721d0ff99376', '1dd0ea20-9d32-450f-8330-538f90f57711', null, 4),
      ('85e494f2-045b-4466-b6d0-721d0ff99376', 'b23e9a5f-4903-4f4a-a090-666a260c44bc', null, 5),
      -- COLLEGE_D1 · 2025 · Illinois D-I Men's Conferences (Illinois-D-I-Mens-Conferences-2025) · ended 2025-04-13
      ('f66e1c5a-0673-4d59-abc3-fdca96a67ee0', '6464e39d-8021-4870-b361-19e8473363a2', null, 1),
      ('f66e1c5a-0673-4d59-abc3-fdca96a67ee0', '3a2d288d-1152-47f9-889f-62c672390664', null, 2),
      ('f66e1c5a-0673-4d59-abc3-fdca96a67ee0', 'c2916c4d-d1cb-4b74-91d4-7852f96c6d52', null, 3),
      ('f66e1c5a-0673-4d59-abc3-fdca96a67ee0', '8d276864-f165-427b-acf9-15cf4eabb04f', null, 4),
      ('f66e1c5a-0673-4d59-abc3-fdca96a67ee0', '2f959264-a527-4ddb-8cff-7a57e3fa25d7', null, 5),
      ('f66e1c5a-0673-4d59-abc3-fdca96a67ee0', 'dd76492b-4a6c-4186-a908-9f87ccda5d11', null, 6),
      ('f66e1c5a-0673-4d59-abc3-fdca96a67ee0', 'b35c2aa2-6cd3-4992-86ed-29aaf0423748', null, 7),
      ('f66e1c5a-0673-4d59-abc3-fdca96a67ee0', 'f85c91f1-588c-436f-9a43-b99ca327feab', null, 8),
      -- COLLEGE_D1 · 2025 · Lake Superior D-I Men's Conferences (Lake-Superior-D-I-Mens-Conferences-2025) · ended 2025-04-13
      ('deb57cec-b891-4613-bcc0-5e9d3a42d457', 'f703514d-ce8a-402d-8fba-92c08f727b3a', null, 1),
      ('deb57cec-b891-4613-bcc0-5e9d3a42d457', '2cf966bd-05d6-4e0e-884f-4a85d02ea0af', null, 2),
      ('deb57cec-b891-4613-bcc0-5e9d3a42d457', 'a489854e-ba0e-43da-a2ae-8013162fe67f', null, 3),
      ('deb57cec-b891-4613-bcc0-5e9d3a42d457', '9b69630c-bb79-4d1e-8076-f1cba8676760', null, 4),
      ('deb57cec-b891-4613-bcc0-5e9d3a42d457', '4009279c-0984-476f-b8a9-47fcf1fffac2', null, 5),
      ('deb57cec-b891-4613-bcc0-5e9d3a42d457', '4a8e5128-eff2-45fb-b344-1f9f4a72d96e', null, 6),
      ('deb57cec-b891-4613-bcc0-5e9d3a42d457', 'd9a0e9e8-1cd3-43b1-8f60-d27f760875c1', null, 7),
      ('deb57cec-b891-4613-bcc0-5e9d3a42d457', '19fbd426-11fc-4455-81ed-7efbec7d7265', null, 8),
      -- COLLEGE_D1 · 2025 · Lake Superior D-I Women's Conferences (Lake-Superior-D-I-Womens-Conferences-2025) · ended 2025-04-13
      ('4f607e69-e29a-4a4b-899e-35894b80444b', '0f045a2e-8a4c-4ef7-a266-0523338add43', null, 1),
      ('4f607e69-e29a-4a4b-899e-35894b80444b', '2152284c-9c91-404d-b74d-954a49de2edc', null, 2),
      -- COLLEGE_D1 · 2025 · Metro Boston D-I Men's Conferences (Metro-Boston-D-I-Mens-Conferences-2025) · ended 2025-04-13
      ('e178dd62-8e32-45c0-8d93-ac0107fe40c8', '7aeea7b3-d62b-4e0c-8d85-2f5da2b8b0e4', null, 1),
      ('e178dd62-8e32-45c0-8d93-ac0107fe40c8', '947b072d-31ea-47bc-ab34-59457bd9055a', null, 2),
      -- COLLEGE_D1 · 2025 · Metro Boston D-I Women's Conferences (Metro-Boston-D-I-Womens-Conferences-2025) · ended 2025-04-13
      ('71e717cd-a0f4-4de8-adda-fa4d7e0a043b', 'e434ca3e-6f3e-4a60-a4c7-6352296d0dc4', null, 1),
      ('71e717cd-a0f4-4de8-adda-fa4d7e0a043b', '060a1151-8355-4470-9d99-5c5c365e7edc', null, 2),
      ('71e717cd-a0f4-4de8-adda-fa4d7e0a043b', 'c4d7ca87-013e-4c37-926d-085865aaea34', null, 3),
      ('71e717cd-a0f4-4de8-adda-fa4d7e0a043b', 'b8ac3509-9540-44e5-9f6d-e239cf1df879', null, 4),
      ('71e717cd-a0f4-4de8-adda-fa4d7e0a043b', '720db2b0-f24a-4f3e-87cb-84c15f870493', null, 5),
      ('71e717cd-a0f4-4de8-adda-fa4d7e0a043b', '833ca56b-f234-49a8-a708-0c95376ca0c9', null, 6),
      -- COLLEGE_D1 · 2025 · Michigan D-I Men's Conferences (Michigan-D-I-Mens-Conferences-2025) · ended 2025-04-13
      ('ad113ff0-eabe-42ac-a26c-2b4ea2d26ad4', '6e0c846f-93da-45c9-9151-1c1abfd90d2d', null, 2),
      ('ad113ff0-eabe-42ac-a26c-2b4ea2d26ad4', 'cae63053-cead-44df-988e-01e5428e1a88', null, 3),
      ('ad113ff0-eabe-42ac-a26c-2b4ea2d26ad4', 'fb0ad3e7-bc02-4098-bf8e-8bd49dc078a5', null, 4),
      ('ad113ff0-eabe-42ac-a26c-2b4ea2d26ad4', '639b6ff4-3fdf-4f25-a89b-29f4c41cb7a1', null, 5),
      -- COLLEGE_D1 · 2025 · New England Dev Men's Conferences (New-England-Dev-Mens-Conferences-2025) · ended 2025-04-13
      ('092ae39c-0c3e-40fc-a42f-f67c3d7b8f8e', 'a801db93-9295-4193-8f59-5af608b3512d', null, 1),
      ('092ae39c-0c3e-40fc-a42f-f67c3d7b8f8e', 'a420634f-5375-4e01-b72d-cbb67fa0197d', null, 2),
      ('092ae39c-0c3e-40fc-a42f-f67c3d7b8f8e', '4621c2cc-1345-464f-8432-e0a3ea43a540', null, 3),
      ('092ae39c-0c3e-40fc-a42f-f67c3d7b8f8e', '6cf61eb3-dff6-40fb-b004-a00e2b169849', null, 4),
      ('092ae39c-0c3e-40fc-a42f-f67c3d7b8f8e', 'c42cb89f-360f-4603-b3a2-596a34b2544c', null, 5),
      ('092ae39c-0c3e-40fc-a42f-f67c3d7b8f8e', '1882bf21-6ee8-4f41-a836-fb3317d679dd', null, 6),
      ('092ae39c-0c3e-40fc-a42f-f67c3d7b8f8e', '48b1a06d-0811-406a-9ff6-99366b1596fa', null, 7),
      ('092ae39c-0c3e-40fc-a42f-f67c3d7b8f8e', '4159c69e-bf65-439d-a6bc-25517e2729f1', null, 8),
      -- COLLEGE_D1 · 2025 · New England Dev Women's Conferences (New-England-Dev-Womens-Conferences-2025) · ended 2025-04-13
      ('b4a77517-ef4d-47a3-a60b-85a368d687fa', 'ca9e3eef-c0cf-4d01-bf1b-04fae99b18bb', null, 1),
      ('b4a77517-ef4d-47a3-a60b-85a368d687fa', '62676da8-b239-4ebe-b1f1-15a87141011d', null, 2),
      ('b4a77517-ef4d-47a3-a60b-85a368d687fa', '55665786-66e6-4ca3-be63-d9be2e03c1ed', null, 3),
      -- COLLEGE_D1 · 2025 · NorCal D-I Men's Conferences (NorCal-D-I-Mens-Conferences-2025) · ended 2025-04-13
      ('43e79b90-325f-440c-9375-f0914a3eb4cb', 'a93b6bb0-beb7-4837-87a5-7f99ca94657e', null, 1),
      ('43e79b90-325f-440c-9375-f0914a3eb4cb', '0a64a43a-d7b1-42e2-8b54-90f0d5af02f5', null, 2),
      ('43e79b90-325f-440c-9375-f0914a3eb4cb', '492b96af-2b41-4404-b884-7694b8848325', null, 3),
      ('43e79b90-325f-440c-9375-f0914a3eb4cb', '663bcdbd-0427-4ae6-abcd-b7ca751a1e2b', null, 4),
      -- COLLEGE_D1 · 2025 · NorCal D-I Women's Conferences (NorCal-D-I-Womens-Conferences-2025) · ended 2025-04-13
      ('3c4a965a-3359-489e-bbe7-7605c32ccdc4', 'b0fb8558-d34e-41b8-af8b-68a58306188b', null, 1),
      ('3c4a965a-3359-489e-bbe7-7605c32ccdc4', '994000c6-5692-43ef-ab88-6368175d18c5', null, 2),
      -- COLLEGE_D1 · 2025 · North Central Dev Men's Conferences (North-Central-Dev-Mens-Conferences-2025) · ended 2025-04-13
      ('492b1d9f-30c3-4208-94ed-8d5761d22cc1', 'e1dbf8a1-a9b6-44e2-967d-fec79ac02387', null, 1),
      ('492b1d9f-30c3-4208-94ed-8d5761d22cc1', 'dd2a1563-514f-4ac8-99cd-a317d8a6996b', null, 2),
      ('492b1d9f-30c3-4208-94ed-8d5761d22cc1', '1d4aa98e-1fcf-4f91-a7f4-dfa515115670', null, 3),
      ('492b1d9f-30c3-4208-94ed-8d5761d22cc1', 'd2e05d2a-9ce9-4581-8441-69ad9adc6b97', null, 4),
      ('492b1d9f-30c3-4208-94ed-8d5761d22cc1', '97cdd1f1-ef3a-44de-afb8-ef5fc449819d', null, 5),
      ('492b1d9f-30c3-4208-94ed-8d5761d22cc1', '3cf4b40a-52e9-43e2-abe7-435cb7ec7015', null, 6),
      -- COLLEGE_D1 · 2025 · North Texas D-I Men's Conferences (North-Texas-D-I-Mens-Conferences-2025) · ended 2025-04-13
      ('a604356e-cc82-4a42-a346-40abc4ba527a', 'cae30dcc-0aa5-45a9-b735-f4c9ad919af7', null, 1),
      ('a604356e-cc82-4a42-a346-40abc4ba527a', '06f078c9-49cd-47bb-af41-1f333057506f', null, 2),
      ('a604356e-cc82-4a42-a346-40abc4ba527a', '9538620a-df05-419a-8e9e-d681c5936c96', null, 3),
      ('a604356e-cc82-4a42-a346-40abc4ba527a', 'a3c10075-68fc-4202-a72b-1bc61922fc32', null, 4),
      -- COLLEGE_D1 · 2025 · Ohio D-I Men's Conferences (Ohio-D-I-Mens-Conferences-2025) · ended 2025-04-13
      ('088b58f2-dc7f-44d0-825f-d832493abcf4', '32e94ccc-3ab8-4b9a-a620-f5c0a471a229', null, 1),
      ('088b58f2-dc7f-44d0-825f-d832493abcf4', '54ffe2a0-3db3-40d6-a28f-86604b72ee48', null, 2),
      ('088b58f2-dc7f-44d0-825f-d832493abcf4', 'b5dcdd41-2904-49a7-b5b2-11595ff41dbf', null, 3),
      ('088b58f2-dc7f-44d0-825f-d832493abcf4', '22614adc-92c0-4689-8552-794846d44914', null, 4),
      ('088b58f2-dc7f-44d0-825f-d832493abcf4', '7efc48b6-f339-48c7-9ab1-c2645609ee84', null, 5),
      ('088b58f2-dc7f-44d0-825f-d832493abcf4', '3f140dea-6015-461d-8d1d-ac299134da45', null, 6),
      ('088b58f2-dc7f-44d0-825f-d832493abcf4', '5bfbe105-b64b-49cd-bc51-fc3f314930e8', null, 7),
      ('088b58f2-dc7f-44d0-825f-d832493abcf4', '30eb732d-1c75-4ce4-b38f-b8643b5f8285', null, 8),
      ('088b58f2-dc7f-44d0-825f-d832493abcf4', 'f42a4b46-0363-454c-b2da-04d7baa84cfc', null, 9),
      ('088b58f2-dc7f-44d0-825f-d832493abcf4', 'aee7046c-94d6-4990-b2e7-72c6f0061f55', null, 10),
      -- COLLEGE_D1 · 2025 · Ohio Valley Dev Men's Conferences (Ohio-Valley-Dev-Mens-Conferences-2025) · ended 2025-04-13
      ('833843f8-ecce-414c-a4e7-fa8dd06517fc', '13573081-809a-4f97-a659-e60b2a4ac5b7', null, 1),
      ('833843f8-ecce-414c-a4e7-fa8dd06517fc', '030c1c2c-24fe-4e90-a453-91fdd1986621', null, 2),
      ('833843f8-ecce-414c-a4e7-fa8dd06517fc', '656e44e7-7842-4f14-8e7f-471544339de8', null, 3),
      ('833843f8-ecce-414c-a4e7-fa8dd06517fc', 'd7c2023c-8a84-4643-a9d7-9f1b6c35a1c4', null, 5),
      ('833843f8-ecce-414c-a4e7-fa8dd06517fc', '1b5f052a-2803-4fb1-b944-e12c5da9eedb', null, 6),
      -- COLLEGE_D1 · 2025 · Ozarks D-I Women's Conferences (Ozarks-D-I-Womens-Conferences-2025) · ended 2025-04-13
      ('0bed969b-848f-46c6-a53e-5ee78588ca30', '3391f6d4-45f8-4169-be17-d6a9d1d4dae9', null, 1),
      ('0bed969b-848f-46c6-a53e-5ee78588ca30', 'c74ad327-de2b-4531-a568-e5cfb1fce32b', null, 2),
      -- COLLEGE_D1 · 2025 · Pennsylvania D-I Women's Conferences (Pennsylvania-D-I-Womens-Conferences-2025) · ended 2025-04-13
      ('491f0437-f3ef-446d-9545-ccb10f197918', 'f3758c0c-db01-4539-994d-08bc273511f3', null, 1),
      ('491f0437-f3ef-446d-9545-ccb10f197918', '79154cb6-c739-4246-8645-c040bec3f09e', null, 2),
      ('491f0437-f3ef-446d-9545-ccb10f197918', '7b517148-d82b-4b3b-9e77-36ac5e49046c', null, 3),
      ('491f0437-f3ef-446d-9545-ccb10f197918', '867a0ce6-66cd-490b-b0e7-6b901a5bc907', null, 4),
      -- COLLEGE_D1 · 2025 · Rocky Mountain D-I Men's Conferences (Rocky-Mountain-D-I-Mens-Conferences-2025) · ended 2025-04-13
      ('08467bd0-7ed2-43d3-b43b-3318aa95e544', '7d4dd420-7a4c-45cb-8890-169ef2d183b5', null, 1),
      ('08467bd0-7ed2-43d3-b43b-3318aa95e544', 'b0730a97-d19a-4005-b6c0-45f0327879ba', null, 2),
      -- COLLEGE_D1 · 2025 · SoCal D-I Men's Conferences (SoCal-D-I-Mens-Conferences-2025) · ended 2025-04-13
      ('7f5dcfd9-b939-4773-844a-f0ae27d54afc', '93562b06-fb83-49bf-8d79-36b7ec0c447e', null, 1),
      ('7f5dcfd9-b939-4773-844a-f0ae27d54afc', '8f95fa07-779f-482a-85f1-266bf576fc2b', null, 2),
      ('7f5dcfd9-b939-4773-844a-f0ae27d54afc', '7ae10695-8b9c-436a-a240-88813b91dfa3', null, 3),
      ('7f5dcfd9-b939-4773-844a-f0ae27d54afc', '1c9e793d-2414-4b44-ba87-c7d12efc3652', null, 4),
      ('7f5dcfd9-b939-4773-844a-f0ae27d54afc', '3bd57713-957c-4fb3-a746-9e12215287e9', null, 5),
      ('7f5dcfd9-b939-4773-844a-f0ae27d54afc', '7755a33c-953e-424a-a2f0-ffd475cd7749', null, 6),
      ('7f5dcfd9-b939-4773-844a-f0ae27d54afc', '0478bb30-4aa5-4a3a-af4a-b16a5cf9714b', null, 7),
      ('7f5dcfd9-b939-4773-844a-f0ae27d54afc', 'a40d0bd0-9653-4f07-96fc-d6f84693c839', null, 8),
      -- COLLEGE_D1 · 2025 · SoCal D-I Women's Conferences (SoCal-D-I-Womens-Conferences-2025) · ended 2025-04-13
      ('1a692d40-c06c-4863-8849-1646d81a2d8c', '604285e5-8054-4b7d-9f1c-c1b95c77da01', null, 1),
      ('1a692d40-c06c-4863-8849-1646d81a2d8c', 'ccae7fde-c57f-4973-8ad4-ca4552dcc525', null, 2),
      ('1a692d40-c06c-4863-8849-1646d81a2d8c', 'd53ac3b5-e0e7-4c26-989b-b0915b594a4e', null, 3),
      ('1a692d40-c06c-4863-8849-1646d81a2d8c', '5586856d-d039-47e4-84f0-a8ac1db0ebf8', null, 4),
      ('1a692d40-c06c-4863-8849-1646d81a2d8c', '5b26f78b-c313-40cc-99eb-78c8e736f16f', null, 5),
      ('1a692d40-c06c-4863-8849-1646d81a2d8c', '9ccc1cd4-fad0-4f8b-8e46-a204d55c3ac6', null, 6),
      ('1a692d40-c06c-4863-8849-1646d81a2d8c', 'c348deff-eac3-40a5-9d60-855b74ac4bf0', null, 7),
      ('1a692d40-c06c-4863-8849-1646d81a2d8c', '0fcfbb6b-2fe7-4f2f-8d86-e5d452c8d24b', null, 8),
      -- COLLEGE_D1 · 2025 · South Texas D-I Men's Conferences (South-Texas-D-I-Mens-Conferences-2025) · ended 2025-04-13
      ('758db59e-1ea2-414f-9eb1-3ee249c2b26b', 'a2ba491e-553c-4388-81fc-c41565249478', null, 1),
      ('758db59e-1ea2-414f-9eb1-3ee249c2b26b', 'ac11927d-30a0-4eb3-9dfa-814361912eb4', null, 2),
      -- COLLEGE_D1 · 2025 · Southern Appalachian D-I Men's Conferences (Southern-Appalachian-D-I-Mens-Conferences-2025) · ended 2025-04-13
      ('86df8e2a-1b71-4d13-8d63-a660bfda69c4', '3f82d1db-10e6-402a-924c-22249837ad0f', null, 1),
      ('86df8e2a-1b71-4d13-8d63-a660bfda69c4', '0ccf2d68-0cd3-4956-a446-f0f5925ad693', null, 2),
      ('86df8e2a-1b71-4d13-8d63-a660bfda69c4', '99cf46ed-753f-4721-8a9c-1fec150ba161', null, 3),
      ('86df8e2a-1b71-4d13-8d63-a660bfda69c4', '665bd33d-f119-420f-8882-1b53f4244c5f', null, 4),
      ('86df8e2a-1b71-4d13-8d63-a660bfda69c4', '7d1e79b6-aa8a-44f2-a609-a99e4e71672f', null, 5),
      ('86df8e2a-1b71-4d13-8d63-a660bfda69c4', 'e0867132-4b82-44fe-96ae-f1e3979ebb59', null, 6),
      ('86df8e2a-1b71-4d13-8d63-a660bfda69c4', '0aa9fde0-7691-4608-8a15-25388907d9e2', null, 7),
      ('86df8e2a-1b71-4d13-8d63-a660bfda69c4', '236a9576-123d-4e6f-bb55-a80398210df2', null, 8),
      ('86df8e2a-1b71-4d13-8d63-a660bfda69c4', 'd49362f5-70e3-4453-8e2a-812873e804d5', null, 9),
      ('86df8e2a-1b71-4d13-8d63-a660bfda69c4', '40288b36-18dd-419c-991c-4283fe88ba13', null, 10),
      -- COLLEGE_D1 · 2025 · Southern Appalachian D-I Women's Conferences (Southern-Appalachian-D-I-Womens-Conferences-2025) · ended 2025-04-13
      ('32900860-bc5d-44d9-94e1-9e81cb183408', 'dfd24cc3-e841-4022-b182-9bb37fc1da16', null, 1),
      ('32900860-bc5d-44d9-94e1-9e81cb183408', 'a9d79445-521a-4a5e-8081-f8083506b7e0', null, 2),
      ('32900860-bc5d-44d9-94e1-9e81cb183408', 'f0ec5c92-2b1a-4aa3-b99e-e6fbc517033b', null, 3),
      ('32900860-bc5d-44d9-94e1-9e81cb183408', 'e0d0db92-eb12-4cb4-a1cf-d6141779a8b4', null, 4),
      ('32900860-bc5d-44d9-94e1-9e81cb183408', '9696f2b2-b967-4c16-8ba2-f3b35c5f9b31', null, 5),
      ('32900860-bc5d-44d9-94e1-9e81cb183408', 'be70acdc-4d62-436a-9e57-8cfd2b0de116', null, 6),
      ('32900860-bc5d-44d9-94e1-9e81cb183408', '8aa33622-0aac-4cdf-a929-1cd5c8393ba5', null, 7),
      ('32900860-bc5d-44d9-94e1-9e81cb183408', '3d7d2172-4be1-4c72-a9e1-37118d6f0057', null, 8),
      -- COLLEGE_D1 · 2025 · Southern Atlantic Coast Dev Men's Conferences (Southern-Atlantic-Coast-Dev-Mens-Conferences-2025) · ended 2025-04-13
      ('4ffec8e6-8967-401a-a40a-20664137095c', '43ca1e96-6956-4c58-8aee-11397f4323ec', null, 1),
      ('4ffec8e6-8967-401a-a40a-20664137095c', '67316c7a-e262-4db2-8eb4-80575e8d5026', null, 2),
      ('4ffec8e6-8967-401a-a40a-20664137095c', '389fea2a-159c-4f68-b435-369f2eae21cd', null, 3),
      ('4ffec8e6-8967-401a-a40a-20664137095c', 'ba56bb8b-6a20-4a90-a18d-3680a7c20201', null, 4),
      ('4ffec8e6-8967-401a-a40a-20664137095c', '43ff19c9-572a-416b-9287-c445bb0dd18b', null, 5),
      ('4ffec8e6-8967-401a-a40a-20664137095c', '7066c65e-254e-4010-a7ed-a0cb03b648de', null, 6),
      ('4ffec8e6-8967-401a-a40a-20664137095c', 'c3243fdf-6a3a-41fe-a5d8-a3a4a9d8089e', null, 7),
      -- COLLEGE_D1 · 2025 · Southwest Dev Men's Conferences (Southwest-Dev-Mens-Conferences-2025) · ended 2025-04-13
      ('8d634662-4a12-4df8-abb9-237e1f71ead6', '2b034050-c461-4d3c-8337-d73a46a7b934', null, 1),
      ('8d634662-4a12-4df8-abb9-237e1f71ead6', '9b956743-5e98-41bd-8fd2-80af875b8f47', null, 2),
      ('8d634662-4a12-4df8-abb9-237e1f71ead6', 'eee8d097-1f2a-417c-b096-fc8c85d39f7b', null, 3),
      ('8d634662-4a12-4df8-abb9-237e1f71ead6', '1af05c80-a9e6-448b-99e1-4b445a6149aa', null, 4),
      -- COLLEGE_D1 · 2025 · Southwest Dev Women's Conferences (Southwest-Dev-Womens-Conferences-2025) · ended 2025-04-13
      ('641071d9-8c16-4c54-ab2d-5e3e99f6612f', 'c6a6b77a-7f6e-479e-88a1-e4490ea69990', null, 1),
      ('641071d9-8c16-4c54-ab2d-5e3e99f6612f', '2298c8ff-9caf-455c-96c6-6a11d2a157af', null, 2),
      ('641071d9-8c16-4c54-ab2d-5e3e99f6612f', '1142b261-f105-469d-a113-d31a7576f232', null, 3),
      ('641071d9-8c16-4c54-ab2d-5e3e99f6612f', '66fbfa64-1194-43f5-8353-2718578a2c86', null, 4),
      -- COLLEGE_D1 · 2025 · Virginia D-I Men's Conferences (Virginia-D-I-Mens-Conferences-2025) · ended 2025-04-13
      ('3658803e-dc03-4d88-95d1-e365c4419468', '26ab2341-55bc-4932-9d19-68c26f113d29', null, 1),
      ('3658803e-dc03-4d88-95d1-e365c4419468', '81509b6a-67a1-46fc-846b-a5f38fd41aa4', null, 2),
      ('3658803e-dc03-4d88-95d1-e365c4419468', '83cf262f-a781-4c26-af08-acfa84e1474b', null, 3),
      ('3658803e-dc03-4d88-95d1-e365c4419468', '0b4c7387-cc50-42e8-98e7-d3096680833d', null, 4),
      ('3658803e-dc03-4d88-95d1-e365c4419468', '5c6e575e-38c7-455f-bfce-cf1071a4cfdc', null, 5),
      ('3658803e-dc03-4d88-95d1-e365c4419468', 'd9f9584f-909a-44ae-85b1-8e74c3967d16', null, 6),
      ('3658803e-dc03-4d88-95d1-e365c4419468', 'b57d9eb7-6068-4a31-a01b-a229ee5ca935', null, 7),
      ('3658803e-dc03-4d88-95d1-e365c4419468', 'dd1180e3-028a-492f-846b-a282c5361f6c', null, 8),
      -- COLLEGE_D1 · 2025 · Western NY D-I Men's Conferences (Western-NY-D-I-Mens-Conferences-2025) · ended 2025-04-13
      ('744e72ca-1ab8-4ba1-9601-22fd300f8e5a', '26f8eb8b-e003-41a3-9aae-4fcfb69e154f', null, 1),
      ('744e72ca-1ab8-4ba1-9601-22fd300f8e5a', '2b584821-a941-46f9-9e36-461609a22113', null, 2),
      ('744e72ca-1ab8-4ba1-9601-22fd300f8e5a', '3dde10a9-c1cc-4db8-b676-ffba8e17794d', null, 3),
      ('744e72ca-1ab8-4ba1-9601-22fd300f8e5a', 'f69aecee-bd04-4a73-8b2e-5ff7d212d0f6', null, 4),
      ('744e72ca-1ab8-4ba1-9601-22fd300f8e5a', '25ce4b29-583c-4bfc-8dc8-527f9bcd16bc', null, 5),
      ('744e72ca-1ab8-4ba1-9601-22fd300f8e5a', '40819d57-86e3-459f-bfc3-df833f3daa1c', null, 6),
      ('744e72ca-1ab8-4ba1-9601-22fd300f8e5a', '4fa70a04-8b4e-4297-925e-ba256929fcf3', null, 7),
      ('744e72ca-1ab8-4ba1-9601-22fd300f8e5a', '028c2a06-4b91-4c68-81d3-a615b950ccfe', null, 8),
      -- COLLEGE_D1 · 2025 · Western NY D-I Women's Conferences (Western-NY-D-I-Womens-Conferences-2025) · ended 2025-04-13
      ('42a0974e-1374-4c45-836c-8ab51aabc8f7', 'b0b032fb-221b-4799-8004-a751c75378c7', null, 1),
      ('42a0974e-1374-4c45-836c-8ab51aabc8f7', 'e93d2e17-ea1f-4a45-a148-5772139be8f6', null, 2),
      ('42a0974e-1374-4c45-836c-8ab51aabc8f7', 'c044b26d-0438-4789-bfc5-aba21b18e175', null, 3),
      ('42a0974e-1374-4c45-836c-8ab51aabc8f7', 'a9fd49b6-61dc-4edf-ae2e-a5c9fa421084', null, 4),
      ('42a0974e-1374-4c45-836c-8ab51aabc8f7', '767fe036-404e-46b3-a4db-96a44605a0be', null, 5),
      ('42a0974e-1374-4c45-836c-8ab51aabc8f7', '400cb8fe-db82-438f-b042-7050107d398a', null, 6),
      -- COLLEGE_D1 · 2025 · Southeast Dev Men's Conferences (Southeast-Dev-Mens-Conferences-2025) · ended 2025-04-19
      ('b5513346-1772-4716-a956-bfdb25fff78c', 'cc267484-1ea5-4a9f-af25-701b2b716fc9', null, 1),
      ('b5513346-1772-4716-a956-bfdb25fff78c', '359bb989-2238-454f-b527-c5089b02eda7', null, 2),
      -- COLLEGE_D1 · 2025 · Big Sky D-I Men's Conferences (Big-Sky-D-I-Mens-Conferences-2025) · ended 2025-04-20
      ('740a1d9b-2b75-4aca-88fe-3c7e3fd3f668', 'e04cea82-d7c3-4f2b-8f3b-96487b17e58a', null, 2),
      -- COLLEGE_D1 · 2025 · Cascadia D-I Men's Conferences (Cascadia-D-I-Mens-Conferences-2025) · ended 2025-04-20
      ('a97d6e3d-d809-4b0d-a2af-33c57c9a1110', '8a39e5d0-b62d-4396-9ddd-44dee218cd3a', null, 1),
      ('a97d6e3d-d809-4b0d-a2af-33c57c9a1110', '1a89550e-3709-4fb4-b872-42ba92cc67e9', null, 2),
      ('a97d6e3d-d809-4b0d-a2af-33c57c9a1110', 'f549e596-ebac-45be-a05b-ed90879238b8', null, 3),
      ('a97d6e3d-d809-4b0d-a2af-33c57c9a1110', 'e78e7e39-0926-41ad-8920-c82da9c43110', null, 4),
      ('a97d6e3d-d809-4b0d-a2af-33c57c9a1110', '6447f4b0-0e2b-4cfa-8d91-aae2e6c174e4', null, 5),
      ('a97d6e3d-d809-4b0d-a2af-33c57c9a1110', 'ecde6bf6-13b4-4ba5-8557-ef59364eed2a', null, 6),
      ('a97d6e3d-d809-4b0d-a2af-33c57c9a1110', '96580986-4120-4060-bead-9e3dc8b80bb5', null, 7),
      ('a97d6e3d-d809-4b0d-a2af-33c57c9a1110', '9d598c17-091c-4b06-9793-1f9aac8a7a2d', null, 8),
      ('a97d6e3d-d809-4b0d-a2af-33c57c9a1110', 'c8f3a26d-e01a-4d8a-810c-40998497aefb', null, 9),
      ('a97d6e3d-d809-4b0d-a2af-33c57c9a1110', 'f17281a1-f5f8-401a-9f3d-bc8c031a1215', null, 10),
      -- COLLEGE_D1 · 2025 · East Penn D-I Men's Conferences (East-Penn-D-I-Mens-Conferences) · ended 2025-04-20
      ('ae731c68-fa11-4100-917c-9131d7ccb705', '6f51c501-f299-4232-9b4c-06e499962c0b', null, 1),
      ('ae731c68-fa11-4100-917c-9131d7ccb705', '71cd67df-75d4-4a0d-92f4-90de0da855ec', null, 2),
      ('ae731c68-fa11-4100-917c-9131d7ccb705', 'a320e6c2-4745-4801-a6cc-b0fc675fe6f0', null, 3),
      ('ae731c68-fa11-4100-917c-9131d7ccb705', '4987a7ee-3a73-4695-900e-47f58b66e4b4', null, 4),
      ('ae731c68-fa11-4100-917c-9131d7ccb705', 'ade572eb-1976-43b6-8797-9d56be26df7d', null, 5),
      -- COLLEGE_D1 · 2025 · New England D-I College Women's Regionals (New-England-D-I-College-Womens-Regionals-2025) · ended 2025-04-27
      ('8fb680b0-ce8d-47fe-955f-f1970e53e6e0', 'c4d7ca87-013e-4c37-926d-085865aaea34', 3, 4), -- correct
      -- COLLEGE_D1 · 2025 · North Central D-I College Men's Regionals (North-Central-D-I-College-Mens-Regionals-2025) · ended 2025-04-27
      ('f9591758-0971-434b-9c3c-c1edb8b1c356', '9b69630c-bb79-4d1e-8076-f1cba8676760', null, 11),
      -- COLLEGE_D1 · 2025 · South Central D-I College Men's Regionals (South-Central-D-I-College-Mens-Regionals-2025) · ended 2025-04-27
      ('99a7e5a7-4fbb-4c6c-8688-adab8c672d23', 'ac11927d-30a0-4eb3-9dfa-814361912eb4', null, 5),
      -- COLLEGE_D1 · 2025 · Southwest D-I College Women's Regionals (Southwest-D-I-College-Womens-Regionals-2025) · ended 2025-04-27
      ('e1f1de88-3757-4b3e-b197-ff639453b954', '604285e5-8054-4b7d-9f1c-c1b95c77da01', 2, 3), -- correct
      ('e1f1de88-3757-4b3e-b197-ff639453b954', '994000c6-5692-43ef-ab88-6368175d18c5', 3, 5), -- correct
      ('e1f1de88-3757-4b3e-b197-ff639453b954', 'dbd83899-1e45-4bb9-9d55-6c0892693824', null, 6),
      ('e1f1de88-3757-4b3e-b197-ff639453b954', '5586856d-d039-47e4-84f0-a8ac1db0ebf8', null, 7),
      ('e1f1de88-3757-4b3e-b197-ff639453b954', '47829a06-c592-4e28-9f9b-78ea328d6cfc', null, 12),
      -- COLLEGE_D1 · 2025 · New England D-I College Men's Regionals (New-England-D-I-College-Mens-Regionals-2025) · ended 2025-05-04
      ('535e5bfa-e863-4cef-a1b3-92b206aa44e7', '54580784-7b00-45fb-a14f-bba1204798c0', null, 3),
      ('535e5bfa-e863-4cef-a1b3-92b206aa44e7', '947b072d-31ea-47bc-ab34-59457bd9055a', 3, 4), -- correct
      ('535e5bfa-e863-4cef-a1b3-92b206aa44e7', 'df142b77-73ca-4a8b-b84a-26252e829fff', 3, 5), -- correct
      -- COLLEGE_D1 · 2025 · Northwest D-I College Men's Regionals (Northwest-D-I-College-Mens-Regionals-2025) · ended 2025-05-04
      ('9e9cd049-bc66-4795-877f-d296bf1677ba', 'ecde6bf6-13b4-4ba5-8557-ef59364eed2a', null, 4),
      ('9e9cd049-bc66-4795-877f-d296bf1677ba', 'f549e596-ebac-45be-a05b-ed90879238b8', 3, 5), -- correct
      ('9e9cd049-bc66-4795-877f-d296bf1677ba', '6447f4b0-0e2b-4cfa-8d91-aae2e6c174e4', null, 6),
      ('9e9cd049-bc66-4795-877f-d296bf1677ba', '3da76247-08d1-489d-950e-0af71c0e3f86', null, 7),
      ('9e9cd049-bc66-4795-877f-d296bf1677ba', 'e78e7e39-0926-41ad-8920-c82da9c43110', 3, 7), -- correct
      -- COLLEGE_D1 · 2025 · Northwest D-I College Women's Regionals (Northwest-D-I-College-Womens-Regionals-2025) · ended 2025-05-04
      ('8da7d40c-4d60-4c0d-b187-13d9e0923884', '2f0ce7e7-b520-492c-a93c-7f8d3e3ceccf', null, 3),
      ('8da7d40c-4d60-4c0d-b187-13d9e0923884', '52ce6221-6d05-4bf8-bafe-dbd88dc86b96', null, 4),
      ('8da7d40c-4d60-4c0d-b187-13d9e0923884', '8602561a-a791-4d0e-8957-32f334372791', null, 5),
      ('8da7d40c-4d60-4c0d-b187-13d9e0923884', '5d1e33f2-a82e-44dd-a6eb-691ffbe78a50', null, 6),
      ('8da7d40c-4d60-4c0d-b187-13d9e0923884', '451e26ab-0834-437a-9c17-a9c2ec92edad', null, 7),
      ('8da7d40c-4d60-4c0d-b187-13d9e0923884', '977a960e-b141-43a1-b7c9-5933218ec3bf', null, 7),
      -- COLLEGE_D1 · 2026 · East Penn D-I Men's Conferences (East-Penn-D-I-Mens-Conferences-2026) · ended 2026-04-11
      ('ab67b1ce-c6da-4126-91a9-183ab3e4629f', '681cba77-cdc3-44b7-b184-a126bfa59c1d', null, 1),
      ('ab67b1ce-c6da-4126-91a9-183ab3e4629f', '2e574bcd-f1f9-44ac-98f6-b0bcdc1654d5', null, 2),
      ('ab67b1ce-c6da-4126-91a9-183ab3e4629f', '5baa8ed8-b894-4a87-9ea8-82ff463abc11', null, 3),
      ('ab67b1ce-c6da-4126-91a9-183ab3e4629f', '945d8920-c22e-49c2-af34-2571226c5f9f', null, 4),
      ('ab67b1ce-c6da-4126-91a9-183ab3e4629f', 'cec519d4-05c8-4d0a-a843-ebede509879c', null, 5),
      ('ab67b1ce-c6da-4126-91a9-183ab3e4629f', 'c7b601c6-7ee5-41c3-b6da-37d0f7303822', null, 6),
      -- COLLEGE_D1 · 2026 · East Plains D-I Men's Conferences (East-Plains-D-I-Mens-Conferences-2026) · ended 2026-04-11
      ('98f94aa2-fe03-4178-b716-d6366cab5a50', 'ac7ea34d-6919-4cd3-8b77-7435a97322fa', null, 1),
      ('98f94aa2-fe03-4178-b716-d6366cab5a50', '3b87ddb9-7d3c-44ad-8d6b-d7ca21588900', null, 2),
      ('98f94aa2-fe03-4178-b716-d6366cab5a50', '9b03ec93-2501-4a82-9ec6-9de4230ab0ea', null, 3),
      -- COLLEGE_D1 · 2026 · Greater New England D-I Women's Conferences (Greater-New-England-D-I-Womens-Conferences-2026) · ended 2026-04-11
      ('87d24834-5e0f-4dd7-94bc-7315197e3731', '02b2ced0-4cc7-4c6b-a1ae-a5fbdcb8d7fa', null, 1),
      ('87d24834-5e0f-4dd7-94bc-7315197e3731', '5a063cdf-4214-456d-ba53-4809664189c2', null, 2),
      ('87d24834-5e0f-4dd7-94bc-7315197e3731', '6d431cda-2259-40cf-9bf6-3d1e0bdd0268', null, 3),
      ('87d24834-5e0f-4dd7-94bc-7315197e3731', 'e6677d0d-074e-40cc-b4a4-650ec35a367b', null, 4),
      -- COLLEGE_D1 · 2026 · Hudson Valley D-I Men's Conferences (Hudson-Valley-D-I-Mens-Conferences-2026) · ended 2026-04-11
      ('80d867ea-c855-4f7d-93cd-aeb85e2dbfcd', 'df4e9ba6-f1dd-413b-afec-14b3527208d3', null, 1),
      ('80d867ea-c855-4f7d-93cd-aeb85e2dbfcd', 'dd5fe845-d570-4da6-bedc-61e44bfec66c', null, 2),
      ('80d867ea-c855-4f7d-93cd-aeb85e2dbfcd', '03c39e56-5e86-47f1-8cef-aeb9a1ba8356', null, 3),
      ('80d867ea-c855-4f7d-93cd-aeb85e2dbfcd', 'e74e0959-670a-42ec-a5e3-cdcc8a00b354', null, 4),
      -- COLLEGE_D1 · 2026 · Michigan D-I Men's Conferences (Michigan-D-I-Mens-Conferences-2026) · ended 2026-04-11
      ('16fa3136-df8c-46e5-9d60-93cda3de3441', 'e8630928-8873-4c7f-b305-ba9dc5e18337', null, 1),
      ('16fa3136-df8c-46e5-9d60-93cda3de3441', '3452f630-3f56-4c3e-9afd-a4e385b648a7', null, 2),
      ('16fa3136-df8c-46e5-9d60-93cda3de3441', 'fcad445c-f33b-4dca-9add-40b797d47298', null, 3),
      ('16fa3136-df8c-46e5-9d60-93cda3de3441', 'fde2f49b-0bc4-4d44-8b7b-80826eb6d3ab', null, 4),
      -- COLLEGE_D1 · 2026 · North Texas D-I Men's Conferences (North-Texas-D-I-Mens-Conferences-2026) · ended 2026-04-11
      ('fc166db8-6643-4d93-b540-6ddedd02c3e5', 'a19cc780-83bd-4fac-9179-9533cfc3927a', null, 1),
      ('fc166db8-6643-4d93-b540-6ddedd02c3e5', '7f02c355-0581-4b06-957e-4408ad97ab5a', null, 2),
      ('fc166db8-6643-4d93-b540-6ddedd02c3e5', 'ea5afa6b-8b8c-487c-91f8-9dfafd7ddcc9', null, 3),
      ('fc166db8-6643-4d93-b540-6ddedd02c3e5', '1db98631-1464-446e-9abd-739945da32e5', null, 4),
      -- COLLEGE_D1 · 2026 · Big Sky D-I Men's Conferences (Big-Sky-D-I-Mens-Conferences-2026) · ended 2026-04-12
      ('7a2879a7-5bbc-47e8-9ca3-975dc34b0b7b', '7278ed1a-358e-4dbd-89a1-63f7067e64b5', null, 1),
      ('7a2879a7-5bbc-47e8-9ca3-975dc34b0b7b', '0bfb44ef-d8d8-4006-95c7-cbff176f3905', null, 2),
      ('7a2879a7-5bbc-47e8-9ca3-975dc34b0b7b', 'b07934ef-c95a-4a14-adfd-b80e87d3ca23', null, 3),
      ('7a2879a7-5bbc-47e8-9ca3-975dc34b0b7b', '9a8f5f9b-d263-4d8b-8131-6fb9e5a0a1f3', null, 4),
      -- COLLEGE_D1 · 2026 · Carolina D-I Men's Conferences (Carolina-D-I-Mens-Conferences-2026) · ended 2026-04-12
      ('29c5cb59-5d2b-402e-b524-4b26da731ed3', '64cb121c-0baa-4063-b81b-62dca2078b31', null, 1),
      ('29c5cb59-5d2b-402e-b524-4b26da731ed3', 'ecc44ee4-3fa2-428c-ae17-c70ebb52baee', null, 2),
      ('29c5cb59-5d2b-402e-b524-4b26da731ed3', 'f20f95c6-2ae8-4b8a-b4b7-3c8ce4f90ae9', null, 3),
      ('29c5cb59-5d2b-402e-b524-4b26da731ed3', '2e69e99a-704e-44cb-9ed3-ea7f3b1d7cc5', null, 4),
      ('29c5cb59-5d2b-402e-b524-4b26da731ed3', '46a8f6e4-84a5-476d-80aa-eeb7206e0685', null, 5),
      ('29c5cb59-5d2b-402e-b524-4b26da731ed3', '9c0af0d7-d9f9-475e-bec9-25a164a58dd2', null, 6),
      ('29c5cb59-5d2b-402e-b524-4b26da731ed3', '57b7e40d-0d53-434d-9804-bac624aa9550', null, 7),
      ('29c5cb59-5d2b-402e-b524-4b26da731ed3', '8826e5f3-72f6-4bae-bcc4-4e09fe4754f0', null, 8),
      ('29c5cb59-5d2b-402e-b524-4b26da731ed3', '98d1e158-1a2a-45b7-b641-c969747c884b', null, 9),
      ('29c5cb59-5d2b-402e-b524-4b26da731ed3', '2c549527-959d-4d1a-9506-1c96e3d0f332', null, 10),
      -- COLLEGE_D1 · 2026 · Carolina D-I Women's Conferences (Carolina-D-I-Womens-Conferences-2026) · ended 2026-04-12
      ('dc7f6fd6-1ac2-4cea-a369-2bb3254282be', '86567f7d-7bca-4fde-b5bd-6c5265aff993', null, 1),
      ('dc7f6fd6-1ac2-4cea-a369-2bb3254282be', 'ed0e323b-530e-4a75-bb5f-fd83a92ebd80', null, 2),
      ('dc7f6fd6-1ac2-4cea-a369-2bb3254282be', '9c18ad51-9c9f-4f91-a6e5-1a5ee3962473', null, 3),
      ('dc7f6fd6-1ac2-4cea-a369-2bb3254282be', 'eae5df1d-6496-4ad4-bcb8-10174a3ebcb9', null, 4),
      -- COLLEGE_D1 · 2026 · Cascadia D-I Men's Conferences (Cascadia-D-I-Mens-Conferences-2026) · ended 2026-04-12
      ('a06968b5-c5a6-44c2-afc6-1b31109c44b1', 'bd554433-cbf6-4182-929a-85e3beb1d8e5', null, 1),
      ('a06968b5-c5a6-44c2-afc6-1b31109c44b1', '9835cd0e-98b4-4057-8341-1478158d311d', null, 2),
      ('a06968b5-c5a6-44c2-afc6-1b31109c44b1', 'a712c0e6-1249-48dd-a1a3-6e34b3bb4c87', null, 3),
      ('a06968b5-c5a6-44c2-afc6-1b31109c44b1', 'bc08b9ef-bde4-40b0-b3cd-bb2a2d54cfda', null, 3),
      ('a06968b5-c5a6-44c2-afc6-1b31109c44b1', 'aad4d8f3-2ea8-4a78-a30a-76ef401c6146', null, 4),
      ('a06968b5-c5a6-44c2-afc6-1b31109c44b1', '137646e5-9a82-43f4-ae29-ac3b15436928', null, 7),
      ('a06968b5-c5a6-44c2-afc6-1b31109c44b1', '8ba0081d-976d-4f20-9d61-f45b4279b23e', null, 8),
      ('a06968b5-c5a6-44c2-afc6-1b31109c44b1', '173da234-7495-4780-82c5-23a84afe5d8f', null, 9),
      ('a06968b5-c5a6-44c2-afc6-1b31109c44b1', 'b37eac9a-eeb3-4417-bac5-2ee19abef223', null, 10),
      -- COLLEGE_D1 · 2026 · Cascadia D-I Women's Conferences (Cascadia-D-I-Womens-Conferences-2026) · ended 2026-04-12
      ('13dbb2e0-70f1-4396-b73e-68b5febe4fa9', '8812929d-7477-45a8-b890-c92c7fb63a20', null, 1),
      ('13dbb2e0-70f1-4396-b73e-68b5febe4fa9', '34c30c73-2870-4109-a0fb-91e03ee30500', null, 2),
      ('13dbb2e0-70f1-4396-b73e-68b5febe4fa9', '566ed2be-f83f-4734-bb7a-3edcb32ac6d7', null, 7),
      ('13dbb2e0-70f1-4396-b73e-68b5febe4fa9', 'bfb24e4b-d49c-418e-b847-e00ec00877b4', null, 8),
      -- COLLEGE_D1 · 2026 · Colonial Dev Men's Conferences (Colonial-Dev-Mens-Conferences-2026) · ended 2026-04-12
      ('dc8e6a5f-fae8-4ef7-9fea-904c2bc55e6d', '71563f35-ec77-41aa-ad46-9d79a0ca92fc', null, 1),
      ('dc8e6a5f-fae8-4ef7-9fea-904c2bc55e6d', 'cc153449-17ff-46b3-b0d6-eec6a801f32c', null, 2),
      ('dc8e6a5f-fae8-4ef7-9fea-904c2bc55e6d', 'a8ab5462-93cc-4b9e-b0b5-e97923a637fb', null, 3),
      ('dc8e6a5f-fae8-4ef7-9fea-904c2bc55e6d', 'c2411d07-04eb-48ec-81e8-461c41493970', null, 4),
      -- COLLEGE_D1 · 2026 · Desert D-I Men's Conferences (Desert-D-I-Mens-Conferences-2026) · ended 2026-04-12
      ('fd8e9e7c-e4e1-45d9-bb1a-427106c64215', '59869baa-5f5d-426e-b530-302fd02825a0', null, 1),
      ('fd8e9e7c-e4e1-45d9-bb1a-427106c64215', '7c00dfcc-2704-4bb6-b5af-421dbbd93edd', null, 2),
      ('fd8e9e7c-e4e1-45d9-bb1a-427106c64215', 'dfb0d926-f754-454a-99b2-48dbb0acfda5', null, 3),
      -- COLLEGE_D1 · 2026 · Eastern Great Lakes D-I Women's Conferences (Eastern-Great-Lakes-D-I-Womens-Conferences-2026) · ended 2026-04-12
      ('b2d427a2-b440-452f-ac9e-d73012bec3e0', 'e3ba3e56-f9fc-44bb-ace0-737b639c7b17', null, 1),
      ('b2d427a2-b440-452f-ac9e-d73012bec3e0', 'eb72fde5-f481-401b-ac83-a0748739ab2e', null, 2),
      ('b2d427a2-b440-452f-ac9e-d73012bec3e0', 'f0090738-9241-4f95-85a2-4d96f9d42072', null, 3),
      ('b2d427a2-b440-452f-ac9e-d73012bec3e0', '3262c84a-4484-474a-bbe5-53e8141efec8', null, 4),
      ('b2d427a2-b440-452f-ac9e-d73012bec3e0', 'da1381ca-3e4d-4fd1-aed0-b3b92d68da5b', null, 5),
      ('b2d427a2-b440-452f-ac9e-d73012bec3e0', 'df1f7fb2-02e0-4638-98fb-f7f048fae4e9', null, 6),
      ('b2d427a2-b440-452f-ac9e-d73012bec3e0', 'fee0b389-83b8-4326-93e2-557e987a973c', null, 7),
      ('b2d427a2-b440-452f-ac9e-d73012bec3e0', '73b066ae-59ac-4b62-b4cf-8e845a02ab0a', null, 8),
      -- COLLEGE_D1 · 2026 · Eastern Metro East D-I Women's Conferences (Eastern-Metro-East-D-I-Womens-Conferences-2026) · ended 2026-04-12
      ('0537ee82-044c-4ef6-a913-4cb4dbc44877', 'a14ef74a-18b9-4114-a062-b3d64b9d7509', null, 1),
      ('0537ee82-044c-4ef6-a913-4cb4dbc44877', 'd93df97a-28f5-46ab-a317-2fb466e1823d', null, 2),
      ('0537ee82-044c-4ef6-a913-4cb4dbc44877', 'dd5d56ee-fdc7-4645-96ed-b209bd313890', null, 3),
      ('0537ee82-044c-4ef6-a913-4cb4dbc44877', '5b6d9e9e-9e43-4aad-997b-07c362a3a5e3', null, 4),
      ('0537ee82-044c-4ef6-a913-4cb4dbc44877', 'c2fcf27f-f972-4fa1-8146-b56a3700b0d2', null, 5),
      ('0537ee82-044c-4ef6-a913-4cb4dbc44877', 'eccdd9f0-e237-405c-8faa-82814df772b1', null, 5),
      ('0537ee82-044c-4ef6-a913-4cb4dbc44877', '9dd2c805-d032-42c5-ae0a-616e36758c75', null, 7),
      ('0537ee82-044c-4ef6-a913-4cb4dbc44877', 'db491354-1fee-4d8f-8844-b15a7bb7abb4', null, 8)
    ) as v(event_id, team_id, old_place, new_place)
   where et.event_id = v.event_id
     and et.team_id = v.team_id
     and et.final_placement is not distinct from v.old_place;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> v_expected THEN
    RAISE EXCEPTION 'usau placements part 09: expected % rows, matched %; data drifted since generation, re-run scripts/derive-usau-placements.ts', v_expected, v_updated;
  END IF;
  RAISE NOTICE 'usau placements part 09: updated % rows', v_updated;
END
$migration$;

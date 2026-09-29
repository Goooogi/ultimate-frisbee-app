-- USAU per-event final placements — repair + fill, part 04 of 06.
--
-- The 2026-07-20 one-shot derivePlacements() backfill (Feature Backlog #18)
-- stored misread brackets, game-to-go losers kept 2nd, and ties that a later
-- game had settled; nothing derived placements after it. Regenerated with the
-- fixed algorithm by scripts/derive-usau-placements.ts on 2026-09-29T14:31:03.879Z —
-- do not hand-edit, re-run it.
--
-- This part: 159 events · fill 629 · correct 65 · clear 16 (conflict 0, contradicted 0, unsupported 16).
-- EXPECTED ROWS: 710. A row only updates while final_placement still holds
-- the value it was generated from ("old" below); the DO block raises, rolling
-- this part back, unless exactly 710 rows match. Regenerate instead of forcing it.
-- All 6 parts: 740 events · fill 3512 · correct 174 · clear 91 (conflict 0, contradicted 1, unsupported 90).

DO $migration$
DECLARE
  v_expected constant int := 710;
  v_updated int;
BEGIN
  update public.usau_event_teams et
     set final_placement = v.new_place
    from (values
      -- COLLEGE_D1 · 2016 · Hudson Valley D-1 College Men's CC 2016 (hudson-valley-d-1-college-mens-cc-2016) · ended 2016-04-17
      ('3306e7f7-a8ec-46d2-a3ff-9bb7ac6a199f'::uuid, '14a5f94b-3368-4d99-894d-6eb9796dcd07'::uuid, null::int, 1::int),
      ('3306e7f7-a8ec-46d2-a3ff-9bb7ac6a199f', '86765500-b191-4446-8da3-d915585798b3', null, 2),
      ('3306e7f7-a8ec-46d2-a3ff-9bb7ac6a199f', '455ae298-80cb-4a7d-9d56-5024f45d95f6', null, 3),
      ('3306e7f7-a8ec-46d2-a3ff-9bb7ac6a199f', '56740125-1c8c-4d94-8814-0bb1dcf267b7', null, 3),
      ('3306e7f7-a8ec-46d2-a3ff-9bb7ac6a199f', '92058380-7ec8-48ba-bcc2-935824049865', null, 5),
      ('3306e7f7-a8ec-46d2-a3ff-9bb7ac6a199f', 'dfa169b6-2951-4d49-9818-f409f7806928', null, 6),
      -- COLLEGE_D1 · 2016 · Illinois D-I College Men's CC 2016 (illinois-d-i-college-mens-cc-2016) · ended 2016-04-17
      ('f7c9a6fd-17d9-46a6-821a-58e5e0f9e392', 'fea25fda-02df-44b4-b0db-728e2c49f62b', null, 1),
      ('f7c9a6fd-17d9-46a6-821a-58e5e0f9e392', '067894f9-2543-4bc8-b73a-96d567a12285', null, 2),
      ('f7c9a6fd-17d9-46a6-821a-58e5e0f9e392', '9f4e358b-ccb2-44f5-ac43-3c43823a8132', null, 3),
      ('f7c9a6fd-17d9-46a6-821a-58e5e0f9e392', 'a5082783-069f-45de-9de5-9cc8d79e5f78', null, 4),
      ('f7c9a6fd-17d9-46a6-821a-58e5e0f9e392', 'b5e5b713-5f4b-44cc-b31d-111ba02882e4', null, 5),
      ('f7c9a6fd-17d9-46a6-821a-58e5e0f9e392', '4ba31a51-f82f-401c-aa82-ce9f88d81076', null, 6),
      ('f7c9a6fd-17d9-46a6-821a-58e5e0f9e392', '41e83c9d-17fb-4939-b770-269a86433e8f', null, 7),
      ('f7c9a6fd-17d9-46a6-821a-58e5e0f9e392', '210cb4f8-87d1-4bf4-ae48-86431ed5f3cf', null, 8),
      ('f7c9a6fd-17d9-46a6-821a-58e5e0f9e392', 'fc595a32-3913-45c8-8bac-2839715afdb3', null, 9),
      ('f7c9a6fd-17d9-46a6-821a-58e5e0f9e392', 'f61e89e2-5903-4ee5-9980-7e27e096b7f8', null, 10),
      ('f7c9a6fd-17d9-46a6-821a-58e5e0f9e392', '530cc78d-0b67-441c-8271-9bdcef0e3cb5', null, 11),
      ('f7c9a6fd-17d9-46a6-821a-58e5e0f9e392', '44ddfbfa-0d24-470f-8f91-2d7accf7cd07', null, 12),
      -- COLLEGE_D1 · 2016 · Illinois D-I College Women's CC 2016 (illinois-d-i-college-womens-cc-2016) · ended 2016-04-17
      ('72f58f9e-9f9b-486a-8363-267d830af61a', 'cf93a5fc-c469-4bfe-a1bd-e37944724d9e', null, 1),
      ('72f58f9e-9f9b-486a-8363-267d830af61a', '1e78420c-e596-4855-a4d4-3ab9ebff766b', null, 2),
      ('72f58f9e-9f9b-486a-8363-267d830af61a', '9017fe16-e6d1-4463-9a7b-e46c48b0390b', null, 3),
      ('72f58f9e-9f9b-486a-8363-267d830af61a', '00bb9223-ccbb-4251-b955-5e5f2b279d9f', null, 4),
      ('72f58f9e-9f9b-486a-8363-267d830af61a', '1e715f2f-fc03-422d-8cb3-2c3e0a64dcab', null, 5),
      ('72f58f9e-9f9b-486a-8363-267d830af61a', 'ceeee77b-a454-4b4e-ac3c-5bda30649266', null, 6),
      ('72f58f9e-9f9b-486a-8363-267d830af61a', '8728a07f-9e5e-4439-99a7-3ae21d21196f', null, 7),
      ('72f58f9e-9f9b-486a-8363-267d830af61a', '1a7f8f2a-fe91-47e3-9e8c-e5ac10087ad7', null, 8),
      -- COLLEGE_D1 · 2016 · Lake Superior D-I College Men's CC 2016 (lake-superior-d-i-college-mens-cc-2016) · ended 2016-04-17
      ('d27bbdfd-c8b4-4822-ae19-2e999c9f08e6', '09ff2aac-b7ce-48ce-a294-85f3d00a0c10', null, 3),
      ('d27bbdfd-c8b4-4822-ae19-2e999c9f08e6', '35306b96-0f1e-48d0-b8e7-dfa99c080969', null, 4),
      ('d27bbdfd-c8b4-4822-ae19-2e999c9f08e6', '8dc856b1-6e48-4781-8162-376ed3dff014', null, 5),
      ('d27bbdfd-c8b4-4822-ae19-2e999c9f08e6', '363fef81-aabe-4182-a7fd-ad622999b6fc', null, 6),
      ('d27bbdfd-c8b4-4822-ae19-2e999c9f08e6', '724f0994-b7a7-4bf4-936a-65061cd6f0fd', null, 7),
      ('d27bbdfd-c8b4-4822-ae19-2e999c9f08e6', '12aafe21-4d3c-45ec-b8a8-6d4edde42c11', null, 8),
      -- COLLEGE_D1 · 2016 · Lake Superior D-I College Women's CC 2016 (lake-superior-d-i-college-womens-cc-2016) · ended 2016-04-17
      ('b697b9b5-cba6-405a-8f6c-eeee37b9fbfc', '12b3d917-05cf-40ac-b00a-6a97342f590e', null, 1),
      ('b697b9b5-cba6-405a-8f6c-eeee37b9fbfc', '0d2dca5e-dd65-44fb-9eaa-4f6573e663af', null, 2),
      ('b697b9b5-cba6-405a-8f6c-eeee37b9fbfc', '23de88bd-be9f-4c1a-966f-be43776e279e', null, 3),
      ('b697b9b5-cba6-405a-8f6c-eeee37b9fbfc', 'd3790f8f-3902-487b-b8eb-d797b136dd4a', null, 7),
      ('b697b9b5-cba6-405a-8f6c-eeee37b9fbfc', '376c8776-a28c-4cd7-b893-a8c9e9896585', null, 8),
      -- COLLEGE_D1 · 2016 · Metro Boston D-I College Men's CC 2016 (metro-boston-d-i-college-mens-cc-2016) · ended 2016-04-17
      ('a7f51925-3e96-4903-8439-c1e1b5f49b03', '6ee3b033-238a-4291-94aa-1c0c973fe319', null, 1),
      ('a7f51925-3e96-4903-8439-c1e1b5f49b03', '97fd8851-e6dd-4f94-ae2a-eeb7b0942477', null, 2),
      ('a7f51925-3e96-4903-8439-c1e1b5f49b03', '4768eda1-878a-4e34-b1de-27b255e836d3', null, 3),
      ('a7f51925-3e96-4903-8439-c1e1b5f49b03', 'a81583fe-fdd7-4ee4-921d-5a02bc4939f4', null, 4),
      ('a7f51925-3e96-4903-8439-c1e1b5f49b03', 'ddf2258e-43d8-417b-93af-d77e0486cd41', null, 5),
      ('a7f51925-3e96-4903-8439-c1e1b5f49b03', '37957d16-5d4f-4fb6-a0a7-60a259bca2ec', null, 6),
      ('a7f51925-3e96-4903-8439-c1e1b5f49b03', 'f98dd83f-4b84-46d6-b643-49843df291be', null, 7),
      ('a7f51925-3e96-4903-8439-c1e1b5f49b03', '18502410-8460-49d9-b63e-fdc463d85efe', null, 8),
      -- COLLEGE_D1 · 2016 · Metro Boston D-I College Women's CC 2016 (metro-boston-d-i-college-womens-cc-2016) · ended 2016-04-17
      ('26758715-9abf-40be-8105-42b22519b46b', 'cb526252-a42a-457b-8a89-3dc88648050e', null, 1),
      ('26758715-9abf-40be-8105-42b22519b46b', '432832e8-b413-4fd7-89af-a75343142198', null, 2),
      ('26758715-9abf-40be-8105-42b22519b46b', '18fef0e0-4a63-4d16-b589-dd06cccc6985', null, 3),
      ('26758715-9abf-40be-8105-42b22519b46b', 'e34a5f71-6d21-417d-b213-63ce7fcb1d62', null, 4),
      ('26758715-9abf-40be-8105-42b22519b46b', 'd8fcbc02-58e5-457e-ae22-6a597c6f6699', null, 5),
      ('26758715-9abf-40be-8105-42b22519b46b', 'b098d6bd-a604-4d0b-8dab-5dd9800f9c7c', null, 6),
      -- COLLEGE_D1 · 2016 · Metro East Dev College Men's CC 2016 (metro-east-dev-college-mens-cc-2016) · ended 2016-04-17
      ('65a9a0e7-6902-4187-8016-c6813296a7fe', '52a2029e-ca6d-4df7-a83c-f8798a19a13d', null, 1),
      ('65a9a0e7-6902-4187-8016-c6813296a7fe', '8ef00f01-33fb-4b87-aab9-dd717b6acbab', null, 2),
      ('65a9a0e7-6902-4187-8016-c6813296a7fe', '74c23b31-1ceb-4e79-b158-27b4d49afbd5', null, 3),
      ('65a9a0e7-6902-4187-8016-c6813296a7fe', '26436f50-abd6-4bc6-acc6-0dcbff15461a', null, 4),
      ('65a9a0e7-6902-4187-8016-c6813296a7fe', 'e311f39e-3ea6-47b0-aadd-90f7f29a1289', null, 7),
      ('65a9a0e7-6902-4187-8016-c6813296a7fe', 'faceacd1-46d2-45ab-b8a5-cf513b3a4208', null, 8),
      -- COLLEGE_D1 · 2016 · Metro NY D-I College Men's CC 2016 (metro-ny-d-i-college-mens-cc-2016) · ended 2016-04-17
      ('8aedcf48-36ee-47cb-a254-6551a3d0a8ef', 'f12b4b0c-34b8-4357-9c8e-002dfe082ce3', null, 1),
      ('8aedcf48-36ee-47cb-a254-6551a3d0a8ef', '4958ee69-584b-4c8a-832e-0743613c9519', null, 2),
      ('8aedcf48-36ee-47cb-a254-6551a3d0a8ef', '0ce94a63-a5c2-416b-bd5d-baabb4157c15', null, 6),
      ('8aedcf48-36ee-47cb-a254-6551a3d0a8ef', '591435e5-b4db-4b52-afa2-7828466b2583', null, 7),
      -- COLLEGE_D1 · 2016 · Michigan D-I College Men's CC 2016 (michigan-d-i-college-mens-cc-2016) · ended 2016-04-17
      ('d4809abf-3f18-444d-9333-6b82e9e1353b', '319213a6-feb8-4e0c-ac1e-48cbf3c5fedd', null, 1),
      ('d4809abf-3f18-444d-9333-6b82e9e1353b', 'a21128bb-26aa-4ef8-b3b0-4da6ffdd3c13', null, 2),
      ('d4809abf-3f18-444d-9333-6b82e9e1353b', 'd15e524a-6622-4468-897b-4d814bf8e9ef', null, 3),
      -- COLLEGE_D1 · 2016 · NorCal D-I College Men's CC 2016 (norcal-d-i-college-mens-cc-2016) · ended 2016-04-17
      ('815906be-cf35-4841-ba15-8df25742f3d0', '219616d4-c5b0-4851-bb4d-424303995436', null, 1),
      ('815906be-cf35-4841-ba15-8df25742f3d0', '81dd6874-8ae3-4163-ac97-23b366fca820', null, 2),
      ('815906be-cf35-4841-ba15-8df25742f3d0', '17765b4f-7165-4a57-bc66-d6d17b78734f', null, 3),
      ('815906be-cf35-4841-ba15-8df25742f3d0', 'fda64bb7-60e3-41ab-bc6c-dc855645754d', null, 4),
      -- COLLEGE_D1 · 2016 · NorCal D-I College Women's CC 2016 (norcal-d-i-college-womens-cc-2016) · ended 2016-04-17
      ('f405b7cc-dd6f-408d-9aad-d2ac837fd5e3', 'f5cf9cb6-b7f6-4eaa-a179-19d09ff4fec4', null, 1),
      ('f405b7cc-dd6f-408d-9aad-d2ac837fd5e3', '8faf6dcd-12b3-476d-bbd6-f4a465ef09d9', null, 2),
      ('f405b7cc-dd6f-408d-9aad-d2ac837fd5e3', '9513d4c0-0aa2-49ca-92c0-3039991943fb', null, 3),
      ('f405b7cc-dd6f-408d-9aad-d2ac837fd5e3', '7ba944bf-6453-428a-a2c4-97073bbe82ed', null, 4),
      -- COLLEGE_D1 · 2016 · North Texas D-I College Men's CC 2016 (north-texas-d-i-college-mens-cc-2016) · ended 2016-04-17
      ('46a0096c-2364-46fc-ad0b-415a6856812d', 'fcd922ae-8e9b-41cd-b887-e2a876f93a62', null, 1),
      ('46a0096c-2364-46fc-ad0b-415a6856812d', 'ce0c5869-ffdb-48e8-84f5-860e95e28f06', null, 2),
      ('46a0096c-2364-46fc-ad0b-415a6856812d', 'be79bc02-bd1e-4bf7-a97a-28376d41a1d3', null, 3),
      ('46a0096c-2364-46fc-ad0b-415a6856812d', 'e81ae68c-c77c-4894-9c32-882877f067d0', null, 4),
      ('46a0096c-2364-46fc-ad0b-415a6856812d', '297be821-9ae1-48e3-b4ef-233b255ab73e', null, 5),
      ('46a0096c-2364-46fc-ad0b-415a6856812d', '0d6a2e2e-1be6-43bc-9956-4c8b831a9e23', null, 6),
      ('46a0096c-2364-46fc-ad0b-415a6856812d', 'd4f6e29f-8a0b-47ec-b197-fc4cab47ef13', null, 7),
      ('46a0096c-2364-46fc-ad0b-415a6856812d', '9850adeb-7a51-4a62-a1f4-cadcd0989c98', null, 8),
      -- COLLEGE_D1 · 2016 · Northwoods D-I College Men's CC 2016 (northwoods-d-i-college-mens-cc-2016) · ended 2016-04-17
      ('2fb2dc0e-a7a1-4992-b189-d4d2c876f8bb', 'fd22460e-4978-4424-a3cb-e0dfc2b7fd3e', null, 1),
      ('2fb2dc0e-a7a1-4992-b189-d4d2c876f8bb', '5f655987-d021-416c-bee9-c7042cdcf3a7', null, 2),
      ('2fb2dc0e-a7a1-4992-b189-d4d2c876f8bb', '9ca97cb9-f9ed-4939-8b1f-6df36b8d6443', null, 3),
      ('2fb2dc0e-a7a1-4992-b189-d4d2c876f8bb', '71c81982-37d1-49d4-b8c0-1da95f170783', null, 4),
      ('2fb2dc0e-a7a1-4992-b189-d4d2c876f8bb', '3c686611-9241-40f2-b3ad-8a0238038d4b', null, 5),
      ('2fb2dc0e-a7a1-4992-b189-d4d2c876f8bb', '7a4533be-1464-4783-a5ee-c9a3b02498a4', null, 6),
      ('2fb2dc0e-a7a1-4992-b189-d4d2c876f8bb', '32132b5f-092a-4e64-ab38-94dd4891e9ca', null, 7),
      ('2fb2dc0e-a7a1-4992-b189-d4d2c876f8bb', '5803e7fb-1418-4d8c-8806-41d2dba3aee1', null, 8),
      -- COLLEGE_D1 · 2016 · Ohio D-I College Men's CC 2016 (ohio-d-i-college-mens-cc-2016) · ended 2016-04-17
      ('a5e9f447-4744-4d2c-ae65-035933ae1934', '333c7a3b-f4ca-4aa1-b637-abce0fb77f76', null, 1),
      ('a5e9f447-4744-4d2c-ae65-035933ae1934', 'a111325c-f8ae-4102-9931-b07a4fa3b9e0', null, 2),
      ('a5e9f447-4744-4d2c-ae65-035933ae1934', '0f4d2a36-12c8-4909-b5d2-af37ab589c28', null, 3),
      ('a5e9f447-4744-4d2c-ae65-035933ae1934', '576960bb-cd4e-4221-80c1-d94856beb5d1', null, 4),
      ('a5e9f447-4744-4d2c-ae65-035933ae1934', '36b8e841-ef3f-4b2f-8817-0d52b800e32d', null, 5),
      ('a5e9f447-4744-4d2c-ae65-035933ae1934', 'a30040b4-74f9-4b5e-8b29-6cfae75dd9ce', null, 6),
      ('a5e9f447-4744-4d2c-ae65-035933ae1934', 'fb54eaad-4e28-4ec1-afc3-37a92847c965', null, 7),
      ('a5e9f447-4744-4d2c-ae65-035933ae1934', 'eefa6b20-42c6-45f7-99d1-68815dd7ffe6', null, 8),
      ('a5e9f447-4744-4d2c-ae65-035933ae1934', '880c57a6-bb5d-4e4c-8ab5-5fa9612cca8e', null, 9),
      ('a5e9f447-4744-4d2c-ae65-035933ae1934', 'f94b8cf9-8f88-4cec-83b0-cd0a08bd0d2a', null, 10),
      ('a5e9f447-4744-4d2c-ae65-035933ae1934', '92b0aeb8-a7f8-47e4-a33d-5701b816b105', null, 11),
      ('a5e9f447-4744-4d2c-ae65-035933ae1934', 'cc9c05fd-fa89-4316-9c1e-1a4c58599f8c', null, 12),
      -- COLLEGE_D1 · 2016 · Ohio D-I College Women's CC 2016 (ohio-d-i-college-womens-cc-2016) · ended 2016-04-17
      ('af66f6ff-04b1-409a-a185-47f7ed2dbaa6', 'd8e6fc90-0d94-4a5b-b61b-f08540342349', null, 1),
      ('af66f6ff-04b1-409a-a185-47f7ed2dbaa6', '5dba28ce-c2c0-4c60-a1a4-e984c0fcb5c0', null, 2),
      ('af66f6ff-04b1-409a-a185-47f7ed2dbaa6', 'a2eff8e0-da4c-41e2-9487-32dd8c24ca25', null, 3),
      ('af66f6ff-04b1-409a-a185-47f7ed2dbaa6', 'f1a4ef09-51b0-4c61-bf3c-f78955cdc048', null, 4),
      ('af66f6ff-04b1-409a-a185-47f7ed2dbaa6', '3125b59e-0714-42e7-89ea-6c457d06411e', null, 5),
      ('af66f6ff-04b1-409a-a185-47f7ed2dbaa6', 'b14ae3fe-1bb9-4b5e-bb38-b102c65e37a6', null, 6),
      ('af66f6ff-04b1-409a-a185-47f7ed2dbaa6', '81112fcf-04fe-4544-bd36-b3adfdbc2991', null, 7),
      ('af66f6ff-04b1-409a-a185-47f7ed2dbaa6', '29c3bbd1-06db-4f74-9602-91c741d88e69', null, 8),
      -- COLLEGE_D1 · 2016 · Ozarks D-I College Men's CC 2016 (ozarks-d-i-college-mens-cc-2016) · ended 2016-04-17
      ('c8482990-e5ed-4520-9a1a-1d1927f000de', 'ecedf8a5-3146-46e5-8238-c37456eb202d', null, 1),
      ('c8482990-e5ed-4520-9a1a-1d1927f000de', 'f6557709-4a9c-4559-b3c7-7a39a2113b43', null, 2),
      ('c8482990-e5ed-4520-9a1a-1d1927f000de', '5642020e-575f-4dc5-ac5d-5752b351cd89', null, 3),
      ('c8482990-e5ed-4520-9a1a-1d1927f000de', 'ff0082f4-f2dc-492d-8dff-b773dbdc0a34', null, 4),
      ('c8482990-e5ed-4520-9a1a-1d1927f000de', '3e773f71-7707-48eb-b541-66d2459e74c5', null, 5),
      ('c8482990-e5ed-4520-9a1a-1d1927f000de', 'f5d7e58c-c2df-43ec-a463-c2ae72d01c62', null, 6),
      ('c8482990-e5ed-4520-9a1a-1d1927f000de', 'f3cdb465-6a52-4f32-bab2-39f4e68237c5', null, 7),
      ('c8482990-e5ed-4520-9a1a-1d1927f000de', 'bc6c0b58-2812-41ee-b74a-86a27e123b6f', null, 8),
      ('c8482990-e5ed-4520-9a1a-1d1927f000de', '87daee3a-97a9-418e-8d57-971413aad53e', null, 9),
      ('c8482990-e5ed-4520-9a1a-1d1927f000de', '93b93b51-1b4a-4dfd-8d48-6c05f3d2e2b7', null, 10),
      -- COLLEGE_D1 · 2016 · Ozarks D-I College Women's CC 2016 (ozarks-d-i-college-womens-cc-2016) · ended 2016-04-17
      ('d530b666-f810-47e5-a95d-ee12a19adb77', '47c35c58-356d-4d6b-96f7-29f0d3bbc2d2', null, 1),
      ('d530b666-f810-47e5-a95d-ee12a19adb77', 'b7a35851-cfc8-4202-90ae-84199bb66ebf', null, 2),
      ('d530b666-f810-47e5-a95d-ee12a19adb77', '15877a46-0c4a-48e6-9b9b-2d35ee0a41c7', null, 3),
      ('d530b666-f810-47e5-a95d-ee12a19adb77', 'b548fc80-9897-46a6-821b-41637979dc0b', null, 4),
      ('d530b666-f810-47e5-a95d-ee12a19adb77', '38e1a55c-b558-4ef5-96c7-8bf1afaf1441', null, 5),
      ('d530b666-f810-47e5-a95d-ee12a19adb77', 'f4707060-1def-430e-9691-fdacc3a00c64', null, 6),
      ('d530b666-f810-47e5-a95d-ee12a19adb77', '4ab4e154-fd43-4bd5-8ee8-7fbf230586d2', null, 7),
      ('d530b666-f810-47e5-a95d-ee12a19adb77', 'fe0c1dee-3279-4234-9aaa-c2bc5befdca0', null, 8),
      -- COLLEGE_D1 · 2016 · Pennsylvania D-I College Women's CC 2016 (pennsylvania-d-i-college-womens-cc-2016) · ended 2016-04-17
      ('afaa5856-02ce-4a52-b676-4ee075c5632b', 'c925fed9-06c5-4280-a758-a70e0e2b3c03', null, 1),
      ('afaa5856-02ce-4a52-b676-4ee075c5632b', '0ebd01d4-6467-403a-a65b-b80b3a5fd39d', null, 2),
      ('afaa5856-02ce-4a52-b676-4ee075c5632b', 'e519c9ca-ac11-40cc-ad24-855038810cd7', null, 3),
      ('afaa5856-02ce-4a52-b676-4ee075c5632b', 'a8b1eece-8b8b-4bab-810e-63c005ffae0d', null, 4),
      ('afaa5856-02ce-4a52-b676-4ee075c5632b', '1c4ca790-c638-4925-a65a-92475c254c0d', null, 5),
      ('afaa5856-02ce-4a52-b676-4ee075c5632b', 'be26c180-8e5d-4bc9-bb3f-7002bec9c198', null, 6),
      ('afaa5856-02ce-4a52-b676-4ee075c5632b', '43c26e21-1483-47ba-8e29-748bf5eae738', null, 7),
      ('afaa5856-02ce-4a52-b676-4ee075c5632b', 'd0354491-049e-4913-9cd9-01a1552deb72', null, 8),
      -- COLLEGE_D1 · 2016 · South Texas D-I College Men's CC 2016 (south-texas-d-i-college-mens-cc-2016) · ended 2016-04-17
      ('eac190bf-808e-4ee8-a681-5c01b9ea6097', '77254423-2615-4945-89d5-675fe26db330', null, 1),
      ('eac190bf-808e-4ee8-a681-5c01b9ea6097', '4aa648d7-9897-4d8a-a3b2-f2a0dfd9c2c1', null, 2),
      ('eac190bf-808e-4ee8-a681-5c01b9ea6097', 'a04e1bec-1e24-420f-a77b-2799897e977b', null, 3),
      ('eac190bf-808e-4ee8-a681-5c01b9ea6097', 'dce35bbd-f3ac-40e1-996c-85f3ba0ef9f0', null, 4),
      ('eac190bf-808e-4ee8-a681-5c01b9ea6097', '20b49f58-48d7-40c9-9e8d-7e9bccb93358', null, 5),
      ('eac190bf-808e-4ee8-a681-5c01b9ea6097', '68b9b77a-fe2c-4b40-8e6a-196727bb1f05', null, 6),
      ('eac190bf-808e-4ee8-a681-5c01b9ea6097', 'd68b66b5-8146-4db4-8b17-ce8c7bd0a3a1', null, 7),
      ('eac190bf-808e-4ee8-a681-5c01b9ea6097', 'fadf806a-fb23-4a40-8337-43f55567a993', null, 7),
      ('eac190bf-808e-4ee8-a681-5c01b9ea6097', 'd986346d-d1f1-4f8b-a6c0-38dcece56a12', null, 9),
      ('eac190bf-808e-4ee8-a681-5c01b9ea6097', 'ff9c8911-811e-40a5-a777-6010d20b2513', null, 10),
      -- COLLEGE_D1 · 2016 · Southern Appalachian D-I College Men's CC 2016 (southern-appalachian-d-i-college-mens-cc-2016) · ended 2016-04-17
      ('cce7a564-816e-4c5a-87ee-3a7819a934bb', 'a0f11051-71d4-47a6-9af7-06745f25f2e4', null, 1),
      ('cce7a564-816e-4c5a-87ee-3a7819a934bb', 'db693fb2-c484-415c-ab4e-11c54c321fc4', null, 2),
      ('cce7a564-816e-4c5a-87ee-3a7819a934bb', '37218d45-49d2-46a0-9273-dac226983ca4', null, 3),
      ('cce7a564-816e-4c5a-87ee-3a7819a934bb', '7e29c5fb-2cfd-45fd-a27c-ca084c5f8410', null, 3),
      ('cce7a564-816e-4c5a-87ee-3a7819a934bb', 'aa9c742d-a6bc-49c7-9417-6eaddaf64b14', null, 5),
      ('cce7a564-816e-4c5a-87ee-3a7819a934bb', '038c0f7f-a6e3-4719-9301-54100c1ac042', null, 6),
      ('cce7a564-816e-4c5a-87ee-3a7819a934bb', 'e1731d92-dc29-45d0-a2c3-f1d3a11fe5c7', null, 7),
      ('cce7a564-816e-4c5a-87ee-3a7819a934bb', '6f3664e3-725b-4f94-b0a1-9d515aa915e1', null, 8),
      -- COLLEGE_D1 · 2016 · Southern Appalachian D-I College Women's CC 2016 (southern-appalachian-d-i-college-womens-cc-2016) · ended 2016-04-17
      ('64401175-2554-47dd-89eb-b70775071646', '914bbbcd-c5a0-450d-96ce-5be483c25eea', null, 1),
      ('64401175-2554-47dd-89eb-b70775071646', '4aca98b2-1bfb-42e8-8e45-48bc3059c786', null, 2),
      ('64401175-2554-47dd-89eb-b70775071646', '8e295e58-b1a2-43d1-9901-009c97b54061', null, 3),
      ('64401175-2554-47dd-89eb-b70775071646', 'ee4689ea-974e-4794-82e9-506216a1b3bf', null, 4),
      ('64401175-2554-47dd-89eb-b70775071646', 'bbeb7cc2-93e6-4a84-bb7f-e8a9d1007df6', null, 5),
      ('64401175-2554-47dd-89eb-b70775071646', 'ec75f17d-f8e6-4efd-b11c-58666fdf3f51', null, 7),
      ('64401175-2554-47dd-89eb-b70775071646', 'accc8d6b-cd8c-4b75-b0d0-08a699916b40', null, 8),
      -- COLLEGE_D1 · 2016 · Virginia D-I College Men's CC 2016 (virginia-d-i-college-mens-cc-2016) · ended 2016-04-17
      ('a84e05d5-2202-432b-80b7-dec99593f782', '03f22ddb-169e-4699-8025-8c0146115347', null, 1),
      ('a84e05d5-2202-432b-80b7-dec99593f782', '04a0d2df-a7ae-4e1d-a76f-9fb7041fd738', null, 2),
      -- COLLEGE_D1 · 2016 · Virginia D-I College Women's CC 2016 (virginia-d-i-college-womens-cc-2016) · ended 2016-04-17
      ('ed4ce944-c188-4cfd-be6d-c567b1d149ae', '0ae97aba-c471-40fd-9896-0e258e889f1a', null, 1),
      ('ed4ce944-c188-4cfd-be6d-c567b1d149ae', '08cd22f0-d359-4603-9f74-50668c551a8a', null, 2),
      ('ed4ce944-c188-4cfd-be6d-c567b1d149ae', 'c0eacb11-b3be-4b4a-b751-d6abf92f1a74', null, 4),
      ('ed4ce944-c188-4cfd-be6d-c567b1d149ae', 'e9f3257e-291d-44e4-aba4-7a983f8a7a44', null, 5),
      ('ed4ce944-c188-4cfd-be6d-c567b1d149ae', '77e39316-5715-417a-abaf-d1e904519e75', null, 6),
      ('ed4ce944-c188-4cfd-be6d-c567b1d149ae', '2e3f6f68-ded7-4e3a-babf-c742522eb673', null, 7),
      -- COLLEGE_D1 · 2016 · Virginia Dev College Men's CC 2016 (virginia-dev-college-mens-cc-2016) · ended 2016-04-17
      ('9df8ebd9-7b31-4bca-b13e-d0a156b64159', 'a854911a-835d-41de-9e69-9c22adfd9d20', null, 1),
      ('9df8ebd9-7b31-4bca-b13e-d0a156b64159', '03d3f21e-670f-49a7-bbca-adc1d7a44d4d', null, 2),
      ('9df8ebd9-7b31-4bca-b13e-d0a156b64159', '926024e0-e07e-45ad-9529-eccf8a9de777', null, 3),
      ('9df8ebd9-7b31-4bca-b13e-d0a156b64159', '963e0eda-ce6d-460f-984c-961152ca51d5', null, 4),
      ('9df8ebd9-7b31-4bca-b13e-d0a156b64159', '66739ff0-9f8f-4d44-9709-a00fb719a464', null, 5),
      ('9df8ebd9-7b31-4bca-b13e-d0a156b64159', '93f60916-4e77-4977-89d5-5bb7e84b970e', null, 5),
      -- COLLEGE_D1 · 2016 · West Penn D-I College Men's CC 2016 (west-penn-d-i-college-mens-cc-2016) · ended 2016-04-17
      ('a7e3cbda-2d9a-45ad-add2-2713ed3d851a', '87e6b872-b4bb-4ddc-9006-dbcc68850e78', null, 1),
      ('a7e3cbda-2d9a-45ad-add2-2713ed3d851a', '02b3d6d0-af53-4af0-8dbd-62f5d9609815', null, 2),
      ('a7e3cbda-2d9a-45ad-add2-2713ed3d851a', '65087c27-d71a-4f56-a690-cd02cb705e9c', null, 4),
      ('a7e3cbda-2d9a-45ad-add2-2713ed3d851a', '45832a61-7eff-4628-a81d-59fd1f7f3647', null, 5),
      ('a7e3cbda-2d9a-45ad-add2-2713ed3d851a', 'ceb5951d-d280-4c58-b36a-51f4044acb90', null, 6),
      -- COLLEGE_D1 · 2016 · West Plains D-I College Men's CC 2016 (west-plains-d-i-college-mens-cc-2016) · ended 2016-04-17
      ('cd115722-2cdd-4e8c-9059-4276e4135f64', '164864a4-5a0c-4edd-95e5-45c102e9d5b5', null, 1),
      ('cd115722-2cdd-4e8c-9059-4276e4135f64', '2a317f91-c71f-4e87-966b-0561dcfaa13d', null, 2),
      ('cd115722-2cdd-4e8c-9059-4276e4135f64', '52223fb8-e0ac-4db7-a6c5-c7f41a07cee5', null, 3),
      ('cd115722-2cdd-4e8c-9059-4276e4135f64', '94241324-09d1-47ab-ab35-7bf439241d53', null, 4),
      ('cd115722-2cdd-4e8c-9059-4276e4135f64', '7edf630f-beaa-4e1e-9cc7-920c8b1328c4', null, 5),
      ('cd115722-2cdd-4e8c-9059-4276e4135f64', 'c2e00d2d-1974-4f4a-95f0-a97dd5984511', null, 5),
      -- COLLEGE_D1 · 2016 · Western North Central D-I College Women's CC 2016 (western-north-central-d-i-college-womens-cc-2016) · ended 2016-04-17
      ('ae1aa21e-9815-426a-927f-cb0f37b8b234', '1cbe5056-93ea-4997-8b51-55e6b6666b98', null, 1),
      ('ae1aa21e-9815-426a-927f-cb0f37b8b234', '5b35932c-3066-4723-bd30-16d88737744a', null, 2),
      ('ae1aa21e-9815-426a-927f-cb0f37b8b234', 'bddeb088-8b26-4fb8-8365-20ced639c502', null, 3),
      ('ae1aa21e-9815-426a-927f-cb0f37b8b234', '6a010ef0-6738-41d2-bb10-79735232793d', null, 4),
      ('ae1aa21e-9815-426a-927f-cb0f37b8b234', 'f9cc5a07-214d-4a55-a684-86be7474e583', null, 5),
      ('ae1aa21e-9815-426a-927f-cb0f37b8b234', 'a929c710-eb81-4c07-934b-4ec483b2607e', null, 6),
      ('ae1aa21e-9815-426a-927f-cb0f37b8b234', '8cc2c0a0-cafe-4205-a4bf-9a777619f87d', null, 7),
      ('ae1aa21e-9815-426a-927f-cb0f37b8b234', 'a0098c80-adf5-4b95-b3a4-86958eca4d5f', null, 8),
      -- COLLEGE_D1 · 2016 · Western NY D-I College Men's CC 2016 (western-ny-d-i-college-mens-cc-2016) · ended 2016-04-17
      ('1c01aa2a-5a59-4a5f-a701-581ba5e7c52a', 'a34db075-8d63-4c8a-8ff1-a369ba31efe9', null, 1),
      ('1c01aa2a-5a59-4a5f-a701-581ba5e7c52a', '1e472bde-5bb8-4358-8ed5-729fb19e0478', null, 2),
      ('1c01aa2a-5a59-4a5f-a701-581ba5e7c52a', '9e10e113-cf70-4097-9722-5fb80181a854', null, 3),
      ('1c01aa2a-5a59-4a5f-a701-581ba5e7c52a', '8dd3ce52-3b58-41e3-ba5a-b12f88911b88', null, 4),
      ('1c01aa2a-5a59-4a5f-a701-581ba5e7c52a', '8fd86352-2fcd-4030-a5ac-053ed341f12f', null, 5),
      ('1c01aa2a-5a59-4a5f-a701-581ba5e7c52a', '9ec970d1-48d2-4bec-b26b-e85526f6448f', null, 6),
      -- COLLEGE_D1 · 2016 · Western NY D-I College Women's CC 2016 (western-ny-d-i-college-womens-cc-2016) · ended 2016-04-17
      ('e2706007-9c00-41bf-855c-b7be03d30990', '8bca5d1a-951d-436c-abfd-a50da9e707d4', null, 1),
      ('e2706007-9c00-41bf-855c-b7be03d30990', 'bc0da844-7c11-412b-824a-0301de717ab3', null, 2),
      ('e2706007-9c00-41bf-855c-b7be03d30990', '86cf5220-7184-4db8-9569-59c364c14f70', null, 3),
      ('e2706007-9c00-41bf-855c-b7be03d30990', '1ebf4b5d-efd9-4af7-95e0-0aa3abf88716', null, 4),
      ('e2706007-9c00-41bf-855c-b7be03d30990', 'af891d68-187f-486b-b202-e3b36db045d6', null, 5),
      ('e2706007-9c00-41bf-855c-b7be03d30990', '4f344f67-30a7-41c9-a07a-0ce9e71e390e', null, 6),
      ('e2706007-9c00-41bf-855c-b7be03d30990', 'aff26f5e-75c0-4888-9eb4-cf2ce84133a3', null, 7),
      ('e2706007-9c00-41bf-855c-b7be03d30990', '0e7adfde-8214-4f23-86af-5c12d3a463ab', null, 8),
      -- COLLEGE_D1 · 2016 · Metro Boston Dev College Men's CC 2016 (metro-boston-dev-college-mens-cc-2016) · ended 2016-04-24
      ('08e0da00-eb27-4251-a8ee-e8e3e72fe2dc', '6d4a022c-a61b-4bdd-9cd6-dd020aa01313', null, 1),
      ('08e0da00-eb27-4251-a8ee-e8e3e72fe2dc', '036f04c0-a7f5-4afc-8049-6f36f75cd957', null, 2),
      ('08e0da00-eb27-4251-a8ee-e8e3e72fe2dc', '06d88765-2a0d-4f41-8c46-66fb3580f830', null, 3),
      ('08e0da00-eb27-4251-a8ee-e8e3e72fe2dc', 'b510160e-7620-4c49-a2cb-ac6444e1b18e', null, 4),
      ('08e0da00-eb27-4251-a8ee-e8e3e72fe2dc', '1e86bc32-27b0-49e6-9b52-debee89e9875', null, 5),
      ('08e0da00-eb27-4251-a8ee-e8e3e72fe2dc', 'f943b1f4-2e92-4fee-a4e5-aba3adc48fdd', null, 6),
      ('08e0da00-eb27-4251-a8ee-e8e3e72fe2dc', '7a757a23-0f7e-46d4-b9d3-fc7a279d3559', null, 7),
      ('08e0da00-eb27-4251-a8ee-e8e3e72fe2dc', '8634d546-422f-4c28-bcaa-a10f6ce09c8a', null, 8),
      -- COLLEGE_D1 · 2016 · Ohio Valley Dev College Men's CC 2016 (ohio-valley-dev-college-mens-cc-2016) · ended 2016-04-24
      ('6cb1102e-96dc-4f6e-9ace-e16cca45cb7f', 'a6b4e47c-78ed-45d3-97d9-0e8889913027', null, 1),
      ('6cb1102e-96dc-4f6e-9ace-e16cca45cb7f', '04b75483-9337-4e09-9c85-12f5159a4b9a', null, 2),
      ('6cb1102e-96dc-4f6e-9ace-e16cca45cb7f', '9da3c087-d8e4-46ea-8bea-2eb17c4d891d', null, 3),
      ('6cb1102e-96dc-4f6e-9ace-e16cca45cb7f', '323958eb-30d1-45c9-b610-99a0b5fd1140', null, 4),
      -- COLLEGE_D1 · 2016 · SoCal D-I College Men's CC 2016 (socal-d-i-college-mens-cc-2016) · ended 2016-04-24
      ('0c84f5a7-42fc-4e60-967e-37894c1ae75d', 'de6165a2-19b8-4d50-ac56-953188fd3f10', null, 1),
      ('0c84f5a7-42fc-4e60-967e-37894c1ae75d', '8b572419-b347-4879-acb2-751bab5f5eb3', null, 2),
      ('0c84f5a7-42fc-4e60-967e-37894c1ae75d', '3a598970-940b-4cd2-98f4-4303ea7d2e6a', null, 3),
      ('0c84f5a7-42fc-4e60-967e-37894c1ae75d', '980ad9a9-0d99-42bd-8975-98d89e45697f', null, 4),
      -- COLLEGE_D1 · 2016 · SoCal D-I College Women's CC 2016 (socal-d-i-college-womens-cc-2016) · ended 2016-04-24
      ('4a7693ff-9bcf-4a32-af18-326e6061d3e9', '53a4e7fd-782d-4e73-a53d-4ae347323e54', null, 1),
      ('4a7693ff-9bcf-4a32-af18-326e6061d3e9', '992a12ea-692f-417b-8ca5-bc87f6df589a', null, 2),
      ('4a7693ff-9bcf-4a32-af18-326e6061d3e9', 'f1b1ac5d-b020-49d7-b537-d0670068ab24', null, 3),
      ('4a7693ff-9bcf-4a32-af18-326e6061d3e9', '0e343a8b-51d9-462b-91d1-fd0752f532c5', null, 4),
      -- COLLEGE_D1 · 2016 · Atlantic Coast D-I College Women's Regionals 2016 (atlantic-coast-d-i-college-womens-regionals-2016) · ended 2016-05-01
      ('2679311d-784e-4ca6-a808-6b13c097f60f', '0ae97aba-c471-40fd-9896-0e258e889f1a', null, 1),
      ('2679311d-784e-4ca6-a808-6b13c097f60f', '26a706b5-d6c0-41c7-883b-f56ccf9af2d1', null, 2),
      ('2679311d-784e-4ca6-a808-6b13c097f60f', '15a81921-d451-4db7-9208-0c5f4e9c17af', null, 3),
      ('2679311d-784e-4ca6-a808-6b13c097f60f', '3f14bd4d-6b14-4c81-92a9-152c72ac7893', null, 3),
      ('2679311d-784e-4ca6-a808-6b13c097f60f', '4a24c4e6-df17-41bf-97ed-7c50123cffda', null, 15),
      ('2679311d-784e-4ca6-a808-6b13c097f60f', '554d84af-53a0-4aa0-aee5-3ea3bce689ac', null, 15),
      -- COLLEGE_D1 · 2016 · Atlantic Coast Dev College Men's Regionals 2016 (atlantic-coast-dev-college-mens-regionals-2016) · ended 2016-05-01
      ('de6cc47b-3773-4918-a036-96ee01dce08a', '1a495d1e-75fb-4e88-934e-e86479e9f8be', null, 1),
      ('de6cc47b-3773-4918-a036-96ee01dce08a', 'a854911a-835d-41de-9e69-9c22adfd9d20', null, 2),
      ('de6cc47b-3773-4918-a036-96ee01dce08a', '19956452-1a96-426d-ae23-bd498addb2dc', null, 3),
      ('de6cc47b-3773-4918-a036-96ee01dce08a', '4b8c1655-e29b-4840-bb8c-b3fc4aaa2872', null, 4),
      ('de6cc47b-3773-4918-a036-96ee01dce08a', '230c2df4-bf26-4f95-a2b8-ac332032603f', null, 5),
      ('de6cc47b-3773-4918-a036-96ee01dce08a', '926024e0-e07e-45ad-9529-eccf8a9de777', null, 6),
      ('de6cc47b-3773-4918-a036-96ee01dce08a', '03d3f21e-670f-49a7-bbca-adc1d7a44d4d', null, 7),
      ('de6cc47b-3773-4918-a036-96ee01dce08a', 'f5c6edef-bded-45fc-a570-ea32f87192a6', null, 8),
      -- COLLEGE_D1 · 2016 · Great Lakes D-I College Men's Regionals 2016 (great-lakes-d-i-college-mens-regionals-2016) · ended 2016-05-01
      ('ab72d599-8c14-45e3-9c20-877faffec320', '319213a6-feb8-4e0c-ac1e-48cbf3c5fedd', null, 1),
      ('ab72d599-8c14-45e3-9c20-877faffec320', '6e267be8-697d-4bf9-90e9-8801a7c1a905', null, 2),
      ('ab72d599-8c14-45e3-9c20-877faffec320', '9f4e358b-ccb2-44f5-ac43-3c43823a8132', null, 3),
      ('ab72d599-8c14-45e3-9c20-877faffec320', 'c3b28991-0e10-4a2a-bac2-8349593edb8b', null, 4),
      ('ab72d599-8c14-45e3-9c20-877faffec320', 'fea25fda-02df-44b4-b0db-728e2c49f62b', null, 5),
      ('ab72d599-8c14-45e3-9c20-877faffec320', '067894f9-2543-4bc8-b73a-96d567a12285', null, 6),
      ('ab72d599-8c14-45e3-9c20-877faffec320', 'bbb9f555-a5cc-4d31-b67b-df9359631005', null, 7),
      ('ab72d599-8c14-45e3-9c20-877faffec320', '4ba31a51-f82f-401c-aa82-ce9f88d81076', null, 8),
      ('ab72d599-8c14-45e3-9c20-877faffec320', 'a5082783-069f-45de-9de5-9cc8d79e5f78', null, 9),
      ('ab72d599-8c14-45e3-9c20-877faffec320', 'a21128bb-26aa-4ef8-b3b0-4da6ffdd3c13', null, 10),
      ('ab72d599-8c14-45e3-9c20-877faffec320', '1adaa281-4d4e-421b-96e4-5399e8e454d8', null, 11),
      ('ab72d599-8c14-45e3-9c20-877faffec320', 'b5e5b713-5f4b-44cc-b31d-111ba02882e4', null, 12),
      ('ab72d599-8c14-45e3-9c20-877faffec320', 'd15e524a-6622-4468-897b-4d814bf8e9ef', null, 13),
      ('ab72d599-8c14-45e3-9c20-877faffec320', 'c95c022c-9a07-45a4-a805-039bd58a00d9', null, 14),
      ('ab72d599-8c14-45e3-9c20-877faffec320', 'e660eef1-c24f-4505-a8cf-77b03233da37', null, 15),
      ('ab72d599-8c14-45e3-9c20-877faffec320', 'da6bc444-d890-48e7-9c12-4cb93f16f6a4', null, 16),
      -- COLLEGE_D1 · 2016 · Great Lakes D-I College Women's Regionals 2016 (great-lakes-d-i-college-womens-regionals-2016) · ended 2016-05-01
      ('d22314d0-5c24-4f59-b25d-3dd48e9eeb3d', 'cd047b40-5bcd-473f-9867-09b6c8309b5d', null, 1),
      ('d22314d0-5c24-4f59-b25d-3dd48e9eeb3d', 'cf93a5fc-c469-4bfe-a1bd-e37944724d9e', null, 2),
      ('d22314d0-5c24-4f59-b25d-3dd48e9eeb3d', '8c1dc732-f0cf-4985-8499-d5e97f1d91f8', null, 3),
      ('d22314d0-5c24-4f59-b25d-3dd48e9eeb3d', '1e78420c-e596-4855-a4d4-3ab9ebff766b', null, 4),
      ('d22314d0-5c24-4f59-b25d-3dd48e9eeb3d', '9017fe16-e6d1-4463-9a7b-e46c48b0390b', null, 5),
      ('d22314d0-5c24-4f59-b25d-3dd48e9eeb3d', 'ea852236-edb3-49f8-9808-227d73a1f08d', null, 6),
      ('d22314d0-5c24-4f59-b25d-3dd48e9eeb3d', '60dae814-9eca-43d4-a5b4-b183fae37009', null, 7),
      ('d22314d0-5c24-4f59-b25d-3dd48e9eeb3d', 'e378190f-d2d3-4e2e-b13d-693c4e76dc7a', null, 8),
      -- COLLEGE_D1 · 2016 · Northwest D-I College Men's Regionals 2016 (northwest-d-i-college-mens-regionals-2016) · ended 2016-05-01
      ('5d3aa810-789a-4094-8c22-dfc837c11a95', 'ae103189-0dcb-4ad0-ae1e-64904a1d62b3', null, 1),
      ('5d3aa810-789a-4094-8c22-dfc837c11a95', '4d8f252f-361f-4d24-9d93-c3d2523159c0', null, 2),
      ('5d3aa810-789a-4094-8c22-dfc837c11a95', 'ac776d11-d92e-43ab-8835-92a61fc1c720', null, 3),
      ('5d3aa810-789a-4094-8c22-dfc837c11a95', '88303986-5bd3-4701-88ec-2e694c8c3ccc', null, 4),
      ('5d3aa810-789a-4094-8c22-dfc837c11a95', 'b4babba8-7167-4887-94b6-706b2a9f6859', null, 7),
      ('5d3aa810-789a-4094-8c22-dfc837c11a95', 'd3d48811-297c-4fb7-ae86-4d09486c5dc2', null, 8),
      ('5d3aa810-789a-4094-8c22-dfc837c11a95', '5e6fe5be-2d4a-4064-85ae-c74d0062a243', null, 9),
      ('5d3aa810-789a-4094-8c22-dfc837c11a95', '06377247-1c41-4b48-a0d5-4e464ad82735', null, 10),
      -- COLLEGE_D1 · 2016 · Northwest D-I College Women's Regionals 2016 (northwest-d-i-college-womens-regionals-2016) · ended 2016-05-01
      ('d39a8fcb-f020-484a-943d-f0c23704fb14', '04338e0a-5237-4a24-8e31-f6ee92ff3c5c', null, 1),
      ('d39a8fcb-f020-484a-943d-f0c23704fb14', '3bd4a30d-31f5-40f2-a97a-fc62c4d40046', null, 2),
      ('d39a8fcb-f020-484a-943d-f0c23704fb14', 'fa8c3243-ca28-4f9f-bbb7-b67c37051825', null, 3),
      ('d39a8fcb-f020-484a-943d-f0c23704fb14', '2b7ab98e-56e0-4a3e-b80d-e009acb57a82', null, 4),
      ('d39a8fcb-f020-484a-943d-f0c23704fb14', '3f717a64-4e03-4162-9bc7-d80f47133a21', null, 5),
      ('d39a8fcb-f020-484a-943d-f0c23704fb14', 'b31475de-af65-4add-bffd-e24fb3a7f3a4', null, 6),
      ('d39a8fcb-f020-484a-943d-f0c23704fb14', '325d4fb9-3df6-4f98-96c9-a8ffde85227e', null, 7),
      ('d39a8fcb-f020-484a-943d-f0c23704fb14', '247c6654-abaf-473c-84e5-ca8a1ae20387', null, 8),
      -- COLLEGE_D1 · 2016 · Ohio Valley D-I College Men's Regionals 2016 (ohio-valley-d-i-college-mens-regionals-2016) · ended 2016-05-01
      ('103db8c9-b854-4f41-9a11-af74e8151e4a', '333c7a3b-f4ca-4aa1-b637-abce0fb77f76', null, 1),
      ('103db8c9-b854-4f41-9a11-af74e8151e4a', '87e6b872-b4bb-4ddc-9006-dbcc68850e78', null, 2),
      ('103db8c9-b854-4f41-9a11-af74e8151e4a', '02b3d6d0-af53-4af0-8dbd-62f5d9609815', null, 3),
      ('103db8c9-b854-4f41-9a11-af74e8151e4a', 'ff217970-b72e-469f-83e4-b66ffd286cab', null, 4),
      ('103db8c9-b854-4f41-9a11-af74e8151e4a', '36b8e841-ef3f-4b2f-8817-0d52b800e32d', null, 9),
      ('103db8c9-b854-4f41-9a11-af74e8151e4a', 'a6b4e47c-78ed-45d3-97d9-0e8889913027', null, 10),
      ('103db8c9-b854-4f41-9a11-af74e8151e4a', '12fcd557-3b3f-463f-9462-0a913c829062', null, 11),
      ('103db8c9-b854-4f41-9a11-af74e8151e4a', 'd6d16ea0-81a9-4c63-be29-b45c1da5affb', null, 12),
      ('103db8c9-b854-4f41-9a11-af74e8151e4a', '65087c27-d71a-4f56-a690-cd02cb705e9c', null, 13),
      ('103db8c9-b854-4f41-9a11-af74e8151e4a', '9027c860-9b2a-4fba-82a2-6c537f97d365', null, 14),
      ('103db8c9-b854-4f41-9a11-af74e8151e4a', 'a30040b4-74f9-4b5e-8b29-6cfae75dd9ce', null, 15),
      ('103db8c9-b854-4f41-9a11-af74e8151e4a', '7015be2d-1381-48d1-bd71-0e27a062c936', null, 16),
      -- COLLEGE_D1 · 2016 · Ohio Valley D-I College Women's Regionals 2016 (ohio-valley-d-i-college-womens-regionals-2016) · ended 2016-05-01
      ('72498388-2ba1-4af7-80bb-32062f201c75', 'c925fed9-06c5-4280-a758-a70e0e2b3c03', null, 1),
      ('72498388-2ba1-4af7-80bb-32062f201c75', 'd8e6fc90-0d94-4a5b-b61b-f08540342349', null, 2),
      ('72498388-2ba1-4af7-80bb-32062f201c75', 'e519c9ca-ac11-40cc-ad24-855038810cd7', null, 3),
      ('72498388-2ba1-4af7-80bb-32062f201c75', '0ebd01d4-6467-403a-a65b-b80b3a5fd39d', null, 4),
      ('72498388-2ba1-4af7-80bb-32062f201c75', 'f1a4ef09-51b0-4c61-bf3c-f78955cdc048', null, 5),
      ('72498388-2ba1-4af7-80bb-32062f201c75', '5dba28ce-c2c0-4c60-a1a4-e984c0fcb5c0', null, 6),
      ('72498388-2ba1-4af7-80bb-32062f201c75', 'a8b1eece-8b8b-4bab-810e-63c005ffae0d', null, 7),
      ('72498388-2ba1-4af7-80bb-32062f201c75', 'a2eff8e0-da4c-41e2-9487-32dd8c24ca25', null, 8),
      -- COLLEGE_D1 · 2016 · Southeast D-I College Men's Regionals 2016 (southeast-d-i-college-mens-regionals-2016) · ended 2016-05-01
      ('f2aa40ff-e1cd-4cdc-8e4d-421299261a01', 'a0f11051-71d4-47a6-9af7-06745f25f2e4', null, 1),
      ('f2aa40ff-e1cd-4cdc-8e4d-421299261a01', 'acbd82a4-7b30-485d-94b7-d6f2032e58b3', null, 2),
      ('f2aa40ff-e1cd-4cdc-8e4d-421299261a01', 'c62f502f-6da7-4399-a470-f6df8be4e3df', null, 3),
      ('f2aa40ff-e1cd-4cdc-8e4d-421299261a01', '79b19d53-8707-41b2-9246-aa9dff0e793d', null, 4),
      ('f2aa40ff-e1cd-4cdc-8e4d-421299261a01', '0f651d40-0258-4cb3-aefa-9806122ed10c', null, 5),
      ('f2aa40ff-e1cd-4cdc-8e4d-421299261a01', '038c0f7f-a6e3-4719-9301-54100c1ac042', null, 15),
      ('f2aa40ff-e1cd-4cdc-8e4d-421299261a01', '5e18df98-bf0f-4256-bf11-82003673873f', null, 15),
      -- COLLEGE_D1 · 2016 · Southeast D-I College Women's Regionals 2016 (southeast-d-i-college-womens-regionals-2016) · ended 2016-05-01
      ('d1594381-a7b8-4b37-a5dd-76e18080e8a4', '4dd6d382-0b87-4d60-b16d-0bf5ec462c93', null, 1),
      ('d1594381-a7b8-4b37-a5dd-76e18080e8a4', '914bbbcd-c5a0-450d-96ce-5be483c25eea', null, 2),
      ('d1594381-a7b8-4b37-a5dd-76e18080e8a4', '4cac394f-f82b-4f4e-9d56-58bad6bf890c', null, 3),
      ('d1594381-a7b8-4b37-a5dd-76e18080e8a4', 'fc7cf475-bbe6-41b7-9beb-329a5515e167', null, 4),
      ('d1594381-a7b8-4b37-a5dd-76e18080e8a4', 'c1b83414-7220-4afa-a8fc-96753c13c4e3', null, 5),
      ('d1594381-a7b8-4b37-a5dd-76e18080e8a4', '7a5f790f-1f33-47ea-a63f-77c9d4641784', null, 6),
      ('d1594381-a7b8-4b37-a5dd-76e18080e8a4', 'b8ca852e-cb26-492e-9f03-d42f7e3a33c1', null, 7),
      ('d1594381-a7b8-4b37-a5dd-76e18080e8a4', '4aca98b2-1bfb-42e8-8e45-48bc3059c786', null, 8),
      ('d1594381-a7b8-4b37-a5dd-76e18080e8a4', '8e295e58-b1a2-43d1-9901-009c97b54061', null, 9),
      ('d1594381-a7b8-4b37-a5dd-76e18080e8a4', 'ee4689ea-974e-4794-82e9-506216a1b3bf', null, 10),
      ('d1594381-a7b8-4b37-a5dd-76e18080e8a4', 'acaaa691-ca87-4541-ac10-0c8c57c75235', null, 11),
      ('d1594381-a7b8-4b37-a5dd-76e18080e8a4', '37a5394f-c386-4aa2-b11e-1605ae957df4', null, 12),
      -- COLLEGE_D1 · 2016 · Southwest D-I College Men's Regionals 2016 (southwest-d-i-college-mens-regionals-2016) · ended 2016-05-01
      ('87e7f2ef-97cb-4ec5-bd22-0ff5c6434c0d', '8b572419-b347-4879-acb2-751bab5f5eb3', null, 1),
      ('87e7f2ef-97cb-4ec5-bd22-0ff5c6434c0d', '219616d4-c5b0-4851-bb4d-424303995436', null, 2),
      ('87e7f2ef-97cb-4ec5-bd22-0ff5c6434c0d', '3a598970-940b-4cd2-98f4-4303ea7d2e6a', null, 3),
      ('87e7f2ef-97cb-4ec5-bd22-0ff5c6434c0d', 'a06b7927-a7ec-403d-ae2e-20a0dd9bde5b', null, 4),
      ('87e7f2ef-97cb-4ec5-bd22-0ff5c6434c0d', '17765b4f-7165-4a57-bc66-d6d17b78734f', null, 5),
      ('87e7f2ef-97cb-4ec5-bd22-0ff5c6434c0d', 'de6165a2-19b8-4d50-ac56-953188fd3f10', null, 6),
      ('87e7f2ef-97cb-4ec5-bd22-0ff5c6434c0d', '81dd6874-8ae3-4163-ac97-23b366fca820', null, 7),
      ('87e7f2ef-97cb-4ec5-bd22-0ff5c6434c0d', '177c50a9-3018-4aa6-b991-b484fcdb196c', null, 8),
      ('87e7f2ef-97cb-4ec5-bd22-0ff5c6434c0d', 'fda64bb7-60e3-41ab-bc6c-dc855645754d', null, 9),
      ('87e7f2ef-97cb-4ec5-bd22-0ff5c6434c0d', '9cc7a2bd-3c2b-480c-bad5-f516f2e911db', null, 10),
      ('87e7f2ef-97cb-4ec5-bd22-0ff5c6434c0d', '4add1422-7142-4016-9853-4ac1b9cee42d', null, 11),
      ('87e7f2ef-97cb-4ec5-bd22-0ff5c6434c0d', '980ad9a9-0d99-42bd-8975-98d89e45697f', null, 12),
      ('87e7f2ef-97cb-4ec5-bd22-0ff5c6434c0d', '6fb26e3c-561c-4998-86ab-8a461aa4a2f2', null, 13),
      ('87e7f2ef-97cb-4ec5-bd22-0ff5c6434c0d', '78fcc6ce-37fa-454d-90b3-479a6bf56e41', null, 14),
      ('87e7f2ef-97cb-4ec5-bd22-0ff5c6434c0d', '6447754d-0700-4d8a-aab0-c86860a77bd4', null, 15),
      ('87e7f2ef-97cb-4ec5-bd22-0ff5c6434c0d', '9fa37d52-e1be-4b83-9c8d-ed273011f51e', null, 16),
      -- COLLEGE_D1 · 2016 · D-I College Championships 2016 (usa-ultimate-d-i-college-championships-2016) · ended 2016-05-30
      ('e0f32b84-680f-4737-bd7f-fe865834700e', 'f5cf9cb6-b7f6-4eaa-a179-19d09ff4fec4', null, 1),
      ('e0f32b84-680f-4737-bd7f-fe865834700e', 'fd22460e-4978-4424-a3cb-e0dfc2b7fd3e', null, 1),
      ('e0f32b84-680f-4737-bd7f-fe865834700e', '6ee3b033-238a-4291-94aa-1c0c973fe319', null, 2),
      ('e0f32b84-680f-4737-bd7f-fe865834700e', 'fa8c3243-ca28-4f9f-bbb7-b67c37051825', null, 2),
      ('e0f32b84-680f-4737-bd7f-fe865834700e', '04338e0a-5237-4a24-8e31-f6ee92ff3c5c', null, 3),
      ('e0f32b84-680f-4737-bd7f-fe865834700e', '0ae97aba-c471-40fd-9896-0e258e889f1a', null, 3),
      ('e0f32b84-680f-4737-bd7f-fe865834700e', '8072d813-a0a9-45b9-9024-763f535dcd68', null, 3),
      ('e0f32b84-680f-4737-bd7f-fe865834700e', '87e6b872-b4bb-4ddc-9006-dbcc68850e78', null, 3),
      -- COLLEGE_D1 · 2017 · Queen City Tune Up 2017 (queen-city-tune-up-2017) · ended 2017-02-05
      ('a907fce5-9e51-494d-9697-f920ac520078', 'b5d4d286-8840-4086-91e3-13901322758a', 15, 16), -- correct
      -- COLLEGE_D1 · 2017 · 2017 Stanford Open powered by SAVAGE (2017-stanford-open-powered-by-savage) · ended 2017-02-12
      ('bb961d50-929b-4a50-b995-587eaa5a33c8', '85b13e7d-3f6e-46e0-9493-8e3c3b3376d5', 7, 8), -- correct
      ('bb961d50-929b-4a50-b995-587eaa5a33c8', '39e15a36-6f0d-4bb6-8a60-adc43abe8784', null, 31),
      ('bb961d50-929b-4a50-b995-587eaa5a33c8', '72f2fe60-add1-44b1-849b-818caf87b228', null, 31),
      -- COLLEGE_D1 · 2017 · T-Town Throwdown XIII 2017 (t-town-throwdown-xiii-2017) · ended 2017-02-12
      ('cc682ffb-c202-447f-a53f-e5f77b6db493', '1113399e-676d-4e0a-ac81-313df8467b4c', null, 16),
      -- COLLEGE_D1 · 2017 · Bring the Huckus 7 2017 (bring-the-huckus-7-2017) · ended 2017-02-26
      ('ac9863b8-5c4e-4ceb-a21a-a9cdeda62b91', '8538695c-e339-4270-819f-4e3546716308', null, 13),
      ('ac9863b8-5c4e-4ceb-a21a-a9cdeda62b91', 'ede72996-9bdb-4d95-b13a-166be0e660ca', null, 14),
      ('ac9863b8-5c4e-4ceb-a21a-a9cdeda62b91', '270d6d18-9d6c-4232-8111-c52195fb93fd', null, 15),
      ('ac9863b8-5c4e-4ceb-a21a-a9cdeda62b91', '5d60b017-dd9a-4fc4-b47d-0b770ed961b2', null, 21),
      ('ac9863b8-5c4e-4ceb-a21a-a9cdeda62b91', '8fd3d377-4584-4fb9-9da1-0ee0c0121f32', null, 22),
      ('ac9863b8-5c4e-4ceb-a21a-a9cdeda62b91', 'cc020c6a-a36a-4748-8954-91743c1e9232', null, 23),
      ('ac9863b8-5c4e-4ceb-a21a-a9cdeda62b91', 'eb0ae7d5-aff3-4eb0-92d4-7416066e7ea5', null, 23),
      -- COLLEGE_D1 · 2017 · Mardi Gras 30 2017 (mardi-gras-30-2017) · ended 2017-02-26
      ('0cebe263-df6b-4a80-a24c-10e74a96a822', '509a255d-3b98-476a-b0ed-8ff07ab1269b', null, 7),
      ('0cebe263-df6b-4a80-a24c-10e74a96a822', '4d235148-420f-4be8-a8fd-b6503f20655d', null, 8),
      ('0cebe263-df6b-4a80-a24c-10e74a96a822', '74ce9966-c617-402c-93ec-5469a3d06d82', null, 17),
      ('0cebe263-df6b-4a80-a24c-10e74a96a822', '1113399e-676d-4e0a-ac81-313df8467b4c', null, 18),
      -- COLLEGE_D1 · 2017 · Market Crash 2017 (market-crash-2017) · ended 2017-02-26
      ('4749a17e-9074-4cb1-bc61-02590e6346a4', '29efa75b-31ef-4278-8277-addad5c41f8f', null, 7),
      ('4749a17e-9074-4cb1-bc61-02590e6346a4', '5bbe8d6d-8a37-4cbb-82bd-06f15a279c8c', null, 8),
      -- COLLEGE_D1 · 2017 · Music City Tune Up 2017 (music-city-tune-up-2017) · ended 2017-02-26
      ('5f8d506b-346e-4644-9291-62b1c7fd8376', '4366c6df-cb85-40b5-9840-b9691fa4679e', 14, 15), -- correct
      ('5f8d506b-346e-4644-9291-62b1c7fd8376', '458cd25c-ccc6-49ea-ad00-49fc96600bf5', null, 16),
      ('5f8d506b-346e-4644-9291-62b1c7fd8376', '11d28b0d-6ec8-4100-a8af-57d8cab8b8ca', 13, null), -- clear-unsupported
      -- COLLEGE_D1 · 2017 · 2017 Stanford Invite powered by SAVAGE (2017-stanford-invite-powered-by-savage) · ended 2017-03-05
      ('be7cef9e-4340-4d21-b064-0641de7a0170', 'e9e4d044-ab24-4dab-b865-92ba1b96381a', 11, 12), -- correct
      -- COLLEGE_D1 · 2017 · 3rd Annual West Point Classic 2017 (3rd-annual-west-point-classic-2017) · ended 2017-03-05
      ('387e5d8b-12ff-4f2d-a853-2392e6bd693b', '2a0a6602-be70-4ab9-837b-1668b87e87d2', null, 5),
      ('387e5d8b-12ff-4f2d-a853-2392e6bd693b', '07e3ebb1-c7d4-470b-a6b4-889512c15c24', null, 6),
      -- COLLEGE_D1 · 2017 · Midwest Throwdown 2017 (midwest-throwdown-2017) · ended 2017-03-05
      ('baa96d33-40a8-4d15-a0d1-d0e873b17137', 'b624de37-a90e-4807-9634-d6b33a26c02b', 23, 24), -- correct
      ('baa96d33-40a8-4d15-a0d1-d0e873b17137', '13a57f6e-f58a-4730-9710-8804692dae15', null, 29),
      ('baa96d33-40a8-4d15-a0d1-d0e873b17137', 'e2b372ab-24fa-4a92-b40a-f62ba3c6301a', null, 30),
      ('baa96d33-40a8-4d15-a0d1-d0e873b17137', '16370ae7-cdb8-4a94-a8f9-532e7d0703e7', 31, 32), -- correct
      ('baa96d33-40a8-4d15-a0d1-d0e873b17137', 'ca75ae50-dba0-45bb-b3e9-c416f464e066', 6, null), -- clear-unsupported
      ('baa96d33-40a8-4d15-a0d1-d0e873b17137', 'd9ed1d29-e319-4108-9a74-a67e653eeec1', 5, null), -- clear-unsupported
      -- COLLEGE_D1 · 2017 · PLU BBQ Open 2017 (plu-bbq-open-2017) · ended 2017-03-05
      ('be983aa9-9512-4132-a0ee-5a60bc2e0277', 'a0def3ee-e599-43eb-bba7-44f2080433e0', null, 3),
      ('be983aa9-9512-4132-a0ee-5a60bc2e0277', 'c183a18d-acda-4011-9487-3e293b71b4dc', null, 4),
      ('be983aa9-9512-4132-a0ee-5a60bc2e0277', 'd3fce158-e581-40fa-8382-266dee5adce6', null, 11),
      ('be983aa9-9512-4132-a0ee-5a60bc2e0277', '7592bd8a-bcc3-451a-91c4-6aa7989fbc73', null, 12),
      -- COLLEGE_D1 · 2017 · Atlantic City 7 2017 (atlantic-city-7-2017) · ended 2017-03-12
      ('00600132-100b-46bf-90a8-8a28de647093', '8754f9fe-3673-4084-8ace-4f4eb314d112', 7, 8), -- correct
      -- COLLEGE_D1 · 2017 · Boogienights 2017 (boogienights-2017) · ended 2017-03-12
      ('f0110be5-ae45-4866-834b-5886fac8c93b', '68bd570a-a02c-4cc2-a28e-3ec2c5366b39', null, 3),
      ('f0110be5-ae45-4866-834b-5886fac8c93b', 'e32424dd-e1d8-41c0-9c41-ab4a79addd34', null, 4),
      ('f0110be5-ae45-4866-834b-5886fac8c93b', '68ae5bd2-ba29-4386-9244-10579421c974', null, 5),
      ('f0110be5-ae45-4866-834b-5886fac8c93b', '3d3ed7f2-a897-45a6-aa3d-52f403488ebd', null, 6),
      -- COLLEGE_D1 · 2017 · Palouse Open 2017 (palouse-open-2017) · ended 2017-03-12
      ('b8f8c277-adbc-4ceb-a48f-47cdf9dcdc58', '5732d1a8-ba89-4e83-90ce-8ea6c77610fb', 3, 4), -- correct
      -- COLLEGE_D1 · 2017 · Rip Tide 2017 (rip-tide-2017) · ended 2017-03-12
      ('62ffcbf0-9d4a-493f-868c-4cb162bd46eb', 'e1e01118-2522-4052-8a4d-3bdf6b5cf7b1', 3, 4), -- correct
      ('62ffcbf0-9d4a-493f-868c-4cb162bd46eb', 'dd358ea1-bca3-4c1b-a36b-fc065687d24d', null, 5),
      ('62ffcbf0-9d4a-493f-868c-4cb162bd46eb', 'f045b82b-8f85-484a-847f-f8d11d970cef', null, 6),
      ('62ffcbf0-9d4a-493f-868c-4cb162bd46eb', '76ceac94-7aa9-44e1-a77f-fa6e4c9544fa', null, 7),
      ('62ffcbf0-9d4a-493f-868c-4cb162bd46eb', 'cc020c6a-a36a-4748-8954-91743c1e9232', null, 7),
      -- COLLEGE_D1 · 2017 · College Southern XVI 2017 (college-southern-xvi-2017) · ended 2017-03-19
      ('37fcecb6-99bc-46d2-a78d-0ed1f5241d31', '3b255876-84ca-4498-8a44-a2616c71360f', 7, 8), -- correct
      ('37fcecb6-99bc-46d2-a78d-0ed1f5241d31', '502e5cc0-a2b1-4d16-b526-be78434b621b', 11, 12), -- correct
      -- COLLEGE_D1 · 2017 · Beenanza 2017 (beenanza-2017) · ended 2017-03-26
      ('80122e93-fa0a-4355-a0a7-919b6c9e0200', 'f69472e1-fbf1-4ca7-b8bb-d75c4a7d3f66', null, 7),
      ('80122e93-fa0a-4355-a0a7-919b6c9e0200', 'e3ce837b-557b-44af-8b57-4609ac44ea68', null, 8),
      -- COLLEGE_D1 · 2017 · Heart of Texas Huckfest 2017 (heart-of-texas-huckfest-2017) · ended 2017-03-26
      ('be5fa03c-5981-43fa-958e-89ba7b363e44', '489dd497-6acd-4dc7-99da-83ce2f26f9da', 3, 4), -- correct
      -- COLLEGE_D1 · 2017 · Jersey Devil Spring 6 2017 (jersey-devil-spring-6-2017) · ended 2017-03-26
      ('e51c0f49-ec03-47fd-93a2-7e09c2322e80', 'eb49a66e-555d-4032-af6e-e2521cfca527', null, 11),
      ('e51c0f49-ec03-47fd-93a2-7e09c2322e80', '2bcdf942-e3e3-4ed0-96f9-4c4d96b868fa', 11, 12), -- correct
      ('e51c0f49-ec03-47fd-93a2-7e09c2322e80', 'b7bce54e-288c-47cd-bd3a-0dbc0f1de9e9', 12, null), -- clear-unsupported
      -- COLLEGE_D1 · 2017 · Spring Awakening 5 2017 (spring-awakening-5-2017) · ended 2017-03-26
      ('5edac93b-d7b0-41c6-bb9f-042534a1adcb', '150cdb52-fa04-4c26-9be5-54c5b5e83277', null, 1),
      ('5edac93b-d7b0-41c6-bb9f-042534a1adcb', '75f66489-1fc1-48f0-aaab-daf450075c3b', null, 2),
      ('5edac93b-d7b0-41c6-bb9f-042534a1adcb', '8372024f-f516-4aba-9b15-a00f0fe2d94e', null, 5),
      ('5edac93b-d7b0-41c6-bb9f-042534a1adcb', '444aafa8-e19c-47e2-ba0f-b8b4da841a25', null, 6),
      ('5edac93b-d7b0-41c6-bb9f-042534a1adcb', 'aee18c26-4a54-4778-b14d-0b97c946b1a2', null, 7),
      ('5edac93b-d7b0-41c6-bb9f-042534a1adcb', 'd53cb839-67d4-4976-91cd-3b5a93add1d8', null, 8),
      ('5edac93b-d7b0-41c6-bb9f-042534a1adcb', '270d6d18-9d6c-4232-8111-c52195fb93fd', 11, 12), -- correct
      ('5edac93b-d7b0-41c6-bb9f-042534a1adcb', 'db4e38d7-5d54-4e1a-a669-3cc83c00dcbf', 15, 16), -- correct
      -- COLLEGE_D1 · 2017 · Steakfest 2017 (steakfest-2017) · ended 2017-03-26
      ('091fc649-722c-402f-aca7-ad6d89212079', '99fd2aec-8441-434c-a073-335a5fae8b11', null, 16),
      -- COLLEGE_D1 · 2017 · April CWRUL's 2017 (april-cwruls-2017) · ended 2017-04-02
      ('e3394969-0f47-4859-a588-075ba77b2629', 'b45cfc58-45b6-45d7-ba20-0c68818acc1c', 7, 8), -- correct
      ('e3394969-0f47-4859-a588-075ba77b2629', 'e32424dd-e1d8-41c0-9c41-ab4a79addd34', null, 24),
      -- COLLEGE_D1 · 2017 · Atlantic Coast Open 2017 (atlantic-coast-open-2017) · ended 2017-04-02
      ('3f7424d9-a414-41ba-9d2f-3da98480c4fc', '240b64bc-321d-4620-9811-92f100b114da', 7, 8), -- correct
      -- COLLEGE_D1 · 2017 · Black Penguins Classic 2017 (black-penguins-classic-2017) · ended 2017-04-02
      ('6d4e1994-d640-4ad9-9015-112fb93799d0', 'bf19bb0b-c4bb-446e-b386-bd80af71f649', null, 8),
      ('6d4e1994-d640-4ad9-9015-112fb93799d0', 'd79da2b7-b6f7-422d-92d1-a01ae8b1ef1c', null, 9),
      ('6d4e1994-d640-4ad9-9015-112fb93799d0', 'b624de37-a90e-4807-9634-d6b33a26c02b', null, 10),
      ('6d4e1994-d640-4ad9-9015-112fb93799d0', '51e58436-6bfc-4b6f-a9f8-d16dbbc07d3c', null, 11),
      ('6d4e1994-d640-4ad9-9015-112fb93799d0', '9f3062e4-a7ff-4671-a029-b98327b088a8', null, 11),
      -- COLLEGE_D1 · 2017 · Easterns 2017 (easterns-2017) · ended 2017-04-02
      ('353095bd-ecb9-48ef-823a-8418a3729cfd', '1d2f4e07-df6c-4b98-ae89-82f1d39764a1', null, 17),
      ('353095bd-ecb9-48ef-823a-8418a3729cfd', 'c4b4eeea-ab9e-49fd-ad29-3eabbd61fb1a', null, 18),
      -- COLLEGE_D1 · 2017 · Garden State 7 2017 (garden-state-7-2017) · ended 2017-04-02
      ('ff104de8-702a-45b2-bf37-ab8743efcb3d', '72867b79-d3bf-4bcb-a1e1-31c75bc988cd', null, 5),
      ('ff104de8-702a-45b2-bf37-ab8743efcb3d', '2bcdf942-e3e3-4ed0-96f9-4c4d96b868fa', null, 6),
      ('ff104de8-702a-45b2-bf37-ab8743efcb3d', '28e4ed50-1a64-4c39-be52-8fcce7d5e86d', null, 7),
      ('ff104de8-702a-45b2-bf37-ab8743efcb3d', '0e5da4ee-5b3a-4642-a4e0-dfbeea4e9102', null, 8),
      ('ff104de8-702a-45b2-bf37-ab8743efcb3d', '3fa140be-9a82-421d-adbf-cee24b654fee', null, 9),
      ('ff104de8-702a-45b2-bf37-ab8743efcb3d', 'd87397ff-6d0e-4516-9f5e-95072e82a511', null, 10),
      ('ff104de8-702a-45b2-bf37-ab8743efcb3d', '6d5fe2e7-2d2d-4cb0-b9e0-63050e31e134', null, 11),
      ('ff104de8-702a-45b2-bf37-ab8743efcb3d', '0c1db2ef-da4a-4bbe-a911-86bc45b20a4c', null, 12),
      ('ff104de8-702a-45b2-bf37-ab8743efcb3d', 'd21d8d1d-7ec1-42a0-994e-02869b5ba5fc', null, 13),
      ('ff104de8-702a-45b2-bf37-ab8743efcb3d', '15bfa839-6895-42ba-a841-22300ae81e4b', null, 14),
      ('ff104de8-702a-45b2-bf37-ab8743efcb3d', '6bdcb152-af7b-47a7-a38f-91ffb7da1fc4', 15, 16), -- correct
      ('ff104de8-702a-45b2-bf37-ab8743efcb3d', 'b7bce54e-288c-47cd-bd3a-0dbc0f1de9e9', 19, 20), -- correct
      -- COLLEGE_D1 · 2017 · Huck Finn 2017 (huck-finn-2017) · ended 2017-04-02
      ('430fbf08-155f-4a73-a651-8f7c1d533fde', '5a7dd708-2f9f-44c5-9096-49d3068aa79d', null, 21),
      ('430fbf08-155f-4a73-a651-8f7c1d533fde', '597f9f9d-bbcb-4a9b-aceb-3b3a8113dc61', null, 23),
      ('430fbf08-155f-4a73-a651-8f7c1d533fde', 'e86565a5-a97d-449e-8f32-18a5313ceac5', null, 24),
      -- COLLEGE_D1 · 2017 · Illinois Invite 6 2017 (illinois-invite-6-2017) · ended 2017-04-02
      ('a7039edf-b3f1-45c4-9b8e-34ab922340a0', 'cacb7c42-b9d2-4e14-9d67-7244998aa22c', 11, 12), -- correct
      ('a7039edf-b3f1-45c4-9b8e-34ab922340a0', 'df9f70bb-43ec-49d5-85d3-0294ebb6d087', 16, 17), -- correct
      ('a7039edf-b3f1-45c4-9b8e-34ab922340a0', '25a63444-77cc-4e73-be58-84b7889a346e', null, 18),
      ('a7039edf-b3f1-45c4-9b8e-34ab922340a0', 'e2b372ab-24fa-4a92-b40a-f62ba3c6301a', 15, null), -- clear-unsupported
      -- COLLEGE_D1 · 2017 · Layout PIgout 2017 (layout-pigout-2017) · ended 2017-04-02
      ('9183f1c9-1acd-4052-890b-fdec7f543b15', '54023d7d-4fc9-4c4e-83b2-9783454e50d5', null, 5),
      ('9183f1c9-1acd-4052-890b-fdec7f543b15', '8372024f-f516-4aba-9b15-a00f0fe2d94e', null, 6),
      ('9183f1c9-1acd-4052-890b-fdec7f543b15', '5d60b017-dd9a-4fc4-b47d-0b770ed961b2', 7, 8), -- correct
      ('9183f1c9-1acd-4052-890b-fdec7f543b15', '444aafa8-e19c-47e2-ba0f-b8b4da841a25', null, 11),
      ('9183f1c9-1acd-4052-890b-fdec7f543b15', '7d8d8c38-d1b2-4cf4-87a2-d5170dd451f6', null, 13),
      ('9183f1c9-1acd-4052-890b-fdec7f543b15', '07e3ebb1-c7d4-470b-a6b4-889512c15c24', null, 14),
      ('9183f1c9-1acd-4052-890b-fdec7f543b15', 'f45a7f68-0d61-416b-8080-4b5bea473304', null, 15),
      -- COLLEGE_D1 · 2017 · New England Dev College Women's CC 2017 (new-england-dev-college-womens-cc-2017) · ended 2017-04-16
      ('f95c4537-82c8-4853-a5de-8253aaeb53e2', 'b6c2549c-c274-486b-8a41-7a8af6ae8557', 7, 8), -- correct
      -- COLLEGE_D1 · 2017 · Ohio Valley Dev College Men's CC 2017 (ohio-valley-dev-college-mens-cc-2017) · ended 2017-04-16
      ('3e8c16a9-3325-4c17-9215-457b1462308f', 'b118fb2b-bc36-415c-aa0b-6f974e183895', 7, 8), -- correct
      -- COLLEGE_D1 · 2017 · South Texas D-I College Men's CC 2017 (south-texas-d-i-college-mens-cc-2017) · ended 2017-04-23
      ('7227ceef-b650-4c49-8bd0-ed9572c29099', 'a1423e34-7a06-4763-9a9b-bbdfe7c061ae', 10, 11), -- correct
      ('7227ceef-b650-4c49-8bd0-ed9572c29099', 'f1df7e82-6768-470f-be44-455bf05f0d06', 11, 12), -- correct
      ('7227ceef-b650-4c49-8bd0-ed9572c29099', '43f0be7c-467e-47e6-a9c9-79cd74f12d70', 12, 13), -- correct
      -- COLLEGE_D1 · 2017 · North Central D-I College Men's Regionals 2017 (north-central-d-i-college-mens-regionals-2017) · ended 2017-04-30
      ('58c0589d-d56e-4cc9-98f4-a140bc6b7bcc', '9022cba6-fb3a-46a0-9bbc-1921dfcd7fe1', null, 10),
      ('58c0589d-d56e-4cc9-98f4-a140bc6b7bcc', 'db11b707-b022-4201-933f-74c2269559ee', null, 11),
      ('58c0589d-d56e-4cc9-98f4-a140bc6b7bcc', '8d01fe40-929e-498a-96b9-f23107017d3e', null, 12),
      -- COLLEGE_D1 · 2017 · North Central D-I College Women's Regionals 2017 (north-central-d-i-college-womens-regionals-2017) · ended 2017-04-30
      ('76558c0f-9031-4ba3-b38d-47d92c70b067', '988c0431-dddd-4a5f-ae90-29c6bf52139c', null, 8),
      -- COLLEGE_D1 · 2017 · Atlantic Coast D-I College Women's Regionals 2017 (atlantic-coast-d-i-college-womens-regionals-2017) · ended 2017-05-07
      ('725cd85d-64e4-4520-a0e9-c5875188c137', '599d58e1-4df1-4ffc-95a6-158e05dc2a1e', null, 11),
      -- COLLEGE_D1 · 2017 · Great Lakes D-I College Men's Regionals 2017 (great-lakes-d-i-college-mens-regionals-2017) · ended 2017-05-07
      ('9f7cef13-0eca-447d-b281-49bff0e87860', 'afd0724d-8354-48d7-baea-1dd222634aad', null, 5),
      ('9f7cef13-0eca-447d-b281-49bff0e87860', '3f706f24-6f98-4eea-b17c-f98fbced35f1', null, 6),
      ('9f7cef13-0eca-447d-b281-49bff0e87860', 'f48594cd-2fd2-4bd2-961c-728dadd1390f', 11, 10), -- correct
      ('9f7cef13-0eca-447d-b281-49bff0e87860', 'cf1dd2a7-4e26-4ffc-a4f2-4fdef9c73fb6', 10, 11), -- correct
      -- COLLEGE_D1 · 2017 · Fusion 2017 (fusion-2017) · ended 2017-10-01
      ('55e63d34-7498-4834-aafb-e0c1e35837e1', '50f83125-3912-45fe-b12b-57c506add9ff', 11, 12), -- correct
      ('55e63d34-7498-4834-aafb-e0c1e35837e1', 'be96b078-9028-4120-83c5-186e64c33c03', 15, 16), -- correct
      -- COLLEGE_D1 · 2017 · Big Sky Gun Show 2017 (big-sky-gun-show-2017) · ended 2017-10-15
      ('9339da2d-cdaa-4c69-9ca1-0155310c07b1', 'd4fb175f-9ab8-429c-9d31-f58058d513cc', null, 7),
      ('9339da2d-cdaa-4c69-9ca1-0155310c07b1', '4600c024-ce2a-4ba6-aea1-3d4609401938', null, 8),
      -- COLLEGE_D1 · 2017 · Blue Ridge Finale 2017 (blue-ridge-finale-2017) · ended 2017-11-05
      ('6f53eb29-0a24-4599-8548-bc1b9c5ad2ff', '599d58e1-4df1-4ffc-95a6-158e05dc2a1e', null, 12),
      -- COLLEGE_D1 · 2018 · Big D in Little d 2018 (Open) (big-d-in-little-d-2018-open) · ended 2018-02-04
      ('321b2bef-17b7-4099-9188-ea7351709ee7', '3ce928f0-e225-4aaf-b005-1ac8f25deecf', 7, 8), -- correct
      ('321b2bef-17b7-4099-9188-ea7351709ee7', '48a15827-a356-4882-b2b4-b1a1b045d690', null, 12),
      -- COLLEGE_D1 · 2018 · Presidents' Day Qualifier 2018 (presidents-day-qualifier-2018) · ended 2018-02-04
      ('63a2e1e6-dac7-460e-8082-9551fcde9bad', 'a804ac0c-cdfa-4878-ace0-a1353c3b9a15', 3, 4), -- correct
      -- COLLEGE_D1 · 2018 · Stanford Open 2018 (stanford-open-2018) · ended 2018-02-11
      ('575bb301-f34c-448d-a049-1bd3528f4f31', 'a804ac0c-cdfa-4878-ace0-a1353c3b9a15', 3, 4), -- correct
      -- COLLEGE_D1 · 2018 · Chucktown Throwdown XV 2018 (chucktown-throwdown-xv-2018) · ended 2018-02-18
      ('9408d500-dcae-425c-9070-4671f2d22a89', '805b575f-3ed0-4276-a7ed-3d24e9436930', null, 7),
      ('9408d500-dcae-425c-9070-4671f2d22a89', '3cba2381-00f7-47a2-9441-08c991f9067b', null, 8),
      -- COLLEGE_D1 · 2018 · Warm Up: A Florida Affair 2018 (warm-up-a-florida-affair-2018) · ended 2018-02-18
      ('24d5826c-c087-4101-895c-57fcea972d76', '0feaad77-06c7-482c-b32d-c13801453dd5', 3, null), -- clear-unsupported
      ('24d5826c-c087-4101-895c-57fcea972d76', 'e56d8d8c-fe89-4649-8456-ca66db403c69', 4, null), -- clear-unsupported
      -- COLLEGE_D1 · 2018 · Presidents' Day Invitational Powered by Savage 2018 (presidents-day-invitational-powered-by-savage-2018) · ended 2018-02-19
      ('ca1a2f31-f5af-442b-b324-43821162bdd3', '7f829809-9ca0-4dfd-8227-ad7da6f39cd6', 11, 12), -- correct
      ('ca1a2f31-f5af-442b-b324-43821162bdd3', '4d686f36-5a68-49c7-bedb-10c877ae7b7b', null, 15),
      ('ca1a2f31-f5af-442b-b324-43821162bdd3', 'ed0b108e-73a3-4afa-ba22-00d2a329784f', null, 15),
      -- COLLEGE_D1 · 2018 · Oak Creek Challenge 2018 (oak-creek-challenge-2018) · ended 2018-02-25
      ('e2e1684f-fd91-4dff-bea3-fa32e7e61b28', '4b179a0e-8b8a-4b86-95bb-e6f0a098bf5c', 8, null), -- clear-unsupported
      ('e2e1684f-fd91-4dff-bea3-fa32e7e61b28', '6a083962-a83f-4eb4-a09b-8023151d4040', 7, null), -- clear-unsupported
      -- COLLEGE_D1 · 2018 · 4th Annual West Point Classic 2018 (4th-annual-west-point-classic-2018) · ended 2018-03-04
      ('3ecadcde-72ed-41b8-b266-73a23d6bb76e', '6bfe0ccb-f9e9-4e18-91f3-1aa7aa9609f4', null, 5),
      ('3ecadcde-72ed-41b8-b266-73a23d6bb76e', '12bd4690-eb55-496b-a24b-e79386f6cd14', null, 6),
      -- COLLEGE_D1 · 2018 · Air Force Invite 2018 (air-force-invite-2018) · ended 2018-03-04
      ('7dc29945-6a11-490d-b307-5f6ff88cf7a7', '2f2c948e-3fa7-471c-8f9b-0ed8466821b7', null, 3),
      ('7dc29945-6a11-490d-b307-5f6ff88cf7a7', '3ab0e21c-fd17-4f05-be74-8849ff985905', null, 3),
      ('7dc29945-6a11-490d-b307-5f6ff88cf7a7', 'b06eb0e8-7d23-4ba4-9c11-26c4f7db91ce', null, 4),
      ('7dc29945-6a11-490d-b307-5f6ff88cf7a7', 'd2b72c76-4b67-4983-8967-3899d7efcec2', null, 4),
      -- COLLEGE_D1 · 2018 · Atlantic City 7 2018 (atlantic-city-7-2018) · ended 2018-03-04
      ('1dd762d6-261a-4e1a-995d-8edad3575ae6', '82a61823-0f69-4fca-a921-ac31295beed3', null, 5),
      ('1dd762d6-261a-4e1a-995d-8edad3575ae6', 'c297f771-3dbd-405e-b77e-1b3ede8a99e7', null, 6),
      -- COLLEGE_D1 · 2018 · DiscThrow Inferno 2K18 2018 (discthrow-inferno-2k18-2018) · ended 2018-03-04
      ('22f12d6d-ce52-4430-8b74-09441e99b3f4', 'cf1f7bf2-e991-43d3-85ed-06e0fba846ea', 3, 4), -- correct
      -- COLLEGE_D1 · 2018 · Midwest Throwdown 2018 (midwest-throwdown-2018) · ended 2018-03-04
      ('87b369a0-061a-460a-8801-33f8f31e53b6', 'a7d24d0b-4b95-4722-afbb-baf6a857f86a', 23, 24), -- correct
      ('87b369a0-061a-460a-8801-33f8f31e53b6', '473f6141-a7e8-42a7-bf50-fef2de0c9c1e', null, 29),
      ('87b369a0-061a-460a-8801-33f8f31e53b6', '2da5fc73-84eb-4cee-94ad-e065c4460c46', null, 30),
      -- COLLEGE_D1 · 2018 · Boogienights 2018 (boogienights-2018) · ended 2018-03-11
      ('0b541b15-aaa4-4f09-9d13-b163692c4b7e', '1f12c9ca-4913-44c6-97e2-b891633a8b38', 3, 4), -- correct
      -- COLLEGE_D1 · 2018 · Last Call 9 2018 (last-call-9-2018) · ended 2018-03-11
      ('f79686f2-80fc-429f-ba92-9a0643ddb0de', '405f3a3c-6c25-43c2-bced-6aae2d87e40c', 3, 4), -- correct
      ('f79686f2-80fc-429f-ba92-9a0643ddb0de', 'f52b233f-44b1-40ed-aad8-431087b0f224', 6, 7), -- correct
      ('f79686f2-80fc-429f-ba92-9a0643ddb0de', '6d0632ee-e688-46f7-9d60-176e5d89c2ee', null, 8),
      ('f79686f2-80fc-429f-ba92-9a0643ddb0de', 'f28b5e95-f843-4339-a158-9930bad7dca4', null, 11),
      ('f79686f2-80fc-429f-ba92-9a0643ddb0de', 'e71cd27a-6342-462c-92ca-8204a3a8fd8f', null, 12),
      ('f79686f2-80fc-429f-ba92-9a0643ddb0de', 'f5a120a4-20cc-4852-94d6-ffd2b6bd9bf6', 5, null), -- clear-unsupported
      -- COLLEGE_D1 · 2018 · Men's Centex 2018 (mens-centex-2018) · ended 2018-03-11
      ('6bccd9ea-77ad-485e-98a3-47f877ec51e9', '942d8207-11ad-40f0-9cdc-bd72ff003c08', null, 11),
      ('6bccd9ea-77ad-485e-98a3-47f877ec51e9', '5c443085-704a-442b-8c09-360e5a295057', null, 12),
      -- COLLEGE_D1 · 2018 · Tally Classic XIII 2018 (tally-classic-xiii-2018) · ended 2018-03-11
      ('49f5e75b-41ae-4b86-8ec4-f4b5edf596e2', 'e2b6629a-cbe2-4464-80ca-853e9bf77d10', 7, 8), -- correct
      ('49f5e75b-41ae-4b86-8ec4-f4b5edf596e2', 'e9c650f0-4e8e-41e0-bd50-a65bb985ff98', 15, 16), -- correct
      -- COLLEGE_D1 · 2018 · College Southerns 2018 (college-southerns-2018) · ended 2018-03-18
      ('e83d2d78-86a8-4eb6-a5c2-fd84bfa72203', '5e6b7ddb-2c33-4daf-9b39-601ced9e4018', null, 7),
      ('e83d2d78-86a8-4eb6-a5c2-fd84bfa72203', '4e15bdfb-6ce3-4206-98eb-d710be2c81a8', 7, 8), -- correct
      ('e83d2d78-86a8-4eb6-a5c2-fd84bfa72203', 'a885fb43-a634-4883-b7c4-99ea5a62d543', null, 8),
      -- COLLEGE_D1 · 2018 · CWRUL Memorial 2018 (cwrul-memorial-2018) · ended 2018-03-25
      ('70da72d9-3305-4759-86bd-30a23bd57144', 'd94a77df-9da5-4b92-9b8a-9897ce4ac9d8', 7, 8), -- correct
      ('70da72d9-3305-4759-86bd-30a23bd57144', 'f426da18-692f-4370-9a1d-6d11db2fe32e', 11, 12), -- correct
      ('70da72d9-3305-4759-86bd-30a23bd57144', '29913c0e-ffe8-4dbe-8f5f-6cb8878581ef', 15, 16), -- correct
      -- COLLEGE_D1 · 2018 · Greatest Crusade IV 2018 (greatest-crusade-iv-2018) · ended 2018-03-25
      ('34d531f9-ff01-49a3-ab74-9336eb0cb5cb', '5c443085-704a-442b-8c09-360e5a295057', null, 5),
      ('34d531f9-ff01-49a3-ab74-9336eb0cb5cb', '9e623847-acb6-4e5f-b06a-910288bcfd51', null, 6),
      -- COLLEGE_D1 · 2018 · Indy Invite College Men 2018 (indy-invite-college-men-2018) · ended 2018-03-25
      ('643b713a-819f-4713-ac1e-834671fc3489', '4b179a0e-8b8a-4b86-95bb-e6f0a098bf5c', null, 8),
      ('643b713a-819f-4713-ac1e-834671fc3489', 'bb9a23bb-f6c0-45dc-9234-ea9142d133f4', null, 9),
      ('643b713a-819f-4713-ac1e-834671fc3489', '690b1fbc-ab6a-4820-85e4-236abf2ec69b', null, 11),
      ('643b713a-819f-4713-ac1e-834671fc3489', 'f6beee01-9e0d-478f-8044-ac40efcc56a5', null, 12),
      -- COLLEGE_D1 · 2018 · JMU Beenanza 2018 (jmu-beenanza-2018) · ended 2018-03-25
      ('275f9101-99f7-4870-86f4-2faf6abb54c2', 'd9bbffc3-faef-469e-b891-9f88e05161bc', null, 9),
      ('275f9101-99f7-4870-86f4-2faf6abb54c2', '710f6c87-5fb5-4e68-ac8d-ee039b3198a8', null, 10),
      -- COLLEGE_D1 · 2018 · Magic City Invite 2018 (magic-city-invite-2018) · ended 2018-03-25
      ('370117bf-ddd8-4c77-b2a4-e37a821f96ed', '0156e3b3-64e9-415d-abb4-e8c159cda186', null, 5),
      ('370117bf-ddd8-4c77-b2a4-e37a821f96ed', '468e2764-ad8b-4531-a26e-30e786b72741', null, 6),
      -- COLLEGE_D1 · 2018 · Meltdown 2018 (meltdown-2018) · ended 2018-03-25
      ('89a8d5a3-77ed-4506-b100-42f1e05af237', 'd99d5ab6-08b1-400a-9416-1a63c9eaa54a', null, 16),
      ('89a8d5a3-77ed-4506-b100-42f1e05af237', '5c8a89fd-2eba-46bc-8e09-f24f95979ec4', null, 21),
      ('89a8d5a3-77ed-4506-b100-42f1e05af237', '6a034a94-49bd-4a9f-affa-e15e766b364c', null, 22),
      ('89a8d5a3-77ed-4506-b100-42f1e05af237', 'ec83bec2-d3ab-4db1-92c3-4a59f0c41536', null, 25),
      ('89a8d5a3-77ed-4506-b100-42f1e05af237', 'c7b56ea7-df52-4fda-82d3-ac861513a464', null, 26),
      -- COLLEGE_D1 · 2018 · Spring Awakening 2018 (spring-awakening-2018) · ended 2018-03-25
      ('13291da5-a127-4bd4-8da6-900b5d6fba34', 'd2977ac5-1357-48f3-8938-c86945a60676', 7, 8), -- correct
      -- COLLEGE_D1 · 2018 · Garden State 8 2018 (garden-state-8-2018) · ended 2018-04-01
      ('1799a321-c280-43ff-89e4-dfa98cc5529b', 'f18aa919-09e3-477f-8872-d3d585d9fc1b', null, 5),
      ('1799a321-c280-43ff-89e4-dfa98cc5529b', 'f426da18-692f-4370-9a1d-6d11db2fe32e', null, 5),
      ('1799a321-c280-43ff-89e4-dfa98cc5529b', '37449edd-0987-46af-bdb3-130be7acb84b', null, 6),
      ('1799a321-c280-43ff-89e4-dfa98cc5529b', '68a059ce-2f55-4751-90de-5aa1bdc5a31a', null, 6),
      ('1799a321-c280-43ff-89e4-dfa98cc5529b', '881d034f-9635-4fe2-b3bd-b07518477a58', null, 11),
      ('1799a321-c280-43ff-89e4-dfa98cc5529b', '81d9fe08-8cf6-4a6c-94b8-3eac19e560d5', null, 13),
      ('1799a321-c280-43ff-89e4-dfa98cc5529b', '29aa46f6-c7b8-4f82-b851-85bf1e63dfe5', null, 14),
      ('1799a321-c280-43ff-89e4-dfa98cc5529b', '4969a4f7-9dc9-4b57-8fe0-e3ac74ccb706', null, 15),
      ('1799a321-c280-43ff-89e4-dfa98cc5529b', 'd2977ac5-1357-48f3-8938-c86945a60676', null, 15),
      -- COLLEGE_D1 · 2018 · Illinois Invite 2018 (illinois-invite-2018) · ended 2018-04-01
      ('f1ccc455-bd77-402c-91f0-fc93a47d8605', '5f030626-77fd-43e7-a76f-bbb5822e9473', 3, 4), -- correct
      ('f1ccc455-bd77-402c-91f0-fc93a47d8605', '3f586b71-0be0-437b-9afb-34a35367dfa3', null, 7),
      ('f1ccc455-bd77-402c-91f0-fc93a47d8605', '256c54bb-1c2b-4ad7-81e1-372004482877', 15, 16), -- correct
      ('f1ccc455-bd77-402c-91f0-fc93a47d8605', '14919328-4975-4c4c-8e2b-9c8544e8e474', null, 19),
      ('f1ccc455-bd77-402c-91f0-fc93a47d8605', 'ca579718-f28e-4eb2-bd97-ffa5cb97be8e', null, 19),
      -- COLLEGE_D1 · 2018 · Eastern Metro East D-I College Women's CC 2018 (eastern-metro-east-d-i-college-womens-cc-2018) · ended 2018-04-15
      ('1102a485-ab48-47e7-8031-c51e6e53467b', 'e35655ef-a134-43a7-b118-055b1e81ed14', null, 11),
      ('1102a485-ab48-47e7-8031-c51e6e53467b', 'a1b40892-4887-486b-b147-341208fb294e', null, 12),
      -- COLLEGE_D1 · 2018 · Great Lakes Dev College Men's CC 2018 (great-lakes-dev-college-mens-cc-2018) · ended 2018-04-15
      ('71c31ae4-a700-417a-badb-9b8c35f4ef5d', 'cfef3681-6f11-43a7-a7de-0efdb5a0d17f', 7, 8), -- correct
      -- COLLEGE_D1 · 2018 · New England Dev College Women's CC 2018 (new-england-dev-college-womens-cc-2018) · ended 2018-04-15
      ('cb98c143-84cf-4b23-9d1a-62c83366e0bf', '3ce116c5-04eb-41ab-85ab-18c5428dbecf', 3, 4), -- correct
      -- COLLEGE_D1 · 2018 · West Penn D-I College Men's CC 2018 (west-penn-d-i-college-mens-cc-2018) · ended 2018-04-15
      ('2655afa0-1013-48a1-9275-2b3257d1549d', '7aad3118-3628-4783-870a-3176404fbd72', null, 5),
      -- COLLEGE_D1 · 2018 · Great Lakes D-I College Men's Regionals 2018 (great-lakes-d-i-college-mens-regionals-2018) · ended 2018-04-29
      ('5bd8050b-59f0-4995-b8ee-7157e3b883f1', 'b2fb559b-3d1f-4d22-ad78-d2e0c7d70d6b', 5, 8), -- correct
      -- COLLEGE_D1 · 2018 · Great Lakes D-I College Women's Regionals 2018 (great-lakes-d-i-college-womens-regionals-2018) · ended 2018-04-29
      ('87305fdf-a788-4d51-ac02-b352cf7d0a84', '9b4136cc-d08a-41ea-be9c-92e6ad5c5232', null, 8),
      -- COLLEGE_D1 · 2018 · Southeast D-I College Women's Regionals 2018 (southeast-d-i-college-womens-regionals-2018) · ended 2018-04-29
      ('cf61e40a-e68a-4b82-9115-7691bd7fa01a', 'e11f05d0-89bd-41f5-9273-8d9201217322', 7, 8), -- correct
      -- COLLEGE_D1 · 2018 · Southwest D-I College Men's Regionals 2018 (southwest-d-i-college-mens-regionals-2018) · ended 2018-04-29
      ('bc1c9c7d-f06d-4861-ab0a-a84e93b754b0', 'cf0e49c5-d241-43b4-a7f5-1cc5e38b4596', null, 15),
      ('bc1c9c7d-f06d-4861-ab0a-a84e93b754b0', 'a804ac0c-cdfa-4878-ace0-a1353c3b9a15', null, 16),
      -- COLLEGE_D1 · 2018 · New England D-I College Men's Regionals 2018 (new-england-d-i-college-mens-regionals-2018) · ended 2018-05-06
      ('6f1d0806-84ea-4baf-9423-dd54e7fee61f', 'ec8f8a6a-c232-432c-93d7-345f82880ce0', null, 13),
      ('6f1d0806-84ea-4baf-9423-dd54e7fee61f', '1b0b2b85-976b-433f-8a73-6f37af9313d2', null, 14),
      ('6f1d0806-84ea-4baf-9423-dd54e7fee61f', '2ff91700-c6d0-4935-9cf4-85a812436cbb', null, 15),
      ('6f1d0806-84ea-4baf-9423-dd54e7fee61f', 'bc164854-757e-46ee-900d-3b206d3c75ba', null, 16),
      -- COLLEGE_D1 · 2018 · New England Dev College Men's Regionals 2018 (new-england-dev-college-mens-regionals-2018) · ended 2018-05-06
      ('3338bd83-5625-44eb-ba5c-cbe38fe221a3', '08489cf7-a293-45a1-a8ea-17e105402d29', null, 7),
      ('3338bd83-5625-44eb-ba5c-cbe38fe221a3', '44ecbc9d-1c63-4ae5-b8a9-20b67ba9fcdf', null, 7),
      -- COLLEGE_D1 · 2018 · Northeast College Mixed Regional Championship 2018 (northeast-college-mixed-regional-championship-2018) · ended 2018-11-04
      ('e741ebb2-674e-420f-b933-9270661ced75', 'ca877d60-558d-4762-8a97-56ea276242cb', null, 9),
      ('e741ebb2-674e-420f-b933-9270661ced75', 'c141366a-14c4-4c4f-9b67-f0bfc1635c37', null, 10),
      ('e741ebb2-674e-420f-b933-9270661ced75', '2e1b976a-6d12-4cda-8caa-6f08944af4c7', null, 11),
      ('e741ebb2-674e-420f-b933-9270661ced75', '80ee5290-0aed-434d-8a89-092376a2097f', null, 12),
      ('e741ebb2-674e-420f-b933-9270661ced75', 'ce4ad7a0-d3b8-43ed-a81e-038c2fa75348', null, 15),
      ('e741ebb2-674e-420f-b933-9270661ced75', '8c627a5e-a562-4dd9-bc07-b4173d703dd8', null, 16),
      -- COLLEGE_D1 · 2019 · Black Penguins Classic 2019 (black-penguins-classic-2019) · ended 2019-03-31
      ('1261a33c-9605-4511-835a-9b65a0481c5f', '10a82ef5-9d41-4440-9d1a-008e3e064be3', null, 3),
      ('1261a33c-9605-4511-835a-9b65a0481c5f', 'ae1caba6-48eb-4519-aff1-1d060093c75c', null, 3),
      ('1261a33c-9605-4511-835a-9b65a0481c5f', '3f3fd3fd-bf94-4523-a858-7b8b22165bed', 7, 8), -- correct
      -- COLLEGE_D1 · 2019 · Country Roads Classic 2019 (country-roads-classic-2019) · ended 2019-03-31
      ('90afb784-fb44-4aec-b8f9-04529c3de08e', 'ea9f0539-93ca-4121-8b18-40a3d0922d37', null, 7),
      ('90afb784-fb44-4aec-b8f9-04529c3de08e', 'cf8fab11-a630-4030-bafa-e9e2331c942b', null, 8),
      -- COLLEGE_D1 · 2019 · Garden State 9 2019 (garden-state-9-2019) · ended 2019-03-31
      ('d47d5f3e-0af5-465b-bd6a-306e4a655059', '7cc10b1d-c17e-4c25-98b4-f33b271006c5', 3, 4), -- correct
      ('d47d5f3e-0af5-465b-bd6a-306e4a655059', '746f6c8a-82ac-495c-a4a2-a8d892058e13', null, 5),
      ('d47d5f3e-0af5-465b-bd6a-306e4a655059', '79238d54-1ce3-48ea-a637-ea89059ac2ee', null, 5),
      ('d47d5f3e-0af5-465b-bd6a-306e4a655059', '2ef0fcc0-c5f7-42b5-8d48-dfbe952dd03e', null, 6),
      ('d47d5f3e-0af5-465b-bd6a-306e4a655059', 'ba40a8e4-4deb-4a2a-b0e7-1f9cce27dac7', null, 6),
      ('d47d5f3e-0af5-465b-bd6a-306e4a655059', '1c05a9f6-99b4-40ff-a616-d9bec1bfd7d5', null, 7),
      ('d47d5f3e-0af5-465b-bd6a-306e4a655059', '7c1c4407-57f3-4a43-884e-51ec8fb5358c', null, 7),
      ('d47d5f3e-0af5-465b-bd6a-306e4a655059', '8c78dccb-e74b-4782-bea0-911402c87c3d', null, 7),
      ('d47d5f3e-0af5-465b-bd6a-306e4a655059', 'bcc6449c-ead6-4729-b771-d8dc196b2204', null, 7),
      ('d47d5f3e-0af5-465b-bd6a-306e4a655059', '44f1221e-6f36-4b83-96de-75fa2293c949', null, 9),
      ('d47d5f3e-0af5-465b-bd6a-306e4a655059', '0a367657-b97d-426f-b982-8e71fb287bbf', null, 10),
      ('d47d5f3e-0af5-465b-bd6a-306e4a655059', '7e271a0e-4fc0-4271-bbef-c027b2a11753', null, 11),
      ('d47d5f3e-0af5-465b-bd6a-306e4a655059', 'c6ce54e6-2e42-4f81-b52b-47825d8c30dd', null, 11),
      ('d47d5f3e-0af5-465b-bd6a-306e4a655059', '51a43f25-1c9b-42ad-ba73-4831d1f79f85', null, 13),
      ('d47d5f3e-0af5-465b-bd6a-306e4a655059', 'b796ae91-5710-4e92-a122-95b3db523247', null, 13),
      ('d47d5f3e-0af5-465b-bd6a-306e4a655059', 'da458e34-5661-4e04-a3e2-a7ba2b2bc5ab', null, 14),
      ('d47d5f3e-0af5-465b-bd6a-306e4a655059', 'fb0c3772-ec37-422b-9e3d-62e2e5a2311f', null, 14),
      ('d47d5f3e-0af5-465b-bd6a-306e4a655059', '6d85afdc-1ee3-422e-94e4-47acd4b23ce6', null, 15),
      ('d47d5f3e-0af5-465b-bd6a-306e4a655059', '41ca06ab-68c3-4726-8414-5bee02c48f27', 15, 16), -- correct
      ('d47d5f3e-0af5-465b-bd6a-306e4a655059', 'f87551fa-36f1-4b74-9e3c-565acff8e8ba', null, 17),
      ('d47d5f3e-0af5-465b-bd6a-306e4a655059', '031d9c0a-3f23-413d-92a5-81c5ece47cb3', null, 18),
      ('d47d5f3e-0af5-465b-bd6a-306e4a655059', 'a2cb2b75-2bb9-4fee-b575-c8b8f3f74a36', null, 21),
      ('d47d5f3e-0af5-465b-bd6a-306e4a655059', '9810e916-1a4c-4570-a816-e78b43c78983', null, 22),
      -- COLLEGE_D1 · 2019 · I-85 Rodeo 2019 (i-85-rodeo-2019) · ended 2019-03-31
      ('ed172b20-a10f-41cb-9f2d-bba0ae2c9095', 'a6a3abc5-19a9-4f82-a8e8-2ad4a8179a1b', null, 5),
      ('ed172b20-a10f-41cb-9f2d-bba0ae2c9095', 'cd1352fe-8f41-4879-9bae-24673dec33a4', null, 5),
      ('ed172b20-a10f-41cb-9f2d-bba0ae2c9095', '40667e59-1b4d-44d9-a91d-e0e04a03f212', null, 6),
      ('ed172b20-a10f-41cb-9f2d-bba0ae2c9095', '82e46962-aa25-4c45-a11f-ee49a5d5cd36', null, 6),
      ('ed172b20-a10f-41cb-9f2d-bba0ae2c9095', '09bc2ab9-0c98-4588-9234-940e4bb07930', 15, 16), -- correct
      ('ed172b20-a10f-41cb-9f2d-bba0ae2c9095', '7c59e33a-35c8-4129-af2a-52cb41ca5064', null, 17),
      ('ed172b20-a10f-41cb-9f2d-bba0ae2c9095', 'bc1dff83-f5e8-4fb4-81c0-3673df74ce84', null, 18),
      -- COLLEGE_D1 · 2019 · Illinois Invite 8 2019 (illinois-invite-8-2019) · ended 2019-03-31
      ('4ea32ed8-6542-49a7-8d56-b141dad3305f', '82203726-ce86-472a-9609-8bd9ee903078', null, 5),
      ('4ea32ed8-6542-49a7-8d56-b141dad3305f', '26a51fad-19bd-4cfa-860e-e02d7e0eae53', null, 6),
      ('4ea32ed8-6542-49a7-8d56-b141dad3305f', '3578b072-9d15-4304-a29e-7328981b492b', 6, 7), -- correct
      ('4ea32ed8-6542-49a7-8d56-b141dad3305f', '37c76ada-478f-49dc-82f3-af8ba520bfaa', null, 7),
      ('4ea32ed8-6542-49a7-8d56-b141dad3305f', 'e3853485-cb87-4c37-82f4-a67384e5979f', null, 8),
      ('4ea32ed8-6542-49a7-8d56-b141dad3305f', 'ef316915-df86-4f48-b2e0-4dde4498a702', null, 9),
      ('4ea32ed8-6542-49a7-8d56-b141dad3305f', '8593f301-e450-4e45-87fc-31d09aa29845', null, 10),
      ('4ea32ed8-6542-49a7-8d56-b141dad3305f', 'eb42df4a-6b83-4334-a6ac-cc241386b8a4', null, 11),
      ('4ea32ed8-6542-49a7-8d56-b141dad3305f', 'b0ab1cb3-2ce2-4419-b10d-4803d6e06959', null, 12),
      ('4ea32ed8-6542-49a7-8d56-b141dad3305f', '0807d807-3fad-4e24-bf4c-8817eab43345', 5, null), -- clear-unsupported
      -- COLLEGE_D1 · 2019 · Layout Pigout 2019 (layout-pigout-2019) · ended 2019-03-31
      ('e2d275c4-4b51-4d03-a2ee-ac195796af40', '3ebda98a-aec1-44cd-b2a9-df5093c77ecf', 7, 8), -- correct
      -- COLLEGE_D1 · 2019 · Uprising 8 2019 (uprising-8-2019) · ended 2019-03-31
      ('bd1ee11b-936a-432b-925f-f279c6cb3f7f', 'e492c484-f5ee-4b1a-a528-6b6f3250256c', 3, 4), -- correct
      ('bd1ee11b-936a-432b-925f-f279c6cb3f7f', '28372a24-6035-465b-b448-75b51606de64', null, 5),
      ('bd1ee11b-936a-432b-925f-f279c6cb3f7f', 'bbf77b84-0e47-44b8-9999-e090dc22be25', null, 6),
      ('bd1ee11b-936a-432b-925f-f279c6cb3f7f', '53423516-355e-4b1a-a108-3c8befa4222e', null, 9),
      ('bd1ee11b-936a-432b-925f-f279c6cb3f7f', '2421dba0-cdc6-442b-b283-c18d94dc47a0', null, 10),
      -- COLLEGE_D1 · 2019 · Big Sky D-I College Men's CC 2019 (big-sky-d-i-college-mens-cc-2019) · ended 2019-04-14
      ('f3219ba8-0681-4ccc-b37e-5578f46f40f8', '23faf086-7247-4d44-b31d-15447140da02', null, 7),
      ('f3219ba8-0681-4ccc-b37e-5578f46f40f8', '316139d4-146b-41fb-807f-b590bc954783', null, 8),
      -- COLLEGE_D1 · 2019 · Great Lakes Dev College Men's CC 2019 (great-lakes-dev-college-mens-cc-2019) · ended 2019-04-14
      ('78e158dc-1225-4773-a1f8-4a2e1641f468', '4b503a76-3394-46a3-a89f-d93ad5e798ca', 7, 8), -- correct
      -- COLLEGE_D1 · 2019 · Greater New England Dev College Men's CC 2019 (greater-new-england-dev-college-mens-cc-2019) · ended 2019-04-21
      ('8167ee22-282b-465d-aabd-28b61e2dd55f', '1cd7f121-56f5-4b90-9a88-177fad5443a2', null, 6),
      ('8167ee22-282b-465d-aabd-28b61e2dd55f', '95fa63f5-2f16-4ec3-8c89-3f08b9d7cb20', null, 7),
      -- COLLEGE_D1 · 2019 · Atlantic Coast D-I College Women's Regionals 2019 (atlantic-coast-d-i-college-womens-regionals-2019) · ended 2019-04-28
      ('dd3ecc61-8009-45ab-b6e0-cd36abe330b6', '7dd14fe7-4de2-457c-80b7-cb8b65c74642', null, 5),
      ('dd3ecc61-8009-45ab-b6e0-cd36abe330b6', '1e54d765-d231-4d81-b118-c3346142c071', null, 6),
      -- COLLEGE_D1 · 2019 · New England D-I College Men's Regionals 2019 (new-england-d-i-college-mens-regionals-2019) · ended 2019-04-28
      ('8f35d81e-8a72-4486-9db4-313a494cc7e3', '5deca774-3024-44c9-9036-61309ae4232f', null, 8),
      ('8f35d81e-8a72-4486-9db4-313a494cc7e3', '57dd48fc-c7cd-43af-a632-dbf0b7f628a5', null, 9),
      ('8f35d81e-8a72-4486-9db4-313a494cc7e3', '1f1a003e-a3c7-48aa-b645-9998a9363d13', null, 10),
      -- COLLEGE_D1 · 2019 · Fusion 2019 (fusion-2019) · ended 2019-09-29
      ('b84640d9-d252-4226-a99d-454af274de67', '3043e406-256d-4f2d-bea6-d182ae0a6625', 11, 12), -- correct
      ('b84640d9-d252-4226-a99d-454af274de67', '386b4959-5008-4dbc-9015-beb4d16da515', null, 17),
      ('b84640d9-d252-4226-a99d-454af274de67', '45a7305c-232d-41e8-8fa4-1d5a7f3d8047', null, 18),
      -- COLLEGE_D1 · 2021 · Fusion 2021 (fusion-2021) · ended 2021-09-26
      ('f156a10b-f273-430f-81fe-f6bc04fdd303', 'bb90da39-fc3a-42e8-9953-84e355ec2743', 7, 8), -- correct
      ('f156a10b-f273-430f-81fe-f6bc04fdd303', '9d805fe4-8257-45be-926e-33eae3198a8c', null, 13),
      ('f156a10b-f273-430f-81fe-f6bc04fdd303', 'd573d551-aa43-473c-8a3a-ed693fe87d59', null, 14),
      -- COLLEGE_D1 · 2021 · Big Sky D-I College Women's CC 2021 (big-sky-d-i-college-womens-cc-2021) · ended 2021-10-10
      ('32fe2908-63a7-4c1c-9feb-18a69e3739eb', 'bdab9770-49bc-4955-a97a-757a07263f7f', null, 1),
      ('32fe2908-63a7-4c1c-9feb-18a69e3739eb', '4231af2d-0623-426d-b7bb-56247e2e03b3', null, 2),
      ('32fe2908-63a7-4c1c-9feb-18a69e3739eb', '217ebe8c-e74d-4fdf-912a-c725b0684c1a', null, 5),
      ('32fe2908-63a7-4c1c-9feb-18a69e3739eb', '71ef6e54-f872-4a9f-afed-f108fd32d30e', null, 6),
      -- COLLEGE_D1 · 2021 · Atlantic Coast D-I College Men's Regionals 2021 (atlantic-coast-d-i-college-mens-regionals-2021) · ended 2021-11-07
      ('d6cee5a7-8dc1-4ec4-b5ad-9e000657fd12', '98221e96-5115-46cb-bae5-a1e7d6f51674', 5, 6), -- correct
      -- COLLEGE_D1 · 2021 · New England D-I College Women's Regionals 2021 (new-england-d-i-college-womens-regionals-2021) · ended 2021-11-14
      ('71d2effa-1711-4163-b85f-06d7dbcd0d4d', '95955be7-4427-4343-ab7f-09c4b196e053', null, 2),
      ('71d2effa-1711-4163-b85f-06d7dbcd0d4d', '19aab52c-51d1-48eb-a29d-c97be9a47017', 2, 3), -- correct
      ('71d2effa-1711-4163-b85f-06d7dbcd0d4d', '01bfa50c-cede-41b0-bdba-e41337ee9bcc', null, 4),
      -- COLLEGE_D1 · 2022 · Atlantic Coast Dev College Men's Regionals (Atlantic-Coast-Dev-College-Mens-Regionals-2022) · ended 2022-05-08
      ('0e912466-8457-4870-9ce3-31a9ff1835a1', 'e41a9569-6317-4d82-8f3a-6ba5c056beb8', null, 1),
      ('0e912466-8457-4870-9ce3-31a9ff1835a1', '73fa8e24-1e60-40b4-b680-af8bbc31d973', null, 2),
      ('0e912466-8457-4870-9ce3-31a9ff1835a1', 'fb7518e9-fe00-46e6-a09f-425237a28a9a', null, 3),
      ('0e912466-8457-4870-9ce3-31a9ff1835a1', '296ab6af-3c2c-4a5a-880d-487b02709cbc', null, 4),
      -- COLLEGE_D1 · 2023 · Ozarks D-I College Men's CC (Ozarks-D-I-College-Mens-CC-2023) · ended 2023-04-16
      ('cc41289b-43a1-42d7-aed9-70b23317a490', '939861ec-01b1-4067-ba6f-a8a767eff671', 8, null), -- clear-unsupported
      ('cc41289b-43a1-42d7-aed9-70b23317a490', 'd38cefd4-4ef4-469b-bfc3-7cd6b978013a', 7, null), -- clear-unsupported
      -- COLLEGE_D1 · 2023 · Greater New England Dev College Men's CC (Greater-New-England-Dev-College-Mens-CC-2023) · ended 2023-04-23
      ('b64e744a-a4d6-47db-b7fb-d536e903c90d', 'a6f8201f-b780-409e-8c08-afb21aee9033', 3, null), -- clear-unsupported
      -- COLLEGE_D1 · 2025 · West Penn D-I Men's Conferences (West-Penn-D-I-Mens-Conferences-2025) · ended 2025-04-13
      ('53bc1c28-52b1-439b-b5eb-bc821cf97eb8', '9657bde1-cb64-40bd-86a7-4d1f6d1f42ae', null, 1),
      ('53bc1c28-52b1-439b-b5eb-bc821cf97eb8', '96b884bf-e07e-4b24-a916-9195eb485c40', null, 2),
      ('53bc1c28-52b1-439b-b5eb-bc821cf97eb8', '84133865-1220-44fa-a33a-7eb1e370409f', null, 3),
      ('53bc1c28-52b1-439b-b5eb-bc821cf97eb8', '1f7faf96-c96c-4bfa-881d-d714755fbefb', null, 4),
      ('53bc1c28-52b1-439b-b5eb-bc821cf97eb8', '518c8831-dfbd-4c59-94cd-65741b040cc3', null, 5),
      ('53bc1c28-52b1-439b-b5eb-bc821cf97eb8', '04767efe-ad03-480f-9bb9-4ad304801d46', null, 6),
      -- COLLEGE_D1 · 2026 · Southeast D-I College Women's Regionals (Southeast-D-I-College-Womens-Regionals-2026) · ended 2026-04-26
      ('a76737c0-9648-4984-b374-84e30172e94d', 'd3d883a6-74b3-4412-b06b-d0b0a6ae2480', 13, null), -- clear-unsupported
      ('a76737c0-9648-4984-b374-84e30172e94d', 'eebad5e4-4801-4f72-b69d-19d550385ee2', 14, null), -- clear-unsupported
      -- COLLEGE_D3 · 2014 · Atlantic Coast D-III College Women's CC 2014 (atlantic-coast-d-iii-college-womens-cc-2014) · ended 2014-04-13
      ('84de69eb-c821-49cf-bd83-74e5db3e8481', 'afb307f6-b4bc-42d6-98d4-5ac4d28ed682', null, 1),
      ('84de69eb-c821-49cf-bd83-74e5db3e8481', '54716674-eae6-4b3c-9dbc-4e962ea86276', null, 2),
      ('84de69eb-c821-49cf-bd83-74e5db3e8481', '0735b2a2-2166-43e6-be7b-27a2049ab43b', null, 3),
      ('84de69eb-c821-49cf-bd83-74e5db3e8481', '348c5d51-d996-495b-888e-367530cffa17', null, 3),
      -- COLLEGE_D3 · 2014 · Eastern Metro East D-III College Women's CC 2014 (eastern-metro-east-d-iii-college-womens-cc-2014) · ended 2014-04-13
      ('4cf2f877-1c15-4483-955b-1c13a2f2fc4a', '1b4e01f4-d567-4432-9e1f-550c03b6fcb1', null, 4),
      ('4cf2f877-1c15-4483-955b-1c13a2f2fc4a', 'a28f4da6-f1a9-48bf-aac1-30016d2e3e60', null, 5),
      -- COLLEGE_D3 · 2014 · Great Lakes D-III College Women's CC 2014 (great-lakes-d-iii-college-womens-cc-2014) · ended 2014-04-13
      ('c31f691c-577a-4b3d-b517-e01647671d49', 'eaf1c888-2f30-49fb-bd20-e28876c2572d', null, 1),
      ('c31f691c-577a-4b3d-b517-e01647671d49', 'b68b2bee-ac3a-4b05-ae5d-471c47cdd45d', null, 2),
      ('c31f691c-577a-4b3d-b517-e01647671d49', '5d1f141b-df86-491f-a173-a3b0e839d4df', null, 3),
      ('c31f691c-577a-4b3d-b517-e01647671d49', '956ba1e8-e925-4320-9252-4412198a264d', null, 4),
      -- COLLEGE_D3 · 2014 · Illinois D-III College Men's CC 2014 (illinois-d-iii-college-mens-cc-2014) · ended 2014-04-13
      ('4f4329f5-68d6-4f0d-b36b-d30d9dc8eb96', 'afb7ffaa-f578-4a0b-ae51-9e663b391733', null, 1),
      ('4f4329f5-68d6-4f0d-b36b-d30d9dc8eb96', '92000027-408c-4825-89e5-04ca17e6b111', null, 2),
      ('4f4329f5-68d6-4f0d-b36b-d30d9dc8eb96', '6d4d1dae-9e06-40a4-b53c-8baacd286e6f', null, 5),
      ('4f4329f5-68d6-4f0d-b36b-d30d9dc8eb96', 'b047e865-de9c-435c-8e57-f141ea15a0d1', null, 6),
      ('4f4329f5-68d6-4f0d-b36b-d30d9dc8eb96', 'f02efc99-4839-46a5-a301-a883c13a09c2', null, 7),
      ('4f4329f5-68d6-4f0d-b36b-d30d9dc8eb96', '704162b6-1b20-444b-86c4-bb1d68e3cc53', null, 8),
      -- COLLEGE_D3 · 2014 · North New England D-III College Men's CC 2014 (north-new-england-d-iii-college-mens-cc-2014) · ended 2014-04-13
      ('0bb71510-0978-472a-b871-4f8ea0867855', '6ca0d0e5-b638-423d-aead-903a24f8f022', null, 1),
      ('0bb71510-0978-472a-b871-4f8ea0867855', 'b2e785c1-1414-457c-9be0-f543b3833783', null, 2),
      -- COLLEGE_D3 · 2014 · Northern Atlantic Coast D-III College Men's CC 2014 (northern-atlantic-coast-d-iii-college-mens-cc-2014) · ended 2014-04-13
      ('292856e3-ba3c-4be8-88e2-57e7d0e3511d', '049858e6-2e38-4882-8241-224590f28fd2', null, 1),
      ('292856e3-ba3c-4be8-88e2-57e7d0e3511d', 'cd1b7e16-3b7a-46e6-af47-6b6f488cb0c7', null, 2),
      ('292856e3-ba3c-4be8-88e2-57e7d0e3511d', 'bea36bd6-152d-4eed-8477-f949a5425fe7', null, 3),
      ('292856e3-ba3c-4be8-88e2-57e7d0e3511d', '71670cbb-1ace-486a-b4e1-bf6a942832f3', null, 4),
      ('292856e3-ba3c-4be8-88e2-57e7d0e3511d', '2385bee5-965a-4a99-83bd-e530e33310bf', null, 5),
      ('292856e3-ba3c-4be8-88e2-57e7d0e3511d', '92e0a939-1ac2-4aad-903c-b0b84373bca8', null, 5),
      -- COLLEGE_D3 · 2014 · Northwest D-III College Men's CC 2014 (northwest-d-iii-college-mens-cc-2014) · ended 2014-04-13
      ('68d83616-fa56-4475-84fc-3c29c37ca4af', '0da852e5-5e6f-432c-86ea-891092ba8b87', null, 1),
      ('68d83616-fa56-4475-84fc-3c29c37ca4af', '314bd770-67be-438d-a996-d3e9f1c86634', null, 2),
      ('68d83616-fa56-4475-84fc-3c29c37ca4af', 'c3eb7eda-586d-408d-a4ac-1dd93a8e8788', null, 3),
      -- COLLEGE_D3 · 2014 · Northwoods D-III College Men's CC 2014 (northwoods-d-iii-college-mens-cc-2014) · ended 2014-04-13
      ('7d44f265-08a4-4a83-b483-95f4e5f84950', '6d57abff-3a77-4e53-a394-d1ca79071c7d', null, 2),
      ('7d44f265-08a4-4a83-b483-95f4e5f84950', '1294ff0c-a74e-4cb4-9e8a-b46e695f7b7a', null, 3),
      ('7d44f265-08a4-4a83-b483-95f4e5f84950', '42f601da-7253-4a6a-8f13-1488748b6970', null, 4),
      ('7d44f265-08a4-4a83-b483-95f4e5f84950', '91ede022-da76-4d0b-8280-6292849ffd1a', null, 5),
      ('7d44f265-08a4-4a83-b483-95f4e5f84950', '6503b7c0-bc8c-451e-9309-b32daaeb7af6', null, 6),
      ('7d44f265-08a4-4a83-b483-95f4e5f84950', '6208af04-4f5b-47de-8b9c-85c4822573de', null, 7),
      ('7d44f265-08a4-4a83-b483-95f4e5f84950', 'bab16c90-757a-45fb-9e3a-c7f177eecdf0', null, 7),
      -- COLLEGE_D3 · 2014 · Ohio D-III College Men's CC 2014 (ohio-d-iii-college-mens-cc-2014) · ended 2014-04-13
      ('6ef5b125-ba80-496e-9613-da6ae513a1e4', '64096d37-2936-4e14-a19d-55d6107153a6', null, 9),
      ('6ef5b125-ba80-496e-9613-da6ae513a1e4', 'a341f385-1db8-476a-8118-f3913c2c2987', null, 10),
      -- COLLEGE_D3 · 2014 · Pennsylvania D-III College Women's CC 2014 (pennsylvania-d-iii-college-womens-cc-2014) · ended 2014-04-13
      ('c38a41d4-b595-4ada-b8c3-75dd6d15ba54', 'b582dafe-eefe-4b0b-b13f-01401fa9708c', null, 1),
      ('c38a41d4-b595-4ada-b8c3-75dd6d15ba54', 'bbb49acc-f9c4-4019-bc09-ad23b067620e', null, 2),
      -- COLLEGE_D3 · 2014 · South New England D-III College Women's CC 2014 (south-new-england-d-iii-college-womens-cc-2014) · ended 2014-04-13
      ('c0105f82-e815-470d-8a5c-63c8d745177e', '876a7a1b-559d-4d4f-8ab1-b87c9cbeacee', null, 1),
      ('c0105f82-e815-470d-8a5c-63c8d745177e', '85062800-d6a5-49a7-9e6a-5031bbae4023', null, 2),
      ('c0105f82-e815-470d-8a5c-63c8d745177e', '52347b64-ed9e-4090-9d89-b637214a8a0c', null, 3),
      -- COLLEGE_D3 · 2014 · West Penn D-III College Men's CC 2014 (west-penn-d-iii-college-mens-cc-2014) · ended 2014-04-13
      ('56ac536d-67b1-495e-aaee-21de34700b2c', '45e89968-91b8-4992-9dff-7f3516c65ef1', null, 1),
      ('56ac536d-67b1-495e-aaee-21de34700b2c', '3755c941-d2ac-4552-a78b-ee5792f9bc59', null, 2),
      ('56ac536d-67b1-495e-aaee-21de34700b2c', '44c0abb1-9e78-4ce6-9d8a-c483642c9c92', null, 3),
      ('56ac536d-67b1-495e-aaee-21de34700b2c', '48a55784-509b-45dd-a210-98be130ce1d3', null, 5),
      ('56ac536d-67b1-495e-aaee-21de34700b2c', 'fef33982-aa5e-4263-b856-a461a7ce593a', null, 6),
      -- COLLEGE_D3 · 2014 · Western NY D-III College Men's CC 2014 (western-ny-d-iii-college-mens-cc-2014) · ended 2014-04-13
      ('de957e38-6053-408d-845b-e76c220e46d0', '1deffe9a-29fc-42ea-8491-4765ddc2d3c6', null, 1),
      ('de957e38-6053-408d-845b-e76c220e46d0', 'bc21a126-a000-4b70-aa82-d8e46a1a79c5', null, 2),
      ('de957e38-6053-408d-845b-e76c220e46d0', 'f7be01e0-ad3b-4a2b-b45e-19844fe378e8', null, 3),
      ('de957e38-6053-408d-845b-e76c220e46d0', '0be5c669-fae0-48f0-8053-7f6e953a1dce', null, 4),
      ('de957e38-6053-408d-845b-e76c220e46d0', 'ad3c747f-6997-47fb-9b0f-1565a9399840', null, 5),
      ('de957e38-6053-408d-845b-e76c220e46d0', 'bf007408-b6aa-4668-bdd2-a638a93d68b2', null, 6),
      ('de957e38-6053-408d-845b-e76c220e46d0', '0b694c70-040d-4e92-8193-5e0ba502bc5f', null, 7),
      ('de957e38-6053-408d-845b-e76c220e46d0', 'fe6020aa-a585-42d8-9277-a6e9e9e56c3c', null, 7),
      ('de957e38-6053-408d-845b-e76c220e46d0', 'f2111ef0-971f-49d1-bea0-4e1087737f9e', null, 9),
      ('de957e38-6053-408d-845b-e76c220e46d0', '612683d6-5a9a-42d6-abca-82fd51413af9', null, 10),
      -- COLLEGE_D3 · 2014 · Hudson Valley D-III College Men's CC 2014 (hudson-valley-d-iii-college-mens-cc-2014) · ended 2014-04-20
      ('64a06990-2854-43b8-b93a-9d0cf3d04658', 'ccd195a1-5910-4196-b259-9f0e9cb27cfd', null, 1),
      ('64a06990-2854-43b8-b93a-9d0cf3d04658', '35c327e0-81a5-4bcb-9398-c94a6d0fca3f', null, 2),
      ('64a06990-2854-43b8-b93a-9d0cf3d04658', '81462707-bfd9-4fe0-a2d0-5463106723a8', null, 3),
      ('64a06990-2854-43b8-b93a-9d0cf3d04658', '3d7b4f99-8120-4b31-a374-269b5b6bc84f', null, 4),
      ('64a06990-2854-43b8-b93a-9d0cf3d04658', 'b1064915-b4e9-4f87-bc71-bc850c16f32b', null, 4),
      -- COLLEGE_D3 · 2014 · Metro Boston D-III College Men's CC 2014 (metro-boston-d-iii-college-mens-cc-2014) · ended 2014-04-20
      ('ec782fc9-14aa-4944-b2f7-c71c202e7872', 'af535058-c0b2-4011-b795-72ef7f4c276e', null, 1),
      ('ec782fc9-14aa-4944-b2f7-c71c202e7872', '0d0a7b9a-e793-424c-9ef9-fdf784d613f2', null, 2),
      ('ec782fc9-14aa-4944-b2f7-c71c202e7872', '9a6136e2-484b-4be8-b2c3-ef2bcc8798a1', null, 3),
      ('ec782fc9-14aa-4944-b2f7-c71c202e7872', '6bb39baa-29cf-4970-b77a-b6e86f90c12b', null, 7),
      ('ec782fc9-14aa-4944-b2f7-c71c202e7872', '14fd668d-0c99-4061-8893-0c7a0337826f', null, 8)
    ) as v(event_id, team_id, old_place, new_place)
   where et.event_id = v.event_id
     and et.team_id = v.team_id
     and et.final_placement is not distinct from v.old_place;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> v_expected THEN
    RAISE EXCEPTION 'usau placements part 04: expected % rows, matched %; data drifted since generation, re-run scripts/derive-usau-placements.ts', v_expected, v_updated;
  END IF;
  RAISE NOTICE 'usau placements part 04: updated % rows', v_updated;
END
$migration$;

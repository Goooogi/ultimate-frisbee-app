-- USAU per-event final placements — repair + fill, part 11 of 12.
--
-- The 2026-07-20 one-shot derivePlacements() backfill (Feature Backlog #18)
-- stored misread brackets, game-to-go losers kept 2nd, and ties that a later
-- game had settled; nothing derived placements after it. Regenerated with the
-- fixed algorithm by scripts/derive-usau-placements.ts on 2026-09-23T15:15:42.827Z —
-- do not hand-edit, re-run it.
--
-- This part: 149 events · fill 694 · correct 9 · clear 2 (conflict 2, contradicted 0, unsupported 0).
-- EXPECTED ROWS: 705. A row only updates while final_placement still holds
-- the value it was generated from ("old" below); the DO block raises, rolling
-- this part back, unless exactly 705 rows match. Regenerate instead of forcing it.
-- All 12 parts: 1469 events · fill 7901 · correct 428 · clear 247 (conflict 31, contradicted 127, unsupported 89).

DO $migration$
DECLARE
  v_expected constant int := 705;
  v_updated int;
BEGIN
  update public.usau_event_teams et
     set final_placement = v.new_place
    from (values
      -- COLLEGE_D3 · 2019 · East Plains D-III College Men's CC 2019 (east-plains-d-iii-college-mens-cc-2019) · ended 2019-04-14
      ('575e35f4-4ef0-48e7-ada4-ce887aa645be'::uuid, 'dd88cfa4-af52-4ad2-befb-9d42b7afa9e8'::uuid, null::int, 1::int),
      ('575e35f4-4ef0-48e7-ada4-ce887aa645be', 'bda88910-b39c-49ad-b1df-79e11b096b93', null, 2),
      ('575e35f4-4ef0-48e7-ada4-ce887aa645be', '7e6f7e91-0c3a-4f5a-b14b-f60c570cf924', null, 3),
      ('575e35f4-4ef0-48e7-ada4-ce887aa645be', '0f601381-4917-49f7-8b97-38d8b1ed78ec', null, 4),
      ('575e35f4-4ef0-48e7-ada4-ce887aa645be', '85f152a9-f647-46c1-985b-04cea64a21cf', null, 5),
      ('575e35f4-4ef0-48e7-ada4-ce887aa645be', '23fd2bc0-e715-42a7-9dde-4b27accabf4d', null, 6),
      -- COLLEGE_D3 · 2019 · Eastern Metro East D-III College Women's CC 2019 (eastern-metro-east-d-iii-college-womens-cc-2019) · ended 2019-04-14
      ('715ca99d-d29b-4f58-8db8-56dbd9646939', '29d2aa8d-6dc8-47ef-a27e-74514e55c0fc', null, 1),
      ('715ca99d-d29b-4f58-8db8-56dbd9646939', '44ee3411-76d2-4bb3-b080-2f05d2b0eec1', null, 2),
      ('715ca99d-d29b-4f58-8db8-56dbd9646939', '8362eae0-7969-4ec7-bb02-680522179de3', null, 4),
      ('715ca99d-d29b-4f58-8db8-56dbd9646939', '3d33c156-1f07-46ed-8434-b65c6399be16', null, 5),
      ('715ca99d-d29b-4f58-8db8-56dbd9646939', 'a2cb2b75-2bb9-4fee-b575-c8b8f3f74a36', null, 6),
      -- COLLEGE_D3 · 2019 · Great Lakes D-III College Women's CC 2019 (great-lakes-d-iii-college-womens-cc-2019) · ended 2019-04-14
      ('faa1b603-3daf-439d-859a-8c57cdae1f83', 'ae1caba6-48eb-4519-aff1-1d060093c75c', null, 1),
      ('faa1b603-3daf-439d-859a-8c57cdae1f83', '10a82ef5-9d41-4440-9d1a-008e3e064be3', null, 2),
      ('faa1b603-3daf-439d-859a-8c57cdae1f83', '5683175d-b053-4f78-b514-abbfbd56397a', null, 3),
      ('faa1b603-3daf-439d-859a-8c57cdae1f83', '26a51fad-19bd-4cfa-860e-e02d7e0eae53', null, 4),
      -- COLLEGE_D3 · 2019 · Metro Boston D-III College Men's CC 2019 (metro-boston-d-iii-college-mens-cc-2019) · ended 2019-04-14
      ('91b7cb38-38c8-4b76-8d74-554c18f60c00', '19ecda95-617e-48f7-aed9-ab68ea7a1b5e', null, 1),
      ('91b7cb38-38c8-4b76-8d74-554c18f60c00', '9e43af18-3416-40ba-9f07-73afa934159d', null, 2),
      ('91b7cb38-38c8-4b76-8d74-554c18f60c00', 'e02a98eb-fec8-4188-9a36-d19da149a345', null, 3),
      ('91b7cb38-38c8-4b76-8d74-554c18f60c00', 'e905bbaf-5f25-4139-bfbd-7fb739aca31f', null, 4),
      -- COLLEGE_D3 · 2019 · Metro Boston D-III College Women's CC 2019 (metro-boston-d-iii-college-womens-cc-2019) · ended 2019-04-14
      ('0b9f429b-7c1f-469b-8c3f-85db43eef0c1', '746f6c8a-82ac-495c-a4a2-a8d892058e13', null, 1),
      ('0b9f429b-7c1f-469b-8c3f-85db43eef0c1', '548d75a3-541b-46eb-ae8c-843ec9d600d4', null, 2),
      ('0b9f429b-7c1f-469b-8c3f-85db43eef0c1', '285baa0b-9742-4241-86fe-9f682874e43a', null, 3),
      ('0b9f429b-7c1f-469b-8c3f-85db43eef0c1', '38ba1090-6331-4a54-a0c8-777e72b3deca', null, 4),
      -- COLLEGE_D3 · 2019 · Northern Atlantic Coast D-III College Men's CC 2019 (northern-atlantic-coast-d-iii-college-mens-cc-2019) · ended 2019-04-14
      ('8235d8c0-bca0-4753-903f-349b2060a6d3', '129d2506-4d7f-44c8-9717-6c6e6dd2de7b', null, 1),
      ('8235d8c0-bca0-4753-903f-349b2060a6d3', '5125c661-92b7-4e85-a1e9-7081553b8fbb', null, 2),
      ('8235d8c0-bca0-4753-903f-349b2060a6d3', 'ba40a8e4-4deb-4a2a-b0e7-1f9cce27dac7', null, 3),
      ('8235d8c0-bca0-4753-903f-349b2060a6d3', '5cee4980-34d0-4fd5-b4c7-9748378fb3f3', null, 4),
      ('8235d8c0-bca0-4753-903f-349b2060a6d3', '83320e27-253e-48aa-83ca-b387e3af8bd7', null, 5),
      ('8235d8c0-bca0-4753-903f-349b2060a6d3', '3153af98-2eb4-4203-ba2d-6ca47e1eb414', null, 6),
      -- COLLEGE_D3 · 2019 · Ohio D-III College Women's CC 2019 (ohio-d-iii-college-womens-cc-2019) · ended 2019-04-14
      ('890eb0db-2585-49ba-bf2f-1e7126b8689c', 'e5a490a7-5450-4c33-af08-f353e19c9e34', null, 1),
      ('890eb0db-2585-49ba-bf2f-1e7126b8689c', 'f852b72e-f66b-4bad-852b-12ff907381d3', null, 2),
      -- COLLEGE_D3 · 2019 · South Central D-III College Women's CC 2019 (south-central-d-iii-college-womens-cc-2019) · ended 2019-04-14
      ('8b83014d-0218-47d4-b798-2cedc5e0fecb', 'e720f0a9-1cbf-4c19-97f5-c9cb53586a50', null, 1),
      ('8b83014d-0218-47d4-b798-2cedc5e0fecb', '52bffe42-1a58-430d-8c93-9582c794392b', null, 2),
      ('8b83014d-0218-47d4-b798-2cedc5e0fecb', '8bdda5c8-96a1-4b13-bfe2-05e3fc91271d', null, 3),
      ('8b83014d-0218-47d4-b798-2cedc5e0fecb', 'e0cbf903-51ca-49d3-a4f3-4a2b243bee54', null, 4),
      ('8b83014d-0218-47d4-b798-2cedc5e0fecb', '50cb2efe-da34-46ff-aacd-fcef8ed65b96', null, 5),
      ('8b83014d-0218-47d4-b798-2cedc5e0fecb', '7ea29555-1a14-4024-9f0f-21093a20adc8', null, 6),
      ('8b83014d-0218-47d4-b798-2cedc5e0fecb', '86a87a1d-4af6-4248-99ca-36e79d20f069', null, 7),
      -- COLLEGE_D3 · 2019 · South New England D-III College Women's CC 2019 (south-new-england-d-iii-college-womens-cc-2019) · ended 2019-04-14
      ('e85501df-18ce-4ed2-bc2f-d94e4ac23205', '8f104a75-1cd6-46d3-9a5f-110cfbb67501', null, 1),
      ('e85501df-18ce-4ed2-bc2f-d94e4ac23205', '6a72886d-25e1-4632-b818-92a1ab40da26', null, 2),
      ('e85501df-18ce-4ed2-bc2f-d94e4ac23205', 'd39be1cf-dcb9-4bab-8d9a-c99f712f3e8a', null, 3),
      ('e85501df-18ce-4ed2-bc2f-d94e4ac23205', 'affd2032-d295-4188-995d-cbd5c055a93f', null, 4),
      ('e85501df-18ce-4ed2-bc2f-d94e4ac23205', '9fb18055-8079-49bf-8097-57b25e053710', null, 5),
      ('e85501df-18ce-4ed2-bc2f-d94e4ac23205', 'b4560ada-70f7-485a-8cf8-d12b65bb6b19', null, 5),
      ('e85501df-18ce-4ed2-bc2f-d94e4ac23205', '7e88b584-5296-4b9e-903b-569006b39a40', null, 7),
      ('e85501df-18ce-4ed2-bc2f-d94e4ac23205', '93121591-abd5-4fba-ac6d-3b86cc591206', null, 8),
      -- COLLEGE_D3 · 2019 · Southwest D-III College Men's CC 2019 (southwest-d-iii-college-mens-cc-2019) · ended 2019-04-14
      ('227d9130-4bac-4fed-8334-a6105cec96e7', '225b81b1-3430-43db-bd80-749840e34826', null, 1),
      ('227d9130-4bac-4fed-8334-a6105cec96e7', 'edb70c76-104a-448d-b9eb-3ca389644b04', null, 2),
      ('227d9130-4bac-4fed-8334-a6105cec96e7', '580eefa9-29e3-4cda-b281-f90677a39319', null, 3),
      ('227d9130-4bac-4fed-8334-a6105cec96e7', 'dc867525-d702-434c-b571-579194e2cd8b', null, 4),
      -- COLLEGE_D3 · 2019 · West Penn D-III College Men's CC 2019 (west-penn-d-iii-college-mens-cc-2019) · ended 2019-04-14
      ('0dd7d7f6-aa81-456f-a75e-30099fa13455', 'bb4d9e5c-4a0a-4e8a-9618-59bf22de1f72', null, 1),
      ('0dd7d7f6-aa81-456f-a75e-30099fa13455', '024a2cf7-ed6a-4f4f-9ff6-0d1147fab1d0', null, 2),
      ('0dd7d7f6-aa81-456f-a75e-30099fa13455', '6f1051b7-b735-4afd-b59d-aae2ee7b44ed', null, 3),
      ('0dd7d7f6-aa81-456f-a75e-30099fa13455', '51a43f25-1c9b-42ad-ba73-4831d1f79f85', null, 4),
      ('0dd7d7f6-aa81-456f-a75e-30099fa13455', 'd1d17e85-6657-4f20-b615-479c110a5106', null, 5),
      ('0dd7d7f6-aa81-456f-a75e-30099fa13455', 'b4c127ac-4f9b-452a-8471-4e9c2542198e', null, 6),
      ('0dd7d7f6-aa81-456f-a75e-30099fa13455', '1abe5ddf-438c-479e-95ff-4e1327e7a6cf', null, 7),
      ('0dd7d7f6-aa81-456f-a75e-30099fa13455', 'a33d7f62-855b-43fe-ba1d-4a376c279238', null, 8),
      -- COLLEGE_D3 · 2019 · West Plains D-III College Men's CC 2019 (west-plains-d-iii-college-mens-cc-2019) · ended 2019-04-14
      ('bc7e45e9-66bf-486d-a79e-d3ca80153d07', '2fe96c03-69cb-4611-9022-de4b66e7d268', null, 1),
      ('bc7e45e9-66bf-486d-a79e-d3ca80153d07', 'c81ac5b5-3bd9-4f31-a8a2-c282f088aeb1', null, 2),
      ('bc7e45e9-66bf-486d-a79e-d3ca80153d07', 'aaf0aa61-95c7-4b4f-b0b5-0edb0382b7e5', null, 3),
      ('bc7e45e9-66bf-486d-a79e-d3ca80153d07', 'f885a04b-c2f2-4729-b321-648a3ab263d6', null, 4),
      -- COLLEGE_D3 · 2019 · Western NY D-III College Men's CC 2019 (western-ny-d-iii-college-mens-cc-2019) · ended 2019-04-14
      ('44f8dd38-5253-4c02-b384-92d13b7118b0', '8f5b9fc1-b7fe-4b9d-afab-445a2e99692a', null, 1),
      ('44f8dd38-5253-4c02-b384-92d13b7118b0', '7b5753ca-e7b2-4d96-9618-c3e7af2b4814', null, 2),
      ('44f8dd38-5253-4c02-b384-92d13b7118b0', 'e492c484-f5ee-4b1a-a528-6b6f3250256c', null, 3),
      ('44f8dd38-5253-4c02-b384-92d13b7118b0', '7778595c-d029-4fc5-a3c6-568a512d205d', null, 4),
      -- COLLEGE_D3 · 2019 · Western NY D-III College Women's CC 2019 (western-ny-d-iii-college-womens-cc-2019) · ended 2019-04-14
      ('a126e7df-c0f2-4308-9a09-730c1ed2b5d1', '031d9c0a-3f23-413d-92a5-81c5ece47cb3', null, 1),
      ('a126e7df-c0f2-4308-9a09-730c1ed2b5d1', 'b657c8b1-b774-43b7-9047-33654e135c4b', null, 2),
      ('a126e7df-c0f2-4308-9a09-730c1ed2b5d1', 'cc935c0a-6f8d-4991-b303-f3f26756be13', null, 3),
      ('a126e7df-c0f2-4308-9a09-730c1ed2b5d1', 'c851cd03-29c4-44ad-8600-6352f7109995', null, 4),
      ('a126e7df-c0f2-4308-9a09-730c1ed2b5d1', '6672f367-e54d-4723-82a5-2e6f225c8549', null, 5),
      ('a126e7df-c0f2-4308-9a09-730c1ed2b5d1', '737ec7d5-83b6-4683-be53-fca528525b39', null, 6),
      -- COLLEGE_D3 · 2019 · North New England D-III College Women's CC 2019 (north-new-england-d-iii-college-womens-cc-2019) · ended 2019-04-20
      ('75885bc5-cb9e-4f4a-a96f-bd4e86e6e34b', '63e5802b-0c7e-4208-8258-56e3dde27735', null, 1),
      ('75885bc5-cb9e-4f4a-a96f-bd4e86e6e34b', '82e46962-aa25-4c45-a11f-ee49a5d5cd36', null, 2),
      ('75885bc5-cb9e-4f4a-a96f-bd4e86e6e34b', '0562b992-4845-437b-86cc-30a882a4ad48', null, 3),
      ('75885bc5-cb9e-4f4a-a96f-bd4e86e6e34b', '0b5214d8-2518-4439-ac60-aa544eb78ac9', null, 4),
      -- COLLEGE_D3 · 2019 · North Central D-III College Women's CC 2019 (north-central-d-iii-college-womens-cc-2019) · ended 2019-04-21
      ('cd9da849-d5b1-4b4a-bcae-b4dc8941587e', 'a00e51bf-b6f8-4d1b-bcea-c9576d5ad501', null, 1),
      ('cd9da849-d5b1-4b4a-bcae-b4dc8941587e', 'ebfa2e31-d277-4d32-8726-2ac60219d22a', null, 2),
      ('cd9da849-d5b1-4b4a-bcae-b4dc8941587e', 'f22ff243-22d1-4a2b-b0f5-1523f5c450b0', null, 3),
      ('cd9da849-d5b1-4b4a-bcae-b4dc8941587e', '36cf9c13-c90f-4393-a251-b70d4468e3ca', null, 4),
      ('cd9da849-d5b1-4b4a-bcae-b4dc8941587e', '771921e9-4bc6-4408-a3fd-d61dcbe76557', null, 5),
      ('cd9da849-d5b1-4b4a-bcae-b4dc8941587e', '042815e0-7588-42f2-9147-839e9b985659', null, 6),
      ('cd9da849-d5b1-4b4a-bcae-b4dc8941587e', '60f6346a-109a-4c95-9a20-c355638ca622', null, 7),
      ('cd9da849-d5b1-4b4a-bcae-b4dc8941587e', '1f08ffb4-0d98-40a2-be65-54367346c6c9', null, 8),
      -- COLLEGE_D3 · 2019 · Northwest D-III College Men's CC 2019 (northwest-d-iii-college-mens-cc-2019) · ended 2019-04-21
      ('29da39bc-3b55-4bda-b2de-daf2a4755fc9', '2b2e3063-30c4-4190-9fe0-0be4468ab7a7', null, 1),
      ('29da39bc-3b55-4bda-b2de-daf2a4755fc9', 'af0c58cc-655d-4be3-ab95-bbaaeb7f64b6', null, 2),
      ('29da39bc-3b55-4bda-b2de-daf2a4755fc9', '2509bbb2-7f2d-488c-9eb6-06920a3a46da', null, 3),
      ('29da39bc-3b55-4bda-b2de-daf2a4755fc9', 'e7653c8b-7a3d-4fa0-987e-9b769058caaa', null, 4),
      ('29da39bc-3b55-4bda-b2de-daf2a4755fc9', 'd8014279-95a1-4c32-a509-87ea6e78c770', null, 5),
      ('29da39bc-3b55-4bda-b2de-daf2a4755fc9', '848b524a-7e5c-4f41-a472-c47896de58e2', null, 6),
      ('29da39bc-3b55-4bda-b2de-daf2a4755fc9', '526ce821-6587-41ed-b5a3-7a6c6765de70', null, 7),
      -- COLLEGE_D3 · 2019 · Northwest D-III College Women's CC 2019 (northwest-d-iii-college-womens-cc-2019) · ended 2019-04-21
      ('89fb5540-131d-4c98-9e93-44c0a88c5e6c', '38886d94-dbdd-4be5-a3c9-1d181f62dbd8', null, 1),
      ('89fb5540-131d-4c98-9e93-44c0a88c5e6c', '144002bb-a925-41e9-aaee-c7324a2e898a', null, 2),
      ('89fb5540-131d-4c98-9e93-44c0a88c5e6c', 'b5e2bc61-aa3c-44a4-9806-e9ff47381659', null, 3),
      ('89fb5540-131d-4c98-9e93-44c0a88c5e6c', '31142167-5fa5-4301-8b16-e2ddc35d2d83', null, 4),
      -- COLLEGE_D3 · 2019 · Northwoods D-III College Men's CC 2019 (northwoods-d-iii-college-mens-cc-2019) · ended 2019-04-21
      ('76bdcd04-7b3f-4fd7-830e-509c7549503c', 'f211b3d3-2402-46bf-b556-f6b27c201545', null, 1),
      ('76bdcd04-7b3f-4fd7-830e-509c7549503c', 'e604afe9-8ef0-41cb-b43f-23c60d181d0c', null, 2),
      ('76bdcd04-7b3f-4fd7-830e-509c7549503c', '9a4e22a2-dd0e-443e-ad55-b75404bf24e1', null, 3),
      ('76bdcd04-7b3f-4fd7-830e-509c7549503c', '39cae196-ee60-4c40-bbb7-4d289994b0e8', null, 4),
      ('76bdcd04-7b3f-4fd7-830e-509c7549503c', 'def912a1-e8c8-41fd-83ba-e644426537c3', null, 5),
      ('76bdcd04-7b3f-4fd7-830e-509c7549503c', '7e1059b6-40fa-402f-afe7-fb460ed187fe', null, 6),
      ('76bdcd04-7b3f-4fd7-830e-509c7549503c', '01862e04-983e-405e-ae97-aa4e3db5701c', null, 7),
      ('76bdcd04-7b3f-4fd7-830e-509c7549503c', '177e3ddc-f824-49dd-a5d9-9779bef27659', null, 8),
      -- COLLEGE_D3 · 2019 · Western Southeast D-III College Men's CC 2019 (western-southeast-d-iii-college-mens-cc-2019) · ended 2019-04-21
      ('50929114-5511-4db3-b5ef-7a9c19dc96f4', '8e33636b-48ad-445a-b096-6f8178cfcdfc', null, 1),
      ('50929114-5511-4db3-b5ef-7a9c19dc96f4', 'd245435c-4f5a-4494-b685-065573827363', null, 2),
      ('50929114-5511-4db3-b5ef-7a9c19dc96f4', 'ae03ee74-a63d-452f-9d83-7d9ad1f01746', null, 3),
      ('50929114-5511-4db3-b5ef-7a9c19dc96f4', '6c50cdcc-37cc-4bfa-8f84-e6ece3ce9660', null, 4),
      -- COLLEGE_D3 · 2019 · Metro East D-III College Men's Regionals 2019 (metro-east-d-iii-college-mens-regionals-2019) · ended 2019-04-28
      ('63c675b8-6f85-4756-a578-94da46325cf4', '8f5b9fc1-b7fe-4b9d-afab-445a2e99692a', null, 1),
      ('63c675b8-6f85-4756-a578-94da46325cf4', '69c656d5-0507-4938-a863-c259369c96e8', null, 2),
      ('63c675b8-6f85-4756-a578-94da46325cf4', '099b950d-539c-44d9-a1e5-bd0a1374c613', null, 3),
      ('63c675b8-6f85-4756-a578-94da46325cf4', 'e492c484-f5ee-4b1a-a528-6b6f3250256c', null, 3),
      ('63c675b8-6f85-4756-a578-94da46325cf4', '79238d54-1ce3-48ea-a637-ea89059ac2ee', null, 5),
      ('63c675b8-6f85-4756-a578-94da46325cf4', '28372a24-6035-465b-b448-75b51606de64', null, 6),
      ('63c675b8-6f85-4756-a578-94da46325cf4', '3ebda98a-aec1-44cd-b2a9-df5093c77ecf', null, 7),
      ('63c675b8-6f85-4756-a578-94da46325cf4', '7b5753ca-e7b2-4d96-9618-c3e7af2b4814', null, 7),
      ('63c675b8-6f85-4756-a578-94da46325cf4', 'bebbce60-550c-47db-a790-4057026036b1', null, 9),
      ('63c675b8-6f85-4756-a578-94da46325cf4', '04174ece-66d0-4a55-a8ea-b5e4bc89802c', null, 10),
      ('63c675b8-6f85-4756-a578-94da46325cf4', 'bef2cc8a-d558-4e8f-8d7a-bd677d8deb2d', null, 11),
      ('63c675b8-6f85-4756-a578-94da46325cf4', '7778595c-d029-4fc5-a3c6-568a512d205d', null, 12),
      -- COLLEGE_D3 · 2019 · New England D-III College Men's Regionals 2019 (new-england-d-iii-college-mens-regionals-2019) · ended 2019-04-28
      ('a00e0c8e-0659-4afd-81cb-d2b3de1b58d4', 'a61cd7ac-94ac-446e-8bf2-e4993b1d2499', null, 1),
      ('a00e0c8e-0659-4afd-81cb-d2b3de1b58d4', '92b8c41e-976d-40e1-9122-4fd9ae1d7dc6', null, 2),
      ('a00e0c8e-0659-4afd-81cb-d2b3de1b58d4', '65c7622e-491c-4fdf-ba1f-40ab51840a57', null, 3),
      ('a00e0c8e-0659-4afd-81cb-d2b3de1b58d4', '6dcc0e0a-2451-46a9-b22e-c804fc3aaf98', null, 4),
      ('a00e0c8e-0659-4afd-81cb-d2b3de1b58d4', '63b37d91-629f-4553-81fb-f4c2d75a1e68', null, 5),
      ('a00e0c8e-0659-4afd-81cb-d2b3de1b58d4', 'be3f2649-09ca-40c4-888c-dc922291b6a8', null, 6),
      ('a00e0c8e-0659-4afd-81cb-d2b3de1b58d4', '9e43af18-3416-40ba-9f07-73afa934159d', null, 7),
      ('a00e0c8e-0659-4afd-81cb-d2b3de1b58d4', '19ecda95-617e-48f7-aed9-ab68ea7a1b5e', null, 8),
      -- COLLEGE_D3 · 2019 · New England D-III College Women's Regionals 2019 (new-england-d-iii-college-womens-regionals-2019) · ended 2019-04-28
      ('af68e052-e928-4b36-a55e-8c476efc370a', '63e5802b-0c7e-4208-8258-56e3dde27735', null, 1),
      ('af68e052-e928-4b36-a55e-8c476efc370a', '8f104a75-1cd6-46d3-9a5f-110cfbb67501', null, 2),
      ('af68e052-e928-4b36-a55e-8c476efc370a', '82e46962-aa25-4c45-a11f-ee49a5d5cd36', null, 3),
      ('af68e052-e928-4b36-a55e-8c476efc370a', '6a72886d-25e1-4632-b818-92a1ab40da26', null, 4),
      ('af68e052-e928-4b36-a55e-8c476efc370a', '746f6c8a-82ac-495c-a4a2-a8d892058e13', null, 5),
      ('af68e052-e928-4b36-a55e-8c476efc370a', '548d75a3-541b-46eb-ae8c-843ec9d600d4', null, 6),
      ('af68e052-e928-4b36-a55e-8c476efc370a', '0562b992-4845-437b-86cc-30a882a4ad48', null, 7),
      ('af68e052-e928-4b36-a55e-8c476efc370a', 'd39be1cf-dcb9-4bab-8d9a-c99f712f3e8a', null, 8),
      -- COLLEGE_D3 · 2019 · North Central D-III College Men's Regionals 2019 (north-central-d-iii-college-mens-regionals-2019) · ended 2019-04-28
      ('b0e588bf-e12a-418d-a9a2-e3e338b0dcb8', 'f211b3d3-2402-46bf-b556-f6b27c201545', null, 1),
      ('b0e588bf-e12a-418d-a9a2-e3e338b0dcb8', '8726e639-83a8-49f7-9032-e56a871a9aca', null, 2),
      ('b0e588bf-e12a-418d-a9a2-e3e338b0dcb8', 'e604afe9-8ef0-41cb-b43f-23c60d181d0c', null, 5),
      ('b0e588bf-e12a-418d-a9a2-e3e338b0dcb8', '39cae196-ee60-4c40-bbb7-4d289994b0e8', null, 6),
      ('b0e588bf-e12a-418d-a9a2-e3e338b0dcb8', '4de2bee6-9286-4f84-a29d-9feebb74b71d', null, 7),
      ('b0e588bf-e12a-418d-a9a2-e3e338b0dcb8', '7e1059b6-40fa-402f-afe7-fb460ed187fe', null, 8),
      ('b0e588bf-e12a-418d-a9a2-e3e338b0dcb8', '01862e04-983e-405e-ae97-aa4e3db5701c', null, 9),
      ('b0e588bf-e12a-418d-a9a2-e3e338b0dcb8', 'def912a1-e8c8-41fd-83ba-e644426537c3', null, 10),
      -- COLLEGE_D3 · 2019 · Ohio Valley D-III College Women's Regionals 2019 (ohio-valley-d-iii-college-womens-regionals-2019) · ended 2019-04-28
      ('416a417b-f040-4fcb-bfe5-32bc1bb2a151', 'e5a490a7-5450-4c33-af08-f353e19c9e34', null, 1),
      ('416a417b-f040-4fcb-bfe5-32bc1bb2a151', 'd14ed4e1-7a2e-41f9-9e3b-a0a8d79c2df7', null, 2),
      ('416a417b-f040-4fcb-bfe5-32bc1bb2a151', '2ef0fcc0-c5f7-42b5-8d48-dfbe952dd03e', null, 3),
      ('416a417b-f040-4fcb-bfe5-32bc1bb2a151', 'bb3da8de-7647-4e30-ad46-96bcb5afac7b', null, 4),
      -- COLLEGE_D3 · 2019 · South Central D-III College Men's Regionals 2019 (south-central-d-iii-college-mens-regionals-2019) · ended 2019-04-28
      ('be666d31-684d-4230-a0e6-a96b77376480', '9ac0ab23-414f-42da-b67b-ace2ab5c76c6', null, 1),
      ('be666d31-684d-4230-a0e6-a96b77376480', '3e0867a1-8581-4d5e-b6d4-c24ddc669110', null, 2),
      ('be666d31-684d-4230-a0e6-a96b77376480', 'd854ee93-9c9c-46ff-a203-4da269768084', null, 3),
      ('be666d31-684d-4230-a0e6-a96b77376480', '96bd0fbc-62b2-45ae-a43c-ce288380bcc2', null, 4),
      ('be666d31-684d-4230-a0e6-a96b77376480', '6fa4b03f-aa8d-4c22-b4fd-1b1454a9e38e', null, 5),
      ('be666d31-684d-4230-a0e6-a96b77376480', 'c6bda270-4144-4c63-86ac-a641b1da8263', null, 6),
      ('be666d31-684d-4230-a0e6-a96b77376480', 'c06c3a42-d735-4563-a985-f64b5101707c', null, 7),
      ('be666d31-684d-4230-a0e6-a96b77376480', '4828e375-af46-4c8a-a71b-5cde40f49556', null, 8),
      -- COLLEGE_D3 · 2019 · Southeast D-III College Men's Regionals 2019 (southeast-d-iii-college-mens-regionals-2019) · ended 2019-04-28
      ('c55a54c0-07d0-41cd-83de-81c12624ce6d', 'ed8afbac-a13d-4ce1-a31e-070ef3057784', null, 1),
      ('c55a54c0-07d0-41cd-83de-81c12624ce6d', '446fe423-d5a4-4576-8e82-a20fa1538adb', null, 2),
      ('c55a54c0-07d0-41cd-83de-81c12624ce6d', '125571f2-b428-4aea-881e-cf59625b7eb9', null, 3),
      ('c55a54c0-07d0-41cd-83de-81c12624ce6d', '8e33636b-48ad-445a-b096-6f8178cfcdfc', null, 4),
      ('c55a54c0-07d0-41cd-83de-81c12624ce6d', '737cc591-7ec7-4a31-abc0-7c763480c89f', null, 5),
      ('c55a54c0-07d0-41cd-83de-81c12624ce6d', '5018aa84-f676-4897-ae4b-ff8605ed9da9', null, 6),
      -- COLLEGE_D3 · 2019 · D-III College Championships 2019 (d-iii-college-championships-2019) · ended 2019-05-19
      ('f5628145-c1dd-4518-8b03-8e8ef056369d', 'a61cd7ac-94ac-446e-8bf2-e4993b1d2499', null, 1),
      ('f5628145-c1dd-4518-8b03-8e8ef056369d', 'e5a490a7-5450-4c33-af08-f353e19c9e34', null, 1),
      ('f5628145-c1dd-4518-8b03-8e8ef056369d', '63e5802b-0c7e-4208-8258-56e3dde27735', null, 2),
      ('f5628145-c1dd-4518-8b03-8e8ef056369d', '9ac0ab23-414f-42da-b67b-ace2ab5c76c6', null, 2),
      ('f5628145-c1dd-4518-8b03-8e8ef056369d', '5125c661-92b7-4e85-a1e9-7081553b8fbb', null, 3),
      ('f5628145-c1dd-4518-8b03-8e8ef056369d', 'a00e51bf-b6f8-4d1b-bcea-c9576d5ad501', null, 3),
      ('f5628145-c1dd-4518-8b03-8e8ef056369d', 'ae1caba6-48eb-4519-aff1-1d060093c75c', null, 3),
      ('f5628145-c1dd-4518-8b03-8e8ef056369d', 'f211b3d3-2402-46bf-b556-f6b27c201545', null, 3),
      -- COLLEGE_D3 · 2021 · North Central D-III College Women's CC 2021 (north-central-d-iii-college-womens-cc-2021) · ended 2021-10-17
      ('5699ddd6-4e88-493a-ae73-4cf6a2a5c7e0', '68394f71-5581-4f16-9771-08d3787e2a32', null, 1),
      ('5699ddd6-4e88-493a-ae73-4cf6a2a5c7e0', 'c2bd8383-98b0-44fb-b9a6-d9fc2f4d3297', null, 2),
      ('5699ddd6-4e88-493a-ae73-4cf6a2a5c7e0', 'ab9541f6-ae16-44dd-9482-b65f1f2720a6', null, 3),
      -- COLLEGE_D3 · 2021 · Northern Atlantic Coast D-III College Men's CC 2021 (northern-atlantic-coast-d-iii-college-mens-cc-2021) · ended 2021-10-17
      ('801b312f-58f6-4a6a-bbfb-2602f70352e3', '84472f61-4e47-4045-bbf8-e94454808d21', null, 1),
      ('801b312f-58f6-4a6a-bbfb-2602f70352e3', 'c8004e2c-81c6-4054-9c7c-0d5c604283cf', null, 2),
      -- COLLEGE_D3 · 2021 · Northwest D-III College Men's CC 2021 (northwest-d-iii-college-mens-cc-2021) · ended 2021-10-17
      ('87aaff21-e917-409f-b0e5-dd33af10780d', 'f0780450-973d-4917-928c-1abf35814cfe', null, 1),
      ('87aaff21-e917-409f-b0e5-dd33af10780d', '0d3bf176-56f4-4a06-bcd4-487f817ae8dd', null, 2),
      ('87aaff21-e917-409f-b0e5-dd33af10780d', 'aa880bf9-d1a1-4a75-b262-9d33d4e729e6', null, 3),
      ('87aaff21-e917-409f-b0e5-dd33af10780d', '03905038-7550-444d-b731-973f368cc9da', null, 4),
      ('87aaff21-e917-409f-b0e5-dd33af10780d', '6b36e9df-e29e-45d3-8b5a-8ba89121d718', null, 7),
      ('87aaff21-e917-409f-b0e5-dd33af10780d', '689a1e1a-9a17-42cb-819c-39d200fd3c63', null, 8),
      -- COLLEGE_D3 · 2021 · Northwest D-III College Women's CC 2021 (northwest-d-iii-college-womens-cc-2021) · ended 2021-10-17
      ('4f38fafc-a283-4897-8e71-85e0bbec42b6', '9f5e381d-d868-4a8b-9911-ff56d8f3c2cd', null, 1),
      ('4f38fafc-a283-4897-8e71-85e0bbec42b6', '59f4e224-6c21-4bf3-8c59-7d86987fa8ab', null, 2),
      ('4f38fafc-a283-4897-8e71-85e0bbec42b6', 'db8d7293-07f6-44ea-ac9d-f2f2ebda8668', null, 3),
      -- COLLEGE_D3 · 2021 · Northwoods D-III College Men's CC 2021 (northwoods-d-iii-college-mens-cc-2021) · ended 2021-10-17
      ('30ffef57-ffbe-4edd-a2a8-e8e26ff1c96c', '8c61717a-61d9-459f-93aa-d01adc960bfe', null, 4),
      ('30ffef57-ffbe-4edd-a2a8-e8e26ff1c96c', 'a8a1214a-4ac5-44aa-b206-19460522ebb0', null, 5),
      -- COLLEGE_D3 · 2021 · Ozarks D-III College Men's CC 2021 (ozarks-d-iii-college-mens-cc-2021) · ended 2021-10-17
      ('8fcd6169-1946-45c0-817a-43cd6dde46d8', '69cbfde8-5742-4303-a7eb-321b45ca0068', null, 1),
      ('8fcd6169-1946-45c0-817a-43cd6dde46d8', 'c774bd59-56c1-4fb4-af9e-cfa99751f8b7', null, 2),
      ('8fcd6169-1946-45c0-817a-43cd6dde46d8', '9c05fdd3-5c7c-485d-a2d5-46299cf60e3c', null, 3),
      ('8fcd6169-1946-45c0-817a-43cd6dde46d8', '4709c2bc-0376-4bc6-abdd-dfc62e6ab6fe', null, 4),
      -- COLLEGE_D3 · 2021 · South Central D-III College Women's CC 2021 (south-central-d-iii-college-womens-cc-2021) · ended 2021-10-17
      ('7eb9f25f-db97-4116-8692-b879bc0c9c3c', '5d3c7ddb-aa17-4f39-bf96-2408a78e61ec', null, 1),
      ('7eb9f25f-db97-4116-8692-b879bc0c9c3c', '749a8258-a0b6-4c7e-9630-2df802d748d6', null, 2),
      ('7eb9f25f-db97-4116-8692-b879bc0c9c3c', 'b5bef04d-00a7-4414-8903-f355887d09a9', null, 3),
      ('7eb9f25f-db97-4116-8692-b879bc0c9c3c', '5582bbd0-0ac4-4f2d-82f8-a79258f0001c', null, 4),
      -- COLLEGE_D3 · 2021 · Western NY D-III College Men's CC 2021 (western-ny-d-iii-college-mens-cc-2021) · ended 2021-10-17
      ('2958a1e6-bd57-4634-a928-0458f91e07c1', '5e2b6b6e-b264-4fbb-bc76-07d17fd95e89', null, 4),
      ('2958a1e6-bd57-4634-a928-0458f91e07c1', '69dd2cc9-9f34-4671-95aa-fa6522001071', null, 4),
      -- COLLEGE_D3 · 2021 · Southeast D-III College Men's CC 2021 (southeast-d-iii-college-mens-cc-2021) · ended 2021-10-31
      ('ba06be80-3def-480c-ad87-7d3053b15759', '9b1a5cc2-4d7f-43e5-bedb-44a47ceb4dc2', null, 3),
      ('ba06be80-3def-480c-ad87-7d3053b15759', '49857337-18d1-4787-ad52-8e8b5889d5ec', null, 4),
      -- COLLEGE_D3 · 2021 · Atlantic Coast D-III College Men's Regionals 2021 (atlantic-coast-d-iii-college-mens-regionals-2021) · ended 2021-11-07
      ('59c596ed-0aaf-49c5-b544-0d03eca3419e', '84472f61-4e47-4045-bbf8-e94454808d21', null, 1),
      ('59c596ed-0aaf-49c5-b544-0d03eca3419e', 'c8004e2c-81c6-4054-9c7c-0d5c604283cf', null, 2),
      ('59c596ed-0aaf-49c5-b544-0d03eca3419e', 'e24e1916-d9e9-4e71-9047-e74904b42949', null, 3),
      ('59c596ed-0aaf-49c5-b544-0d03eca3419e', 'a3cdcd85-62a4-4fdb-b4ab-d203e462afba', null, 4),
      ('59c596ed-0aaf-49c5-b544-0d03eca3419e', '2a1c76cf-e758-4246-8363-5ae147a60a1f', null, 5),
      ('59c596ed-0aaf-49c5-b544-0d03eca3419e', '8421bc86-52ab-4c2d-85c0-05f23c5276eb', null, 6),
      ('59c596ed-0aaf-49c5-b544-0d03eca3419e', 'a0969fd2-537c-44a7-b420-c12ae181b975', null, 7),
      ('59c596ed-0aaf-49c5-b544-0d03eca3419e', '3ec374cc-c46a-4886-9c5a-5d8edf91f5b7', null, 8),
      -- COLLEGE_D3 · 2021 · Great Lakes D-III College Men's Regionals 2021 (great-lakes-d-iii-college-mens-regionals-2021) · ended 2021-11-07
      ('93fcc495-a999-40d5-881e-b3b9a0f0fc3d', '2bc6ea56-a707-4d7b-871f-e193bec70ec4', null, 3),
      ('93fcc495-a999-40d5-881e-b3b9a0f0fc3d', 'd6390cba-b05b-4ecc-9406-f8c76db16133', null, 4),
      ('93fcc495-a999-40d5-881e-b3b9a0f0fc3d', '40c0cb87-c137-44c7-b72c-0b1e907dcbd9', null, 5),
      ('93fcc495-a999-40d5-881e-b3b9a0f0fc3d', 'e7b439d5-1153-40ff-8ad8-bc619ec3038f', null, 6),
      -- COLLEGE_D3 · 2021 · New England D-III College Women's Regionals 2021 (new-england-d-iii-college-womens-regionals-2021) · ended 2021-11-14
      ('82b75a90-e9bd-4a11-9366-274f5b0dab0f', 'a74b76a6-af24-4ed4-8132-439db31074f5', null, 1),
      ('82b75a90-e9bd-4a11-9366-274f5b0dab0f', 'a60afba2-406f-4fa0-afb3-56450cc1007e', null, 2),
      ('82b75a90-e9bd-4a11-9366-274f5b0dab0f', '0d80ba05-e574-44dc-9901-c198a54fa759', null, 3),
      ('82b75a90-e9bd-4a11-9366-274f5b0dab0f', 'bef51898-cfe9-4589-bcb2-b3086bcf91f3', null, 4),
      -- COLLEGE_D3 · 2021 · Ohio Valley D-III College Men's Regionals 2021 (ohio-valley-d-iii-college-mens-regionals-2021) · ended 2021-11-14
      ('c01e1ff9-2972-41c6-bf7d-511c3be02bb0', '2b7e1833-edf6-468c-bead-39a6930e8218', null, 1),
      ('c01e1ff9-2972-41c6-bf7d-511c3be02bb0', '61e645ad-7416-47ba-b9c2-fa517621cd00', null, 2),
      ('c01e1ff9-2972-41c6-bf7d-511c3be02bb0', '6a5524b7-2191-44ee-b520-ccfe0831975f', null, 3),
      ('c01e1ff9-2972-41c6-bf7d-511c3be02bb0', '85adde55-3b05-48be-9b08-977dbd169037', null, 4),
      ('c01e1ff9-2972-41c6-bf7d-511c3be02bb0', '8517a8cc-e553-4f66-9259-e158d1478c93', null, 5),
      ('c01e1ff9-2972-41c6-bf7d-511c3be02bb0', '21748344-c38d-4c9c-9e34-e2726870adc9', null, 6),
      -- COLLEGE_D3 · 2021 · Ohio Valley D-III College Women's Regionals 2021 (ohio-valley-d-iii-college-womens-regionals-2021) · ended 2021-11-14
      ('c12ddc8e-bf7f-421b-97c3-b651b32b2e0a', '7c0a7765-d1b7-4b4d-a715-23ae7f9213f4', null, 1),
      ('c12ddc8e-bf7f-421b-97c3-b651b32b2e0a', 'de460e29-15ed-4c84-ab5f-39f0b3e30013', null, 2),
      ('c12ddc8e-bf7f-421b-97c3-b651b32b2e0a', '12df292a-1c6b-4bae-ba80-cbb0299989e6', null, 3),
      -- COLLEGE_D3 · 2022 · Eastern Metro East D-III College Women's CC (Eastern-Metro-East-D-III-College-Womens-CC-2022) · ended 2022-04-16
      ('8fe46a13-675e-40d0-8e2a-4c35e5a9e5e9', '96dd5eae-fb34-4ffb-bcaa-35b5da3d4079', null, 1),
      ('8fe46a13-675e-40d0-8e2a-4c35e5a9e5e9', '685edad9-7542-4e29-b513-ed129fa5df96', null, 2),
      ('8fe46a13-675e-40d0-8e2a-4c35e5a9e5e9', '12995bf4-7d0b-4ddb-bf59-efb02ff6d401', null, 3),
      -- COLLEGE_D3 · 2022 · North Central D-III College Women's CC (North-Central-D-III-College-Womens-CC-2022) · ended 2022-04-17
      ('4bc625f3-3aec-449a-8561-469ec5967a8e', '6923a67d-8fb5-4cbb-a129-81d198c4b990', null, 1),
      ('4bc625f3-3aec-449a-8561-469ec5967a8e', 'b91d5fe2-fc8f-451e-9d11-9589899578a0', null, 2),
      ('4bc625f3-3aec-449a-8561-469ec5967a8e', '57d78b0f-1189-4263-9d54-325bf25a4c8d', null, 5),
      ('4bc625f3-3aec-449a-8561-469ec5967a8e', '3631f836-07dc-4e06-9ce4-344ab4dc170e', null, 6),
      -- COLLEGE_D3 · 2022 · Northwest D-III College Men's CC (Northwest-D-III-College-Mens-CC-2022) · ended 2022-04-17
      ('50956772-3d6d-4825-9900-aaa9c2e00d11', '45ffb708-3893-4c2a-8816-f3ccfbcaf79c', null, 1),
      ('50956772-3d6d-4825-9900-aaa9c2e00d11', 'ab0b2e29-3c6d-4af8-a0dc-d4b0e34d805f', null, 2),
      ('50956772-3d6d-4825-9900-aaa9c2e00d11', '08b75979-2a0a-47e8-a3d1-3bbf7bfc0003', null, 3),
      -- COLLEGE_D3 · 2022 · Northwoods D-III College Men's CC (Northwoods-D-III-College-Mens-CC-2022) · ended 2022-04-17
      ('b1b0e077-648a-46f1-a0d6-2c13692d339b', '0be71b0c-ff8f-4efd-87cb-2f2b41c9f46f', null, 1),
      ('b1b0e077-648a-46f1-a0d6-2c13692d339b', '2f5be858-a6f5-4d8f-af2b-bcbcfd32dff5', null, 2),
      -- COLLEGE_D3 · 2022 · Ohio D-III College Men's CC (Ohio-D-III-College-Mens-CC-2022) · ended 2022-04-17
      ('66c64778-e712-4935-b03c-8160b871ffde', 'c5079e10-7887-4209-95d3-bce165d05398', null, 1),
      ('66c64778-e712-4935-b03c-8160b871ffde', '3ad8a73e-0bcd-48bf-9cbc-e13e61c26f57', null, 2),
      -- COLLEGE_D3 · 2022 · Atlantic Coast D-III College Women's CC (Atlantic-Coast-D-III-College-Womens-CC-2022) · ended 2022-04-24
      ('b43daf80-28f7-4498-be41-94242a7730f9', 'c62b83ce-83bd-4ae1-8868-ffd42f2e2da8', null, 1),
      ('b43daf80-28f7-4498-be41-94242a7730f9', 'bf0cc89b-e1c2-432a-9ee9-1b05adb97121', null, 2),
      ('b43daf80-28f7-4498-be41-94242a7730f9', '854d1edc-4e4c-4916-8d76-17da3f618a6c', null, 3),
      ('b43daf80-28f7-4498-be41-94242a7730f9', '8ed3d2cf-fd4e-4d82-a7cb-de217ebfbfb7', null, 4),
      -- COLLEGE_D3 · 2022 · Great Lakes D-III College Women's CC (Great-Lakes-D-III-College-Womens-CC-2022) · ended 2022-04-24
      ('6aa3572b-d2f4-4914-8466-d3a75f79179f', '17642663-4a20-4ca4-9e39-ffca590110ec', null, 1),
      ('6aa3572b-d2f4-4914-8466-d3a75f79179f', '6989007e-8583-4273-a720-37e2d5eeedff', null, 2),
      ('6aa3572b-d2f4-4914-8466-d3a75f79179f', '3c8bb104-c0c7-460a-9889-ff0ef07b7d52', null, 3),
      ('6aa3572b-d2f4-4914-8466-d3a75f79179f', '7553ca47-c66c-44d9-942e-7efea53a9d2c', null, 3),
      -- COLLEGE_D3 · 2022 · Hudson Valley D-III College Men's CC (Hudson-Valley-D-III-College-Mens-CC-2022) · ended 2022-04-24
      ('55e07fcd-aad4-4072-b0c9-c3963ec0fcc3', '95f35a11-97b3-4731-9dba-ee6b710d389b', null, 1),
      ('55e07fcd-aad4-4072-b0c9-c3963ec0fcc3', 'c8c0d893-18c6-4380-b584-3fb8f9944d7a', null, 2),
      ('55e07fcd-aad4-4072-b0c9-c3963ec0fcc3', '05ca2ecd-5222-40d4-9b98-8eab853ee6e0', null, 3),
      ('55e07fcd-aad4-4072-b0c9-c3963ec0fcc3', 'd2ad4d88-2860-4419-a8db-99a5842f78f3', null, 4),
      ('55e07fcd-aad4-4072-b0c9-c3963ec0fcc3', '4b709413-9882-4ec5-97ce-81e13b62d373', null, 5),
      ('55e07fcd-aad4-4072-b0c9-c3963ec0fcc3', '58b044a5-7cf2-4ce8-bb0d-292453a805d8', null, 6),
      ('55e07fcd-aad4-4072-b0c9-c3963ec0fcc3', '7f330d46-241d-4efc-be03-d9c2c81ed0a0', null, 7),
      -- COLLEGE_D3 · 2022 · Lake Superior D-III College Men's CC (Lake-Superior-D-III-College-Mens-CC-2022) · ended 2022-04-24
      ('5bd34d3a-74b1-46e8-9f33-28b489f9813d', '52a6f3f7-e583-4b63-8b9a-a620a3d59512', null, 1),
      ('5bd34d3a-74b1-46e8-9f33-28b489f9813d', '9a19e7c9-c0d6-41fe-814d-67b128b9a383', null, 2),
      ('5bd34d3a-74b1-46e8-9f33-28b489f9813d', '6cd21ebb-fb08-4570-8c9e-1d7febec14e6', null, 3),
      ('5bd34d3a-74b1-46e8-9f33-28b489f9813d', '6e0ed877-fc44-4629-824f-ee2ac6b064af', null, 4),
      -- COLLEGE_D3 · 2022 · Southeast D-III College Men's CC (Southeast-D-III-College-Mens-CC-2022) · ended 2022-04-24
      ('96a8be98-136a-4e7a-8afd-12a92ab49efa', '48b76e19-7214-4704-adff-f3875fd5c720', null, 1),
      ('96a8be98-136a-4e7a-8afd-12a92ab49efa', 'd7f24695-757f-4f1c-b937-be94dcfd33c9', null, 2),
      ('96a8be98-136a-4e7a-8afd-12a92ab49efa', '664835f6-bd91-4897-9314-f6c451c4e2ac', null, 3),
      ('96a8be98-136a-4e7a-8afd-12a92ab49efa', 'f1a7668f-6134-4669-a4d6-1d9198689e05', null, 3),
      -- COLLEGE_D3 · 2022 · Southeast D-III College Women's CC (Southeast-D-III-College-Womens-CC-2022) · ended 2022-04-24
      ('b58da3a9-6def-4214-9166-018b84706974', '188c8d94-df8a-4bff-baa6-de1f5e334cf5', null, 1),
      ('b58da3a9-6def-4214-9166-018b84706974', 'b728242e-7c55-43d0-a0a0-160d66fa3ed2', null, 2),
      -- COLLEGE_D3 · 2022 · West Penn D-III College Men's CC (West-Penn-D-III-College-Mens-CC-2022) · ended 2022-04-24
      ('5b0706bc-ab93-4b4c-bcda-595f7181c281', '835758ea-816c-41d2-8ae6-e3a4a9a3c441', null, 1),
      ('5b0706bc-ab93-4b4c-bcda-595f7181c281', '96c67a67-7388-43fc-bd9f-29f854f42268', null, 2),
      ('5b0706bc-ab93-4b4c-bcda-595f7181c281', '92de781e-b64d-43a8-b368-5db7418c26db', null, 3),
      ('5b0706bc-ab93-4b4c-bcda-595f7181c281', '59d576dd-8add-4314-8358-bea9fc9e0800', null, 4),
      -- COLLEGE_D3 · 2022 · New England D-III College Men's Regionals (New-England-D-III-College-Mens-Regionals-2022) · ended 2022-05-01
      ('4b2428bf-80c0-4c70-a420-d5bf391f6582', 'da45308b-0f97-478b-97b7-9da7d22a8559', null, 1),
      ('4b2428bf-80c0-4c70-a420-d5bf391f6582', '17f6a9fe-b0c5-4fad-b486-7a565b04bac0', null, 2),
      ('4b2428bf-80c0-4c70-a420-d5bf391f6582', 'de35e9dc-7784-414d-bdad-ac6c96063cc9', null, 3),
      ('4b2428bf-80c0-4c70-a420-d5bf391f6582', '9dc6d266-ba88-4425-9ba5-332cf4085966', null, 4),
      ('4b2428bf-80c0-4c70-a420-d5bf391f6582', 'e90bea67-aac1-4b2d-ba46-2f34c24be84f', null, 5),
      ('4b2428bf-80c0-4c70-a420-d5bf391f6582', '923df210-c96c-49fc-953a-662c9a62997c', null, 6),
      ('4b2428bf-80c0-4c70-a420-d5bf391f6582', '0b3e41c5-dca9-49f8-b83f-d7542ecdc0af', null, 7),
      ('4b2428bf-80c0-4c70-a420-d5bf391f6582', '1a1a06cf-cc00-4c8f-9d11-12b07b470e2f', null, 8),
      -- COLLEGE_D3 · 2022 · Ohio Valley D-III College Men's Regionals (Ohio-Valley-D-III-College-Mens-Regionals-2022) · ended 2022-05-01
      ('0a3cecb9-5033-49dc-b4bf-0d2ef41bd3b9', 'c5079e10-7887-4209-95d3-bce165d05398', null, 1),
      ('0a3cecb9-5033-49dc-b4bf-0d2ef41bd3b9', '44194c27-d52a-406a-93c2-3c9158a9e39c', null, 2),
      ('0a3cecb9-5033-49dc-b4bf-0d2ef41bd3b9', '10a812c3-514b-4d9e-944f-db89aff3eac9', null, 3),
      ('0a3cecb9-5033-49dc-b4bf-0d2ef41bd3b9', 'ff5786d9-ff7a-473b-ac67-f6a6d2845f1d', null, 4),
      ('0a3cecb9-5033-49dc-b4bf-0d2ef41bd3b9', '96c67a67-7388-43fc-bd9f-29f854f42268', null, 5),
      ('0a3cecb9-5033-49dc-b4bf-0d2ef41bd3b9', '3ad8a73e-0bcd-48bf-9cbc-e13e61c26f57', null, 6),
      ('0a3cecb9-5033-49dc-b4bf-0d2ef41bd3b9', '361f5253-88e0-49a4-9465-7f93b72fdc91', null, 7),
      ('0a3cecb9-5033-49dc-b4bf-0d2ef41bd3b9', 'c9e966e6-8cf7-47c6-87de-c3a5d09bf61d', null, 8),
      ('0a3cecb9-5033-49dc-b4bf-0d2ef41bd3b9', 'd93ce583-70d4-4159-8d49-37138da689d3', null, 9),
      ('0a3cecb9-5033-49dc-b4bf-0d2ef41bd3b9', '92de781e-b64d-43a8-b368-5db7418c26db', null, 10),
      ('0a3cecb9-5033-49dc-b4bf-0d2ef41bd3b9', '835758ea-816c-41d2-8ae6-e3a4a9a3c441', null, 11),
      ('0a3cecb9-5033-49dc-b4bf-0d2ef41bd3b9', '3fc81583-8946-440b-aa08-67845d3f39a5', null, 12),
      -- COLLEGE_D3 · 2022 · South Central D-III College Men's Regionals (South-Central-D-III-College-Mens-Regionals-2022) · ended 2022-05-01
      ('ddeb878a-9de7-4649-9d14-df39a990ef35', '78a7c899-1b4d-47a4-bbe0-a5ed3f8453d5', null, 1),
      ('ddeb878a-9de7-4649-9d14-df39a990ef35', 'af1a95df-10aa-4eb3-8528-fede7be75239', null, 2),
      ('ddeb878a-9de7-4649-9d14-df39a990ef35', 'ec842c5a-1631-447d-bd9e-873866f6d7b1', null, 3),
      ('ddeb878a-9de7-4649-9d14-df39a990ef35', '9b7d5dbf-599e-448b-b374-f23a26ead6a3', null, 4),
      ('ddeb878a-9de7-4649-9d14-df39a990ef35', '34e63db6-6b7f-46bf-9a19-e6c2f35fab8b', null, 5),
      ('ddeb878a-9de7-4649-9d14-df39a990ef35', '341f7d93-0c13-4b34-a16a-f2cd101807b3', null, 6),
      -- COLLEGE_D3 · 2022 · North Central D-III College Men's Regionals (North-Central-D-III-College-Mens-Regionals-2022) · ended 2022-05-08
      ('7642d994-bfb3-43aa-8a75-76f6382dbdc3', '9a19e7c9-c0d6-41fe-814d-67b128b9a383', null, 2),
      ('7642d994-bfb3-43aa-8a75-76f6382dbdc3', '52a6f3f7-e583-4b63-8b9a-a620a3d59512', null, 3),
      ('7642d994-bfb3-43aa-8a75-76f6382dbdc3', '6cd21ebb-fb08-4570-8c9e-1d7febec14e6', null, 4),
      ('7642d994-bfb3-43aa-8a75-76f6382dbdc3', '6900af37-32ed-4752-90d5-e05a1b708ab1', null, 7),
      ('7642d994-bfb3-43aa-8a75-76f6382dbdc3', '072098d9-1216-4032-92ea-fd3ea41f2ecc', null, 8),
      -- COLLEGE_D3 · 2022 · 2022 D-III College Championships (2022-D-III-College-Championships) · ended 2022-05-23
      ('0d6900ee-0777-4da3-84e4-128112dbfc2e', '011dee77-4c50-4e99-ad00-f127cf2264a3', null, 1),
      ('0d6900ee-0777-4da3-84e4-128112dbfc2e', 'af1a95df-10aa-4eb3-8528-fede7be75239', null, 1),
      ('0d6900ee-0777-4da3-84e4-128112dbfc2e', '0be71b0c-ff8f-4efd-87cb-2f2b41c9f46f', null, 2),
      ('0d6900ee-0777-4da3-84e4-128112dbfc2e', '6b08f22e-d1c7-4123-80e3-542446ffcd2f', null, 2),
      ('0d6900ee-0777-4da3-84e4-128112dbfc2e', '48b76e19-7214-4704-adff-f3875fd5c720', null, 3),
      ('0d6900ee-0777-4da3-84e4-128112dbfc2e', '6923a67d-8fb5-4cbb-a129-81d198c4b990', null, 3),
      ('0d6900ee-0777-4da3-84e4-128112dbfc2e', 'b91d5fe2-fc8f-451e-9d11-9589899578a0', null, 3),
      ('0d6900ee-0777-4da3-84e4-128112dbfc2e', 'da45308b-0f97-478b-97b7-9da7d22a8559', null, 3),
      ('0d6900ee-0777-4da3-84e4-128112dbfc2e', '8a60faea-cd6c-4364-a94d-8c573e4d87c7', null, 5),
      ('0d6900ee-0777-4da3-84e4-128112dbfc2e', '9d9f70ea-e74f-4aee-977d-87764b04312c', null, 6),
      ('0d6900ee-0777-4da3-84e4-128112dbfc2e', '90bb44c2-8d2b-4686-9958-9bd2301c9e35', null, 9),
      ('0d6900ee-0777-4da3-84e4-128112dbfc2e', '96dd5eae-fb34-4ffb-bcaa-35b5da3d4079', null, 9),
      ('0d6900ee-0777-4da3-84e4-128112dbfc2e', '68b2f921-c45f-4b38-99d3-aece27fa481c', null, 10),
      ('0d6900ee-0777-4da3-84e4-128112dbfc2e', 'b24a5206-3e25-4f20-9d5b-15d30c96b077', null, 10),
      ('0d6900ee-0777-4da3-84e4-128112dbfc2e', '188c8d94-df8a-4bff-baa6-de1f5e334cf5', null, 11),
      ('0d6900ee-0777-4da3-84e4-128112dbfc2e', '4c47c718-03b1-440d-8678-1fedb7c35724', null, 11),
      ('0d6900ee-0777-4da3-84e4-128112dbfc2e', '17f6a9fe-b0c5-4fad-b486-7a565b04bac0', null, 12),
      ('0d6900ee-0777-4da3-84e4-128112dbfc2e', '451ef06b-aa2c-4bee-9387-a4bd3033038a', null, 12),
      -- COLLEGE_D3 · 2023 · Atlantic Coast D-III College Women's CC (Atlantic-Coast-D-III-College-Womens-CC-2023) · ended 2023-04-16
      ('aa231832-42ca-49fd-9951-2e9c3c240b2c', 'a327c2d6-5b32-44a2-afed-18ceaa4561d0', null, 1),
      ('aa231832-42ca-49fd-9951-2e9c3c240b2c', '3e168dbb-0637-47ee-832e-72ee7b0b51e9', null, 2),
      ('aa231832-42ca-49fd-9951-2e9c3c240b2c', 'dd27f124-e667-484e-8b51-eb7c45f0cd33', null, 3),
      ('aa231832-42ca-49fd-9951-2e9c3c240b2c', '9a301fdb-a83f-4098-8895-29fd9306b135', null, 4),
      -- COLLEGE_D3 · 2023 · Eastern Great Lakes D-III College Men's CC (Eastern-Great-Lakes-D-III-College-Mens-CC-2023) · ended 2023-04-16
      ('122436c7-c288-4cf1-ad89-3cb612b4d37e', '76a611ce-aa2a-441a-bf38-9b511c722e2f', null, 1),
      ('122436c7-c288-4cf1-ad89-3cb612b4d37e', '1092dcba-cfc2-4f6f-9ee5-6bca9526d576', null, 2),
      ('122436c7-c288-4cf1-ad89-3cb612b4d37e', '4b90d1df-7a54-4fac-93f2-b5287b7aec40', null, 3),
      ('122436c7-c288-4cf1-ad89-3cb612b4d37e', '75ca4925-44f4-42cb-ae97-e7cb90c9fda6', null, 4),
      ('122436c7-c288-4cf1-ad89-3cb612b4d37e', 'd8db26f8-29f7-4bc8-bf31-95dd8654c2a9', null, 4),
      ('122436c7-c288-4cf1-ad89-3cb612b4d37e', '851b95b4-07fe-4ede-914c-de27e9a90cf4', null, 5),
      -- COLLEGE_D3 · 2023 · Eastern Metro East D-III College Women's CC (Eastern-Metro-East-D-III-College-Womens-CC-2023) · ended 2023-04-16
      ('53233885-2f54-428b-ad35-0271c19e3cd8', 'd74c9448-5b01-4d63-ab2a-30a2c9a31490', null, 1),
      ('53233885-2f54-428b-ad35-0271c19e3cd8', 'ef176795-c011-47d9-9f92-2da92a8c83f0', null, 2),
      ('53233885-2f54-428b-ad35-0271c19e3cd8', '1f66137b-96a0-4430-9428-341981c4b9bd', null, 3),
      ('53233885-2f54-428b-ad35-0271c19e3cd8', 'ef0ab7f1-6596-43e8-8976-5953f3ad5930', null, 4),
      -- COLLEGE_D3 · 2023 · Great Lakes D-III College Women's CC (Great-Lakes-D-III-College-Womens-CC-2023) · ended 2023-04-16
      ('9e6e6872-a975-4719-837e-7b2e840fabdc', '8e64724a-5eea-4e4f-9047-db82fb250b9c', null, 1),
      ('9e6e6872-a975-4719-837e-7b2e840fabdc', '3e30a79c-a61a-42b9-89bd-2d5d25c694d4', null, 2),
      ('9e6e6872-a975-4719-837e-7b2e840fabdc', 'e4e76f08-92c4-4953-8c52-1a46ad593902', null, 3),
      ('9e6e6872-a975-4719-837e-7b2e840fabdc', 'a7762b59-4aa2-429f-aa72-aeabf3365e0f', null, 4),
      -- COLLEGE_D3 · 2023 · Hudson Valley D-III College Men's CC (Hudson-Valley-D-III-College-Mens-CC-2023) · ended 2023-04-16
      ('cc701d67-d6a5-4b4f-b527-67144fa8529b', '09a21e41-c92d-4a50-b161-d805bf99305e', null, 1),
      ('cc701d67-d6a5-4b4f-b527-67144fa8529b', 'eeaacc24-a8b1-494f-a403-1e14f7ab4240', null, 2),
      ('cc701d67-d6a5-4b4f-b527-67144fa8529b', 'f98401d8-5296-458b-98e4-15b975487564', null, 3),
      ('cc701d67-d6a5-4b4f-b527-67144fa8529b', '626bd964-88d2-44de-9919-d87358100fcb', null, 4),
      ('cc701d67-d6a5-4b4f-b527-67144fa8529b', '5e7a5f84-9ab7-49c3-b925-4c5ff0977e7d', null, 5),
      ('cc701d67-d6a5-4b4f-b527-67144fa8529b', '393a891a-3bb0-418e-90b1-460286904fa3', null, 6),
      ('cc701d67-d6a5-4b4f-b527-67144fa8529b', '1e5120e2-0972-46ab-9b7a-5cea64e8580a', null, 7),
      ('cc701d67-d6a5-4b4f-b527-67144fa8529b', '08732091-ead1-46e2-ad15-707cccfb241d', null, 8),
      ('cc701d67-d6a5-4b4f-b527-67144fa8529b', 'bfd7b661-9799-4708-8e3d-dcb9fbb52744', null, 9),
      -- COLLEGE_D3 · 2023 · North Central D-III College Women's CC (North-Central-D-III-College-Womens-CC-2023) · ended 2023-04-16
      ('f35c84c5-458e-4799-98a6-a7a409e7cccf', 'c404901a-768b-4f90-a154-68943c374996', null, 1),
      ('f35c84c5-458e-4799-98a6-a7a409e7cccf', '07567748-2765-42ac-a301-bbcd0f7fa56a', null, 2),
      ('f35c84c5-458e-4799-98a6-a7a409e7cccf', '46a97601-79a7-4d08-98ce-9f977f90b41f', null, 3),
      ('f35c84c5-458e-4799-98a6-a7a409e7cccf', '110efca8-6cfc-4637-ac63-7a2994abebe8', null, 4),
      ('f35c84c5-458e-4799-98a6-a7a409e7cccf', 'adc17f95-6810-4bd4-8326-4bc0a16cca69', null, 5),
      ('f35c84c5-458e-4799-98a6-a7a409e7cccf', '25ee3384-e7b9-43b8-a9f9-18ab17cd1293', null, 6),
      ('f35c84c5-458e-4799-98a6-a7a409e7cccf', 'dd65a27b-20eb-41a8-8da0-e16f637bc694', null, 7),
      ('f35c84c5-458e-4799-98a6-a7a409e7cccf', '93c76dae-ded5-403e-a94a-f407ddf22e54', null, 8),
      -- COLLEGE_D3 · 2023 · Northwest D-III College Women's CC (Northwest-D-III-College-Womens-CC-2023) · ended 2023-04-16
      ('d42c16f0-9e20-4330-96ce-6ad714625ba4', '875f7c87-926c-44b3-b8d4-8ee98c52c6c8', null, 1),
      ('d42c16f0-9e20-4330-96ce-6ad714625ba4', 'cda2a3b9-a5da-41a0-9fa8-dd733fe88038', null, 2),
      -- COLLEGE_D3 · 2023 · Northwoods D-III College Men's CC (Northwoods-D-III-College-Mens-CC-2023) · ended 2023-04-16
      ('4c31c193-587b-4429-a2ba-215c6580d30d', 'd0e4686f-e258-4e61-8af1-0e0f39cb86bd', null, 1),
      ('4c31c193-587b-4429-a2ba-215c6580d30d', 'ec2dc499-8247-4070-a75e-200e3ec73390', null, 2),
      ('4c31c193-587b-4429-a2ba-215c6580d30d', '2dd90099-f667-48a7-90dc-baee5d438756', null, 3),
      ('4c31c193-587b-4429-a2ba-215c6580d30d', '90e4c76b-a912-4e46-8f4d-ef334affaa89', null, 4),
      ('4c31c193-587b-4429-a2ba-215c6580d30d', 'b8464821-af9d-49bb-b741-0510ef9bc0d4', null, 5),
      ('4c31c193-587b-4429-a2ba-215c6580d30d', 'ff36b4bb-0e08-4c6a-b05b-fc3237e82a70', null, 6),
      -- COLLEGE_D3 · 2023 · Ohio D-III College Men's CC (Ohio-D-III-College-Mens-CC-2023) · ended 2023-04-16
      ('f9dee1f6-cf8e-403b-8f58-b10ed38b460d', 'da92937c-df2b-4400-b9e5-f84e7e15c80e', null, 1),
      ('f9dee1f6-cf8e-403b-8f58-b10ed38b460d', 'cbb7cb35-a1eb-48f0-8c10-288c7c02392d', null, 2),
      -- COLLEGE_D3 · 2023 · Ohio D-III College Women's CC (Ohio-D-III-College-Womens-CC-2023) · ended 2023-04-16
      ('fda010c6-120a-4c67-9403-e1bd6ff87f34', '318d6dd2-53bf-4c1f-a559-c1f040aba80e', null, 1),
      ('fda010c6-120a-4c67-9403-e1bd6ff87f34', '3e9ebf87-9226-4cad-973d-694423a6eda9', null, 2),
      -- COLLEGE_D3 · 2023 · South Central D-III College Women's CC (South-Central-D-III-College-Womens-CC-2023) · ended 2023-04-16
      ('fdc582d3-887a-4f81-8a0b-6a9f288a4660', '3d68c6b8-0b5e-4a49-9de2-c4affc98d397', null, 1),
      ('fdc582d3-887a-4f81-8a0b-6a9f288a4660', '7175d0cd-942a-4cd1-a1d7-1933e783ac2c', null, 2),
      ('fdc582d3-887a-4f81-8a0b-6a9f288a4660', 'e1e9fe52-888e-42a5-be8f-897f1c4db45a', null, 3),
      ('fdc582d3-887a-4f81-8a0b-6a9f288a4660', '527f102a-9bdb-4b74-a700-bfe2c7039dab', null, 4),
      -- COLLEGE_D3 · 2023 · South New England D-III College Men's CC (South-New-England-D-III-College-Mens-CC-2023) · ended 2023-04-16
      ('a42507f1-6b87-4187-bdb6-3d4d7b6f303b', '80b1511c-6638-4b48-9f9e-f5df299792cc', null, 1),
      ('a42507f1-6b87-4187-bdb6-3d4d7b6f303b', '9b50d99f-5efc-4506-9b5f-8b331cc469df', null, 2),
      ('a42507f1-6b87-4187-bdb6-3d4d7b6f303b', 'fd929549-cbae-484e-884b-204122f69b9a', null, 3),
      ('a42507f1-6b87-4187-bdb6-3d4d7b6f303b', 'a3c71b18-6c48-4d35-8ca7-c8e66388e5f0', null, 4),
      ('a42507f1-6b87-4187-bdb6-3d4d7b6f303b', '2c4c0a86-8ddd-441a-a6fa-c537a1462249', null, 5),
      ('a42507f1-6b87-4187-bdb6-3d4d7b6f303b', '68547ea7-1c4d-4f51-acd9-69f393f8495e', null, 6),
      -- COLLEGE_D3 · 2023 · Southwest D-III College Women's CC (Southwest-D-III-College-Womens-CC-2023) · ended 2023-04-16
      ('f5282cf5-dfbc-4ecf-9209-eb19ccc7696d', 'a34ef2ce-5b3c-4285-bfbe-4418724cf4ab', null, 1),
      ('f5282cf5-dfbc-4ecf-9209-eb19ccc7696d', 'c715f165-59fa-4e02-8a06-415e3ac4acb8', null, 2),
      -- COLLEGE_D3 · 2023 · West Penn D-III College Men's CC (West-Penn-D-III-College-Mens-CC-2023) · ended 2023-04-16
      ('382ca005-5d62-4433-bef9-d1670403f415', 'f3f26f7e-e13f-45b9-89d7-2b0903e683e2', null, 3),
      ('382ca005-5d62-4433-bef9-d1670403f415', '60acaf29-6bc8-48f8-a56e-c3b67e09e0e9', null, 4),
      -- COLLEGE_D3 · 2023 · Western NY D-III College Men's CC (Western-NY-D-III-College-Mens-CC-2023) · ended 2023-04-16
      ('8713be75-97f6-4e47-8a3f-87f5094aed05', 'a07058cd-b7a2-4ecc-beea-4a49fcf7376f', null, 1),
      ('8713be75-97f6-4e47-8a3f-87f5094aed05', '885590c9-08c4-4f7c-8082-69fc42244286', null, 2),
      ('8713be75-97f6-4e47-8a3f-87f5094aed05', '82e33fb6-7329-4858-b0b1-334ad805b6b6', null, 3),
      ('8713be75-97f6-4e47-8a3f-87f5094aed05', 'de754838-d3e7-4b14-a1f4-08fc73b5e836', null, 4),
      ('8713be75-97f6-4e47-8a3f-87f5094aed05', 'c406afd9-a12b-4838-bb14-62ca9076dcd6', null, 5),
      ('8713be75-97f6-4e47-8a3f-87f5094aed05', '507ad8dd-d7d8-484b-92df-0e2334129be6', null, 6),
      ('8713be75-97f6-4e47-8a3f-87f5094aed05', '604a28b1-ed1b-4cec-8633-3d255ad26b97', null, 7),
      ('8713be75-97f6-4e47-8a3f-87f5094aed05', '0081fd08-4f3b-489e-9d08-97c31208f1e5', null, 8),
      -- COLLEGE_D3 · 2023 · Western NY D-III College Women's CC (Western-NY-D-III-College-Womens-CC-2023) · ended 2023-04-16
      ('cc96d23e-d594-4978-a7fe-cafccf04370d', '9e49f18f-f7bb-4fc4-b3fd-71f9411e76c9', null, 3),
      ('cc96d23e-d594-4978-a7fe-cafccf04370d', '9be267ee-da23-4851-8394-93c0a3ea529a', null, 4),
      -- COLLEGE_D3 · 2023 · Atlantic Coast D-III College Men's CC (Atlantic-Coast-D-III-College-Mens-CC-2023) · ended 2023-04-23
      ('11478a30-72bc-4a4a-a4ac-ad5408b96346', '4766a371-9bbc-4589-adae-c3747b5bd7ce', null, 1),
      ('11478a30-72bc-4a4a-a4ac-ad5408b96346', 'e14402dc-aa8c-4c1e-8ee3-b152ce5db8ca', null, 2),
      ('11478a30-72bc-4a4a-a4ac-ad5408b96346', 'a6f95e00-148d-46ae-bf1b-d7211b0e38ad', null, 3),
      ('11478a30-72bc-4a4a-a4ac-ad5408b96346', 'b4903058-5198-454e-b4a4-460070b68e5c', null, 4),
      -- COLLEGE_D3 · 2023 · North New England D-III College Men's CC (North-New-England-D-III-College-Mens-CC-2023) · ended 2023-04-23
      ('4a9550d0-5341-423a-b4d2-5e9ad4b9e720', '83d91800-cdd8-4665-bf35-acc9cd5f3be5', null, 1),
      ('4a9550d0-5341-423a-b4d2-5e9ad4b9e720', '1c636433-93bb-4d1b-b724-e90250e35a51', null, 2),
      -- COLLEGE_D3 · 2023 · Northwest D-III College Men's CC (Northwest-D-III-College-Mens-CC-2023) · ended 2023-04-23
      ('4f1171f4-4941-41d8-81dc-38d6b63f2c28', '04f66db8-0286-4581-b633-d1dfafddb92e', null, 1),
      ('4f1171f4-4941-41d8-81dc-38d6b63f2c28', 'f219dcd9-1d29-4215-9226-81136f109abb', null, 2),
      ('4f1171f4-4941-41d8-81dc-38d6b63f2c28', 'd4e3f847-6bd0-478b-a06b-5c0578444f6b', null, 3),
      -- COLLEGE_D3 · 2023 · Southeast D-III College Men's CC (Southeast-D-III-College-Mens-CC-2023) · ended 2023-04-23
      ('d5988185-c62c-4a7a-88d8-84ac0553e1ed', 'd64b763f-5b22-4e46-8570-24c03d76470d', null, 1),
      ('d5988185-c62c-4a7a-88d8-84ac0553e1ed', '7813e7da-76f9-4fc5-8c08-3b40e9e53b87', null, 2),
      ('d5988185-c62c-4a7a-88d8-84ac0553e1ed', 'fff0a474-f796-4afa-b759-ff77a6e0b4aa', null, 3),
      ('d5988185-c62c-4a7a-88d8-84ac0553e1ed', '2d308f8b-aadf-4510-9df7-2f80391bcff3', null, 4),
      -- COLLEGE_D3 · 2023 · Metro East D-III College Women's Regionals (Metro-East-D-III-College-Womens-Regionals-2023) · ended 2023-04-30
      ('374d57d2-32d9-4b4f-88c7-0764604c8cbd', '9e49f18f-f7bb-4fc4-b3fd-71f9411e76c9', null, 5),
      ('374d57d2-32d9-4b4f-88c7-0764604c8cbd', 'ef176795-c011-47d9-9f92-2da92a8c83f0', null, 6),
      ('374d57d2-32d9-4b4f-88c7-0764604c8cbd', '9be267ee-da23-4851-8394-93c0a3ea529a', null, 7),
      -- COLLEGE_D3 · 2023 · North Central D-III College Men's Regionals (North-Central-D-III-College-Mens-Regionals-2023) · ended 2023-04-30
      ('ba8dc536-5814-4150-81e1-4418ac2ea5a6', '14f6a57f-8c1b-44f1-85fc-68ef20d43fc1', null, 3),
      -- COLLEGE_D3 · 2023 · New England D-III College Men's Regionals (New-England-D-III-College-Mens-Regionals-2023) · ended 2023-05-07 · unfinished bracket: duplicates cleared only
      ('188ea3f8-79b8-42cf-8635-5bb0c056cd24', '80b1511c-6638-4b48-9f9e-f5df299792cc', 2, null), -- clear-conflict
      ('188ea3f8-79b8-42cf-8635-5bb0c056cd24', 'bcd95ab2-8a60-4e17-82f0-afe06528a209', 2, null), -- clear-conflict
      -- COLLEGE_D3 · 2023 · New England D-III College Women's Regionals (New-England-D-III-College-Womens-Regionals-2023) · ended 2023-05-07
      ('f4e869e8-a288-4537-a2a1-2e90ef2c03fa', '71ee52a3-a6b7-40b1-9513-616ed6249bfa', null, 6),
      -- COLLEGE_D3 · 2024 · Metro NY D-III College Men's Conferences (Metro-NY-D-III-Mens-Conferences-2024) · ended 2024-04-13
      ('921882c1-0c75-4129-9c7b-d8f6316a7c9b', '8ff14cac-0b86-40bf-bf4a-1508ce7a26ce', null, 1),
      ('921882c1-0c75-4129-9c7b-d8f6316a7c9b', 'dee2aeb5-2e23-4192-81b2-8ede644553f0', null, 2),
      ('921882c1-0c75-4129-9c7b-d8f6316a7c9b', '86c887bb-010d-4bdc-b0ba-968edd4510ab', null, 3),
      ('921882c1-0c75-4129-9c7b-d8f6316a7c9b', '9c660fd7-b631-469f-a635-807379a7a268', null, 4),
      -- COLLEGE_D3 · 2024 · Atlantic Coast D-III College Women's Conferences (Atlantic-Coast-D-III-Womens-Conferences-2024) · ended 2024-04-14
      ('2cf295f9-bf2f-4106-894e-d940fdd5d85d', 'd7628ddb-47ea-48ec-b3d1-a90eefebc521', null, 1),
      ('2cf295f9-bf2f-4106-894e-d940fdd5d85d', '708b127a-02fd-465b-9f93-1f728bf49333', null, 2),
      ('2cf295f9-bf2f-4106-894e-d940fdd5d85d', 'baba22a8-9441-49ea-957a-a34ae57d7161', null, 3),
      ('2cf295f9-bf2f-4106-894e-d940fdd5d85d', 'b2c5819c-768d-4f78-8cc7-af782b202b8b', null, 4),
      -- COLLEGE_D3 · 2024 · Eastern Great Lakes D-III College Men's Conferences (Eastern-Great-Lakes-D-III-Mens-Conferences-2024) · ended 2024-04-14
      ('b32ee99e-091e-439d-8cda-d75eeff850c7', 'b51db2f1-16b9-4499-80a3-86b0ec1bba48', null, 1),
      ('b32ee99e-091e-439d-8cda-d75eeff850c7', 'cfa12ca5-6a5d-446d-ac75-7180140a8520', null, 2),
      ('b32ee99e-091e-439d-8cda-d75eeff850c7', 'a20d3e96-2fe8-47a3-a9b8-417b5a48a204', null, 3),
      ('b32ee99e-091e-439d-8cda-d75eeff850c7', 'b6d80463-c84f-4282-afb0-8340bcfe1eee', null, 4),
      ('b32ee99e-091e-439d-8cda-d75eeff850c7', '7e74d536-c646-4c72-9e6a-66d003ce107d', null, 5),
      ('b32ee99e-091e-439d-8cda-d75eeff850c7', '12e962b2-10b4-4dcf-8f81-d295e5159183', null, 6),
      ('b32ee99e-091e-439d-8cda-d75eeff850c7', 'ee2dfe81-1aac-4e31-82d5-518d5ff4481f', null, 7),
      ('b32ee99e-091e-439d-8cda-d75eeff850c7', '5b47c8a7-59fe-474c-b536-3a9c4d167492', null, 8),
      -- COLLEGE_D3 · 2024 · Hudson Valley D-III College Men's Conferences (Hudson-Valley-D-III-Mens-Conferences-2024) · ended 2024-04-14
      ('c34a80dc-472e-4886-8664-954f4df8c24c', '89c1719f-bcfc-426b-934d-df55b5de721d', null, 1),
      ('c34a80dc-472e-4886-8664-954f4df8c24c', '2bff1773-073e-4a0a-a002-2349920b9118', null, 2),
      ('c34a80dc-472e-4886-8664-954f4df8c24c', '4045a6ed-a4ae-4604-a829-51fdc1414eb3', null, 3),
      ('c34a80dc-472e-4886-8664-954f4df8c24c', '9831ee15-8ec4-47c4-8b03-17abcdcd007f', null, 4),
      ('c34a80dc-472e-4886-8664-954f4df8c24c', '0cd34368-64eb-4ea8-a5f1-c3ef98eb8874', null, 5),
      ('c34a80dc-472e-4886-8664-954f4df8c24c', 'c03aee79-5a9e-4609-874e-daee793b193f', null, 6),
      ('c34a80dc-472e-4886-8664-954f4df8c24c', '843401ae-29e5-4715-84b3-21e3beecd8f3', null, 8),
      ('c34a80dc-472e-4886-8664-954f4df8c24c', '8f1809e3-9906-4ef9-80e8-2bd79d6298c6', null, 9),
      -- COLLEGE_D3 · 2024 · Lake Superior D-III College Men's Conferences (Lake-Superior-D-III-Mens-Conferences-2024) · ended 2024-04-14
      ('351b8796-1d2b-47ef-b0aa-5136e17a35fa', '6675562e-1130-4dee-b413-3864d9af90c1', null, 4),
      ('351b8796-1d2b-47ef-b0aa-5136e17a35fa', '1154204d-d527-4ad6-9539-07eb1ae0741f', null, 5),
      -- COLLEGE_D3 · 2024 · North Central D-III College Women's Conferences (North-Central-D-III-Womens-Conferences-2024) · ended 2024-04-14
      ('eb213471-56e1-48e5-a443-12273da2b8ab', 'ee8f2d0c-c8c2-4e5a-b0c7-28033beeba2e', null, 1),
      ('eb213471-56e1-48e5-a443-12273da2b8ab', '7c337a18-d77e-4481-b4c7-017f8b77cfba', null, 2),
      ('eb213471-56e1-48e5-a443-12273da2b8ab', '1d92af09-63ad-4afb-9d7d-60842738ef6c', null, 3),
      ('eb213471-56e1-48e5-a443-12273da2b8ab', '1269f472-49a1-451c-9f0e-bd11903b401d', null, 4),
      ('eb213471-56e1-48e5-a443-12273da2b8ab', '9a0d5811-0c66-4d08-aae1-dacba3651135', null, 5),
      ('eb213471-56e1-48e5-a443-12273da2b8ab', 'e47b0c0c-9b73-4347-a36f-84395c792574', null, 6),
      -- COLLEGE_D3 · 2024 · North New England D-III College Men's Conferences (North-New-England-D-III-Mens-Conferences-2024) · ended 2024-04-14
      ('e17c1d51-d967-45bf-9a08-75130bb5c6fa', '5d739ddb-55fa-4582-917b-cb450284b084', null, 1),
      ('e17c1d51-d967-45bf-9a08-75130bb5c6fa', '0aa35a6d-a90e-4cf2-8b4a-e17c8e61033d', null, 2),
      -- COLLEGE_D3 · 2024 · Northwest D-III College Men's Conferences (Northwest-D-III-Mens-Conferences-2024) · ended 2024-04-14
      ('3b279691-4c0f-441e-a509-dc087996a2f6', '7cd82375-d4c3-470f-b086-089d19ddd986', null, 1),
      ('3b279691-4c0f-441e-a509-dc087996a2f6', '0a87335d-0ab0-4390-9bc5-42c770580916', null, 2),
      ('3b279691-4c0f-441e-a509-dc087996a2f6', '24bba196-e0ab-4c0e-9596-d37e264f1d07', null, 3),
      ('3b279691-4c0f-441e-a509-dc087996a2f6', 'f75374bf-9fdd-404b-8f40-519fc0799a94', null, 4),
      -- COLLEGE_D3 · 2024 · Northwest D-III College Women's Conferences (Northwest-D-III-Womens-Conferences-2024) · ended 2024-04-14
      ('bc872064-84c4-4e00-be02-59a175429cf5', '63ea2d61-80bc-41ae-8c66-33482d7da088', null, 1),
      ('bc872064-84c4-4e00-be02-59a175429cf5', 'cb718acb-3184-4cd4-8b9f-fcc25244d635', null, 2),
      ('bc872064-84c4-4e00-be02-59a175429cf5', 'ced8a943-cf25-4636-b1bd-f45ef2507199', null, 3),
      -- COLLEGE_D3 · 2024 · Northwoods D-III College Men's Conferences (Northwoods-D-III-Mens-Conferences-2024) · ended 2024-04-14
      ('b3ded009-a4d7-4443-afd5-42dc4e750e5c', 'da2b5dc0-bae5-4961-92e6-fc9ea81bddb8', null, 1),
      ('b3ded009-a4d7-4443-afd5-42dc4e750e5c', '7b1b3bd1-2cb8-49f1-b470-530e711693f9', null, 2),
      ('b3ded009-a4d7-4443-afd5-42dc4e750e5c', 'a99eb67f-9e88-416c-9084-2bd1bb9a1ccc', null, 3),
      ('b3ded009-a4d7-4443-afd5-42dc4e750e5c', '67d3710a-5fb8-4a36-ab65-806b66f1391d', null, 4),
      ('b3ded009-a4d7-4443-afd5-42dc4e750e5c', '221e66d3-1c63-417d-b9a4-9d012a183689', null, 5),
      ('b3ded009-a4d7-4443-afd5-42dc4e750e5c', '69d7da12-d9c4-43db-b543-a43af14295fc', null, 6),
      ('b3ded009-a4d7-4443-afd5-42dc4e750e5c', '87ec6e44-614e-4af2-9ece-497fdf1ed408', null, 7),
      ('b3ded009-a4d7-4443-afd5-42dc4e750e5c', 'b4daa0e3-fcc3-47e8-ae30-43cbe78e4b25', null, 8),
      -- COLLEGE_D3 · 2024 · South Central D-III College Women's Conferences (South-Central-D-III-Womens-Conferences-2024) · ended 2024-04-14
      ('dd0a0288-0bdd-42b7-a5a0-e9d17ddd1ef5', '5c26f649-4371-4af7-af87-bd02b2a73ee8', null, 1),
      ('dd0a0288-0bdd-42b7-a5a0-e9d17ddd1ef5', 'b5239b69-2c8d-4033-b76a-2d175cb7d7e4', null, 2),
      ('dd0a0288-0bdd-42b7-a5a0-e9d17ddd1ef5', 'a1cd54ab-2dd0-47f5-977c-873afb9e8048', null, 3),
      -- COLLEGE_D3 · 2024 · South New England D-III College Men's Conferences (South-New-England-D-III-Mens-Conferences-2024) · ended 2024-04-14
      ('8fd508a1-ea09-421c-8707-587b84a1a987', '702de458-5ba9-48cb-8c88-939435bdfcdd', null, 1),
      ('8fd508a1-ea09-421c-8707-587b84a1a987', 'd1f924e2-9214-4ae2-aa1a-68b3faf14b0b', null, 2),
      ('8fd508a1-ea09-421c-8707-587b84a1a987', '0fc5f027-afe1-4a80-8595-845e858371d7', null, 3),
      ('8fd508a1-ea09-421c-8707-587b84a1a987', 'baf9b8b6-2ac3-40b2-9ae5-173b94f78df7', null, 4),
      ('8fd508a1-ea09-421c-8707-587b84a1a987', 'fc1782df-4b67-4b9c-b71a-4b855ccdfeb7', null, 5),
      ('8fd508a1-ea09-421c-8707-587b84a1a987', 'a8c1dade-ef36-41a2-9394-c1fc59656d78', null, 6),
      ('8fd508a1-ea09-421c-8707-587b84a1a987', '1b9e6ed8-ce7a-48d2-897d-a5c7d1c7d10a', null, 7),
      ('8fd508a1-ea09-421c-8707-587b84a1a987', '8a7c71fd-2b24-44b3-8275-9c6df734ef4e', null, 8),
      -- COLLEGE_D3 · 2024 · Southeast D-III College Men's Conferences (Southeast-D-III-Mens-Conferences-2024) · ended 2024-04-14
      ('f47b7086-93f8-4282-9887-ac11d88602ff', 'd42a5a85-b24b-4db7-b8be-733a2d795272', null, 1),
      ('f47b7086-93f8-4282-9887-ac11d88602ff', 'daa3197a-a766-44a5-bd26-a2e05a7fcbb6', null, 2),
      ('f47b7086-93f8-4282-9887-ac11d88602ff', '43e3dcd4-5865-4ea9-8079-d33031d721cf', null, 3),
      ('f47b7086-93f8-4282-9887-ac11d88602ff', '73f31c12-e5ba-4d5f-953a-f7cada469a9a', null, 4),
      ('f47b7086-93f8-4282-9887-ac11d88602ff', '2b986b7b-bdc2-47f7-ad08-05f6c5e747c5', null, 5),
      ('f47b7086-93f8-4282-9887-ac11d88602ff', 'fc64508a-13d2-484b-ba44-027ffefcd2d9', null, 6),
      -- COLLEGE_D3 · 2024 · Atlantic Coast D-III College Men's Conferences (Atlantic-Coast-D-III-Mens-Conferences-2024) · ended 2024-04-21
      ('45c20e44-dd2f-41ba-b4dc-c59bd4503349', 'a4bdebe9-9930-4095-965a-c2cc4faf219a', null, 1),
      ('45c20e44-dd2f-41ba-b4dc-c59bd4503349', '4209a09f-cdd4-4065-b709-c3ef7a4697f7', null, 2),
      ('45c20e44-dd2f-41ba-b4dc-c59bd4503349', '738bdda0-d828-4f55-bcc1-92f73ca933c4', null, 3),
      ('45c20e44-dd2f-41ba-b4dc-c59bd4503349', '920d56b8-3563-4e31-9815-edd831a68b03', null, 4),
      ('45c20e44-dd2f-41ba-b4dc-c59bd4503349', 'fbab77c4-95dc-4c22-9b72-9e5d30d2a8ff', null, 5),
      ('45c20e44-dd2f-41ba-b4dc-c59bd4503349', 'a1aeec6f-f0a9-4548-a285-6f4497f7f26c', null, 6),
      ('45c20e44-dd2f-41ba-b4dc-c59bd4503349', '24c22041-2e3d-4f19-88a7-41f2abb8a733', null, 7),
      ('45c20e44-dd2f-41ba-b4dc-c59bd4503349', 'add43d86-1102-40e5-9aa4-b136dd2bf587', null, 7),
      -- COLLEGE_D3 · 2024 · Metro Boston D-III College Men's Conferences (Metro-Boston-D-III-Mens-Conferences-2024) · ended 2024-04-21
      ('ecc4f84d-5a81-4ae3-ad62-c21bf82c6954', '9867f6b9-7a31-43d5-9eb5-61c7c364daad', null, 1),
      ('ecc4f84d-5a81-4ae3-ad62-c21bf82c6954', '32b8097f-9f37-4d7b-b283-516613d57d32', null, 2),
      ('ecc4f84d-5a81-4ae3-ad62-c21bf82c6954', '6e8feb08-62a2-44de-8f94-eab968dde79c', null, 3),
      -- COLLEGE_D3 · 2024 · Western NY D-III College Men's Conferences (Western-NY-D-III-Mens-Conferences-2024) · ended 2024-04-21
      ('3cc0a3e7-f7a3-4185-bed9-3f28584fcef9', 'f9d6b01d-f65c-4040-b54c-f9ef10f2398e', null, 1),
      ('3cc0a3e7-f7a3-4185-bed9-3f28584fcef9', '5177f03b-8427-43a8-85ca-31a10d8626f6', null, 2),
      ('3cc0a3e7-f7a3-4185-bed9-3f28584fcef9', '42cb93fe-8696-4a18-9091-7acb1c3dd96e', null, 5),
      ('3cc0a3e7-f7a3-4185-bed9-3f28584fcef9', '6d44947c-7708-47ff-8933-1eca565f63f7', null, 6),
      ('3cc0a3e7-f7a3-4185-bed9-3f28584fcef9', '751c130f-ddf2-478c-9949-0d62172df38f', null, 7),
      ('3cc0a3e7-f7a3-4185-bed9-3f28584fcef9', '65691635-af31-4479-bd67-082acfcc6c3b', null, 8),
      -- COLLEGE_D3 · 2024 · Great Lakes D-III College Men's Regionals (Great-Lakes-D-III-College-Mens-Regionals-2024) · ended 2024-04-28
      ('3ba7aed5-45a4-4269-bd9c-06cae5fbc57a', 'b51db2f1-16b9-4499-80a3-86b0ec1bba48', null, 1),
      ('3ba7aed5-45a4-4269-bd9c-06cae5fbc57a', 'a20d3e96-2fe8-47a3-a9b8-417b5a48a204', null, 2),
      ('3ba7aed5-45a4-4269-bd9c-06cae5fbc57a', '7e74d536-c646-4c72-9e6a-66d003ce107d', null, 3),
      ('3ba7aed5-45a4-4269-bd9c-06cae5fbc57a', 'cfa12ca5-6a5d-446d-ac75-7180140a8520', null, 3),
      -- COLLEGE_D3 · 2024 · Metro East D-III College Men's Regionals (Metro-East-D-III-College-Mens-Regionals-2024) · ended 2024-04-28
      ('a54d0596-a030-4db3-a035-b46643c683a7', '56a39f7b-76de-4974-9d60-85ccf5eed566', null, 5),
      ('a54d0596-a030-4db3-a035-b46643c683a7', '6d44947c-7708-47ff-8933-1eca565f63f7', null, 6),
      ('a54d0596-a030-4db3-a035-b46643c683a7', '5177f03b-8427-43a8-85ca-31a10d8626f6', null, 7),
      -- COLLEGE_D3 · 2024 · North Central D-III College Men's Regionals (North-Central-D-III-College-Mens-Regionals-2024) · ended 2024-04-28
      ('9ac64090-670b-4931-aeff-941d6a8e1a4c', 'a99eb67f-9e88-416c-9084-2bd1bb9a1ccc', null, 3),
      -- COLLEGE_D3 · 2024 · Ohio Valley D-III College Men's Regionals (Ohio-Valley-D-III-College-Mens-Regionals-2024) · ended 2024-04-28
      ('7d18ae1e-93fa-4a8e-a55c-154449af7c33', 'c11f9ea4-b57f-4ecd-a77e-93ffb0f543f8', null, 2),
      ('7d18ae1e-93fa-4a8e-a55c-154449af7c33', '68ee7ff5-a7b3-4bb7-81f8-f8f80ef59f66', 2, 3), -- correct
      ('7d18ae1e-93fa-4a8e-a55c-154449af7c33', 'bad105a5-f72c-4b21-83f5-d71a6907b98f', null, 4),
      -- COLLEGE_D3 · 2024 · South Central D-III College Men's Regionals (South-Central-D-III-College-Mens-Regionals-2024) · ended 2024-04-28
      ('e3b2b37f-a3c5-442f-8633-cfb3b8c2d1e7', 'd9f8d506-a592-4485-ab5e-77adf117016f', 3, 4), -- correct
      ('e3b2b37f-a3c5-442f-8633-cfb3b8c2d1e7', 'ff7c7a39-4870-46a2-9687-8c95074e100f', 3, 5), -- correct
      -- COLLEGE_D3 · 2024 · New England D-III College Men's Regionals (New-England-D-III-College-Mens-Regionals-2024) · ended 2024-05-05
      ('e54e0e96-8968-4e25-94d7-bfe8ac750481', '32b8097f-9f37-4d7b-b283-516613d57d32', null, 11),
      -- COLLEGE_D3 · 2025 · East Penn D-III Men's Conferences (East-Penn-D-III-Mens-Conferences-2025) · ended 2025-04-12
      ('d12618de-959a-45e8-b111-0fe31844f4fb', '45775b30-a840-4504-9ecc-b11900812a90', null, 1),
      ('d12618de-959a-45e8-b111-0fe31844f4fb', '12bc07c7-f30e-4f67-a855-ba4ce4a03487', null, 2),
      ('d12618de-959a-45e8-b111-0fe31844f4fb', '35dba91a-a23d-4135-b62c-cace1c31abc2', null, 3),
      -- COLLEGE_D3 · 2025 · West Plains D-III Men's Conferences (West-Plains-D-III-Mens-Conferences-2025) · ended 2025-04-12
      ('bee71e0e-14f7-438a-9bdf-093bb9f64677', 'a542a6e1-677c-4200-a81f-259d65446256', null, 1),
      ('bee71e0e-14f7-438a-9bdf-093bb9f64677', 'a910c350-7cee-4def-ae18-f1146711b5c0', null, 2),
      -- COLLEGE_D3 · 2025 · Atlantic Coast D-III Men's Conferences (Atlantic-Coast-D-III-Mens-Conferences-2025) · ended 2025-04-13
      ('29a72ad5-9d28-4eed-a842-c390ba2d9196', '987321aa-5bb5-43c3-b1a9-881280ba82ba', null, 1),
      ('29a72ad5-9d28-4eed-a842-c390ba2d9196', '37eb9ab4-e1cf-4242-887d-937047471a6f', null, 2),
      ('29a72ad5-9d28-4eed-a842-c390ba2d9196', '29851640-4dff-422c-bd25-5d6c7e5ae2ce', null, 3),
      ('29a72ad5-9d28-4eed-a842-c390ba2d9196', '5cec7376-63c5-4392-ac37-8ecf3a1fddaa', null, 4),
      ('29a72ad5-9d28-4eed-a842-c390ba2d9196', '8c9ad990-f4b1-4b73-b8cb-1e701db63beb', null, 5),
      ('29a72ad5-9d28-4eed-a842-c390ba2d9196', 'b61e859a-edd3-4ec4-8a03-e0b2249c3dd6', null, 6),
      -- COLLEGE_D3 · 2025 · Atlantic Coast D-III Women's Conferences (Atlantic-Coast-D-III-Womens-Conferences-2025) · ended 2025-04-13
      ('c72fa563-4c49-4096-91d2-33974693db31', '27389398-de80-456b-8b8f-8175cd0e449c', null, 1),
      ('c72fa563-4c49-4096-91d2-33974693db31', '61d01822-9b08-4636-b96c-15800a48250b', null, 2),
      ('c72fa563-4c49-4096-91d2-33974693db31', '18670664-297d-4e28-ab0c-b3126c16beae', null, 3),
      ('c72fa563-4c49-4096-91d2-33974693db31', 'f99e44bd-386f-4c25-aed1-d358bf714f72', null, 4),
      -- COLLEGE_D3 · 2025 · Eastern Great Lakes D-III Men's Conferences (Eastern-Great-Lakes-D-III-Mens-Conferences-2025) · ended 2025-04-13
      ('5991fcb4-e86f-4d28-be00-e3d19e15efbb', '65030f56-8661-40bd-867d-9355a52d3d52', null, 1),
      ('5991fcb4-e86f-4d28-be00-e3d19e15efbb', 'bce41fd5-73bc-4603-aa54-a6727442da90', null, 2),
      ('5991fcb4-e86f-4d28-be00-e3d19e15efbb', '593873b4-4d83-4ca0-9fbc-66a40598f7f2', null, 3),
      ('5991fcb4-e86f-4d28-be00-e3d19e15efbb', '562e44a5-1cc8-4d9f-aaf9-5d6d06dd0050', null, 4),
      ('5991fcb4-e86f-4d28-be00-e3d19e15efbb', '180dc199-7aac-44a0-b94c-fbee22287ec3', null, 5),
      ('5991fcb4-e86f-4d28-be00-e3d19e15efbb', 'd56edf4e-3cf7-4f53-b6c9-6f0acdb993a1', null, 6),
      ('5991fcb4-e86f-4d28-be00-e3d19e15efbb', 'a14cd5d1-80f3-410a-957d-7028b8103498', null, 7),
      ('5991fcb4-e86f-4d28-be00-e3d19e15efbb', 'e5dff411-cf2a-435f-b379-8bb09dba88a9', null, 8),
      -- COLLEGE_D3 · 2025 · Great Lakes D-III Women's Conferences (Great-Lakes-D-III-Womens-Conferences-2025) · ended 2025-04-13
      ('71d3e200-dee6-4dc5-89ee-fbe3b3c0dd15', '180f824a-f9d4-4c7a-93a3-3e4c437244b0', null, 1),
      ('71d3e200-dee6-4dc5-89ee-fbe3b3c0dd15', 'f26be83b-ec9b-43a0-88fc-50b442b7b4e7', null, 2),
      ('71d3e200-dee6-4dc5-89ee-fbe3b3c0dd15', '77e2ac50-c7e8-4610-bd54-380343b040ed', null, 3),
      ('71d3e200-dee6-4dc5-89ee-fbe3b3c0dd15', '776a2d3e-9138-4add-8c80-2baa725693dc', null, 4),
      -- COLLEGE_D3 · 2025 · Hudson Valley D-III Men's Conferences (Hudson-Valley-D-III-Mens-Conferences-2025) · ended 2025-04-13
      ('9509d9e9-875a-4626-be21-0979cd4b5964', '4c24ce62-7799-4786-808b-3e3b601c9e8b', null, 1),
      ('9509d9e9-875a-4626-be21-0979cd4b5964', '4208a937-f668-4be2-b1ba-ec519a0d31b8', null, 2),
      ('9509d9e9-875a-4626-be21-0979cd4b5964', '79303584-b2bb-4915-8cde-1b91f1f7b529', null, 3),
      ('9509d9e9-875a-4626-be21-0979cd4b5964', '18fd8be4-5fc3-42dc-8472-4ac0cb4b4204', null, 4),
      ('9509d9e9-875a-4626-be21-0979cd4b5964', '6cc328f3-f875-43a1-bd81-45a72c0523ff', null, 5),
      ('9509d9e9-875a-4626-be21-0979cd4b5964', '78496fdb-ccac-4f13-ae48-704e4df06594', null, 6),
      ('9509d9e9-875a-4626-be21-0979cd4b5964', 'ba7524a6-371e-4b7a-af5d-053621396bac', null, 7),
      ('9509d9e9-875a-4626-be21-0979cd4b5964', 'dc4aa656-2563-46d2-9b31-c073cb2e9c9a', null, 8),
      -- COLLEGE_D3 · 2025 · Metro Boston D-III Men's Conferences (Metro-Boston-D-III-Mens-Conferences-2025) · ended 2025-04-13
      ('b0f5b63e-40ef-49fb-9e1a-47cdba464629', 'd34e6fce-c3ee-4d27-b865-f645ebcad8be', null, 1),
      ('b0f5b63e-40ef-49fb-9e1a-47cdba464629', '4f8bf79c-d8f7-4a88-902c-c11e52f8a0ac', null, 2),
      ('b0f5b63e-40ef-49fb-9e1a-47cdba464629', '02c57f98-48ff-4a7d-8fd5-4a61f1c6973e', null, 3),
      ('b0f5b63e-40ef-49fb-9e1a-47cdba464629', '5be35af1-7916-4d44-bb47-9f28c0ba1bf1', null, 4),
      -- COLLEGE_D3 · 2025 · North Central D-III Women's Conferences (North-Central-D-III-Womens-Conferences-2025) · ended 2025-04-13
      ('5a6e9e06-e989-477f-a269-1e9ad4a942ba', '4497b184-e48a-4391-b564-1364d8af967b', null, 1),
      ('5a6e9e06-e989-477f-a269-1e9ad4a942ba', '8f6f5381-30ad-4482-9969-3ccd0a0f5492', null, 2),
      ('5a6e9e06-e989-477f-a269-1e9ad4a942ba', 'f09dc438-dfe7-4e14-8580-59193abdf0f9', null, 3),
      ('5a6e9e06-e989-477f-a269-1e9ad4a942ba', 'bc7fba0c-4875-49b4-80e0-173b8055959f', null, 4),
      ('5a6e9e06-e989-477f-a269-1e9ad4a942ba', 'ef259238-9562-405b-904e-b18d408d26da', null, 5),
      ('5a6e9e06-e989-477f-a269-1e9ad4a942ba', 'c37f5642-3f0d-4006-bad0-b00a66fc4532', null, 6),
      -- COLLEGE_D3 · 2025 · North New England D-III Men's Conferences (North-New-England-D-III-Mens-Conferences-2025) · ended 2025-04-13
      ('6bc74c6a-d976-4a84-8952-889e86555ffd', '1a792493-b96f-4fa4-8c3a-44ad2ec1c6e4', null, 1),
      ('6bc74c6a-d976-4a84-8952-889e86555ffd', '1b5f6658-2e08-49ad-bd4d-2e225ddcb851', null, 2),
      -- COLLEGE_D3 · 2025 · Northwest D-III Women's Conferences (Northwest-D-III-Womens-Conferences-2025) · ended 2025-04-13
      ('b214e895-7495-4ffc-829d-a112d80f6d18', '16f52999-3626-40e6-b6ec-07e19bbee11e', null, 1),
      ('b214e895-7495-4ffc-829d-a112d80f6d18', 'a62f0085-eed7-4189-90a5-fef913768142', null, 2),
      ('b214e895-7495-4ffc-829d-a112d80f6d18', 'a17381ab-425e-4fd9-88aa-eba07ebc7f41', null, 3),
      ('b214e895-7495-4ffc-829d-a112d80f6d18', '8fd38462-0211-4661-88ac-dbb344b51c74', null, 4),
      ('b214e895-7495-4ffc-829d-a112d80f6d18', '1285331b-4c37-484b-958b-11d899a3e39f', null, 5),
      ('b214e895-7495-4ffc-829d-a112d80f6d18', '7d1cc131-230a-49b1-b809-02ad793a37b9', null, 6),
      -- COLLEGE_D3 · 2025 · Northwoods D-III Men's Conferences (Northwoods-D-III-Mens-Conferences-2025) · ended 2025-04-13
      ('9563aa0f-72be-4c12-b44c-2a25c20c924d', 'd00c85de-e71b-49ec-8cb2-b4763337e11c', null, 1),
      ('9563aa0f-72be-4c12-b44c-2a25c20c924d', '7a0fda57-4e69-4b60-b1f7-79e0e8f915f8', null, 2),
      ('9563aa0f-72be-4c12-b44c-2a25c20c924d', 'd4e65fa8-0137-4ca7-adbb-243e3d635963', null, 3),
      ('9563aa0f-72be-4c12-b44c-2a25c20c924d', 'e38d5ca7-02a4-4440-86a9-f86e10c77baa', null, 4),
      ('9563aa0f-72be-4c12-b44c-2a25c20c924d', '371c3611-b401-4336-a068-ebfc74e463ca', null, 5),
      ('9563aa0f-72be-4c12-b44c-2a25c20c924d', '6497335f-fc0a-4381-a086-9bac0d7959cf', null, 6),
      ('9563aa0f-72be-4c12-b44c-2a25c20c924d', '35c031c6-01a8-459d-8d30-c7f9c52bae7e', null, 7),
      ('9563aa0f-72be-4c12-b44c-2a25c20c924d', '433ce8c1-4115-4939-8d2a-2ec016acdaa6', null, 8),
      -- COLLEGE_D3 · 2025 · Ohio D-III Men's Conferences (Ohio-D-III-Mens-Conferences-2025) · ended 2025-04-13
      ('85423bd4-3af1-4772-b241-ef3f9d43351f', '61aadd05-22bd-4285-af40-57799054da37', null, 1),
      ('85423bd4-3af1-4772-b241-ef3f9d43351f', 'c2af07c3-5d5d-46c3-bac6-1e4cf4cc59e2', null, 2),
      ('85423bd4-3af1-4772-b241-ef3f9d43351f', 'c6d28749-528a-4c31-83db-3449cfd8195c', null, 3),
      ('85423bd4-3af1-4772-b241-ef3f9d43351f', 'f0f72c16-1906-4226-8d55-4a4f894c5b86', null, 4),
      -- COLLEGE_D3 · 2025 · Ozarks D-III Men's Conferences (Ozarks-D-III-Mens-Conferences-2025) · ended 2025-04-13
      ('3404cece-9a2a-4e99-b7df-774d148435a8', 'c636ad94-5d25-4061-8484-8ef3cbce6531', null, 2),
      ('3404cece-9a2a-4e99-b7df-774d148435a8', '1d2794ab-5dce-423e-9e7c-049c7c30b163', null, 3),
      ('3404cece-9a2a-4e99-b7df-774d148435a8', 'e5246ccf-c639-48da-82f3-204798f97131', null, 4),
      ('3404cece-9a2a-4e99-b7df-774d148435a8', '1a6a4d74-52e9-4d55-b540-8c6890ae8921', null, 5),
      -- COLLEGE_D3 · 2025 · Pennsylvania D-III Women's Conferences (Pennsylvania-D-III-Womens-Conferences-2025) · ended 2025-04-13
      ('f5ba4cec-ae07-4bff-8d64-c9ea7f160b7c', '8aaccc9e-d792-4db0-a45a-592629dbf560', null, 1),
      ('f5ba4cec-ae07-4bff-8d64-c9ea7f160b7c', '529d686c-9236-4a21-94b2-280abc944d9f', null, 2),
      ('f5ba4cec-ae07-4bff-8d64-c9ea7f160b7c', '9d82cceb-4d87-4b50-bf3e-f087b3af5ecb', null, 3),
      ('f5ba4cec-ae07-4bff-8d64-c9ea7f160b7c', '40f1409b-f246-4712-8ffa-d62cbbb67cce', null, 4),
      -- COLLEGE_D3 · 2025 · South Central D-III Women's Conferences (South-Central-D-III-Womens-Conferences-2025) · ended 2025-04-13
      ('2f6be87a-ec91-4639-a7ef-6df82539d02c', '775611f4-ded6-4d98-903a-525efd623ee3', null, 1),
      ('2f6be87a-ec91-4639-a7ef-6df82539d02c', '910f98f4-5de3-4de9-a894-cf8a0e1a345e', null, 2),
      ('2f6be87a-ec91-4639-a7ef-6df82539d02c', '3ac9bfc9-3eb9-448a-b950-7553caf026a9', null, 3),
      ('2f6be87a-ec91-4639-a7ef-6df82539d02c', '612c39d0-6941-44be-ae32-ae6ae612a644', null, 4),
      -- COLLEGE_D3 · 2025 · Southeast D-III Men's Conferences (Southeast-D-III-Mens-Conferences-2025) · ended 2025-04-13
      ('510905d2-96a2-4189-8d21-1a48371b21b4', 'bafc1202-da19-4916-b6fb-8cf32498780d', null, 1),
      ('510905d2-96a2-4189-8d21-1a48371b21b4', '146b2985-3690-45e8-ab8b-23d47b024938', null, 2),
      ('510905d2-96a2-4189-8d21-1a48371b21b4', '9ac20f9a-3bd4-4c2f-be15-88236b75f68d', null, 3),
      ('510905d2-96a2-4189-8d21-1a48371b21b4', '8b22f3f4-677f-4fec-a8aa-64379a43b7d1', null, 4),
      -- COLLEGE_D3 · 2025 · Western NY D-III Men's Conferences (Western-NY-D-III-Mens-Conferences-2025) · ended 2025-04-13
      ('768437cc-f318-468e-b021-3ce87624bb9f', 'd29b60e3-08f1-4f4d-a688-bb5b8fb9a227', null, 1),
      ('768437cc-f318-468e-b021-3ce87624bb9f', '8bcc7878-785b-4a02-b16a-a8627161a61d', null, 2),
      -- COLLEGE_D3 · 2025 · Northwest D-III Men's Conferences (Northwest-D-III-Mens-Conferences-2025) · ended 2025-04-20
      ('69c08d55-411f-4bd7-aaea-6adc8e41df97', '633123a3-489e-4979-bfe3-68c40468b451', null, 1),
      ('69c08d55-411f-4bd7-aaea-6adc8e41df97', '0e834120-3bd2-4247-9858-d50bc0f23723', null, 2),
      ('69c08d55-411f-4bd7-aaea-6adc8e41df97', '0372ddd1-f7bc-4245-b286-399ae8023371', null, 3),
      ('69c08d55-411f-4bd7-aaea-6adc8e41df97', 'fb018fb9-6491-4169-9727-40fe7f836a26', null, 4),
      -- COLLEGE_D3 · 2025 · South New England D-III Men's Conferences (South-New-England-D-III-Mens-Conferences-2025) · ended 2025-04-20
      ('a787eb8b-9f1f-4633-939a-e1d5f7916275', '86874591-a7c9-4391-9c5b-f4d76cd1b608', null, 1),
      ('a787eb8b-9f1f-4633-939a-e1d5f7916275', 'f05045ce-9bac-4d44-8601-44fac021d4f1', null, 2),
      ('a787eb8b-9f1f-4633-939a-e1d5f7916275', '271dc5d2-5fe8-42ba-8d60-b92ef0672a5d', null, 4),
      ('a787eb8b-9f1f-4633-939a-e1d5f7916275', '005dc249-d518-430e-8025-2de21b03256f', null, 5),
      ('a787eb8b-9f1f-4633-939a-e1d5f7916275', '97eeafcb-3389-4f78-8c4b-c92fb82db75a', null, 6),
      -- COLLEGE_D3 · 2025 · Great Lakes D-III College Men's Regionals (Great-Lakes-D-III-Mens-Regionals-2025) · ended 2025-04-27
      ('9346ffa4-4cd2-4150-84e1-6253dd19e76a', '562e44a5-1cc8-4d9f-aaf9-5d6d06dd0050', 3, 4), -- correct
      -- COLLEGE_D3 · 2025 · Metro East D-III College Men's Regionals (Metro-East-D-III-College-Mens-Regionals-2025) · ended 2025-04-27
      ('df845daa-15ae-4e66-9d5c-896c0063e864', '538e5328-d812-4ae9-9a38-5a24fa509d4f', null, 4),
      ('df845daa-15ae-4e66-9d5c-896c0063e864', '4208a937-f668-4be2-b1ba-ec519a0d31b8', 3, 5), -- correct
      ('df845daa-15ae-4e66-9d5c-896c0063e864', '4a55d4a7-cf01-4c32-96fa-d1bb2f5ef5d3', null, 9),
      ('df845daa-15ae-4e66-9d5c-896c0063e864', '78496fdb-ccac-4f13-ae48-704e4df06594', null, 10),
      ('df845daa-15ae-4e66-9d5c-896c0063e864', '54eefeeb-0320-4d72-88c7-bdea69ec06bb', null, 11),
      -- COLLEGE_D3 · 2025 · Metro East D-III College Women's Regionals (Metro-East-D-III-College-Womens-Regionals-2025) · ended 2025-04-27
      ('5cbd4e66-a28d-404d-b774-43b396d7941b', '1d6e0a95-223f-4bd4-96f9-2d90b8cc436d', null, 4),
      ('5cbd4e66-a28d-404d-b774-43b396d7941b', '53c39101-5e39-4831-9ac2-c883329ee19a', 3, 5), -- correct
      -- COLLEGE_D3 · 2025 · Ohio Valley D-III College Women's Regionals (Ohio-Valley-D-III-College-Womens-Regionals-2025) · ended 2025-04-27
      ('501887e3-fb48-4e37-818b-19f1fc74f762', '45becbbd-8e16-4ce7-8620-269b233d00c0', null, 4),
      ('501887e3-fb48-4e37-818b-19f1fc74f762', '9d82cceb-4d87-4b50-bf3e-f087b3af5ecb', 3, 6), -- correct
      -- COLLEGE_D3 · 2025 · South Central D-III College Men's Regionals (South-Central-D-III-College-Mens-Regionals-2025) · ended 2025-04-27
      ('d7702acb-15d5-4fcd-987a-1cd1792bb57e', '2c2ef90f-e7d7-4519-bea3-6325846f83d9', 2, 3), -- correct
      ('d7702acb-15d5-4fcd-987a-1cd1792bb57e', 'e5246ccf-c639-48da-82f3-204798f97131', null, 4),
      -- COLLEGE_D3 · 2025 · New England D-III College Men's Regionals (New-England-D-III-College-Mens-Regionals-2025) · ended 2025-05-04
      ('db717040-45b9-431f-ac78-b1b96541ac64', 'b3af0291-9d86-4739-8103-78040ccf44b8', 3, 4), -- correct
      -- COLLEGE_D3 · 2026 · East Penn D-III Men's Conferences (East-Penn-D-III-Mens-Conferences-2026) · ended 2026-04-11
      ('a7ebc80c-aef5-4c84-96ce-aa8b5d9b7683', '91066665-580c-47c6-8de9-5e6dc54f65be', null, 1),
      ('a7ebc80c-aef5-4c84-96ce-aa8b5d9b7683', '4eab8843-a90e-4413-a1c4-391a7742d9c3', null, 2),
      ('a7ebc80c-aef5-4c84-96ce-aa8b5d9b7683', 'f3122a2f-4ac3-421b-bb57-52fd7dd020b6', null, 3),
      ('a7ebc80c-aef5-4c84-96ce-aa8b5d9b7683', 'd746ee92-d4d4-48ea-bc8d-5fdf21930f5d', null, 4),
      -- COLLEGE_D3 · 2026 · Atlantic Coast D-III Men's Conferences (Atlantic-Coast-D-III-Mens-Conferences-2026) · ended 2026-04-12
      ('59721484-ad0f-4a64-940e-c9f513ea1acc', '0f0f2c85-2b9d-431e-99f8-c35ef83b6648', null, 1),
      ('59721484-ad0f-4a64-940e-c9f513ea1acc', '4c898335-5296-4f92-adf6-8531c48ad7d5', null, 2),
      ('59721484-ad0f-4a64-940e-c9f513ea1acc', 'efefc78c-0d0a-42c9-bf9a-98f66263df6e', null, 3),
      ('59721484-ad0f-4a64-940e-c9f513ea1acc', '8b3dd4b4-6238-4b96-9e3c-268a871e70a8', null, 4),
      ('59721484-ad0f-4a64-940e-c9f513ea1acc', '07728214-1a50-4e18-9f21-29e49f8b9d71', null, 5),
      ('59721484-ad0f-4a64-940e-c9f513ea1acc', 'd34617e2-cc92-4c10-a7ec-f6979c13af41', null, 6),
      ('59721484-ad0f-4a64-940e-c9f513ea1acc', '566759bd-98e0-4496-b3de-301e15ccfcd0', null, 7),
      ('59721484-ad0f-4a64-940e-c9f513ea1acc', 'c2d472cf-4c77-45a0-92d9-6461bf7e84ad', null, 8),
      -- COLLEGE_D3 · 2026 · Atlantic Coast D-III Women's Conferences (Atlantic-Coast-D-III-Womens-Conferences-2026) · ended 2026-04-12
      ('cda1ebc5-edda-4976-ad6f-febf0a11d52b', 'bfd3d7d2-85c2-4557-a795-dd1812511307', null, 1),
      ('cda1ebc5-edda-4976-ad6f-febf0a11d52b', 'd9e6d7ce-2016-494a-b13c-2765237fa02d', null, 2),
      ('cda1ebc5-edda-4976-ad6f-febf0a11d52b', '07772434-4841-4411-b4a9-f1a95dd3d9d4', null, 3),
      ('cda1ebc5-edda-4976-ad6f-febf0a11d52b', '99ed1d01-963c-4531-bd2f-5c8bf2876e1d', null, 4),
      -- COLLEGE_D3 · 2026 · Eastern Great Lakes D-III Men's Conferences (Eastern-Great-Lakes-D-III-Mens-Conferences-2026) · ended 2026-04-12
      ('0b2bbe58-1126-4b4e-a4e0-656eb04a3841', '10a87fe1-254d-49e5-b59f-e648fb35ca7b', null, 1),
      ('0b2bbe58-1126-4b4e-a4e0-656eb04a3841', 'ccd0a057-6bf0-4e1c-b04f-2bd970a0de5b', null, 2),
      ('0b2bbe58-1126-4b4e-a4e0-656eb04a3841', '92cf9f6a-ab68-4c97-8446-fba800d05441', null, 3),
      ('0b2bbe58-1126-4b4e-a4e0-656eb04a3841', 'aa779dae-7014-4be2-85d4-3958b76ac29b', null, 4),
      -- COLLEGE_D3 · 2026 · Lake Superior D-III Men's Conferences (Lake-Superior-D-III-Mens-Conferences-2026) · ended 2026-04-12
      ('07447805-b15f-4c78-844a-6630584e97b8', 'f7d7dad7-542f-4b40-b916-d64c957cc217', null, 3),
      ('07447805-b15f-4c78-844a-6630584e97b8', 'e0975ddc-c667-4c25-b5d2-11c8ba839218', null, 4),
      ('07447805-b15f-4c78-844a-6630584e97b8', 'eeb0918a-b37c-4c8e-b373-b6470694cd17', null, 5),
      -- COLLEGE_D3 · 2026 · Metro Boston D-III Men's Conferences (Metro-Boston-D-III-Mens-Conferences-2026) · ended 2026-04-12
      ('be89b44d-b3c0-45c6-8369-2ce9123ab75f', '7668a09f-73de-4506-b68e-b9ffdba462bf', null, 1),
      ('be89b44d-b3c0-45c6-8369-2ce9123ab75f', '172558df-89ef-40b7-8f31-3b2fb3eb321a', null, 2),
      ('be89b44d-b3c0-45c6-8369-2ce9123ab75f', '2bfed78f-75a1-4347-ad2e-5a2c335f818b', null, 3),
      ('be89b44d-b3c0-45c6-8369-2ce9123ab75f', '5091526a-b429-4a7b-b4b9-09d2b750f09e', null, 4),
      -- COLLEGE_D3 · 2026 · North Central D-III Women's Conferences (North-Central-D-III-Womens-Conferences-2026) · ended 2026-04-12
      ('e36c0cbd-9e91-476b-bb48-def52b3f3ec1', 'a3190c90-9f08-4b0f-ab62-1c735af4d5b3', null, 1),
      ('e36c0cbd-9e91-476b-bb48-def52b3f3ec1', '7d50e94b-e6bb-4bcf-a81f-df124d522f7d', null, 2),
      ('e36c0cbd-9e91-476b-bb48-def52b3f3ec1', '7ffb4f3f-ffec-41ae-9f2c-b79064f7fe3e', null, 3),
      ('e36c0cbd-9e91-476b-bb48-def52b3f3ec1', '953a60cb-42de-4b64-8796-4280eb81b60d', null, 4),
      ('e36c0cbd-9e91-476b-bb48-def52b3f3ec1', '9ca7e211-d882-4202-914e-d74dc6e305f9', null, 5),
      ('e36c0cbd-9e91-476b-bb48-def52b3f3ec1', '25cd8bfc-3992-47be-bc6a-6cb8e14b555f', null, 6),
      ('e36c0cbd-9e91-476b-bb48-def52b3f3ec1', 'a6c51ab8-82a9-48cf-9375-9c4cbc689cae', null, 7),
      ('e36c0cbd-9e91-476b-bb48-def52b3f3ec1', '3beed008-8774-412c-be36-185c49949c35', null, 8),
      -- COLLEGE_D3 · 2026 · North New England D-III Men's Conferences (North-New-England-D-III-Mens-Conferences-2026) · ended 2026-04-12
      ('71a9d716-6127-4a29-aa7c-8c741f2d7dfd', '31c1c263-3f60-4a15-a247-b58f3c9de16a', null, 1),
      ('71a9d716-6127-4a29-aa7c-8c741f2d7dfd', '1bc4308c-74d4-4eb0-900c-1958b0fdcccf', null, 2),
      ('71a9d716-6127-4a29-aa7c-8c741f2d7dfd', 'f8544006-9e99-4980-9485-5353fc2ee0bb', null, 3),
      ('71a9d716-6127-4a29-aa7c-8c741f2d7dfd', 'd72df8f5-91ee-465d-8e23-c001d53421b0', null, 4),
      -- COLLEGE_D3 · 2026 · Northwest D-III Men's Conferences (Northwest-D-III-Mens-Conferences-2026) · ended 2026-04-12
      ('bcfd02ed-c07b-4a2e-ac3e-e86eb7d8924f', '9792abae-27f4-47ca-a8e0-ae2c917634f5', null, 1),
      ('bcfd02ed-c07b-4a2e-ac3e-e86eb7d8924f', 'f964b8e8-2f81-4879-82f1-af5f09bf6e81', null, 2),
      ('bcfd02ed-c07b-4a2e-ac3e-e86eb7d8924f', '8f27736c-359f-4798-957d-ab71fd576d43', null, 3),
      ('bcfd02ed-c07b-4a2e-ac3e-e86eb7d8924f', 'deac527a-1a59-4aec-8c2d-2d25fb77df76', null, 4),
      ('bcfd02ed-c07b-4a2e-ac3e-e86eb7d8924f', '7c2b3774-edd5-480d-9a23-52ec4f428d85', null, 5),
      ('bcfd02ed-c07b-4a2e-ac3e-e86eb7d8924f', '48fe5171-7f76-414b-bcb2-9732278133e3', null, 6),
      ('bcfd02ed-c07b-4a2e-ac3e-e86eb7d8924f', 'fb8ff2ef-8113-416c-822a-4908810de295', null, 7),
      ('bcfd02ed-c07b-4a2e-ac3e-e86eb7d8924f', '14f7f143-aeae-4ddd-90bb-4296f35c5f32', null, 8),
      -- COLLEGE_D3 · 2026 · Northwest D-III Women's Conferences (Northwest-D-III-Womens-Conferences-2026) · ended 2026-04-12
      ('f31ded5f-6609-4a9e-b5fa-c44eead1d63f', '01964277-72a2-497b-9480-4ff32124d544', null, 1),
      ('f31ded5f-6609-4a9e-b5fa-c44eead1d63f', '6f146c9b-85f0-4e0a-9aec-cf13dde85b01', null, 2),
      ('f31ded5f-6609-4a9e-b5fa-c44eead1d63f', '0e4cbbdf-9de8-421d-aa15-3b38b4f54e2e', null, 3),
      ('f31ded5f-6609-4a9e-b5fa-c44eead1d63f', '312626e9-0ace-4743-8630-bc68ea3be3b0', null, 4),
      -- COLLEGE_D3 · 2026 · Ohio D-III Men's Conferences (Ohio-D-III-Mens-Conferences-2026) · ended 2026-04-12
      ('c7b9084e-6037-4ff3-95bf-ea6d850b00b8', 'd96f221d-f95b-4f76-a371-401e5aeaefaa', null, 1),
      ('c7b9084e-6037-4ff3-95bf-ea6d850b00b8', '487c0251-b941-4023-a8fe-c1962bd63dd4', null, 2),
      ('c7b9084e-6037-4ff3-95bf-ea6d850b00b8', 'f014e8e1-2924-45a4-a00c-2af1d96743f4', null, 3),
      ('c7b9084e-6037-4ff3-95bf-ea6d850b00b8', 'fe2df970-6bde-495d-a85b-3b8fd4e9bb82', null, 4),
      ('c7b9084e-6037-4ff3-95bf-ea6d850b00b8', '09eb4254-0b14-4c21-aa42-e2ae5ff7b7f4', null, 5),
      ('c7b9084e-6037-4ff3-95bf-ea6d850b00b8', 'e2e80ede-1465-46a3-bae2-1a0e630a3bb6', null, 6),
      -- COLLEGE_D3 · 2026 · Ozarks D-III Men's Conferences (Ozarks-D-III-Mens-Conferences-2026) · ended 2026-04-12
      ('8f3f1e0a-0eef-4bd6-9ef6-c2fa6ff929ec', '3acc2003-34f0-406a-904c-2d80e41a1240', null, 1),
      ('8f3f1e0a-0eef-4bd6-9ef6-c2fa6ff929ec', '530034ea-9784-42a2-ba6d-f8468116660a', null, 2),
      ('8f3f1e0a-0eef-4bd6-9ef6-c2fa6ff929ec', 'a1576928-3ce6-4f06-b9e8-ee71dad94a29', null, 4),
      ('8f3f1e0a-0eef-4bd6-9ef6-c2fa6ff929ec', '8de6df72-e629-4fa9-907c-e538c41ec7fe', null, 5),
      ('8f3f1e0a-0eef-4bd6-9ef6-c2fa6ff929ec', '491d8fd4-8be6-4227-86f5-ea0a5cfd2a91', null, 6),
      -- COLLEGE_D3 · 2026 · Pennsylvania D-III Women's Conferences (Pennsylvania-D-III-Womens-Conferences-2026) · ended 2026-04-12
      ('2ac3c7ec-f319-455f-b196-07ab53cb200f', 'd0365f8d-e8cb-43a7-97b1-2065a47e61b4', null, 1),
      ('2ac3c7ec-f319-455f-b196-07ab53cb200f', 'fb9f8119-51a7-482d-8fe7-ebeac6963508', null, 2),
      ('2ac3c7ec-f319-455f-b196-07ab53cb200f', '4f097086-eaad-4819-9eb6-f4ab90880e09', null, 3),
      ('2ac3c7ec-f319-455f-b196-07ab53cb200f', 'b6eb4f55-6882-46f1-8ed2-7c567f6cb9d3', null, 3),
      ('2ac3c7ec-f319-455f-b196-07ab53cb200f', '5d8894fb-aeab-42d3-a043-c52ed68c3583', null, 5),
      ('2ac3c7ec-f319-455f-b196-07ab53cb200f', '1776b08f-6562-418d-8946-b3fcf73dc426', null, 6),
      -- COLLEGE_D3 · 2026 · South Central D-III Women's Conferences (South-Central-D-III-Womens-Conferences-2026) · ended 2026-04-12
      ('4793e676-34e4-4eba-be47-0f75056031c9', '859cd4bd-bdc3-45d3-b980-f283e2d3b647', null, 1),
      ('4793e676-34e4-4eba-be47-0f75056031c9', '0739becb-9f8f-442e-963a-4f6473b0d0d9', null, 2),
      ('4793e676-34e4-4eba-be47-0f75056031c9', '6245fd4c-3789-4e29-a1e9-b0e3bbd91aad', null, 3),
      ('4793e676-34e4-4eba-be47-0f75056031c9', 'd51e9caf-5b36-4ec1-8532-180e3d1649b8', null, 4),
      -- COLLEGE_D3 · 2026 · South New England D-III Men's Conferences (South-New-England-D-III-Mens-Conferences-2026) · ended 2026-04-12
      ('27548b7e-cf2d-4a5c-9ca8-8d30cc7c1a41', '653371f3-3226-4352-a986-b34581ebec07', null, 1),
      ('27548b7e-cf2d-4a5c-9ca8-8d30cc7c1a41', '42265d41-750a-413e-b2f4-cbddf4d4be01', null, 2),
      ('27548b7e-cf2d-4a5c-9ca8-8d30cc7c1a41', 'cdf59389-6968-49e0-8163-f06c90256af5', null, 3),
      ('27548b7e-cf2d-4a5c-9ca8-8d30cc7c1a41', '106a70a3-fc8f-45a0-88b9-e9de860fe637', null, 4),
      ('27548b7e-cf2d-4a5c-9ca8-8d30cc7c1a41', '0e5eead1-63d5-4dc8-8f41-2e0baf016c18', null, 5),
      ('27548b7e-cf2d-4a5c-9ca8-8d30cc7c1a41', '662b38b6-3b24-4d6b-86c2-42de8039bf18', null, 6),
      ('27548b7e-cf2d-4a5c-9ca8-8d30cc7c1a41', '8bd70342-3973-42de-9b73-68a4f7812183', null, 7),
      ('27548b7e-cf2d-4a5c-9ca8-8d30cc7c1a41', '58e88af7-8775-42ef-a195-6f7f4547e38c', null, 8),
      -- COLLEGE_D3 · 2026 · Southwest D-III Men's Conferences (Southwest-D-III-Mens-Conferences-2026) · ended 2026-04-12
      ('7fdf8a2e-82e9-4129-9a63-cf24cf886723', '7bbdb0c3-810f-43d2-9d69-c54346978f14', null, 1),
      ('7fdf8a2e-82e9-4129-9a63-cf24cf886723', '1a73acd8-d7df-433e-9042-a2f1e4cac1aa', null, 2),
      ('7fdf8a2e-82e9-4129-9a63-cf24cf886723', 'f3e14a4b-ad4f-40e9-98ea-ff6921849537', null, 3),
      ('7fdf8a2e-82e9-4129-9a63-cf24cf886723', '2d6de1bd-ce21-4c11-9fd5-1c3e00fb2789', null, 4),
      -- COLLEGE_D3 · 2026 · West Penn D-III Men's Conferences (West-Penn-D-III-Mens-Conferences-2026) · ended 2026-04-12
      ('4a0ad5d9-edbb-4878-85b8-01abac83494b', '723b9bee-f675-46b9-9e84-30055b7b1a67', null, 1),
      ('4a0ad5d9-edbb-4878-85b8-01abac83494b', '09700067-fe15-4534-9f60-1d87c478c69f', null, 2),
      ('4a0ad5d9-edbb-4878-85b8-01abac83494b', '3ab327cb-1498-42a3-9ad6-6b9ad5c8af16', null, 3),
      ('4a0ad5d9-edbb-4878-85b8-01abac83494b', 'dd9684aa-3a0c-4377-829f-eb8de172f2d9', null, 4),
      -- COLLEGE_D3 · 2026 · Western North Central D-III Men's Conferences (Western-North-Central-D-III-Mens-Conferences-2026) · ended 2026-04-12
      ('b0856fe9-245a-4fc1-8201-013be5ed8ec8', '46bde486-f8a1-4815-a60f-d8b63b741513', null, 1),
      ('b0856fe9-245a-4fc1-8201-013be5ed8ec8', 'b53f2373-973e-4e87-b47d-4b8d4a19e66f', null, 2),
      ('b0856fe9-245a-4fc1-8201-013be5ed8ec8', '5a547bb2-b910-4d1c-aec9-c45cb3a3d19c', null, 3),
      ('b0856fe9-245a-4fc1-8201-013be5ed8ec8', '5ddd95ab-237d-4641-8de5-d8f011cb9dc9', null, 4),
      ('b0856fe9-245a-4fc1-8201-013be5ed8ec8', 'ac7e3c2e-9958-4877-a687-af3ef50e18f6', null, 7),
      ('b0856fe9-245a-4fc1-8201-013be5ed8ec8', '2168e761-2c13-4352-a6ba-2dd6a200c14c', null, 8),
      ('b0856fe9-245a-4fc1-8201-013be5ed8ec8', 'a595cc7e-b315-41a7-a61f-8a8127423723', null, 9),
      ('b0856fe9-245a-4fc1-8201-013be5ed8ec8', 'f99e862b-2bd2-4d3f-b780-7b965826c1a2', null, 10),
      ('b0856fe9-245a-4fc1-8201-013be5ed8ec8', '860fb7b0-c75c-41f7-bfdb-16101106e228', null, 11),
      ('b0856fe9-245a-4fc1-8201-013be5ed8ec8', '5d41417e-d203-4c8d-a6f0-76892b94f9c0', null, 12)
    ) as v(event_id, team_id, old_place, new_place)
   where et.event_id = v.event_id
     and et.team_id = v.team_id
     and et.final_placement is not distinct from v.old_place;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> v_expected THEN
    RAISE EXCEPTION 'usau placements part 11: expected % rows, matched %; data drifted since generation, re-run scripts/derive-usau-placements.ts', v_expected, v_updated;
  END IF;
  RAISE NOTICE 'usau placements part 11: updated % rows', v_updated;
END
$migration$;

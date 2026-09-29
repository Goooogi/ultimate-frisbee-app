-- USAU per-event final placements — repair + fill, part 02 of 06.
--
-- The 2026-07-20 one-shot derivePlacements() backfill (Feature Backlog #18)
-- stored misread brackets, game-to-go losers kept 2nd, and ties that a later
-- game had settled; nothing derived placements after it. Regenerated with the
-- fixed algorithm by scripts/derive-usau-placements.ts on 2026-09-29T14:31:03.876Z —
-- do not hand-edit, re-run it.
--
-- This part: 186 events · fill 591 · correct 69 · clear 22 (conflict 0, contradicted 1, unsupported 21).
-- EXPECTED ROWS: 682. A row only updates while final_placement still holds
-- the value it was generated from ("old" below); the DO block raises, rolling
-- this part back, unless exactly 682 rows match. Regenerate instead of forcing it.
-- All 6 parts: 740 events · fill 3512 · correct 174 · clear 91 (conflict 0, contradicted 1, unsupported 90).

DO $migration$
DECLARE
  v_expected constant int := 682;
  v_updated int;
BEGIN
  update public.usau_event_teams et
     set final_placement = v.new_place
    from (values
      -- CLUB · 2016 · Central Plains Mixed Sectionals 2016 (central-plains-mixed-sectionals-2016) · ended 2016-08-28
      ('3b8247dc-83f0-4c48-8715-c20f18ebfea8'::uuid, 'eee4705a-cb3f-4428-9a2e-9918c0d2c2f1'::uuid, null::int, 1::int),
      ('3b8247dc-83f0-4c48-8715-c20f18ebfea8', 'b038ca21-80ac-4b89-968d-95c052c7ed12', null, 2),
      ('3b8247dc-83f0-4c48-8715-c20f18ebfea8', '4e2c28bb-e6ba-40fd-a240-f947c1a48a32', null, 3),
      ('3b8247dc-83f0-4c48-8715-c20f18ebfea8', '320b2002-a662-4e5d-958d-69cd2b6c16ae', null, 4),
      ('3b8247dc-83f0-4c48-8715-c20f18ebfea8', '95a2aadc-bffa-4415-b237-a57c6b98f86a', null, 5),
      ('3b8247dc-83f0-4c48-8715-c20f18ebfea8', 'bb73f5f2-edab-49c7-88a2-4927405ddcab', null, 6),
      ('3b8247dc-83f0-4c48-8715-c20f18ebfea8', 'ff9d7db9-17ee-4b38-b473-1fd98563973c', null, 7),
      ('3b8247dc-83f0-4c48-8715-c20f18ebfea8', '1b22bb71-1d74-42d6-b25e-1bd5496ae749', null, 8),
      ('3b8247dc-83f0-4c48-8715-c20f18ebfea8', '619aebda-1634-424d-a2e5-03c23e5554cc', null, 9),
      ('3b8247dc-83f0-4c48-8715-c20f18ebfea8', 'f71ebad9-1721-49ca-b8df-6efc2e70e4e7', null, 10),
      ('3b8247dc-83f0-4c48-8715-c20f18ebfea8', '93f8ff16-2e48-4b31-a8bf-2d5300406506', null, 11),
      ('3b8247dc-83f0-4c48-8715-c20f18ebfea8', '5681cf56-0319-45b9-a3e4-ede2256e7a05', null, 12),
      -- CLUB · 2016 · East Coast Mixed Sectionals 2016 (east-coast-mixed-sectionals-2016) · ended 2016-08-28
      ('aa74fe85-87f3-4735-a6a6-8e477c0062ab', '2ad873b9-b5a8-4987-9ffe-ef4159210006', null, 1),
      ('aa74fe85-87f3-4735-a6a6-8e477c0062ab', 'd06d93bc-a960-4c80-87a3-15c770b17a55', null, 2),
      ('aa74fe85-87f3-4735-a6a6-8e477c0062ab', '986b4603-300b-4d25-aaff-7ac9650d5977', null, 3),
      ('aa74fe85-87f3-4735-a6a6-8e477c0062ab', '505299d2-b5de-43d4-aae9-5fafc727dbeb', null, 4),
      ('aa74fe85-87f3-4735-a6a6-8e477c0062ab', 'e282ec13-b64c-4693-986c-68d485a6ae08', null, 5),
      ('aa74fe85-87f3-4735-a6a6-8e477c0062ab', '63ab0853-00e4-4301-a7ce-d1d109989255', null, 6),
      ('aa74fe85-87f3-4735-a6a6-8e477c0062ab', '26be7e48-caee-45dd-9e69-16c934e693f4', null, 7),
      ('aa74fe85-87f3-4735-a6a6-8e477c0062ab', 'c5a1daea-46c3-464d-a1af-bd262c4dc004', null, 7),
      ('aa74fe85-87f3-4735-a6a6-8e477c0062ab', 'b99e83d6-ff1f-4f81-8cf1-9d8e08705b65', null, 9),
      ('aa74fe85-87f3-4735-a6a6-8e477c0062ab', '61db9963-b419-4fb1-a9d0-aca663b9636b', null, 10),
      -- CLUB · 2016 · East Plains Mixed Sectionals 2016 (east-plains-mixed-sectionals-2016) · ended 2016-08-28
      ('5180e7e0-8646-4025-b9a4-399fb0af9904', 'e39e6ca9-5d2b-4f4e-94a4-e304b14914d2', null, 1),
      ('5180e7e0-8646-4025-b9a4-399fb0af9904', '854c1c32-84af-43b3-b377-6f3357bd5776', null, 2),
      ('5180e7e0-8646-4025-b9a4-399fb0af9904', '4e705a62-650f-49c0-912d-abf711405682', null, 3),
      ('5180e7e0-8646-4025-b9a4-399fb0af9904', '219d2949-2c2e-42e1-8a26-ce8ed9f8510f', null, 4),
      ('5180e7e0-8646-4025-b9a4-399fb0af9904', 'c08c017b-345f-4119-8f59-3231a04bf621', null, 5),
      ('5180e7e0-8646-4025-b9a4-399fb0af9904', 'b695c2d7-3e57-494b-a857-eeb14924901f', null, 6),
      ('5180e7e0-8646-4025-b9a4-399fb0af9904', '41d47652-e262-497b-aa26-1963c8e1b557', null, 7),
      ('5180e7e0-8646-4025-b9a4-399fb0af9904', '3a02b84b-5f21-4eb5-b63c-f8fb0d7f7c7f', null, 8),
      ('5180e7e0-8646-4025-b9a4-399fb0af9904', '0231beef-bfb3-4d3c-aba9-54cf2b399483', null, 9),
      ('5180e7e0-8646-4025-b9a4-399fb0af9904', 'd62cc5ad-5ba3-4bdd-bd2c-231a7b2bfea4', null, 10),
      ('5180e7e0-8646-4025-b9a4-399fb0af9904', '307b5172-97f4-4ebd-bc56-ae2a896ce2e2', null, 13),
      ('5180e7e0-8646-4025-b9a4-399fb0af9904', '1abc1bed-ecc7-4990-b9b2-32ebcbd0281b', null, 14),
      -- CLUB · 2016 · Founders Mixed Sectionals 2016 (founders-mixed-sectionals-2016) · ended 2016-08-28
      ('9d0250b9-ed4c-45e6-a440-ac0a3423627f', '678060d5-9b7c-4dea-88d3-270f448ac586', null, 1),
      ('9d0250b9-ed4c-45e6-a440-ac0a3423627f', '3c27b7d1-885b-4c5d-b570-de28f871b189', null, 2),
      ('9d0250b9-ed4c-45e6-a440-ac0a3423627f', '70fa400f-a745-4162-b384-dfc6a23b4177', null, 3),
      ('9d0250b9-ed4c-45e6-a440-ac0a3423627f', '732c9cbd-6d1a-4f82-8953-22e00409a05c', null, 4),
      ('9d0250b9-ed4c-45e6-a440-ac0a3423627f', '46645dd2-13c2-46ad-b399-b5c354529658', null, 5),
      ('9d0250b9-ed4c-45e6-a440-ac0a3423627f', 'b5b6aed8-d428-47a4-a22f-fe2574d344e9', null, 6),
      ('9d0250b9-ed4c-45e6-a440-ac0a3423627f', '960d8407-308a-451f-b551-3b1dbc50914a', null, 7),
      -- CLUB · 2016 · Metro New York Men's Sectionals (metro-new-york-mens-sectionals) · ended 2016-08-28
      ('4304a085-5ca0-456b-9dc3-03c356115980', '0191bb40-d176-4aa8-b46b-8312efc890c1', null, 7),
      ('4304a085-5ca0-456b-9dc3-03c356115980', 'd42a5833-5c62-4b17-a1a3-32b14c78afb3', null, 8),
      -- CLUB · 2016 · Nor Cal Mixed Sectionals 2016 (nor-cal-mixed-sectionals-2016) · ended 2016-08-28
      ('1d7d265a-1753-4928-a586-b8c2fa57cceb', '5df46054-766a-4ec3-91ff-43d59a3925c5', null, 1),
      ('1d7d265a-1753-4928-a586-b8c2fa57cceb', 'a9536dff-c65b-43ed-a55e-6c77e89d4a0a', null, 2),
      ('1d7d265a-1753-4928-a586-b8c2fa57cceb', 'dcc84225-1bee-434f-9eea-578d74964f68', null, 3),
      ('1d7d265a-1753-4928-a586-b8c2fa57cceb', '5a3d76ea-2b90-4fc2-94a6-26863686d24f', null, 4),
      ('1d7d265a-1753-4928-a586-b8c2fa57cceb', 'd5a39887-61b6-4404-b0e4-482a98893d06', null, 7),
      ('1d7d265a-1753-4928-a586-b8c2fa57cceb', 'ae13ae36-90c2-497d-a74d-37695f613e87', null, 8),
      ('1d7d265a-1753-4928-a586-b8c2fa57cceb', '715a9fee-f36e-4b4d-be79-86fd3364941b', null, 9),
      ('1d7d265a-1753-4928-a586-b8c2fa57cceb', 'b21e84be-cb6c-4221-8c00-02e0a189c281', null, 10),
      -- CLUB · 2016 · North Carolina Men's Sectionals (north-carolina-mens-sectionals) · ended 2016-08-28
      ('131c745b-ce9b-4126-a1a7-06daf54cbdf6', 'd2dd7c3a-673d-44f0-a13d-b3c7aec4412e', null, 7),
      ('131c745b-ce9b-4126-a1a7-06daf54cbdf6', '0067d0a8-5e01-4792-8bbe-6365ed21c2c2', null, 8),
      -- CLUB · 2016 · North Carolina Mixed Sectionals 2016 (north-carolina-mixed-sectionals-2016) · ended 2016-08-28
      ('5553395c-034d-4011-b6df-a35c4ba2c5c7', '6ea8d696-ee53-45ca-9e1a-95404b4f99c6', null, 1),
      ('5553395c-034d-4011-b6df-a35c4ba2c5c7', '08c5a06c-7e1d-444b-8b06-ad08557d8642', null, 2),
      ('5553395c-034d-4011-b6df-a35c4ba2c5c7', '4438ec15-0160-4756-819c-2421093e3570', null, 3),
      ('5553395c-034d-4011-b6df-a35c4ba2c5c7', 'bf6af4fd-05e2-4ce8-920b-50cc14ca7068', null, 4),
      ('5553395c-034d-4011-b6df-a35c4ba2c5c7', '323fd29f-654f-4b9d-a5fe-aad51e96706f', null, 5),
      ('5553395c-034d-4011-b6df-a35c4ba2c5c7', 'fcdd86c9-928e-48ff-9050-6f1a3261b735', null, 6),
      ('5553395c-034d-4011-b6df-a35c4ba2c5c7', '37a3fa9d-42e8-46e9-afbc-903f6dca9538', null, 7),
      ('5553395c-034d-4011-b6df-a35c4ba2c5c7', '818acac6-b11c-42da-8a76-3c8bde5a048b', null, 8),
      -- CLUB · 2016 · Northwest Plains Mixed Sectionals 2016 (northwest-plains-mixed-sectionals-2016) · ended 2016-08-28
      ('d274f5eb-92a6-4a87-93e6-2c8a2e64d2ec', '726d1bc5-c0d9-44cb-9370-f0d8ef7016cd', null, 1),
      ('d274f5eb-92a6-4a87-93e6-2c8a2e64d2ec', '4207ec96-5240-4aa3-9bbd-25a40404a02e', null, 2),
      ('d274f5eb-92a6-4a87-93e6-2c8a2e64d2ec', 'a9c9b030-0883-49f8-90c8-75313b08ae12', null, 3),
      ('d274f5eb-92a6-4a87-93e6-2c8a2e64d2ec', 'c6d8e4a6-4aed-4740-8125-8e9fddd5b5e9', null, 4),
      ('d274f5eb-92a6-4a87-93e6-2c8a2e64d2ec', '15ad14d7-8625-43ba-9381-fa4dccdf1ba5', null, 5),
      ('d274f5eb-92a6-4a87-93e6-2c8a2e64d2ec', '8b2d25d8-4c64-48be-8879-64ea656a2be5', null, 6),
      ('d274f5eb-92a6-4a87-93e6-2c8a2e64d2ec', '4c59cbfb-12d2-42d3-9944-e7878d49058d', null, 7),
      ('d274f5eb-92a6-4a87-93e6-2c8a2e64d2ec', 'e21f960d-24ce-4983-895b-480bf7659393', null, 7),
      ('d274f5eb-92a6-4a87-93e6-2c8a2e64d2ec', '6701a442-9311-4b6c-ba6a-3fef390a1842', null, 9),
      ('d274f5eb-92a6-4a87-93e6-2c8a2e64d2ec', '5bfb901a-86c5-48c5-848b-0948c1f204bf', null, 10),
      ('d274f5eb-92a6-4a87-93e6-2c8a2e64d2ec', 'bce9b179-97de-43c0-9046-f2d6fab010ca', null, 11),
      ('d274f5eb-92a6-4a87-93e6-2c8a2e64d2ec', '3949b8e7-23a9-43f1-832c-335b80b04581', null, 12),
      -- CLUB · 2016 · Oregon Mixed Sectionals 2016 (oregon-mixed-sectionals-2016) · ended 2016-08-28
      ('eb88b59e-0a37-47c7-a95a-5cf6ea21c84b', 'c8f68229-1aa3-463b-a5fd-a9bcad1360d5', null, 1),
      ('eb88b59e-0a37-47c7-a95a-5cf6ea21c84b', 'ef02bb71-6e21-4f1b-8b7a-8cdff72a729d', null, 2),
      ('eb88b59e-0a37-47c7-a95a-5cf6ea21c84b', '042d5bba-15f3-4077-bc6c-a915f9287eb1', null, 3),
      ('eb88b59e-0a37-47c7-a95a-5cf6ea21c84b', '8011b32a-00d5-47a5-bd8b-1f506219f8ad', null, 4),
      ('eb88b59e-0a37-47c7-a95a-5cf6ea21c84b', '7fb1ee2f-3c69-47ee-be55-db55196bd005', null, 5),
      ('eb88b59e-0a37-47c7-a95a-5cf6ea21c84b', '3accc58b-0a37-45ee-a66b-07e2ab7dc509', null, 6),
      ('eb88b59e-0a37-47c7-a95a-5cf6ea21c84b', 'f7aedc44-1f01-47d3-88e8-035a4d5f942d', null, 7),
      ('eb88b59e-0a37-47c7-a95a-5cf6ea21c84b', 'daa3245a-8185-423f-bd9e-38ef8f1d4f1b', null, 8),
      -- CLUB · 2016 · Rocky Mountain Mixed Sectionals 2016 (rocky-mountain-mixed-sectionals-2016) · ended 2016-08-28
      ('32be5457-2a3f-402f-9076-884d29e770a5', 'b285f756-1846-438f-9c0d-ff58ac0ef53b', null, 1),
      ('32be5457-2a3f-402f-9076-884d29e770a5', '18d48a14-66da-4d4f-96a8-c472eb0c55a8', null, 2),
      ('32be5457-2a3f-402f-9076-884d29e770a5', '1853b66b-19a8-46bb-8a5f-fb59533e6da4', null, 3),
      ('32be5457-2a3f-402f-9076-884d29e770a5', 'b9eef269-9a9f-4cd1-89bb-f1d3ccfa1964', null, 4),
      ('32be5457-2a3f-402f-9076-884d29e770a5', '8aa9dcdc-9915-4bd7-9f86-15561db95278', null, 5),
      ('32be5457-2a3f-402f-9076-884d29e770a5', '6e3f16f4-b0ca-468b-92cc-027b256f3fcf', null, 6),
      ('32be5457-2a3f-402f-9076-884d29e770a5', '70c0824d-66d1-4bfd-9b40-35bae2c9d732', null, 7),
      ('32be5457-2a3f-402f-9076-884d29e770a5', 'c0c1baf0-baba-4881-b71d-3f83b2a33dec', null, 8),
      -- CLUB · 2016 · So Cal Mixed Sectionals 2016 (so-cal-mixed-sectionals-2016) · ended 2016-08-28
      ('c6be398d-ec9b-4549-8988-872f521ddf39', 'f8a33c00-9330-4009-9af3-9aef41bb32d4', null, 1),
      ('c6be398d-ec9b-4549-8988-872f521ddf39', '7f56c88b-3a2e-4c83-bd7f-2a13aafb36cc', null, 2),
      ('c6be398d-ec9b-4549-8988-872f521ddf39', 'a7b2fbcb-ea17-492f-b64e-d4682044ca26', null, 3),
      ('c6be398d-ec9b-4549-8988-872f521ddf39', '1241e7c6-beba-45d1-b5be-fd43b76ab1fd', null, 4),
      ('c6be398d-ec9b-4549-8988-872f521ddf39', '58c93cec-1909-4820-beeb-4e961fcfd08b', null, 5),
      ('c6be398d-ec9b-4549-8988-872f521ddf39', '6a4839dc-97f2-4bd4-8013-23de5913c219', null, 6),
      ('c6be398d-ec9b-4549-8988-872f521ddf39', '43a580c9-3d2f-431f-aaa8-1405f4ab25e4', null, 7),
      -- CLUB · 2016 · Texas Mixed Sectionals 2016 (texas-mixed-sectionals-2016) · ended 2016-08-28
      ('b67dbfa3-556d-4eb6-98b8-59cd5c3a1f25', '4e13e6da-ae9d-4345-837f-037471b2707d', null, 1),
      ('b67dbfa3-556d-4eb6-98b8-59cd5c3a1f25', 'a9a63c20-f205-4563-a4d3-9ef9e181b7fd', null, 2),
      ('b67dbfa3-556d-4eb6-98b8-59cd5c3a1f25', '835941da-52df-480c-a4a8-2a3d4b7a36c8', null, 3),
      ('b67dbfa3-556d-4eb6-98b8-59cd5c3a1f25', '35926b4e-97dd-4f7a-bc76-98bc0e89f266', null, 4),
      ('b67dbfa3-556d-4eb6-98b8-59cd5c3a1f25', '40293c69-607b-4bdf-8688-651609f7ba28', null, 5),
      ('b67dbfa3-556d-4eb6-98b8-59cd5c3a1f25', 'e4759a7d-9201-49c1-84da-d9db866e9dad', null, 6),
      ('b67dbfa3-556d-4eb6-98b8-59cd5c3a1f25', '39863de1-9bdd-4e70-96e2-89d78e2b33a8', null, 7),
      ('b67dbfa3-556d-4eb6-98b8-59cd5c3a1f25', '40d917a4-0272-44b4-910c-a8aaac7ef22e', null, 8),
      ('b67dbfa3-556d-4eb6-98b8-59cd5c3a1f25', '6ed9f0ea-b81a-49ad-a79d-1ca54d6b7323', null, 9),
      ('b67dbfa3-556d-4eb6-98b8-59cd5c3a1f25', 'fab5114a-a160-48d6-a0ae-6edc8da5d023', null, 10),
      ('b67dbfa3-556d-4eb6-98b8-59cd5c3a1f25', '39ba1b17-d9e4-45e6-8ba2-385a9e51ab5a', null, 11),
      ('b67dbfa3-556d-4eb6-98b8-59cd5c3a1f25', 'ec4b98e7-5305-46a4-835c-4fbff616a18e', null, 11),
      -- CLUB · 2016 · Upstate New York Mixed Sectionals 2016 (upstate-new-york-mixed-sectionals-2016) · ended 2016-08-28
      ('b044dbea-fb0a-4288-9dbb-96d9152a9925', '376200fc-681e-4e74-861b-4093724ab367', null, 1),
      ('b044dbea-fb0a-4288-9dbb-96d9152a9925', '410f2295-c380-4665-99bc-131c46218efc', null, 2),
      ('b044dbea-fb0a-4288-9dbb-96d9152a9925', '8d811cbe-2964-4a58-87ef-ce4fbf36ce52', null, 3),
      ('b044dbea-fb0a-4288-9dbb-96d9152a9925', 'a6d4e5a2-4f96-4e14-a29a-2e604260a4e4', null, 4),
      ('b044dbea-fb0a-4288-9dbb-96d9152a9925', '669e4fea-9a4f-472e-8296-3af407e07283', null, 5),
      ('b044dbea-fb0a-4288-9dbb-96d9152a9925', '84844fae-0775-46a9-9da7-ed5f8dd51bf3', null, 6),
      -- CLUB · 2016 · Washington Mixed Sectionals 2016 (washington-mixed-sectionals-2016) · ended 2016-08-28
      ('703784e8-a897-4016-ae8a-afa251141020', 'f0bd9e7c-d5da-4890-ad7f-644393c36004', null, 1),
      ('703784e8-a897-4016-ae8a-afa251141020', 'dbd2ca2c-ed08-4619-8f64-aa12750287a5', null, 2),
      ('703784e8-a897-4016-ae8a-afa251141020', 'ffb0bc4f-8f86-470b-b8e5-d5fac5041b2b', null, 3),
      ('703784e8-a897-4016-ae8a-afa251141020', '9d082039-d388-45d2-af1c-210a3c54d3be', null, 4),
      ('703784e8-a897-4016-ae8a-afa251141020', '22bf0be1-b42f-442f-a955-734b201a5631', null, 5),
      ('703784e8-a897-4016-ae8a-afa251141020', 'c787ce6e-923d-4147-9659-cc7dd8c4b022', null, 6),
      -- CLUB · 2016 · West Plains Mixed Sectionals 2016 (west-plains-mixed-sectionals-2016) · ended 2016-08-28
      ('7e739777-67a1-465f-938a-85f9d384f86b', 'ad353f16-ebd6-4f8c-a292-0a7f5c51b235', null, 1),
      ('7e739777-67a1-465f-938a-85f9d384f86b', '7047bd6f-0ee3-4ad9-aab2-39ebc947247a', null, 2),
      ('7e739777-67a1-465f-938a-85f9d384f86b', '208ed93e-b303-4572-92b8-8a32c6c6f62b', null, 3),
      ('7e739777-67a1-465f-938a-85f9d384f86b', 'db99a7e1-b90e-4cda-8eb5-e873b5dcf5ca', null, 4),
      ('7e739777-67a1-465f-938a-85f9d384f86b', '6fb0d7c8-12e3-43b6-9c54-0f7401405e2f', null, 5),
      ('7e739777-67a1-465f-938a-85f9d384f86b', '1d61069e-7481-4273-b162-78a428afd26a', null, 6),
      -- CLUB · 2016 · Mid-Atlantic Mixed Regionals 2016 (mid-atlantic-mixed-regionals-2016) · ended 2016-09-11
      ('ea668def-6fb6-4a54-a942-a4c817099f27', '3c27b7d1-885b-4c5d-b570-de28f871b189', null, 1),
      ('ea668def-6fb6-4a54-a942-a4c817099f27', '7b4de21a-1760-477b-a71a-f34f4d1b0080', null, 2),
      ('ea668def-6fb6-4a54-a942-a4c817099f27', 'e242eb14-6423-46f7-ae9f-35eb9d52189a', null, 3),
      ('ea668def-6fb6-4a54-a942-a4c817099f27', '678060d5-9b7c-4dea-88d3-270f448ac586', null, 4),
      ('ea668def-6fb6-4a54-a942-a4c817099f27', '5a7c3ffa-7807-4ed6-9a7f-85f91d7a6b81', null, 5),
      ('ea668def-6fb6-4a54-a942-a4c817099f27', '732c9cbd-6d1a-4f82-8953-22e00409a05c', null, 6),
      ('ea668def-6fb6-4a54-a942-a4c817099f27', '960d8407-308a-451f-b551-3b1dbc50914a', null, 7),
      ('ea668def-6fb6-4a54-a942-a4c817099f27', 'b7bb5751-43e8-4803-a7e3-2f07c0293aaa', null, 8),
      ('ea668def-6fb6-4a54-a942-a4c817099f27', '46645dd2-13c2-46ad-b399-b5c354529658', null, 9),
      ('ea668def-6fb6-4a54-a942-a4c817099f27', '5a2bd283-6ee3-470d-9393-c78e4b9a004a', null, 10),
      ('ea668def-6fb6-4a54-a942-a4c817099f27', 'b5b6aed8-d428-47a4-a22f-fe2574d344e9', null, 11),
      ('ea668def-6fb6-4a54-a942-a4c817099f27', '70fa400f-a745-4162-b384-dfc6a23b4177', null, 12),
      ('ea668def-6fb6-4a54-a942-a4c817099f27', '9c593410-e8e1-4594-bca8-3ba20d7d7d66', null, 13),
      ('ea668def-6fb6-4a54-a942-a4c817099f27', '693a3661-12af-40e8-8e07-8e43f8f18d5e', null, 14),
      ('ea668def-6fb6-4a54-a942-a4c817099f27', '430af5aa-d93d-42d0-b18a-ab2ddd5d019d', null, 15),
      ('ea668def-6fb6-4a54-a942-a4c817099f27', 'd8885977-0641-460e-a1e1-4b4bc58f5b0e', null, 16),
      -- CLUB · 2016 · North Central Mixed Regionals 2016 (north-central-mixed-regionals-2016) · ended 2016-09-11
      ('349e6c2f-502f-4d64-9b94-cd033593cca9', '92e32751-be54-4d99-a9e4-e8c6da084f90', null, 1),
      ('349e6c2f-502f-4d64-9b94-cd033593cca9', 'e56b0b9d-80d0-4e9b-8f2b-26b6283d5e88', null, 2),
      ('349e6c2f-502f-4d64-9b94-cd033593cca9', '726d1bc5-c0d9-44cb-9370-f0d8ef7016cd', null, 3),
      ('349e6c2f-502f-4d64-9b94-cd033593cca9', '8b83f874-dc20-4c32-b2af-8db1a8709f9c', null, 4),
      ('349e6c2f-502f-4d64-9b94-cd033593cca9', 'ad353f16-ebd6-4f8c-a292-0a7f5c51b235', null, 5),
      ('349e6c2f-502f-4d64-9b94-cd033593cca9', '7047bd6f-0ee3-4ad9-aab2-39ebc947247a', null, 6),
      ('349e6c2f-502f-4d64-9b94-cd033593cca9', '4207ec96-5240-4aa3-9bbd-25a40404a02e', null, 7),
      ('349e6c2f-502f-4d64-9b94-cd033593cca9', 'a9c9b030-0883-49f8-90c8-75313b08ae12', null, 8),
      ('349e6c2f-502f-4d64-9b94-cd033593cca9', '208ed93e-b303-4572-92b8-8a32c6c6f62b', null, 9),
      ('349e6c2f-502f-4d64-9b94-cd033593cca9', 'c6d8e4a6-4aed-4740-8125-8e9fddd5b5e9', null, 10),
      ('349e6c2f-502f-4d64-9b94-cd033593cca9', 'db99a7e1-b90e-4cda-8eb5-e873b5dcf5ca', null, 11),
      ('349e6c2f-502f-4d64-9b94-cd033593cca9', '15ad14d7-8625-43ba-9381-fa4dccdf1ba5', null, 12),
      -- CLUB · 2016 · Northeast Men's Regionals (northeast-mens-regionals) · ended 2016-09-11
      ('ab9e49fd-a430-4e1c-b27b-48bf9b51ac93', '94e19238-3392-4fff-84eb-46434dc25435', 15, 16), -- correct
      -- CLUB · 2016 · Northeast Mixed Regionals 2016 (northeast-mixed-regionals-2016) · ended 2016-09-11
      ('4767cf0c-8a04-493c-904c-9656e6349c63', 'cb5d4f6d-3ec6-432c-935e-5ea7278663db', null, 1),
      ('4767cf0c-8a04-493c-904c-9656e6349c63', 'a0cfc48c-e748-4bc7-8a9b-d514363fb5d8', null, 2),
      ('4767cf0c-8a04-493c-904c-9656e6349c63', 'b33587f4-abda-432c-bb90-b5a09f600fd5', null, 3),
      ('4767cf0c-8a04-493c-904c-9656e6349c63', 'd465a2c2-021d-4800-99c5-55f8ccddcd73', null, 4),
      ('4767cf0c-8a04-493c-904c-9656e6349c63', 'e1f46277-9e7b-4a63-bb88-02c1b745061e', null, 13),
      ('4767cf0c-8a04-493c-904c-9656e6349c63', '8d811cbe-2964-4a58-87ef-ce4fbf36ce52', null, 14),
      ('4767cf0c-8a04-493c-904c-9656e6349c63', '1325e313-6957-458c-bc78-c0a8989a84d2', null, 15),
      ('4767cf0c-8a04-493c-904c-9656e6349c63', '878a392d-bb83-4fa1-b82a-bf5bd3cbc9c4', null, 16),
      -- CLUB · 2016 · Northwest Mixed Regionals 2016 (northwest-mixed-regionals-2016) · ended 2016-09-11
      ('8ee4c60f-48b1-41b3-91d3-432e3ffeac4d', '88661de4-de1d-47e7-92dd-8e8dbb7df5c5', null, 1),
      ('8ee4c60f-48b1-41b3-91d3-432e3ffeac4d', 'f0bd9e7c-d5da-4890-ad7f-644393c36004', null, 2),
      ('8ee4c60f-48b1-41b3-91d3-432e3ffeac4d', '2c0bb060-3ed5-4ff9-83eb-2c61023822b3', null, 3),
      ('8ee4c60f-48b1-41b3-91d3-432e3ffeac4d', 'b8c0b751-6c46-4e23-a1f6-3bb9046343ba', null, 4),
      ('8ee4c60f-48b1-41b3-91d3-432e3ffeac4d', '042d5bba-15f3-4077-bc6c-a915f9287eb1', null, 5),
      ('8ee4c60f-48b1-41b3-91d3-432e3ffeac4d', '77168365-ce97-4855-b422-d444e3ce6673', null, 6),
      ('8ee4c60f-48b1-41b3-91d3-432e3ffeac4d', 'c8f68229-1aa3-463b-a5fd-a9bcad1360d5', null, 7),
      ('8ee4c60f-48b1-41b3-91d3-432e3ffeac4d', '80b0bdfe-6798-4dd7-8e6b-6b2ce7adeab8', null, 8),
      ('8ee4c60f-48b1-41b3-91d3-432e3ffeac4d', 'ef02bb71-6e21-4f1b-8b7a-8cdff72a729d', null, 9),
      ('8ee4c60f-48b1-41b3-91d3-432e3ffeac4d', 'dbd2ca2c-ed08-4619-8f64-aa12750287a5', null, 10),
      ('8ee4c60f-48b1-41b3-91d3-432e3ffeac4d', '9d082039-d388-45d2-af1c-210a3c54d3be', null, 11),
      ('8ee4c60f-48b1-41b3-91d3-432e3ffeac4d', 'ffb0bc4f-8f86-470b-b8e5-d5fac5041b2b', null, 12),
      -- CLUB · 2016 · South Central Mixed Regionals 2016 (south-central-mixed-regionals-2016) · ended 2016-09-11
      ('e33dc238-3f54-4a06-ac6a-a73c9587ed95', 'b285f756-1846-438f-9c0d-ff58ac0ef53b', null, 1),
      ('e33dc238-3f54-4a06-ac6a-a73c9587ed95', 'a9a63c20-f205-4563-a4d3-9ef9e181b7fd', null, 2),
      ('e33dc238-3f54-4a06-ac6a-a73c9587ed95', '176a3ba8-02ba-4aa1-855c-0582cb505b36', null, 3),
      ('e33dc238-3f54-4a06-ac6a-a73c9587ed95', '4e13e6da-ae9d-4345-837f-037471b2707d', null, 4),
      ('e33dc238-3f54-4a06-ac6a-a73c9587ed95', '35926b4e-97dd-4f7a-bc76-98bc0e89f266', null, 5),
      ('e33dc238-3f54-4a06-ac6a-a73c9587ed95', 'b9eef269-9a9f-4cd1-89bb-f1d3ccfa1964', null, 6),
      ('e33dc238-3f54-4a06-ac6a-a73c9587ed95', '835941da-52df-480c-a4a8-2a3d4b7a36c8', null, 7),
      ('e33dc238-3f54-4a06-ac6a-a73c9587ed95', '18d48a14-66da-4d4f-96a8-c472eb0c55a8', null, 8),
      ('e33dc238-3f54-4a06-ac6a-a73c9587ed95', '39863de1-9bdd-4e70-96e2-89d78e2b33a8', null, 9),
      ('e33dc238-3f54-4a06-ac6a-a73c9587ed95', 'd614c1c7-4272-4709-a589-f37ad205a430', null, 10),
      ('e33dc238-3f54-4a06-ac6a-a73c9587ed95', '1853b66b-19a8-46bb-8a5f-fb59533e6da4', null, 11),
      ('e33dc238-3f54-4a06-ac6a-a73c9587ed95', '40293c69-607b-4bdf-8688-651609f7ba28', null, 11),
      ('e33dc238-3f54-4a06-ac6a-a73c9587ed95', 'e4759a7d-9201-49c1-84da-d9db866e9dad', null, 13),
      ('e33dc238-3f54-4a06-ac6a-a73c9587ed95', 'f2ea932b-ba42-45ab-bb6b-760dc7d82378', null, 14),
      ('e33dc238-3f54-4a06-ac6a-a73c9587ed95', '40d917a4-0272-44b4-910c-a8aaac7ef22e', null, 15),
      ('e33dc238-3f54-4a06-ac6a-a73c9587ed95', '6e3f16f4-b0ca-468b-92cc-027b256f3fcf', null, 16),
      -- CLUB · 2016 · Southeast Men's Regionals (southeast-mens-regionals) · ended 2016-09-11
      ('25d6f1df-fbb3-49ee-8bd1-ba64d443b659', '9cd48430-5aef-4e9e-b99a-c5a3e7582a9e', null, 13),
      ('25d6f1df-fbb3-49ee-8bd1-ba64d443b659', '128fa29e-9c59-43c0-8e2b-cf40d70cb2fe', null, 14),
      -- CLUB · 2016 · Southeast Mixed Regionals 2016 (southeast-mixed-regionals-2016) · ended 2016-09-11
      ('ef00dbae-dd92-4e38-8939-556a2633524c', '31cdab74-f112-4d7d-a08b-433ce67328f4', null, 1),
      ('ef00dbae-dd92-4e38-8939-556a2633524c', '48bf3066-75f0-4655-b92b-d7ab41cae3b3', null, 2),
      ('ef00dbae-dd92-4e38-8939-556a2633524c', '20b595bb-f0ae-4607-a5ae-b103431a9c91', null, 3),
      ('ef00dbae-dd92-4e38-8939-556a2633524c', '6ea8d696-ee53-45ca-9e1a-95404b4f99c6', null, 4),
      ('ef00dbae-dd92-4e38-8939-556a2633524c', '08c5a06c-7e1d-444b-8b06-ad08557d8642', null, 5),
      ('ef00dbae-dd92-4e38-8939-556a2633524c', '2ad873b9-b5a8-4987-9ffe-ef4159210006', null, 6),
      ('ef00dbae-dd92-4e38-8939-556a2633524c', '4438ec15-0160-4756-819c-2421093e3570', null, 7),
      ('ef00dbae-dd92-4e38-8939-556a2633524c', 'd06d93bc-a960-4c80-87a3-15c770b17a55', null, 8),
      ('ef00dbae-dd92-4e38-8939-556a2633524c', '986b4603-300b-4d25-aaff-7ac9650d5977', null, 9),
      ('ef00dbae-dd92-4e38-8939-556a2633524c', 'e282ec13-b64c-4693-986c-68d485a6ae08', null, 10),
      ('ef00dbae-dd92-4e38-8939-556a2633524c', 'bf6af4fd-05e2-4ce8-920b-50cc14ca7068', null, 11),
      ('ef00dbae-dd92-4e38-8939-556a2633524c', '06085052-5120-4734-af48-4ae9efbc1e4f', null, 12),
      ('ef00dbae-dd92-4e38-8939-556a2633524c', '505299d2-b5de-43d4-aae9-5fafc727dbeb', null, 13),
      ('ef00dbae-dd92-4e38-8939-556a2633524c', '323fd29f-654f-4b9d-a5fe-aad51e96706f', null, 14),
      ('ef00dbae-dd92-4e38-8939-556a2633524c', '6e5f1982-97db-49fb-b736-676c0f3bbd21', null, 15),
      ('ef00dbae-dd92-4e38-8939-556a2633524c', '5528a16d-cfb7-4478-9132-3eb0261916d5', null, 16),
      -- CLUB · 2016 · Southwest Men's Regionals (southwest-mens-regionals) · ended 2016-09-11
      ('47774255-95a3-41c8-b1c3-45a5ff9cb9c3', 'a0aacef9-d4a9-41a7-952f-d02e54e2aaac', 7, 8), -- correct
      -- CLUB · 2016 · Southwest Mixed Regionals 2016 (southwest-mixed-regionals-2016) · ended 2016-09-11
      ('70ee0199-d3ad-4407-9ff2-4691913e3d1d', '5df46054-766a-4ec3-91ff-43d59a3925c5', null, 1),
      ('70ee0199-d3ad-4407-9ff2-4691913e3d1d', 'dcc84225-1bee-434f-9eea-578d74964f68', null, 2),
      ('70ee0199-d3ad-4407-9ff2-4691913e3d1d', 'a9536dff-c65b-43ed-a55e-6c77e89d4a0a', null, 3),
      ('70ee0199-d3ad-4407-9ff2-4691913e3d1d', 'f8a33c00-9330-4009-9af3-9aef41bb32d4', null, 4),
      ('70ee0199-d3ad-4407-9ff2-4691913e3d1d', '3de9b5e6-e68f-4636-a749-cbe4e225e603', null, 5),
      ('70ee0199-d3ad-4407-9ff2-4691913e3d1d', '7f56c88b-3a2e-4c83-bd7f-2a13aafb36cc', null, 6),
      ('70ee0199-d3ad-4407-9ff2-4691913e3d1d', '5a3d76ea-2b90-4fc2-94a6-26863686d24f', null, 7),
      ('70ee0199-d3ad-4407-9ff2-4691913e3d1d', 'd5a39887-61b6-4404-b0e4-482a98893d06', null, 8),
      ('70ee0199-d3ad-4407-9ff2-4691913e3d1d', 'ae13ae36-90c2-497d-a74d-37695f613e87', null, 9),
      ('70ee0199-d3ad-4407-9ff2-4691913e3d1d', '5511543e-2786-47bd-bdd2-878fae65b71b', null, 10),
      ('70ee0199-d3ad-4407-9ff2-4691913e3d1d', 'a7b2fbcb-ea17-492f-b64e-d4682044ca26', null, 11),
      ('70ee0199-d3ad-4407-9ff2-4691913e3d1d', '58c93cec-1909-4820-beeb-4e961fcfd08b', null, 12),
      -- CLUB · 2017 · ATL Classic 2017 (atl-classic-2017) · ended 2017-06-18
      ('1f14d9f5-657e-4dd2-8e7f-2a0aaf5b9bb9', '7f22feb0-9c3c-4606-923f-ab717271d31c', 3, 4), -- correct
      ('1f14d9f5-657e-4dd2-8e7f-2a0aaf5b9bb9', '2bd449a7-5bdc-4ec2-86bb-5cf39a31e4e6', 7, 8), -- correct
      -- CLUB · 2017 · Fort Collins Summer Solstice 2017 (fort-collins-summer-solstice-2017) · ended 2017-06-18
      ('3621b3c9-2ec3-4b97-bbd5-dc22cf562f94', '25f9547e-b52f-4227-9c7c-4e7a597d4658', 3, 4), -- correct
      -- CLUB · 2017 · Eugene Summer Solstice #39 (eugene-summer-solstice-39) · ended 2017-06-25
      ('1bbf917d-f9b5-442c-b610-7a019e2f4341', '06357067-4793-40a9-a6a2-1e9d372af2c1', null, 5),
      ('1bbf917d-f9b5-442c-b610-7a019e2f4341', '57dc4849-2f6a-48f4-a9c5-da341fcfe5cf', null, 6),
      -- CLUB · 2017 · Summer Glazed Daze 2017 (summer-glazed-daze-2017) · ended 2017-06-25
      ('fc8b08d2-83f6-4ebf-a871-85949011697b', 'e29435e0-5c70-40b0-b579-19596f5364bf', null, 11),
      ('fc8b08d2-83f6-4ebf-a871-85949011697b', '0c8615a4-fb12-4d4c-993f-76678cf19601', null, 12),
      -- CLUB · 2017 · Huckfest 2017 (huckfest-2017) · ended 2017-07-09
      ('6c2b8b0b-4c0a-4b68-8120-6e54e54303b3', '8c277240-ab15-4836-bdf3-547fbc09d554', null, 11),
      ('6c2b8b0b-4c0a-4b68-8120-6e54e54303b3', 'fd95c196-df33-470d-934e-d7400ac0fa2e', null, 12),
      -- CLUB · 2017 · MoTown Throwdown 2017 (motown-throwdown-2017) · ended 2017-07-09
      ('29abc9dd-9458-4257-b5cb-f6fc0b182cdd', '3c93f749-3542-4c2e-859a-5d004bb6fa2a', 11, 12), -- correct
      -- CLUB · 2017 · Heavyweights 2017 (heavyweights-2017) · ended 2017-07-23
      ('5378e426-6386-4814-9b03-c19f20e7b15b', 'ac72f02e-8701-446a-af91-10a23af366d7', 15, 16), -- correct
      ('5378e426-6386-4814-9b03-c19f20e7b15b', '66b85f13-b814-4816-aaf7-8a3530fa0820', null, 17),
      ('5378e426-6386-4814-9b03-c19f20e7b15b', '2613a793-32be-4e03-8373-25ec937b4c09', null, 18),
      ('5378e426-6386-4814-9b03-c19f20e7b15b', 'a48d8034-2dd1-46a5-9636-6141695616a6', 22, null), -- clear-unsupported
      ('5378e426-6386-4814-9b03-c19f20e7b15b', 'bbf8eaca-3e2a-4b89-8584-fa31df13c720', 21, null), -- clear-unsupported
      -- CLUB · 2017 · Trestlemania 2017 (trestlemania-2017) · ended 2017-08-06
      ('993b58eb-74be-40df-acad-c0f7aff12e5e', '114369e2-7123-4ee5-9c28-67040e3541f5', 3, 4), -- correct
      -- CLUB · 2017 · HoDown XXI (hodown-xxi) · ended 2017-08-13
      ('edd05b7b-6429-4f96-906f-56da2ad5f04f', 'b27ff1c9-81ea-45d0-97ac-c3c500caac89', 7, 8), -- correct
      ('edd05b7b-6429-4f96-906f-56da2ad5f04f', 'b6ce7efb-45a6-46de-9316-04f218b05860', 15, 16), -- correct
      -- CLUB · 2017 · Cooler Classic 29 (cooler-classic-29) · ended 2017-08-20
      ('18f5e6cb-6b0e-4305-bc81-a0a3eeef8f4f', '9a7f511f-f8a0-4888-af77-47eb98d6c998', 15, 16), -- correct
      -- CLUB · 2017 · Sanctionals 2017 (sanctionals-2017) · ended 2017-08-26
      ('94af278f-96d9-48f3-8254-d478c0aa4afb', 'e14a9d24-cf78-4c2e-b690-ab7a0d2bddab', null, 5),
      ('94af278f-96d9-48f3-8254-d478c0aa4afb', '317be6de-d2c9-42c5-a6e4-bbad0935c35a', null, 6),
      -- CLUB · 2017 · 2017 East New England Men's Sectionals (2017-east-new-england-mens-sectionals) · ended 2017-09-10
      ('99bc21f0-c8d8-4954-b324-1fc02478e9b3', 'f3c55b04-84e6-48dc-b8cd-4f22dd6ec96a', null, 11),
      ('99bc21f0-c8d8-4954-b324-1fc02478e9b3', '8372024f-f516-4aba-9b15-a00f0fe2d94e', null, 12),
      -- CLUB · 2017 · 2017 Metro New York Mixed Sectionals (2017-metro-new-york-mixed-sectionals) · ended 2017-09-10
      ('b5e6e819-4f0a-4375-9b19-9cecaacb58b2', '4dc22349-e883-4d97-a426-017d2514474a', null, 6),
      ('b5e6e819-4f0a-4375-9b19-9cecaacb58b2', '9254fb2c-f037-4b4d-a77f-962d9ad0a191', 6, 7), -- correct
      ('b5e6e819-4f0a-4375-9b19-9cecaacb58b2', '940e6291-e7e4-43fc-a220-7b679740f0c4', null, 8),
      ('b5e6e819-4f0a-4375-9b19-9cecaacb58b2', 'e62b990a-d339-4c74-98be-b0133f6d7a99', null, 9),
      ('b5e6e819-4f0a-4375-9b19-9cecaacb58b2', '153591d0-0adc-4ec6-b6a5-af5c881de008', null, 10),
      -- CLUB · 2017 · 2017 Upstate New York Men's Sectionals (2017-upstate-new-york-mens-sectionals) · ended 2017-09-10
      ('6dfba9c4-f4a7-4d68-8be6-2c242cc8dca7', '464fc719-d0a3-4dfa-a2df-639696b139bf', null, 5),
      ('6dfba9c4-f4a7-4d68-8be6-2c242cc8dca7', '29672181-ea25-421c-8cc0-0d3c701449c1', null, 6),
      -- CLUB · 2017 · 2017 Washington Women's Sectionals (2017-washington-womens-sectionals) · ended 2017-09-10
      ('5a512a13-8e85-4b42-9f88-45265ac21b63', 'cd988372-f637-43d0-aae0-63f45bcbdfd8', null, 7),
      ('5a512a13-8e85-4b42-9f88-45265ac21b63', '3826667f-036d-4283-9f1f-3353d1b96b29', null, 8),
      -- CLUB · 2017 · 2017 Florida Men's Sectionals (2017-florida-mens-sectionals) · ended 2017-09-17
      ('ae57af0d-a759-48f2-b066-ac521066801d', '7d5fe8cc-c47e-4e3b-8283-b123e726410f', null, 7),
      ('ae57af0d-a759-48f2-b066-ac521066801d', 'a4864e86-1c2a-42b7-ba7e-855365d3c27e', null, 8),
      -- CLUB · 2017 · North Central Men's Regional Championship 2017 (north-central-mens-regionals-2017) · ended 2017-09-24
      ('adf0cf78-b4e7-40df-b78d-12e43f593f04', 'ff17fe3f-01a0-41e9-8dbe-324bb6893875', null, 12),
      -- CLUB · 2017 · Northwest Men's Regional Championship 2017 (northwest-mens-regionals-2017) · ended 2017-09-24
      ('325a6eea-b408-48dd-85df-0b4332cb43ab', '84055d97-8afe-459a-856c-f981826591c6', 3, 4), -- correct
      -- CLUB · 2017 · South Central Mixed Regional Championship 2017 (south-central-mixed-regionals-2017) · ended 2017-09-24
      ('1bdce133-3b14-467c-8e10-e6500b8fb16d', '08d6abc6-4eea-4500-873b-83ae11e413b7', null, 13),
      ('1bdce133-3b14-467c-8e10-e6500b8fb16d', 'b356c873-14d2-4856-a116-302fd957cb1f', null, 14),
      ('1bdce133-3b14-467c-8e10-e6500b8fb16d', '65fa032e-fedb-4b88-b469-3078ecd2ed64', null, 15),
      -- CLUB · 2018 · Eugene Summer Solstice #40 (eugene-summer-solstice-40) · ended 2018-06-24
      ('974fc5e0-d9f6-4d29-9f54-1b92ed74220c', '1c4af31e-a5b1-4edf-9e7f-c4f5efdedafa', null, 5),
      ('974fc5e0-d9f6-4d29-9f54-1b92ed74220c', 'dbe5d1e9-7aed-471d-9892-be52330582e3', null, 6),
      -- CLUB · 2018 · Summer Glazed Daze 2018 (summer-glazed-daze-2018) · ended 2018-06-24
      ('da02781c-53be-4787-9025-34dcb19da26c', '3766c0f9-6462-44ee-b7f2-a1605ce71b16', 11, 12), -- correct
      ('da02781c-53be-4787-9025-34dcb19da26c', 'd8e0de18-c41f-4cfd-8f59-88d6649f4c41', null, 16),
      -- CLUB · 2018 · Club Terminus 2018 (club-terminus-2018) · ended 2018-07-22
      ('a2673e3a-3b96-474f-9328-a84f8ead0d2f', 'f8767c46-4124-4ad2-9a39-b2e0d811b07a', 3, 4), -- correct
      ('a2673e3a-3b96-474f-9328-a84f8ead0d2f', '7a9a2373-6abf-40ea-9dc7-4b819d1b319c', null, 5),
      ('a2673e3a-3b96-474f-9328-a84f8ead0d2f', '0c2a2003-5e39-4564-9c24-cf09e757152b', null, 6),
      -- CLUB · 2018 · Vacationland 2018  (vacationland-2018) · ended 2018-07-22
      ('01d8a11a-32e1-4a38-af7f-8d6ddc16b248', 'd32d0002-9bd7-4271-9441-1c8ae229d04d', 7, 8), -- correct
      -- CLUB · 2018 · Heavyweights 2018  (heavyweights-2018) · ended 2018-08-05
      ('27735b9c-1344-4637-8d40-94134133e7ba', '16e8c70f-00aa-489f-8da4-f35843b40b1c', null, 9),
      ('27735b9c-1344-4637-8d40-94134133e7ba', '2f0c7991-b821-4480-b11e-c0af08187612', null, 10),
      ('27735b9c-1344-4637-8d40-94134133e7ba', '62016540-948c-4ff9-9ebf-a033dad141a4', 14, null), -- clear-unsupported
      ('27735b9c-1344-4637-8d40-94134133e7ba', 'c1f34d74-31c7-4c8a-8077-63fceb9ed872', 13, null), -- clear-unsupported
      -- CLUB · 2018 · White Mountain Mixed 2018 (white-mountain-mixed-2018) · ended 2018-08-05
      ('62010a83-2140-4313-b15f-6da18b15ffa7', '88e62b05-7775-4577-970a-6f4da1b23654', null, 5),
      ('62010a83-2140-4313-b15f-6da18b15ffa7', 'c9c02cb4-f18a-4d2d-bb0a-51cbc72ee1c0', null, 6),
      -- CLUB · 2018 · HoDown ShowDown XXII (hodown-showdown-xxii) · ended 2018-08-12
      ('1543d237-5319-4041-8772-56a6799077fd', 'e0ba3886-3155-4226-bee2-b37c083306a0', 15, 16), -- correct
      -- CLUB · 2018 · Hootie on the Hill 2018 (hootie-on-the-hill-2018) · ended 2018-08-12
      ('b954d4d2-7111-4a07-a7b3-b4180cd3b602', '39c4c06c-b6af-4de4-b684-37430a4af04c', null, 7),
      ('b954d4d2-7111-4a07-a7b3-b4180cd3b602', '8977fb98-a442-470d-b1b3-c27228a93b32', null, 7),
      -- CLUB · 2018 · Nucci's Cup 2018 (nuccis-cup-2018) · ended 2018-08-12
      ('4ee44968-b4d0-49f5-b243-697d014c2719', 'f4ff3dff-f596-4d13-b0f1-09748617b664', 7, 8), -- correct
      -- CLUB · 2018 · Cooler Classic 30 (cooler-classic-30) · ended 2018-08-19
      ('67169871-9457-4eee-ab50-993ec420d002', 'fee1cb24-4285-4d7b-8162-c1691ed68cf5', 3, 4), -- correct
      -- CLUB · 2018 · The 1st Annual Northwest Fruit Bowl (the-1st-annual-northwest-fruit-bowl) · ended 2018-08-19
      ('444f5a3b-30f4-465a-a0ab-7297d0062a63', 'fcce1b6b-7907-4c18-b394-daabef7b9843', null, 9),
      ('444f5a3b-30f4-465a-a0ab-7297d0062a63', '6caacf0d-f0c9-4628-a5f7-20a0eace6733', null, 10),
      -- CLUB · 2018 · The Bropen 2018 (the-bropen-2018) · ended 2018-08-26
      ('189a7281-877c-455b-b513-893c9297dc4b', '407af527-d465-4234-8f38-83d55f03d632', 3, 4), -- correct
      -- CLUB · 2018 · Founders Women's Sectional Championship (founders-women-s-sectional-championship) · ended 2018-09-09
      ('e345d8b5-7298-41d1-8cf1-d4ede8c49174', '0513f599-b5a7-483e-8f08-b52891ab05f6', 3, 4), -- correct
      -- CLUB · 2018 · Gulf Coast Men's Sectional Championship (gulf-coast-men-s-sectional-championship) · ended 2018-09-09
      ('0253d092-f89a-4a5e-ab26-0ba6d15ef71b', '2217e349-89ac-4827-b177-79eaa83f0743', null, 3),
      ('0253d092-f89a-4a5e-ab26-0ba6d15ef71b', 'a4e9bf1a-1b23-4997-aea2-696a3391f5db', null, 4),
      -- CLUB · 2018 · Metro New York Men's Sectional Championship (metro-new-york-men-s-sectional-championship) · ended 2018-09-09
      ('2402e5ec-ebf3-4e41-88fd-facd546c048d', '1179748b-be7d-45f1-a764-dcc382bb8d5c', null, 5),
      ('2402e5ec-ebf3-4e41-88fd-facd546c048d', 'b1d130fb-9926-42de-bfbe-6155e2d29682', null, 6),
      -- CLUB · 2018 · Nor Cal Men's Sectional Championship (nor-cal-men-s-sectional-championship) · ended 2018-09-09
      ('42242914-529a-4c47-bac6-8e7ae1b27260', '670e0c28-b032-4a1a-9b0d-11415108171a', null, 3),
      ('42242914-529a-4c47-bac6-8e7ae1b27260', 'c5b208e4-88dd-43c3-bd85-381e6c763a9a', null, 4),
      ('42242914-529a-4c47-bac6-8e7ae1b27260', '9a2bb5be-d742-422b-949a-9d47aad41926', null, 5),
      ('42242914-529a-4c47-bac6-8e7ae1b27260', 'cf150e0d-e1ed-4c1b-82fd-7f487b043675', null, 5),
      -- CLUB · 2018 · Oregon Men's Sectional Championship (oregon-men-s-sectional-championship) · ended 2018-09-09
      ('f0c47c0e-bf98-4c7e-bcb9-d885c105429d', 'c630bcb1-8553-4659-af40-b35c6ee4a5ae', null, 5),
      -- CLUB · 2018 · Texas Mixed Sectional Championship (texas-mixed-sectional-championship) · ended 2018-09-09
      ('e65381cc-994c-4adb-a7d6-c5d0a002678d', '851bbdf4-af91-4926-aa64-cd5f2173edaa', null, 8),
      ('e65381cc-994c-4adb-a7d6-c5d0a002678d', '70f0c39b-fd78-4347-a1ee-04228a0a898f', 8, 9), -- correct
      -- CLUB · 2018 · Washington Men's Sectional Championship (washington-men-s-sectional-championship) · ended 2018-09-09
      ('fe47ba62-c15d-4217-ba1b-c180c826e223', '64e4e442-c955-4605-959d-9b90229b1770', null, 6),
      ('fe47ba62-c15d-4217-ba1b-c180c826e223', '1cab3cea-061c-43bf-af45-83f5e88694e3', null, 7),
      -- CLUB · 2018 · Washington Mixed Sectional Championship (washington-mixed-sectional-championship) · ended 2018-09-09
      ('768fae26-05be-45b0-852e-c6a6f31c5180', 'f7cab5b8-a85b-431c-9bd9-f004569f4d59', null, 3),
      ('768fae26-05be-45b0-852e-c6a6f31c5180', '2b1deb8c-6a10-4e4f-a176-3af2073b65dd', null, 4),
      -- CLUB · 2018 · Northeast Mixed Regional Championship (northeast-mixed-regional-championship) · ended 2018-09-23
      ('26826dc2-3336-4f39-91ad-1a4487f97c81', '8a801489-1f2d-4f3e-af41-4bf9cf1cb390', 11, 12), -- correct
      -- CLUB · 2018 · Southeast Men's Regional Championship (southeast-men-s-regional-championship) · ended 2018-09-23
      ('af5458d5-a3c8-428a-a6ae-e5189c5918ca', '812911fe-44e6-4ab4-b05e-4d0280b603ce', null, 9),
      ('af5458d5-a3c8-428a-a6ae-e5189c5918ca', '0c2a2003-5e39-4564-9c24-cf09e757152b', null, 10),
      ('af5458d5-a3c8-428a-a6ae-e5189c5918ca', '7a9a2373-6abf-40ea-9dc7-4b819d1b319c', null, 11),
      ('af5458d5-a3c8-428a-a6ae-e5189c5918ca', '991654ba-7639-4053-85ff-446a45cf45cc', null, 12),
      -- CLUB · 2019 · ATL Classic 2019 (atl-classic-2019) · ended 2019-06-16
      ('a6c54af2-5097-421e-88ed-5a4ccac8b02f', '4e59977b-2a5c-4c50-8bf6-cb63110ce28b', null, 3),
      ('a6c54af2-5097-421e-88ed-5a4ccac8b02f', 'c2ade480-fc49-40f3-8b50-c2ca47b7c72f', null, 4),
      ('a6c54af2-5097-421e-88ed-5a4ccac8b02f', '7172b88f-5eb5-47fd-a2a5-5a7c662fcca6', null, 5),
      ('a6c54af2-5097-421e-88ed-5a4ccac8b02f', '8340b6d1-f804-4d38-ac19-3450db0b2edc', null, 6),
      -- CLUB · 2019 · Boston Invite 2019 (boston-invite-2019) · ended 2019-06-23
      ('9c592553-4192-43c4-b8a5-f74ec90863ae', 'bad91bcd-7207-44b0-9623-29a7204acc52', null, 9),
      ('9c592553-4192-43c4-b8a5-f74ec90863ae', '4b87aad4-1b74-4dfb-bee1-1ca72fdcaeea', null, 10),
      ('9c592553-4192-43c4-b8a5-f74ec90863ae', 'dd951f99-e039-4d2e-a90e-a8a7e1d05767', 11, 12), -- correct
      ('9c592553-4192-43c4-b8a5-f74ec90863ae', '7d2a0ac4-fd21-486e-a993-27ae77e9571a', null, 13),
      ('9c592553-4192-43c4-b8a5-f74ec90863ae', 'efaca4a2-3d66-4292-93f5-a68b254c4f4c', null, 14),
      ('9c592553-4192-43c4-b8a5-f74ec90863ae', '6d0465a6-f4ef-4cf0-aaea-92edcdb7035f', null, 17),
      ('9c592553-4192-43c4-b8a5-f74ec90863ae', 'c4042f43-ff79-48dd-aabd-ceb7dcdc218d', null, 18),
      -- CLUB · 2019 · Fort Collins Summer Solstice 2019 (fort-collins-summer-solstice-2019) · ended 2019-06-23
      ('f8fc9ae3-f1de-461e-8e36-8284e402bf18', 'eb5cdf34-e417-4ff9-86a9-9b6ea5190d3d', null, 3),
      ('f8fc9ae3-f1de-461e-8e36-8284e402bf18', 'd7417449-931f-48f5-9def-d5fd87309c98', null, 4),
      -- CLUB · 2019 · Summer Glazed Daze 2019 (summer-glazed-daze-2019) · ended 2019-06-23
      ('9a0a00cd-12fc-48d1-ad9d-5b8618c162d4', '34aded93-6a0e-42ad-bd25-dd13918b93f8', 7, null), -- clear-unsupported
      ('9a0a00cd-12fc-48d1-ad9d-5b8618c162d4', '5c25f11c-972d-444d-a650-dc63e5a2f8a4', 8, null), -- clear-unsupported
      ('9a0a00cd-12fc-48d1-ad9d-5b8618c162d4', '84bc79d3-5530-4ec2-9c65-06996081230d', 15, null), -- clear-unsupported
      ('9a0a00cd-12fc-48d1-ad9d-5b8618c162d4', 'b605383e-cd6f-4211-b105-855098df6adf', 16, null), -- clear-unsupported
      -- CLUB · 2019 · Spirit of the Plains 2019 (spirit-of-the-plains-2019) · ended 2019-06-30
      ('47cd56be-dc39-4c03-b4fe-ac6360d733c8', '1168df59-f628-4fba-8447-aad0e02248fc', null, 15),
      ('47cd56be-dc39-4c03-b4fe-ac6360d733c8', 'e2f0d393-2116-4519-bed9-af0f7be4cef1', null, 16),
      -- CLUB · 2019 · Texas 2 Finger - Men's and Women's (texas-2-finger-men-s-and-women-s) · ended 2019-06-30
      ('66580a31-077f-4850-87b4-ff3ef51c72f3', 'f80990fd-48ac-4edf-a3bd-d2ab7c5daa0a', null, 5),
      ('66580a31-077f-4850-87b4-ff3ef51c72f3', 'f2c20ad9-6146-4a75-a75d-171b4f2b1007', null, 6),
      -- CLUB · 2019 · Huntsville Huckfest 2019 (huntsville-huckfest-2019) · ended 2019-07-07
      ('6f5f64c3-9b2b-414c-bca1-37ab540adb65', '889467e8-c878-4606-99c0-38533a94a10e', null, 7),
      ('6f5f64c3-9b2b-414c-bca1-37ab540adb65', '107c3bc0-3a6f-4927-b332-4b51ebd8a2f1', 13, null), -- clear-unsupported
      ('6f5f64c3-9b2b-414c-bca1-37ab540adb65', '17a3427b-8b9c-4ebe-9f4e-cb1bc26c20a0', 14, null), -- clear-unsupported
      ('6f5f64c3-9b2b-414c-bca1-37ab540adb65', '7bdb85a9-1226-46a6-bf97-974a7bf121dc', 11, null), -- clear-unsupported
      ('6f5f64c3-9b2b-414c-bca1-37ab540adb65', '8cfc9597-78db-4f70-bf48-b20ea4966d92', 10, null), -- clear-unsupported
      ('6f5f64c3-9b2b-414c-bca1-37ab540adb65', '984b29fc-ba42-47a9-a03c-e800ee0d26b5', 12, null), -- clear-unsupported
      -- CLUB · 2019 · Motown Throwdown 2019 (motown-throwdown-2019) · ended 2019-07-07
      ('27ef80cc-6eb4-4237-b758-66d08edaeeb1', '10062a12-57c6-4d4e-b281-f6a49d3b8054', null, 5),
      ('27ef80cc-6eb4-4237-b758-66d08edaeeb1', '58ced2ee-2649-485b-b247-a2ec7a7240fc', null, 6),
      -- CLUB · 2019 · Battle for the Beltway 2019 (battle-for-the-beltway-2019) · ended 2019-07-14
      ('c14947fd-a8c3-4e78-a1be-2103ab71423f', 'b37907fb-f56d-40d3-a8ee-902ce2863b12', 3, 2), -- correct
      ('c14947fd-a8c3-4e78-a1be-2103ab71423f', 'f6eb7458-b23c-4b27-8916-80b3301e8d18', 2, 3), -- correct
      -- CLUB · 2019 · TCT Select Flight Invite - East 2019 (tct-select-flight-invite-east-2019) · ended 2019-07-28
      ('71b8488d-8627-4c9f-9447-d6ab344a31d3', '66d90d2f-39fe-4a1c-b1b0-716a97e567e7', 7, 8), -- correct
      -- CLUB · 2019 · CBR 2019 (cbr-2019) · ended 2019-08-04
      ('4f970f13-ee53-4222-bea4-b756522a47df', '8d9d4a19-add9-4350-8749-7d8f946a555e', null, 3),
      ('4f970f13-ee53-4222-bea4-b756522a47df', '3a150439-fd9b-4f48-b5d7-daf9294bd318', null, 4),
      -- CLUB · 2019 · Heavyweights 2019 (heavyweights-2019) · ended 2019-08-04
      ('d74e2f61-8068-4cf4-93f8-89227d1e5ede', '56195403-9eef-44f4-aca3-f40a1338f8a1', null, 8),
      -- CLUB · 2019 · Kleinman Eruption 2019 (kleinman-eruption-2019) · ended 2019-08-04
      ('286d88d4-3253-4e90-b235-a84214133d16', 'b7f6345b-2ea4-4467-a505-94551a37dff1', 3, 4), -- correct
      -- CLUB · 2019 · Philly Open 2019 (philly-open-2019) · ended 2019-08-04
      ('ae380046-c2b1-470e-8c83-896d1e06bf44', '23e22361-79cd-4080-a556-0184e526822a', null, 20),
      -- CLUB · 2019 · Indy Invite Club 2019 (indy-invite-club-2019) · ended 2019-08-25
      ('274320c2-a18d-48c4-9d42-f77a642fa84d', 'c92bbd85-1ae1-4be6-bac1-7c1866c6f379', 7, 8), -- correct
      -- CLUB · 2019 · The Incident 2019: Age of Ultimatron (the-incident-2019-age-of-ultimatron) · ended 2019-08-25
      ('c817a8eb-06d4-42a4-8d70-7e7c65c862dc', '2153f798-b7cd-413e-bc3a-cc1e999d5a5e', 7, 8), -- correct
      -- CLUB · 2019 · East Plains Mixed Club Sectional Championship 2019 (east-plains-mixed-club-sectional-championship-2019) · ended 2019-09-08
      ('8445ffd1-b061-4b9d-9596-529d307fe2b3', 'ec67d3d6-7971-4c56-8bb4-2e667d0f3980', 3, 2), -- correct
      ('8445ffd1-b061-4b9d-9596-529d307fe2b3', '885442f1-cf75-4bd7-8e26-05005dce5c50', 2, 3), -- correct
      ('8445ffd1-b061-4b9d-9596-529d307fe2b3', '5d156a40-a104-4754-9a9a-6897594f6578', null, 15),
      ('8445ffd1-b061-4b9d-9596-529d307fe2b3', '3cd74b1b-dbea-487b-b62f-423baad16a11', null, 16),
      -- CLUB · 2019 · Florida Women's Club Sectional Championship 2019 (florida-womens-club-sectional-championship-2019) · ended 2019-09-08
      ('9f143e4d-2191-49e3-be2a-a28b7f0fb718', '02ca76f0-525b-4a5a-8381-43411c501cbb', 1, null), -- clear-unsupported
      ('9f143e4d-2191-49e3-be2a-a28b7f0fb718', 'fbefee43-26da-4adf-b28d-9e24eb5c59bb', 2, null), -- clear-unsupported
      -- CLUB · 2019 · Founders Men's Club Sectional Championship 2019 (founders-mens-club-sectional-championship-2019) · ended 2019-09-08
      ('c52f4af8-325f-4dcf-962d-08551eecac86', 'c355956e-6780-4b09-a22c-62539124bcb9', null, 16),
      -- CLUB · 2019 · Founders Mixed Club Sectional Championship 2019 (founders-mixed-club-sectional-championship-2019) · ended 2019-09-08
      ('bdb8786d-476e-4f01-a6d1-3e512623458f', '05c58f84-2d8e-4afa-8526-76adfdfcef2c', 13, null), -- clear-contradicted
      -- CLUB · 2019 · Gulf Coast Men's Club Sectional Championship 2019 (gulf-coast-mens-club-sectional-championship-2019) · ended 2019-09-08
      ('36255b72-b1bc-45dd-a485-3b8a313b49ab', '17a3427b-8b9c-4ebe-9f4e-cb1bc26c20a0', null, 7),
      ('36255b72-b1bc-45dd-a485-3b8a313b49ab', '6e2edce3-3f94-4804-b10c-4e8d554497bc', null, 8),
      -- CLUB · 2019 · Metro New York Men's Club Sectional Championship 2019 (metro-new-york-mens-club-sectional-championship-2019) · ended 2019-09-08
      ('7ef970b9-33ca-4c44-a145-fa8407b9c249', '97461e70-9a2a-4a53-91ac-4125ba3d90d6', null, 8),
      ('7ef970b9-33ca-4c44-a145-fa8407b9c249', '0beb59cb-8ca8-4d37-9759-1aca3923d830', null, 9),
      ('7ef970b9-33ca-4c44-a145-fa8407b9c249', '7a86b135-9f2a-4c41-8130-2815f086fce6', null, 10),
      ('7ef970b9-33ca-4c44-a145-fa8407b9c249', '3c5cfbb7-527d-4747-8b28-fb3facac4d01', null, 11),
      ('7ef970b9-33ca-4c44-a145-fa8407b9c249', 'bda54b01-208d-49cf-9332-7d3c87638bdf', null, 11),
      ('7ef970b9-33ca-4c44-a145-fa8407b9c249', '7ec1d5d5-82bb-4e44-9e18-b46ab0640126', null, 13),
      ('7ef970b9-33ca-4c44-a145-fa8407b9c249', 'c96bed32-dd86-48eb-b902-7ecdc152a4d6', null, 14),
      -- CLUB · 2019 · North Carolina Mixed Club Sectional Championship 2019 (north-carolina-mixed-club-sectional-championship-2019) · ended 2019-09-08
      ('ad4cd006-9b37-4f0b-b41c-124459815c28', 'e9f17317-9c86-47d9-8ce6-4dd141ac87d0', null, 7),
      ('ad4cd006-9b37-4f0b-b41c-124459815c28', '6bda5be0-66ee-4ac6-8146-02467bd3fd11', null, 8),
      -- CLUB · 2019 · Rocky Mountain Men's Club Sectional Championship 2019 (rocky-mountain-mens-club-sectional-championship-2019) · ended 2019-09-08
      ('fa9e3442-2e55-4fb5-88b0-b71dafc9f166', 'c76d48bf-459a-4dcd-ae9f-35a5cc0498f7', null, 4),
      ('fa9e3442-2e55-4fb5-88b0-b71dafc9f166', 'c63319c4-f858-4a97-aa6f-2293725a27d9', null, 5),
      ('fa9e3442-2e55-4fb5-88b0-b71dafc9f166', '36f8cab5-73cc-4261-b1d7-b085a4915b42', null, 6),
      -- CLUB · 2019 · So Cal Men's Club Sectional Championship 2019 (so-cal-mens-club-sectional-championship-2019) · ended 2019-09-08
      ('ac991dbd-e2dc-42d8-8cf1-5262344125cd', 'f4978460-82a7-46ed-8792-cb4ac0e4fdde', null, 6),
      ('ac991dbd-e2dc-42d8-8cf1-5262344125cd', 'b5afc4a4-b246-4a26-9d82-1a189578d248', null, 7),
      -- CLUB · 2019 · Texas Men's Club Sectional Championship 2019 (texas-mens-club-sectional-championship-2019) · ended 2019-09-08
      ('3de383b5-3372-41dd-be07-ea062d16e83e', 'c852fff5-e443-4de2-b407-aa1f367de5af', null, 13),
      ('3de383b5-3372-41dd-be07-ea062d16e83e', 'a908a19c-f930-459d-a35a-837d8b6d0f43', null, 14),
      -- CLUB · 2019 · Washington Men's Club Sectional Championship 2019 (washington-mens-club-sectional-championship-2019) · ended 2019-09-08
      ('34330d5e-334d-426e-b3d5-d0372a5510d0', '23faf086-7247-4d44-b31d-15447140da02', null, 7),
      ('34330d5e-334d-426e-b3d5-d0372a5510d0', '62972842-030f-4423-9c40-85992b372325', null, 8),
      -- CLUB · 2019 · Great Lakes Mixed Club Regional Championship 2019 (great-lakes-mixed-club-regional-championship-2019) · ended 2019-09-22
      ('3cc5f1ac-1b03-423b-880a-90ba96202581', '6367ba20-9649-435e-b1c5-f56cc4ea91c0', 3, 4), -- correct
      ('3cc5f1ac-1b03-423b-880a-90ba96202581', '2db39258-c50c-443a-8a31-a7d8b31e0ae6', null, 15),
      ('3cc5f1ac-1b03-423b-880a-90ba96202581', '56195403-9eef-44f4-aca3-f40a1338f8a1', null, 15),
      -- CLUB · 2019 · Mid-Atlantic Mixed Club Regional Championship 2019 (mid-atlantic-mixed-club-regional-championship-2019) · ended 2019-09-22
      ('3b47e3b5-8aec-41e2-9ad5-ad2fb3b04cd4', 'ac0d38b1-cc59-453e-b92b-f5f576811bb9', null, 7),
      ('3b47e3b5-8aec-41e2-9ad5-ad2fb3b04cd4', 'feb70087-c358-48cd-8267-0b0ff39979e7', null, 8),
      -- CLUB · 2019 · Northeast Club Men's Regional Championship 2019 (northeast-club-mens-regional-championship-2019) · ended 2019-09-22
      ('6e2e7f68-0e61-41b6-87fa-84eed022b561', 'bf34f7c0-d5a1-44f7-b3fa-4f24d73a326c', 5, 6), -- correct
      ('6e2e7f68-0e61-41b6-87fa-84eed022b561', 'c4042f43-ff79-48dd-aabd-ceb7dcdc218d', 11, 12), -- correct
      ('6e2e7f68-0e61-41b6-87fa-84eed022b561', '573b5984-c81e-4da0-bc4a-619a08e7633c', null, 13),
      ('6e2e7f68-0e61-41b6-87fa-84eed022b561', '7d2a0ac4-fd21-486e-a993-27ae77e9571a', null, 14),
      ('6e2e7f68-0e61-41b6-87fa-84eed022b561', '0698fab9-a886-45a9-8a54-83a75089b172', null, 15),
      ('6e2e7f68-0e61-41b6-87fa-84eed022b561', '6d0465a6-f4ef-4cf0-aaea-92edcdb7035f', null, 16),
      -- CLUB · 2019 · Northeast Club Mixed Regional Championship 2019 (northeast-club-mixed-regional-championship-2019) · ended 2019-09-22
      ('feebfb06-c140-41ec-a737-4ccea6d15d36', 'a89bfe09-7a9b-41e9-a01e-2d65ddceca7c', null, 13),
      ('feebfb06-c140-41ec-a737-4ccea6d15d36', '53924e8c-7222-4a8c-8acc-95726a1b0e81', null, 14),
      ('feebfb06-c140-41ec-a737-4ccea6d15d36', '25f294a8-88e9-46bc-8d65-d1edd8a06cc6', 15, 16), -- correct
      -- CLUB · 2019 · Northeast Club Women's Regional Championship 2019 (northeast-club-womens-regional-championship-2019) · ended 2019-09-22
      ('2082f49f-9ec6-47f6-9624-2b8674a192e4', '937c1ece-04b0-44f8-89e9-904691ec17e1', null, 8),
      ('2082f49f-9ec6-47f6-9624-2b8674a192e4', 'cb6ca321-49f2-401f-8c99-89f76bf2f059', 8, 9), -- correct
      ('2082f49f-9ec6-47f6-9624-2b8674a192e4', '7dcdfd15-883f-48f0-8a5a-9508e9e14ae5', null, 10),
      -- CLUB · 2020 · Labor Day Fours (labor-day-fours) · ended 2020-09-05
      ('a453f829-4853-4eaf-8f44-308f024d0d1c', '845cd942-6327-4cf1-b781-875fea6d889f', 7, 8), -- correct
      ('a453f829-4853-4eaf-8f44-308f024d0d1c', 'd8520ea5-2907-46fb-9cbf-ef50f1e9027b', 11, 12), -- correct
      -- CLUB · 2021 · Capital Men's Club Sectional Championship 2021 (capital-mens-club-sectional-championship-2021) · ended 2021-09-12
      ('39646985-6672-4b91-8815-68e54a191042', 'dc04995a-b212-4c18-a9c6-b1e12fc2dc6f', 13, 14), -- correct
      -- CLUB · 2021 · Metro New York Men's Club Sectional Championship 2021 (metro-new-york-mens-club-sectional-championship-2021) · ended 2021-09-12
      ('706b659f-11d1-4765-a304-ce79c10d641c', '1c0e9716-92ab-4de8-b873-eefc31cb119a', 7, 8), -- correct
      -- CLUB · 2021 · West Plains Men's Club Sectional Championship 2021 (west-plains-mens-club-sectional-championship-2021) · ended 2021-09-12
      ('628d2c25-e2df-499c-90f4-c3bc1732110d', 'aa9144a7-005f-4f6c-963c-9cd568a4b952', null, 6),
      -- CLUB · 2021 · Nor Cal Mixed Club Sectional Championship 2021 (nor-cal-mixed-club-sectional-championship-2021) · ended 2021-09-19
      ('3d8e31ea-7e88-4864-89a8-57e14cdeffe5', 'e92eff1d-5a7c-4df4-9860-55977560af3b', null, 13),
      ('3d8e31ea-7e88-4864-89a8-57e14cdeffe5', '4d0f3d30-2532-4165-a61e-e1519765f38e', null, 14),
      -- CLUB · 2021 · Big Sky Gun Show 2021 (big-sky-gun-show-2021) · ended 2021-10-10
      ('55b60455-60cd-4669-9204-aaed9f5c9891', '5dff3351-1c36-4b6a-a7ba-99f0455571ba', null, 1),
      ('55b60455-60cd-4669-9204-aaed9f5c9891', 'a2b2bc0c-110f-4529-93d2-5783dc555ea7', null, 2),
      -- CLUB · 2022 · Eugene Summer Solstice 2022 (eugene-summer-solstice-2022) · ended 2022-06-26
      ('6881243c-e4c3-40fa-98b7-7e1512ebfd7e', 'e48e8510-3612-448c-b78e-6f2b616e18da', 7, 8), -- correct
      -- CLUB · 2022 · Terminus 2022 (terminus-2022) · ended 2022-07-10
      ('a52d39c6-5a18-4b86-9314-1ec351eb3eac', '7a692e5f-ec95-400c-800d-af982dcc8cb5', null, 11),
      ('a52d39c6-5a18-4b86-9314-1ec351eb3eac', '66bd3eab-2c32-498c-ab1e-f4ec98a37cfb', null, 12),
      ('a52d39c6-5a18-4b86-9314-1ec351eb3eac', '0925f540-1cae-4f3c-8b92-44123a24ef9a', null, 13),
      ('a52d39c6-5a18-4b86-9314-1ec351eb3eac', '70ecdbb1-c1be-4544-aa29-0db4d71cb9c1', null, 14),
      -- CLUB · 2022 · Boston Invite 2022  (boston-invite-2022) · ended 2022-07-17
      ('c791eb9e-d25b-4cd9-b898-e5d0c763f719', '4539fba2-d7f7-498d-8662-a74553970ad6', null, 11),
      ('c791eb9e-d25b-4cd9-b898-e5d0c763f719', '13c78c99-390e-4056-8071-29b5e163d9cc', null, 12),
      -- CLUB · 2022 · Filling the Void (filling-the-void) · ended 2022-07-24
      ('b16673ff-2e22-407a-8e97-90fc22d11134', '5becb62c-9978-46f8-be30-251fcdf029ae', null, 5),
      ('b16673ff-2e22-407a-8e97-90fc22d11134', '5ec1992f-01e1-41bd-b64f-749803d867fd', null, 6),
      ('b16673ff-2e22-407a-8e97-90fc22d11134', '7a692e5f-ec95-400c-800d-af982dcc8cb5', 7, 8), -- correct
      -- CLUB · 2022 · Philly Open 2022 (philly-open-2022) · ended 2022-08-07
      ('8bf81130-3bc9-43ac-b71f-5cf3f279ce2e', '1db0de46-c91e-4561-9ab4-816496047e39', 3, 4), -- correct
      -- CLUB · 2022 · Spirit of the Plains 2022 (spirit-of-the-plains-2022) · ended 2022-08-07
      ('f099408f-842e-43bf-b5d9-ed0a4584d49d', 'fb858637-1f70-40da-9ba2-b9864ea5ca42', 3, 4), -- correct
      -- CLUB · 2022 · Northwest Fruit Bowl 2022 (northwest-fruit-bowl-2022) · ended 2022-08-21
      ('3dd30815-56e7-4194-914a-2ab66d149732', 'bd66010f-e95a-4f9d-a396-2de5a6b48c52', 3, 4), -- correct
      -- CLUB · 2022 · The Incident 2022 (the-incident-2022) · ended 2022-08-28
      ('83d7adb2-83ec-4be8-a8c1-6c1bc1c94ccc', 'bfe091b7-46c8-4ed2-a1cb-cbca6064f172', 3, 4), -- correct
      ('83d7adb2-83ec-4be8-a8c1-6c1bc1c94ccc', 'e4379222-2fa3-460b-a5af-eb82b2ff1ced', 11, 12), -- correct
      ('83d7adb2-83ec-4be8-a8c1-6c1bc1c94ccc', '58dcd38f-54db-4ad1-be73-e648d5ac4f8c', null, 13),
      ('83d7adb2-83ec-4be8-a8c1-6c1bc1c94ccc', '2757b7d6-89b9-496c-8792-e7431e782161', null, 14),
      ('83d7adb2-83ec-4be8-a8c1-6c1bc1c94ccc', '323e407e-e467-46ed-bcd9-b820a34b0dad', null, 15),
      -- CLUB · 2022 · 2022 Florida Men's Sectional Championship (2022-florida-mens-sectional-championship) · ended 2022-09-11
      ('dde06dc5-81ac-457c-a155-bdd509d124b3', '649372fc-2187-4967-8642-729264d0ee34', null, 7),
      ('dde06dc5-81ac-457c-a155-bdd509d124b3', '70ecdbb1-c1be-4544-aa29-0db4d71cb9c1', null, 8),
      -- CLUB · 2022 · 2022 Founders Mixed Sectional Championship (2022-founders-mixed-sectional-championship) · ended 2022-09-11
      ('e97502e3-76a5-4800-91a2-8cc0cc5fc646', '355fae03-9570-4fe2-b2d3-4bc9d109a10e', null, 9),
      ('e97502e3-76a5-4800-91a2-8cc0cc5fc646', 'eb29b9bf-a888-44f9-b156-df23e8683ccd', null, 10),
      -- CLUB · 2022 · 2022 So Cal Mens Sectional Championship (2022-so-cal-mens-sectional-championship) · ended 2022-09-11
      ('74e4eeea-f941-4cdb-9b9d-7110ad17b5c0', 'edb7ba03-4692-4199-b3a8-0d0fd8d3e9b4', null, 9),
      -- CLUB · 2022 · 2022 So Cal Mixed Sectional Championship (2022-so-cal-mixed-sectional-championship) · ended 2022-09-11
      ('efc75f74-9a9b-4cee-b5ec-6b1f263bf983', '26f2b491-6503-489c-9ea1-7d5a170c5503', null, 5),
      ('efc75f74-9a9b-4cee-b5ec-6b1f263bf983', '2fdf19fb-b342-482e-a22d-236755062b10', null, 6),
      -- CLUB · 2022 · 2022 Texas Men's Sectional Championship (2022-texas-mens-sectional-championship) · ended 2022-09-11
      ('e92e375c-3d59-44a5-9264-28bc262b471c', '455933c7-663b-43ff-a9a0-3ccc7f30345c', 12, null), -- clear-unsupported
      ('e92e375c-3d59-44a5-9264-28bc262b471c', '519f87f8-5990-46e5-a1e1-35d516f80872', 13, null), -- clear-unsupported
      -- CLUB · 2022 · 2022 Mid Atlantic Mixed Regional Championship (2022-mid-atlantic-mixed-regional-championship) · ended 2022-09-25
      ('7fb4acad-0a25-40ca-bb0b-bea21431a7ee', '3583e39f-a2fc-4e99-bbbf-0c3824b44a20', 11, 12), -- correct
      ('7fb4acad-0a25-40ca-bb0b-bea21431a7ee', '2a841ff8-1713-41f8-bf0e-f83d6b7d0920', null, 13),
      ('7fb4acad-0a25-40ca-bb0b-bea21431a7ee', 'd88879d4-4ed5-4e0d-bb4c-06788598defa', null, 14),
      -- CLUB · 2022 · 2022 Southeast Mixed Regional Championship (2022-southeast-mixed-regional-championship) · ended 2022-09-25
      ('7ffea955-79f5-4399-b2b8-b7b53f0061f4', '7f3916c7-9f51-4e81-bccc-2b3a1a2d6947', 11, 12), -- correct
      -- CLUB · 2022 · 2022 Southwest Men's Regional Championship (2022-southwest-mens-regional-championship) · ended 2022-09-25
      ('915956fc-ac25-4dd9-bbc5-57b981732e72', 'b8d145ad-3672-4065-8122-04ed200ce0a2', null, 11),
      ('915956fc-ac25-4dd9-bbc5-57b981732e72', '1f761de4-8eca-4388-bd1c-1c283dee82fc', null, 12),
      -- CLUB · 2022 · 2022 Great Lakes Mixed Regional Championship (2022-great-lakes-mixed-regional-championship) · ended 2022-10-02
      ('5892f04d-1810-4680-9b32-075258ed99a1', '080ac652-b720-4289-b07f-da0bdc453cc7', 3, 4), -- correct
      ('5892f04d-1810-4680-9b32-075258ed99a1', '610b45f8-91be-4706-960a-2c6c0e54f47b', null, 13),
      ('5892f04d-1810-4680-9b32-075258ed99a1', '82390da6-f0dd-4fa2-bb4d-1f51817a30b7', null, 14),
      -- CLUB · 2023 · Filling the Void 2023 (filling-the-void-2023) · ended 2023-07-23
      ('e98291cc-5592-4c1f-88a0-edda056fd308', '3b5bd460-a20b-403a-8dfd-c77ce8ff9aee', 7, 8), -- correct
      -- CLUB · 2023 · Trestlemania V (trestlemania-v) · ended 2023-08-06
      ('3a93085a-b48b-4eb2-a066-d72acdca09b5', '6ae258a1-dbdc-48dc-bbc8-421983ba72df', 7, 8), -- correct
      -- CLUB · 2023 · HoDown Showdown 2023 (hodown-showdown-2023) · ended 2023-08-13
      ('59b423a3-3932-4678-9879-0192db3de8a2', 'a12491f1-ecfe-43c4-9304-3e8546de5ac4', null, 13),
      ('59b423a3-3932-4678-9879-0192db3de8a2', '3da4d51d-b959-413c-b67a-46fbd7b2d837', null, 14),
      -- CLUB · 2023 · Cooler Classic 34 (cooler-classic-34) · ended 2023-08-20
      ('35ecef9a-a427-48ee-8e3e-8d3936c57fdd', 'c408d2df-daa3-4cb5-88a5-c9f4fc28e534', null, 24),
      -- CLUB · 2023 · Ski Town Classic (ski-town-classic) · ended 2023-08-20
      ('d23901ac-397e-4928-bb32-f6ec7c5d0232', 'e0a5207d-6e8f-49ad-bb99-516496a3f563', 15, 16), -- correct
      -- CLUB · 2023 · 2023 Men's East Coast Sectional Championship (2023-mens-east-coast-sectional-championship) · ended 2023-09-10
      ('7a674851-cdc3-449a-9b2b-5df33f8f6f46', '36163416-d38c-4d9b-b365-1bbb455b1b37', null, 6),
      ('7a674851-cdc3-449a-9b2b-5df33f8f6f46', '624bf6eb-6195-44a2-898f-1abe253b5c41', null, 7),
      -- CLUB · 2023 · 2023 Men's Nor Cal Sectional Championship (2023-mens-nor-cal-sectional-championship) · ended 2023-09-10
      ('12845157-cbff-4fea-b917-f93f099d9e03', 'a3a02894-4580-4182-94c2-c7fc21a255dc', 11, 12), -- correct
      -- CLUB · 2023 · 2023 Men's Texas Sectional Championship (2023-mens-texas-sectional-championship) · ended 2023-09-10
      ('b69e4967-da70-4308-be70-c23ee0cce230', 'd43a285f-5fbb-4373-9385-6b49ee871918', 9, null), -- clear-unsupported
      ('b69e4967-da70-4308-be70-c23ee0cce230', 'd5669cdb-12f4-4c23-b802-ba67cbdc0ca9', 8, null), -- clear-unsupported
      -- CLUB · 2023 · 2023 Northeast Men's Regional Championship (2023-northeast-mens-regional-championship) · ended 2023-09-24
      ('510439d8-fba7-4505-85ff-8839978e168d', '362a39eb-fb53-4739-9481-ae048f455cb7', null, 14),
      -- CLUB · 2023 · 2023 Mid-Atlantic Men's Regional Championship (2023-mid-atlantic-mens-regional-championship) · ended 2023-10-01
      ('321329ab-dcf9-4a0f-b739-a68964c4f65a', '5680fe0c-bd2d-4c26-ab49-7b9ffb3cffa8', null, 7),
      ('321329ab-dcf9-4a0f-b739-a68964c4f65a', 'ffb983a0-af2e-4d91-9b0f-63f32c22f399', null, 8),
      ('321329ab-dcf9-4a0f-b739-a68964c4f65a', 'ad212163-654d-445d-9414-ecfae3f8517e', null, 13),
      -- CLUB · 2023 · 2023 Mid-Atlantic Mixed Regional Championship (2023-mid-atlantic-mixed-regional-championship) · ended 2023-10-01
      ('12b1c648-28fa-4437-8e02-9b4a62417744', '03e24c1e-344f-4222-9531-d2101da83b17', null, 7),
      ('12b1c648-28fa-4437-8e02-9b4a62417744', '24f5dbf8-069b-465a-ba9c-938a6c1d1347', null, 8),
      -- CLUB · 2023 · 2023 USA Ultimate Club Championships (2023-usa-ultimate-club-championships) · ended 2023-10-22
      ('33b68c9e-47ce-4b56-908b-de813f7f000a', '432b2e17-e375-4cde-b8e8-e72ce339e610', null, 5),
      ('33b68c9e-47ce-4b56-908b-de813f7f000a', 'a6bfcf68-c092-4642-a520-feab3c7876d5', null, 6),
      -- CLUB · 2024 · PADA Flagship Tournament (pada-flagship-tournament) · ended 2024-06-09
      ('e2f756af-086c-45bb-bf12-45cf2e9d6fd5', 'fa2c3e14-a020-4129-a68c-cdd0cecefac5', null, 3),
      ('e2f756af-086c-45bb-bf12-45cf2e9d6fd5', 'd1be1bcb-86b0-4554-b48e-af6bc29bf3e1', null, 4),
      -- CLUB · 2024 · Antlerlock 2024 (antlerlock-2024) · ended 2024-06-30
      ('68024063-8f90-44fc-960c-15511c3a87f1', 'b6e94a59-3ab5-4eef-bea3-18893f2eb934', 7, 8), -- correct
      -- CLUB · 2024 · Bid in the Bend 2024 (bid-in-the-bend-2024) · ended 2024-07-28
      ('79db3f71-d596-45df-a3a2-db46aed55bd8', 'b4afacee-f453-461d-906a-5be1e18948a2', 7, 8), -- correct
      -- CLUB · 2024 · Midas' Entanglement (midas-entanglement) · ended 2024-07-28
      ('f70ed12d-467b-4b3a-86f4-69bdfeb8dec8', '71c1a37d-101d-4a3b-8c14-e019c35d365c', null, 7),
      ('f70ed12d-467b-4b3a-86f4-69bdfeb8dec8', '33874bd2-7489-4e38-86d2-0d3d39d638e8', null, 8),
      -- CLUB · 2024 · Flower Power 2024 (flower-power-2024) · ended 2024-08-04
      ('c893d639-d7a2-40ce-af2c-47d7d413084b', '0945c19e-d329-40b8-bb47-3ca45a619345', null, 17),
      ('c893d639-d7a2-40ce-af2c-47d7d413084b', 'c92e8546-54fd-46ad-9a18-d39a1c1fb9f1', null, 18),
      ('c893d639-d7a2-40ce-af2c-47d7d413084b', 'b3227c89-cebf-446a-9459-eb31db7ac00a', 19, 20), -- correct
      -- CLUB · 2024 · 2024 Capital Mixed Sectional Championship (2024-capital-mixed-sectional-championship) · ended 2024-09-08
      ('a5ad2302-62b5-449a-9827-c29345d4c20b', '8b11aed4-12ac-4647-bc47-d734e6d98a56', null, 11),
      ('a5ad2302-62b5-449a-9827-c29345d4c20b', '764d4b1f-d3d6-40f0-9c75-95359cb07fd7', null, 12),
      -- CLUB · 2024 · 2024 Central Plains Men's Sectional Championship (2024-central-plains-mens-sectional-championship) · ended 2024-09-08
      ('97db0455-8dab-43d7-a18c-26e7f0fecefe', 'c2203ce9-f62f-445b-a8f5-a085d12b082d', 11, 12), -- correct
      -- CLUB · 2024 · 2024 North Carolina Mixed Sectional Championship (2024-north-carolina-mixed-sectional-championship) · ended 2024-09-08
      ('e2d789e9-32e7-44b9-93e2-0ec0838eb105', '3a01f8d3-f4c8-491e-8331-4429a577afea', null, 10),
      ('e2d789e9-32e7-44b9-93e2-0ec0838eb105', '81e2e773-76f3-4e7f-a24d-ecc2e83b0be9', 10, 11), -- correct
      -- CLUB · 2024 · 2024 Oregon Mixed Sectional Championship (2024-oregon-mixed-sectional-championship) · ended 2024-09-08
      ('8c7af6fe-7cad-45f6-802c-c4268adff5e5', 'ab09a891-63e2-43c1-86ba-5d06a7f98bb9', 3, 4), -- correct
      -- CLUB · 2024 · 2024 Great Lakes Men's Regional Championship (2024-great-lakes-mens-regional-championship) · ended 2024-09-22
      ('c9bfa5c0-06b9-4dfd-85c9-7da31a242536', '418ebd7a-695c-4b99-800d-189c73b75612', null, 16),
      -- CLUB · 2024 · 2024 North Central Mixed Regional Championship (2024-north-central-mixed-regional-championship) · ended 2024-09-22
      ('3231a7f0-c470-42d1-8c91-2b56446fc064', '14d8ee4f-ec17-4eb0-9a90-43c1581befac', 7, 8), -- correct
      ('3231a7f0-c470-42d1-8c91-2b56446fc064', 'e9d6cded-207b-4bcc-bbbe-4dd0e7e82e58', null, 9),
      ('3231a7f0-c470-42d1-8c91-2b56446fc064', '201f8a5d-4fc7-4d90-97c7-a3b3f9d3eaec', null, 10),
      ('3231a7f0-c470-42d1-8c91-2b56446fc064', '5abc3f82-ecdb-4194-abe1-acaa3f2171d3', 11, 12), -- correct
      ('3231a7f0-c470-42d1-8c91-2b56446fc064', '12aecb88-d7e1-4193-a33b-c332fdf22067', null, 13),
      ('3231a7f0-c470-42d1-8c91-2b56446fc064', 'ec72e1ff-23fe-4671-9747-144b09950ed8', null, 14),
      ('3231a7f0-c470-42d1-8c91-2b56446fc064', '21990820-bde5-42fe-80c4-2f841720c336', null, 15),
      ('3231a7f0-c470-42d1-8c91-2b56446fc064', '03c3a600-26a0-46cc-80a9-9d776370863e', null, 16),
      -- CLUB · 2024 · 2024 Northeast Mixed Regional Championship (2024-northeast-mixed-regional-championship) · ended 2024-09-22
      ('0d0bdac8-092c-4645-9035-aee08683d011', '183e46fc-057e-4ccc-ad7e-4bb78aa7cc54', null, 5),
      ('0d0bdac8-092c-4645-9035-aee08683d011', 'ac2a6e76-4c93-4acf-be36-2e9a2bdfcadf', null, 6),
      -- CLUB · 2024 · 2024 Southeast Men's Regional Championship (2024-southeast-mens-regional-championship) · ended 2024-09-22
      ('ade71cf8-0a97-4b87-8179-725b5440c672', '66cbf64e-d8a9-4d17-9868-4eba2f0550e2', null, 15),
      ('ade71cf8-0a97-4b87-8179-725b5440c672', 'f239ba6b-9394-4b89-80cf-13c411e80043', null, 15),
      -- CLUB · 2024 · 2024 Southwest Men's Regional Championship (2024-southwest-mens-regional-championship) · ended 2024-09-22
      ('4dc2f5ca-7f43-40af-8afc-a25e7d70c311', 'bfc0b47b-d0bb-4187-86f3-5a62c2336b32', null, 9),
      ('4dc2f5ca-7f43-40af-8afc-a25e7d70c311', '6070e754-0dfc-47b3-b8fa-aba46c86b61d', null, 10),
      ('4dc2f5ca-7f43-40af-8afc-a25e7d70c311', 'c92e54c8-1c27-48e1-be7e-3f406f06b261', null, 13),
      ('4dc2f5ca-7f43-40af-8afc-a25e7d70c311', '93bb54b1-7321-419e-b354-8345a8959a39', null, 14),
      ('4dc2f5ca-7f43-40af-8afc-a25e7d70c311', 'd2d16884-5a47-41c3-991e-163a49bf6f75', null, 15),
      ('4dc2f5ca-7f43-40af-8afc-a25e7d70c311', 'feb42bec-d558-4d31-8f7c-36d81369e59a', null, 16),
      -- CLUB · 2024 · New York Minute 2024 (new-york-minute-2024) · ended 2024-11-10
      ('cd457750-2072-44db-9f28-1ebcf9d22712', '2d603aec-b415-444e-a6fc-6a4c4dbbc333', 3, 4), -- correct
      -- CLUB · 2025 · June Bloom (june-bloom) · ended 2025-06-15
      ('fa5d6fc6-bfd0-4b55-b352-99081d22b08d', 'f4975f04-5319-405a-834d-3a12a09deda6', null, 5),
      ('fa5d6fc6-bfd0-4b55-b352-99081d22b08d', '77aec533-012d-46d5-b89e-a6f6fc9f9318', null, 6),
      -- CLUB · 2025 · 2025 Pittsburgh Summer Mixed Club Tournament (2025-pittsburgh-summer-mixed-club-tournament) · ended 2025-06-29
      ('f819472c-bada-4d0c-8aa2-18908b59f9d8', '1c30979d-8d59-4b35-b488-8114f4577a9d', null, 5),
      ('f819472c-bada-4d0c-8aa2-18908b59f9d8', '3908b86b-20cc-4f5e-b19f-4a36122704b4', null, 6),
      -- CLUB · 2025 · Bid in the Bend 2025 (bid-in-the-bend-2025) · ended 2025-08-10
      ('978a9730-f97e-4a1b-a83f-47cec262dbb3', '18589da5-5e91-4150-9428-8e64dea0788a', null, 8),
      -- CLUB · 2025 · 2025 Capital Men's Sectional Championship (2025-capital-mens-sectional-championship) · ended 2025-09-07
      ('a67de5b7-88e6-42cc-8ff1-17b5d2ba1693', '19ac5293-83f8-45af-a4aa-c8e2d16e8af5', 15, 16), -- correct
      -- CLUB · 2025 · 2025 Capital Women's Sectional Championship (2025-capital-womens-sectional-championship) · ended 2025-09-07
      ('841eaf6c-0296-4097-ba76-8751abeb47a2', '6e819009-30a5-4d96-bcdd-1a30cd57324b', null, 1),
      ('841eaf6c-0296-4097-ba76-8751abeb47a2', '53d6ccbe-b175-4644-b5c1-72445d0857ad', null, 2),
      ('841eaf6c-0296-4097-ba76-8751abeb47a2', '475a66d1-2f79-4e7e-9949-bc7adea8b7f0', null, 3),
      ('841eaf6c-0296-4097-ba76-8751abeb47a2', '8e371275-90c7-428e-97df-b1842c6b32c2', null, 4),
      ('841eaf6c-0296-4097-ba76-8751abeb47a2', 'd60cbe3b-148a-4254-a9bf-8f67897d80f4', null, 5),
      ('841eaf6c-0296-4097-ba76-8751abeb47a2', '8c7035a1-5354-4cc2-b863-034f4ac77594', null, 6),
      -- CLUB · 2025 · 2025 Central Plains Men's Sectional Championship (2025-central-plains-mens-sectional-championship) · ended 2025-09-07
      ('42ed35e7-9415-450e-959c-87368c52029d', 'd3924106-0c2f-4cac-933b-6af3cb781019', 5, 6), -- correct
      -- CLUB · 2025 · 2025 Florida Men's Sectional Championship (2025-florida-mens-sectional-championship) · ended 2025-09-07
      ('8daabe14-1fcd-491b-928d-75e6967fdc08', '55470a1e-4360-4f5e-b4f1-81138653eac1', null, 1),
      ('8daabe14-1fcd-491b-928d-75e6967fdc08', '2a8c288b-2a4b-41fb-9072-742458f424a6', null, 2),
      ('8daabe14-1fcd-491b-928d-75e6967fdc08', '1d0b979f-86d2-4e3e-9b5b-40c821335255', null, 3),
      ('8daabe14-1fcd-491b-928d-75e6967fdc08', '146e51e3-3c8e-417a-8ec9-450d2ebc160c', null, 4),
      ('8daabe14-1fcd-491b-928d-75e6967fdc08', '21348e0e-5508-45b6-8ac6-bd4af18ae929', null, 5),
      ('8daabe14-1fcd-491b-928d-75e6967fdc08', '6018dee1-e48c-42f4-a885-5e35154b853d', null, 5),
      ('8daabe14-1fcd-491b-928d-75e6967fdc08', '505bd025-08ca-445a-b618-d9f5c499dbee', null, 7),
      ('8daabe14-1fcd-491b-928d-75e6967fdc08', '4f684db9-530e-4a2b-a351-e88d76bb51dd', null, 8),
      -- CLUB · 2025 · 2025 Metro New York Men's Sectional Championship (2025-metro-new-york-mens-sectional-championship) · ended 2025-09-07
      ('f05acd27-36da-46c0-8c0b-a9d47ff4807e', '9fb84b16-c13a-4414-8b82-45e09b989682', null, 1),
      ('f05acd27-36da-46c0-8c0b-a9d47ff4807e', 'ad25e546-39b9-42f6-8968-e03bd041bd6d', null, 2),
      ('f05acd27-36da-46c0-8c0b-a9d47ff4807e', '5ee97334-88b3-41af-b13b-73b719770b7d', null, 3),
      ('f05acd27-36da-46c0-8c0b-a9d47ff4807e', '601e821a-98e2-4281-bc29-c7e66c0fa634', null, 4),
      ('f05acd27-36da-46c0-8c0b-a9d47ff4807e', 'd743f91a-95a8-4e97-b0e8-a616935426cb', null, 5),
      ('f05acd27-36da-46c0-8c0b-a9d47ff4807e', '2f5595e5-6731-4491-8aef-e7325ebd6aca', null, 6),
      -- CLUB · 2025 · 2025 Metro New York Mixed Sectional Championship (2025-metro-new-york-mixed-sectional-championship) · ended 2025-09-07
      ('901b85e1-ca33-4fcd-a255-2290e2dd5bc3', '6b8d8ad5-f801-42a2-8abb-468bf80d3c54', null, 1),
      ('901b85e1-ca33-4fcd-a255-2290e2dd5bc3', '78045c63-d206-485d-a651-2dffa2b8f5f7', null, 2),
      ('901b85e1-ca33-4fcd-a255-2290e2dd5bc3', 'b741579a-ebf7-4dd7-a613-fdc4007020a4', null, 3),
      ('901b85e1-ca33-4fcd-a255-2290e2dd5bc3', '98d0a1a3-1c07-49c5-ad7d-70aade1ac906', null, 4),
      ('901b85e1-ca33-4fcd-a255-2290e2dd5bc3', '904bcd7d-82f4-4487-b295-46fec99d3141', null, 5),
      ('901b85e1-ca33-4fcd-a255-2290e2dd5bc3', 'bba4328b-d290-4cfc-ab60-3e4c27406cc0', null, 6),
      -- CLUB · 2025 · 2025 NorCal Women's Sectional Championship (2025-norcal-womens-sectional-championship) · ended 2025-09-07
      ('df79309a-51db-424c-8f90-be5017296a04', 'e799585c-353d-4dd8-8a04-54cb6f1ed281', null, 1),
      ('df79309a-51db-424c-8f90-be5017296a04', 'b036206f-1aba-4e38-80a1-7e7ecf35a984', null, 2),
      ('df79309a-51db-424c-8f90-be5017296a04', '578bf86e-8ca8-4933-b133-ad600bcef74d', null, 3),
      ('df79309a-51db-424c-8f90-be5017296a04', '8e8dced0-4d89-4fd2-9ab1-80f40eec3a1a', null, 4),
      -- CLUB · 2025 · 2025 North Carolina Men's Sectional Championship (2025-north-carolina-mens-sectional-championship) · ended 2025-09-07
      ('9ad32490-2128-424f-a3a2-7e6adb417708', 'bcbf3900-3fbe-4f26-b7da-04ac7445b948', null, 1),
      ('9ad32490-2128-424f-a3a2-7e6adb417708', '5d7e745b-3ad8-410d-8d5a-6443d7f550c9', null, 2),
      ('9ad32490-2128-424f-a3a2-7e6adb417708', '73c89fcb-cf44-450f-a37e-ae2a8eff3854', null, 3),
      ('9ad32490-2128-424f-a3a2-7e6adb417708', '613a9444-ad51-4556-b283-7019078db08b', null, 4),
      ('9ad32490-2128-424f-a3a2-7e6adb417708', '53823602-e9d3-425c-bba5-e30bc0c169d6', null, 5),
      ('9ad32490-2128-424f-a3a2-7e6adb417708', 'c95071ca-52f8-46ec-a278-e7f6bd321dc8', null, 6),
      ('9ad32490-2128-424f-a3a2-7e6adb417708', 'f941a377-f331-4735-9a4f-e0e8de03fe81', null, 7),
      ('9ad32490-2128-424f-a3a2-7e6adb417708', '7417af9c-e98d-48cc-9be7-b704fd83bbc7', null, 8),
      -- CLUB · 2025 · 2025 North Carolina Women's Sectional Championship (2025-north-carolina-womens-sectional-championship) · ended 2025-09-07
      ('8c0729c7-92de-4cac-84be-493e0f197345', 'b65e1b93-9aa3-4016-b32b-84ae00ed74cb', null, 1),
      ('8c0729c7-92de-4cac-84be-493e0f197345', '85c9cc23-a7a5-4601-87d5-bc647681954c', null, 2),
      -- CLUB · 2025 · 2025 North Plains Mixed Sectional Championship (2025-north-plains-mixed-sectional-championship) · ended 2025-09-07
      ('71c9a616-7d80-4fa8-8a6d-86e3352de135', '2fff5b5f-aa27-461c-8132-5d9b4c9631e4', null, 1),
      ('71c9a616-7d80-4fa8-8a6d-86e3352de135', 'b6def7a9-06e2-46c5-b341-3d07813900be', null, 2),
      ('71c9a616-7d80-4fa8-8a6d-86e3352de135', '54d2593e-5bbb-495e-b3c8-96b399088668', null, 3),
      ('71c9a616-7d80-4fa8-8a6d-86e3352de135', '28e3b29a-2dd2-4028-bbc8-850603aedf36', null, 4),
      ('71c9a616-7d80-4fa8-8a6d-86e3352de135', '17300325-b1e1-4a73-a642-a0da69c06f03', null, 5),
      ('71c9a616-7d80-4fa8-8a6d-86e3352de135', '05dd37af-dede-4749-8760-e21a3a512e62', null, 6),
      ('71c9a616-7d80-4fa8-8a6d-86e3352de135', '04cc2a67-3718-4073-91fe-b005aa21879a', null, 7),
      ('71c9a616-7d80-4fa8-8a6d-86e3352de135', 'c949d4d7-4648-4f0f-a9d5-fc1615f0e2e9', null, 8),
      ('71c9a616-7d80-4fa8-8a6d-86e3352de135', '872b23fd-ab81-4076-9428-01706c0789e3', null, 9),
      ('71c9a616-7d80-4fa8-8a6d-86e3352de135', 'c18e406e-5051-40c3-b4f0-30f924d27bed', null, 10),
      ('71c9a616-7d80-4fa8-8a6d-86e3352de135', 'dca6c42f-4ccc-4e20-ae13-ebf54aa9a773', null, 11),
      ('71c9a616-7d80-4fa8-8a6d-86e3352de135', 'ec749b30-e0d7-48de-86e3-6e495db42743', null, 12),
      -- CLUB · 2025 · 2025 Northwest Plains Men's Sectional Championship (2025-northwest-plains-mens-sectional-championship) · ended 2025-09-07
      ('6f6f887a-462c-4e74-8b79-856987fadb38', 'a7ab21b9-fdea-465e-8b21-6ec56a64d82e', null, 1),
      ('6f6f887a-462c-4e74-8b79-856987fadb38', 'c0719046-282c-4b5c-8109-206ab32cc0bf', null, 2),
      ('6f6f887a-462c-4e74-8b79-856987fadb38', 'a747facd-ba2b-427a-9121-9260e0c9c3a0', null, 3),
      ('6f6f887a-462c-4e74-8b79-856987fadb38', '122d0400-8eb3-42ad-80a0-57e29d947838', null, 4),
      ('6f6f887a-462c-4e74-8b79-856987fadb38', 'f4cfa363-d78e-4ec8-a509-bb010738ad23', null, 5),
      ('6f6f887a-462c-4e74-8b79-856987fadb38', '5a46bd58-cac9-43dd-8740-8f0c2a31e410', null, 6),
      -- CLUB · 2025 · 2025 Upstate New York Men's Sectional Championship (2025-upstate-new-york-mens-sectional-championship) · ended 2025-09-07
      ('d189e9f3-6801-4f36-922e-6ca6e5c58a28', '0102da2a-d3fe-41e5-812d-d8da3ff6c556', null, 1),
      ('d189e9f3-6801-4f36-922e-6ca6e5c58a28', '7ccb3eca-8802-4c0e-a0ff-939d1372af15', null, 2),
      ('d189e9f3-6801-4f36-922e-6ca6e5c58a28', '6a10647c-8de1-4d7f-a107-7caf84b5ceee', null, 3),
      ('d189e9f3-6801-4f36-922e-6ca6e5c58a28', '094578c2-9ab5-4b3d-b20e-f054f4cf68ee', null, 4),
      ('d189e9f3-6801-4f36-922e-6ca6e5c58a28', 'a7b9766f-5a8a-45c6-a9ca-5f6b270707c9', null, 5),
      ('d189e9f3-6801-4f36-922e-6ca6e5c58a28', 'df017d2a-9f9f-4a02-8330-cfb2fe3fa9f8', null, 6),
      ('d189e9f3-6801-4f36-922e-6ca6e5c58a28', '9335ff1e-edc7-4dc6-9d36-b4cbdbc3dc7c', null, 7),
      ('d189e9f3-6801-4f36-922e-6ca6e5c58a28', 'cec38c14-d262-4c96-860b-bcd322cc2102', null, 8),
      -- CLUB · 2025 · 2025 Washington Women's Sectional Championship (2025-washington-womens-sectional-championship) · ended 2025-09-07
      ('26cfdd3d-a550-436f-b3a5-8eb49308344b', 'cf4290fa-9955-4271-bd47-440b51e9fa45', null, 1),
      ('26cfdd3d-a550-436f-b3a5-8eb49308344b', '6694fe91-f2da-49dc-96da-0b00faf9a3e4', null, 2),
      ('26cfdd3d-a550-436f-b3a5-8eb49308344b', '05387137-1956-4373-8b7a-bec6424669e6', null, 3),
      ('26cfdd3d-a550-436f-b3a5-8eb49308344b', '29f9beb7-7d41-4653-8a92-e129f1b2a5dc', null, 3),
      ('26cfdd3d-a550-436f-b3a5-8eb49308344b', '611033b7-cc6b-49de-ad45-d72c8a9ff27b', null, 5),
      ('26cfdd3d-a550-436f-b3a5-8eb49308344b', 'a1bd185c-70cd-44ca-93b7-356d72d89e30', null, 6),
      -- CLUB · 2025 · 2025 West Bay Mixed Sectional Championship (2025-west-bay-mixed-sectional-championship) · ended 2025-09-07
      ('24ae566b-1f25-4579-8313-986a9e521559', '0f528cb7-435b-4128-a3e1-4d83277e3ee3', null, 9),
      ('24ae566b-1f25-4579-8313-986a9e521559', '09503313-c463-4a92-8c16-608075a04637', null, 10),
      ('24ae566b-1f25-4579-8313-986a9e521559', '043eb60f-485f-4e51-b866-1830320d06e4', 11, 12), -- correct
      -- CLUB · 2025 · 2025 West Plains Men's Sectional Championship (2025-west-plains-mens-sectional-championship) · ended 2025-09-07
      ('abef44b6-5f99-475e-b37a-69a7c8bc24d0', '0b516099-6f40-479c-a767-111d9519c06c', null, 1),
      ('abef44b6-5f99-475e-b37a-69a7c8bc24d0', 'd1c66367-027c-4ab7-8dc2-188a586a7c1b', null, 2),
      ('abef44b6-5f99-475e-b37a-69a7c8bc24d0', '7fbe055d-91b6-4be0-98f6-65435a78f5aa', null, 3),
      ('abef44b6-5f99-475e-b37a-69a7c8bc24d0', '2013bedb-42fd-4b56-9316-011782c81078', null, 4),
      ('abef44b6-5f99-475e-b37a-69a7c8bc24d0', 'da875ddf-2c12-4ed5-a1ee-f42269c10920', null, 5),
      ('abef44b6-5f99-475e-b37a-69a7c8bc24d0', '186f2847-7a2e-41cd-bae6-fa628fa8b698', null, 6),
      ('abef44b6-5f99-475e-b37a-69a7c8bc24d0', '6b0e869c-7a1e-430a-8551-1a765729c9e8', null, 7),
      ('abef44b6-5f99-475e-b37a-69a7c8bc24d0', '3ba4a872-e173-42fe-a9fe-5969e87f4427', null, 8),
      ('abef44b6-5f99-475e-b37a-69a7c8bc24d0', '8f62cb62-877c-4d47-9af5-9a3b5c7120af', null, 9),
      ('abef44b6-5f99-475e-b37a-69a7c8bc24d0', 'f961aa82-7bdb-4c6a-a7fb-de1d4ccff319', null, 10),
      ('abef44b6-5f99-475e-b37a-69a7c8bc24d0', '931fd77a-4b43-4c80-9507-84cc41af3efe', null, 11),
      -- CLUB · 2025 · 2025 Great Lakes Mixed Regional Championship (2025-great-lakes-mixed-regional-championship) · ended 2025-09-21
      ('dd09c0de-e647-4d92-9f68-e0bdce33a82e', '06be1b90-e0a6-4e75-9628-7a78fb5d3f62', 11, 12), -- correct
      -- CLUB · 2025 · 2025 North Central Mixed Regional Championship (2025-north-central-mixed-regional-championship) · ended 2025-09-21
      ('044b0d28-56da-4a36-a194-a9f11533ee5c', 'b6def7a9-06e2-46c5-b341-3d07813900be', null, 9),
      ('044b0d28-56da-4a36-a194-a9f11533ee5c', '683ab5fa-e79c-4401-84c1-127e13aad13d', null, 10),
      -- CLUB · 2025 · 2025 Northwest Mixed Regional Championship (2025-northwest-mixed-regional-championship) · ended 2025-09-21
      ('e5958ce5-4500-406e-8a92-f0f744507420', 'd6a64cb2-8661-4c7d-abb1-3da38d380a93', 7, 8), -- correct
      -- CLUB · 2025 · 2025 Southeast Men's Regional Championship (2025-southeast-mens-regional-championship) · ended 2025-09-21
      ('4fbbfc74-cd81-4e39-9d04-e9c35bbf1744', 'a172c257-81b2-4bb4-bf8c-82975a9a4496', null, 13),
      ('4fbbfc74-cd81-4e39-9d04-e9c35bbf1744', '46795b7d-9832-4854-877b-58d425244c81', null, 14),
      -- CLUB · 2026 · Flickel City Classic (Flickel-City-Classic) · ended 2026-07-12
      ('87c56ee8-a11b-4e4d-b2a2-0bc3782ca514', 'ccb52c9d-5567-404e-8590-b16ac6828fbf', 5, null), -- clear-unsupported
      ('87c56ee8-a11b-4e4d-b2a2-0bc3782ca514', 'e0d3cb9e-ebf7-4ff3-84b2-5119b8a19dd0', 6, null), -- clear-unsupported
      -- CLUB · 2026 · 2026 Southeast Mixed Club Regional Championship (2026-Southeast-Mixed-Club-Regional-Championship) · ended 2026-09-27
      ('fc4da22f-8ddc-4ca4-9619-42717879276f', '7154f3dd-bf80-433d-adfe-843edd9e0113', null, 1),
      ('fc4da22f-8ddc-4ca4-9619-42717879276f', 'dfb75863-facc-44ce-ae5d-e5b8d278c0d6', null, 2),
      ('fc4da22f-8ddc-4ca4-9619-42717879276f', '6e00cd82-a6e3-4e18-a60e-76d55903bc9e', null, 3),
      ('fc4da22f-8ddc-4ca4-9619-42717879276f', 'af0051b7-138c-439b-b339-6545876cebd1', null, 4),
      ('fc4da22f-8ddc-4ca4-9619-42717879276f', 'ea03d24a-6878-4f52-b990-12c276763307', null, 5),
      ('fc4da22f-8ddc-4ca4-9619-42717879276f', '1edc70c5-f5a4-4eaa-b615-0f001b3b9a71', null, 6),
      ('fc4da22f-8ddc-4ca4-9619-42717879276f', '27ae6355-4da0-4cd8-80f6-fb14d4bd6192', null, 7),
      ('fc4da22f-8ddc-4ca4-9619-42717879276f', '8911686a-8601-48d6-b362-534aa389a2c8', null, 8),
      ('fc4da22f-8ddc-4ca4-9619-42717879276f', '7fcc8bf5-c608-4208-bd0b-62dffd531a6c', null, 9),
      ('fc4da22f-8ddc-4ca4-9619-42717879276f', '1f800512-b7cf-43cb-9bb4-a8e3432b2f6b', null, 10),
      ('fc4da22f-8ddc-4ca4-9619-42717879276f', 'e01925a3-7967-43ed-a7b5-4b6d0236ab17', null, 11),
      ('fc4da22f-8ddc-4ca4-9619-42717879276f', 'b986c03b-9604-4722-980f-7d3128b88109', null, 12),
      ('fc4da22f-8ddc-4ca4-9619-42717879276f', '6c873aec-58bb-48c5-81ff-464b70075173', null, 13),
      ('fc4da22f-8ddc-4ca4-9619-42717879276f', '2a39600a-e2f5-4820-8da5-a1984ea9830e', null, 14),
      ('fc4da22f-8ddc-4ca4-9619-42717879276f', '6d426e76-7287-4f54-9668-36847ed9714c', null, 15),
      ('fc4da22f-8ddc-4ca4-9619-42717879276f', 'cda2aef3-e9d8-4ae9-a3fc-326b4b28b8e8', null, 16),
      -- CLUB · 2026 · 2026 Southeast Womens Club Regional Championship (2026-Southeast-Womens-Club-Regional-Championship) · ended 2026-09-27
      ('9414656f-b2b0-4fcb-959b-cf5cf9a41bbe', '2586bd01-4ecf-4639-967b-7c7e4632e9e0', null, 1),
      ('9414656f-b2b0-4fcb-959b-cf5cf9a41bbe', '9ec69d20-fef6-42a0-9570-9aa6531deace', null, 2),
      ('9414656f-b2b0-4fcb-959b-cf5cf9a41bbe', '300ead93-9dc1-427c-a186-dfe48fae0730', null, 3),
      ('9414656f-b2b0-4fcb-959b-cf5cf9a41bbe', 'e45a6e00-37da-4bd3-aec7-c21bae0264c1', null, 4),
      ('9414656f-b2b0-4fcb-959b-cf5cf9a41bbe', '3d0f9798-d7b8-4581-ba88-f5a0d3225387', null, 5),
      ('9414656f-b2b0-4fcb-959b-cf5cf9a41bbe', 'e73ca4c8-ebed-4271-af11-439005caefc2', null, 6),
      ('9414656f-b2b0-4fcb-959b-cf5cf9a41bbe', '1a9932ba-0b03-4615-b3f8-1b30cb41baaa', null, 7),
      ('9414656f-b2b0-4fcb-959b-cf5cf9a41bbe', '2449cbb3-930f-4bde-8938-5a6d4ffa3d1c', null, 8),
      -- CLUB · 2026 · 2026 Southwest Mens Club Regional Championship (2026-Southwest-Mens-Club-Regional-Championship) · ended 2026-09-27
      ('8c86b2a7-46d8-4470-946e-3cfe3fcf78ce', '8d8cd8da-5d36-4fb6-bba6-8eade5066c1e', null, 1),
      ('8c86b2a7-46d8-4470-946e-3cfe3fcf78ce', '851059fa-0832-4b18-bcee-12a693aafc07', null, 2),
      ('8c86b2a7-46d8-4470-946e-3cfe3fcf78ce', '668ec0e7-608f-4d32-a756-4a3576ae2f10', null, 3),
      ('8c86b2a7-46d8-4470-946e-3cfe3fcf78ce', '36e0339a-e79b-4e08-a5a4-61602709fff9', null, 4),
      ('8c86b2a7-46d8-4470-946e-3cfe3fcf78ce', 'bda4ec15-ac1f-4ee7-b1cb-1cb6d698754b', null, 5),
      ('8c86b2a7-46d8-4470-946e-3cfe3fcf78ce', '089eeb9c-c2ac-424c-8a33-7b985693eca7', null, 6),
      ('8c86b2a7-46d8-4470-946e-3cfe3fcf78ce', 'bf15c804-b0c5-42f0-810f-8ee7d1d628f4', null, 7),
      ('8c86b2a7-46d8-4470-946e-3cfe3fcf78ce', '35d12e80-f0c8-4c05-9a6d-bc9a0456826e', null, 8),
      ('8c86b2a7-46d8-4470-946e-3cfe3fcf78ce', '6c6cb223-6783-4a9c-8ea7-c81006e5e20a', null, 9),
      ('8c86b2a7-46d8-4470-946e-3cfe3fcf78ce', '7cda0e23-03b2-4569-bcd8-6317ef375554', null, 10),
      ('8c86b2a7-46d8-4470-946e-3cfe3fcf78ce', '13c92e6f-1ff2-47b1-a9ae-a1d3ae8f555e', null, 11),
      ('8c86b2a7-46d8-4470-946e-3cfe3fcf78ce', '9eb78152-69be-4275-b31d-9ceacf2f48d8', null, 12),
      -- CLUB · 2026 · 2026 Southwest Mixed Club Regional Championship (2026-Southwest-Mixed-Club-Regional-Championship) · ended 2026-09-27
      ('8c9bb195-fc9c-48c7-ae06-1c16eec380e0', 'bd975808-221e-4006-8dbd-ca7bb03b9e2f', null, 1),
      ('8c9bb195-fc9c-48c7-ae06-1c16eec380e0', '6a02195e-ff33-42eb-bad4-1096795fc8f7', null, 2),
      ('8c9bb195-fc9c-48c7-ae06-1c16eec380e0', 'd8672131-dd7c-49a2-9083-317f8c8ecebf', null, 3),
      ('8c9bb195-fc9c-48c7-ae06-1c16eec380e0', '061b3f31-47e1-4b63-8018-3252814dfe20', null, 4),
      ('8c9bb195-fc9c-48c7-ae06-1c16eec380e0', 'ea6a8439-ab1d-4150-843a-70573540fa51', null, 5),
      ('8c9bb195-fc9c-48c7-ae06-1c16eec380e0', '37a41c3b-76ca-4700-8077-356d1536129e', null, 6),
      ('8c9bb195-fc9c-48c7-ae06-1c16eec380e0', '8767af3a-0c79-40a5-be25-4c92e10f26e7', null, 8),
      ('8c9bb195-fc9c-48c7-ae06-1c16eec380e0', 'b7674835-7e2f-4503-8990-b4cf380bb618', null, 9),
      ('8c9bb195-fc9c-48c7-ae06-1c16eec380e0', '3e1e6c06-3a01-4ebc-af3d-45c5aa86087a', null, 10),
      ('8c9bb195-fc9c-48c7-ae06-1c16eec380e0', 'a5c0c1f6-6f98-4cc1-b6ea-ec1c80cf991a', null, 13),
      ('8c9bb195-fc9c-48c7-ae06-1c16eec380e0', '1347a61e-f9c8-48d6-9cfd-300788fc86e8', null, 14),
      ('8c9bb195-fc9c-48c7-ae06-1c16eec380e0', '3f57a85e-0d41-466f-acd0-f81dc34fb85e', null, 15),
      ('8c9bb195-fc9c-48c7-ae06-1c16eec380e0', 'e468f512-af04-4655-9090-33272173a770', null, 16),
      -- CLUB · 2026 · 2026 Southwest Womens Club Regional Championship (2026-Southwest-Womens-Club-Regional-Championship) · ended 2026-09-27
      ('90b6b278-0966-49b0-8a45-bc285ae3a42c', '70502e5f-a123-45a9-96e7-68c0f6168725', null, 1),
      ('90b6b278-0966-49b0-8a45-bc285ae3a42c', '9ad681b8-f5ec-497f-a13e-a616c98edc43', null, 2),
      ('90b6b278-0966-49b0-8a45-bc285ae3a42c', '85f175b2-2706-45f5-af77-62764372516a', null, 3),
      ('90b6b278-0966-49b0-8a45-bc285ae3a42c', '45936127-8eac-4b69-af23-23b1c833085e', null, 4),
      ('90b6b278-0966-49b0-8a45-bc285ae3a42c', 'd139ba24-02c7-4951-a7a2-5a89344a58bf', null, 5),
      ('90b6b278-0966-49b0-8a45-bc285ae3a42c', '1de026f2-b555-4e0d-874d-d7d751b4fca1', null, 6),
      ('90b6b278-0966-49b0-8a45-bc285ae3a42c', 'e9e973b3-6e24-4029-ba44-85d79efaa69b', null, 7),
      ('90b6b278-0966-49b0-8a45-bc285ae3a42c', '3a599a55-eb2a-4855-bd6c-e600831e0673', null, 8),
      ('90b6b278-0966-49b0-8a45-bc285ae3a42c', 'f7d5a60a-84a7-4c24-a916-15cb58f42449', null, 9),
      ('90b6b278-0966-49b0-8a45-bc285ae3a42c', 'ed7dc3ac-91a5-4348-86a5-86cfaf73a8dc', null, 10),
      ('90b6b278-0966-49b0-8a45-bc285ae3a42c', 'e29c1429-7b4a-452c-8640-8320dd8c19e1', null, 11),
      ('90b6b278-0966-49b0-8a45-bc285ae3a42c', 'e1a7fa18-5c32-4e46-8c4c-beca66637f7e', null, 12),
      -- COLLEGE_D1 · 2014 · Atlantic Coast Dev College Women's CC 2014 (atlantic-coast-dev-college-womens-cc-2014) · ended 2014-04-13
      ('95b4f209-c754-42df-9cbd-bba725c2b17e', 'f11f5553-4f49-410f-bc1c-f29f2b389d8e', null, 2),
      ('95b4f209-c754-42df-9cbd-bba725c2b17e', '3add05b8-1c60-4ada-a934-a5841920090f', null, 3),
      -- COLLEGE_D1 · 2014 · Carolina D-I College Men's CC 2014 (carolina-d-i-college-mens-cc-2014) · ended 2014-04-13
      ('4a4d54e4-427d-4f61-b426-64c26abe7983', '362667d9-6f6a-4734-ae2b-2779e22f4355', null, 1),
      ('4a4d54e4-427d-4f61-b426-64c26abe7983', '999a419d-4aff-48e9-b472-04145efdd48a', null, 2),
      ('4a4d54e4-427d-4f61-b426-64c26abe7983', '903bfd36-c95a-4eea-8591-a557e5119920', null, 3),
      -- COLLEGE_D1 · 2014 · Colonial D-I College Men's CC 2014 (colonial-d-i-college-mens-cc-2014) · ended 2014-04-13
      ('9fa077a0-1273-4456-93ad-27a40777c64f', '65f3d252-bac7-4604-9181-9d2cf9c44425', null, 1),
      ('9fa077a0-1273-4456-93ad-27a40777c64f', '37463c3d-bfc4-4469-afd8-fb7a157e98c5', null, 2),
      ('9fa077a0-1273-4456-93ad-27a40777c64f', 'edf4c96d-cbc9-4fe9-9ab5-1baf07875036', null, 3),
      -- COLLEGE_D1 · 2014 · Colonial D-I College Women's CC 2014 (colonial-d-i-college-womens-cc-2014) · ended 2014-04-13
      ('c154dfb9-c926-4239-b7f9-129fc241283a', '49099ee3-4d14-4be8-9655-fc6bef77b42b', null, 1),
      ('c154dfb9-c926-4239-b7f9-129fc241283a', '4177bcdf-3f21-435b-a4c3-4dba484b5aef', null, 2),
      ('c154dfb9-c926-4239-b7f9-129fc241283a', '4dc2abc9-974c-46ca-a2fc-6c3c585b2281', null, 3),
      ('c154dfb9-c926-4239-b7f9-129fc241283a', 'b3cdcda8-5966-4472-b9d5-81384c0cc6f1', null, 3),
      -- COLLEGE_D1 · 2014 · East Plains D-I College Men's CC 2014 (east-plains-d-i-college-mens-cc-2014) · ended 2014-04-13
      ('1f956794-356c-4e8c-9b83-8ac9c4738c2e', '1ecd4bde-33fa-48c1-83f2-4dade972b9c7', null, 1),
      ('1f956794-356c-4e8c-9b83-8ac9c4738c2e', '8886111e-7691-4bf3-a0d6-468ec70f73a1', null, 2),
      ('1f956794-356c-4e8c-9b83-8ac9c4738c2e', '633e4f47-547a-45ce-a292-5abfe2bb8840', null, 3),
      ('1f956794-356c-4e8c-9b83-8ac9c4738c2e', '0cb60bda-99f2-4182-b4d1-520aac5e2694', null, 4),
      ('1f956794-356c-4e8c-9b83-8ac9c4738c2e', '8e2f8c6c-0e30-4e43-9c99-a83fa4915aea', null, 5),
      ('1f956794-356c-4e8c-9b83-8ac9c4738c2e', 'fa918554-75e1-4c14-9339-e2093a2a3684', null, 6),
      -- COLLEGE_D1 · 2014 · Eastern Metro East D-I College Women's CC 2014 (eastern-metro-east-d-i-college-womens-cc-2014) · ended 2014-04-13
      ('6d98055a-2106-4a9b-b99b-49face8055dd', '746359c2-f77f-40ef-a319-7e0a0107cdff', null, 3),
      ('6d98055a-2106-4a9b-b99b-49face8055dd', '3818cb98-a3bd-4098-9901-b032e3eb815d', null, 4),
      ('6d98055a-2106-4a9b-b99b-49face8055dd', '0f8d8731-a847-4efc-88f3-d48741de6e7e', null, 5),
      ('6d98055a-2106-4a9b-b99b-49face8055dd', 'e6cf68b1-383a-409f-8cdb-7f4c37ffa163', null, 6),
      ('6d98055a-2106-4a9b-b99b-49face8055dd', 'b46a5869-9a39-4de3-8727-d93dcfe3d8de', null, 7),
      -- COLLEGE_D1 · 2014 · Florida D-I College Men's CC 2014 (florida-d-i-college-mens-cc-2014) · ended 2014-04-13
      ('cac3c4cd-eaa9-4de6-b85d-571f639b678f', 'aafc4022-0daf-45d7-a89e-32bcf873d7b5', null, 1),
      ('cac3c4cd-eaa9-4de6-b85d-571f639b678f', '8b2bf8ae-354a-4392-bf8a-dfb49c3426f8', null, 2),
      ('cac3c4cd-eaa9-4de6-b85d-571f639b678f', '26b62c5b-40b7-4963-ac20-903746e0a039', null, 3),
      ('cac3c4cd-eaa9-4de6-b85d-571f639b678f', '4614a017-0e2e-4868-a740-bc6d3197d66a', null, 4),
      ('cac3c4cd-eaa9-4de6-b85d-571f639b678f', 'e5bf77c0-2650-45b6-817a-658acec1a6ff', null, 5),
      -- COLLEGE_D1 · 2014 · Florida D-I College Women's CC 2014 (florida-d-i-college-womens-cc-2014) · ended 2014-04-13
      ('9ee6e623-48ef-483a-9b40-f3c060ed451c', '215edbe3-eb07-49d0-9700-f034af9f7189', null, 1),
      ('9ee6e623-48ef-483a-9b40-f3c060ed451c', '9e2fe8c0-8c2f-488d-95aa-a130b53aa0e6', null, 2),
      ('9ee6e623-48ef-483a-9b40-f3c060ed451c', 'f576eb94-9d9b-4627-9914-158d87342958', null, 3),
      -- COLLEGE_D1 · 2014 · Florida Dev College Men's CC 2014 (florida-dev-college-mens-cc-2014) · ended 2014-04-13
      ('7fa6d6a9-af74-4ad1-a617-b31e3ef44db8', '78abfaf7-483b-4998-97c8-dffda725d6b4', null, 3),
      ('7fa6d6a9-af74-4ad1-a617-b31e3ef44db8', '6f6e1ec1-3c7d-4c04-b748-4c8536980fb0', null, 4)
    ) as v(event_id, team_id, old_place, new_place)
   where et.event_id = v.event_id
     and et.team_id = v.team_id
     and et.final_placement is not distinct from v.old_place;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> v_expected THEN
    RAISE EXCEPTION 'usau placements part 02: expected % rows, matched %; data drifted since generation, re-run scripts/derive-usau-placements.ts', v_expected, v_updated;
  END IF;
  RAISE NOTICE 'usau placements part 02: updated % rows', v_updated;
END
$migration$;

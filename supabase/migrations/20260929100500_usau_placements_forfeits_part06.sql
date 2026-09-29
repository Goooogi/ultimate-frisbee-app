-- USAU per-event final placements — repair + fill, part 06 of 06.
--
-- The 2026-07-20 one-shot derivePlacements() backfill (Feature Backlog #18)
-- stored misread brackets, game-to-go losers kept 2nd, and ties that a later
-- game had settled; nothing derived placements after it. Regenerated with the
-- fixed algorithm by scripts/derive-usau-placements.ts on 2026-09-29T14:31:03.883Z —
-- do not hand-edit, re-run it.
--
-- This part: 13 events · fill 181 · correct 0 · clear 0 (conflict 0, contradicted 0, unsupported 0).
-- EXPECTED ROWS: 181. A row only updates while final_placement still holds
-- the value it was generated from ("old" below); the DO block raises, rolling
-- this part back, unless exactly 181 rows match. Regenerate instead of forcing it.
-- All 6 parts: 740 events · fill 3512 · correct 174 · clear 91 (conflict 0, contradicted 1, unsupported 90).

DO $migration$
DECLARE
  v_expected constant int := 181;
  v_updated int;
BEGIN
  update public.usau_event_teams et
     set final_placement = v.new_place
    from (values
      -- MASTERS · 2017 · 2017 USA Ultimate Masters Championships (2017-usa-ultimate-masters-championships) · ended 2017-07-23
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13'::uuid, '058a9641-eef0-4bae-a398-cc58817ecb85'::uuid, null::int, 1::int),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', '820d15dd-bb3d-4bb6-a76a-a09cfb1525cd', null, 1),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', 'af28ff92-3515-4182-ab54-8a97d7029f4d', null, 1),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', 'ca96ceac-555b-4f6c-84a8-b89672420973', null, 1),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', 'ed3a55da-75cb-4499-b680-204e062f5866', null, 1),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', 'fbaf82c4-a20b-48f3-b4fe-42bb2f7433a0', null, 1),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', '72044e34-7888-4d93-b794-61d0f6fed60e', null, 2),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', '9845f57b-666d-441a-bc26-e86c39d445d8', null, 2),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', 'a7507e39-506d-4cac-b3c5-6feba3313514', null, 2),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', 'b48bf22a-c38c-4627-a9a1-e9abc82e4cad', null, 2),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', 'e9000073-dfd5-474b-907f-0e2d38143b8a', null, 2),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', 'f68331d4-ffaa-4024-b612-7e15aa70d38f', null, 2),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', '30046d31-242e-4599-b51c-326e2d3c3cdc', null, 3),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', '4bef002c-8d4f-4fe6-ba86-d1e57bea9c2a', null, 3),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', 'b09ddc1a-2c79-4d48-87d9-a38c3365cf8e', null, 3),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', 'c2ff3c04-958d-4f18-a689-b3578d47545a', null, 3),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', 'eaddafff-30eb-42f3-8e6a-34ebb486cc58', null, 3),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', 'edb79386-d746-4773-a7d7-8b9539eab1bc', null, 3),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', '2c0c33a6-3d32-4160-aa3e-b01cd22ff6c2', null, 4),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', '35f29013-4fc8-4848-9246-4fe1e8a313cb', null, 4),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', '5f3acfb8-a327-4829-84a1-aacc19a3a8d2', null, 4),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', 'b535d6b3-b79e-4821-b4b8-163783998f6b', null, 4),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', 'c7d9655d-a376-419b-8744-2c6ffbe3c729', null, 4),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', 'fec5aa4f-bf52-455a-8a39-c2a196767cf4', null, 4),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', '9a24c122-9db8-47f3-a718-a12840a3a226', null, 5),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', '9d459c10-0471-4841-8301-ab14d56f4186', null, 5),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', 'c7a9f432-32b6-43c1-8571-8773fefef366', null, 5),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', 'c87b6c74-f487-4533-b190-b4730fa818a7', null, 5),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', 'd36de239-1ddd-4d97-954a-1fb9fa1e6eea', null, 5),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', 'd3f10605-edb6-4419-a640-a635750ae711', null, 5),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', '00e6fc4b-4680-40f5-ba34-54f2cf0b1bd3', null, 6),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', '73c5a187-4d1a-4a47-bd75-7f507fdae3a9', null, 6),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', '7e4711ef-a1f1-49b3-bade-6742b3b72c88', null, 6),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', '97bce470-20b0-4413-812c-b6c1dbc2cec7', null, 6),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', 'aed32899-cecb-4eb8-a9fb-192ee0206c21', null, 6),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', 'fb02c263-aba2-49a9-b8cb-d9e5abec7b23', null, 6),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', '95672633-d287-4b51-90dc-475f4cf1ad9f', null, 7),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', 'b010818d-9f61-4405-8032-f06feb16520e', null, 7),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', 'b84f4054-d67a-4507-b348-cf7a32b42e1b', null, 7),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', 'ca62accd-6cfd-4475-9799-91a90457a80e', null, 7),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', '4d964824-a347-4289-b031-f8620475b875', null, 8),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', '526bf3bf-9213-43dc-aac2-3110bd8b2ab3', null, 8),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', '9248f7db-478f-48d7-a12f-dcdb6801f208', null, 8),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', 'a90c0155-c92d-4f6c-b767-4dedb5c26d26', null, 8),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', 'be97d52c-bd52-4229-82a3-4876b5d669fc', null, 8),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', '221613ea-f54d-49c8-8e15-75b2b7e277a5', null, 9),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', '390af29e-caf0-4821-a6d4-76502ebd42b1', null, 9),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', 'b227d4f6-0a4e-4339-a490-5e54eed9a4bc', null, 9),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', 'cc8c3915-a4fa-4ca8-8a7d-6833eac64227', null, 9),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', '8136a159-638f-4653-85b4-72f4d8e60739', null, 10),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', 'e545ef0d-79e8-46b3-8c06-d0ae07408500', null, 10),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', 'eb78c4fd-9f8f-49e3-881b-c3515b24f7ab', null, 10),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', 'f344f8ed-f9dd-4fff-845d-246e2733ea41', null, 10),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', '2f2d2483-6bbd-40c6-babb-91928de59b68', null, 11),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', '63a091aa-0f24-4f36-9581-6f40f8e2799e', null, 11),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', '8987f8a6-0ba3-4099-b18d-ecd49f3f0d85', null, 11),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', 'fca1c5d1-f833-40bf-a173-ac772019f506', null, 11),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', 'a039bf14-6f71-4c48-9dd8-d52841c8d739', null, 12),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', 'de796ce3-61c3-4983-82c0-e3fd87a72a15', null, 12),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', 'f06ade50-8e46-4572-96b6-85e2d3db28a9', null, 12),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', '8848e073-eae3-48a9-810b-908d8eb6c008', null, 13),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', 'c5d79c44-d199-4bff-a0b6-54bfd1228e47', null, 13),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', 'dd8052fa-0c72-4ed4-909b-5658f8e21b63', null, 13),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', '958ddccd-8002-441d-8e39-fb0c676c7349', null, 14),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', 'd0200460-fb07-426e-b97d-cc1935868466', null, 14),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', 'fd7d0d98-17e8-4bf0-b17c-74c8060f4f19', null, 14),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', '57565eb6-037a-4dbe-92e4-5eac6c314149', null, 15),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', '5ab54cf3-c472-4536-8914-f9345dd3d03a', null, 15),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', '6b4252b5-2aff-4663-84b4-428b3efcd88c', null, 15),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', '230ac3fd-849d-484b-8ef4-2a41b94ded77', null, 16),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', '4966c83e-7ba5-4830-ab77-fe5a6758e8f8', null, 16),
      ('9b4051b9-ba4a-44df-84db-0cd3614d8a13', '9f8bc31a-95c6-42bb-bc82-e9dfc77508be', null, 16),
      -- MASTERS · 2018 · North Central Men's Masters Regional Championship 2018 (north-central-mens-masters-regional-championship-2018) · ended 2018-06-24
      ('5b189e25-b718-4eef-b2f6-05e53436acf8', '24197ab4-a072-437e-bf1c-233720c7ae79', null, 1),
      ('5b189e25-b718-4eef-b2f6-05e53436acf8', '8b9e547e-1c9b-4a3a-bba6-81695c856961', null, 2),
      ('5b189e25-b718-4eef-b2f6-05e53436acf8', 'e1471b07-9396-4269-bd59-9f2061cd6601', null, 3),
      ('5b189e25-b718-4eef-b2f6-05e53436acf8', '7eeaae19-c170-47b9-bce3-3608aa8eb9e8', null, 4),
      ('5b189e25-b718-4eef-b2f6-05e53436acf8', '2f3255ba-cf3c-4f42-ac0a-0c24d9e000a7', null, 5),
      -- MASTERS · 2018 · North Central Mixed Masters Regional Championship 2018 (north-central-mixed-masters-regional-championship-2018) · ended 2018-06-24
      ('edd9db97-e041-45d4-8e6b-580bea8fdd3d', '5d502877-55b3-4204-a003-113de9254618', null, 1),
      ('edd9db97-e041-45d4-8e6b-580bea8fdd3d', '3c551c0b-fabf-4d4f-9609-e8aa622f3e00', null, 2),
      ('edd9db97-e041-45d4-8e6b-580bea8fdd3d', '02957cb3-27b7-43ee-9f1b-d497eca1132a', null, 3),
      ('edd9db97-e041-45d4-8e6b-580bea8fdd3d', '6968ed94-5427-44cd-8ac0-f2c709f21f82', null, 4),
      -- MASTERS · 2018 · North Central Women's Masters Regional Championship 2018 (north-central-womens-masters-regional-championship-2018) · ended 2018-06-24
      ('5b6172ea-ecd4-4a48-8047-6fbc088c6026', '51d0865a-0e78-436c-8bd6-abb048ffe124', null, 2),
      ('5b6172ea-ecd4-4a48-8047-6fbc088c6026', 'f4e76229-2d92-494c-ab39-ae74cb923818', null, 3),
      ('5b6172ea-ecd4-4a48-8047-6fbc088c6026', '68f501b6-5194-49f7-9b56-b91f01d7b18e', null, 4),
      ('5b6172ea-ecd4-4a48-8047-6fbc088c6026', 'bf2f52c7-96aa-4d5e-9d45-37b04c8faded', null, 5),
      -- MASTERS · 2018 · South Central Men's Masters Regional Championship 2018 (south-central-mens-masters-regional-championship-2018) · ended 2018-06-24
      ('761ab464-d695-45af-a583-de7ea747fab4', '52eb565b-56bc-4da7-bb20-4adbd8914edd', null, 3),
      ('761ab464-d695-45af-a583-de7ea747fab4', 'e90e8433-9f00-4f88-b737-15d3d489b5ed', null, 4),
      ('761ab464-d695-45af-a583-de7ea747fab4', '3686cceb-5e92-4773-ac69-b237e11c0e04', null, 5),
      -- MASTERS · 2018 · 2018 USA Ultimate Masters Championships (2018-usa-ultimate-masters-championships) · ended 2018-07-22
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', '24197ab4-a072-437e-bf1c-233720c7ae79', null, 1),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', '5d502877-55b3-4204-a003-113de9254618', null, 1),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', '87a241f8-78a0-4568-b8d2-8a57ccde9072', null, 1),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', 'cd2d6e5a-4c51-42f1-a86e-997cb3c83854', null, 1),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', 'd30d9ddb-0a56-4c86-8152-e9e199a5dd85', null, 1),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', 'dc1166bd-d6b5-46e5-bd4e-a2aeb79022b2', null, 1),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', '127175b1-b08d-4a83-a91d-21fdf91a94ee', null, 2),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', '131e8d0d-dc20-4a6b-8a12-364f7607f311', null, 2),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', '4273acb0-1da0-4693-825b-c204c183c14d', null, 2),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', '51d0865a-0e78-436c-8bd6-abb048ffe124', null, 2),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', '8b9e547e-1c9b-4a3a-bba6-81695c856961', null, 2),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', 'a58bb0ae-f01f-403b-8607-e71e896c5b89', null, 2),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', '05eecda9-a973-43bb-9d4b-12e04c7dbf9a', null, 3),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', '3732781a-6bf5-4f3c-962e-354d3c26034f', null, 3),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', '49f532e2-368e-4115-a5f1-eb428baa0b42', null, 3),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', '541e0b76-f047-44d3-a664-4dd8b75b6cc1', null, 3),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', '88fd9a5c-2dca-4ad7-b26f-d081bfda0a0b', null, 3),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', 'efaa8517-c9f0-4c7d-8840-797690367514', null, 3),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', '1d564d29-65ba-4465-893c-d0f1e483eebd', null, 4),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', '2011542a-3204-49fb-8797-8d920dc93f5c', null, 4),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', '4ce81796-02f7-44c1-92c4-0a3ee3a5b706', null, 4),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', '7e8dc33c-4665-451a-92de-1d34d9dc5583', null, 4),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', 'c490c848-9e74-43e1-bdea-a48fb50b01a9', null, 4),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', '0539ea7e-cbad-4d82-bc69-3cdcc45e6e04', null, 5),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', '067e13da-5446-46dc-8463-bce020aa6a5a', null, 5),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', '9db27b2b-cd94-448f-afb3-494a168be2ba', null, 5),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', 'a7b3e245-ec98-43e8-8780-6cb4742f7c7c', null, 5),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', 'e90e8433-9f00-4f88-b737-15d3d489b5ed', null, 5),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', 'fd348150-7e9d-47b1-bb38-49269ebc6b8d', null, 5),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', '900246db-d930-4933-aa8c-367e9eca3451', null, 6),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', '9510f9d2-5676-4acf-8475-f88a02c38f3d', null, 6),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', 'b13cea12-d083-435f-b04e-44bb3e1522a0', null, 6),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', 'b7b5b899-41fc-4155-b16d-5c4dc1acc652', null, 6),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', 'be365be7-5e53-4d27-a19a-e9e967700b82', null, 6),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', 'fa9242c3-231e-46df-a2ab-c954ffbf8173', null, 6),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', '2b8e6584-6091-49be-87a5-2bc3611b5350', null, 7),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', '52eb565b-56bc-4da7-bb20-4adbd8914edd', null, 7),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', '7d1d4ac1-fe63-4463-bc77-95ab2799eea2', null, 7),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', '8008ab79-6478-4b07-a6b9-6f27742bbdaa', null, 7),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', 'c2a2a406-fceb-4dd3-b318-efcf52d01be9', null, 7),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', 'eea61fb8-d82c-42d6-b330-95f43e512c08', null, 7),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', 'a5ceff7d-6b0e-4a0f-be12-96f08c2f235f', null, 8),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', 'bf2f52c7-96aa-4d5e-9d45-37b04c8faded', null, 8),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', 'c630bcb1-8553-4659-af40-b35c6ee4a5ae', null, 8),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', 'c7fd8ec5-999f-443e-89fa-335a8afb6601', null, 8),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', 'd6e3e977-b57a-4583-b89e-15f4be54686c', null, 8),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', 'f4599166-85d1-4884-ae4b-6ca20a9fe8e6', null, 8),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', '33e2693a-f142-4037-b1d2-c0ca111764ae', null, 9),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', '3ef9437d-91da-4ac7-903a-df0ea80a6fd0', null, 9),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', '57da60cd-7f91-4191-9981-58b227da23e8', null, 9),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', 'a9b742ae-d024-4b09-ab41-040ac3be5418', null, 9),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', '02957cb3-27b7-43ee-9f1b-d497eca1132a', null, 10),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', '1d6f0775-2d3c-4aa5-8ed5-e1d0514cba80', null, 10),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', '4d940dde-0846-4241-b991-7ba1af531bca', null, 10),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', '74debc80-c36d-4ad9-846b-da76b563c22d', null, 10),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', 'f2a6d6f2-1a29-4012-96b8-8fe84667311e', null, 10),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', '228a1db2-d570-4df3-a16d-6212e005c220', null, 11),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', '3c551c0b-fabf-4d4f-9609-e8aa622f3e00', null, 11),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', '4576b865-ca0c-4633-b89a-3a70f934d890', null, 11),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', 'e3ccc8b5-edda-4a74-bd61-a79076a6b273', null, 11),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', '0a609667-1f59-4328-acce-7319e6d45ab1', null, 12),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', '335d641b-283f-483a-a6f5-69e8f62ba76d', null, 12),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', '8a2d18cd-c266-42d6-b9bc-abb9f3d430d0', null, 12),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', 'b1d632d2-13af-42be-8038-bd579d0cc615', null, 13),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', 'f7a2e36e-a70c-4b90-9bec-13f5a23bba6b', null, 13),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', '22ca6f13-7d34-41ac-b46b-ae179b983d81', null, 14),
      ('13cf1547-76f2-4efc-816a-b0bc783c45d0', 'f62409a0-3bf0-41c9-8aa0-94f0628939b4', null, 14),
      -- MASTERS · 2019 · 2019 USA Ultimate North Central Masters Mixed Regionals (2019-usa-ultimate-north-central-masters-mixed-regionals) · ended 2019-06-09
      ('9887322e-d680-41df-b44c-cdb70bfee9c1', '61717bf1-e574-4ada-b2b7-4d80c0069d49', null, 1),
      ('9887322e-d680-41df-b44c-cdb70bfee9c1', '97229aba-550e-4720-9679-c28079cac80b', null, 2),
      ('9887322e-d680-41df-b44c-cdb70bfee9c1', 'b8eb3e67-2be3-442e-8854-55f79f3b33b1', null, 3),
      -- MASTERS · 2019 · 2019 USA Ultimate South Central Masters Men's Regionals (2019-usa-ultimate-south-central-masters-mens-regionals) · ended 2019-06-09
      ('22d20b4f-81b0-4706-b48b-98dc3aaad4f8', 'd7417449-931f-48f5-9def-d5fd87309c98', null, 1),
      ('22d20b4f-81b0-4706-b48b-98dc3aaad4f8', 'f9a66d41-b5c1-4f10-8aa1-03343f290836', null, 2),
      ('22d20b4f-81b0-4706-b48b-98dc3aaad4f8', '84c94dde-3ca1-4408-bf30-278ce6a5a9d7', null, 3),
      ('22d20b4f-81b0-4706-b48b-98dc3aaad4f8', '3b1929ae-862f-409f-bc43-8d37a7944454', null, 4),
      ('22d20b4f-81b0-4706-b48b-98dc3aaad4f8', '6e4b14ca-af13-4edf-ac51-3147e8a2e2d8', null, 5),
      ('22d20b4f-81b0-4706-b48b-98dc3aaad4f8', 'cb55ecee-f2a6-44de-9a77-11c8d83beb95', null, 5),
      -- MASTERS · 2019 · 2019 USA Ultimate Mid-Atlantic Masters Men's Regionals (2019-usa-ultimate-mid-atlantic-masters-mens-regionals) · ended 2019-06-16
      ('c95b70a3-8142-4487-b231-2b8e066730a1', 'af85514e-6c44-41a8-b676-dfa10af3b976', null, 1),
      ('c95b70a3-8142-4487-b231-2b8e066730a1', '4ffcb408-702d-413b-bbbb-486c6706efb3', null, 2),
      ('c95b70a3-8142-4487-b231-2b8e066730a1', '30a9ac0f-0447-44ed-a5f4-a47fc3cde8c0', null, 3),
      ('c95b70a3-8142-4487-b231-2b8e066730a1', 'c7d0ce4a-cc9c-490b-ac0e-b222ea99153c', null, 3),
      -- MASTERS · 2019 · 2019 USA Ultimate Northeast Masters Mixed Regionals (2019-usa-ultimate-northeast-masters-mixed-regionals) · ended 2019-06-16
      ('3428ff63-6559-4c38-87d7-71bf8e9b5fcd', '0e478628-3e69-4f53-b17d-19264fd431ae', null, 1),
      ('3428ff63-6559-4c38-87d7-71bf8e9b5fcd', '55fb1705-f8d1-4e86-bcc9-bef401759f26', null, 2),
      ('3428ff63-6559-4c38-87d7-71bf8e9b5fcd', '6a3dc9cf-739f-4b7a-bdda-1f5f983cec81', null, 3),
      ('3428ff63-6559-4c38-87d7-71bf8e9b5fcd', '0c79c5c0-fdc0-48a0-8a9a-be70ad4610b4', null, 4),
      -- MASTERS · 2019 · 2019 USA Ultimate Southeast Masters Mixed Regionals (2019-usa-ultimate-southeast-masters-mixed-regionals) · ended 2019-06-23
      ('5e90fbbe-541e-4d04-a91a-075a22823a54', 'f34c2406-9613-45df-a564-8a9f9ff0e38c', null, 1),
      ('5e90fbbe-541e-4d04-a91a-075a22823a54', 'c0b2f84f-66d3-4c8d-a5bd-4078cf87f5c5', null, 2),
      ('5e90fbbe-541e-4d04-a91a-075a22823a54', '4b9312d9-d731-4ef1-9aa7-e20ce9b6877c', null, 3),
      ('5e90fbbe-541e-4d04-a91a-075a22823a54', '457ce6d8-42ad-46f8-8c2c-fe073914dcc0', null, 4),
      -- MASTERS · 2023 · 2023 USA Ultimate Southeast Masters Mixed Regionals (GL/SE Super Regional) (2023-usa-ultimate-southeast-masters-mixed-regionals-gl-se-super-regional) · ended 2023-06-11
      ('4ec37ae7-74bb-4cc0-8320-93f17d6c0159', 'ff1f5c59-ad50-4c36-b72d-8550f6a58b49', null, 4),
      ('4ec37ae7-74bb-4cc0-8320-93f17d6c0159', 'd452cf4e-eb98-4fcb-b14f-1e31da4ced51', null, 5),
      ('4ec37ae7-74bb-4cc0-8320-93f17d6c0159', '0b504331-ce56-402a-b816-3ec502403b16', null, 6),
      -- MASTERS · 2025 · 2025 USA Ultimate Northeast Masters Mixed Regionals (2025-usa-ultimate-northeast-masters-mixed-regionals) · ended 2025-06-15
      ('855cc09a-8825-4e54-a7d5-be905afe3c07', 'e7d47f24-bcc6-48da-b9c8-50b04fa3d281', null, 5),
      ('855cc09a-8825-4e54-a7d5-be905afe3c07', '2d084efc-5ee7-4ad0-831e-f99234388e32', null, 6)
    ) as v(event_id, team_id, old_place, new_place)
   where et.event_id = v.event_id
     and et.team_id = v.team_id
     and et.final_placement is not distinct from v.old_place;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> v_expected THEN
    RAISE EXCEPTION 'usau placements part 06: expected % rows, matched %; data drifted since generation, re-run scripts/derive-usau-placements.ts', v_expected, v_updated;
  END IF;
  RAISE NOTICE 'usau placements part 06: updated % rows', v_updated;
END
$migration$;

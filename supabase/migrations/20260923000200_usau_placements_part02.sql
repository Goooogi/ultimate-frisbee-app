-- USAU per-event final placements — repair + fill, part 02 of 12.
--
-- The 2026-07-20 one-shot derivePlacements() backfill (Feature Backlog #18)
-- stored misread brackets, game-to-go losers kept 2nd, and ties that a later
-- game had settled; nothing derived placements after it. Regenerated with the
-- fixed algorithm by scripts/derive-usau-placements.ts on 2026-09-23T15:15:42.806Z —
-- do not hand-edit, re-run it.
--
-- This part: 212 events · fill 376 · correct 179 · clear 46 (conflict 4, contradicted 9, unsupported 33).
-- EXPECTED ROWS: 601. A row only updates while final_placement still holds
-- the value it was generated from ("old" below); the DO block raises, rolling
-- this part back, unless exactly 601 rows match. Regenerate instead of forcing it.
-- All 12 parts: 1469 events · fill 7901 · correct 428 · clear 247 (conflict 31, contradicted 127, unsupported 89).

DO $migration$
DECLARE
  v_expected constant int := 601;
  v_updated int;
BEGIN
  update public.usau_event_teams et
     set final_placement = v.new_place
    from (values
      -- CLUB · 2021 · Texas Men's Club Sectional Championship 2021 (texas-mens-club-sectional-championship-2021) · ended 2021-09-12
      ('e265167c-3c63-48dd-aec6-0aeaf518b181'::uuid, '52d2a48c-f40f-48c7-a732-7ae9996efda5'::uuid, 3::int, 2::int), -- correct
      ('e265167c-3c63-48dd-aec6-0aeaf518b181', 'e2407054-7083-4e35-ad24-fb8358b8d30b', 2, 3), -- correct
      ('e265167c-3c63-48dd-aec6-0aeaf518b181', 'd58ed59a-4e57-4389-97b5-e5b1513a00a4', 3, 4), -- correct
      -- CLUB · 2021 · Texas Mixed Club Sectional Championship 2021 (texas-mixed-club-sectional-championship-2021) · ended 2021-09-12
      ('bcb693df-1060-497f-925c-5ef12e6c4368', '2aba6280-97cd-4d1c-88a3-87857e9d8374', 2, 3), -- correct
      ('bcb693df-1060-497f-925c-5ef12e6c4368', '3899a27a-d13b-4236-9dc5-67116de6a25c', 3, 4), -- correct
      ('bcb693df-1060-497f-925c-5ef12e6c4368', 'b4f7ed63-a342-49d6-ab95-4dfb3eff3eed', null, 8),
      -- CLUB · 2021 · West Plains Men's Club Sectional Championship 2021 (west-plains-mens-club-sectional-championship-2021) · ended 2021-09-12
      ('628d2c25-e2df-499c-90f4-c3bc1732110d', '78e66bad-7d82-49c0-a4bd-9474bff85557', 2, 3), -- correct
      -- CLUB · 2021 · West Plains Mixed Club Sectional Championship 2021 (west-plains-mixed-club-sectional-championship-2021) · ended 2021-09-12
      ('7dc24546-efc3-400d-9250-34e004144ebc', '87814560-0cab-4500-a165-e79ac5a9f464', 3, 4), -- correct
      -- CLUB · 2021 · Central Plains Men's Club Sectional Championship 2021 (central-plains-mens-club-sectional-championship-2021) · ended 2021-09-19
      ('d13e6724-d6ba-452d-a29a-08fcc8213d11', 'c29a2f75-e84d-4270-ba11-7af977d54916', null, 4),
      ('d13e6724-d6ba-452d-a29a-08fcc8213d11', '901a245c-f84d-4231-a272-53a394808330', 3, 5), -- correct
      -- CLUB · 2021 · Nor Cal Men's Club Sectional Championship 2021 (nor-cal-mens-club-sectional-championship-2021) · ended 2021-09-19
      ('6c57031a-5f53-4290-b15d-db42832ecce5', '9749977b-a167-4fbd-b161-19f936d07cc5', 3, 4), -- correct
      ('6c57031a-5f53-4290-b15d-db42832ecce5', 'dbfef78c-e28e-4122-9118-a5a83397caf7', null, 8),
      -- CLUB · 2021 · Nor Cal Mixed Club Sectional Championship 2021 (nor-cal-mixed-club-sectional-championship-2021) · ended 2021-09-19
      ('3d8e31ea-7e88-4864-89a8-57e14cdeffe5', '4dfbea6e-95ae-4ce7-b4d4-ae2a1f006bd2', null, 7),
      ('3d8e31ea-7e88-4864-89a8-57e14cdeffe5', '73af161b-e1e4-4419-9b18-3435102470e4', null, 8),
      -- CLUB · 2021 · North Carolina Men's Club Sectional Championship 2021 (north-carolina-mens-club-sectional-championship-2021) · ended 2021-09-19
      ('0158ff38-fb3c-4ceb-9327-f252b877a626', '71c088ee-a39c-446d-8760-ba57c2d4c4d3', null, 2),
      ('0158ff38-fb3c-4ceb-9327-f252b877a626', 'a478a92a-5bb2-47ad-9735-a8f394156d76', 2, 3), -- correct
      ('0158ff38-fb3c-4ceb-9327-f252b877a626', '111d1034-54c6-4578-b96b-2a1f6a39f2ce', null, 4),
      ('0158ff38-fb3c-4ceb-9327-f252b877a626', '3471b928-9a81-4b5c-8cc5-f1e2b0d2fab6', null, 5),
      ('0158ff38-fb3c-4ceb-9327-f252b877a626', 'ec916e18-76cc-4864-a5c2-2564456a9bbe', null, 6),
      -- CLUB · 2021 · So Cal Mixed Club Sectional Championship 2021 (so-cal-mixed-club-sectional-championship-2021) · ended 2021-09-19
      ('9460d27e-f88e-4788-a657-89164f90505f', '9b5b720a-3e46-4674-8842-0de24b24f0c0', 3, 2), -- correct
      ('9460d27e-f88e-4788-a657-89164f90505f', 'b49a8070-d682-442e-8a04-549a18005476', 2, 3), -- correct
      ('9460d27e-f88e-4788-a657-89164f90505f', '3a6b3c43-e5d9-4c29-b6b4-079c60cecd10', null, 4),
      ('9460d27e-f88e-4788-a657-89164f90505f', 'ed998410-02cd-4d1d-aace-8fab0045f36c', 3, 5), -- correct
      ('9460d27e-f88e-4788-a657-89164f90505f', '702b1829-eb78-4c82-8f3e-ccb620848ded', null, 6),
      ('9460d27e-f88e-4788-a657-89164f90505f', '529cb690-3005-49cb-9ee1-20b956a11260', null, 7),
      ('9460d27e-f88e-4788-a657-89164f90505f', '5cc917b8-6de8-48a3-8f4e-0e345a0abb74', null, 8),
      -- CLUB · 2021 · Washington Men's Club Sectional Championship 2021 (washington-mens-club-sectional-championship-2021) · ended 2021-09-19
      ('61499499-5cf9-48e0-b53e-b37a353300e0', '5d9f8e98-6146-46c2-8196-8f2aae2e3f19', null, 6),
      -- CLUB · 2021 · Mid-Atlantic Men's Club Regional Championship 2021 (mid-atlantic-mens-club-regional-championship-2021) · ended 2021-09-26 · unfinished bracket: duplicates cleared only
      ('388c2fc8-75c1-4679-9729-52248c109944', '05694891-b876-47de-bab5-b0ab4bfb5cc2', 2, null), -- clear-conflict
      ('388c2fc8-75c1-4679-9729-52248c109944', 'a2f77ea2-6e9e-4458-863e-f9a3030f6fc8', 2, null), -- clear-conflict
      -- CLUB · 2021 · Mid-Atlantic Mixed Club Regional Championship 2021 (mid-atlantic-mixed-club-regional-championship-2021) · ended 2021-09-26
      ('5cf4dea1-fcc6-4483-823e-95fef1beb95a', 'c54a02e7-2c59-4fd1-8216-d0e93e82f9c7', 3, 5), -- correct
      ('5cf4dea1-fcc6-4483-823e-95fef1beb95a', '3ad8b395-4220-416d-b6cd-9d2052fc4d48', 3, null), -- clear-unsupported
      ('5cf4dea1-fcc6-4483-823e-95fef1beb95a', 'da1c534a-ba50-4111-bd33-787f9354e543', 2, null), -- clear-unsupported
      -- CLUB · 2021 · North Central Club Men's Regional Championship 2021 (north-central-club-mens-regional-championship-2021) · ended 2021-09-26
      ('2a37837b-d35d-48d4-ae1d-38ed7e0edb1e', '6332698f-66b7-44c1-95d8-d2ea9274419d', 3, 4), -- correct
      -- CLUB · 2021 · North Central Club Mixed Regional Championship 2021 (north-central-club-mixed-regional-championship-2021) · ended 2021-09-26
      ('6632c855-0a4f-4aa2-81ec-11fc2b042755', '2f66086f-fdca-4e21-b318-991c75dbb1ef', 3, 4), -- correct
      -- CLUB · 2021 · Northeast Club Women's Regional Championship 2021 (northeast-club-womens-regional-championship-2021) · ended 2021-09-26
      ('c46bf1b2-59aa-423f-b783-505d3d6156a7', 'f0723ac7-84f9-401f-818b-cea726e30193', 3, 4), -- correct
      -- CLUB · 2021 · Northwest Club Women's Regional Championship 2021 (northwest-club-womens-regional-championship-2021) · ended 2021-09-26
      ('31f73f9e-793d-4cba-8b31-6e2ddb901791', '20d3dcd1-bab7-4093-9d52-aeb165f941e8', null, 3),
      ('31f73f9e-793d-4cba-8b31-6e2ddb901791', '8dad1a42-37e4-4ef5-8d63-df684b197d74', null, 4),
      ('31f73f9e-793d-4cba-8b31-6e2ddb901791', '466467b9-5119-4e91-ab60-f8638e5a4023', null, 5),
      -- CLUB · 2021 · South Central Club Men's Regional Championship 2021 (south-central-club-mens-regional-championship-2021) · ended 2021-09-26
      ('f321bccd-4ab6-4d35-a2a8-882cd425b827', '96c5da95-c56b-4fe9-b2eb-2e34d11eac8f', 2, null), -- clear-contradicted
      -- CLUB · 2021 · Southeast Club Men's Regional Championship 2021 (southeast-club-mens-regional-championship-2021) · ended 2021-10-03
      ('f111347e-bf0d-4b44-bd04-813047c7ed23', 'a478a92a-5bb2-47ad-9735-a8f394156d76', 3, 4), -- correct
      -- CLUB · 2021 · Southeast Club Women's Regional Championship 2021 (southeast-club-womens-regional-championship-2021) · ended 2021-10-03
      ('66bb822e-836f-4491-8b6b-abc6c0d0358f', '61c14297-9399-4455-ae37-7bcc6ff63308', null, 4),
      -- CLUB · 2021 · Southwest Club Men's Regional Championship 2021 (southwest-club-mens-regional-championship-2021) · ended 2021-10-03
      ('498131f2-cdfa-43d8-adb7-d09160d4a534', 'a1093d2b-7dfa-4d22-8d1b-8287a2343cff', null, 4),
      -- CLUB · 2021 · Southwest Club Mixed Regional Championship 2021 (southwest-club-mixed-regional-championship-2021) · ended 2021-10-03
      ('4f6e4099-0333-40e2-a7cc-eecb33df0bf1', '9b5b720a-3e46-4674-8842-0de24b24f0c0', 3, 4), -- correct
      -- CLUB · 2021 · Southwest Club Women's Regional Championship 2021 (southwest-club-womens-regional-championship-2021) · ended 2021-10-03
      ('1fe9d42b-1baa-49e6-ba49-01dbeeb747c6', '563d6974-8172-4890-847e-a1d0323ed0dc', 2, 3), -- correct
      -- CLUB · 2021 · Big Sky Gun Show 2021 (big-sky-gun-show-2021) · ended 2021-10-10
      ('55b60455-60cd-4669-9204-aaed9f5c9891', 'b2670986-c2d6-48dd-8c95-84cd41192a91', null, 5),
      -- CLUB · 2022 · Texas 2 Finger Tournament 2022 (texas-2-finger-tournament-2022) · ended 2022-06-19
      ('493cd406-cf19-4994-abb2-ff43d90f8ce0', '59877244-955b-4b7f-b271-ae4770f28915', null, 5),
      ('493cd406-cf19-4994-abb2-ff43d90f8ce0', 'ae6d88e0-6406-48f8-8b51-76f48cb6ddc6', null, 6),
      ('493cd406-cf19-4994-abb2-ff43d90f8ce0', '5f911b04-37b1-45b9-b886-959392ed1d21', null, 7),
      -- CLUB · 2022 · Eugene Summer Solstice 2022 (eugene-summer-solstice-2022) · ended 2022-06-26
      ('6881243c-e4c3-40fa-98b7-7e1512ebfd7e', '6ae02585-176e-4846-aec7-4ca87fea8109', null, 5),
      ('6881243c-e4c3-40fa-98b7-7e1512ebfd7e', 'bce6ec5c-ef8a-4efb-bdcf-26988bb64e63', null, 6),
      -- CLUB · 2022 · SCINNY (scinny) · ended 2022-06-26
      ('cdf9345e-55ac-4fbd-a5a9-e92160d19f27', '4ae01f27-5790-48e3-9622-08885260f3a2', 2, null), -- clear-contradicted
      ('cdf9345e-55ac-4fbd-a5a9-e92160d19f27', '70ea34fc-5e1a-451b-89a8-49f94e366125', 4, null), -- clear-contradicted
      ('cdf9345e-55ac-4fbd-a5a9-e92160d19f27', '92043f20-da88-4cf2-a70d-b9787261eeb0', 3, null), -- clear-contradicted
      ('cdf9345e-55ac-4fbd-a5a9-e92160d19f27', 'b283ad5f-fda1-4d9c-bb61-48ce2deb5dcc', 1, null), -- clear-contradicted
      -- CLUB · 2022 · TCT Pro-Elite Challenge (Colorado Cup) 2022 (tct-pro-elite-challenge-colorado-cup-2022) · ended 2022-07-10
      ('735fc376-edd3-4443-968c-aa9e3c2166fa', '3c376c89-8d3e-423d-b47d-9ad156b862ed', null, 3),
      ('735fc376-edd3-4443-968c-aa9e3c2166fa', 'fe54651a-85f7-4b64-9857-5a9dc525af63', null, 4),
      -- CLUB · 2022 · Zootown Disc-O (zootown-disc-o) · ended 2022-07-10
      ('8c2640d4-3177-4371-97b5-1d2cc2f534b4', '3e4623ff-f050-43a0-8e24-8aa49c3b6be7', null, 3),
      -- CLUB · 2022 · HoDown Showdown (hodown-showdown) · ended 2022-08-14
      ('34d46f29-d809-40f1-bc02-56441a468e78', '76f3b29f-a19b-4aa8-bf1a-285d3b265d1c', 2, null), -- clear-unsupported
      ('34d46f29-d809-40f1-bc02-56441a468e78', '8ccf8c5e-08b8-4c6c-9a81-4773319de1c1', 3, null), -- clear-unsupported
      -- CLUB · 2022 · Phoenix Phights for the SE at Nationals (phoenix-phights-for-the-se-at-nationals) · ended 2022-08-14
      ('97c4e7b6-b6a3-426a-bb52-cf316b263037', '3f29892b-79cc-4116-8926-4e49bfa2b04c', 2, null), -- clear-unsupported
      ('97c4e7b6-b6a3-426a-bb52-cf316b263037', '4586c3a1-c24a-4718-9506-356e5fd633a0', 3, null), -- clear-unsupported
      -- CLUB · 2022 · Bay Area Tournament (bay-area-tournament) · ended 2022-08-28
      ('e2ef7bc9-5a39-4818-bc2f-ca0fd728d858', 'f1cf4978-df5c-4b94-b549-09a027f634a7', null, 3),
      ('e2ef7bc9-5a39-4818-bc2f-ca0fd728d858', 'c5becfa1-a4f4-44b1-9bc7-c5f064c1070d', null, 4),
      ('e2ef7bc9-5a39-4818-bc2f-ca0fd728d858', '479628f7-9a5b-4a29-ad81-1e58d278b44d', null, 5),
      -- CLUB · 2022 · FCS Invite 2022 (fcs-invite-2022) · ended 2022-08-28
      ('350b7fb5-f37f-4803-b19a-2ecc7a268ad9', '24d98a3d-aab6-4433-947d-a797c1ae4032', 3, null), -- clear-unsupported
      ('350b7fb5-f37f-4803-b19a-2ecc7a268ad9', '97e58976-9aec-4e3c-880c-2efc92a3f790', 2, null), -- clear-unsupported
      -- CLUB · 2022 · 2022 Big Sky Mixed Sectional Championship (2022-big-sky-mixed-sectional-championship) · ended 2022-09-11
      ('f057adbd-9ff1-413b-bce1-f716bb325a5f', '7c0cfa8b-a93b-4122-aad1-e5f325f721aa', 3, 4), -- correct
      -- CLUB · 2022 · 2022 Capital Men's Sectional Championship (2022-capital-mens-sectional-championship) · ended 2022-09-11
      ('8b6e0368-0236-42d3-9651-deeeef4145b4', 'abe7adb6-c464-436c-b65b-5e3673d30376', 3, 4), -- correct
      ('8b6e0368-0236-42d3-9651-deeeef4145b4', '717454fc-e708-480a-8413-92a2ec655c55', null, 12),
      -- CLUB · 2022 · 2022 Capital Mixed Sectional Championship (2022-capital-mixed-sectional-championship) · ended 2022-09-11
      ('5db525ba-0ce8-4ef2-a37d-ff709db1c26d', '8ba66196-7e3f-4b36-a1a1-d8a8110ff4fc', 2, 3), -- correct
      ('5db525ba-0ce8-4ef2-a37d-ff709db1c26d', 'ff801c05-7e3c-438e-afc0-96ebbaf5a7d5', 3, 5), -- correct
      ('5db525ba-0ce8-4ef2-a37d-ff709db1c26d', 'd795066b-27a1-4a94-9f3f-6ac6eaa51178', null, 12),
      -- CLUB · 2022 · 2022 East Coast Mens Sectional Championship (2022-east-coast-mens-sectional-championship) · ended 2022-09-11
      ('30eacf69-d1ae-4063-96bc-f44c08131d17', '710c8c18-abe7-45c8-95ee-3004501a2f67', null, 4),
      ('30eacf69-d1ae-4063-96bc-f44c08131d17', '5508b741-8de3-49e7-9992-b6d6c4b736ac', null, 5),
      ('30eacf69-d1ae-4063-96bc-f44c08131d17', '73fcbc6e-2244-4430-be34-b03ed95d53e8', 3, 6), -- correct
      ('30eacf69-d1ae-4063-96bc-f44c08131d17', '0f7b513a-81db-4ee2-82e3-516e4c47dbe1', null, 7),
      ('30eacf69-d1ae-4063-96bc-f44c08131d17', '5becb62c-9978-46f8-be30-251fcdf029ae', null, 8),
      ('30eacf69-d1ae-4063-96bc-f44c08131d17', '7a692e5f-ec95-400c-800d-af982dcc8cb5', null, 9),
      ('30eacf69-d1ae-4063-96bc-f44c08131d17', '853b19c2-8fc3-4cb0-8010-fca59ec9dcfc', null, 10),
      ('30eacf69-d1ae-4063-96bc-f44c08131d17', 'e9604a39-b2fc-4068-99b3-ddfa64559717', null, 11),
      ('30eacf69-d1ae-4063-96bc-f44c08131d17', '0925f540-1cae-4f3c-8b92-44123a24ef9a', null, 12),
      -- CLUB · 2022 · 2022 East Coast Mixed Sectional Championship (2022-east-coast-mixed-sectional-championship) · ended 2022-09-11
      ('025e53d4-a840-4867-bc38-f54bd65f3d71', '8e932375-881c-45ee-a315-d76717471489', 2, 3), -- correct
      ('025e53d4-a840-4867-bc38-f54bd65f3d71', '7ea41322-c5a6-48b9-bfc6-e4929ef68b09', 3, null), -- clear-unsupported
      -- CLUB · 2022 · 2022 East New England Men's Sectional Championship (2022-east-new-england-mens-sectional-championship) · ended 2022-09-11
      ('9d8a081f-1291-410d-b2eb-aa3c87ef4728', 'e8c9bf66-12f7-4a32-b6b6-cbba366d6423', 7, 8), -- correct
      -- CLUB · 2022 · 2022 East New England Women's Sectional Championship (2022-east-new-england-womens-sectional-championship) · ended 2022-09-11
      ('014bef94-8988-4417-9dd0-c04f6ab3ef48', '7ed417b6-18aa-408a-93de-705452a68c75', null, 3),
      -- CLUB · 2022 · 2022 East Plains Men's Sectional Championship (2022-east-plains-mens-sectional-championship) · ended 2022-09-11
      ('29139ef9-9af7-40aa-924f-5a400b713cd5', '05ffcf7f-c024-435a-a5de-2f00b7382238', null, 4),
      ('29139ef9-9af7-40aa-924f-5a400b713cd5', '4d4688aa-6fcd-493c-91c3-67621633379e', 3, 5), -- correct
      -- CLUB · 2022 · 2022 East Plains Mixed Sectional Championship (2022-east-plains-mixed-sectional-championship) · ended 2022-09-11
      ('ef41829a-e8a9-49c8-94b0-29bc04b651a8', 'ca156c25-e9e0-4382-89b2-081fd04652e7', 3, 4), -- correct
      -- CLUB · 2022 · 2022 Florida Men's Sectional Championship (2022-florida-mens-sectional-championship) · ended 2022-09-11
      ('dde06dc5-81ac-457c-a155-bdd509d124b3', '828a5b5e-c57d-4c0d-8782-0bd28abd0211', 3, 5), -- correct
      -- CLUB · 2022 · 2022 Florida Mixed Sectional Championship (2022-florida-mixed-sectional-championship) · ended 2022-09-11
      ('bcb7d1ba-5272-46c5-9406-58225eb30f35', '8a98805f-439f-4243-8537-b7f4a33949a7', null, 3),
      ('bcb7d1ba-5272-46c5-9406-58225eb30f35', '0cd086a2-4268-4b0a-b7ab-35673cf83547', null, 4),
      -- CLUB · 2022 · 2022 Founders Mixed Sectional Championship (2022-founders-mixed-sectional-championship) · ended 2022-09-11
      ('e97502e3-76a5-4800-91a2-8cc0cc5fc646', '54593f4c-bb0f-491e-9800-b3dc1f86ae29', null, 8),
      -- CLUB · 2022 · 2022 Gulf Coast Mens Sectional Championship (2022-gulf-coast-mens-sectional-championship) · ended 2022-09-11
      ('de3f2057-ef3f-49bc-8987-8ec7668304e6', 'c49ca6ec-76c3-4897-9224-f89014d77008', null, 3),
      -- CLUB · 2022 · 2022 Gulf Coast Mixed Sectional Championship (2022-gulf-coast-mixed-sectional-championship) · ended 2022-09-11
      ('4f411f0a-fc80-4d3d-961c-f7a1bd662821', '79efb450-70bd-4a45-89bf-4818097945d3', null, 3),
      -- CLUB · 2022 · 2022 Metro NY Men's Sectional Chamionship (2022-metro-ny-mens-sectional-chamionship) · ended 2022-09-11
      ('64795c08-ef97-4404-9203-2173c009cfd5', '14a9239a-7a79-49f5-85ce-6e5133ad306a', 3, 2), -- correct
      ('64795c08-ef97-4404-9203-2173c009cfd5', '621f94ab-ac9b-48e6-b282-6ae565c2dcba', 2, 3), -- correct
      ('64795c08-ef97-4404-9203-2173c009cfd5', '1907211a-0050-4538-b75d-8c906d38046a', 3, 4), -- correct
      ('64795c08-ef97-4404-9203-2173c009cfd5', '6d7312c9-936d-45f0-aba9-b54e9c7fc634', 7, 8), -- correct
      -- CLUB · 2022 · 2022 Metro NY Mixed Sectional Championship (2022-metro-ny-mixed-sectional-championship) · ended 2022-09-11
      ('1b047335-8dfa-4297-8c4d-423b8ccf223e', '5b4847d7-f1ac-42fd-be0a-d98fc77ad42f', null, 6),
      -- CLUB · 2022 · 2022 Nor Cal Men's Sectional Championship (2022-nor-cal-mens-sectional-championship) · ended 2022-09-11
      ('0c1541dd-eff2-4775-b1dd-9bd2143c75c1', 'c5becfa1-a4f4-44b1-9bc7-c5f064c1070d', 2, 3), -- correct
      -- CLUB · 2022 · 2022 Nor Cal Mixed Sectional Championship (2022-nor-cal-mixed-sectional-championship) · ended 2022-09-11
      ('0e6f1f50-1cf1-408b-baaf-561db852f76a', '21d3ca0d-728d-4be8-879a-34301e93dbf9', null, 16),
      -- CLUB · 2022 · 2022 North Carolina Mens Sectional Championship (2022-north-carolina-mens-sectional-championship) · ended 2022-09-11
      ('23b20199-4242-48b8-836a-1bd574f57131', '3d7ff926-5908-434c-9c44-cab2b7f181ec', null, 3),
      ('23b20199-4242-48b8-836a-1bd574f57131', '8d723a55-29b7-402d-9358-775514e6fdd0', null, 4),
      ('23b20199-4242-48b8-836a-1bd574f57131', '208a131f-dec8-4afd-bf8d-2df6b3b7be7e', null, 5),
      ('23b20199-4242-48b8-836a-1bd574f57131', '6c531094-5104-40e6-a152-e66720cca4d1', null, 6),
      -- CLUB · 2022 · 2022 North Carolina Mixed Sectional Championship (2022-north-carolina-mixed-sectional-championship) · ended 2022-09-11
      ('5dd47dcd-7c80-46e0-a309-2b44bca036b6', '3427d57d-8db9-4015-801d-b6948a077d06', 3, 2), -- correct
      ('5dd47dcd-7c80-46e0-a309-2b44bca036b6', '3b5932f7-086e-4a99-8083-fd4126940c2c', 2, 3), -- correct
      ('5dd47dcd-7c80-46e0-a309-2b44bca036b6', 'b2e6665d-1599-4b8c-9c8b-e985a1647b0f', 3, 4), -- correct
      ('5dd47dcd-7c80-46e0-a309-2b44bca036b6', '9eeac39e-9557-49dc-ad97-20053cd08761', null, 6),
      ('5dd47dcd-7c80-46e0-a309-2b44bca036b6', '111238d1-0dcf-42eb-b96c-9eb932551299', null, 7),
      ('5dd47dcd-7c80-46e0-a309-2b44bca036b6', '2cd2ac53-9dfe-4734-a51d-a4fde4cedb73', null, 8),
      ('5dd47dcd-7c80-46e0-a309-2b44bca036b6', '7a4fe8fa-3104-4fc7-a763-24507a98cc73', null, 9),
      ('5dd47dcd-7c80-46e0-a309-2b44bca036b6', '938aebda-589b-4199-ba21-1823e5a01b05', null, 10),
      -- CLUB · 2022 · 2022 Northwest Plains Men's Sectional Championship (2022-northwest-plains-mens-sectional-championship) · ended 2022-09-11
      ('cf7495f6-4158-42f0-aedf-366f7d8c3f17', '4328bc80-fba9-4b20-a81a-74c2e9bba20e', null, 8),
      ('cf7495f6-4158-42f0-aedf-366f7d8c3f17', '6d9a3ea1-6d4e-4f6a-9859-2ca1b828e98c', 8, 9), -- correct
      ('cf7495f6-4158-42f0-aedf-366f7d8c3f17', 'a396a24c-997a-473e-a42e-4dc7481fa0ba', 12, 13), -- correct
      ('cf7495f6-4158-42f0-aedf-366f7d8c3f17', '58f6fbae-0fab-4911-94af-e2f56cc8bdcb', 12, 14), -- correct
      -- CLUB · 2022 · 2022 Northwest Plains Mixed Sectional Championship (2022-northwest-plains-mixed-sectional-championship) · ended 2022-09-11
      ('42a3b6c0-f58f-4343-9d44-a426fd55a4a0', '0a483006-6160-4fc6-a841-8265b368410c', null, 12),
      ('42a3b6c0-f58f-4343-9d44-a426fd55a4a0', '65d9c61c-a5a0-4e74-a5f3-000b655bcda6', 11, 13), -- correct
      ('42a3b6c0-f58f-4343-9d44-a426fd55a4a0', '2c00be6a-03c7-45ac-8f4c-ab2163bfe29b', null, 14),
      -- CLUB · 2022 · 2022 Oregon Men's Sectional Championship (2022-oregon-mens-sectional-championship) · ended 2022-09-11
      ('0ad105f9-dd87-4dcd-9dc9-440a9d55a0c0', 'b4a312e3-ea3c-4f1a-86e0-8e993ebd676e', null, 3),
      -- CLUB · 2022 · 2022 Oregon Mixed Sectional Championship (2022-oregon-mixed-sectional-championship) · ended 2022-09-11
      ('dec33184-d982-4a87-9162-54500d445477', 'f2f40455-c8af-4fc9-b8c7-8872180b3fab', null, 2),
      ('dec33184-d982-4a87-9162-54500d445477', '975b9e7d-7a02-4d03-8e5c-1451d8108bd0', null, 3),
      ('dec33184-d982-4a87-9162-54500d445477', 'c40a0532-efd4-486e-9f36-929269106ab9', null, 4),
      -- CLUB · 2022 · 2022 Ozarks Men's Sectional Championship (2022-ozarks-mens-sectional-championship) · ended 2022-09-11
      ('fb8b1fd3-2b6d-49d9-a359-6752d26a4414', '44bdf92e-8770-4395-90d1-174f9a334e3b', null, 4),
      -- CLUB · 2022 · 2022 Rocky Mountain Men's Sectional Championship  (2022-rocky-mountain-men-s-sectional-championship) · ended 2022-09-11
      ('ca3bab11-86e8-4904-acac-33d243521d38', '53eb7a64-9e2a-42a5-9f73-5e834e877fbc', null, 3),
      -- CLUB · 2022 · 2022 Rocky Mountain Mixed Sectional Championship (2022-rocky-mountain-mixed-sectional-championship) · ended 2022-09-11
      ('77578ab1-d5b6-4425-aed9-798dd131544d', 'd20e52d3-e389-4c92-8fbf-fa1390c453a0', 2, 3), -- correct
      ('77578ab1-d5b6-4425-aed9-798dd131544d', '4c09e59d-9f96-4510-b103-a1a21a0dbaba', 3, 4), -- correct
      ('77578ab1-d5b6-4425-aed9-798dd131544d', '9dd43a2b-ef5f-4f50-a32f-042bc6495b99', 4, 7), -- correct
      ('77578ab1-d5b6-4425-aed9-798dd131544d', 'd13e2a69-5333-4d6d-bf1b-4738ab3d6419', 4, 8), -- correct
      -- CLUB · 2022 · 2022 So Cal Mens Sectional Championship (2022-so-cal-mens-sectional-championship) · ended 2022-09-11
      ('74e4eeea-f941-4cdb-9b9d-7110ad17b5c0', '1f761de4-8eca-4388-bd1c-1c283dee82fc', null, 4),
      ('74e4eeea-f941-4cdb-9b9d-7110ad17b5c0', '11657f24-b276-4d2b-abcb-ff5cbdd96c2c', 3, 6), -- correct
      ('74e4eeea-f941-4cdb-9b9d-7110ad17b5c0', 'b8d145ad-3672-4065-8122-04ed200ce0a2', null, 8),
      ('74e4eeea-f941-4cdb-9b9d-7110ad17b5c0', '537ea0f1-05b6-4072-bdd1-0c6b235169e0', null, 12),
      -- CLUB · 2022 · 2022 So Cal Mixed Sectional Championship (2022-so-cal-mixed-sectional-championship) · ended 2022-09-11
      ('efc75f74-9a9b-4cee-b5ec-6b1f263bf983', '384d018c-8688-4bdc-8a07-85932cff2c64', 3, 4), -- correct
      -- CLUB · 2022 · 2022 Texas Mixed Sectional Championship (2022-texas-mixed-sectional-championship) · ended 2022-09-11
      ('599c0f86-9c51-4e3a-b7c5-eafc473474c7', 'dca03857-a78e-41af-9d1e-7e4743bacb4b', null, 6),
      -- CLUB · 2022 · 2022 Upstate NY Men's Sectional Championship (2022-upstate-ny-mens-sectional-championship) · ended 2022-09-11
      ('73685e24-ee0f-46cc-a1ff-025e37425f31', '07b84fc2-96c0-43c2-9aca-978943e6cea0', null, 3),
      -- CLUB · 2022 · 2022 West New England Men's Sectional Championship (2022-west-new-england-mens-sectional-championship) · ended 2022-09-11
      ('158ef5d4-be91-4ff8-b68c-5cf1ff949ec3', '9ae165a6-35fb-4582-a504-5424e1e3ad1f', 3, 4), -- correct
      -- CLUB · 2022 · 2022 West Plains Men's Sectionals Championship (2022-west-plains-mens-sectionals-championship) · ended 2022-09-11
      ('4dbe3a55-73c4-450e-a26e-76bd377f3942', '1e7279e6-11a0-47d4-84c9-0f5c8e3521cd', 2, 3), -- correct
      ('4dbe3a55-73c4-450e-a26e-76bd377f3942', 'bd4f5f76-ff57-4461-ab00-490b7795d95f', 3, 4), -- correct
      ('4dbe3a55-73c4-450e-a26e-76bd377f3942', '1f727744-9ea7-4d19-a027-559e87bd2e70', 6, 7), -- correct
      ('4dbe3a55-73c4-450e-a26e-76bd377f3942', 'ab3395b5-8d3f-4039-8531-88174588200e', null, 8),
      -- CLUB · 2022 · 2022 West Plains Mixed Sectional Championship (2022-west-plains-mixed-sectional-championship) · ended 2022-09-11
      ('1de6fd40-562c-4825-9f55-641f5f87aa4f', '1741d4bb-bf8d-4a06-9d3e-8587996de8d0', 2, 3), -- correct
      ('1de6fd40-562c-4825-9f55-641f5f87aa4f', '4703eb68-cccb-41e4-983f-63791c9a5a03', 3, null), -- clear-unsupported
      -- CLUB · 2022 · 2022 Central Plains Mixed Sectional Championship (2022-central-plains-mixed-sectional-championship) · ended 2022-09-18
      ('ad609c54-7bbb-4a3f-b5c7-e3c9ee977833', '610b45f8-91be-4706-960a-2c6c0e54f47b', 6, 7), -- correct
      ('ad609c54-7bbb-4a3f-b5c7-e3c9ee977833', 'ebc8fbc7-fe3c-4c81-903e-2d7be03fcf52', 6, 8), -- correct
      -- CLUB · 2022 · 2022 Washington Mixed Sectional Championship (2022-washington-mixed-sectional-championship) · ended 2022-09-18
      ('e0606b71-3275-4aa6-8757-8078fb391bbf', '5e353e17-7acc-45e7-a71a-f11cc7be28f6', 3, null), -- clear-unsupported
      ('e0606b71-3275-4aa6-8757-8078fb391bbf', 'e6e5e874-9883-4c83-ac99-1a8379f3aa16', 3, null), -- clear-unsupported
      -- CLUB · 2022 · 2022 Northeast Men's Regional Championship  (2022-northeast-men-s-regional-championship) · ended 2022-09-25
      ('c67201fb-17a6-49ec-be1b-a88f0e125176', '27a90bef-0f1d-4c2d-bb0a-959d55552b19', 2, 3), -- correct
      ('c67201fb-17a6-49ec-be1b-a88f0e125176', '8304fc30-338b-4e19-b7f6-a61da55e4041', 3, 6), -- correct
      ('c67201fb-17a6-49ec-be1b-a88f0e125176', 'd052b8b7-70ad-4462-893d-408776be0536', null, 9),
      ('c67201fb-17a6-49ec-be1b-a88f0e125176', '14a9239a-7a79-49f5-85ce-6e5133ad306a', null, 10),
      -- CLUB · 2022 · 2022 Northeast Mixed Regional Championship (2022-northeast-mixed-regional-championship) · ended 2022-09-25
      ('f477ee0f-0ec2-43c8-a0c6-8054e9fa37a9', 'fa1c1122-cc26-457b-a6cd-187a4ffb2eb4', 3, 2), -- correct
      ('f477ee0f-0ec2-43c8-a0c6-8054e9fa37a9', '150c3bda-3499-4ada-a12f-de52a7014dbd', 2, 3), -- correct
      ('f477ee0f-0ec2-43c8-a0c6-8054e9fa37a9', 'e8ef23a1-fc5c-478c-b3f7-4b14c0d9f7bb', 3, 4), -- correct
      -- CLUB · 2022 · 2022 Northeast Women's Regional Championship (2022-northeast-womens-regional-championship) · ended 2022-09-25
      ('c6c90fad-21f0-4d86-a885-d997782d6da9', '5aee4bce-619b-457d-88db-60a16aa1944a', null, 4),
      ('c6c90fad-21f0-4d86-a885-d997782d6da9', 'ab23f2ea-43d5-46b2-83dc-78a023e3eaba', 3, 5), -- correct
      -- CLUB · 2022 · 2022 Northwest Women's Regional Champioship (2022-northwest-womens-regional-champioship) · ended 2022-09-25
      ('69ffbb02-2329-400e-a029-3d5ab9f64778', '0b4d370e-5c1d-47ee-a522-960703eb7994', 3, 5), -- correct
      -- CLUB · 2022 · 2022 South Central Men's Regional Championship (2022-south-central-mens-regional-championship) · ended 2022-09-25
      ('5b723378-63bc-477a-9025-461d16869891', '2ea02ca3-f926-4e73-b5d6-d55785456cd0', 3, 4), -- correct
      -- CLUB · 2022 · 2022 South Central Mixed Regional Championship (2022-south-central-mixed-regional-championship) · ended 2022-09-25
      ('70ba9631-0d5b-4f71-b280-755036987272', '9ea8ceeb-3e8e-44f5-b7d4-5e44ec7e111a', null, 2),
      ('70ba9631-0d5b-4f71-b280-755036987272', '5cb67fe5-1921-4a7b-9e9d-beb057c565f1', 2, 3), -- correct
      ('70ba9631-0d5b-4f71-b280-755036987272', '3204d4af-ef25-4f7b-92ee-de28e95ff7c7', 3, null), -- clear-unsupported
      ('70ba9631-0d5b-4f71-b280-755036987272', 'd20e52d3-e389-4c92-8fbf-fa1390c453a0', 3, null), -- clear-unsupported
      -- CLUB · 2022 · 2022 Southeast Men's Regional Championship (2022-southeast-mens-regional-championship) · ended 2022-09-25
      ('54702195-00a7-4a5a-a0bd-704e12aa5433', 'fe54651a-85f7-4b64-9857-5a9dc525af63', 3, 4), -- correct
      -- CLUB · 2022 · 2022 Southeast Womens Regional Championship (2022-southeast-womens-regional-championship) · ended 2022-09-25
      ('4a4a811b-c516-4f6a-aa23-7cada905a9b5', '4ae01f27-5790-48e3-9622-08885260f3a2', null, 4),
      -- CLUB · 2022 · 2022 Southwest Men's Regional Championship (2022-southwest-mens-regional-championship) · ended 2022-09-25
      ('915956fc-ac25-4dd9-bbc5-57b981732e72', '11895580-58f3-456d-8a9a-2eb59edf0335', 3, 4), -- correct
      ('915956fc-ac25-4dd9-bbc5-57b981732e72', 'c5becfa1-a4f4-44b1-9bc7-c5f064c1070d', 3, 5), -- correct
      -- CLUB · 2022 · 2022 Southwest Women's Regional Championship (2022-southwest-womens-regional-championship) · ended 2022-09-25
      ('56fd79c9-32f7-4e44-9acf-153fac70ffda', '5ab7004e-c823-436a-b49a-f9fa2915d8fd', 3, 4), -- correct
      -- CLUB · 2022 · 2022 Great Lakes Men's Regional Championship (2022-great-lakes-mens-regional-championship) · ended 2022-10-02
      ('6bba6b17-cde6-479e-bc62-a55a742279f9', 'd99e41f4-f12f-498e-80f1-329862b1b67b', 3, 4), -- correct
      -- CLUB · 2023 · AntlerLock (antlerlock) · ended 2023-07-09
      ('edce4a20-2a7e-4bd0-b367-dc71e61478e3', '101d38e5-749b-41b5-9652-44132f9e3774', 9, null), -- clear-contradicted
      ('edce4a20-2a7e-4bd0-b367-dc71e61478e3', '7d1fd77f-c32a-4919-8ad6-6d4173384440', 10, null), -- clear-contradicted
      -- CLUB · 2023 · Revolution 2023 (revolution-2023) · ended 2023-07-09
      ('9cebf952-48e8-4462-a43c-32f82511006b', 'b8665f0c-191b-4443-8f48-b9f5a6644b9e', null, 19),
      ('9cebf952-48e8-4462-a43c-32f82511006b', '48fa454b-c999-43f6-a2d5-6c6544507ab7', null, 20),
      ('9cebf952-48e8-4462-a43c-32f82511006b', '7c58f842-3743-472c-aa4d-11c357d7b768', null, 21),
      -- CLUB · 2023 · Cooler Classic 34 (cooler-classic-34) · ended 2023-08-20
      ('35ecef9a-a427-48ee-8e3e-8d3936c57fdd', 'a85bd82e-c3bf-4a3f-97ff-9cb131cc6f45', null, 21),
      ('35ecef9a-a427-48ee-8e3e-8d3936c57fdd', '2062530d-ae14-4178-8118-4814bf8463cb', null, 22),
      ('35ecef9a-a427-48ee-8e3e-8d3936c57fdd', '5761e8d4-7470-459d-9e52-98f1b57262fb', null, 23),
      -- CLUB · 2023 · 2023 Men's West Plains Sectional Championship (2023-men-s-west-plains-sectional-championship) · ended 2023-09-10
      ('396e5c2a-1c49-41d2-90c8-17939a291c6e', '7cc7b447-aaa7-49f7-8435-d1f6d6565ca8', 2, 3), -- correct
      ('396e5c2a-1c49-41d2-90c8-17939a291c6e', '8e522589-296e-4621-b377-dd8d40b94e51', 3, 4), -- correct
      ('396e5c2a-1c49-41d2-90c8-17939a291c6e', 'bd0edb0a-47fd-43ef-b738-13bac1764d01', null, 8),
      -- CLUB · 2023 · 2023 Men's Capital Sectional Championship (2023-mens-capital-sectional-championship) · ended 2023-09-10
      ('0ad4e155-f08d-438b-b587-4770fe57ffc3', 'fe5a90ab-23e6-43e4-8d36-b007d73f5802', 3, 4), -- correct
      ('0ad4e155-f08d-438b-b587-4770fe57ffc3', 'c5ce69bc-2d5d-466f-8e0b-c41c36b1f5d6', 3, 5), -- correct
      -- CLUB · 2023 · 2023 Men's East Coast Sectional Championship (2023-mens-east-coast-sectional-championship) · ended 2023-09-10
      ('7a674851-cdc3-449a-9b2b-5df33f8f6f46', 'e23fa3ef-7d43-4193-843f-4d5ea0b5bad3', 3, 4), -- correct
      ('7a674851-cdc3-449a-9b2b-5df33f8f6f46', '617a4bfb-99f0-44e1-85ba-a4d7c7d33eb7', null, 8),
      ('7a674851-cdc3-449a-9b2b-5df33f8f6f46', '603da1d7-dd53-496c-87c6-3a8f966104f2', null, 9),
      ('7a674851-cdc3-449a-9b2b-5df33f8f6f46', '6ae258a1-dbdc-48dc-bbc8-421983ba72df', null, 10),
      -- CLUB · 2023 · 2023 Men's East New England Sectional Championship (2023-mens-east-new-england-sectional-championship) · ended 2023-09-10
      ('4c116a51-b573-4750-82d2-f04e4badb1d6', '44846e58-1021-4fdd-85c1-f4390edd1e37', null, 4),
      ('4c116a51-b573-4750-82d2-f04e4badb1d6', 'f9ff3462-1cbf-412f-8391-f541df7289cf', 3, 8), -- correct
      -- CLUB · 2023 · 2023 Men's East Plains Sectional Championship (2023-mens-east-plains-sectional-championship) · ended 2023-09-10
      ('42f7ef94-a76e-4950-9586-02c892fee398', 'c7c10a06-b448-446c-a924-7f548e1c3c7f', 2, 3), -- correct
      ('42f7ef94-a76e-4950-9586-02c892fee398', 'dabd1985-225f-4a15-ba6f-86178902529c', 3, 4), -- correct
      -- CLUB · 2023 · 2023 Men's Florida Sectional Championship (2023-mens-florida-sectional-championship) · ended 2023-09-10
      ('e6e25e32-e31a-4561-8f5b-74d5c6babd2b', 'ed4a653e-b8d0-4667-a192-e4fbfb1ac47d', null, 3),
      ('e6e25e32-e31a-4561-8f5b-74d5c6babd2b', '6205b22c-71de-4ace-8756-ae48676ae683', 3, 4), -- correct
      ('e6e25e32-e31a-4561-8f5b-74d5c6babd2b', '3b8cf8a7-c397-478d-95ba-aaac619c9533', 3, 5), -- correct
      -- CLUB · 2023 · 2023 Men's Gulf Coast Sectional Championship (2023-mens-gulf-coast-sectional-championship) · ended 2023-09-10
      ('89f919b9-0aae-48de-bbce-581f59524be2', 'fc11112c-980f-4267-a24b-299030b02fea', null, 3),
      ('89f919b9-0aae-48de-bbce-581f59524be2', 'cd9684fa-e317-4881-bf21-c39bcc27f5ac', null, 4),
      -- CLUB · 2023 · 2023 Men's Metro New York Sectional Championship (2023-mens-metro-new-york-sectional-championship) · ended 2023-09-10
      ('18c2a8a5-6c3c-4c66-9f23-f36bac43de25', '78507180-292e-4872-8dda-d07c96a8077b', null, 2),
      ('18c2a8a5-6c3c-4c66-9f23-f36bac43de25', '1cfc1a96-342f-41b4-bdcd-e314a3a5fb8c', 2, 3), -- correct
      -- CLUB · 2023 · 2023 Men's Nor Cal Sectional Championship (2023-mens-nor-cal-sectional-championship) · ended 2023-09-10
      ('12845157-cbff-4fea-b917-f93f099d9e03', '0016f6b0-dddd-4fbd-a1ee-413f765477ff', 3, 4), -- correct
      ('12845157-cbff-4fea-b917-f93f099d9e03', '4be6c401-8e39-4539-b17a-e5525bf67e46', 3, 5), -- correct
      -- CLUB · 2023 · 2023 Men's North Carolina Sectional Championship (2023-mens-north-carolina-sectional-championship) · ended 2023-09-10
      ('36a1fd99-b057-471c-bf56-bc3517a4020b', '41f64308-48f3-4ccb-86ae-ffd1ad70a809', null, 2),
      ('36a1fd99-b057-471c-bf56-bc3517a4020b', '07fc9955-a1d8-4516-a2fa-7c4d44ad564d', 2, 3), -- correct
      ('36a1fd99-b057-471c-bf56-bc3517a4020b', '439f425b-4921-41fe-90ef-42448c6b1d1b', null, 4),
      ('36a1fd99-b057-471c-bf56-bc3517a4020b', '885624e9-3f35-4a88-bb12-6fa5d1fe42e7', null, 5),
      ('36a1fd99-b057-471c-bf56-bc3517a4020b', 'a5299a3d-2a7a-48b3-9955-d589bd6a9b62', null, 6),
      -- CLUB · 2023 · 2023 Men's Ozarks Sectional Championship (2023-mens-ozarks-sectional-championship) · ended 2023-09-10
      ('cb980676-5335-4968-b1ff-625a132bc73d', 'aeb6b236-4484-41da-9149-cd3378b19853', null, 2),
      ('cb980676-5335-4968-b1ff-625a132bc73d', 'd826966a-1d22-4596-9bb7-189e58c186c0', 2, 3), -- correct
      -- CLUB · 2023 · 2023 Men's Rocky Mountain Sectional Championship (2023-mens-rocky-mountain-sectional-championship) · ended 2023-09-10
      ('7ae76c86-8038-4332-9035-b6f9e7454847', '4bc12e05-6722-4cba-ac0a-ad73a774cdf9', null, 3),
      ('7ae76c86-8038-4332-9035-b6f9e7454847', '86f3e941-14ea-4d91-a9ad-458368e2f1da', null, 4),
      -- CLUB · 2023 · 2023 Men's Texas Sectional Championship (2023-mens-texas-sectional-championship) · ended 2023-09-10
      ('b69e4967-da70-4308-be70-c23ee0cce230', '4abac43a-deaf-40a4-baea-efb305d05924', null, 7),
      -- CLUB · 2023 · 2023 Men's Washington Sectional Championship (2023-mens-washington-sectional-championship) · ended 2023-09-10
      ('1bc32f1e-0eb1-4450-9537-27e23526afb9', '96d7c6f1-26bf-4d76-9dc3-b12207ff6fc0', null, 3),
      -- CLUB · 2023 · 2023 Mixed Big Sky Sectional Championship (2023-mixed-big-sky-sectional-championship) · ended 2023-09-10
      ('047fd3c9-97dc-4940-bb49-b9904cb0a019', 'e0072148-0849-4ed7-96fa-d042482e88ae', null, 2),
      ('047fd3c9-97dc-4940-bb49-b9904cb0a019', '9b6abc8f-243e-464a-9ec7-a3dbc4111233', 2, 3), -- correct
      -- CLUB · 2023 · 2023 Mixed Capital Sectional Championship (2023-mixed-capital-sectional-championship) · ended 2023-09-10 · unfinished bracket: duplicates cleared only
      ('35699aa4-615b-48e6-ae34-7afadf461617', '25631b71-fee4-4350-b9ec-7870d6e0732e', 2, null), -- clear-conflict
      ('35699aa4-615b-48e6-ae34-7afadf461617', '5becf715-91c3-4d5d-b73d-73f30631a595', 2, null), -- clear-conflict
      -- CLUB · 2023 · 2023 Mixed Central Plains Sectional Championship (2023-mixed-central-plains-sectional-championship) · ended 2023-09-10
      ('9abe6ef1-9e55-4394-b0d1-9c6b22adcf23', '07ecd0d9-8746-47d8-9451-3a65ed044da1', 3, 4), -- correct
      -- CLUB · 2023 · 2023 Mixed East Coast Sectional Championship (2023-mixed-east-coast-sectional-championship) · ended 2023-09-10
      ('95e04678-cd62-416b-a8fc-34d9e3a00558', '763ec18d-8f90-4383-b6d1-151b68c88695', 3, 2), -- correct
      ('95e04678-cd62-416b-a8fc-34d9e3a00558', '3f5600db-ab44-4e5a-9463-c1420b243ef4', 2, 3), -- correct
      ('95e04678-cd62-416b-a8fc-34d9e3a00558', 'f9b71668-ede4-4d16-90ff-8fe08d5bf034', 3, 4), -- correct
      -- CLUB · 2023 · 2023 Mixed East New England Sectional Championship (2023-mixed-east-new-england-sectional-championship) · ended 2023-09-10
      ('96f2126f-277e-473b-9abc-554dcec2c66e', 'cf2cd142-1e7e-4bc1-bf45-b44376bd0e53', 3, 4), -- correct
      -- CLUB · 2023 · 2023 Mixed East Plains Sectional Championship (2023-mixed-east-plains-sectional-championship) · ended 2023-09-10
      ('eb788da2-41df-4215-ac73-7b8450f5ab44', 'e36b83fb-a506-4325-8caf-5fed4be836f3', 3, 4), -- correct
      ('eb788da2-41df-4215-ac73-7b8450f5ab44', 'adad789d-bde3-4c8d-bda6-b69d8a93e806', 3, 6), -- correct
      ('eb788da2-41df-4215-ac73-7b8450f5ab44', '9ffd69f5-64ad-4320-84c7-7c4fe577c34c', null, 12),
      -- CLUB · 2023 · 2023 Mixed Founders Sectional Championship (2023-mixed-founders-sectional-championship) · ended 2023-09-10
      ('d06de22e-896a-4626-9cb7-ffab12d82532', 'd172008e-61f8-4043-ae46-098ae2461c68', null, 7),
      ('d06de22e-896a-4626-9cb7-ffab12d82532', 'af27233b-c941-4058-bd05-39e2c108a038', null, 8),
      -- CLUB · 2023 · 2023 Mixed Gulf Coast Sectional Championship (2023-mixed-gulf-coast-sectional-championship) · ended 2023-09-10
      ('dec28801-4c3a-413f-8d39-08a58084c1cd', 'a12491f1-ecfe-43c4-9304-3e8546de5ac4', null, 3),
      -- CLUB · 2023 · 2023 Mixed Metro New York Sectional Championship (2023-mixed-metro-new-york-sectional-championship) · ended 2023-09-10
      ('718c2dd9-833d-41b5-a46a-0dd03ed65f9c', '4d16eb9e-617f-4c61-922b-867abf28e895', 2, 3), -- correct
      ('718c2dd9-833d-41b5-a46a-0dd03ed65f9c', 'b5a1301c-ee38-478c-978d-a59f0f6a22e2', null, 6),
      -- CLUB · 2023 · 2023 Mixed Nor Cal Sectional Championship (2023-mixed-nor-cal-sectional-championship) · ended 2023-09-10
      ('33fc6489-2547-4710-9c50-8e235991b972', '3bb1b0a0-d1bc-4ad0-8f9b-617fcb815127', 3, 6), -- correct
      -- CLUB · 2023 · 2023 Mixed Oregon Sectional Championship (2023-mixed-oregon-sectional-championship) · ended 2023-09-10
      ('31ec8c62-594f-4dbb-8fbb-b7ba68bc5b04', 'cbc707d7-c328-49b7-87aa-3a9ad8bb04c2', null, 3),
      ('31ec8c62-594f-4dbb-8fbb-b7ba68bc5b04', '78a2b99f-91cf-4a45-b80d-0980a183fb35', null, 4),
      -- CLUB · 2023 · 2023 Mixed So Cal Sectional Championship (2023-mixed-so-cal-sectional-championship) · ended 2023-09-10
      ('9e29ec4e-d73c-4419-b256-d660701e2b4f', '16798b8b-d6af-400f-ac17-79203663b376', 3, 4), -- correct
      -- CLUB · 2023 · 2023 Mixed Texas Sectional Championship (2023-mixed-texas-sectional-championship) · ended 2023-09-10
      ('6ef4accd-2f48-4e18-9878-4b11afb16807', '5673b688-07e7-48fc-a150-65deb4097ba0', null, 3),
      ('6ef4accd-2f48-4e18-9878-4b11afb16807', '3d3427be-9bb1-4e7b-99e7-b9c14e477a73', null, 4),
      ('6ef4accd-2f48-4e18-9878-4b11afb16807', 'b929ce20-4cf2-4eba-bc54-c11d27700e57', null, 5),
      ('6ef4accd-2f48-4e18-9878-4b11afb16807', '5af8719a-b99f-408a-8911-93c26a36920a', null, 6),
      -- CLUB · 2023 · 2023 Mixed Washington Sectional Championship (2023-mixed-washington-sectional-championship) · ended 2023-09-10
      ('7d2b7110-76b3-4916-a699-9df453d5b8cd', 'fe9af524-6e70-4646-9736-596cd88d6361', null, 3),
      -- CLUB · 2023 · 2023 Mixed West Plains Sectional Championship (2023-mixed-west-plains-sectional-championship) · ended 2023-09-10
      ('b493174b-19e7-431a-afdf-bc0fd5ad1bc6', 'c6e26296-6a46-4a84-9d90-cd3ce51d9f32', 3, 4), -- correct
      -- CLUB · 2023 · 2023 Great Lakes Mixed Regional Championship (2023-great-lakes-mixed-regional-championship) · ended 2023-09-24
      ('6ba43eb5-0422-4c35-af0c-41d327243b4f', '720c87ea-4869-46da-8dfd-d5ae05663018', 3, 4), -- correct
      -- CLUB · 2023 · 2023 Northeast Men's Regional Championship (2023-northeast-mens-regional-championship) · ended 2023-09-24
      ('510439d8-fba7-4505-85ff-8839978e168d', '4e06112f-f82f-43d4-8f02-ca2d06296043', null, 9),
      ('510439d8-fba7-4505-85ff-8839978e168d', '268f8611-ff07-408a-b34c-a0d3fbf0dd22', null, 10),
      ('510439d8-fba7-4505-85ff-8839978e168d', '78507180-292e-4872-8dda-d07c96a8077b', null, 11),
      ('510439d8-fba7-4505-85ff-8839978e168d', '1cfc1a96-342f-41b4-bdcd-e314a3a5fb8c', null, 12),
      ('510439d8-fba7-4505-85ff-8839978e168d', '5f2993f0-104d-4888-8162-ef6bf7ae38a5', null, 13),
      -- CLUB · 2023 · 2023 Northeast Mixed Regional Championship (2023-northeast-mixed-regional-championship) · ended 2023-09-24
      ('00bf6c38-2f2e-45e3-8320-57b9fbde5992', '9b617bea-2b75-4c3e-8bfe-851ecbc71cf7', null, 3),
      ('00bf6c38-2f2e-45e3-8320-57b9fbde5992', 'f117aa20-3ee1-4b06-b414-458923421b96', null, 4),
      -- CLUB · 2023 · 2023 South Central Men's Regional Championship (2023-south-central-mens-regional-championship) · ended 2023-09-24
      ('8943ca4a-da8d-4096-9a28-a3e82ade0a28', 'e97c5f3b-3125-490e-99ed-9d54a17ca8e1', 3, 4), -- correct
      -- CLUB · 2023 · 2023 Southwest Mixed Regional Championship (2023-southwest-mixed-regional-championship) · ended 2023-09-24
      ('68228ee2-033e-4874-afd8-864a95734e23', '3178ab34-b39c-4bf7-95d1-d7fac7b77145', null, 4),
      ('68228ee2-033e-4874-afd8-864a95734e23', 'fa809b89-f773-4021-a7a1-cd98390add2f', 3, 6), -- correct
      -- CLUB · 2023 · 2023 Mid-Atlantic Men's Regional Championship (2023-mid-atlantic-mens-regional-championship) · ended 2023-10-01
      ('321329ab-dcf9-4a0f-b739-a68964c4f65a', '3f2816bc-c3a7-4b45-a622-31e58f8bd49f', 2, 3), -- correct
      ('321329ab-dcf9-4a0f-b739-a68964c4f65a', '19347fc2-18aa-490a-aafb-c1c6c564a175', 3, 4), -- correct
      ('321329ab-dcf9-4a0f-b739-a68964c4f65a', 'b648c74e-7d61-4759-a119-b4b735fe7d6a', null, 11),
      ('321329ab-dcf9-4a0f-b739-a68964c4f65a', 'fe5a90ab-23e6-43e4-8d36-b007d73f5802', null, 12),
      ('321329ab-dcf9-4a0f-b739-a68964c4f65a', 'f792c728-40a4-495c-bd0b-374de35439fc', null, 13),
      -- CLUB · 2023 · 2023 Mid-Atlantic Mixed Regional Championship (2023-mid-atlantic-mixed-regional-championship) · ended 2023-10-01
      ('12b1c648-28fa-4437-8e02-9b4a62417744', '9fec8927-0881-4f1d-8693-e29ac06f0c25', 3, 4), -- correct
      -- CLUB · 2023 · 2023 North Central Mixed Regional Championship (2023-north-central-mixed-regional-championship) · ended 2023-10-02
      ('ca90b4c3-631c-423a-b82b-36d051fcde0e', '67063f28-f583-4766-a84d-3444d9b374c1', 3, 4), -- correct
      -- CLUB · 2024 · Vacationland 2024 (vacationland-2024) · ended 2024-08-04
      ('b280ff68-f056-40e1-9d44-9a8a89179b0c', 'd9ff21e1-73ad-45d2-a945-737303568dc5', null, 13),
      ('b280ff68-f056-40e1-9d44-9a8a89179b0c', '534086a6-754a-4c28-816c-65fb7935e234', null, 14),
      ('b280ff68-f056-40e1-9d44-9a8a89179b0c', '4471d088-c5d2-4295-bc79-83bf6aab0ddc', null, 15),
      -- CLUB · 2024 · 2024 Capital Women's Sectional Championship (2024-capital-womens-sectional-championship) · ended 2024-09-07
      ('e0c637ac-31ae-4d9e-b226-6935a7863fb3', '266c7fd3-549a-429d-bc7b-a7a44eb8b1df', null, 2),
      ('e0c637ac-31ae-4d9e-b226-6935a7863fb3', '8515a35d-3a7d-4893-aefb-a947d76aa350', 2, 3), -- correct
      ('e0c637ac-31ae-4d9e-b226-6935a7863fb3', '5d58d34b-bee0-4c6d-924b-513dea14a2d2', null, 4),
      ('e0c637ac-31ae-4d9e-b226-6935a7863fb3', 'e8e346c6-0ec0-4d8c-80a0-dffd8646fb62', null, 5),
      ('e0c637ac-31ae-4d9e-b226-6935a7863fb3', 'f6e2d4a8-6c98-4e6b-979a-fa61852b9641', null, 6),
      -- CLUB · 2024 · 2024 Big Sky Men's Sectional Championship (2024-big-sky-mens-sectional-championship) · ended 2024-09-08
      ('af59b234-9983-471a-a58a-34cedc2a9502', '22153546-83ea-403e-bd32-e088b1393f03', null, 3),
      ('af59b234-9983-471a-a58a-34cedc2a9502', 'db2d398d-60c4-459e-aceb-31dcc7494004', null, 4),
      ('af59b234-9983-471a-a58a-34cedc2a9502', '113cc8a5-e0eb-4a10-b6e3-79eeb0dd86e0', null, 5),
      ('af59b234-9983-471a-a58a-34cedc2a9502', 'c8809d6f-a9dc-410e-a41f-53b0e4ddd33c', null, 6),
      -- CLUB · 2024 · 2024 Capital Men's Sectional Championship (2024-capital-mens-sectional-championship) · ended 2024-09-08
      ('7b6091ae-ef12-4e75-b0e9-cf9a01247723', 'a2e44c63-3920-4cef-bc5c-2cd9c0db9390', 3, 4), -- correct
      ('7b6091ae-ef12-4e75-b0e9-cf9a01247723', '1cab22ae-8dd7-4529-9b1b-e9daf78e3881', 3, 5), -- correct
      ('7b6091ae-ef12-4e75-b0e9-cf9a01247723', '1e344e91-1d32-4291-a3c1-50acfbe5b0de', null, 8),
      -- CLUB · 2024 · 2024 Capital Mixed Sectional Championship (2024-capital-mixed-sectional-championship) · ended 2024-09-08
      ('a5ad2302-62b5-449a-9827-c29345d4c20b', '2a598b2e-8b60-4a01-b954-5c2171f3594e', 3, 4), -- correct
      ('a5ad2302-62b5-449a-9827-c29345d4c20b', 'd1be1bcb-86b0-4554-b48e-af6bc29bf3e1', null, 6),
      -- CLUB · 2024 · 2024 Central Plains Men's Sectional Championship (2024-central-plains-mens-sectional-championship) · ended 2024-09-08
      ('97db0455-8dab-43d7-a18c-26e7f0fecefe', 'e5220021-1f69-420d-b282-75324a617fb9', 2, 3), -- correct
      ('97db0455-8dab-43d7-a18c-26e7f0fecefe', 'ea7d4675-4bc2-49af-89dd-e9f9b4b52865', null, 4),
      ('97db0455-8dab-43d7-a18c-26e7f0fecefe', '2b55d2a4-d66e-421a-9707-2a2191d3452a', null, 5),
      -- CLUB · 2024 · 2024 East Coast Men's Sectional Championship (2024-east-coast-mens-sectional-championship) · ended 2024-09-08
      ('a6160d69-4876-4a30-9294-be7cde9abe8c', '381651db-49c1-4765-879d-8a07ef0401d7', 3, 4), -- correct
      -- CLUB · 2024 · 2024 East New England Men's Sectional Championship (2024-east-new-england-mens-sectional-championship) · ended 2024-09-08
      ('840340b3-da63-481f-8fc3-9ee9d028c1ff', '9fb8d0e2-5698-45e7-bdb4-bd657c96adff', 3, 2), -- correct
      ('840340b3-da63-481f-8fc3-9ee9d028c1ff', 'c92817d4-06f2-42bf-a6db-dc1996abee51', 2, 3), -- correct
      ('840340b3-da63-481f-8fc3-9ee9d028c1ff', '64a9517a-361b-4498-a519-9af0d70f83db', 3, 4), -- correct
      ('840340b3-da63-481f-8fc3-9ee9d028c1ff', '60ea725b-dc1f-4755-b8c4-0b7dd50e353f', null, 5),
      ('840340b3-da63-481f-8fc3-9ee9d028c1ff', '7c0485b4-0232-4318-9663-6dec63f827bb', null, 10),
      ('840340b3-da63-481f-8fc3-9ee9d028c1ff', '30ad06c7-456a-421f-ab33-29cb540ecdb8', null, 11),
      ('840340b3-da63-481f-8fc3-9ee9d028c1ff', '7b1bbe52-eb43-428f-90ca-d478c0ef347d', null, 12),
      -- CLUB · 2024 · 2024 East New England Mixed Sectional Championship (2024-east-new-england-mixed-sectional-championship) · ended 2024-09-08
      ('a1b612b7-3252-4b80-983c-c6d767db20de', 'c676ed31-4374-4aa7-9dd7-9a367dba7ebe', null, 2),
      ('a1b612b7-3252-4b80-983c-c6d767db20de', '34ac1969-3950-42f9-951f-a7ead2d777e1', 2, 3), -- correct
      ('a1b612b7-3252-4b80-983c-c6d767db20de', '62ea5fb9-0d78-4717-a154-63788cfc2893', null, 4),
      ('a1b612b7-3252-4b80-983c-c6d767db20de', 'a1dc85e3-5cc7-449d-8947-0f4939f6004c', null, 5),
      ('a1b612b7-3252-4b80-983c-c6d767db20de', '1f52fef5-ef16-4898-aa5a-5bcbf8b98732', null, 6),
      ('a1b612b7-3252-4b80-983c-c6d767db20de', 'fba97db1-5722-450b-a4ef-df2804b28485', null, 7),
      ('a1b612b7-3252-4b80-983c-c6d767db20de', 'cee76b5d-a613-47fd-9cb6-10c95765f453', null, 8),
      -- CLUB · 2024 · 2024 East Plains Men's Sectional Championship (2024-east-plains-mens-sectional-championship) · ended 2024-09-08
      ('82581d89-fefe-447f-afec-2b1ab19fb356', 'feba26a3-355d-4c50-bd47-8fa00d4120c9', 2, 3), -- correct
      ('82581d89-fefe-447f-afec-2b1ab19fb356', '1244eec8-22b3-4fcb-9b2e-fc7f5e359f16', 3, 5), -- correct
      ('82581d89-fefe-447f-afec-2b1ab19fb356', '92783de1-04f3-4bda-9764-f14e2260e7bc', null, 6),
      ('82581d89-fefe-447f-afec-2b1ab19fb356', 'aab074ff-6631-4f3b-b452-05652cd337c7', null, 7),
      ('82581d89-fefe-447f-afec-2b1ab19fb356', 'ed4984a7-2f0a-4f50-b6a6-14574dd4d5ab', null, 10),
      ('82581d89-fefe-447f-afec-2b1ab19fb356', 'ee28f724-b63e-4155-bb94-df7158d1a23e', null, 11),
      ('82581d89-fefe-447f-afec-2b1ab19fb356', '0c7033a0-9d53-411b-9c3b-4fe310289613', null, 12),
      -- CLUB · 2024 · 2024 East Plains Mixed Sectional Championship (2024-east-plains-mixed-sectional-championship) · ended 2024-09-08
      ('85096a65-ec04-467b-a867-93fd8159315f', '19d55f02-86d5-4e1d-8323-1917ed7155c5', 2, 3), -- correct
      ('85096a65-ec04-467b-a867-93fd8159315f', 'dd00f699-7a89-438d-90d8-dadd5a094336', 3, 4), -- correct
      ('85096a65-ec04-467b-a867-93fd8159315f', '55990bc1-11e2-4d2b-bb14-8c6eb3193fa4', null, 12),
      -- CLUB · 2024 · 2024 Florida Men's Sectional Championship (2024-florida-mens-sectional-championship) · ended 2024-09-08
      ('3b8c3f3f-6d69-4244-94af-fc6f15a87823', 'f239ba6b-9394-4b89-80cf-13c411e80043', null, 2),
      ('3b8c3f3f-6d69-4244-94af-fc6f15a87823', 'be33019d-8856-42e7-96fa-7c41b285ee5e', 2, 3), -- correct
      ('3b8c3f3f-6d69-4244-94af-fc6f15a87823', '29d71d57-d7e9-41ca-94eb-15e429ce1d50', null, 4),
      -- CLUB · 2024 · 2024 Florida Mixed Sectional Championship (2024-florida-mixed-sectional-championship) · ended 2024-09-08
      ('f39f17d0-b4c1-4577-8d9b-598badcc49de', '577777a9-f155-4715-901a-495b5257b9a4', null, 3),
      -- CLUB · 2024 · 2024 Founders Mixed Sectional Championship (2024-founders-mixed-sectional-championship) · ended 2024-09-08
      ('4c322ba2-0592-442b-861f-7b151449f9c1', '3555ea3b-fde5-46c4-b34a-b2f894830518', null, 4),
      ('4c322ba2-0592-442b-861f-7b151449f9c1', '382d3014-c8d2-4897-9aea-7682dd90fedf', 3, 5), -- correct
      -- CLUB · 2024 · 2024 Gulf Coast Mixed Sectional Championship (2024-gulf-coast-mixed-sectional-championship) · ended 2024-09-08
      ('2adf779d-2f3d-42fd-9bb6-5fb1b3a4e3d4', 'af6f4bbf-7291-4179-9180-5cdad8d34db4', 3, 6), -- correct
      -- CLUB · 2024 · 2024 Nor Cal Mixed Sectional Championship (2024-nor-cal-mixed-sectional-championship) · ended 2024-09-08
      ('c8017e8c-13c2-4fe8-9cce-8949ced0cfe0', '0e0f2127-8db2-450f-a726-5bba16f94671', 4, null), -- clear-unsupported
      ('c8017e8c-13c2-4fe8-9cce-8949ced0cfe0', '6e852a3b-d0ca-4c5c-b3d1-99974924ff4d', 4, null), -- clear-unsupported
      -- CLUB · 2024 · 2024 North Carolina Mixed Sectional Championship (2024-north-carolina-mixed-sectional-championship) · ended 2024-09-08
      ('e2d789e9-32e7-44b9-93e2-0ec0838eb105', 'ed95216b-876c-4ea0-b2f6-f53dc44f5247', null, 6),
      ('e2d789e9-32e7-44b9-93e2-0ec0838eb105', '2bcb0491-d91a-4f1e-869b-85674800c456', 6, 7), -- correct
      ('e2d789e9-32e7-44b9-93e2-0ec0838eb105', 'f886e912-2089-41f2-8624-4b94dea04e82', null, 8),
      ('e2d789e9-32e7-44b9-93e2-0ec0838eb105', 'd9b8565f-3cf3-4e6a-87c8-1ad711aff57c', null, 9),
      ('e2d789e9-32e7-44b9-93e2-0ec0838eb105', '81e2e773-76f3-4e7f-a24d-ecc2e83b0be9', null, 10),
      -- CLUB · 2024 · 2024 Northwest Plains Men's Sectional Championship (2024-northwest-plains-mens-sectional-championship) · ended 2024-09-08
      ('0725cdb9-bf8e-4733-bc86-c42dfa1f35ea', '48c4989e-cda5-42e8-9b51-9130acbbaf86', 3, 4), -- correct
      -- CLUB · 2024 · 2024 Northwest Plains Mixed Sectional Championship (2024-northwest-plains-mixed-sectional-championship) · ended 2024-09-08
      ('402c2ee7-14eb-424d-b599-ae7c776f09d8', '930a07c5-a1c6-4062-8186-47fb4d7f54e7', null, 6),
      ('402c2ee7-14eb-424d-b599-ae7c776f09d8', '9212a0e7-02ac-409c-b3ee-b10362a323b8', null, 7),
      ('402c2ee7-14eb-424d-b599-ae7c776f09d8', '8467a75e-6e60-41ca-9589-713f66bd316a', null, 8),
      ('402c2ee7-14eb-424d-b599-ae7c776f09d8', '92f00e05-b6a2-42a7-9769-7526c6952cfb', 7, 8), -- correct
      ('402c2ee7-14eb-424d-b599-ae7c776f09d8', '530c3b1d-8ab9-4a16-b448-17bdc30177a3', 8, 9), -- correct
      ('402c2ee7-14eb-424d-b599-ae7c776f09d8', '12aecb88-d7e1-4193-a33b-c332fdf22067', 3, null), -- clear-unsupported
      ('402c2ee7-14eb-424d-b599-ae7c776f09d8', 'e9d6cded-207b-4bcc-bbbe-4dd0e7e82e58', 3, null), -- clear-unsupported
      -- CLUB · 2024 · 2024 Ozarks Men's Sectional Championship (2024-ozarks-mens-sectional-championship) · ended 2024-09-08
      ('39c58edb-6d05-47bf-917c-3f1d282d7693', 'f5870628-4ca8-4f50-bd29-de7c8ee7b0f5', null, 3),
      -- CLUB · 2024 · 2024 Rocky Mountain Men's Sectional Championship (2024-rocky-mountain-mens-sectional-championship) · ended 2024-09-08
      ('ed8eb120-a836-4583-ada5-6cf4384ae5aa', 'd6bfb431-e10a-42a2-b6c9-6492fb180a53', null, 6),
      -- CLUB · 2024 · 2024 Rocky Mountain Mixed Sectional Championship (2024-rocky-mountain-mixed-sectional-championship) · ended 2024-09-08
      ('d33eb48c-4cb1-4cab-b27a-8a1f4250ef59', 'ae0b7a40-4141-4071-b7f1-2852cb35e7a8', 3, 4), -- correct
      -- CLUB · 2024 · 2024 So Cal Mixed Sectional Championship (2024-so-cal-mixed-sectional-championship) · ended 2024-09-08
      ('ba013cdd-cc5c-4c60-803a-c8f42c9993bc', 'f13e1218-be77-48fc-9d14-23eb9271e6f0', null, 3),
      ('ba013cdd-cc5c-4c60-803a-c8f42c9993bc', '1526185f-d5c2-4601-bb61-557ffe978ed3', 3, null), -- clear-unsupported
      ('ba013cdd-cc5c-4c60-803a-c8f42c9993bc', 'f0061c84-e37a-4d4c-9468-2cec940c2043', 3, null), -- clear-unsupported
      -- CLUB · 2024 · 2024 Texas Men's Sectional Championship (2024-texas-mens-sectional-championship) · ended 2024-09-08
      ('214f8835-559b-4403-9a27-73c04d61e0b8', 'fc42c27a-ab7d-4aea-8dbc-d7199084877d', null, 8),
      ('214f8835-559b-4403-9a27-73c04d61e0b8', 'fc6c573a-cee4-4472-b14e-78807975adf5', null, 9),
      ('214f8835-559b-4403-9a27-73c04d61e0b8', '54e735c0-c33b-4758-a60d-7eade012487d', null, 10),
      ('214f8835-559b-4403-9a27-73c04d61e0b8', '7016b35a-3a19-4804-bc2b-cfbfe550f134', 3, null), -- clear-unsupported
      -- CLUB · 2024 · 2024 Texas Mixed Sectional Championship (2024-texas-mixed-sectional-championship) · ended 2024-09-08
      ('06794b9d-dbc7-4c21-81ef-f1ca03558a58', '88166f19-f099-4f18-9e74-9334d60dfb28', 2, 3), -- correct
      ('06794b9d-dbc7-4c21-81ef-f1ca03558a58', 'c92e8546-54fd-46ad-9a18-d39a1c1fb9f1', 3, 4), -- correct
      ('06794b9d-dbc7-4c21-81ef-f1ca03558a58', 'ba0b5b97-24ba-4cd6-834f-7993a26a65a4', 4, 5), -- correct
      ('06794b9d-dbc7-4c21-81ef-f1ca03558a58', '61da7806-b9a6-4053-9be1-de104c4d9e55', 4, 6), -- correct
      -- CLUB · 2024 · 2024 Upstate New York Men's Sectional Championship (2024-upstate-new-york-mens-sectional-championship) · ended 2024-09-08
      ('2411758b-e3bb-486d-907a-5f4f0eb12adc', '30b6b9a7-06b0-436c-9db4-6278295ddba8', 3, 4), -- correct
      -- CLUB · 2024 · 2024 Upstate New York Mixed Sectional Championship (2024-upstate-new-york-mixed-sectional-championship) · ended 2024-09-08
      ('834a92ec-6615-48bc-a313-78daabc81f44', '16848e65-d063-44af-b548-4aa06136cfad', null, 3),
      -- CLUB · 2024 · 2024 Washington Men's Sectional Championship (2024-washington-mens-sectional-championship) · ended 2024-09-08
      ('dbff1761-0c00-43e3-aee0-8fcd10399ece', '30ff59a9-eb84-49a0-951a-6945b901658b', null, 4),
      ('dbff1761-0c00-43e3-aee0-8fcd10399ece', '9f82ee88-f46e-45d3-9686-efa8e25239e5', 3, 6), -- correct
      -- CLUB · 2024 · 2024 Washington Mixed Sectional Championship (2024-washington-mixed-sectional-championship) · ended 2024-09-08
      ('cc4959b3-a15a-48fe-ad8c-59dcf8edd350', '37cd92d7-e458-4068-a161-06241eae1f4a', 3, 4), -- correct
      -- CLUB · 2024 · 2024 West New England  Mixed Sectional Championship (2024-west-new-england-mixed-sectional-championship) · ended 2024-09-08
      ('7f44bbae-df45-40da-8b55-c49282bee485', '724eca20-fae0-40df-bb2c-993a92b40f4f', null, 2),
      ('7f44bbae-df45-40da-8b55-c49282bee485', '5bc444a0-99a7-4326-a7c6-cf5002578f4f', 2, 3), -- correct
      -- CLUB · 2024 · 2024 West Plains Men's Sectional Championship (2024-west-plains-mens-sectional-championship) · ended 2024-09-08
      ('d49088c1-0f6f-4cd8-9826-a8bcc65544d6', '8cb8953a-a132-49b3-82b2-9abc9a16c8fb', 3, 4), -- correct
      ('d49088c1-0f6f-4cd8-9826-a8bcc65544d6', '2aab4faa-1d4c-4308-815b-525da0d306b3', null, 8),
      -- CLUB · 2024 · 2024 West Plains Mixed Sectional Championship (2024-west-plains-mixed-sectional-championship) · ended 2024-09-08
      ('3ee65f2d-6243-4e8f-967e-9bf21bdb5ae7', '5abc3f82-ecdb-4194-abe1-acaa3f2171d3', null, 4),
      ('3ee65f2d-6243-4e8f-967e-9bf21bdb5ae7', '75674e53-d3a3-4169-8b3a-1d6a68557c14', null, 5),
      ('3ee65f2d-6243-4e8f-967e-9bf21bdb5ae7', 'b3e59b8e-bf25-4f1a-bd97-45b4e3ed0ca6', null, 6),
      -- CLUB · 2024 · 2024 Great Lakes Men's Regional Championship (2024-great-lakes-mens-regional-championship) · ended 2024-09-22
      ('c9bfa5c0-06b9-4dfd-85c9-7da31a242536', 'ed4984a7-2f0a-4f50-b6a6-14574dd4d5ab', null, 15),
      -- CLUB · 2024 · 2024 Northeast Mixed Regional Championship (2024-northeast-mixed-regional-championship) · ended 2024-09-22
      ('0d0bdac8-092c-4645-9035-aee08683d011', '69a0e1b5-efdf-48a1-b21f-4af66eeebbbc', 3, 4), -- correct
      -- CLUB · 2024 · 2024 Northeast Women's Regional Championship (2024-northeast-womens-regional-championship) · ended 2024-09-22
      ('2e82bc6c-6d36-4992-ba49-f52eaa872779', '91ee2a77-3c16-419b-8ae7-51a8237bd5e6', null, 8),
      -- CLUB · 2024 · 2024 Northwest Men's Regional Championship (2024-northwest-mens-regional-championship) · ended 2024-09-22
      ('9f30a50d-4577-4922-ae2e-abaf242daf4c', 'aef53af6-a6c2-4399-8aee-6f6c4c4583b1', 3, null), -- clear-unsupported
      -- CLUB · 2024 · 2024 Northwest Mixed Regional Championship (2024-northwest-mixed-regional-championship) · ended 2024-09-22
      ('e26a6862-e276-45ff-ab8e-dc4f084024f2', '62a6c3d5-81cd-4307-8a4a-debcb3338b1a', 7, 9), -- correct
      ('e26a6862-e276-45ff-ab8e-dc4f084024f2', 'b4bc8429-12d1-4d5e-868b-9859b80a24ea', 3, null), -- clear-unsupported
      -- CLUB · 2024 · 2024 Northwest Women's Regional Championship (2024-northwest-womens-regional-championship) · ended 2024-09-22
      ('c5bc3eac-b3d3-42a0-9d49-e43e504c814e', '0f3506ba-5b28-4953-ad25-972eb9ed6e22', 3, 4), -- correct
      ('c5bc3eac-b3d3-42a0-9d49-e43e504c814e', '791010eb-3ec1-4eef-acf9-e793bfbc3204', null, 5),
      ('c5bc3eac-b3d3-42a0-9d49-e43e504c814e', 'ddaefd22-54ed-4106-95c0-411db870dadf', null, 5),
      -- CLUB · 2024 · 2024 South Central Men's Regional Championship (2024-south-central-mens-regional-championship) · ended 2024-09-22
      ('78478368-bcd3-4166-94e1-44b5d509b80f', '570b5084-d043-4650-a9d9-8d761717853e', 3, null), -- clear-unsupported
      -- CLUB · 2024 · 2024 South Central Mixed Regional Championship (2024-south-central-mixed-regional-championship) · ended 2024-09-22
      ('93356d8c-2ceb-46a1-8fd0-4844e95be182', 'c5342ad4-81b8-4a0d-b9f3-41b00987109e', 3, 4), -- correct
      -- CLUB · 2024 · 2024 Southeast Mixed Regional Championship (2024-southeast-mixed-regional-championship) · ended 2024-09-22
      ('58c29810-105f-46b8-b469-1626efba379f', 'bd608e99-fcbd-40ec-8591-f142daf18ba3', 3, 5), -- correct
      ('58c29810-105f-46b8-b469-1626efba379f', '2e212a2c-d359-48d0-af2e-28cfc2b32415', 3, 6), -- correct
      -- CLUB · 2024 · 2024 Southwest Mixed Regional Championship (2024-southwest-mixed-regional-championship) · ended 2024-09-22
      ('faf6c878-cfe9-44fa-9bc4-ed986ee2ec41', '521d894c-43e5-4995-92fa-8643a52a5176', 3, 4), -- correct
      -- CLUB · 2024 · 2024 Southwest Women's Regional Championship (2024-southwest-womens-regional-championship) · ended 2024-09-22
      ('f83830f3-54b8-4a7d-8aaf-0f352f59f587', 'b0d7290b-7c04-4da8-b731-41329cd7a7be', null, 3),
      ('f83830f3-54b8-4a7d-8aaf-0f352f59f587', 'bdac70f2-d0c1-4396-8439-0f00a740f041', null, 4),
      -- CLUB · 2025 · Mixed Easterns 2025 (mixed-easterns-2025) · ended 2025-06-01
      ('7bcd796c-fb6f-42ae-9d33-b0d506438845', '98d0a1a3-1c07-49c5-ad7d-70aade1ac906', null, 7),
      ('7bcd796c-fb6f-42ae-9d33-b0d506438845', '59635654-9857-4345-bf22-46d3af250604', null, 8),
      -- CLUB · 2025 · 2025 Motown Throwdown (2025-motown-throwdown) · ended 2025-07-27
      ('19d5b5e4-529e-4dc2-bc4e-2de0d033a5e1', '2e6b9f48-1bf8-4cd0-942e-dd70d797915e', null, 15),
      -- CLUB · 2025 · Lehigh Valley Invite (lehigh-valley-invite) · ended 2025-08-03
      ('e537bb9e-f9fd-4467-9594-bf7cd0de2d02', '5507963c-df5d-441f-adc1-89c291ed5caf', 15, null), -- clear-contradicted
      ('e537bb9e-f9fd-4467-9594-bf7cd0de2d02', 'b741579a-ebf7-4dd7-a613-fdc4007020a4', 15, null), -- clear-contradicted
      -- CLUB · 2025 · Bid in the Bend 2025 (bid-in-the-bend-2025) · ended 2025-08-10
      ('978a9730-f97e-4a1b-a83f-47cec262dbb3', 'fdbcf09b-ec4a-4af2-b361-f87fdca5ffae', null, 5),
      ('978a9730-f97e-4a1b-a83f-47cec262dbb3', 'a7dd5f5e-d8b6-41c7-b149-2b56714b46f4', null, 6),
      ('978a9730-f97e-4a1b-a83f-47cec262dbb3', '44f01660-aa84-4a86-ad98-b7c8877c7155', null, 7),
      -- CLUB · 2025 · HoDown Showdown 2025 (hodown-showdown-2025) · ended 2025-08-10
      ('8d6b48c8-9533-4cb6-b600-3346904046f1', '5df2e2c0-022f-4486-b3d3-02bddd3a996b', 3, 19), -- correct
      ('8d6b48c8-9533-4cb6-b600-3346904046f1', '5b458c49-792f-4953-aabb-8dfd372c24a4', 2, null), -- clear-unsupported
      -- CLUB · 2025 · Cooler Classic 36 (cooler-classic-36) · ended 2025-08-17
      ('8b34ff60-08e5-4759-bfae-0c596f5c3306', '1f4a760c-037b-4af8-a0c6-aa43883d60ea', null, 3),
      -- CLUB · 2025 · Ow My Knee! 2025 (ow-my-knee-2025) · ended 2025-08-17
      ('24febceb-1746-4dbf-855f-06edca5462f2', 'b8752e20-cb0d-4b25-b985-a25d9c37417e', null, 1),
      ('24febceb-1746-4dbf-855f-06edca5462f2', '44fcf547-0ad4-4369-a65b-fafc4446f404', null, 2),
      ('24febceb-1746-4dbf-855f-06edca5462f2', '214d74d7-2124-4610-845c-ede18c22cc7b', null, 11),
      ('24febceb-1746-4dbf-855f-06edca5462f2', 'e22c4587-95e8-4f8c-93ac-826f4b6b13ba', null, 12),
      -- CLUB · 2025 · Ski Town Classic 2025 (ski-town-classic-2025) · ended 2025-08-17
      ('bdcf0496-dae8-4122-af0e-515a828532ee', 'c437a99b-3efe-47d6-802f-7ba15e6b3f6c', null, 1),
      ('bdcf0496-dae8-4122-af0e-515a828532ee', '60545e18-532c-4d32-8a17-0abd4da87729', null, 2),
      ('bdcf0496-dae8-4122-af0e-515a828532ee', '2125a760-099f-404b-a370-4d2304a725e2', 3, null), -- clear-unsupported
      ('bdcf0496-dae8-4122-af0e-515a828532ee', 'dd8e28c7-496c-4b5d-a7e5-522f8f29be52', 4, null), -- clear-unsupported
      ('bdcf0496-dae8-4122-af0e-515a828532ee', 'f37d3ee3-56df-45e3-87dc-d7a9bd23de1f', 2, null), -- clear-unsupported
      ('bdcf0496-dae8-4122-af0e-515a828532ee', 'fb7e2c9f-fec3-44a2-a288-012ccb7bc2c1', 4, null), -- clear-unsupported
      -- CLUB · 2025 · 2025 Capital Men's Sectional Championship (2025-capital-mens-sectional-championship) · ended 2025-09-07
      ('a67de5b7-88e6-42cc-8ff1-17b5d2ba1693', '94b3b777-3db2-47a6-86ae-ad9f683ea8ea', 3, 4), -- correct
      ('a67de5b7-88e6-42cc-8ff1-17b5d2ba1693', '24b73eed-fffe-4b0d-8a1e-15592dc8ae9f', null, 8),
      -- CLUB · 2025 · 2025 Capital Mixed Sectional Championship (2025-capital-mixed-sectional-championship) · ended 2025-09-07
      ('b7b2ee3f-ad06-4ca6-981a-baa00bbe0c36', '5df2e2c0-022f-4486-b3d3-02bddd3a996b', null, 4),
      ('b7b2ee3f-ad06-4ca6-981a-baa00bbe0c36', '96b8b897-466f-459d-a383-20f352065618', 3, 4), -- correct
      ('b7b2ee3f-ad06-4ca6-981a-baa00bbe0c36', '92a5e4f7-8648-45f1-9a7d-d348d88d6142', 4, 5), -- correct
      ('b7b2ee3f-ad06-4ca6-981a-baa00bbe0c36', '8a94d597-27c3-4089-9c9d-19c8d1a7d07a', null, 6),
      ('b7b2ee3f-ad06-4ca6-981a-baa00bbe0c36', '3908b86b-20cc-4f5e-b19f-4a36122704b4', null, 7),
      -- CLUB · 2025 · 2025 Central Appalachia Men's Sectional Championship (2025-central-appalachia-mens-sectional-championship) · ended 2025-09-07
      ('8f0716c7-7772-44c5-a203-727c8886f7fc', '32f3b06d-0d4b-4bec-81be-d42f79ec7dbe', null, 3),
      ('8f0716c7-7772-44c5-a203-727c8886f7fc', '022350b0-a721-42b0-bd75-efc6a6e4f8b1', null, 4),
      -- CLUB · 2025 · 2025 Central Plains Mixed Sectional Championship (2025-central-plains-mixed-sectional-championship) · ended 2025-09-07
      ('12dc5149-8a9b-4bca-a81a-51ef9b231c26', 'f6c186a7-1f5d-4d51-bf4e-234c6492d021', null, 3),
      ('12dc5149-8a9b-4bca-a81a-51ef9b231c26', '2aab191f-6f55-4d05-951e-ee102995bb13', null, 4),
      -- CLUB · 2025 · 2025 Founders Men's Sectional Championship (2025-founders-mens-sectional-championship) · ended 2025-09-07
      ('bfe29e28-2617-4294-8fdd-6ba15cdbf822', '8ac6ddc0-6197-4b56-b1ac-53279d424f61', null, 5),
      -- CLUB · 2025 · 2025 Founders Mixed Sectional Championship (2025-founders-mixed-sectional-championship) · ended 2025-09-07
      ('b7e46e35-69b6-4f9a-b306-1c0e1ea2c3bb', '04daa03a-804a-4a10-bca4-8253c5ee16a3', 6, 7), -- correct
      -- CLUB · 2025 · 2025 Gulf Coast Men's Sectional Championship (2025-gulf-coast-mens-sectional-championship) · ended 2025-09-07
      ('e89732a3-88f1-416a-bdc7-0b6fa5711eb8', '70b84d2a-d1b9-429d-b231-11e7a1165922', null, 3),
      -- CLUB · 2025 · 2025 Gulf Coast Mixed Sectional Championship (2025-gulf-coast-mixed-sectional-championship) · ended 2025-09-07
      ('42b0ba51-07c8-4413-bd3a-c9e50e20372c', 'fc545dff-8719-4d69-8e5c-6f5ab77c3144', null, 3),
      -- CLUB · 2025 · 2025 North Plains Men's Sectional Championship (2025-north-plains-mens-sectional-championship) · ended 2025-09-07
      ('7e984e4a-033b-4c2f-a1a4-8a55f9bf424a', '9b655b5b-81a9-4b90-bbb6-f831c38df5d6', 2, 3), -- correct
      -- CLUB · 2025 · 2025 Oregon Mixed Sectional Championship (2025-oregon-mixed-sectional-championship) · ended 2025-09-07
      ('2424dafe-17f7-4328-a311-2397f8ad841b', 'f8f00c57-54c0-4d07-9503-ffc6064045da', null, 2),
      ('2424dafe-17f7-4328-a311-2397f8ad841b', 'd6a64cb2-8661-4c7d-abb1-3da38d380a93', 2, 3), -- correct
      ('2424dafe-17f7-4328-a311-2397f8ad841b', '0a2d9f5c-e5c8-4c1c-97a1-e57a3a208587', null, 4),
      -- CLUB · 2025 · 2025 Rocky Mountain Men's Sectional Championship (2025-rocky-mountain-mens-sectional-championship) · ended 2025-09-07
      ('0caff386-0a1b-402e-9112-dfcf0d0d30a8', '7adaad2e-5dae-429f-a5ad-4a380c10bfee', 3, 2), -- correct
      ('0caff386-0a1b-402e-9112-dfcf0d0d30a8', '89e99440-346c-44f1-ac4d-36037f72ac52', 2, 3), -- correct
      ('0caff386-0a1b-402e-9112-dfcf0d0d30a8', 'ce54c4cc-0169-4e2e-bcd4-cc0fc6bf34ba', 3, 4), -- correct
      ('0caff386-0a1b-402e-9112-dfcf0d0d30a8', 'fb7e2c9f-fec3-44a2-a288-012ccb7bc2c1', null, 7),
      -- CLUB · 2025 · 2025 Rocky Mountain Mixed Sectional Championship (2025-rocky-mountain-mixed-sectional-championship) · ended 2025-09-07
      ('3a5397a0-93eb-42d3-bad3-172f6216e010', '41f395a0-3180-4a97-a206-899b174708f5', null, 3),
      ('3a5397a0-93eb-42d3-bad3-172f6216e010', 'cb2e7b15-89b9-45b6-809c-23d8639d807a', null, 4),
      ('3a5397a0-93eb-42d3-bad3-172f6216e010', '5830b541-1025-40e7-ae55-b37cebd0b3bd', null, 5),
      ('3a5397a0-93eb-42d3-bad3-172f6216e010', '4c36d5eb-1cf4-459a-8f18-b3d75a972d97', null, 6),
      -- CLUB · 2025 · 2025 Rocky Mountain Women's Sectional Championship (2025-rocky-mountain-womens-sectional-championship) · ended 2025-09-07
      ('f451f16a-f6c2-4d15-84b8-b94e8a9d562e', '9a61f01a-89d2-45d0-b985-5958914625c6', null, 3),
      ('f451f16a-f6c2-4d15-84b8-b94e8a9d562e', 'ede7dc3a-7000-4e0a-ab78-dea7ad95d167', null, 4),
      ('f451f16a-f6c2-4d15-84b8-b94e8a9d562e', '1fdf9df1-3a4a-4381-bb9f-86a4588f259b', null, 5),
      ('f451f16a-f6c2-4d15-84b8-b94e8a9d562e', 'f1c43204-3e36-4cf1-a21e-8e4530e326d2', null, 6),
      -- CLUB · 2025 · 2025 SoCal Men's Sectional Championship (2025-socal-mens-sectional-championship) · ended 2025-09-07
      ('269f8998-0e5a-47f6-84f2-feaff6611855', '545c59af-9b8f-4268-8e41-c8080e17684c', 10, 11), -- correct
      -- CLUB · 2025 · 2025 SoCal Mixed Sectional Championship (2025-socal-mixed-sectional-championship) · ended 2025-09-07
      ('4b988c2e-5d07-4d9e-a51b-25c72135db89', '77845a8e-f206-44ab-83cc-64ee06d9ef6a', null, 3),
      ('4b988c2e-5d07-4d9e-a51b-25c72135db89', '24de552f-0661-4e18-9380-83a5678b0001', null, 4),
      ('4b988c2e-5d07-4d9e-a51b-25c72135db89', 'a09d56ff-1d95-4d4d-a441-930ef8d3d70a', 3, 5), -- correct
      ('4b988c2e-5d07-4d9e-a51b-25c72135db89', '0271bed7-5989-4ee9-bd23-fc8eb573a7b3', 3, 6), -- correct
      ('4b988c2e-5d07-4d9e-a51b-25c72135db89', '2c840178-388c-4785-acb9-90483bf9eee7', null, 7),
      ('4b988c2e-5d07-4d9e-a51b-25c72135db89', '77aec533-012d-46d5-b89e-a6f6fc9f9318', null, 8),
      ('4b988c2e-5d07-4d9e-a51b-25c72135db89', 'c85959f8-0034-4ae1-b6c0-1e5ad8a25b59', null, 9),
      ('4b988c2e-5d07-4d9e-a51b-25c72135db89', '95e04940-5b00-464c-8012-afc7cf271397', null, 10),
      -- CLUB · 2025 · 2025 Washington Men's Sectional Championship (2025-washington-mens-sectional-championship) · ended 2025-09-07
      ('4d229cf6-88fa-4822-9fcb-dd90671e2462', '557f5fd8-ff8b-4171-8fbf-bfdef5e65f7e', null, 3),
      ('4d229cf6-88fa-4822-9fcb-dd90671e2462', '68451abe-2adc-4ab0-ad1d-c495a2986a22', null, 4),
      -- CLUB · 2025 · 2025 Washington Mixed Sectional Championship (2025-washington-mixed-sectional-championship) · ended 2025-09-07
      ('b25956ed-ef2c-41c1-865a-3db28779ade2', '0ea07828-bdee-449c-a732-b97a1ae14163', 2, 3), -- correct
      ('b25956ed-ef2c-41c1-865a-3db28779ade2', 'cd0a96df-13c4-43ec-a420-727e22ce64a8', null, 4),
      ('b25956ed-ef2c-41c1-865a-3db28779ade2', '5882e353-9e30-42c5-a85f-6fa18932c30a', 3, 5), -- correct
      -- CLUB · 2025 · 2025 West Bay Men's Sectional Championship (2025-west-bay-mens-sectional-championship) · ended 2025-09-07
      ('dbf442a8-13bc-4751-927a-ddb76666f1cf', 'e8391cb5-c9da-4dbe-ac81-7aaa02719917', null, 4),
      ('dbf442a8-13bc-4751-927a-ddb76666f1cf', '2ee74952-cce0-4557-99b9-0a66967e6fb1', null, 5),
      ('dbf442a8-13bc-4751-927a-ddb76666f1cf', '55d1baa0-d032-48e3-a8eb-dcaefb87f6c5', null, 6),
      -- CLUB · 2025 · 2025 West Bay Mixed Sectional Championship (2025-west-bay-mixed-sectional-championship) · ended 2025-09-07
      ('24ae566b-1f25-4579-8313-986a9e521559', '010ea0bf-56ba-4afa-9ac1-5b3530203385', 3, 4), -- correct
      ('24ae566b-1f25-4579-8313-986a9e521559', '043eb60f-485f-4e51-b866-1830320d06e4', null, 11),
      ('24ae566b-1f25-4579-8313-986a9e521559', '636c581d-f958-4852-8ead-ecbc08474ce3', null, 11),
      -- CLUB · 2025 · 2025 West Plains Mixed Sectional Championship (2025-west-plains-mixed-sectional-championship) · ended 2025-09-07
      ('de6e1079-f0bd-4e34-9275-36e6153d1e8d', '26df4f98-453e-4a50-9b0b-f70c6792574c', 5, 6), -- correct
      -- CLUB · 2025 · 2025 Great Lakes Men's Regional Championship (2025-great-lakes-mens-regional-championship) · ended 2025-09-21
      ('1bc3707b-4a29-4d13-97ca-47cad17a2bb0', '4c48d861-19e6-4e54-96f1-e427ac192d4d', null, 4),
      ('1bc3707b-4a29-4d13-97ca-47cad17a2bb0', 'ed4b0759-558b-40c4-ac46-e4c3ab2d22b9', 3, 5), -- correct
      -- CLUB · 2025 · 2025 Mid-Atlantic Men's Regional Championship (2025-mid-atlantic-mens-regional-championship) · ended 2025-09-21
      ('20c55e00-cff9-4f6a-9092-ce018ff133bf', 'a76da93d-d171-4d3e-bb58-44a7af505edb', 3, 4), -- correct
      -- CLUB · 2025 · 2025 Mid-Atlantic Mixed Regional Championship (2025-mid-atlantic-mixed-regional-championship) · ended 2025-09-21
      ('ce951e77-5342-4c01-89de-4e91f9d9a507', 'baf9bd46-c5e4-4ec7-b1be-5a89fab55983', null, 3),
      ('ce951e77-5342-4c01-89de-4e91f9d9a507', 'cb16741d-50a0-4b23-b586-2d157b7ff819', null, 4),
      ('ce951e77-5342-4c01-89de-4e91f9d9a507', 'c6b5acf5-ef7b-4fef-936a-89d02e6edc77', 3, 5), -- correct
      ('ce951e77-5342-4c01-89de-4e91f9d9a507', 'a76563e2-f618-4ca6-9409-7d5afb6dfce6', 3, 6), -- correct
      -- CLUB · 2025 · 2025 Northeast Mixed Regional Championship (2025-northeast-mixed-regional-championship) · ended 2025-09-21
      ('89d7abe4-9d5a-4c4f-82b5-328e47145966', 'e9953670-ee27-4e2d-9aad-29b67317ddd4', 3, 5), -- correct
      -- CLUB · 2025 · 2025 Northwest Men's Regional Championship (2025-northwest-mens-regional-championship) · ended 2025-09-21
      ('181a824e-0006-44d5-830c-aabc742fab13', 'b1c73188-bdac-49fa-a958-256417478be2', 3, 4), -- correct
      ('181a824e-0006-44d5-830c-aabc742fab13', '5cb1fdbf-ca09-4542-840d-e987160ccd0f', 9, null), -- clear-unsupported
      ('181a824e-0006-44d5-830c-aabc742fab13', '6ef8c800-4ba6-4cff-a87e-2b585f5eb875', 10, null), -- clear-unsupported
      -- CLUB · 2025 · 2025 Northwest Mixed Regional Championship (2025-northwest-mixed-regional-championship) · ended 2025-09-21
      ('e5958ce5-4500-406e-8a92-f0f744507420', '53048258-c031-4d6d-9a39-31141ff9f2b5', 3, 4), -- correct
      -- CLUB · 2025 · 2025 Northwest Women's Regional Championship (2025-northwest-womens-regional-championship) · ended 2025-09-21
      ('0a568b0f-dbe6-4193-a180-c639bc3d7a40', 'de6e7062-4e78-4e9a-9105-823b14a9af09', 3, 4), -- correct
      -- CLUB · 2025 · 2025 Southeast Mixed Regional Championship (2025-southeast-mixed-regional-championship) · ended 2025-09-21
      ('ab7683d6-fbb8-42f2-986f-b526656da06e', '21443bc6-edd8-44bd-959f-68df9e0222c3', null, 3),
      ('ab7683d6-fbb8-42f2-986f-b526656da06e', 'bc8e4481-b457-48e2-b66b-a8f087af6428', 3, 4), -- correct
      ('ab7683d6-fbb8-42f2-986f-b526656da06e', '1bde08e1-b998-434d-a1b2-caee7fe370cf', 3, 5), -- correct
      -- CLUB · 2025 · 2025 Southwest Men's Regional Championship (2025-southwest-mens-regional-championship) · ended 2025-09-21
      ('fb6801cc-5d85-4c3f-8a45-3258c8e09b42', '035931ed-47ed-40e4-b17e-cb9805e584c2', 3, 4), -- correct
      -- CLUB · 2025 · 2025 Southwest Mixed Regional Championship (2025-southwest-mixed-regional-championship) · ended 2025-09-21
      ('31c643f5-c900-4388-ab79-da3d93618dbd', 'cb3c53c7-9a67-41ed-b813-77a187bb12fa', null, 2),
      ('31c643f5-c900-4388-ab79-da3d93618dbd', '02532007-e664-4d5f-8f6d-9073b0ba62cf', 2, 3), -- correct
      ('31c643f5-c900-4388-ab79-da3d93618dbd', '727235df-e55b-4bd9-a5b2-948359f1d534', null, 4),
      ('31c643f5-c900-4388-ab79-da3d93618dbd', '6ad84b92-5361-466c-88e9-a768e6545564', 3, 5), -- correct
      ('31c643f5-c900-4388-ab79-da3d93618dbd', 'b5ba553b-12e3-4ddb-9b14-5e6655be76a5', 3, 6), -- correct
      -- CLUB · 2025 · 2025 USA Ultimate Club Nationals (2025-usa-ultimate-club-nationals) · ended 2025-10-26
      ('41436042-b280-44b7-811f-030268e94ab6', '29c78a19-051e-4b64-9f57-89d2d89130be', 3, 4), -- correct
      ('41436042-b280-44b7-811f-030268e94ab6', '2a7d2699-544b-4020-8fa3-3343e42494a8', 3, 4), -- correct
      ('41436042-b280-44b7-811f-030268e94ab6', '69d5370f-d929-4afe-9759-504ebca62274', 3, 4), -- correct
      -- CLUB · 2026 · Club Terminus 2026 (club-terminus-2026) · ended 2026-06-28
      ('742a2987-58f2-4092-a977-b44415003b78', '890c26af-bd09-438b-8aaf-e2978869fab6', 13, 14), -- correct
      -- CLUB · 2026 · Eugene Summer Solstice 2026 (eugene-summer-solstice-2026) · ended 2026-06-28
      ('02b60759-62b1-4c6c-8ffe-d4919dc4e4e6', 'dcc2c1f2-bfdb-46a4-b372-ac392191e6dc', 3, 4), -- correct
      ('02b60759-62b1-4c6c-8ffe-d4919dc4e4e6', 'c840c6a6-63a4-4daf-8d14-9c58eaff39fe', 11, 12), -- correct
      ('02b60759-62b1-4c6c-8ffe-d4919dc4e4e6', 'c2840611-b355-47d1-ad52-67d54c3a8bd8', 15, 16), -- correct
      -- CLUB · 2026 · Summer Bash 2026 (summer-bash-2026) · ended 2026-06-28
      ('0e8c833b-4a8b-4aec-b097-ecb39484c6f9', '0aedc7d3-4ea0-419f-81a8-510615e9c205', 6, null), -- clear-unsupported
      ('0e8c833b-4a8b-4aec-b097-ecb39484c6f9', '3a599a55-eb2a-4855-bd6c-e600831e0673', 5, null), -- clear-unsupported
      -- CLUB · 2026 · Heavyweights 2026 (Heavyweights-2026) · ended 2026-07-12
      ('1c64ac24-3128-4e82-8a1e-9ea04dcd510c', 'f04f2937-2819-4db3-99bb-8cdfed7b79b0', null, 3),
      ('1c64ac24-3128-4e82-8a1e-9ea04dcd510c', 'ba1259a0-0ed4-4d68-b44b-7e924e925d63', null, 4),
      -- CLUB · 2026 · 2026 Select Flight Invite - West (2026-Select-Flight-Invite---West) · ended 2026-07-26
      ('13366312-84a5-44e8-b625-a0a7f7dcd6da', '5ca45269-3548-4446-ad1e-10a3e45e217b', null, 1),
      ('13366312-84a5-44e8-b625-a0a7f7dcd6da', '6a02195e-ff33-42eb-bad4-1096795fc8f7', null, 1),
      ('13366312-84a5-44e8-b625-a0a7f7dcd6da', '80d3375b-06d7-4795-a682-f54ae7613360', null, 2),
      ('13366312-84a5-44e8-b625-a0a7f7dcd6da', 'f21edb9c-30ee-4979-80a1-2c9997cec60e', null, 2),
      ('13366312-84a5-44e8-b625-a0a7f7dcd6da', 'a5c0c1f6-6f98-4cc1-b6ea-ec1c80cf991a', null, 3),
      ('13366312-84a5-44e8-b625-a0a7f7dcd6da', 'bda4ec15-ac1f-4ee7-b1cb-1cb6d698754b', null, 3),
      ('13366312-84a5-44e8-b625-a0a7f7dcd6da', '8767af3a-0c79-40a5-be25-4c92e10f26e7', null, 4),
      ('13366312-84a5-44e8-b625-a0a7f7dcd6da', 'a339e2d3-0224-4cc0-a8c1-2948c6ef9375', null, 4),
      ('13366312-84a5-44e8-b625-a0a7f7dcd6da', 'd6aa90d9-2353-435d-9214-6700999dcfda', null, 5),
      ('13366312-84a5-44e8-b625-a0a7f7dcd6da', 'ff4852f5-996e-456d-8e45-8b4c4bd1dd21', null, 5),
      ('13366312-84a5-44e8-b625-a0a7f7dcd6da', '0e382945-77e9-4c26-bd0e-d6f5d56fda34', null, 6),
      ('13366312-84a5-44e8-b625-a0a7f7dcd6da', 'ea9384e7-59d6-40dd-af7c-59b9655fbade', null, 6),
      ('13366312-84a5-44e8-b625-a0a7f7dcd6da', '35d12e80-f0c8-4c05-9a6d-bc9a0456826e', null, 7),
      ('13366312-84a5-44e8-b625-a0a7f7dcd6da', '4dbff02f-fa55-498d-bc95-0d9865a7db15', null, 7),
      ('13366312-84a5-44e8-b625-a0a7f7dcd6da', '8ecd3b10-382a-4ecb-8e02-64327b820a14', null, 8),
      ('13366312-84a5-44e8-b625-a0a7f7dcd6da', 'bf15c804-b0c5-42f0-810f-8ee7d1d628f4', null, 8),
      -- CLUB · 2026 · 2026 Select Flight Invite East (2026-Select-Flight-Invite-East) · ended 2026-07-26
      ('fd9f5da6-f0b3-4681-a136-cc37fb818de7', '0f0435fb-4535-4cb0-b974-bc98a5d99a39', null, 1),
      ('fd9f5da6-f0b3-4681-a136-cc37fb818de7', '48a9d4e6-a0a8-4eec-9be6-84db78b234dd', null, 1),
      ('fd9f5da6-f0b3-4681-a136-cc37fb818de7', '7e546b45-d0bd-4122-9615-5d083354dee0', null, 1),
      ('fd9f5da6-f0b3-4681-a136-cc37fb818de7', '45f07989-b765-4b53-969e-5af95b5aec31', null, 2),
      ('fd9f5da6-f0b3-4681-a136-cc37fb818de7', '6730679a-52df-4edc-b015-9cd0119ec212', null, 2),
      ('fd9f5da6-f0b3-4681-a136-cc37fb818de7', 'c39e9485-2ac0-4f55-a4db-8116fcff9c27', null, 2),
      ('fd9f5da6-f0b3-4681-a136-cc37fb818de7', '31953156-88b0-4f58-afd2-fc6bea8032fc', null, 3),
      ('fd9f5da6-f0b3-4681-a136-cc37fb818de7', '8aa11adc-fe60-42f1-945a-d409fcf54e47', null, 3),
      ('fd9f5da6-f0b3-4681-a136-cc37fb818de7', 'c918b9b4-4a8e-49b7-b05a-684286eb183f', null, 3),
      ('fd9f5da6-f0b3-4681-a136-cc37fb818de7', '1791fb9c-5eea-4ba9-bcda-4c031e55b4dc', null, 4),
      ('fd9f5da6-f0b3-4681-a136-cc37fb818de7', 'a8eb480a-ba0a-457d-87da-8799e728ccf1', null, 4),
      ('fd9f5da6-f0b3-4681-a136-cc37fb818de7', 'ba8ce07a-36ba-42c6-83fb-ebc3683569e8', null, 4),
      ('fd9f5da6-f0b3-4681-a136-cc37fb818de7', '49947e8e-1be8-4069-8f23-10473d220600', null, 5),
      ('fd9f5da6-f0b3-4681-a136-cc37fb818de7', '7dfbedd8-16b5-4f70-8f34-dfc184087f54', null, 5),
      ('fd9f5da6-f0b3-4681-a136-cc37fb818de7', '95634c4b-7141-4164-84c7-cb482d4779b4', null, 5),
      ('fd9f5da6-f0b3-4681-a136-cc37fb818de7', 'c13312d2-6dc6-4c8b-b9e9-b8d3197e6818', null, 6),
      ('fd9f5da6-f0b3-4681-a136-cc37fb818de7', 'cb9f133e-6dae-4d96-9ad0-851c6a4e7eb6', null, 6),
      ('fd9f5da6-f0b3-4681-a136-cc37fb818de7', 'dc370a69-2b08-443a-b9e2-747a37d73af9', null, 6),
      ('fd9f5da6-f0b3-4681-a136-cc37fb818de7', '27ae6355-4da0-4cd8-80f6-fb14d4bd6192', null, 7),
      ('fd9f5da6-f0b3-4681-a136-cc37fb818de7', '8127ddfb-260d-4010-95b9-199a0d6c8153', null, 7),
      ('fd9f5da6-f0b3-4681-a136-cc37fb818de7', '98d397d5-9a2b-46f0-a11c-23822fad1868', null, 7),
      ('fd9f5da6-f0b3-4681-a136-cc37fb818de7', 'be5bf6c1-97fc-4bbd-8fda-3cdee159374d', null, 8),
      ('fd9f5da6-f0b3-4681-a136-cc37fb818de7', 'e5d3af43-fbbb-41a7-84e4-8d504d5e5746', null, 8),
      ('fd9f5da6-f0b3-4681-a136-cc37fb818de7', 'e73ca4c8-ebed-4271-af11-439005caefc2', null, 8),
      ('fd9f5da6-f0b3-4681-a136-cc37fb818de7', '36e0339a-e79b-4e08-a5a4-61602709fff9', null, 9),
      ('fd9f5da6-f0b3-4681-a136-cc37fb818de7', '617796ad-2eb2-4c5a-ab88-1691d4069370', null, 9),
      ('fd9f5da6-f0b3-4681-a136-cc37fb818de7', 'fa0ba5d7-89fb-4c8d-a37c-c4b16b6fab04', null, 9),
      ('fd9f5da6-f0b3-4681-a136-cc37fb818de7', '101268e1-0f9f-46c5-97c7-c305d3ee011c', null, 10),
      ('fd9f5da6-f0b3-4681-a136-cc37fb818de7', '62008779-5260-422a-94bb-cb9f808591bf', null, 10),
      ('fd9f5da6-f0b3-4681-a136-cc37fb818de7', 'fdf7d653-a654-494b-afe3-264733cee41a', null, 10),
      ('fd9f5da6-f0b3-4681-a136-cc37fb818de7', 'af0051b7-138c-439b-b339-6545876cebd1', null, 11),
      ('fd9f5da6-f0b3-4681-a136-cc37fb818de7', 'b0d8b27a-1529-499d-9977-37e4ccaa6fd7', null, 11),
      ('fd9f5da6-f0b3-4681-a136-cc37fb818de7', 'f2f634b0-fb52-4c8e-bc64-eabc05a9b511', null, 11),
      ('fd9f5da6-f0b3-4681-a136-cc37fb818de7', '295d2bff-8611-4e32-8b65-642873b5d993', null, 12),
      ('fd9f5da6-f0b3-4681-a136-cc37fb818de7', '86168270-63f8-4e84-b3ea-e5f83ff0ec04', null, 12),
      ('fd9f5da6-f0b3-4681-a136-cc37fb818de7', 'd105e917-9853-42a4-bf18-a6106ffdb5b7', null, 12),
      ('fd9f5da6-f0b3-4681-a136-cc37fb818de7', '993fe5e9-c8e2-4bb5-a777-690910f48f97', null, 13),
      ('fd9f5da6-f0b3-4681-a136-cc37fb818de7', '9b72923a-a789-47b0-a2be-0810de3bfedf', null, 13),
      ('fd9f5da6-f0b3-4681-a136-cc37fb818de7', 'ea03d24a-6878-4f52-b990-12c276763307', null, 13),
      ('fd9f5da6-f0b3-4681-a136-cc37fb818de7', '3d0f9798-d7b8-4581-ba88-f5a0d3225387', null, 14),
      ('fd9f5da6-f0b3-4681-a136-cc37fb818de7', '6c6cb223-6783-4a9c-8ea7-c81006e5e20a', null, 14),
      ('fd9f5da6-f0b3-4681-a136-cc37fb818de7', 'fb082aab-b740-420a-9ce0-3f5d8e9c87b9', null, 14),
      ('fd9f5da6-f0b3-4681-a136-cc37fb818de7', '0d310254-0030-4f18-afda-65ebfd08608b', null, 15),
      ('fd9f5da6-f0b3-4681-a136-cc37fb818de7', '453d3a0b-14f7-4b74-a314-1a63a2c98910', null, 15),
      ('fd9f5da6-f0b3-4681-a136-cc37fb818de7', 'c84c29b2-bb8d-42a5-a852-173e52d31fd7', null, 15),
      ('fd9f5da6-f0b3-4681-a136-cc37fb818de7', '04e251bc-7c6c-46f3-abaa-9f275609a801', null, 16),
      ('fd9f5da6-f0b3-4681-a136-cc37fb818de7', '641c8812-127b-4e39-92e1-0b7546413818', null, 16),
      ('fd9f5da6-f0b3-4681-a136-cc37fb818de7', 'c80a7b73-a395-45f9-8105-c609ad43a3ca', null, 16),
      -- CLUB · 2026 · 2026 U.S. Open International Club Championships (ICC) (2026-US-Open-International-Club-Championships-ICC) · ended 2026-08-02
      ('d52071bd-604e-4d59-b518-68326fe5ab81', '8d8cd8da-5d36-4fb6-bba6-8eade5066c1e', null, 1),
      ('d52071bd-604e-4d59-b518-68326fe5ab81', 'c60a2cc4-072b-43f1-bf41-121f96556d76', null, 1),
      ('d52071bd-604e-4d59-b518-68326fe5ab81', 'f4dd3560-ffe6-4dec-91cb-1fa81e09ee36', null, 1),
      ('d52071bd-604e-4d59-b518-68326fe5ab81', '5ff2ef59-795f-4f5a-8e42-a0d5aeb00453', null, 2),
      ('d52071bd-604e-4d59-b518-68326fe5ab81', '70502e5f-a123-45a9-96e7-68c0f6168725', null, 2),
      ('d52071bd-604e-4d59-b518-68326fe5ab81', 'a0eeb943-dca9-47ae-9943-97a5dc52373f', null, 2),
      ('d52071bd-604e-4d59-b518-68326fe5ab81', '49b55498-6961-4e3b-a2a0-daabad810d84', null, 3),
      ('d52071bd-604e-4d59-b518-68326fe5ab81', '6089401b-2180-4a44-9c0d-f1383694f07b', null, 3),
      ('d52071bd-604e-4d59-b518-68326fe5ab81', '8bb970a5-1f64-43d8-8d82-132c05936723', null, 3),
      ('d52071bd-604e-4d59-b518-68326fe5ab81', '5d4ef072-d13a-4d5f-9302-1dad6deaeee5', null, 4),
      ('d52071bd-604e-4d59-b518-68326fe5ab81', 'ac199008-4142-4b00-b419-05eb99c0251f', null, 4),
      ('d52071bd-604e-4d59-b518-68326fe5ab81', 'c1f4df2d-a0a6-4d45-bc9d-c997680961cd', null, 4),
      ('d52071bd-604e-4d59-b518-68326fe5ab81', '436607e6-32f6-4eaa-9c35-9faa095c724a', null, 5),
      ('d52071bd-604e-4d59-b518-68326fe5ab81', '85f175b2-2706-45f5-af77-62764372516a', null, 5),
      ('d52071bd-604e-4d59-b518-68326fe5ab81', 'e979c24c-47e4-4f9f-a29e-1a3f13fc5bbf', null, 5),
      ('d52071bd-604e-4d59-b518-68326fe5ab81', '6a8fec2d-5489-4ec4-8226-463bf54caa27', null, 6),
      ('d52071bd-604e-4d59-b518-68326fe5ab81', '7154f3dd-bf80-433d-adfe-843edd9e0113', null, 6),
      ('d52071bd-604e-4d59-b518-68326fe5ab81', '89a47fe7-dbd9-4d16-a139-c7ba575725b8', null, 6),
      ('d52071bd-604e-4d59-b518-68326fe5ab81', '0f0435fb-4535-4cb0-b974-bc98a5d99a39', null, 7),
      ('d52071bd-604e-4d59-b518-68326fe5ab81', '22b13c83-1024-4c8c-bc6c-338f4bfcf96e', null, 7),
      ('d52071bd-604e-4d59-b518-68326fe5ab81', 'e1bff4c2-9ab0-4198-a130-1e888116d309', null, 7),
      ('d52071bd-604e-4d59-b518-68326fe5ab81', '0e3b5ecf-3979-4468-a5c2-55faa459544d', null, 8),
      ('d52071bd-604e-4d59-b518-68326fe5ab81', '73944b1d-0e9a-4c5d-870c-be24d9454c72', null, 8),
      ('d52071bd-604e-4d59-b518-68326fe5ab81', '89791603-eff2-49ba-824a-cf4b02f2480a', null, 8),
      -- CLUB · 2026 · Bid in the Bend 2026 (Bid-in-the-Bend-2026) · ended 2026-08-02
      ('0384ffdc-a110-444e-8643-39077531d1ab', 'd75c11b9-7adf-4294-bcfa-2648ffeab856', null, 1),
      ('0384ffdc-a110-444e-8643-39077531d1ab', 'a4de3a32-c277-4c20-b11a-a53d5b0a8b57', null, 2),
      ('0384ffdc-a110-444e-8643-39077531d1ab', '1a05ba90-25e9-446b-a1c5-fa93b8078d4c', null, 3),
      ('0384ffdc-a110-444e-8643-39077531d1ab', '388a6094-4f7e-45e5-aa3e-d92acdc95b9d', null, 4),
      ('0384ffdc-a110-444e-8643-39077531d1ab', '590cb772-9005-4758-a32b-870831aaed45', null, 5),
      ('0384ffdc-a110-444e-8643-39077531d1ab', 'bafa44dc-3eff-4107-89aa-9c19abb0caf1', null, 6),
      ('0384ffdc-a110-444e-8643-39077531d1ab', '578cbb79-1da9-44ce-85de-39818de73166', null, 7),
      ('0384ffdc-a110-444e-8643-39077531d1ab', 'e8439a33-6642-4140-ac0f-90bd6a9c6b92', null, 8),
      -- CLUB · 2026 · PB&J 2026 (PBJ-2026) · ended 2026-08-02
      ('71201cb1-fd3d-42f0-8697-82398d9b91e7', '49b480bf-12c3-4346-8f66-133d338147c1', null, 1),
      ('71201cb1-fd3d-42f0-8697-82398d9b91e7', 'c9e2ec95-6712-43a9-95e5-982a804be694', null, 2),
      ('71201cb1-fd3d-42f0-8697-82398d9b91e7', '652bebee-27c6-47a7-9f96-452dc32562ff', null, 3),
      ('71201cb1-fd3d-42f0-8697-82398d9b91e7', 'd1fad718-c831-4b81-b79d-305057bf605c', null, 4),
      -- CLUB · 2026 · Cooler Classic 37 (Men & Women) (Cooler-Classic-37-Men-Women) · ended 2026-08-09
      ('b0303e2f-72a8-4f5e-ab31-1bb07883cd02', 'be5bf6c1-97fc-4bbd-8fda-3cdee159374d', null, 1),
      ('b0303e2f-72a8-4f5e-ab31-1bb07883cd02', '86168270-63f8-4e84-b3ea-e5f83ff0ec04', null, 2),
      ('b0303e2f-72a8-4f5e-ab31-1bb07883cd02', '219e119e-bde2-492d-b89c-97dce254b480', null, 3),
      ('b0303e2f-72a8-4f5e-ab31-1bb07883cd02', 'dc370a69-2b08-443a-b9e2-747a37d73af9', null, 3),
      ('b0303e2f-72a8-4f5e-ab31-1bb07883cd02', '233bae86-7ff1-45fa-876a-d08f5a8d4553', null, 4),
      ('b0303e2f-72a8-4f5e-ab31-1bb07883cd02', 'b8fc2b34-c8bf-4182-8045-0fad2c91d1e1', null, 4),
      ('b0303e2f-72a8-4f5e-ab31-1bb07883cd02', '70d3a38e-b389-4ab0-a683-8d42ac988e3a', null, 5),
      ('b0303e2f-72a8-4f5e-ab31-1bb07883cd02', '8127ddfb-260d-4010-95b9-199a0d6c8153', null, 6),
      ('b0303e2f-72a8-4f5e-ab31-1bb07883cd02', 'f21edb9c-30ee-4979-80a1-2c9997cec60e', null, 7),
      ('b0303e2f-72a8-4f5e-ab31-1bb07883cd02', '490238ee-e8cc-422c-9b50-b82904c447b6', null, 8),
      ('b0303e2f-72a8-4f5e-ab31-1bb07883cd02', '0f49c69d-3684-477c-91b8-45d62afbf71c', null, 9),
      ('b0303e2f-72a8-4f5e-ab31-1bb07883cd02', '5b9559cc-fa59-4156-a4a5-8390ba2981f3', null, 10),
      ('b0303e2f-72a8-4f5e-ab31-1bb07883cd02', '317aafbd-0610-4a83-aa6a-29a521cedc56', null, 11),
      ('b0303e2f-72a8-4f5e-ab31-1bb07883cd02', '4f5e7981-5de5-45bb-a2c6-e06e37b88b7b', null, 13),
      ('b0303e2f-72a8-4f5e-ab31-1bb07883cd02', '393677c9-df30-47d0-8931-fdfd6abb3e3f', null, 14),
      ('b0303e2f-72a8-4f5e-ab31-1bb07883cd02', '95b29d18-1f93-4d3c-81b7-bdc713ead253', null, 15),
      ('b0303e2f-72a8-4f5e-ab31-1bb07883cd02', '641c8812-127b-4e39-92e1-0b7546413818', null, 16),
      -- CLUB · 2026 · Flower Power 2026 (Flower-Power-2026) · ended 2026-08-09
      ('f106a2ba-c329-4b73-9bac-a79ff3610e47', 'b7674835-7e2f-4503-8990-b4cf380bb618', null, 1),
      ('f106a2ba-c329-4b73-9bac-a79ff3610e47', '1347a61e-f9c8-48d6-9cfd-300788fc86e8', null, 2),
      ('f106a2ba-c329-4b73-9bac-a79ff3610e47', '3e1e6c06-3a01-4ebc-af3d-45c5aa86087a', null, 3),
      ('f106a2ba-c329-4b73-9bac-a79ff3610e47', '1bcfe409-4789-4d15-8deb-700f48fb72dc', null, 4),
      ('f106a2ba-c329-4b73-9bac-a79ff3610e47', 'f79734a4-8b0f-4219-ba99-776b71933aac', null, 5),
      ('f106a2ba-c329-4b73-9bac-a79ff3610e47', 'b7e5bf02-9909-4a67-bbb1-0573237bd02c', null, 6),
      ('f106a2ba-c329-4b73-9bac-a79ff3610e47', '9824d44d-5d2e-4513-bf67-fc68f9bbb3ba', null, 7),
      ('f106a2ba-c329-4b73-9bac-a79ff3610e47', '3f57a85e-0d41-466f-acd0-f81dc34fb85e', null, 8),
      ('f106a2ba-c329-4b73-9bac-a79ff3610e47', '47913261-d015-4607-9fbe-6394e53f6e4e', null, 9),
      ('f106a2ba-c329-4b73-9bac-a79ff3610e47', 'a7dda74f-defd-411c-b1a9-2cd655acbf32', null, 10),
      ('f106a2ba-c329-4b73-9bac-a79ff3610e47', 'b88db4a0-9b01-491f-b2c5-858862efeeac', null, 11),
      ('f106a2ba-c329-4b73-9bac-a79ff3610e47', '4ab52588-ff22-4682-8099-e969c9bae879', null, 12),
      ('f106a2ba-c329-4b73-9bac-a79ff3610e47', 'b34058a9-c63c-4773-8d52-ecf974dcd199', null, 13),
      ('f106a2ba-c329-4b73-9bac-a79ff3610e47', '6aa086f2-6810-4930-a64b-c11017ad4534', null, 14)
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

-- USAU per-event final placements — repair + fill, part 01 of 06.
--
-- The 2026-07-20 one-shot derivePlacements() backfill (Feature Backlog #18)
-- stored misread brackets, game-to-go losers kept 2nd, and ties that a later
-- game had settled; nothing derived placements after it. Regenerated with the
-- fixed algorithm by scripts/derive-usau-placements.ts on 2026-09-29T14:31:03.871Z —
-- do not hand-edit, re-run it.
--
-- This part: 129 events · fill 670 · correct 39 · clear 45 (conflict 0, contradicted 0, unsupported 45).
-- EXPECTED ROWS: 754. A row only updates while final_placement still holds
-- the value it was generated from ("old" below); the DO block raises, rolling
-- this part back, unless exactly 754 rows match. Regenerate instead of forcing it.
-- All 6 parts: 740 events · fill 3512 · correct 174 · clear 91 (conflict 0, contradicted 1, unsupported 90).
--
-- Back up first (once, before part 01):
--   create table public.usau_event_teams_placement_backup_20260929 as
--     select event_id, team_id, final_placement from public.usau_event_teams;
--   alter table public.usau_event_teams_placement_backup_20260929 enable row level security;
--   revoke all on public.usau_event_teams_placement_backup_20260929 from anon, authenticated;
-- Restore from it:
--   update public.usau_event_teams et set final_placement = b.final_placement
--     from public.usau_event_teams_placement_backup_20260929 b
--    where et.event_id = b.event_id and et.team_id = b.team_id
--      and et.final_placement is distinct from b.final_placement;
--
-- Events (evaluated through PostgREST, end_date vs 2026-09-29 UTC); settled ones are
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
  v_expected constant int := 754;
  v_updated int;
BEGIN
  update public.usau_event_teams et
     set final_placement = v.new_place
    from (values
      -- CLUB · 2014 · White Mountain Mixed (white-mountain-mixed) · ended 2014-08-03
      ('62e9390e-46eb-45f3-beac-3a67b0d4d73d'::uuid, '3db63fd0-db74-494d-b0a2-e1fa6a4ee8ac'::uuid, 3::int, 4::int), -- correct
      ('62e9390e-46eb-45f3-beac-3a67b0d4d73d', 'fab52004-9db4-4d27-9cae-73dc06c6241f', null, 8),
      ('62e9390e-46eb-45f3-beac-3a67b0d4d73d', 'ae442bc6-ed41-499f-9b19-606a0742a460', 11, 12), -- correct
      -- CLUB · 2014 · Big Sky Mens Sectionals 2014 (big-sky-mens-sectionals-2014) · ended 2014-09-07
      ('ecc327ac-8e52-4afe-9d50-1e631e6f9b60', '34c0599e-4882-4766-a122-6911a40d35b3', null, 1),
      ('ecc327ac-8e52-4afe-9d50-1e631e6f9b60', '02e322ab-0f66-4af7-924c-183064d78905', null, 2),
      ('ecc327ac-8e52-4afe-9d50-1e631e6f9b60', '115b2029-5976-45db-a161-8ba3f5d0940a', null, 3),
      -- CLUB · 2014 · Capital Mens Sectionals 2014 (capital-mens-sectionals-2014) · ended 2014-09-07
      ('8c0d039b-2382-483a-893e-49a4952561e7', 'f5961c4c-2383-48eb-a718-ff615cab4876', null, 1),
      ('8c0d039b-2382-483a-893e-49a4952561e7', '7015499a-0002-4432-8db2-746f3d1faeb2', null, 2),
      -- CLUB · 2014 · Capital Mixed Sectionals (capital-mixed-sectionals) · ended 2014-09-07
      ('88ae6e23-1f72-451c-a783-ca8b9a115ea9', '430af5aa-d93d-42d0-b18a-ab2ddd5d019d', null, 2),
      ('88ae6e23-1f72-451c-a783-ca8b9a115ea9', '5b186bd6-f41f-4b27-9da2-13479e998356', 2, 3), -- correct
      ('88ae6e23-1f72-451c-a783-ca8b9a115ea9', '4fe9e235-924e-415f-a082-533129392d59', 10, null), -- clear-unsupported
      ('88ae6e23-1f72-451c-a783-ca8b9a115ea9', 'f5cddcae-afff-4f2a-a212-89476475e9f7', 9, null), -- clear-unsupported
      -- CLUB · 2014 · Capital Womens Sectionals 2014 (capital-womens-sectionals-2014) · ended 2014-09-07
      ('24546956-0bd9-47f6-a861-9e033fb5314f', 'd3738f44-6abe-464c-afd9-e2f67f89bd94', null, 1),
      ('24546956-0bd9-47f6-a861-9e033fb5314f', 'f2cbfcb3-b380-4651-af70-ea5ddd876a4c', null, 2),
      -- CLUB · 2014 · East Coast Mens Sectionals 2014 (east-coast-mens-sectionals-2014) · ended 2014-09-07
      ('75e9041c-c406-429d-b090-2857dfa54761', '96255872-39bf-45e0-a868-db0a5a38b4be', null, 1),
      ('75e9041c-c406-429d-b090-2857dfa54761', '8078a024-031b-4643-adae-7fcf4797a5ee', null, 2),
      ('75e9041c-c406-429d-b090-2857dfa54761', '7e8b04f6-dec9-49ef-8141-f48b2544cc11', null, 3),
      ('75e9041c-c406-429d-b090-2857dfa54761', '51925779-d951-49f0-a433-368a2a966e4b', null, 4),
      ('75e9041c-c406-429d-b090-2857dfa54761', '96d981a9-69ad-4733-9bd6-606c5db3b0e9', null, 4),
      ('75e9041c-c406-429d-b090-2857dfa54761', 'b973b7d2-031f-4022-831f-afb03b9519b6', null, 5),
      -- CLUB · 2014 · East Coast Mixed Sectionals (east-coast-mixed-sectionals) · ended 2014-09-07
      ('2d25c49a-7f3e-457f-b9ab-0776fb268a69', '059047b4-efec-4deb-b74a-7387c3eb16ff', 3, null), -- clear-unsupported
      ('2d25c49a-7f3e-457f-b9ab-0776fb268a69', '505299d2-b5de-43d4-aae9-5fafc727dbeb', 4, null), -- clear-unsupported
      ('2d25c49a-7f3e-457f-b9ab-0776fb268a69', '986b4603-300b-4d25-aaff-7ac9650d5977', 2, null), -- clear-unsupported
      -- CLUB · 2014 · East Plains Mixed Sectionals (east-plains-mixed-sectionals) · ended 2014-09-07
      ('dd053abd-a5a2-4464-8dee-2b8214100129', '93a5de38-a6e2-40f8-815c-1fbbfc03d4e3', null, 1),
      ('dd053abd-a5a2-4464-8dee-2b8214100129', 'b04864d5-3bb3-4a85-8e5c-d8ab346b1d21', null, 2),
      ('dd053abd-a5a2-4464-8dee-2b8214100129', 'e39e3442-0140-4855-b2bf-95eba201b353', null, 3),
      ('dd053abd-a5a2-4464-8dee-2b8214100129', '6211c18a-dbdc-4608-b88e-c1cc13f21714', null, 4),
      ('dd053abd-a5a2-4464-8dee-2b8214100129', 'b044edbf-b9ed-4b8a-8930-1cf8ce446625', null, 7),
      ('dd053abd-a5a2-4464-8dee-2b8214100129', '92312668-5214-4d11-a671-78284773c336', null, 8),
      ('dd053abd-a5a2-4464-8dee-2b8214100129', '200ce960-4634-4902-91cc-e850c26b1caf', 14, 9), -- correct
      ('dd053abd-a5a2-4464-8dee-2b8214100129', '3a58485a-18de-4cfb-b5d6-59e7ea7d08d8', null, 10),
      ('dd053abd-a5a2-4464-8dee-2b8214100129', '29f3f700-f8de-4fcd-81d5-343d71e5d9f5', 8, null), -- clear-unsupported
      ('dd053abd-a5a2-4464-8dee-2b8214100129', '307b5172-97f4-4ebd-bc56-ae2a896ce2e2', 13, null), -- clear-unsupported
      ('dd053abd-a5a2-4464-8dee-2b8214100129', '3f8535d6-5e9e-42cf-812d-1f0e1524be84', 7, null), -- clear-unsupported
      -- CLUB · 2014 · Florida Mens Sectionals 2014 (florida-mens-sectionals-2014) · ended 2014-09-07
      ('2e0f4e8f-1a3e-4575-8a37-c50809dcf87c', '6c9126b1-fd85-4e96-ba1c-825e8c5b5634', null, 1),
      ('2e0f4e8f-1a3e-4575-8a37-c50809dcf87c', '45045dd4-171b-4e38-9182-33c9bbe2e00e', null, 2),
      ('2e0f4e8f-1a3e-4575-8a37-c50809dcf87c', '17cc756d-fc35-4fe5-9143-49d4fba831d7', null, 3),
      ('2e0f4e8f-1a3e-4575-8a37-c50809dcf87c', '36a4be83-23a8-4261-907b-e58dc0fa1a16', null, 4),
      ('2e0f4e8f-1a3e-4575-8a37-c50809dcf87c', '3f6e358f-b9ff-4997-83dc-d1391469dc0d', null, 5),
      ('2e0f4e8f-1a3e-4575-8a37-c50809dcf87c', '244e5545-b83b-467a-a572-af6d435a3ce6', null, 6),
      ('2e0f4e8f-1a3e-4575-8a37-c50809dcf87c', 'e5c6e946-4a22-4de6-9d44-015d44e12053', null, 7),
      ('2e0f4e8f-1a3e-4575-8a37-c50809dcf87c', 'a2c72176-eac8-49e0-8ac3-e521213567b9', null, 8),
      -- CLUB · 2014 · Founders Mens Sectionals 2014 (founders-mens-sectionals-2014) · ended 2014-09-07
      ('61808f59-2792-47c6-93ad-bf5ad1db79be', '48120354-6e2d-485c-80ab-a684189cc5f3', null, 1),
      ('61808f59-2792-47c6-93ad-bf5ad1db79be', '057ae28f-6522-47b1-bb16-8da191723229', null, 2),
      ('61808f59-2792-47c6-93ad-bf5ad1db79be', 'e5e69c4c-e2ef-4c9c-ae7d-e79c5258f41d', null, 3),
      ('61808f59-2792-47c6-93ad-bf5ad1db79be', '03ee4d3e-a8e0-42c3-b164-d38cdd9041f8', null, 4),
      ('61808f59-2792-47c6-93ad-bf5ad1db79be', '992ef2dc-0ce2-4202-af85-c183c6e12891', null, 5),
      ('61808f59-2792-47c6-93ad-bf5ad1db79be', '8ba5c899-c698-49d8-9e41-c0cdac306dea', null, 6),
      ('61808f59-2792-47c6-93ad-bf5ad1db79be', 'a381c624-4487-4d7e-adfe-86d3374d9f92', null, 7),
      ('61808f59-2792-47c6-93ad-bf5ad1db79be', '8c59a7ae-febc-4197-bf8e-38592079a09b', null, 8),
      -- CLUB · 2014 · Metro New York Mixed Sectionals (metro-new-york-mixed-sectionals) · ended 2014-09-07
      ('4b8de0b6-6a7e-4fe9-a058-08b32b1d45d5', '86491778-3015-47f5-bdc6-6f2b3676540b', null, 3),
      ('4b8de0b6-6a7e-4fe9-a058-08b32b1d45d5', '5e0a75d5-3849-45ba-b21d-488be5bc8148', 4, null), -- clear-unsupported
      ('4b8de0b6-6a7e-4fe9-a058-08b32b1d45d5', '76bd5f52-ead0-4015-a7c7-19d4b55885f2', 4, null), -- clear-unsupported
      -- CLUB · 2014 · Metro New York Womens Sectionals 2014 (metro-new-york-womens-sectionals-2014) · ended 2014-09-07
      ('413ab990-b6ea-483f-a215-a34f98ca8f06', '45ac82bb-25a4-4a1f-ba36-dc23eac73165', null, 1),
      ('413ab990-b6ea-483f-a215-a34f98ca8f06', '5fa649c2-05c0-43e5-aa6a-980a0468fccf', null, 2),
      ('413ab990-b6ea-483f-a215-a34f98ca8f06', '0e041fdc-2a87-47a3-945d-7a65a621ab79', null, 3),
      -- CLUB · 2014 · Nor Cal Mixed Sectionals (nor-cal-mixed-sectionals) · ended 2014-09-07
      ('aa7b3b01-6e85-4b6c-9fac-74c1278fbc5d', 'dcc84225-1bee-434f-9eea-578d74964f68', null, 1),
      ('aa7b3b01-6e85-4b6c-9fac-74c1278fbc5d', '9575cdb4-55b5-4dbd-abff-04a5f1b3323c', null, 2),
      ('aa7b3b01-6e85-4b6c-9fac-74c1278fbc5d', 'f08a2a69-4376-4d01-8a44-97e4f8603be8', null, 3),
      ('aa7b3b01-6e85-4b6c-9fac-74c1278fbc5d', '6e4453c8-11cd-494c-9a70-64e9a32cbe30', null, 9),
      ('aa7b3b01-6e85-4b6c-9fac-74c1278fbc5d', '75e255b3-1fdb-4308-af57-08e92219f476', null, 10),
      ('aa7b3b01-6e85-4b6c-9fac-74c1278fbc5d', 'bc265807-5982-44b4-9e53-83cde8ac5af7', null, 11),
      ('aa7b3b01-6e85-4b6c-9fac-74c1278fbc5d', '5221cde2-90ec-439c-8653-22dbf43edf92', null, 12),
      ('aa7b3b01-6e85-4b6c-9fac-74c1278fbc5d', 'b23c1803-9cdb-4319-8dd3-67fd89602cbc', null, 13),
      ('aa7b3b01-6e85-4b6c-9fac-74c1278fbc5d', '757f0550-3d2f-43d2-82d9-de64c2e41bc5', null, 14),
      -- CLUB · 2014 · Northwest Plains Men Sectionals 2014 (northwest-plains-men-sectionals-2014) · ended 2014-09-07
      ('2b79d24f-53d9-483b-aaa1-505281b879c4', '6912de33-cd54-4f29-bbfd-c74a255efd2f', null, 1),
      ('2b79d24f-53d9-483b-aaa1-505281b879c4', '60d90696-8156-468d-a549-98aaf91197c7', null, 2),
      ('2b79d24f-53d9-483b-aaa1-505281b879c4', 'cf33e620-4e35-485f-b0a4-782d9e97d60f', null, 3),
      ('2b79d24f-53d9-483b-aaa1-505281b879c4', 'd446f38c-7ce9-4a0f-bb2b-9013498a8c4f', null, 5),
      ('2b79d24f-53d9-483b-aaa1-505281b879c4', '7dca8ba0-466d-4a68-99c5-baedae4c0434', null, 6),
      ('2b79d24f-53d9-483b-aaa1-505281b879c4', 'f944027b-58a5-4ce6-92a8-c550a5ca736c', null, 7),
      ('2b79d24f-53d9-483b-aaa1-505281b879c4', 'fd3b3076-fbe0-4d3e-8300-1e0244ddab01', null, 8),
      -- CLUB · 2014 · Northwest Plains Mixed Sectionals (northwest-plains-mixed-sectionals) · ended 2014-09-07
      ('962b7ddd-34d3-4a93-9247-22f57b892d7b', 'c6d8e4a6-4aed-4740-8125-8e9fddd5b5e9', null, 9),
      ('962b7ddd-34d3-4a93-9247-22f57b892d7b', 'ef60b57a-01e3-478d-a498-f07958d5e9bf', 3, 10), -- correct
      ('962b7ddd-34d3-4a93-9247-22f57b892d7b', '15ad14d7-8625-43ba-9381-fa4dccdf1ba5', 5, null), -- clear-unsupported
      ('962b7ddd-34d3-4a93-9247-22f57b892d7b', '1acbd060-0b5b-4790-a05f-50f143c61a55', 2, null), -- clear-unsupported
      ('962b7ddd-34d3-4a93-9247-22f57b892d7b', '3949b8e7-23a9-43f1-832c-335b80b04581', 12, null), -- clear-unsupported
      ('962b7ddd-34d3-4a93-9247-22f57b892d7b', '3956777e-4076-4d60-bf63-66fd5651059f', 6, null), -- clear-unsupported
      ('962b7ddd-34d3-4a93-9247-22f57b892d7b', '4c59cbfb-12d2-42d3-9944-e7878d49058d', 1, null), -- clear-unsupported
      ('962b7ddd-34d3-4a93-9247-22f57b892d7b', 'a9c9b030-0883-49f8-90c8-75313b08ae12', 3, null), -- clear-unsupported
      ('962b7ddd-34d3-4a93-9247-22f57b892d7b', 'fb7600a5-de6a-420e-a7b6-d7eac897ed9e', 11, null), -- clear-unsupported
      -- CLUB · 2014 · Oregon Mens Sectionals 2014 (oregon-mens-sectionals-2014) · ended 2014-09-07
      ('480df1c9-03db-421f-8c44-82a8c52e2052', 'b2d0d351-4716-43c8-a97f-4618902374c4', null, 1),
      ('480df1c9-03db-421f-8c44-82a8c52e2052', '5ee9b753-8962-4eb4-97d5-8f4195ea3955', null, 2),
      ('480df1c9-03db-421f-8c44-82a8c52e2052', '0a1ce963-71e2-410b-b9c9-b56eeee4a5fe', null, 3),
      -- CLUB · 2014 · Oregon Mixed Sectionals (oregon-mixed-sectionals) · ended 2014-09-07
      ('8bc8dc2b-6fff-4931-943e-746c5947307f', 'af26f2ab-26a9-4e20-abb8-9fbb47ac161c', null, 1),
      ('8bc8dc2b-6fff-4931-943e-746c5947307f', 'b189cfab-c946-49a6-a417-5de586c9c478', null, 2),
      ('8bc8dc2b-6fff-4931-943e-746c5947307f', 'fb006d63-2ed1-47db-97a4-96477fa0e78e', null, 3),
      ('8bc8dc2b-6fff-4931-943e-746c5947307f', 'b04803fd-70f0-475e-8bfc-5a8e383d3b1a', null, 4),
      ('8bc8dc2b-6fff-4931-943e-746c5947307f', '750d3e4b-a83c-4a55-8741-551cd8674373', null, 5),
      -- CLUB · 2014 · Rocky Mountain Club Sectionals 2014 (rocky-mountain-club-sectionals-2014) · ended 2014-09-07
      ('04647356-9732-46dc-99d4-f350a9cf2d75', '673f4b8b-50a2-4430-9775-fd529726d681', null, 1),
      ('04647356-9732-46dc-99d4-f350a9cf2d75', 'b45adf09-f8da-41d2-94d8-ac88ab47f427', null, 2),
      ('04647356-9732-46dc-99d4-f350a9cf2d75', '26433904-0ee7-45f0-992a-6387631627e6', null, 3),
      ('04647356-9732-46dc-99d4-f350a9cf2d75', 'd11a037f-8acc-440c-98d4-06f04f7d0c08', null, 3),
      -- CLUB · 2014 · So Cal Mens Sectionals 2014 (so-cal-mens-sectionals-2014) · ended 2014-09-07
      ('5342d985-9229-46d2-81d8-616fc6a2a621', '56123104-aaad-43da-a5ff-f7e876af154a', null, 1),
      ('5342d985-9229-46d2-81d8-616fc6a2a621', '8b814126-4d0e-4fa1-9d7e-d9c80ee62c31', null, 2),
      ('5342d985-9229-46d2-81d8-616fc6a2a621', 'bef99292-2c42-4ba8-81e5-32acdd779711', null, 4),
      ('5342d985-9229-46d2-81d8-616fc6a2a621', 'ee09e9e4-10b5-4cfa-99f2-4ae7dce5a380', null, 5),
      ('5342d985-9229-46d2-81d8-616fc6a2a621', '03fd87ac-d8ef-4c7c-8398-c44adbf46cdb', null, 6),
      -- CLUB · 2014 · So Cal Mixed Sectionals (so-cal-mixed-sectionals) · ended 2014-09-07
      ('031b1225-3261-4821-b386-9a03f38383d2', '5115ff6c-6d1f-445b-86de-f3cbe60ce78c', null, 1),
      ('031b1225-3261-4821-b386-9a03f38383d2', '0405d2f0-923f-4236-8f8d-a4a501cac582', null, 2),
      ('031b1225-3261-4821-b386-9a03f38383d2', '65c7aee3-2205-4802-a451-52c1b587d638', null, 3),
      ('031b1225-3261-4821-b386-9a03f38383d2', 'e112a4d6-0e05-4cb5-ad32-73839e143d0e', null, 4),
      ('031b1225-3261-4821-b386-9a03f38383d2', '56270c37-4cbb-4b4a-8e34-6ea86d3e2537', null, 5),
      ('031b1225-3261-4821-b386-9a03f38383d2', '4511e409-35e2-424b-80b1-5c5050aa8dd6', null, 7),
      ('031b1225-3261-4821-b386-9a03f38383d2', '0ddccf3f-a4d0-4bec-bc10-20656a6077dc', null, 8),
      ('031b1225-3261-4821-b386-9a03f38383d2', '1ba6d133-11c8-4239-bd32-4deb48d92229', null, 9),
      ('031b1225-3261-4821-b386-9a03f38383d2', '2ace4a7c-d6f9-493b-bde0-f3326b15fc8a', null, 10),
      ('031b1225-3261-4821-b386-9a03f38383d2', '554f78a1-5c76-4c4b-82f4-aa50968d6db9', null, 11),
      ('031b1225-3261-4821-b386-9a03f38383d2', 'b6e6dcaa-7980-4adc-866b-5c2bd4ef068c', null, 12),
      -- CLUB · 2014 · Upstate New York Mixed Sectionals (upstate-new-york-mixed-sectionals) · ended 2014-09-07
      ('ffd3680d-9cad-4353-a643-b2967d07ab29', '376200fc-681e-4e74-861b-4093724ab367', null, 1),
      ('ffd3680d-9cad-4353-a643-b2967d07ab29', '6611ec54-abf7-469d-939d-aa702b3c5e03', null, 2),
      ('ffd3680d-9cad-4353-a643-b2967d07ab29', '2265e6f8-fd4d-4ef5-965a-0dcec6252b39', null, 3),
      -- CLUB · 2014 · Washington Mens Sectionals 2014 (washington-mens-sectionals-2014) · ended 2014-09-07
      ('123b1155-e6bd-46b9-ba36-7dc68194226d', '123ab044-8f74-4340-a64b-ed8cdf2f4d73', null, 1),
      ('123b1155-e6bd-46b9-ba36-7dc68194226d', 'c2a93fce-b341-4140-b47f-49dfa078cee3', null, 2),
      ('123b1155-e6bd-46b9-ba36-7dc68194226d', '81822743-d84e-4747-a014-8d8ee1355cf5', null, 3),
      ('123b1155-e6bd-46b9-ba36-7dc68194226d', 'd90a737b-b825-45ad-8452-4193b44a08cd', null, 4),
      ('123b1155-e6bd-46b9-ba36-7dc68194226d', 'b3bed040-0493-4829-804f-1693d85d9391', null, 5),
      ('123b1155-e6bd-46b9-ba36-7dc68194226d', '4fb8681b-14e9-4d96-ad59-38cd5514a6b6', null, 6),
      ('123b1155-e6bd-46b9-ba36-7dc68194226d', '4c5d3eca-f4ac-42b8-9160-cea58e502292', null, 7),
      ('123b1155-e6bd-46b9-ba36-7dc68194226d', '862e2d83-2033-4eb6-ae05-1323ead89ae9', null, 8),
      -- CLUB · 2014 · Washington Mixed Sectionals (washington-mixed-sectionals) · ended 2014-09-07
      ('38b70a11-d4f8-416b-9528-357046d168e1', '22bf0be1-b42f-442f-a955-734b201a5631', 5, null), -- clear-unsupported
      ('38b70a11-d4f8-416b-9528-357046d168e1', '9d082039-d388-45d2-af1c-210a3c54d3be', 4, null), -- clear-unsupported
      ('38b70a11-d4f8-416b-9528-357046d168e1', 'c787ce6e-923d-4147-9659-cc7dd8c4b022', 6, null), -- clear-unsupported
      ('38b70a11-d4f8-416b-9528-357046d168e1', 'dbd2ca2c-ed08-4619-8f64-aa12750287a5', 2, null), -- clear-unsupported
      ('38b70a11-d4f8-416b-9528-357046d168e1', 'f0bd9e7c-d5da-4890-ad7f-644393c36004', 1, null), -- clear-unsupported
      ('38b70a11-d4f8-416b-9528-357046d168e1', 'ffb0bc4f-8f86-470b-b8e5-d5fac5041b2b', 3, null), -- clear-unsupported
      -- CLUB · 2014 · Washington Womens Sectionals 2014 (washington-womens-sectionals-2014) · ended 2014-09-07
      ('a2f8a424-6070-48b6-9b01-1e392ccfc259', '2d427a7c-7852-4174-837c-7e4d02d5ccc1', null, 1),
      ('a2f8a424-6070-48b6-9b01-1e392ccfc259', 'c3a861d0-d32e-4589-a9bd-577ff26e820e', null, 2),
      ('a2f8a424-6070-48b6-9b01-1e392ccfc259', '17be1163-75a1-4a1a-8d33-8ccfd9a8302b', null, 3),
      ('a2f8a424-6070-48b6-9b01-1e392ccfc259', '1df137f3-792a-4a41-a56b-d21981fc0643', null, 4),
      -- CLUB · 2014 · West Plains Mens Sectionals 2014 (west-plains-mens-sectionals-2014) · ended 2014-09-07
      ('bb70f1d2-534d-46a4-85ed-e19974d30236', '40cc9816-c0de-4e46-ac06-bf3b730435df', null, 1),
      ('bb70f1d2-534d-46a4-85ed-e19974d30236', 'd2b17385-8d4d-415d-8414-f83b74ab346a', null, 2),
      ('bb70f1d2-534d-46a4-85ed-e19974d30236', '55b0f122-e083-4c41-8482-6de96e499e94', null, 3),
      ('bb70f1d2-534d-46a4-85ed-e19974d30236', '0a4e8f26-caff-47f9-91c6-82ca07aa121b', null, 4),
      ('bb70f1d2-534d-46a4-85ed-e19974d30236', 'f0d54f40-1d81-41bf-a727-f08fc2d46a13', null, 5),
      ('bb70f1d2-534d-46a4-85ed-e19974d30236', '95a329f7-81d9-4c14-a73f-23a65b684240', null, 6),
      ('bb70f1d2-534d-46a4-85ed-e19974d30236', '0e51dd97-ade8-42f5-acef-bec9c38ae3b9', null, 7),
      ('bb70f1d2-534d-46a4-85ed-e19974d30236', '69eb7cf2-62c6-4698-994e-edb3b797bc87', null, 8),
      -- CLUB · 2014 · West Plains Mixed Sectionals (west-plains-mixed-sectionals) · ended 2014-09-07
      ('9e1a1f65-df1f-436c-bb24-431b2bf8ba1e', '08dfd24a-c351-40be-9edd-4800cbcf6dbf', 7, null), -- clear-unsupported
      ('9e1a1f65-df1f-436c-bb24-431b2bf8ba1e', '208ed93e-b303-4572-92b8-8a32c6c6f62b', 3, null), -- clear-unsupported
      ('9e1a1f65-df1f-436c-bb24-431b2bf8ba1e', '3572b84d-451c-4831-8b88-e2e7678cc27b', 4, null), -- clear-unsupported
      ('9e1a1f65-df1f-436c-bb24-431b2bf8ba1e', '6fb0d7c8-12e3-43b6-9c54-0f7401405e2f', 6, null), -- clear-unsupported
      ('9e1a1f65-df1f-436c-bb24-431b2bf8ba1e', '7047bd6f-0ee3-4ad9-aab2-39ebc947247a', 2, null), -- clear-unsupported
      ('9e1a1f65-df1f-436c-bb24-431b2bf8ba1e', 'db99a7e1-b90e-4cda-8eb5-e873b5dcf5ca', 5, null), -- clear-unsupported
      -- CLUB · 2014 · Central Plains Mens Sectionals 2014 (central-plains-mens-sectionals-2014) · ended 2014-09-14
      ('a22c9c8a-22d4-41ff-beec-a22e2c854b8c', 'a9201462-6b64-4434-ae9f-25f8d432178b', null, 1),
      ('a22c9c8a-22d4-41ff-beec-a22e2c854b8c', '5683b91c-6dbd-4783-bae5-f67be59e90a9', null, 2),
      ('a22c9c8a-22d4-41ff-beec-a22e2c854b8c', '3e57f773-86d2-41df-956c-c8f95858d6ca', null, 3),
      ('a22c9c8a-22d4-41ff-beec-a22e2c854b8c', 'a2c01d90-9813-443a-9f68-cdb2e8160cd6', null, 4),
      ('a22c9c8a-22d4-41ff-beec-a22e2c854b8c', 'a63962b0-2b90-46b2-9d23-2351ba13e3ce', null, 5),
      ('a22c9c8a-22d4-41ff-beec-a22e2c854b8c', '369bbdf9-8da4-4801-b0c2-69807a9e25b4', null, 6),
      ('a22c9c8a-22d4-41ff-beec-a22e2c854b8c', '25071555-bffe-44f5-b887-a44648584030', null, 7),
      ('a22c9c8a-22d4-41ff-beec-a22e2c854b8c', 'f596e719-a2b7-4fe5-b246-e3fe1538f51e', null, 7),
      ('a22c9c8a-22d4-41ff-beec-a22e2c854b8c', 'b3ce6707-c22e-4f9a-80a2-bd29925ce32d', null, 9),
      ('a22c9c8a-22d4-41ff-beec-a22e2c854b8c', 'ef1bd3df-399c-4f32-91ac-a7bdbd258908', null, 10),
      ('a22c9c8a-22d4-41ff-beec-a22e2c854b8c', 'b39a6d7d-aea4-4062-a83f-c0ed3ebac12e', null, 11),
      ('a22c9c8a-22d4-41ff-beec-a22e2c854b8c', 'a19a0afa-3d4b-4583-8e45-ebd9d4ab895b', null, 12),
      -- CLUB · 2014 · East New England Mixed Sectionals (east-new-england-mixed-sectionals) · ended 2014-09-14
      ('2946b1b9-7efc-478a-b050-09f5a4bbde96', '3f1a4f47-2fe1-43c5-bf4b-4c68c5af1c8d', null, 1),
      ('2946b1b9-7efc-478a-b050-09f5a4bbde96', '2af1d1ee-fa4d-4eb1-a38e-fd3273fc8851', null, 2),
      ('2946b1b9-7efc-478a-b050-09f5a4bbde96', 'e30c56ac-d182-4f42-8b41-da421b01982d', null, 3),
      ('2946b1b9-7efc-478a-b050-09f5a4bbde96', '7f028c1a-fbfd-42c7-bd34-65d329cecb5c', null, 4),
      ('2946b1b9-7efc-478a-b050-09f5a4bbde96', 'c723fd50-c3eb-4040-a535-74377a0f21e8', 3, 5), -- correct
      ('2946b1b9-7efc-478a-b050-09f5a4bbde96', '246294b6-599b-46a3-a887-d652ae0c3e9c', 11, null), -- clear-unsupported
      ('2946b1b9-7efc-478a-b050-09f5a4bbde96', '7acc8b07-f1b6-490f-aa0c-fe83fa58e77e', 2, null), -- clear-unsupported
      ('2946b1b9-7efc-478a-b050-09f5a4bbde96', 'f22a26b7-24e1-4d3b-af7e-144191b32cc6', 12, null), -- clear-unsupported
      -- CLUB · 2014 · East New England Womens Sectionals 2014 (east-new-england-womens-sectionals-2014) · ended 2014-09-14
      ('a25e549d-7301-433f-91fa-ab627e32edc5', '1f41285e-0bb4-4a9e-90b7-40c9126368e1', null, 1),
      ('a25e549d-7301-433f-91fa-ab627e32edc5', 'a8452c93-f579-4df7-92d6-e70fb492de68', null, 2),
      ('a25e549d-7301-433f-91fa-ab627e32edc5', '767e4f12-5999-4afa-bbff-07faf6781b43', null, 3),
      ('a25e549d-7301-433f-91fa-ab627e32edc5', '410add36-f6ea-4021-bf51-f101b7264cf0', null, 4),
      ('a25e549d-7301-433f-91fa-ab627e32edc5', '499562ae-3d40-406b-a629-c66d33ec7590', null, 5),
      ('a25e549d-7301-433f-91fa-ab627e32edc5', 'babb998b-1752-44d2-9c2b-1d8020c6cada', null, 5),
      ('a25e549d-7301-433f-91fa-ab627e32edc5', '6c2446c4-6564-40c9-906d-baf166245577', null, 7),
      ('a25e549d-7301-433f-91fa-ab627e32edc5', '4ae4a730-2e51-421a-a5ad-e4f6c65130e3', null, 8),
      -- CLUB · 2014 · Founders Mixed Sectionals (founders-mixed-sectionals) · ended 2014-09-14
      ('597d4ec0-8b7a-433b-9e68-eccf7e67e14b', '46645dd2-13c2-46ad-b399-b5c354529658', null, 12),
      ('597d4ec0-8b7a-433b-9e68-eccf7e67e14b', 'b47a45bc-3924-41e8-afb8-1383a5e903dd', null, 13),
      -- CLUB · 2014 · North Carolina Mixed Sectionals (north-carolina-mixed-sectionals) · ended 2014-09-14
      ('5de60ac7-8e97-4e81-93e4-a39756b7c97e', '4438ec15-0160-4756-819c-2421093e3570', 3, 1), -- correct
      ('5de60ac7-8e97-4e81-93e4-a39756b7c97e', '7fde89f1-3e56-421e-9c5f-ad347ec4b363', null, 2),
      ('5de60ac7-8e97-4e81-93e4-a39756b7c97e', '123afc8e-8d4c-4aac-ad23-7bb7bac25620', 5, 4), -- correct
      ('5de60ac7-8e97-4e81-93e4-a39756b7c97e', 'ee5c9fa8-ac6c-4409-b58d-e9246daeba96', null, 5),
      ('5de60ac7-8e97-4e81-93e4-a39756b7c97e', '81d09818-323d-483f-960f-5004bc8b6046', null, 6),
      ('5de60ac7-8e97-4e81-93e4-a39756b7c97e', '08c5a06c-7e1d-444b-8b06-ad08557d8642', 2, null), -- clear-unsupported
      ('5de60ac7-8e97-4e81-93e4-a39756b7c97e', '37a3fa9d-42e8-46e9-afbc-903f6dca9538', 7, null), -- clear-unsupported
      ('5de60ac7-8e97-4e81-93e4-a39756b7c97e', '6ea8d696-ee53-45ca-9e1a-95404b4f99c6', 1, null), -- clear-unsupported
      ('5de60ac7-8e97-4e81-93e4-a39756b7c97e', '818acac6-b11c-42da-8a76-3c8bde5a048b', 8, null), -- clear-unsupported
      ('5de60ac7-8e97-4e81-93e4-a39756b7c97e', 'bf6af4fd-05e2-4ce8-920b-50cc14ca7068', 4, null), -- clear-unsupported
      -- CLUB · 2014 · Ozarks Club Sectionals (Men) 2014 (ozarks-club-sectionals-men-2014) · ended 2014-09-14
      ('52daba3a-bdf9-4796-9a87-b9eca452c51f', '70690c80-277b-416b-a2cc-05f61c2686ef', null, 1),
      ('52daba3a-bdf9-4796-9a87-b9eca452c51f', '1808ab02-87c0-464f-a173-9873f7a38cff', null, 2),
      ('52daba3a-bdf9-4796-9a87-b9eca452c51f', '7575a10e-0d27-4207-bfa5-7f2403a377c5', null, 3),
      -- CLUB · 2014 · Upstate New York Mens Sectionals 2014 (upstate-new-york-mens-sectionals-2014) · ended 2014-09-14
      ('5d1a3827-29db-4067-a003-28e0052d6e63', '4dfea715-b432-4cf7-83cc-0cfc3fa05dda', null, 1),
      ('5d1a3827-29db-4067-a003-28e0052d6e63', '6b05fc37-4ef3-4163-a5d5-b4f0e6fa34e1', null, 2),
      -- CLUB · 2014 · West New England Mens Sectionals 2014 (west-new-england-mens-sectionals-2014) · ended 2014-09-14
      ('5bde0fc8-e8a5-49dc-9bf3-c5024e38cfef', '99fe9d72-3e9e-4f3c-836b-be519799f859', null, 1),
      ('5bde0fc8-e8a5-49dc-9bf3-c5024e38cfef', 'b60ef07e-299b-4cd2-a3fd-b9a7a518869e', null, 2),
      -- CLUB · 2014 · West New England Womens Sectionals 2014 (west-new-england-womens-sectionals-2014) · ended 2014-09-14
      ('0211cb2f-6b9a-441c-bb27-f5829eff05d0', 'e186c418-2754-4cdd-a3e3-d8a7368e3749', null, 1),
      ('0211cb2f-6b9a-441c-bb27-f5829eff05d0', 'c1f5d64e-a0e7-419b-a522-7cc303551b97', null, 2),
      ('0211cb2f-6b9a-441c-bb27-f5829eff05d0', 'a9a21c37-a219-4ac4-9b4e-a1a62ebb57ed', null, 3),
      -- CLUB · 2014 · North Central Mixed Regionals (north-central-mixed-regionals) · ended 2014-09-21
      ('15f3cc73-98f2-408f-a75f-85353eed6ac3', 'a9c9b030-0883-49f8-90c8-75313b08ae12', null, 9),
      ('15f3cc73-98f2-408f-a75f-85353eed6ac3', '15ad14d7-8625-43ba-9381-fa4dccdf1ba5', null, 10),
      ('15f3cc73-98f2-408f-a75f-85353eed6ac3', '3956777e-4076-4d60-bf63-66fd5651059f', null, 11),
      ('15f3cc73-98f2-408f-a75f-85353eed6ac3', 'cc23f690-6d55-4a9d-9132-3c95d4375e80', null, 12),
      -- CLUB · 2014 · North Central Womens Regionals 2014 (north-central-womens-regionals-2014) · ended 2014-09-21
      ('6cf587ab-81bd-40e4-946e-2bcd9bd96340', '31ffb754-3380-478b-8cce-8edb7295e075', null, 1),
      ('6cf587ab-81bd-40e4-946e-2bcd9bd96340', '5d1349b8-8593-4ee9-9cf5-416519690a78', null, 2),
      ('6cf587ab-81bd-40e4-946e-2bcd9bd96340', '3e55d3bb-3aa2-4963-8fec-4f77af899e31', null, 3),
      ('6cf587ab-81bd-40e4-946e-2bcd9bd96340', '91809ec5-218f-442b-9ba8-81a69078d2da', null, 5),
      ('6cf587ab-81bd-40e4-946e-2bcd9bd96340', '0f36bb65-28d4-482e-9290-5bbaaf90ad5e', null, 6),
      -- CLUB · 2014 · Northwest Mens Regionals 2014 (northwest-mens-regionals-2014) · ended 2014-09-21
      ('419228b0-5749-4935-9902-a6c4cf47f85d', '57c85e20-8b9f-479a-a228-d925db2ad215', null, 1),
      ('419228b0-5749-4935-9902-a6c4cf47f85d', 'b2d0d351-4716-43c8-a97f-4618902374c4', null, 2),
      ('419228b0-5749-4935-9902-a6c4cf47f85d', 'c2a93fce-b341-4140-b47f-49dfa078cee3', null, 3),
      ('419228b0-5749-4935-9902-a6c4cf47f85d', '123ab044-8f74-4340-a64b-ed8cdf2f4d73', null, 5),
      ('419228b0-5749-4935-9902-a6c4cf47f85d', 'cf8f2cbd-1799-4219-8db3-bd03197cf7d9', null, 6),
      ('419228b0-5749-4935-9902-a6c4cf47f85d', '34c0599e-4882-4766-a122-6911a40d35b3', null, 7),
      ('419228b0-5749-4935-9902-a6c4cf47f85d', '5ee9b753-8962-4eb4-97d5-8f4195ea3955', null, 8),
      -- CLUB · 2014 · Northwest Mixed Regionals (northwest-mixed-regionals) · ended 2014-09-21
      ('a14b53a4-444e-4c8a-9a12-cf1b548c5d1f', 'a794ddec-04c2-480a-8700-cc498c02bea3', null, 1),
      ('a14b53a4-444e-4c8a-9a12-cf1b548c5d1f', '6e39aaea-c44b-4c53-ac3d-71cef05df038', null, 2),
      ('a14b53a4-444e-4c8a-9a12-cf1b548c5d1f', 'b189cfab-c946-49a6-a417-5de586c9c478', null, 3),
      ('a14b53a4-444e-4c8a-9a12-cf1b548c5d1f', '56ca3f37-841d-4b09-8cd7-d791c64c321d', null, 4),
      ('a14b53a4-444e-4c8a-9a12-cf1b548c5d1f', 'fb006d63-2ed1-47db-97a4-96477fa0e78e', null, 5),
      ('a14b53a4-444e-4c8a-9a12-cf1b548c5d1f', 'b8c0b751-6c46-4e23-a1f6-3bb9046343ba', null, 6),
      ('a14b53a4-444e-4c8a-9a12-cf1b548c5d1f', '89b31674-987e-4a43-9c61-9f5cc62d4ae6', null, 7),
      ('a14b53a4-444e-4c8a-9a12-cf1b548c5d1f', 'ffb0bc4f-8f86-470b-b8e5-d5fac5041b2b', null, 8),
      ('a14b53a4-444e-4c8a-9a12-cf1b548c5d1f', 'af26f2ab-26a9-4e20-abb8-9fbb47ac161c', null, 9),
      ('a14b53a4-444e-4c8a-9a12-cf1b548c5d1f', '2c0bb060-3ed5-4ff9-83eb-2c61023822b3', null, 10),
      -- CLUB · 2014 · Northwest Women's Regionals 2014 (northwest-womens-regionals-2014) · ended 2014-09-21
      ('055103f7-f469-44ac-b646-f987a4d0db57', 'fe4978ce-7cc7-4a95-8855-32ee28cc0fa3', null, 1),
      ('055103f7-f469-44ac-b646-f987a4d0db57', '5ba9ce70-bea6-4fcd-aa25-3096098239c7', null, 2),
      ('055103f7-f469-44ac-b646-f987a4d0db57', '73c7bdf1-dfe0-4972-b726-e017356bfceb', null, 3),
      ('055103f7-f469-44ac-b646-f987a4d0db57', '3d169b77-c3c1-4897-b8e9-9965f6d20244', null, 7),
      ('055103f7-f469-44ac-b646-f987a4d0db57', 'f515c53f-0b91-4912-a98c-945ede84e905', null, 8),
      -- CLUB · 2014 · Southwest Men's Regionals 2014 (southwest-mens-regionals-2014) · ended 2014-09-21
      ('b44291af-35bd-4ec2-9dc8-c12fed89a825', '43234c0b-aeee-47de-9d46-33f651d1659a', null, 1),
      ('b44291af-35bd-4ec2-9dc8-c12fed89a825', '7be4befe-7463-4f66-a8ed-f200e0162b13', null, 2),
      ('b44291af-35bd-4ec2-9dc8-c12fed89a825', '56123104-aaad-43da-a5ff-f7e876af154a', null, 3),
      ('b44291af-35bd-4ec2-9dc8-c12fed89a825', '8e330841-876c-4dd0-ab12-0515a31fd135', null, 4),
      ('b44291af-35bd-4ec2-9dc8-c12fed89a825', '8b814126-4d0e-4fa1-9d7e-d9c80ee62c31', null, 7),
      ('b44291af-35bd-4ec2-9dc8-c12fed89a825', 'eb546c9e-2a63-4184-8397-c9b2ffec0c25', null, 8),
      -- CLUB · 2014 · Southwest Mixed Regionals (southwest-mixed-regionals) · ended 2014-09-21
      ('c7a47937-5dad-47aa-a8f2-0a87960c08ff', 'dcc84225-1bee-434f-9eea-578d74964f68', null, 1),
      ('c7a47937-5dad-47aa-a8f2-0a87960c08ff', '5df46054-766a-4ec3-91ff-43d59a3925c5', null, 2),
      ('c7a47937-5dad-47aa-a8f2-0a87960c08ff', '5115ff6c-6d1f-445b-86de-f3cbe60ce78c', null, 3),
      ('c7a47937-5dad-47aa-a8f2-0a87960c08ff', '9575cdb4-55b5-4dbd-abff-04a5f1b3323c', null, 7),
      ('c7a47937-5dad-47aa-a8f2-0a87960c08ff', 'f08a2a69-4376-4d01-8a44-97e4f8603be8', null, 8),
      ('c7a47937-5dad-47aa-a8f2-0a87960c08ff', 'dac8bb36-73bc-46a5-aa3d-c2adf7a00b47', null, 9),
      ('c7a47937-5dad-47aa-a8f2-0a87960c08ff', 'c18c1167-e135-4897-824c-3b609fd7297a', null, 10),
      ('c7a47937-5dad-47aa-a8f2-0a87960c08ff', '65c7aee3-2205-4802-a451-52c1b587d638', null, 11),
      ('c7a47937-5dad-47aa-a8f2-0a87960c08ff', 'eebea432-f2c6-4a7d-83a8-06c46dfac9d1', null, 12),
      ('c7a47937-5dad-47aa-a8f2-0a87960c08ff', '56270c37-4cbb-4b4a-8e34-6ea86d3e2537', null, 15),
      ('c7a47937-5dad-47aa-a8f2-0a87960c08ff', '1ba6d133-11c8-4239-bd32-4deb48d92229', null, 16),
      -- CLUB · 2014 · Southwest Women's Regionals 2014 (southwest-womens-regionals-2014) · ended 2014-09-21
      ('a35f5b65-0849-409b-8f1a-fb8248e81455', 'dd952d14-ce3d-44ed-ad96-7006f7148b11', null, 1),
      ('a35f5b65-0849-409b-8f1a-fb8248e81455', 'cdb0493d-8163-46ae-801b-6619e4b23d14', null, 2),
      ('a35f5b65-0849-409b-8f1a-fb8248e81455', 'e1a33660-955d-4803-b645-bb017ed7e7c7', null, 3),
      -- CLUB · 2014 · Mid-Atlantic Mixed Regionals (mid-atlantic-mixed-regionals) · ended 2014-09-28
      ('413fe8f6-23f8-43b7-a15b-41a9a243f4ae', '57546a17-5629-4dd6-85ee-7adc09b81878', 4, 1), -- correct
      ('413fe8f6-23f8-43b7-a15b-41a9a243f4ae', '6f471c60-8027-4a83-bab1-806ebecaad0d', 1, 2), -- correct
      ('413fe8f6-23f8-43b7-a15b-41a9a243f4ae', '0a2840b1-89d3-4137-a817-d3e92bd29624', null, 3),
      ('413fe8f6-23f8-43b7-a15b-41a9a243f4ae', '430af5aa-d93d-42d0-b18a-ab2ddd5d019d', null, 4),
      ('413fe8f6-23f8-43b7-a15b-41a9a243f4ae', 'ba9d55c9-56e5-4cef-a248-bd6f6d2b6134', null, 6),
      ('413fe8f6-23f8-43b7-a15b-41a9a243f4ae', '5b186bd6-f41f-4b27-9da2-13479e998356', 9, 7), -- correct
      ('413fe8f6-23f8-43b7-a15b-41a9a243f4ae', '6e6885a4-d472-4234-9308-f43622b2b9b1', 13, 8), -- correct
      ('413fe8f6-23f8-43b7-a15b-41a9a243f4ae', 'e679cd1c-58da-41c0-8baf-a64295884c9e', null, 9),
      ('413fe8f6-23f8-43b7-a15b-41a9a243f4ae', '216bbc4e-73e3-4f43-afdd-a11df2c7e64d', null, 10),
      ('413fe8f6-23f8-43b7-a15b-41a9a243f4ae', 'f5d4531e-05f9-4387-bda7-6d9b0705aa0d', null, 11),
      ('413fe8f6-23f8-43b7-a15b-41a9a243f4ae', '4fe9e235-924e-415f-a082-533129392d59', null, 12),
      ('413fe8f6-23f8-43b7-a15b-41a9a243f4ae', '732c9cbd-6d1a-4f82-8953-22e00409a05c', null, 13),
      ('413fe8f6-23f8-43b7-a15b-41a9a243f4ae', '7f5c6c71-4965-49f5-8fda-5803d67eb02f', null, 14),
      ('413fe8f6-23f8-43b7-a15b-41a9a243f4ae', '969673b5-b642-4ed3-af91-ad3601b34a7b', null, 15),
      ('413fe8f6-23f8-43b7-a15b-41a9a243f4ae', '43fd9b7e-3cc7-40a2-a49e-d076af64b17f', null, 16),
      ('413fe8f6-23f8-43b7-a15b-41a9a243f4ae', '960d8407-308a-451f-b551-3b1dbc50914a', 14, null), -- clear-unsupported
      -- CLUB · 2014 · Mid-Atlantic Women's Regionals 2014 (mid-atlantic-womens-regionals-2014) · ended 2014-09-28
      ('6ff5fa03-6f61-49bc-8dce-4655e563b77f', '947a040f-1e33-47fb-8db8-9c0dfdfd9b2f', null, 1),
      ('6ff5fa03-6f61-49bc-8dce-4655e563b77f', 'f3c6e213-5d62-40c5-8490-aaef0aba1229', null, 2),
      ('6ff5fa03-6f61-49bc-8dce-4655e563b77f', 'e0e4f724-a2bd-4fbb-98eb-15d7203c72b2', null, 3),
      -- CLUB · 2014 · Northeast Mixed Regionals (northeast-mixed-regionals) · ended 2014-09-28
      ('2fb2239d-66ee-4afc-819e-9e38dcf7a2db', '3750a858-34c5-4843-9caf-a6b482e8e1ce', null, 1),
      ('2fb2239d-66ee-4afc-819e-9e38dcf7a2db', 'b33587f4-abda-432c-bb90-b5a09f600fd5', null, 2),
      ('2fb2239d-66ee-4afc-819e-9e38dcf7a2db', '376200fc-681e-4e74-861b-4093724ab367', null, 3),
      ('2fb2239d-66ee-4afc-819e-9e38dcf7a2db', '3f1a4f47-2fe1-43c5-bf4b-4c68c5af1c8d', null, 5),
      ('2fb2239d-66ee-4afc-819e-9e38dcf7a2db', '2af1d1ee-fa4d-4eb1-a38e-fd3273fc8851', null, 6),
      ('2fb2239d-66ee-4afc-819e-9e38dcf7a2db', '7f028c1a-fbfd-42c7-bd34-65d329cecb5c', null, 7),
      ('2fb2239d-66ee-4afc-819e-9e38dcf7a2db', 'c080c2ba-d82d-4bdd-83c5-d2611f81b8be', null, 8),
      ('2fb2239d-66ee-4afc-819e-9e38dcf7a2db', 'e805dd43-5321-4e30-8094-64997fb36968', null, 9),
      ('2fb2239d-66ee-4afc-819e-9e38dcf7a2db', 'c723fd50-c3eb-4040-a535-74377a0f21e8', null, 10),
      ('2fb2239d-66ee-4afc-819e-9e38dcf7a2db', 'e30c56ac-d182-4f42-8b41-da421b01982d', null, 11),
      ('2fb2239d-66ee-4afc-819e-9e38dcf7a2db', '6611ec54-abf7-469d-939d-aa702b3c5e03', null, 12),
      -- CLUB · 2014 · Northeast Womens Regionals 2014 (northeast-womens-regionals-2014) · ended 2014-09-28
      ('8c68bfc3-48b0-48b9-abd2-47105793f86a', 'ae51a0f7-2d79-430a-bd85-2d2f82e518f2', null, 1),
      ('8c68bfc3-48b0-48b9-abd2-47105793f86a', 'd8e395d5-3155-437a-9e2a-e03fffe7ba6e', null, 2),
      ('8c68bfc3-48b0-48b9-abd2-47105793f86a', 'aa85846e-21d0-4e2f-98a9-a3a4646bd2f6', null, 3),
      ('8c68bfc3-48b0-48b9-abd2-47105793f86a', 'e186c418-2754-4cdd-a3e3-d8a7368e3749', null, 4),
      ('8c68bfc3-48b0-48b9-abd2-47105793f86a', '1f41285e-0bb4-4a9e-90b7-40c9126368e1', null, 5),
      ('8c68bfc3-48b0-48b9-abd2-47105793f86a', '45ac82bb-25a4-4a1f-ba36-dc23eac73165', null, 6),
      -- CLUB · 2014 · South Central Club Regionals 2014 (south-central-club-regionals-2014) · ended 2014-09-28
      ('2e3b56ea-2862-4f54-8328-cebb83012191', '56fe6d2e-1605-4b83-a47b-53c8eb130e32', null, 1),
      ('2e3b56ea-2862-4f54-8328-cebb83012191', 'a8538b09-606b-4427-9066-275206643c23', null, 1),
      ('2e3b56ea-2862-4f54-8328-cebb83012191', '1bd989ea-35ad-47b9-9b23-6a615f05a3b3', null, 2),
      ('2e3b56ea-2862-4f54-8328-cebb83012191', 'e967d0af-fd3a-4e35-bb35-6958b9a5e3b0', null, 2),
      ('2e3b56ea-2862-4f54-8328-cebb83012191', '673f4b8b-50a2-4430-9775-fd529726d681', null, 3),
      ('2e3b56ea-2862-4f54-8328-cebb83012191', '0e07257e-a223-44f3-b992-f09eff6d3542', null, 4),
      ('2e3b56ea-2862-4f54-8328-cebb83012191', '70cf1e63-dc2a-4103-a795-78dc6b476f8c', null, 5),
      ('2e3b56ea-2862-4f54-8328-cebb83012191', 'a3722d92-80ab-4813-a791-f53aca193f37', null, 6),
      ('2e3b56ea-2862-4f54-8328-cebb83012191', '3dbdcb8d-3090-446d-be09-4e7e04617083', null, 7),
      ('2e3b56ea-2862-4f54-8328-cebb83012191', 'b45adf09-f8da-41d2-94d8-ac88ab47f427', null, 8),
      ('2e3b56ea-2862-4f54-8328-cebb83012191', '1808ab02-87c0-464f-a173-9873f7a38cff', null, 9),
      ('2e3b56ea-2862-4f54-8328-cebb83012191', 'e126b928-d1ec-4494-8dc2-39ce0889f72b', null, 10),
      ('2e3b56ea-2862-4f54-8328-cebb83012191', '70690c80-277b-416b-a2cc-05f61c2686ef', null, 11),
      ('2e3b56ea-2862-4f54-8328-cebb83012191', '56b1e436-9f1d-491e-a802-4359677f3619', null, 12),
      -- CLUB · 2014 · Southeast Mixed Regionals (southeast-mixed-regionals) · ended 2014-09-28
      ('f19ec419-a37c-471d-9c21-30d024e8e600', '5b63e4ea-93e7-4b7b-aafb-1b01168967c9', null, 1),
      ('f19ec419-a37c-471d-9c21-30d024e8e600', '4438ec15-0160-4756-819c-2421093e3570', null, 2),
      ('f19ec419-a37c-471d-9c21-30d024e8e600', '7fde89f1-3e56-421e-9c5f-ad347ec4b363', null, 3),
      ('f19ec419-a37c-471d-9c21-30d024e8e600', '986b4603-300b-4d25-aaff-7ac9650d5977', null, 3),
      -- CLUB · 2014 · Southeast Women's Regionals 2014 (southeast-womens-regionals-2014) · ended 2014-09-28
      ('499284a5-a870-4640-9e28-dd915b74c3ed', '6db06488-b2f3-4f94-be44-d8ec178f6010', null, 1),
      ('499284a5-a870-4640-9e28-dd915b74c3ed', 'c27e71d1-b670-4dbc-8036-f165c193e459', null, 2),
      ('499284a5-a870-4640-9e28-dd915b74c3ed', '6ae618c6-7a31-4202-b088-9a220a7e484b', null, 3),
      -- CLUB · 2015 · ATL Classic 2015 (atl-classic-2015) · ended 2015-06-21
      ('6ec9e466-b315-426f-8958-58d92a245dc2', '4babe25f-0252-4242-847e-79ff161570b7', 11, 12), -- correct
      -- CLUB · 2015 · Northeast Mixed 2015 (northeast-mixed-2015) · ended 2015-06-21
      ('776b1026-56ef-47b3-83b8-070d8284b4db', '92c8bdd7-972b-45b6-9c71-23dcfa978204', null, 9),
      ('776b1026-56ef-47b3-83b8-070d8284b4db', '36fd854c-555c-4827-94c0-c77b8338df52', null, 10),
      -- CLUB · 2015 · Summer Glazed Daze 2015 (summer-glazed-daze-2015) · ended 2015-06-21
      ('b1e03a8a-1349-42b8-8d3e-3b492ce538aa', 'a37af86e-4337-43c7-ba9e-5427e20304b5', 6, 7), -- correct
      ('b1e03a8a-1349-42b8-8d3e-3b492ce538aa', '884ee79a-5319-4024-b1fc-625d83fbc33b', null, 8),
      ('b1e03a8a-1349-42b8-8d3e-3b492ce538aa', 'd6512c9c-0e93-4990-8de7-deb1e7e6e509', 5, null), -- clear-unsupported
      -- CLUB · 2015 · Swan Boat 2015 (swan-boat-2015) · ended 2015-07-12
      ('ce1306be-0d4a-40ff-81e0-3d5d06b4ea40', 'bf89123e-f76b-462b-89fd-b271f18198eb', 3, 4), -- correct
      -- CLUB · 2015 · Motown Throwdown 2015 (motown-throwdown-2015) · ended 2015-07-26
      ('8a8d7f9b-60d1-4cd9-ab5f-2df90994b159', '29f3f700-f8de-4fcd-81d5-343d71e5d9f5', null, 9),
      ('8a8d7f9b-60d1-4cd9-ab5f-2df90994b159', '0d3db5ec-41f7-4698-a916-2bb59efd5c09', null, 10),
      -- CLUB · 2015 · Heavyweights 2015 (heavyweights-2015) · ended 2015-08-09
      ('82ff59db-648a-46d4-904f-bd076f3295e7', '56270c37-4cbb-4b4a-8e34-6ea86d3e2537', 7, 8), -- correct
      ('82ff59db-648a-46d4-904f-bd076f3295e7', '46ff5c05-85e1-4a93-8438-205ac0925e3f', 11, 12), -- correct
      -- CLUB · 2015 · Chowdafest 2015 (chowdafest-2015) · ended 2015-08-16
      ('6dab6d0f-8a2a-42d2-8945-8a243605ff07', 'ce35982a-91ce-4f99-905e-9b95ee35bdcb', 7, 8), -- correct
      -- CLUB · 2015 · Cooler Classic 27 (cooler-classic-27) · ended 2015-08-16
      ('0fc4ab50-eb42-405e-80ea-d9fe864e1ca4', '67e78b88-450c-45aa-b17e-aa9249b08646', 11, 12), -- correct
      ('0fc4ab50-eb42-405e-80ea-d9fe864e1ca4', '3956777e-4076-4d60-bf63-66fd5651059f', null, 13),
      ('0fc4ab50-eb42-405e-80ea-d9fe864e1ca4', 'aab92f0f-a065-4862-80a7-d4bfec56e966', null, 14),
      ('0fc4ab50-eb42-405e-80ea-d9fe864e1ca4', '08dfd24a-c351-40be-9edd-4800cbcf6dbf', 15, 16), -- correct
      ('0fc4ab50-eb42-405e-80ea-d9fe864e1ca4', '0d3db5ec-41f7-4698-a916-2bb59efd5c09', 19, 20), -- correct
      ('0fc4ab50-eb42-405e-80ea-d9fe864e1ca4', 'fd10c39c-fcdb-4be6-92c9-133e6729770b', null, 21),
      ('0fc4ab50-eb42-405e-80ea-d9fe864e1ca4', 'd353b67d-76ad-46c6-9ada-9f5547826a6e', null, 22),
      ('0fc4ab50-eb42-405e-80ea-d9fe864e1ca4', '626b22c4-c546-4455-9e8c-87f85b699923', 23, 24), -- correct
      -- CLUB · 2015 · HoDown XIX (hodown-xix) · ended 2015-08-16
      ('58d170bd-aabd-4943-aea1-a5320f34a682', 'd889048e-4916-4fb5-b6c8-a8f1c5c550be', null, 3),
      ('58d170bd-aabd-4943-aea1-a5320f34a682', 'd6512c9c-0e93-4990-8de7-deb1e7e6e509', null, 4),
      ('58d170bd-aabd-4943-aea1-a5320f34a682', '29f3f700-f8de-4fcd-81d5-343d71e5d9f5', null, 13),
      ('58d170bd-aabd-4943-aea1-a5320f34a682', '222940ba-a88f-4022-9b1f-8f56bf259049', null, 14),
      ('58d170bd-aabd-4943-aea1-a5320f34a682', 'ba933a4d-363c-4cbd-a460-e6dcdc528b98', null, 15),
      -- CLUB · 2015 · Big Sky Men's Sectionals 2015 (big-sky-mens-sectionals-2015) · ended 2015-08-30
      ('5340d737-71c7-4f68-8450-07ea42709d5a', 'c3b7f9ab-4f84-40bd-b4db-83e15a3356b1', null, 1),
      ('5340d737-71c7-4f68-8450-07ea42709d5a', '2fd34a19-1bf2-4f53-b0d3-f33a6302e5cf', null, 2),
      ('5340d737-71c7-4f68-8450-07ea42709d5a', '061594cd-2167-496f-a92f-5ed95945456f', null, 3),
      ('5340d737-71c7-4f68-8450-07ea42709d5a', '55735ff2-9ad3-4f7b-946f-cb6ed8bc4fb8', null, 4),
      ('5340d737-71c7-4f68-8450-07ea42709d5a', 'c1a596f0-1dce-4a03-bb33-14a66e13e733', null, 5),
      ('5340d737-71c7-4f68-8450-07ea42709d5a', '017bbf3f-1a44-46f8-b252-6bf063898050', null, 6),
      ('5340d737-71c7-4f68-8450-07ea42709d5a', '96b1a807-034f-46f4-b7ec-f8e21a31b46f', null, 7),
      -- CLUB · 2015 · Capital Men's Sectionals 2015 (capital-mens-sectionals-2015) · ended 2015-08-30
      ('8a002d5b-c904-4071-9352-48c49bbb1e74', '0f18c40e-d359-48c4-9182-33d18035aba8', null, 1),
      ('8a002d5b-c904-4071-9352-48c49bbb1e74', '5528999f-148c-47b7-ac95-a410834e95f2', null, 2),
      ('8a002d5b-c904-4071-9352-48c49bbb1e74', '3d872915-fcf5-4b99-9282-a8e652d6a5df', null, 3),
      ('8a002d5b-c904-4071-9352-48c49bbb1e74', '37356160-2f53-46f4-b994-1a05d58419dc', null, 4),
      ('8a002d5b-c904-4071-9352-48c49bbb1e74', '7b830a5c-e0e0-440d-b978-b029efada88d', null, 5),
      ('8a002d5b-c904-4071-9352-48c49bbb1e74', '45cc74db-e578-4c9c-ab05-d724daf4b517', null, 6),
      ('8a002d5b-c904-4071-9352-48c49bbb1e74', 'ee38d518-a484-4a0f-a963-0048656469a7', null, 7),
      ('8a002d5b-c904-4071-9352-48c49bbb1e74', '9ed3dc08-116f-4c70-9c04-a113fff16867', null, 8),
      ('8a002d5b-c904-4071-9352-48c49bbb1e74', 'e04173cb-271d-4bd3-8009-2ffac2b071e3', null, 9),
      ('8a002d5b-c904-4071-9352-48c49bbb1e74', '8519faab-610b-4910-b60d-2d9c4166d30c', null, 10),
      ('8a002d5b-c904-4071-9352-48c49bbb1e74', '6bd34a43-86e8-46cb-8ead-4ab3322c2bcc', null, 11),
      ('8a002d5b-c904-4071-9352-48c49bbb1e74', 'ab86ad1c-1a48-48f8-bcdd-37e38834b62f', null, 12),
      -- CLUB · 2015 · Capital Women's Sectionals 2015 (capital-womens-sectionals-2015) · ended 2015-08-30
      ('375c2323-2e41-4e69-851c-c4ad904b5a15', 'ae77654d-acbe-41c9-ab36-775b13eeffd0', null, 1),
      ('375c2323-2e41-4e69-851c-c4ad904b5a15', 'f359fd9e-5ec8-413f-9d42-9b36c6e2a00a', null, 2),
      ('375c2323-2e41-4e69-851c-c4ad904b5a15', '637f0381-e0fc-4b04-b031-44a1882f1bca', null, 3),
      ('375c2323-2e41-4e69-851c-c4ad904b5a15', '6c17cdce-ca9b-4ea3-a597-047e7d2b57d7', null, 4),
      -- CLUB · 2015 · Central Plains Men's Sectionals 2015 (central-plains-mens-sectionals-2015) · ended 2015-08-30
      ('4a528d4d-812b-407b-b48f-1a8a73bf2379', '943c6940-315e-48f9-babc-0f9c729640b1', null, 1),
      ('4a528d4d-812b-407b-b48f-1a8a73bf2379', '04253594-7be9-4b90-836e-5611a7b61934', null, 2),
      ('4a528d4d-812b-407b-b48f-1a8a73bf2379', 'b8c3a0fc-0551-418e-a221-22c687512bb8', null, 7),
      ('4a528d4d-812b-407b-b48f-1a8a73bf2379', 'dccbe529-0d96-4fbc-9cef-e000a0949078', null, 7),
      ('4a528d4d-812b-407b-b48f-1a8a73bf2379', '48156129-63d0-4942-b7e3-20e000b79ca1', null, 11),
      ('4a528d4d-812b-407b-b48f-1a8a73bf2379', 'b6a16c76-0d66-4732-8f7f-0f41327b441e', null, 11),
      -- CLUB · 2015 · Central Plains Mixed Sectionals 2015 (central-plains-mixed-sectionals-2015) · ended 2015-08-30
      ('3e303076-abd8-443a-b114-9b200a3971ff', 'b163f626-c5bf-4fc8-983c-20d40e249107', null, 1),
      ('3e303076-abd8-443a-b114-9b200a3971ff', '6f549f08-dafb-4b05-bae7-9f444c719471', null, 2),
      ('3e303076-abd8-443a-b114-9b200a3971ff', '1287989e-4bde-434a-b818-495f51602726', null, 3),
      ('3e303076-abd8-443a-b114-9b200a3971ff', '6722a793-ec98-40bd-8344-8828fd1f3ca9', null, 4),
      ('3e303076-abd8-443a-b114-9b200a3971ff', 'aab92f0f-a065-4862-80a7-d4bfec56e966', null, 5),
      ('3e303076-abd8-443a-b114-9b200a3971ff', 'b934aa1e-bad1-47b0-9069-42a55cdd6b9c', null, 6),
      ('3e303076-abd8-443a-b114-9b200a3971ff', 'd685c74b-4a69-4375-9d9f-4f76febcdcbb', null, 7),
      ('3e303076-abd8-443a-b114-9b200a3971ff', 'ed3c7e76-15f3-4407-8410-d3c991508635', null, 7),
      -- CLUB · 2015 · East Coast Men's Sectionals 2015 (east-coast-mens-sectionals-2015) · ended 2015-08-30
      ('8897aad8-a9e5-441c-8d7f-dc8f555da22c', '953236b1-7ca3-4094-9834-e51e2e0c3976', null, 1),
      ('8897aad8-a9e5-441c-8d7f-dc8f555da22c', '4f478321-7258-43c3-9ba9-fece5562c04f', null, 2),
      ('8897aad8-a9e5-441c-8d7f-dc8f555da22c', '0e231804-beb1-40fe-bdaf-146da8c4187b', null, 3),
      ('8897aad8-a9e5-441c-8d7f-dc8f555da22c', '9119e7dc-776d-433a-a6e6-ff91b37b3416', null, 4),
      ('8897aad8-a9e5-441c-8d7f-dc8f555da22c', '95e81123-4485-4960-9582-22b6d594d02f', null, 5),
      ('8897aad8-a9e5-441c-8d7f-dc8f555da22c', 'b13045d2-8ea8-4ae5-ae2f-852b43011806', null, 6),
      -- CLUB · 2015 · East New England Mixed Sectionals 2015 (east-new-england-mixed-sectionals-2015) · ended 2015-08-30
      ('1d2b05ff-e82b-4795-b69f-a0b85c8774a1', '0eb79c99-c705-482f-9501-2998eff9b1a9', null, 11),
      ('1d2b05ff-e82b-4795-b69f-a0b85c8774a1', '80a05525-7c19-483b-b0ba-c0d5589206be', null, 12),
      ('1d2b05ff-e82b-4795-b69f-a0b85c8774a1', '6c09f037-e2fc-44a3-b418-ce14931b103d', null, 13),
      ('1d2b05ff-e82b-4795-b69f-a0b85c8774a1', '6c28c098-b8df-4740-a3b4-000a0b8db36e', null, 14),
      -- CLUB · 2015 · East New England Women's Sectionals 2015 (east-new-england-womens-sectionals-2015) · ended 2015-08-30
      ('7dcbc52c-4aa6-44fc-b89b-0ceea5d2eea6', 'b74dc542-0865-4898-a7ba-d7b0193e5e76', null, 1),
      ('7dcbc52c-4aa6-44fc-b89b-0ceea5d2eea6', '13400cbf-e9f0-45f7-8889-14160363cc55', null, 2),
      ('7dcbc52c-4aa6-44fc-b89b-0ceea5d2eea6', 'b95f97fd-7bc4-4170-ad87-557100dd42b9', null, 3),
      ('7dcbc52c-4aa6-44fc-b89b-0ceea5d2eea6', '4f51578d-4952-4820-a625-223b910661fc', null, 4),
      ('7dcbc52c-4aa6-44fc-b89b-0ceea5d2eea6', '513d57ad-9ebf-4dc4-88bf-4e2bb16010ea', null, 5),
      -- CLUB · 2015 · East Plains Women's Sectionals 2015 (east-plains-womens-sectionals-2015) · ended 2015-08-30
      ('16420101-62e4-440f-9651-2304a730ae35', 'bd894187-e5a4-490e-b5a9-efa3bb5152bf', null, 2),
      ('16420101-62e4-440f-9651-2304a730ae35', 'b52eac9a-550b-4c00-a668-6e1e530f5f39', null, 3),
      ('16420101-62e4-440f-9651-2304a730ae35', '647de34b-7109-4ead-9107-a18c36791528', null, 4),
      ('16420101-62e4-440f-9651-2304a730ae35', '3678d650-85f3-461e-92e7-54976849dae7', null, 5),
      -- CLUB · 2015 · Founders Men's Sectionals 2015 (founders-mens-sectionals-2015) · ended 2015-08-30
      ('349cbc0b-0ef1-44c7-8b9c-42ce4541cac1', '9dbb564b-f179-4c52-b6b9-0bdab703bf27', null, 1),
      ('349cbc0b-0ef1-44c7-8b9c-42ce4541cac1', 'c140f04f-5bef-44db-800f-766d97698a27', null, 2),
      ('349cbc0b-0ef1-44c7-8b9c-42ce4541cac1', '6cf5c356-eee4-4475-8771-ef07ff2e40a4', null, 3),
      ('349cbc0b-0ef1-44c7-8b9c-42ce4541cac1', 'dbe2372a-0b81-40ba-ba70-55c6aa3be029', null, 4),
      ('349cbc0b-0ef1-44c7-8b9c-42ce4541cac1', '5c1fec45-3789-4efb-8b1c-e5ba79cdcb57', null, 5),
      ('349cbc0b-0ef1-44c7-8b9c-42ce4541cac1', '644fb4ea-db8b-4e19-b4cc-8fa07809fddf', null, 6),
      ('349cbc0b-0ef1-44c7-8b9c-42ce4541cac1', '79179504-7213-4743-a1b8-2a88a9389544', null, 7),
      ('349cbc0b-0ef1-44c7-8b9c-42ce4541cac1', '879a873b-1668-470d-a09e-f7067e7d9cf5', null, 8),
      ('349cbc0b-0ef1-44c7-8b9c-42ce4541cac1', '214ec4c1-9b67-4699-8572-68d5851c5deb', null, 9),
      ('349cbc0b-0ef1-44c7-8b9c-42ce4541cac1', 'aea1f03a-b33c-4390-937f-680990a56213', null, 10),
      -- CLUB · 2015 · Founders Mixed Sectionals 2015 (founders-mixed-sectionals-2015) · ended 2015-08-30
      ('28fd70f2-fb1c-41f9-8ee5-7bcfdd4356ed', 'f5d4531e-05f9-4387-bda7-6d9b0705aa0d', null, 1),
      ('28fd70f2-fb1c-41f9-8ee5-7bcfdd4356ed', 'bf77a85e-1750-4a49-a9a7-523b9d444db5', null, 2),
      ('28fd70f2-fb1c-41f9-8ee5-7bcfdd4356ed', '281d52da-b98f-4fc6-96b8-07c6f8e3bf37', null, 3),
      ('28fd70f2-fb1c-41f9-8ee5-7bcfdd4356ed', 'e7aa8fd1-8804-4e14-a697-a6a06cb43f2a', null, 4),
      ('28fd70f2-fb1c-41f9-8ee5-7bcfdd4356ed', '895c8831-c96b-4b38-b202-769ef10a4e2d', null, 5),
      ('28fd70f2-fb1c-41f9-8ee5-7bcfdd4356ed', '1ff8e51b-2ed9-45a4-a2c0-6dbbc8e150fc', null, 6),
      ('28fd70f2-fb1c-41f9-8ee5-7bcfdd4356ed', '08c43351-5b22-45ca-a80e-07c007c77110', null, 7),
      ('28fd70f2-fb1c-41f9-8ee5-7bcfdd4356ed', '38c3939a-8cf9-4e3d-9c23-9e113f786abb', null, 8),
      ('28fd70f2-fb1c-41f9-8ee5-7bcfdd4356ed', '41c1c1e1-b0c1-41da-a53d-10a0120f7c82', null, 9),
      ('28fd70f2-fb1c-41f9-8ee5-7bcfdd4356ed', '92c8bdd7-972b-45b6-9c71-23dcfa978204', null, 10),
      -- CLUB · 2015 · Founders Women's Sectionals 2015 (founders-womens-sectionals-2015) · ended 2015-08-30
      ('aa452ba8-ff93-49d9-936a-8e4623ebdbe3', 'd37295f3-0f77-4bc5-9bf8-30a7f6c7f92a', null, 1),
      ('aa452ba8-ff93-49d9-936a-8e4623ebdbe3', '90f7a08c-5c53-4e72-9e31-19137db39422', null, 2),
      ('aa452ba8-ff93-49d9-936a-8e4623ebdbe3', '16b87ef7-51b0-44c6-88cb-947118216b2d', null, 3),
      ('aa452ba8-ff93-49d9-936a-8e4623ebdbe3', '485a516b-7970-4540-999a-7e28e89ae387', null, 4),
      -- CLUB · 2015 · Metro New York Men's Sectionals 2015 (metro-new-york-mens-sectionals-2015) · ended 2015-08-30
      ('2c365e55-804d-4bec-ae72-147ae3c22281', 'e93615b6-1175-4b67-874b-84524d5fa54f', null, 1),
      ('2c365e55-804d-4bec-ae72-147ae3c22281', 'cac9f5e1-9b19-4a9b-832a-fb2763359b81', null, 2),
      ('2c365e55-804d-4bec-ae72-147ae3c22281', '86d593f5-278b-4e1d-866a-caad66cd8e9d', null, 3),
      ('2c365e55-804d-4bec-ae72-147ae3c22281', '0f9e17ba-822f-48bf-bec7-1de66a6c6c02', null, 4),
      ('2c365e55-804d-4bec-ae72-147ae3c22281', 'd94d3f06-51f1-4376-953d-23cf1100346f', null, 7),
      ('2c365e55-804d-4bec-ae72-147ae3c22281', '3476c8a0-3c74-4ac1-8c4e-ef6a101b66d1', null, 8),
      -- CLUB · 2015 · Metro New York Mixed Sectionals 2015 (metro-new-york-mixed-sectionals-2015) · ended 2015-08-30
      ('e265ede3-3d03-4a12-9bc4-ec04ce3a3ced', 'e805dd43-5321-4e30-8094-64997fb36968', null, 1),
      ('e265ede3-3d03-4a12-9bc4-ec04ce3a3ced', '1fb4d105-5f6d-4504-aaa5-547c395e057e', null, 2),
      ('e265ede3-3d03-4a12-9bc4-ec04ce3a3ced', '87f538d2-d794-494e-8f2b-f7653980fd27', null, 3),
      ('e265ede3-3d03-4a12-9bc4-ec04ce3a3ced', '76bd5f52-ead0-4015-a7c7-19d4b55885f2', null, 4),
      ('e265ede3-3d03-4a12-9bc4-ec04ce3a3ced', 'c41e7e2d-daef-4c4f-8e1b-28e5fcaf8901', null, 5),
      ('e265ede3-3d03-4a12-9bc4-ec04ce3a3ced', 'a3f897e7-f5b8-41a8-b8cf-a329025f014a', null, 6),
      ('e265ede3-3d03-4a12-9bc4-ec04ce3a3ced', 'a1763ab5-4ae6-4914-a808-8ff1b588f854', null, 7),
      ('e265ede3-3d03-4a12-9bc4-ec04ce3a3ced', 'cfc2b396-1ede-49db-a96c-a355a81cd4b7', null, 7),
      -- CLUB · 2015 · Metro New York Women's Sectionals 2015 (metro-new-york-womens-sectionals-2015) · ended 2015-08-30
      ('24a2c4b0-f75f-477a-ad8c-e155b6d35e9b', 'd60c638b-8be7-400b-91d5-59720530886a', null, 1),
      ('24a2c4b0-f75f-477a-ad8c-e155b6d35e9b', '28014d43-c225-4e4d-a907-fdf4e64e8431', null, 2),
      ('24a2c4b0-f75f-477a-ad8c-e155b6d35e9b', '29640190-20d5-467e-989a-acd8d5f6de8c', null, 3),
      ('24a2c4b0-f75f-477a-ad8c-e155b6d35e9b', '2f2fcbf2-b39b-4937-8be9-5e0c19f887ab', null, 4),
      -- CLUB · 2015 · Nor Cal Mixed Sectionals 2015 (nor-cal-mixed-sectionals-2015) · ended 2015-08-30
      ('964f0375-9605-4dee-a894-795683bee9e3', '0d96e182-5694-45c3-86ae-2360212f011c', null, 1),
      ('964f0375-9605-4dee-a894-795683bee9e3', 'f08a2a69-4376-4d01-8a44-97e4f8603be8', null, 2),
      ('964f0375-9605-4dee-a894-795683bee9e3', 'da574ef7-ba96-4a22-b686-7bce63dafa19', null, 3),
      ('964f0375-9605-4dee-a894-795683bee9e3', '04f7af5b-4306-4c21-903b-8f5151f0b6e3', null, 4),
      ('964f0375-9605-4dee-a894-795683bee9e3', 'c18c1167-e135-4897-824c-3b609fd7297a', null, 5),
      ('964f0375-9605-4dee-a894-795683bee9e3', '5e55a685-dd7f-40c8-9491-f67b701ad067', null, 6),
      ('964f0375-9605-4dee-a894-795683bee9e3', '9575cdb4-55b5-4dbd-abff-04a5f1b3323c', null, 7),
      ('964f0375-9605-4dee-a894-795683bee9e3', 'eebea432-f2c6-4a7d-83a8-06c46dfac9d1', null, 8),
      ('964f0375-9605-4dee-a894-795683bee9e3', '6e4453c8-11cd-494c-9a70-64e9a32cbe30', null, 9),
      ('964f0375-9605-4dee-a894-795683bee9e3', '69c3ac92-a4fe-4789-875b-b07cf3587b46', null, 10),
      -- CLUB · 2015 · Northwest Plains Men's Sectionals 2015 (northwest-plains-mens-sectionals-2015) · ended 2015-08-30
      ('2f05895f-775f-4253-a5cf-45d0194649f4', '9ae443cb-fa87-4938-9c6c-ec6fc083b945', null, 1),
      ('2f05895f-775f-4253-a5cf-45d0194649f4', '2b3c7976-c19f-4939-85c6-d15618bf86a4', null, 2),
      ('2f05895f-775f-4253-a5cf-45d0194649f4', 'b2f27874-1eb1-4d06-ba88-b6f2ddc0c46d', null, 3),
      ('2f05895f-775f-4253-a5cf-45d0194649f4', 'dd5e0c06-9193-4218-ad82-4fb24d0e7ba9', null, 3),
      ('2f05895f-775f-4253-a5cf-45d0194649f4', 'a0f396b0-b79d-4140-9a93-c5633c4c91ce', null, 5),
      ('2f05895f-775f-4253-a5cf-45d0194649f4', '65da5b0d-3646-4bea-a63a-538949113d98', null, 6),
      ('2f05895f-775f-4253-a5cf-45d0194649f4', '134cc785-5c9e-45b0-a4bd-ede8f269811b', null, 7),
      ('2f05895f-775f-4253-a5cf-45d0194649f4', '7b7fc03b-4e2b-4074-a3cb-5bc558861626', null, 8),
      -- CLUB · 2015 · Oregon Men's Sectionals 2015 (oregon-mens-sectionals-2015) · ended 2015-08-30
      ('c71a263b-4282-4743-8af5-dd38fefa39a7', '631725ef-d585-4a80-803c-68efe2415e94', null, 1),
      ('c71a263b-4282-4743-8af5-dd38fefa39a7', '5870feda-2b69-4833-ae7f-795fa72ce0c0', null, 2),
      -- CLUB · 2015 · Oregon Mixed Sectionals 2015 (oregon-mixed-sectionals-2015) · ended 2015-08-30
      ('ab359d82-0466-49b7-a593-870536303277', '413cd000-bf3a-4b93-acc3-ec45f9a03796', null, 1),
      ('ab359d82-0466-49b7-a593-870536303277', '7598202a-8446-48fc-a0d5-409b4820ba24', null, 2),
      ('ab359d82-0466-49b7-a593-870536303277', 'b189cfab-c946-49a6-a417-5de586c9c478', null, 3),
      ('ab359d82-0466-49b7-a593-870536303277', 'e9b6b966-71db-4495-b025-7e651361a06b', null, 4),
      ('ab359d82-0466-49b7-a593-870536303277', '26fc9d3a-dc85-4c96-96d9-af7db8ca3e37', null, 5),
      ('ab359d82-0466-49b7-a593-870536303277', '5426882d-2929-448f-917a-20788c1e1aa6', null, 5),
      -- CLUB · 2015 · Rocky Mountain Men's Sectionals 2015 (rocky-mountain-mens-sectionals-2015) · ended 2015-08-30
      ('3ba67ec1-d3aa-41db-8667-eff5e078b815', '97121a7c-9a20-4098-b7aa-17bd9b33e305', null, 1),
      ('3ba67ec1-d3aa-41db-8667-eff5e078b815', 'dfc9cca0-d366-4557-a404-89ca09ecf877', null, 2),
      -- CLUB · 2015 · Rocky Mountain Mixed Sectionals (rocky-mountain-mixed-sectionals) · ended 2015-08-30
      ('5841cfdc-6127-44da-a1b1-dcf4bfe7fc3a', 'e64af073-3a7a-4811-83eb-c749b6f21762', null, 1),
      ('5841cfdc-6127-44da-a1b1-dcf4bfe7fc3a', '8a9c52ca-d31e-437e-a079-8447f4be4291', null, 2),
      ('5841cfdc-6127-44da-a1b1-dcf4bfe7fc3a', 'a7fd3983-ead4-4aa6-8486-cef2f81007df', null, 3),
      ('5841cfdc-6127-44da-a1b1-dcf4bfe7fc3a', 'fc54f7e8-25fd-47af-af4f-542c93e659f1', null, 4),
      ('5841cfdc-6127-44da-a1b1-dcf4bfe7fc3a', 'c7afb98f-8f20-4079-a2e3-6677e7e36999', null, 5),
      ('5841cfdc-6127-44da-a1b1-dcf4bfe7fc3a', 'f852b598-6b97-4c74-aea4-54bcfee3fcd8', null, 6),
      ('5841cfdc-6127-44da-a1b1-dcf4bfe7fc3a', 'f29f832d-1e43-418c-89d7-cda75a79c6d2', null, 7),
      ('5841cfdc-6127-44da-a1b1-dcf4bfe7fc3a', '7dfc1ade-91ee-4b17-ad1e-501518c82977', null, 8),
      -- CLUB · 2015 · So Cal Men's Sectionals 2015 (so-cal-mens-sectionals-2015) · ended 2015-08-30
      ('1f345970-be92-4a59-bc8d-9c178f389e15', 'd8fe75a2-dfa8-4fc9-9e4d-63f726af7951', null, 1),
      ('1f345970-be92-4a59-bc8d-9c178f389e15', '661a69ec-2883-4350-8e04-39bbe8df9b11', null, 2),
      ('1f345970-be92-4a59-bc8d-9c178f389e15', '20272836-d966-421b-bb51-0afadd3c0c79', null, 3),
      ('1f345970-be92-4a59-bc8d-9c178f389e15', 'cc15efd2-6be2-41fc-8827-0539725c6a20', null, 4),
      -- CLUB · 2015 · So Cal Mixed Sectionals 2015 (so-cal-mixed-sectionals-2015) · ended 2015-08-30
      ('47f7b382-ca5f-483f-ab2d-5aaca3884cb8', '9666b00f-6d5b-4e28-b664-3d1a33655e13', null, 1),
      ('47f7b382-ca5f-483f-ab2d-5aaca3884cb8', '7055e242-a716-413a-b944-73727ac86852', null, 2),
      ('47f7b382-ca5f-483f-ab2d-5aaca3884cb8', '56270c37-4cbb-4b4a-8e34-6ea86d3e2537', null, 3),
      ('47f7b382-ca5f-483f-ab2d-5aaca3884cb8', '2729d79b-81db-4fbb-9f7b-06b18ba18f40', null, 4),
      ('47f7b382-ca5f-483f-ab2d-5aaca3884cb8', '4511e409-35e2-424b-80b1-5c5050aa8dd6', null, 5),
      ('47f7b382-ca5f-483f-ab2d-5aaca3884cb8', '4cf569b7-595b-43ee-a1a0-a14dc2980ac6', null, 6),
      ('47f7b382-ca5f-483f-ab2d-5aaca3884cb8', '6fee0bdb-704b-462c-ae2d-0858d13d11f5', null, 7),
      ('47f7b382-ca5f-483f-ab2d-5aaca3884cb8', '059485fc-6e7a-4d31-8d21-ed2f5887681e', null, 8),
      ('47f7b382-ca5f-483f-ab2d-5aaca3884cb8', '96ae89e7-e3c0-4dc8-81b9-c63398bed329', null, 9),
      ('47f7b382-ca5f-483f-ab2d-5aaca3884cb8', '92f41c85-cea5-41be-b2c3-89f4baf33211', null, 10),
      ('47f7b382-ca5f-483f-ab2d-5aaca3884cb8', '0e3ce1a8-a383-4fb0-a2ca-7bf1352d36c1', null, 11),
      ('47f7b382-ca5f-483f-ab2d-5aaca3884cb8', 'c1e2f62a-4984-4ac6-a128-57bb8b6e0fa1', null, 12),
      -- CLUB · 2015 · So Cal Women's Sectionals 2015 (so-cal-womens-sectionals-2015) · ended 2015-08-30
      ('5cdf2d14-f40d-4e90-8bc9-5e2e0c373984', '29637531-1587-442d-a557-1649a2d562d7', null, 1),
      ('5cdf2d14-f40d-4e90-8bc9-5e2e0c373984', 'c463691f-5fa2-4d31-b0c3-1713dc4f1dba', null, 2),
      ('5cdf2d14-f40d-4e90-8bc9-5e2e0c373984', '6c34be44-5496-4dfc-8e2d-44ad118e51e9', null, 3),
      ('5cdf2d14-f40d-4e90-8bc9-5e2e0c373984', 'f84dd56f-e036-4809-a07d-dad9577c00b8', null, 4),
      -- CLUB · 2015 · Upstate New York Men's Sectionals 2015 (upstate-new-york-mens-sectionals-2015) · ended 2015-08-30
      ('862d5210-64ec-42c1-bf7a-cf9e4f009fd0', '77cca4d0-95e5-4c3a-8a55-eab32efc5799', null, 5),
      ('862d5210-64ec-42c1-bf7a-cf9e4f009fd0', '71a91141-c7a0-48e7-b9d7-15d7cdbe08a7', null, 6),
      ('862d5210-64ec-42c1-bf7a-cf9e4f009fd0', 'd637b2c4-7ad9-4816-92ac-c6fc34586e32', null, 7),
      ('862d5210-64ec-42c1-bf7a-cf9e4f009fd0', '989ef53d-0154-46fe-832f-933869daacf6', null, 8),
      -- CLUB · 2015 · Washington Men's Sectionals 2015 (washington-mens-sectionals-2015) · ended 2015-08-30
      ('7c1f526a-4e94-49b4-b190-9dc6147f2aae', '12e301f3-731c-44dd-8310-21512da474e2', null, 1),
      ('7c1f526a-4e94-49b4-b190-9dc6147f2aae', 'd593f3cf-2ba8-44e0-9844-6a5b2adadee2', null, 2),
      ('7c1f526a-4e94-49b4-b190-9dc6147f2aae', 'bd9978ca-446e-477c-a469-b2ec66c2a434', null, 3),
      ('7c1f526a-4e94-49b4-b190-9dc6147f2aae', '81ed460a-3518-4c26-a636-ffced78d4f0e', null, 4),
      -- CLUB · 2015 · West Plains Mixed Sectionals 2015 (west-plains-mixed-sectionals-2015) · ended 2015-08-30
      ('d3f877a0-b5e7-46ee-83b6-535f6fcf6b2a', '780c5c16-9f7b-4270-963f-d8fe6ff33e3c', null, 1),
      ('d3f877a0-b5e7-46ee-83b6-535f6fcf6b2a', '769e6a4f-11a2-48ad-8f7e-b42d1953e4f2', null, 2),
      ('d3f877a0-b5e7-46ee-83b6-535f6fcf6b2a', '2e78b4e3-dbb6-4526-bce6-769d7e69ffe9', null, 3),
      -- CLUB · 2015 · Great Lakes Men's Regionals 2015 (great-lakes-mens-regionals-2015) · ended 2015-09-13
      ('9e2e41fd-209d-4ec7-a7ad-a2b56bf3a07a', '902a41d1-e8fb-44a5-829f-7e7715aef960', null, 1),
      ('9e2e41fd-209d-4ec7-a7ad-a2b56bf3a07a', 'bfb76c72-02a6-4fc0-9664-a4e706c39b26', null, 2),
      ('9e2e41fd-209d-4ec7-a7ad-a2b56bf3a07a', '943c6940-315e-48f9-babc-0f9c729640b1', null, 3),
      ('9e2e41fd-209d-4ec7-a7ad-a2b56bf3a07a', '04253594-7be9-4b90-836e-5611a7b61934', null, 4),
      ('9e2e41fd-209d-4ec7-a7ad-a2b56bf3a07a', 'ba28656f-00d9-48aa-8e7e-4a5c62485f8f', null, 13),
      ('9e2e41fd-209d-4ec7-a7ad-a2b56bf3a07a', 'ea968297-d5ea-407b-b27f-f82af31a094e', null, 14),
      ('9e2e41fd-209d-4ec7-a7ad-a2b56bf3a07a', '0c517e75-9f60-4ca8-bc65-30e6001c0e21', null, 15),
      ('9e2e41fd-209d-4ec7-a7ad-a2b56bf3a07a', '1799378c-7c1e-45eb-87d9-0654da916990', null, 16),
      -- CLUB · 2015 · Great Lakes Mixed Regionals 2015 (great-lakes-mixed-regionals-2015) · ended 2015-09-13
      ('75f37917-e769-41cb-8666-583dea0621bc', 'b163f626-c5bf-4fc8-983c-20d40e249107', null, 1),
      ('75f37917-e769-41cb-8666-583dea0621bc', 'd75f5513-a2b6-4dbc-aeb9-2d5beb266809', null, 2),
      ('75f37917-e769-41cb-8666-583dea0621bc', '1287989e-4bde-434a-b818-495f51602726', null, 3),
      ('75f37917-e769-41cb-8666-583dea0621bc', 'ea67057f-1cc8-4ceb-8049-ae2b47cc4062', null, 4),
      ('75f37917-e769-41cb-8666-583dea0621bc', 'aab92f0f-a065-4862-80a7-d4bfec56e966', null, 5),
      ('75f37917-e769-41cb-8666-583dea0621bc', '6722a793-ec98-40bd-8344-8828fd1f3ca9', null, 6),
      ('75f37917-e769-41cb-8666-583dea0621bc', '07840839-75e5-4a0a-922f-4154d3b828fd', null, 7),
      ('75f37917-e769-41cb-8666-583dea0621bc', '6f549f08-dafb-4b05-bae7-9f444c719471', null, 8),
      ('75f37917-e769-41cb-8666-583dea0621bc', '6a6ee7a2-5afb-4bba-bc25-6badf0ee7ba7', null, 9),
      ('75f37917-e769-41cb-8666-583dea0621bc', '3f8535d6-5e9e-42cf-812d-1f0e1524be84', null, 10),
      ('75f37917-e769-41cb-8666-583dea0621bc', '3160c23d-1d50-4295-ae63-f5e7b397f561', null, 11),
      ('75f37917-e769-41cb-8666-583dea0621bc', 'b934aa1e-bad1-47b0-9069-42a55cdd6b9c', null, 12),
      -- CLUB · 2015 · Mid-Atlantic Men's Regionals 2015 (mid-atlantic-mens-regionals-2015) · ended 2015-09-13
      ('bf008ee0-8e63-4996-bdd4-df86b3d7d92d', '98e0af26-448d-4241-88aa-df2935c15ea9', null, 1),
      ('bf008ee0-8e63-4996-bdd4-df86b3d7d92d', '9dbb564b-f179-4c52-b6b9-0bdab703bf27', null, 2),
      ('bf008ee0-8e63-4996-bdd4-df86b3d7d92d', '7562575d-e103-40c2-980a-cca28784c335', null, 3),
      ('bf008ee0-8e63-4996-bdd4-df86b3d7d92d', '5528999f-148c-47b7-ac95-a410834e95f2', null, 4),
      ('bf008ee0-8e63-4996-bdd4-df86b3d7d92d', 'dbe2372a-0b81-40ba-ba70-55c6aa3be029', null, 11),
      ('bf008ee0-8e63-4996-bdd4-df86b3d7d92d', '45cc74db-e578-4c9c-ab05-d724daf4b517', null, 12),
      ('bf008ee0-8e63-4996-bdd4-df86b3d7d92d', '7b830a5c-e0e0-440d-b978-b029efada88d', null, 13),
      ('bf008ee0-8e63-4996-bdd4-df86b3d7d92d', '5c1fec45-3789-4efb-8b1c-e5ba79cdcb57', null, 14),
      ('bf008ee0-8e63-4996-bdd4-df86b3d7d92d', '79179504-7213-4743-a1b8-2a88a9389544', null, 15),
      ('bf008ee0-8e63-4996-bdd4-df86b3d7d92d', '9ed3dc08-116f-4c70-9c04-a113fff16867', null, 16),
      -- CLUB · 2015 · Mid-Atlantic Mixed Regionals 2015 (mid-atlantic-mixed-regionals-2015) · ended 2015-09-13
      ('5e48fd49-8f7c-44a8-849b-5f114d5626e8', '6f471c60-8027-4a83-bab1-806ebecaad0d', null, 1),
      ('5e48fd49-8f7c-44a8-849b-5f114d5626e8', '57546a17-5629-4dd6-85ee-7adc09b81878', null, 2),
      ('5e48fd49-8f7c-44a8-849b-5f114d5626e8', '281d52da-b98f-4fc6-96b8-07c6f8e3bf37', null, 3),
      ('5e48fd49-8f7c-44a8-849b-5f114d5626e8', '895c8831-c96b-4b38-b202-769ef10a4e2d', null, 4),
      ('5e48fd49-8f7c-44a8-849b-5f114d5626e8', 'bf77a85e-1750-4a49-a9a7-523b9d444db5', null, 7),
      ('5e48fd49-8f7c-44a8-849b-5f114d5626e8', '03372992-9639-4148-8622-f2493cd5ee1c', null, 8),
      ('5e48fd49-8f7c-44a8-849b-5f114d5626e8', '5b186bd6-f41f-4b27-9da2-13479e998356', null, 9),
      ('5e48fd49-8f7c-44a8-849b-5f114d5626e8', 'cba0c2e6-b5fb-409c-89b0-2b968bd69240', null, 10),
      ('5e48fd49-8f7c-44a8-849b-5f114d5626e8', '3e19be16-da7c-4abe-a87e-3e24f7d1cec8', null, 11),
      ('5e48fd49-8f7c-44a8-849b-5f114d5626e8', '08c43351-5b22-45ca-a80e-07c007c77110', null, 12),
      ('5e48fd49-8f7c-44a8-849b-5f114d5626e8', '10cf6963-fa5d-4787-8e8b-71dedf350645', null, 13),
      ('5e48fd49-8f7c-44a8-849b-5f114d5626e8', '1ff8e51b-2ed9-45a4-a2c0-6dbbc8e150fc', null, 14),
      ('5e48fd49-8f7c-44a8-849b-5f114d5626e8', 'e7aa8fd1-8804-4e14-a697-a6a06cb43f2a', null, 15),
      ('5e48fd49-8f7c-44a8-849b-5f114d5626e8', '38c3939a-8cf9-4e3d-9c23-9e113f786abb', null, 16),
      -- CLUB · 2015 · Mid-Atlantic Women's Regionals 2015 (mid-atlantic-womens-regionals-2015) · ended 2015-09-13
      ('9c81aa96-e68f-4fd8-aece-88da057a30d8', 'bdae1b36-982e-4f71-8875-85394f17dcb4', null, 1),
      ('9c81aa96-e68f-4fd8-aece-88da057a30d8', '4a1ae59f-5eb3-4160-a192-3e65261e4174', null, 2),
      ('9c81aa96-e68f-4fd8-aece-88da057a30d8', 'd37295f3-0f77-4bc5-9bf8-30a7f6c7f92a', null, 3),
      ('9c81aa96-e68f-4fd8-aece-88da057a30d8', 'f359fd9e-5ec8-413f-9d42-9b36c6e2a00a', null, 4),
      ('9c81aa96-e68f-4fd8-aece-88da057a30d8', '637f0381-e0fc-4b04-b031-44a1882f1bca', null, 5),
      ('9c81aa96-e68f-4fd8-aece-88da057a30d8', '90f7a08c-5c53-4e72-9e31-19137db39422', null, 6),
      ('9c81aa96-e68f-4fd8-aece-88da057a30d8', 'ae77654d-acbe-41c9-ab36-775b13eeffd0', null, 7),
      ('9c81aa96-e68f-4fd8-aece-88da057a30d8', '16b87ef7-51b0-44c6-88cb-947118216b2d', null, 8),
      -- CLUB · 2015 · North Central Men's Regionals 2015 (north-central-mens-regionals-2015) · ended 2015-09-13
      ('75c37729-6603-4e12-9f21-52ac4223622c', '9ae443cb-fa87-4938-9c6c-ec6fc083b945', null, 1),
      ('75c37729-6603-4e12-9f21-52ac4223622c', '4c5fe1ed-1eb6-4c52-89b5-10dcf92adff8', null, 2),
      ('75c37729-6603-4e12-9f21-52ac4223622c', '1fb272b3-b64b-406c-ba63-a3b27164dc17', null, 3),
      ('75c37729-6603-4e12-9f21-52ac4223622c', 'dd5e0c06-9193-4218-ad82-4fb24d0e7ba9', null, 4),
      ('75c37729-6603-4e12-9f21-52ac4223622c', '2b3c7976-c19f-4939-85c6-d15618bf86a4', null, 5),
      ('75c37729-6603-4e12-9f21-52ac4223622c', 'f7434d04-805a-4de5-9f7b-edbd27fe56af', null, 6),
      ('75c37729-6603-4e12-9f21-52ac4223622c', 'b2f27874-1eb1-4d06-ba88-b6f2ddc0c46d', null, 7),
      ('75c37729-6603-4e12-9f21-52ac4223622c', '1c37f5bf-2ba7-40e5-a227-8ee87b16d0cd', null, 8),
      ('75c37729-6603-4e12-9f21-52ac4223622c', '65da5b0d-3646-4bea-a63a-538949113d98', null, 9),
      ('75c37729-6603-4e12-9f21-52ac4223622c', 'a0f396b0-b79d-4140-9a93-c5633c4c91ce', null, 10),
      -- CLUB · 2015 · North Central Mixed Regionals 2015 (north-central-mixed-regionals-2015) · ended 2015-09-13
      ('3f8090d4-36fa-48eb-ab26-aa939f9a39ec', 'd2de21cc-0e0d-49ff-bbc3-74b29fa57f6e', null, 1),
      ('3f8090d4-36fa-48eb-ab26-aa939f9a39ec', '52a81df5-f895-44ac-a40e-935e64d2bfc6', null, 2),
      ('3f8090d4-36fa-48eb-ab26-aa939f9a39ec', 'a58fa913-3115-4801-bcc7-cb03a4fa0a9b', null, 3),
      ('3f8090d4-36fa-48eb-ab26-aa939f9a39ec', '780c5c16-9f7b-4270-963f-d8fe6ff33e3c', null, 4),
      ('3f8090d4-36fa-48eb-ab26-aa939f9a39ec', '5a956517-23bf-4105-bdba-8aae8bd589b8', null, 5),
      ('3f8090d4-36fa-48eb-ab26-aa939f9a39ec', '2e78b4e3-dbb6-4526-bce6-769d7e69ffe9', null, 6),
      ('3f8090d4-36fa-48eb-ab26-aa939f9a39ec', '1acbd060-0b5b-4790-a05f-50f143c61a55', null, 7),
      ('3f8090d4-36fa-48eb-ab26-aa939f9a39ec', '80797bc7-f99f-4bcd-a65e-2063dfd2bc60', null, 8),
      ('3f8090d4-36fa-48eb-ab26-aa939f9a39ec', 'ef60b57a-01e3-478d-a498-f07958d5e9bf', null, 9),
      ('3f8090d4-36fa-48eb-ab26-aa939f9a39ec', '428822b2-2fdb-472d-88df-9e11d3454258', null, 10),
      ('3f8090d4-36fa-48eb-ab26-aa939f9a39ec', '3d33b2cc-f3aa-4ec7-be61-6beb3e2b82d8', null, 11),
      ('3f8090d4-36fa-48eb-ab26-aa939f9a39ec', '769e6a4f-11a2-48ad-8f7e-b42d1953e4f2', null, 11),
      ('3f8090d4-36fa-48eb-ab26-aa939f9a39ec', '300fd60d-219f-4fda-86b5-29a0a42f8714', null, 13),
      ('3f8090d4-36fa-48eb-ab26-aa939f9a39ec', 'e69cf618-9993-466b-8960-36e01bf19b13', null, 14),
      ('3f8090d4-36fa-48eb-ab26-aa939f9a39ec', '66397714-6d85-4758-956c-a4929acd76a6', null, 15),
      ('3f8090d4-36fa-48eb-ab26-aa939f9a39ec', '3956777e-4076-4d60-bf63-66fd5651059f', null, 16),
      -- CLUB · 2015 · North Central Women's Regionals 2015 (north-central-womens-regionals-2015) · ended 2015-09-13
      ('3cdfdeb5-c298-4bef-a644-21f3ebd0863b', '9006fcd7-ce7e-48b7-af5f-2c6e24607848', null, 1),
      ('3cdfdeb5-c298-4bef-a644-21f3ebd0863b', 'bc3d90f5-200e-4bdc-bdf5-a3973ce401c7', null, 2),
      ('3cdfdeb5-c298-4bef-a644-21f3ebd0863b', '83b7098e-3208-4f10-a274-d9951a326742', null, 3),
      ('3cdfdeb5-c298-4bef-a644-21f3ebd0863b', 'b34bc074-eb36-4c1c-8ab8-9b041505c92b', null, 4),
      -- CLUB · 2015 · Northeast Mixed Regionals 2015 (northeast-mixed-regionals-2015) · ended 2015-09-13
      ('aa92eea7-3336-4fa6-8007-275a76b4c2c3', '6d6e30bd-2b28-4018-bba3-d636ae22fa2e', null, 1),
      ('aa92eea7-3336-4fa6-8007-275a76b4c2c3', '3750a858-34c5-4843-9caf-a6b482e8e1ce', null, 2),
      ('aa92eea7-3336-4fa6-8007-275a76b4c2c3', '87f538d2-d794-494e-8f2b-f7653980fd27', null, 3),
      ('aa92eea7-3336-4fa6-8007-275a76b4c2c3', 'e805dd43-5321-4e30-8094-64997fb36968', null, 4),
      ('aa92eea7-3336-4fa6-8007-275a76b4c2c3', '1fb4d105-5f6d-4504-aaa5-547c395e057e', null, 5),
      ('aa92eea7-3336-4fa6-8007-275a76b4c2c3', '2af1d1ee-fa4d-4eb1-a38e-fd3273fc8851', null, 6),
      ('aa92eea7-3336-4fa6-8007-275a76b4c2c3', 'c723fd50-c3eb-4040-a535-74377a0f21e8', null, 7),
      ('aa92eea7-3336-4fa6-8007-275a76b4c2c3', 'e30c56ac-d182-4f42-8b41-da421b01982d', null, 8),
      ('aa92eea7-3336-4fa6-8007-275a76b4c2c3', '7f028c1a-fbfd-42c7-bd34-65d329cecb5c', null, 9),
      ('aa92eea7-3336-4fa6-8007-275a76b4c2c3', '76bd5f52-ead0-4015-a7c7-19d4b55885f2', null, 10),
      ('aa92eea7-3336-4fa6-8007-275a76b4c2c3', '2265e6f8-fd4d-4ef5-965a-0dcec6252b39', null, 13),
      ('aa92eea7-3336-4fa6-8007-275a76b4c2c3', 'c080c2ba-d82d-4bdd-83c5-d2611f81b8be', null, 14),
      ('aa92eea7-3336-4fa6-8007-275a76b4c2c3', 'ad7b692e-f793-4d01-a29d-fb2e490f874f', null, 15),
      ('aa92eea7-3336-4fa6-8007-275a76b4c2c3', '1bad6d01-ca23-4a4b-bd2b-a41689b666da', null, 16),
      -- CLUB · 2015 · Northeast Women's Regionals 2015 (northeast-womens-regionals-2015) · ended 2015-09-13
      ('7993475e-10e3-4359-bdd6-ca86c85f4fcf', 'c81eb296-5aa5-4e56-98f4-b1d933c0d3f7', null, 1),
      ('7993475e-10e3-4359-bdd6-ca86c85f4fcf', '079d3ae3-7561-4422-8446-dec61a829733', null, 2),
      ('7993475e-10e3-4359-bdd6-ca86c85f4fcf', 'd60c638b-8be7-400b-91d5-59720530886a', null, 3),
      ('7993475e-10e3-4359-bdd6-ca86c85f4fcf', 'ef821688-e27a-477c-9d1a-4381aa1bd30b', null, 4),
      ('7993475e-10e3-4359-bdd6-ca86c85f4fcf', 'b74dc542-0865-4898-a7ba-d7b0193e5e76', null, 5),
      ('7993475e-10e3-4359-bdd6-ca86c85f4fcf', '13400cbf-e9f0-45f7-8889-14160363cc55', null, 6),
      ('7993475e-10e3-4359-bdd6-ca86c85f4fcf', '28014d43-c225-4e4d-a907-fdf4e64e8431', null, 7),
      ('7993475e-10e3-4359-bdd6-ca86c85f4fcf', 'b95f97fd-7bc4-4170-ad87-557100dd42b9', null, 8),
      ('7993475e-10e3-4359-bdd6-ca86c85f4fcf', '4f51578d-4952-4820-a625-223b910661fc', null, 9),
      ('7993475e-10e3-4359-bdd6-ca86c85f4fcf', '29640190-20d5-467e-989a-acd8d5f6de8c', null, 10),
      ('7993475e-10e3-4359-bdd6-ca86c85f4fcf', '2e180d9a-58dd-4d1b-a9c2-46112d5298d5', null, 11),
      ('7993475e-10e3-4359-bdd6-ca86c85f4fcf', '5e003027-4468-46dc-99f3-d0acb3818a24', null, 12),
      -- CLUB · 2015 · Northwest Men's Regionals 2015 (northwest-mens-regionals-2015) · ended 2015-09-13
      ('04e28ec0-aa74-4473-bf03-2afd14b8a8ca', 'c71afd55-fe65-4e4b-995f-69ea65546fca', null, 1),
      ('04e28ec0-aa74-4473-bf03-2afd14b8a8ca', '1e51d1dd-428d-4976-a4c0-5acf80c9de8f', null, 2),
      ('04e28ec0-aa74-4473-bf03-2afd14b8a8ca', '81ed460a-3518-4c26-a636-ffced78d4f0e', null, 9),
      ('04e28ec0-aa74-4473-bf03-2afd14b8a8ca', 'd593f3cf-2ba8-44e0-9844-6a5b2adadee2', null, 10),
      ('04e28ec0-aa74-4473-bf03-2afd14b8a8ca', '5870feda-2b69-4833-ae7f-795fa72ce0c0', null, 11),
      ('04e28ec0-aa74-4473-bf03-2afd14b8a8ca', '55735ff2-9ad3-4f7b-946f-cb6ed8bc4fb8', null, 12),
      -- CLUB · 2015 · Northwest Mixed Regionals 2015 (northwest-mixed-regionals-2015) · ended 2015-09-13
      ('b71a4958-f27e-4a9c-8bad-3737a0e87ca3', '4373c686-f416-4f9f-a6a2-108a3cf96b78', null, 1),
      ('b71a4958-f27e-4a9c-8bad-3737a0e87ca3', '25d1e7e7-272f-4944-9202-2ac8f8f38fb7', null, 2),
      ('b71a4958-f27e-4a9c-8bad-3737a0e87ca3', 'cceb9073-a898-40a8-a92a-293cc1f506d1', null, 3),
      ('b71a4958-f27e-4a9c-8bad-3737a0e87ca3', '7598202a-8446-48fc-a0d5-409b4820ba24', null, 4),
      ('b71a4958-f27e-4a9c-8bad-3737a0e87ca3', 'b189cfab-c946-49a6-a417-5de586c9c478', null, 5),
      ('b71a4958-f27e-4a9c-8bad-3737a0e87ca3', 'e7fea102-c13e-49fd-8fda-7530b854cc62', null, 6),
      ('b71a4958-f27e-4a9c-8bad-3737a0e87ca3', 'f0986e96-ac8a-40dd-a585-2664602ef870', null, 7),
      ('b71a4958-f27e-4a9c-8bad-3737a0e87ca3', '413cd000-bf3a-4b93-acc3-ec45f9a03796', null, 8),
      -- CLUB · 2015 · Northwest Women's Regionals 2015 (northwest-womens-regionals-2015) · ended 2015-09-13
      ('998081c1-1afa-450e-8072-6a365cccd749', '6e201bbf-454f-4d2b-a7bd-ea062246a6ed', null, 1),
      ('998081c1-1afa-450e-8072-6a365cccd749', '94e7ec4f-2ca9-4e4e-80bb-12d4ed6c9090', null, 2),
      ('998081c1-1afa-450e-8072-6a365cccd749', '083b4a36-ce70-41f3-936d-8866204103ae', null, 3),
      ('998081c1-1afa-450e-8072-6a365cccd749', '90343214-f834-415b-84ff-5caaf674d7c7', null, 4),
      ('998081c1-1afa-450e-8072-6a365cccd749', '25485842-8088-4dd6-bb6b-6e42a7bc1f00', null, 5),
      ('998081c1-1afa-450e-8072-6a365cccd749', '3eb00512-5434-4c4f-89c5-e4420d62a201', null, 6),
      ('998081c1-1afa-450e-8072-6a365cccd749', 'cd418636-fac4-4eaf-9fec-9aaa983bd373', null, 7),
      ('998081c1-1afa-450e-8072-6a365cccd749', 'ebef13b8-1ca2-4f0b-a5cd-dffb459f60c3', null, 8),
      -- CLUB · 2015 · South Central Men's Regionals 2015 (south-central-mens-regionals-2015) · ended 2015-09-13
      ('bd2e2374-df24-4536-94a7-028d274d1577', 'f934835a-7722-4946-a961-97bf20a666f8', null, 1),
      ('bd2e2374-df24-4536-94a7-028d274d1577', 'a9fcdbeb-be45-403d-95ab-e0e9a50566e2', null, 2),
      ('bd2e2374-df24-4536-94a7-028d274d1577', '97121a7c-9a20-4098-b7aa-17bd9b33e305', null, 3),
      ('bd2e2374-df24-4536-94a7-028d274d1577', 'ecdc6b50-a63d-4dff-8f7c-40e3991f41e9', null, 4),
      ('bd2e2374-df24-4536-94a7-028d274d1577', 'dfc9cca0-d366-4557-a404-89ca09ecf877', null, 7),
      ('bd2e2374-df24-4536-94a7-028d274d1577', 'c0fc5eb9-d23e-4275-90be-624be20e7739', null, 8),
      ('bd2e2374-df24-4536-94a7-028d274d1577', '885d182a-2abe-4508-9942-c5e76ab0439e', null, 9),
      ('bd2e2374-df24-4536-94a7-028d274d1577', '81849dfb-7f7d-4259-bd80-f95ff8b83f33', null, 10),
      ('bd2e2374-df24-4536-94a7-028d274d1577', '484fd7b8-b6ea-4ddd-9cc7-d9932e611e93', null, 11),
      ('bd2e2374-df24-4536-94a7-028d274d1577', '1e9549b4-2525-462c-8104-f8a8a1939ef5', null, 12),
      -- CLUB · 2015 · South Central Mixed Regionals (south-central-mixed-regionals) · ended 2015-09-13
      ('a1b9af5a-5c84-4ec7-9ba3-8d5d9aab55fd', 'e64af073-3a7a-4811-83eb-c749b6f21762', null, 1),
      ('a1b9af5a-5c84-4ec7-9ba3-8d5d9aab55fd', 'f3fc30f1-21a3-4014-92af-067420d3b864', null, 2),
      ('a1b9af5a-5c84-4ec7-9ba3-8d5d9aab55fd', '4e13e6da-ae9d-4345-837f-037471b2707d', null, 3),
      ('a1b9af5a-5c84-4ec7-9ba3-8d5d9aab55fd', '8a9c52ca-d31e-437e-a079-8447f4be4291', null, 4),
      ('a1b9af5a-5c84-4ec7-9ba3-8d5d9aab55fd', 'fc54f7e8-25fd-47af-af4f-542c93e659f1', null, 5),
      ('a1b9af5a-5c84-4ec7-9ba3-8d5d9aab55fd', 'd6cc1c28-85e0-4a9f-a2a0-f2d2e43ee4f5', null, 6),
      ('a1b9af5a-5c84-4ec7-9ba3-8d5d9aab55fd', '0110fbf0-166a-4343-ba1b-5ecfa46d152d', null, 7),
      ('a1b9af5a-5c84-4ec7-9ba3-8d5d9aab55fd', 'a7fd3983-ead4-4aa6-8486-cef2f81007df', null, 8),
      ('a1b9af5a-5c84-4ec7-9ba3-8d5d9aab55fd', '6ed9f0ea-b81a-49ad-a79d-1ca54d6b7323', null, 13),
      ('a1b9af5a-5c84-4ec7-9ba3-8d5d9aab55fd', '033b6c87-31d2-4ffa-acdf-550ddf98410a', null, 14),
      ('a1b9af5a-5c84-4ec7-9ba3-8d5d9aab55fd', 'aaef8cae-2d8d-4dbd-b064-fac4073b4113', null, 15),
      ('a1b9af5a-5c84-4ec7-9ba3-8d5d9aab55fd', '3522a667-0cba-479c-a373-79c5ab61743f', null, 16),
      -- CLUB · 2015 · Southeast Men's Regionals 2015 (southeast-mens-regionals-2015) · ended 2015-09-13
      ('2c383f8d-46a5-40ea-9b0f-da1fa753a548', '61920d47-aeaf-426b-8099-bab0399bc54e', null, 1),
      ('2c383f8d-46a5-40ea-9b0f-da1fa753a548', 'c3d270a6-4020-4793-90d1-215b2f040044', null, 2),
      ('2c383f8d-46a5-40ea-9b0f-da1fa753a548', '04c52477-6375-43a5-bb43-6c54caba833a', null, 3),
      ('2c383f8d-46a5-40ea-9b0f-da1fa753a548', 'd740cc67-d816-4ad1-bbe3-9024aad38b7f', null, 4),
      ('2c383f8d-46a5-40ea-9b0f-da1fa753a548', 'd6ea0e94-e349-4cb9-a2ab-3bfb51a55bbe', null, 5),
      ('2c383f8d-46a5-40ea-9b0f-da1fa753a548', 'f8c9c9fa-3827-407f-b291-436c9de67576', null, 6),
      ('2c383f8d-46a5-40ea-9b0f-da1fa753a548', '20862a9d-4b27-42d2-9f52-52058e7d6288', null, 7),
      ('2c383f8d-46a5-40ea-9b0f-da1fa753a548', '58d82714-da02-4d08-8eb2-8223b7659d4a', null, 8),
      ('2c383f8d-46a5-40ea-9b0f-da1fa753a548', '953236b1-7ca3-4094-9834-e51e2e0c3976', null, 9),
      ('2c383f8d-46a5-40ea-9b0f-da1fa753a548', 'af2fe211-f594-4870-8f4d-4ddea78b4e74', null, 10),
      ('2c383f8d-46a5-40ea-9b0f-da1fa753a548', '0e231804-beb1-40fe-bdaf-146da8c4187b', null, 11),
      ('2c383f8d-46a5-40ea-9b0f-da1fa753a548', 'e7069064-131c-4ea3-939f-169287885943', null, 12),
      -- CLUB · 2015 · Southeast Women's Regionals 2015 (southeast-womens-regionals-2015) · ended 2015-09-13
      ('3229a53d-fb2f-4156-ab82-3c49ee9d06c0', 'cc3d1a99-4d91-4835-b475-fdffb59d1a4f', null, 1),
      ('3229a53d-fb2f-4156-ab82-3c49ee9d06c0', '54b75fb9-e1d6-4c69-ac45-d72cb511bbaa', null, 2),
      -- CLUB · 2015 · Southwest Men's Regionals 2015 (southwest-mens-regionals-2015) · ended 2015-09-13
      ('af206f46-6041-40a8-8aa3-fa57a94432b1', 'fdfea575-adfa-4412-b905-cd94c43d6f0e', null, 1),
      ('af206f46-6041-40a8-8aa3-fa57a94432b1', '661a69ec-2883-4350-8e04-39bbe8df9b11', null, 2),
      ('af206f46-6041-40a8-8aa3-fa57a94432b1', 'd8fe75a2-dfa8-4fc9-9e4d-63f726af7951', null, 3),
      ('af206f46-6041-40a8-8aa3-fa57a94432b1', '20272836-d966-421b-bb51-0afadd3c0c79', null, 4),
      ('af206f46-6041-40a8-8aa3-fa57a94432b1', 'ba6d355c-fe76-4f1a-bc0b-b3df403d1c06', null, 5),
      ('af206f46-6041-40a8-8aa3-fa57a94432b1', '286278bb-6115-4c4f-b131-a51acd0352ec', null, 6),
      ('af206f46-6041-40a8-8aa3-fa57a94432b1', 'cc15efd2-6be2-41fc-8827-0539725c6a20', null, 7),
      ('af206f46-6041-40a8-8aa3-fa57a94432b1', 'b73ad5fd-9f11-401f-915b-1dbeae37fa8f', null, 8),
      ('af206f46-6041-40a8-8aa3-fa57a94432b1', '870518db-7556-49df-bdc1-385c55514e82', null, 9),
      ('af206f46-6041-40a8-8aa3-fa57a94432b1', '5f60daac-0b61-4ba9-a21a-11be8f7796aa', null, 10),
      -- CLUB · 2015 · Southwest Mixed Regionals 2015 (southwest-mixed-regionals-2015) · ended 2015-09-13
      ('fddab872-15b6-4bf4-a079-bfa40ef132cf', '0d96e182-5694-45c3-86ae-2360212f011c', null, 1),
      ('fddab872-15b6-4bf4-a079-bfa40ef132cf', '7bdc02a6-c778-4852-9348-8a9783ad993e', null, 2),
      ('fddab872-15b6-4bf4-a079-bfa40ef132cf', '7055e242-a716-413a-b944-73727ac86852', null, 3),
      ('fddab872-15b6-4bf4-a079-bfa40ef132cf', '15e4f5c9-59a2-4013-9063-436bdece4305', null, 4),
      ('fddab872-15b6-4bf4-a079-bfa40ef132cf', '5e55a685-dd7f-40c8-9491-f67b701ad067', null, 7),
      ('fddab872-15b6-4bf4-a079-bfa40ef132cf', '9575cdb4-55b5-4dbd-abff-04a5f1b3323c', null, 8),
      ('fddab872-15b6-4bf4-a079-bfa40ef132cf', '2729d79b-81db-4fbb-9f7b-06b18ba18f40', null, 9),
      ('fddab872-15b6-4bf4-a079-bfa40ef132cf', 'f08a2a69-4376-4d01-8a44-97e4f8603be8', null, 10),
      ('fddab872-15b6-4bf4-a079-bfa40ef132cf', 'da574ef7-ba96-4a22-b686-7bce63dafa19', null, 11),
      ('fddab872-15b6-4bf4-a079-bfa40ef132cf', 'c18c1167-e135-4897-824c-3b609fd7297a', null, 12),
      ('fddab872-15b6-4bf4-a079-bfa40ef132cf', '56270c37-4cbb-4b4a-8e34-6ea86d3e2537', null, 13),
      ('fddab872-15b6-4bf4-a079-bfa40ef132cf', '4cf569b7-595b-43ee-a1a0-a14dc2980ac6', null, 14),
      ('fddab872-15b6-4bf4-a079-bfa40ef132cf', 'eebea432-f2c6-4a7d-83a8-06c46dfac9d1', null, 15),
      ('fddab872-15b6-4bf4-a079-bfa40ef132cf', '4511e409-35e2-424b-80b1-5c5050aa8dd6', null, 16),
      -- CLUB · 2015 · Southwest Women's Regionals 2015 (southwest-womens-regionals-2015) · ended 2015-09-13
      ('f44d93df-e441-4852-87af-64df362be133', 'b87d69a4-60e1-4904-b6e7-2e96ee93042f', null, 1),
      ('f44d93df-e441-4852-87af-64df362be133', '210cb995-0807-45db-9077-ee0d21b55ccd', null, 2),
      ('f44d93df-e441-4852-87af-64df362be133', '29637531-1587-442d-a557-1649a2d562d7', null, 3),
      ('f44d93df-e441-4852-87af-64df362be133', '6c34be44-5496-4dfc-8e2d-44ad118e51e9', null, 4),
      ('f44d93df-e441-4852-87af-64df362be133', 'c463691f-5fa2-4d31-b0c3-1713dc4f1dba', null, 5),
      ('f44d93df-e441-4852-87af-64df362be133', '0f81a107-c8a3-4706-b68e-9f16ee19e9b5', null, 6),
      ('f44d93df-e441-4852-87af-64df362be133', '830ae6c9-b29c-4461-866c-27c13659f370', null, 7),
      ('f44d93df-e441-4852-87af-64df362be133', 'f84dd56f-e036-4809-a07d-dad9577c00b8', null, 8),
      -- CLUB · 2016 · ATL Classic 2016 (atl-classic-2016) · ended 2016-06-19
      ('68eb6f3f-aba1-4b87-8b4d-10e47690cf3e', '3ba478e2-9d60-4799-b523-d4676239a16f', 3, 4), -- correct
      ('68eb6f3f-aba1-4b87-8b4d-10e47690cf3e', '48bf3066-75f0-4655-b92b-d7ab41cae3b3', 3, 4), -- correct
      ('68eb6f3f-aba1-4b87-8b4d-10e47690cf3e', '1f557366-dc0d-4758-94f6-f475dc476ba4', null, 5),
      ('68eb6f3f-aba1-4b87-8b4d-10e47690cf3e', '3a0d6571-3cb4-45ad-909c-f449320d0f97', null, 6),
      ('68eb6f3f-aba1-4b87-8b4d-10e47690cf3e', '50b3d61a-84d1-4216-abf9-6f7b540e25df', 11, 12), -- correct
      ('68eb6f3f-aba1-4b87-8b4d-10e47690cf3e', 'e937d1c8-f5c1-4c96-8aac-b8dd3bc5cdd1', 15, 16), -- correct
      -- CLUB · 2016 · Eugene Summer Solstice 2016 (eugene-summer-solstice-2016) · ended 2016-06-19
      ('44893bff-2d19-4924-84b3-4cc3edee2e68', 'f818daf6-8ecc-43f5-9e13-f022f60377a7', 7, 8), -- correct
      -- CLUB · 2016 · Fort Collins Summer Solstice 2016 (fort-collins-summer-solstice-2016) · ended 2016-06-19
      ('c97320fb-9e0b-4c0e-9762-b1555d707350', 'f63fa86c-a316-477b-a60a-5da22a5a0b2f', null, 10),
      -- CLUB · 2016 · Huckfest 2016 (huckfest-2016) · ended 2016-06-26
      ('b4fda067-6591-4398-9b99-3643cda887ec', '266c3b61-e09d-44d0-bc52-669eb1e616ac', 3, 4), -- correct
      ('b4fda067-6591-4398-9b99-3643cda887ec', '39e70920-79f5-4151-b326-4820744fbf13', null, 5),
      ('b4fda067-6591-4398-9b99-3643cda887ec', '320f3ca6-f015-4076-9d63-132da7ebb814', null, 6),
      ('b4fda067-6591-4398-9b99-3643cda887ec', '128fa29e-9c59-43c0-8e2b-cf40d70cb2fe', 6, null), -- clear-unsupported
      ('b4fda067-6591-4398-9b99-3643cda887ec', '50b3d61a-84d1-4216-abf9-6f7b540e25df', 5, null), -- clear-unsupported
      -- CLUB · 2016 · SCINNY 2016 (scinny-2016) · ended 2016-06-26
      ('31ac08b2-bd32-453b-88f1-9ea58920ba1b', '476838c2-8cb1-4cd2-9dc9-cafcf737c2ef', 3, 4), -- correct
      ('31ac08b2-bd32-453b-88f1-9ea58920ba1b', '607fcd01-6e37-48ec-b7dd-89678f0a09a9', null, 5),
      ('31ac08b2-bd32-453b-88f1-9ea58920ba1b', 'ed8fae91-3748-4a1e-b962-d25caddb0634', null, 6),
      -- CLUB · 2016 · Summer Glazed Daze 2016 (summer-glazed-daze-2016) · ended 2016-06-26
      ('39d7bca1-470e-4432-80c4-b00b206e4407', '4438ec15-0160-4756-819c-2421093e3570', null, 5),
      ('39d7bca1-470e-4432-80c4-b00b206e4407', '986b4603-300b-4d25-aaff-7ac9650d5977', null, 6),
      -- CLUB · 2016 · US Open Ultimate Championships (us-open-ultimate-championships) · ended 2016-07-04
      ('e68b42b7-0c67-4373-bfcc-c531127a783f', '3f142b21-19eb-4526-afcb-f6e4c72565b4', null, 5),
      ('e68b42b7-0c67-4373-bfcc-c531127a783f', 'd55bddb9-a7f6-4d5c-9ea1-7ffbea03a93f', null, 6),
      ('e68b42b7-0c67-4373-bfcc-c531127a783f', '1df74cc2-36bd-4c1d-9c62-4ec24d931351', 7, 8), -- correct
      -- CLUB · 2016 · AntlerLock 2016 (antlerlock-2016) · ended 2016-07-10
      ('ebbead8b-fdfe-4200-94b8-c35eca817b4b', '2a9d2525-924d-49b7-a36f-a3b1bb021ce5', 10, null), -- clear-unsupported
      ('ebbead8b-fdfe-4200-94b8-c35eca817b4b', '8ed227e4-8fcd-4180-b154-315fc6ef9e73', 9, null), -- clear-unsupported
      -- CLUB · 2016 · Ski Town Classic 2016 (ski-town-classic-2016) · ended 2016-07-17
      ('fb0eb4f4-5182-4400-99ea-cbf57ee30525', '433f954f-b483-410b-ba7e-0c7f8f7ccfd6', null, 13),
      ('fb0eb4f4-5182-4400-99ea-cbf57ee30525', '22f7b2bc-8fe0-43d0-a22c-9c16fa66b3ba', null, 14),
      -- CLUB · 2016 · Stonewalled 2016 (stonewalled-2016) · ended 2016-07-17
      ('0263b304-d0d5-4c67-a58e-93332e07070d', '59934dac-7ea6-4106-9ef4-8d62a8e861a7', 11, 12), -- correct
      -- CLUB · 2016 · Heavyweights 2016 (heavyweights-2016) · ended 2016-07-24
      ('5ba11386-0afd-4eb8-ab4e-d8a81f4a1d42', 'c15f7c05-cb43-4828-9e31-55c29dc7b227', 7, 8), -- correct
      ('5ba11386-0afd-4eb8-ab4e-d8a81f4a1d42', 'f192d25c-eed9-4577-bae3-4b2381769f46', 11, 12), -- correct
      ('5ba11386-0afd-4eb8-ab4e-d8a81f4a1d42', '93f8ff16-2e48-4b31-a8bf-2d5300406506', null, 17),
      ('5ba11386-0afd-4eb8-ab4e-d8a81f4a1d42', 'e4d04bbc-1818-470c-8bfd-6e4b01bffedd', null, 17),
      ('5ba11386-0afd-4eb8-ab4e-d8a81f4a1d42', 'b07f4c81-4104-45fe-8c93-dbabe934b104', null, 18),
      ('5ba11386-0afd-4eb8-ab4e-d8a81f4a1d42', 'd2c39f69-9bb6-49fb-b2b6-1617975a220e', null, 18),
      ('5ba11386-0afd-4eb8-ab4e-d8a81f4a1d42', '0231beef-bfb3-4d3c-aba9-54cf2b399483', 19, 20), -- correct
      ('5ba11386-0afd-4eb8-ab4e-d8a81f4a1d42', 'dfd77267-b6b8-4b2c-a2e7-40224833bc16', 19, 20), -- correct
      -- CLUB · 2016 · The Chillout 2016 Club Tournament (the-chillout-2016-club-tournament) · ended 2016-07-24
      ('e3204142-43d7-43b1-9e60-20062ba9ea4c', '6e5f1982-97db-49fb-b736-676c0f3bbd21', 3, 4), -- correct
      ('e3204142-43d7-43b1-9e60-20062ba9ea4c', '61db9963-b419-4fb1-a9d0-aca663b9636b', null, 8),
      -- CLUB · 2016 · Vacationland Tournament 2016 (Maine Ult.) (vacationland-tournament-2016-maine-ult) · ended 2016-07-24
      ('ffb3639e-c860-4d23-bb40-a74ad429c4a3', '92f5f002-766c-4f59-94c4-3dd592140b32', null, 5),
      ('ffb3639e-c860-4d23-bb40-a74ad429c4a3', '62ff33a9-ca4d-4d6b-8f08-d1048e78b129', null, 6),
      ('ffb3639e-c860-4d23-bb40-a74ad429c4a3', '61bee78e-b54a-4dda-bdb5-e055aba8b8e3', 7, 8), -- correct
      -- CLUB · 2016 · Motown Throwdown 2016 (motown-throwdown-2016) · ended 2016-07-31
      ('6b6b5273-f894-4103-b0be-bf1dde2069c4', '92de4c04-72d0-4db4-bc6c-2115fb2e98bf', null, 13),
      ('6b6b5273-f894-4103-b0be-bf1dde2069c4', 'dfd77267-b6b8-4b2c-a2e7-40224833bc16', null, 14),
      -- CLUB · 2016 · Ok Corral 2016 (ok-corral-2016) · ended 2016-07-31
      ('32ade891-b587-4dd1-b1fa-f00fbd796d08', 'ad8f629a-ecfa-4e5a-a172-d9c09653b9b3', 2, null), -- clear-unsupported
      ('32ade891-b587-4dd1-b1fa-f00fbd796d08', 'b909ad88-4d20-414b-b5f1-4f44e745ae4b', 1, null), -- clear-unsupported
      -- CLUB · 2016 · Philly Open 2016 (philly-open-2016) · ended 2016-08-07
      ('8f9484af-5233-4aa8-b582-fa0679c3e77f', 'e043926d-b1c2-4ae5-b161-ddeff11b954f', null, 7),
      ('8f9484af-5233-4aa8-b582-fa0679c3e77f', 'f0189993-a655-437f-b42a-f3ab550900c2', null, 7),
      ('8f9484af-5233-4aa8-b582-fa0679c3e77f', 'e2c13ebf-0ef1-4b32-8aaf-e6faf0ec230a', 11, 12), -- correct
      -- CLUB · 2016 · Trestlemania 2016 (trestlemania-2016) · ended 2016-08-07
      ('dbc75549-a408-4a7b-b9c6-fac97a4cda9f', '66e49967-8ed6-4959-8c23-3e73bc3703fd', null, 5),
      ('dbc75549-a408-4a7b-b9c6-fac97a4cda9f', 'dd7337da-4242-48e1-b209-3ae812ef7e01', null, 6),
      -- CLUB · 2016 · HoDown XX 2016 (hodown-xx-2016) · ended 2016-08-14
      ('bb9ea02e-1d8f-4b84-9ff0-a3ae484b620c', '986b4603-300b-4d25-aaff-7ac9650d5977', null, 3),
      ('bb9ea02e-1d8f-4b84-9ff0-a3ae484b620c', 'd06d93bc-a960-4c80-87a3-15c770b17a55', null, 4),
      -- CLUB · 2016 · Kleinman Eruption 2016 (kleinman-eruption-2016) · ended 2016-08-14
      ('f3ccfa2a-fc87-4a02-8991-c28aec505d48', '8011b32a-00d5-47a5-bd8b-1f506219f8ad', null, 13),
      ('f3ccfa2a-fc87-4a02-8991-c28aec505d48', '8cbdfb43-810c-41eb-895a-611ad9160ce9', null, 14),
      -- CLUB · 2016 · Cooler Classic 28 (cooler-classic-28) · ended 2016-08-21
      ('22dff3c7-80dc-4d1b-8328-1a1e0a79b29c', 'ad353f16-ebd6-4f8c-a292-0a7f5c51b235', null, 5),
      ('22dff3c7-80dc-4d1b-8328-1a1e0a79b29c', '7047bd6f-0ee3-4ad9-aab2-39ebc947247a', null, 6),
      ('22dff3c7-80dc-4d1b-8328-1a1e0a79b29c', '39863de1-9bdd-4e70-96e2-89d78e2b33a8', 7, 8), -- correct
      ('22dff3c7-80dc-4d1b-8328-1a1e0a79b29c', '5bfb901a-86c5-48c5-848b-0948c1f204bf', null, 12),
      -- CLUB · 2016 · Capital Men's Sectionals (capital-mens-sectionals) · ended 2016-08-28
      ('c9a5dbdd-19c2-4cc2-92fc-8aa9db602d43', '6c9a4221-a0b2-4a2e-9809-727310846dff', null, 7),
      ('c9a5dbdd-19c2-4cc2-92fc-8aa9db602d43', '6f7f2947-b48c-4d95-b87c-50100b073596', null, 8),
      -- CLUB · 2016 · Capital Mixed Sectionals 2016 (capital-mixed-sectionals-2016) · ended 2016-08-28
      ('b6c9c8a8-d406-4203-8440-48426fa2b171', '70a2156f-9d5f-4bf3-a9b5-ee89f2cf52c1', null, 8),
      ('b6c9c8a8-d406-4203-8440-48426fa2b171', 'd23860df-b5a6-48aa-bcb6-1dc0a117fa4e', null, 9),
      ('b6c9c8a8-d406-4203-8440-48426fa2b171', 'be8c4d2a-4fc4-4e48-8535-b8b492b91c5b', null, 11),
      ('b6c9c8a8-d406-4203-8440-48426fa2b171', '91600276-21d8-45f5-8f53-f7efab355948', null, 12),
      -- CLUB · 2016 · Capital Women's Sectionals (capital-womens-sectionals) · ended 2016-08-28
      ('f40bdfe4-ed06-4652-9852-cc05da020b14', '5c396cb8-a07b-4ce5-bbba-db67c57eac11', null, 5),
      ('f40bdfe4-ed06-4652-9852-cc05da020b14', 'd2348165-af7a-4369-9405-2eb8121bfc9c', null, 6)
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

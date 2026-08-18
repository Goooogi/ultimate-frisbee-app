-- WFDF bracket placeholder slots — persist the source's scheduling metadata so
-- the full bracket structure (future rounds, TBD slots) can render before
-- teams are decided.
--
-- The results.wfdf.sport games feed carries, for every not-yet-seeded slot:
--   homeschedulingname / visitorschedulingname  — display text ("R1 Winner 3",
--     "QF Loser 2", "Wx17", "1A" = 1st in Pool A)
--   home_scheduling_frompool / visitor_scheduling_frompool — the pool the slot
--     is fed from. We store the pool's NAME (unique within a division), which
--     is what the client-side resolver keys on.
--
-- Verified 2026-08-18 against WUCC 2026: "<W|L>x N" / "<R1|QF|SF> Winner|Loser N"
-- resolves to the from-pool's games ordered by wfdf_game_id, index (N-1) mod
-- count, winner/loser respectively — 80/80 predictions correct on games whose
-- teams have since been seeded.

alter table wfdf_games
  add column if not exists home_scheduling_name text,
  add column if not exists away_scheduling_name text,
  add column if not exists home_scheduling_pool text,
  add column if not exists away_scheduling_pool text;

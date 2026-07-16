
-- twelve_oh_players: add raw stat columns + z-score columns for the 4 new dimensions.
-- drops and callahans are new storage fields (throwaways already stored as turnovers).
-- points_played is new. z-score columns added for all 4.
ALTER TABLE twelve_oh_players
  ADD COLUMN IF NOT EXISTS drops          integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS callahans      integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS points_played  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS z_drops        numeric,
  ADD COLUMN IF NOT EXISTS z_throwaways   numeric,
  ADD COLUMN IF NOT EXISTS z_callahans    numeric,
  ADD COLUMN IF NOT EXISTS z_points_played numeric;

-- twelve_oh_baseline: add mean/std columns for the 4 new dimensions.
ALTER TABLE twelve_oh_baseline
  ADD COLUMN IF NOT EXISTS mean_drops           numeric,
  ADD COLUMN IF NOT EXISTS std_drops            numeric,
  ADD COLUMN IF NOT EXISTS mean_throwaways      numeric,
  ADD COLUMN IF NOT EXISTS std_throwaways       numeric,
  ADD COLUMN IF NOT EXISTS mean_callahans       numeric,
  ADD COLUMN IF NOT EXISTS std_callahans        numeric,
  ADD COLUMN IF NOT EXISTS mean_points_played   numeric,
  ADD COLUMN IF NOT EXISTS std_points_played    numeric;

-- Bump backfill_version default to 3 so new rows are distinguishable.
ALTER TABLE twelve_oh_players ALTER COLUMN backfill_version SET DEFAULT 3;

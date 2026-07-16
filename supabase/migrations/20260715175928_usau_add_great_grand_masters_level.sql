-- Great Grand Masters becomes its own competition level (was folded into
-- GRAND_MASTERS during the 2026-07-06 historical backfill). Additive, one-way
-- enum extension. The re-tag of existing GGM rows runs as a separate step so
-- this value is committed before it is referenced.
ALTER TYPE usau_competition_level ADD VALUE IF NOT EXISTS 'GREAT_GRAND_MASTERS';
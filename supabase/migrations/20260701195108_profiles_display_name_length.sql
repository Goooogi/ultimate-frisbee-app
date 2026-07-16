-- DB-level backstop for display_name length. The app (setDisplayName) enforces
-- 1–60 chars + a profanity filter, but that runs client-side — a user hitting
-- PostgREST directly could otherwise set an oversized display_name that shows
-- on the public leaderboard (via owner_display_name resync). Profanity can't be
-- a constraint, but length can: cap it so a giant string can't break the UI.
-- Existing data max is 15 chars, so this validates cleanly. NULL allowed
-- (display_name is nullable; trigger backfills from email local-part).
alter table public.profiles
  add constraint profiles_display_name_length
  check (display_name is null or char_length(display_name) between 1 and 60);
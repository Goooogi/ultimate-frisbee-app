-- USAU bracket placeholder text — persist what USAU posts in a TBD bracket
-- cell so the full bracket renders with its own wording before teams land.
--
-- play.usaultimate.org puts the placeholder as PLAIN TEXT (no <a>) inside the
-- [data-type="game-team-home"/"game-team-away"] span:
--   "P1 of Saturday Pool Play Pool A"   pool-fed opening slot
--   "W of Quarterfinals G1"             winner-fed slot
--   "L of Ninth Place Semifinals G2"    loser-fed placement slot
-- Verified 2026-08-18 on 2026 Elite Select Challenge (Men). The scraper
-- (sync-event-details) captures it only when the side has no team link and
-- writes null once the team is seeded, so stale text self-clears.

alter table usau_games
  add column if not exists team_a_placeholder text,
  add column if not exists team_b_placeholder text;

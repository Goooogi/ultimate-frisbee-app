-- Distinct (team, year) pairs with player counts for the 12-0 spin pool.
-- Previously listTeamYears() pulled every player row and grouped client-side,
-- but supabase-js caps a select at 1000 rows — with 7905 rows ordered year DESC,
-- only ~2023-2025 survived the cap, so the spin only ever landed on recent years.
-- This view returns ~275 rows (one per team-year), well under any cap.
create or replace view public.twelve_oh_team_years as
select team_slug, team_abbr, year, count(*)::int as player_count
from public.twelve_oh_players
group by team_slug, team_abbr, year;

-- Views inherit the underlying table's RLS (twelve_oh_players is public-read),
-- but grant select explicitly for anon + authenticated to be safe.
grant select on public.twelve_oh_team_years to anon, authenticated;
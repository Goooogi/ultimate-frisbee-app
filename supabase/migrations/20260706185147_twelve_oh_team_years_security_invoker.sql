-- Security-review follow-up: run the spin-pool view with the querying role's
-- rights so a future tightening of twelve_oh_players' RLS policy can never be
-- silently bypassed through the view (matches profiles_public convention).
alter view public.twelve_oh_team_years set (security_invoker = on);
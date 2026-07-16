-- The roster-caps trigger function must never be invoked directly via RPC.
-- Trigger functions execute as part of the table's trigger, not as a caller RPC,
-- so no role needs EXECUTE. Revoke it from the API roles to clear the
-- anon/authenticated SECURITY DEFINER-executable advisory for this function.
revoke execute on function public.fantasy_enforce_roster_caps() from anon, authenticated, public;

-- The two boolean helpers (fantasy_owns_team, fantasy_roster_is_valid) are
-- intentionally callable — they mirror the existing is_team_member/is_team_editor
-- pattern, evaluate against auth.uid() (null-safe for anon), and only expose
-- data that is already public-readable. Left executable by design.
-- ─────────────────────────────────────────────────────────────────────────────
-- Fantasy expansion, migration 9 of 9 — anon revoke sweep.
--
-- Same recurring class of issue as 20260815015543 / 20260827020000: Supabase's
-- ALTER DEFAULT PRIVILEGES auto-grants EXECUTE directly to anon on every new
-- function, bypassing "REVOKE ... FROM PUBLIC". Explicitly revoke from anon
-- on every client-facing RPC added in this expansion (all reject
-- auth.uid() IS NULL first, so not exploitable, but anon should not be able
-- to invoke them at all) and, separately, revoke internal helpers from
-- anon/authenticated/public entirely (SECURITY DEFINER callers execute as
-- owner regardless of caller grants — the client grant only widens surface).
--
-- Exceptions: fantasy_is_commissioner_of_folder keeps its authenticated grant
-- (used directly in storage RLS policies); fantasy_h2h_standings keeps its
-- anon+authenticated grant (public standings read, no auth required).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Client-facing RPCs: revoke from anon only (keep authenticated) ───────────
revoke execute on function public.fantasy_set_contest_limits(uuid, int, boolean) from anon;
revoke execute on function public.fantasy_set_league_logo(uuid, text, text) from anon;
revoke execute on function public.fantasy_set_contest_format(uuid, text) from anon;
revoke execute on function public.fantasy_generate_schedule(uuid) from anon;
revoke execute on function public.fantasy_draft_readiness(uuid) from anon;
revoke execute on function public.fantasy_reschedule_draft(uuid, timestamptz) from anon;
revoke execute on function public.fantasy_schedule_auction_draft(uuid, timestamptz, int, int, int, int, int) from anon;
revoke execute on function public.fantasy_set_draft_prices(uuid, jsonb) from anon;
revoke execute on function public.fantasy_nominate(uuid, text, text, text, int) from anon;
revoke execute on function public.fantasy_bid(uuid, int) from anon;
revoke execute on function public.fantasy_resolve_auction(uuid) from anon;
revoke execute on function public.fantasy_get_open_nomination(uuid) from anon;
revoke execute on function public.fantasy_get_nomination_bids(uuid) from anon;
revoke execute on function public.fantasy_add_drop(uuid, text, text, text, text, text) from anon;

-- ── Internal helpers: revoke from anon, authenticated, public entirely ───────
revoke execute on function public.fantasy_teams_enforce_contest_cap() from anon, authenticated, public;
revoke execute on function public.fantasy_teams_guard_delete() from anon, authenticated, public;
revoke execute on function public.fantasy_contest_team_limits(uuid) from anon, authenticated, public;
revoke execute on function public.fantasy_draft_seed_ownership(uuid) from anon, authenticated, public;
revoke execute on function public.fantasy_generate_schedule_internal(uuid) from anon, authenticated, public;
revoke execute on function public.fantasy_draft_rosters_ready(uuid) from anon, authenticated, public;
revoke execute on function public.fantasy_draft_source_label(text) from anon, authenticated, public;
revoke execute on function public.fantasy_draft_default_at(uuid) from anon, authenticated, public;
revoke execute on function public.fantasy_draft_best_available(uuid, public.fantasy_contests) from anon, authenticated, public;
revoke execute on function public.fantasy_draft_on_complete(uuid, public.fantasy_contests) from anon, authenticated, public;
revoke execute on function public.fantasy_auction_team_to_nominate(uuid) from anon, authenticated, public;
revoke execute on function public.fantasy_auction_team_state(uuid, uuid) from anon, authenticated, public;
revoke execute on function public.fantasy_auction_advance(uuid) from anon, authenticated, public;
revoke execute on function public.fantasy_draft_earliest_at(uuid) from anon, authenticated, public;

-- ── Exceptions: kept as-is (documented above) ─────────────────────────────────
-- fantasy_is_commissioner_of_folder: authenticated grant preserved (storage RLS).
-- fantasy_h2h_standings: anon + authenticated grant preserved (public standings).

notify pgrst, 'reload schema';

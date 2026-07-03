-- Audit 2026-07-02 — SAFE migration batch (no behavior change)
--
-- Applied to efjipdmylkqwmupvoxab. Reference copy per sql/README.md convention.
-- Every change here is either purely additive (indexes) or preserves identical
-- allow/deny semantics (RLS rewrites verified clause-by-clause against the live
-- pg_policies at apply time). No REST-visible behavior change → safe for the
-- shared mobile backend.

-- ─────────────────────────────────────────────────────────────────────────
-- A. Missing FK indexes on hot join paths
--    (verified: none of these existed prior; confirmed against app query code)
-- ─────────────────────────────────────────────────────────────────────────
create index if not exists usau_games_team_a_idx        on public.usau_games (team_a_id);
create index if not exists usau_games_team_b_idx        on public.usau_games (team_b_id);
create index if not exists usau_rosters_player_idx      on public.usau_rosters (player_id);
create index if not exists usau_rankings_team_idx       on public.usau_rankings (team_id);
create index if not exists ufa_games_away_team_idx      on public.ufa_games (away_team_id);
create index if not exists ufa_games_home_team_idx      on public.ufa_games (home_team_id);
create index if not exists fantasy_leagues_owner_idx    on public.fantasy_leagues (owner_id);
create index if not exists pb_team_invites_invited_by_idx on public.pb_team_invites (invited_by);
create index if not exists player_content_reviewed_by_idx on public.player_content (reviewed_by);

-- ─────────────────────────────────────────────────────────────────────────
-- B. player_content RLS: consolidate multiple-permissive policies +
--    wrap auth.uid() in (select …) to stop per-row re-evaluation.
--
--    Live policies before (verified):
--      SELECT authenticated: is_admin()          (select_admin)
--      SELECT authenticated: uploaded_by=auth.uid (select_own)
--      SELECT anon+auth:      status='approved'    (select_public_approved)
--      DELETE authenticated: is_admin()           (delete_admin)
--      DELETE authenticated: owner AND pending     (delete_owner_pending)
--      INSERT authenticated: owner AND pending AND unreviewed (insert_self_pending)
--    After: one combined SELECT + one anon SELECT; one combined DELETE;
--    INSERT rewritten with (select auth.uid()). UPDATE (admin) untouched.
-- ─────────────────────────────────────────────────────────────────────────
drop policy if exists player_content_select_admin           on public.player_content;
drop policy if exists player_content_select_own             on public.player_content;
drop policy if exists player_content_select_public_approved on public.player_content;

-- Authenticated: admin sees all, owner sees own, everyone sees approved.
create policy player_content_select_combined on public.player_content
  for select to authenticated
  using (
    is_admin()
    or uploaded_by = (select auth.uid())
    or status = 'approved'::player_content_status
  );

-- Anon keeps its own approved-only read path (was folded into the old shared policy).
create policy player_content_select_approved_anon on public.player_content
  for select to anon
  using (status = 'approved'::player_content_status);

drop policy if exists player_content_delete_admin         on public.player_content;
drop policy if exists player_content_delete_owner_pending on public.player_content;

create policy player_content_delete_combined on public.player_content
  for delete to authenticated
  using (
    is_admin()
    or (uploaded_by = (select auth.uid()) and status = 'pending'::player_content_status)
  );

drop policy if exists player_content_insert_self_pending on public.player_content;

create policy player_content_insert_self_pending on public.player_content
  for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and status = 'pending'::player_content_status
    and reviewed_by is null
    and reviewed_at is null
  );

-- ─────────────────────────────────────────────────────────────────────────
-- C. Lock mutable search_path on the two invoker-rights public RPCs.
--    NOTE: pinned to `public`, NOT `''` — both functions reference public
--    tables unqualified (e.g. `from usau_events`), so an empty search_path
--    breaks them. A pinned `public` is still non-mutable (clears the advisor)
--    and resolves their references. (Verified: '' broke them at apply time.)
-- ─────────────────────────────────────────────────────────────────────────
alter function public.top_usau_club_teams(p_gender_division text, p_limit integer) set search_path = public;
alter function public.distinct_usau_seasons() set search_path = public;

-- ─────────────────────────────────────────────────────────────────────────
-- D. Revoke EXECUTE from PUBLIC/anon/authenticated on trigger &
--    event-trigger functions (not RPC-callable; least-privilege hygiene).
--    postgres (owner) + service_role retain access; triggers fire regardless.
-- ─────────────────────────────────────────────────────────────────────────
revoke execute on function public.check_player_content_rate_limit() from public, anon, authenticated;
revoke execute on function public.guard_profile_role_change()       from public, anon, authenticated;
revoke execute on function public.set_player_content_updated_at()   from public, anon, authenticated;
revoke execute on function public.rls_auto_enable()                 from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Correction 4 (from Hunter, post-report): fantasy_league_invites needs a
-- SELECT policy after all — "no client policies at all" was too strict. The
-- Resend-sending server action (mirrors src/app/playbook/teams/actions.ts,
-- runs under the caller's session client) needs to re-verify a token belongs
-- to the expected (league, email) pair and count the caller's recent invites
-- for rate limiting; the league admin UI needs to list pending invites. Both
-- are commissioner-on-their-own-league read paths, not general public reads.
--
-- Writes are unchanged — still RPC/service-role only, no client
-- INSERT/UPDATE/DELETE policies on this table.
-- ─────────────────────────────────────────────────────────────────────────────

create policy "fantasy_league_invites select commissioner"
  on public.fantasy_league_invites for select
  to authenticated
  using (public.fantasy_is_commissioner(league_id));

notify pgrst, 'reload schema';

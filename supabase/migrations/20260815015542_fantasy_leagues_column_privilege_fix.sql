-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: column-level REVOKE SELECT (invite_token) had no effect because
-- anon/authenticated still held the table-level SELECT grant Supabase applies
-- by default to every new table — a table-level grant supersedes a narrower
-- column-level revoke in Postgres. invite_token was actually still readable
-- via PostgREST this whole time (RLS restricts rows, not columns).
--
-- Fix: revoke table-level SELECT, then grant SELECT back only on the
-- explicit safe column list (everything except invite_token). RLS policies
-- still govern which ROWS are visible; this governs which COLUMNS are.
-- ─────────────────────────────────────────────────────────────────────────────

revoke select on public.fantasy_leagues from anon, authenticated;

grant select (id, owner_id, name, created_at) on public.fantasy_leagues to anon, authenticated;

notify pgrst, 'reload schema';

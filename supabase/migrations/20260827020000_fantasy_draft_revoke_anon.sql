-- Revoke the anon EXECUTE that Supabase's default privileges auto-grant on
-- new functions (bypasses REVOKE FROM PUBLIC). 4th recurrence of this class
-- (last: 20260815015543). Not exploitable — every draft RPC rejects
-- auth.uid() IS NULL first — but anon should not be able to invoke them at
-- all. Flagged by security review 2026-08-27.
revoke execute on function public.fantasy_schedule_draft(uuid, timestamptz, int, int) from anon;
revoke execute on function public.fantasy_start_draft(uuid) from anon;
revoke execute on function public.fantasy_make_pick(uuid, text, text, text) from anon;
revoke execute on function public.fantasy_resolve_clock(uuid) from anon;
revoke execute on function public.fantasy_set_queue(uuid, jsonb) from anon;

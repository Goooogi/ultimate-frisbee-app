-- The previous AFTER INSERT trigger seeded team_members with the owner.
-- That works for the row insert itself but PostgREST's `.insert(..).select(..)`
-- evaluates the SELECT policy on the RETURNING phase, and the SELECT policy
-- is `is_team_member(id)` — which queries team_members. The AFTER trigger
-- runs late enough that some statement-level visibility nuances can cause
-- PostgREST to report the row as invisible, producing
-- "new row violates row-level security policy for table teams" — the
-- standard Supabase wording for "row inserted but not returnable".
--
-- Fix: drop the trigger-based seeding and instead make the SELECT policy
-- accept "I am the owner" as a sufficient view condition. The owner can
-- always see their team; non-owners still need is_team_member. We still
-- want the membership row for the owner (so they show up in rosters and
-- can be removed/transferred later), so we keep that — but now seed it via
-- a BEFORE INSERT trigger so it exists before SELECT-policy evaluation on
-- RETURNING, AND broaden the SELECT predicate as a belt-and-braces guard.

drop trigger if exists teams_seed_owner on public.teams;

-- New: seed owner membership in a BEFORE trigger. We can't write to
-- team_members in a BEFORE INSERT on teams because the teams.id doesn't
-- exist yet — so we do this in two parts:
--   1. BEFORE: assign new.id := coalesce(new.id, gen_random_uuid()) so we
--      know the id up front.
--   2. AFTER: insert the membership row.
-- ... but the original problem with AFTER triggers was about visibility
-- inside the same statement. So actually keep AFTER for the team_members
-- write (it still runs inside the same txn), and just broaden the SELECT
-- policy below. That's the real fix.

create trigger teams_seed_owner
  after insert on public.teams
  for each row execute function public.handle_new_team();

-- Belt-and-braces: a team is selectable by the owner OR any member.
-- This means the RETURNING phase of an INSERT-by-owner will always be
-- visible to the inserter regardless of when the member row gets seeded.
drop policy if exists "teams_select_member" on public.teams;

create policy "teams_select_owner_or_member"
  on public.teams for select to authenticated
  using (
    owner_id = (select auth.uid())
    or public.is_team_member(id)
  );

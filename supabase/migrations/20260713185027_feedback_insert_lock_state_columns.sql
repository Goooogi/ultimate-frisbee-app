-- Restore the original (create_feedback_table) insert lock: a user submitting
-- feedback may only create an UN-TRIAGED row as themselves. Without the extra
-- clauses, a user bypassing the modal (raw REST) could POST their own row with
-- status='resolved' or a forged reviewed_by, hiding it from the admin triage
-- count. Blast radius is their own row only, but this closes it cleanly.
alter policy feedback_insert_self on public.feedback
  with check (
    user_id = (select auth.uid())
    and status = 'new'
    and reviewed_by is null
    and reviewed_at is null
  );
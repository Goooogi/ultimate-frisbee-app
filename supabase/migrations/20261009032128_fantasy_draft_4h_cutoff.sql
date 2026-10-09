-- Fantasy drafts must be held at least 4 hours before the event starts
-- (Hunter, 2026-10-08). With a 90-second clock, a draft started at the cutoff
-- still finishes well before the event's roster lock, so draft completion
-- never has to seed rosters into a locked period. This replaces the
-- "seed past the lock" idea.
-- APPLIED to prod 2026-10-08 (remote version 20261009032128); a rollback-only
-- dry run of 4 scenarios passed first.
--
--   * schedule_draft / schedule_auction_draft / reschedule_draft: the draft
--     time must be at or before (event lock − 4 h), and scheduling closes at
--     the cutoff.
--   * start_draft refuses after the cutoff.
--   * draft_default_at never suggests a time after the cutoff.
--   * draft_readiness returns the cutoff as lock_at for event contests. Both
--     apps use it only as the date picker's max, so they pick up the rule with
--     no client change. Weekly contests are unchanged (they have no event lock).
--
-- Patched IN PLACE from LIVE definitions (md5 asserted; anchors must occur
-- exactly once). Live md5(prosrc) (2026-10-08):
--   fantasy_schedule_draft         73f2e2ef2c3bcc664ef717d5ada06c0f
--   fantasy_schedule_auction_draft 1921db407c99e8950763ded0b241edc7
--   fantasy_start_draft            40ed1533c7bd24e19ca0bc9f4c03eeaf
--   fantasy_reschedule_draft       ea6c4ecd86d1084c9906e202dfaedfed
--   fantasy_draft_default_at       23acbfe0bef079b900755d90436f13d9
--   fantasy_draft_readiness        29093951aec3138862b02ab6c78eb9d8

create or replace function pg_temp.assert_md5(p_fn regprocedure, p_md5 text)
returns void
language plpgsql
as $$
begin
  if (select md5(prosrc) from pg_proc where oid = p_fn) <> p_md5 then
    raise exception '% changed since it was read (md5 mismatch) — re-read before patching', p_fn;
  end if;
end;
$$;

create or replace function pg_temp.replace_once(p_src text, p_old text, p_new text, p_what text)
returns text
language plpgsql
as $$
begin
  if (length(p_src) - length(replace(p_src, p_old, ''))) / length(p_old) <> 1 then
    raise exception '%: anchor not found exactly once — aborting rather than guessing', p_what;
  end if;
  return replace(p_src, p_old, p_new);
end;
$$;

do $mig$
declare
  v text;
  fn text;
  closed_old constant text :=
'  if v_lock is not null and now() >= v_lock then
    raise exception ''the tournament has started — drafting is closed'';
  end if;';
  closed_new constant text :=
'  -- Drafts run at least 4 hours before the event starts, so one always
  -- finishes before rosters lock (Hunter, 2026-10-08).
  if v_lock is not null and now() >= v_lock - interval ''4 hours'' then
    raise exception ''drafting closes 4 hours before the event starts'';
  end if;';
  at_old constant text :=
'  if p_at is not null and v_lock is not null and p_at >= v_lock then
    raise exception ''the draft must start before the tournament begins — pick an earlier time'';
  end if;';
  at_new constant text :=
'  if p_at is not null and v_lock is not null and p_at > v_lock - interval ''4 hours'' then
    raise exception ''drafts must start at least 4 hours before the event — pick an earlier time'';
  end if;';
begin
  perform pg_temp.assert_md5('public.fantasy_schedule_draft(uuid, timestamptz, integer, integer)', '73f2e2ef2c3bcc664ef717d5ada06c0f');
  perform pg_temp.assert_md5('public.fantasy_schedule_auction_draft(uuid, timestamptz, integer, integer, integer, integer, integer)', '1921db407c99e8950763ded0b241edc7');
  perform pg_temp.assert_md5('public.fantasy_start_draft(uuid)', '40ed1533c7bd24e19ca0bc9f4c03eeaf');
  perform pg_temp.assert_md5('public.fantasy_reschedule_draft(uuid, timestamptz)', 'ea6c4ecd86d1084c9906e202dfaedfed');
  perform pg_temp.assert_md5('public.fantasy_draft_default_at(uuid)', '23acbfe0bef079b900755d90436f13d9');
  perform pg_temp.assert_md5('public.fantasy_draft_readiness(uuid)', '29093951aec3138862b02ab6c78eb9d8');

  foreach fn in array array[
    'public.fantasy_schedule_draft(uuid, timestamptz, integer, integer)',
    'public.fantasy_schedule_auction_draft(uuid, timestamptz, integer, integer, integer, integer, integer)'
  ] loop
    v := pg_get_functiondef(fn::regprocedure);
    v := pg_temp.replace_once(v, closed_old, closed_new, fn || ' cutoff');
    v := pg_temp.replace_once(v, at_old, at_new, fn || ' draft time');
    execute v;
  end loop;

  v := pg_get_functiondef('public.fantasy_start_draft(uuid)'::regprocedure);
  v := pg_temp.replace_once(v, closed_old, closed_new, 'fantasy_start_draft cutoff');
  execute v;

  v := pg_get_functiondef('public.fantasy_reschedule_draft(uuid, timestamptz)'::regprocedure);
  v := pg_temp.replace_once(v,
'  if v_lock is not null and p_at >= v_lock then
    raise exception ''the draft must start before the tournament begins — pick an earlier time'';
  end if;',
'  -- At least 4 hours before the event starts (Hunter, 2026-10-08).
  if v_lock is not null and p_at > v_lock - interval ''4 hours'' then
    raise exception ''drafts must start at least 4 hours before the event — pick an earlier time'';
  end if;',
    'fantasy_reschedule_draft cutoff');
  execute v;

  v := pg_get_functiondef('public.fantasy_draft_default_at(uuid)'::regprocedure);
  v := pg_temp.replace_once(v,
'    if v_at >= v_start_date::timestamp at time zone ''America/New_York'' then
      return null;  -- no slot left before the tournament''s only lock
    end if;',
'    if v_at > (v_start_date::timestamp at time zone ''America/New_York'') - interval ''4 hours'' then
      return null;  -- no slot left 4 hours before the tournament''s only lock
    end if;',
    'fantasy_draft_default_at cutoff');
  execute v;

  v := pg_get_functiondef('public.fantasy_draft_readiness(uuid)'::regprocedure);
  v := pg_temp.replace_once(v,
'  where p.contest_id = p_contest and p.period = ''event'';

  if v_lock is null then',
'  where p.contest_id = p_contest and p.period = ''event'';
  -- Event contests: the latest a draft may be held (4 h before the event).
  v_lock := v_lock - interval ''4 hours'';

  if v_lock is null then',
    'fantasy_draft_readiness cutoff');
  execute v;
end;
$mig$;

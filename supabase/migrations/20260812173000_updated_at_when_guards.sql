-- WHEN guards on set_updated_at triggers (item 5 of the 2026-08-12 fix queue).
--
-- These BEFORE UPDATE triggers stamped updated_at on EVERY update statement,
-- including no-op re-ingest upserts that write a row back identical to what was
-- already there. Because the trigger changes updated_at, the row is never
-- actually identical by the time Postgres compares it — so a no-op upsert still
-- produced a real heap write, WAL traffic and a dead tuple. That is the same
-- class of waste as the blind upserts in the ingest functions themselves.
--
-- WHEN (old.* is distinct from new.*) makes the trigger fire only when the
-- incoming row genuinely differs, matching the convention already used by the
-- _stale_player_profile triggers.
--
-- Scope: our own USAU + playbook tables only. Deliberately NOT touching
-- storage.objects (Supabase-managed) — that trigger is theirs, not ours.
do $$
declare
  r record;
begin
  for r in
    select c.relname as tbl, t.tgname, n.nspname as sch
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = t.tgfoid
    where not t.tgisinternal
      and n.nspname = 'public'
      and p.proname in ('set_updated_at', 'update_updated_at_column', 'handle_updated_at')
      and (t.tgtype & 16) > 0        -- BEFORE UPDATE
      and t.tgqual is null           -- no WHEN clause yet
  loop
    execute format('drop trigger %I on %I.%I', r.tgname, r.sch, r.tbl);
    execute format(
      'create trigger %I before update on %I.%I for each row '
      || 'when (old.* is distinct from new.*) execute function public.set_updated_at()',
      r.tgname, r.sch, r.tbl
    );
    raise notice 'guarded %.%', r.tbl, r.tgname;
  end loop;
end $$;

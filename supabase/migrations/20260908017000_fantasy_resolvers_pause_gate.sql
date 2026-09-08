-- Lazy resolvers are a clean no-op while the commissioner has the draft
-- paused (otherwise an expired clock would still advance turns).
do $$
declare v_def text; v_new text;
begin
  select pg_get_functiondef(oid) into v_def from pg_proc
  where proname = 'fantasy_resolve_clock' and pronamespace = 'public'::regnamespace;
  if v_def not like '%paused_at is not null%' then
    v_new := replace(v_def,
      E'  if v_draft.draft_type <> ''snake'' then\n    return 0;\n  end if;',
      E'  if v_draft.draft_type <> ''snake'' or v_draft.paused_at is not null then\n    return 0;\n  end if;');
    if v_new = v_def then raise exception 'fantasy_resolve_clock anchor not found'; end if;
    execute v_new;
  end if;

  select pg_get_functiondef(oid) into v_def from pg_proc
  where proname = 'fantasy_auction_advance' and pronamespace = 'public'::regnamespace;
  if v_def not like '%paused_at is not null%' then
    v_new := replace(v_def,
      'if not found or v_draft.status <> ''live'' or v_draft.draft_type <> ''auction'' then',
      'if not found or v_draft.status <> ''live'' or v_draft.draft_type <> ''auction'' or v_draft.paused_at is not null then');
    if v_new = v_def then raise exception 'fantasy_auction_advance anchor not found'; end if;
    execute v_new;
  end if;
end $$;

notify pgrst, 'reload schema';

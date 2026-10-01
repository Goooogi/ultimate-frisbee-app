-- UTCG Phase 2 security-review fixes (2026-09-30).
--   HIGH  utcg_sbc_submit: one-time / weekly-limit checks were unlocked
--         check-then-insert — concurrent submits could redeem a one-time SBC
--         twice. Now serialized on the caller's wallet row first.
--   LOW   utcg_evolution_start: same race on the 3-in-progress cap → wallet lock.
--   LOW   evolution progress was uncapped (unlimited Brawl/Boss plays): at most
--         10 counted games per evolving card per UTC day.
--   LOW   a parked Rivals squad's cards could be SBC'd/listed away while it
--         kept defending on stored strength → the parked-card lock now covers
--         every open squad, any mode.
--   LOW   the boss squad was recomputed on every page read → cached per week
--         in utcg_boss_weeks (filled by utcg_refresh_week_content / first use).
--   LOW   evolution boost stacked past the +6 boost cap → total boost on a
--         card (TOTW + Live + Evolution) is capped at +8.
-- prosrc patches from the LIVE bodies — same pattern as 20260922200000.

create or replace function pg_temp.utcg_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $patch$
declare v_oid oid; v_def text;
begin
  v_oid := to_regprocedure(p_sig);
  if v_oid is null then raise exception '% not found', p_sig; end if;
  v_def := pg_get_functiondef(v_oid);
  if position(p_new in v_def) > 0 then
    raise notice '% already patched: %', p_sig, left(p_new, 60); return;
  end if;
  if (length(v_def) - length(replace(v_def, p_old, ''))) / length(p_old) <> 1 then
    raise exception '% anchor not unique: %', p_sig, left(p_old, 80);
  end if;
  execute replace(v_def, p_old, p_new);
end $patch$;

-- HIGH: serialize a user's SBC submits before the completion / limit checks.
select pg_temp.utcg_patch('public.utcg_sbc_submit(text,jsonb)',
$o$  req := d.requirements;
$o$,
$n$  req := d.requirements;
  perform public.utcg_ensure_wallet();
  perform 1 from public.utcg_wallets where user_id = uid for update;
$n$);

select pg_temp.utcg_patch('public.utcg_evolution_start(text,text,text,integer)',
$o$  if d is null then raise exception 'evolution not found'; end if;
$o$,
$n$  if d is null then raise exception 'evolution not found'; end if;
  perform public.utcg_ensure_wallet();
  perform 1 from public.utcg_wallets where user_id = uid for update;
$n$);

-- Parked-card lock: any open squad (staked or Rivals).
select pg_temp.utcg_patch('public.utcg_market_take_card(uuid,text,text,text,integer,integer)',
$o$    where s.user_id = p_user and s.consumed_at is null and s.staked_coins > 0
      and c->>'player_id' = p_player_id$o$,
$n$    where s.user_id = p_user and s.consumed_at is null
      and c->>'player_id' = p_player_id$n$);
select pg_temp.utcg_patch('public.utcg_sbc_submit(text,jsonb)',
$o$      where s.user_id = uid and s.consumed_at is null and s.staked_coins > 0
        and x->>'player_id' = c.player_id$o$,
$n$      where s.user_id = uid and s.consumed_at is null
        and x->>'player_id' = c.player_id$n$);

-- Evolution progress: ≤ 10 counted games per card per UTC day.
alter table public.utcg_card_evolutions
  add column if not exists games_day date,
  add column if not exists games_today int not null default 0;

create or replace function public.utcg_evolution_progress(p_uid uuid, p_cards jsonb)
returns void
language plpgsql
set search_path to 'public'
as $function$
declare e record; st jsonb; new_stage int; new_boost numeric; last_idx int; today_n int;
begin
  for e in
    select ev.*, d.stages from public.utcg_card_evolutions ev
    join public.utcg_evolution_defs d on d.key = ev.evo_key
    where ev.user_id = p_uid and ev.completed_at is null
      and exists (select 1 from jsonb_array_elements(p_cards) x
                  where x->>'player_id' = ev.player_id and x->>'team_slug' = ev.team_slug
                    and (x->>'year')::int = ev.year)
    for update of ev
  loop
    today_n := case when e.games_day is distinct from current_date then 0 else e.games_today end;
    continue when today_n >= 10;
    new_stage := 0; new_boost := 0;
    last_idx := jsonb_array_length(e.stages);
    for i in 1..last_idx loop
      st := e.stages -> (i - 1);
      if e.games + 1 >= (st->>'games')::int then
        new_stage := i; new_boost := (st->>'boost')::numeric;
      end if;
    end loop;
    update public.utcg_card_evolutions
      set games = e.games + 1, stage = new_stage, boost = new_boost,
          games_day = current_date, games_today = today_n + 1,
          completed_at = case when new_stage = last_idx then now() end
      where user_id = p_uid and player_id = e.player_id and team_slug = e.team_slug and year = e.year;
  end loop;
end $function$;
revoke execute on function public.utcg_evolution_progress(uuid, jsonb) from public, anon, authenticated;

-- Total boost cap +8 (TOTW/Live are already capped +6 inside utcg_card_boost).
do $eval$
declare
  v_oid oid := to_regprocedure('public.utcg_eval_lineup(text,jsonb)');
  v_def text;
  c_old constant text :=
       E'    card.score := card.score + public.utcg_card_boost(elem->>''player_id'', elem->>''team_slug'', (elem->>''year'')::int);\n'
    || E'    card.score := card.score + coalesce((select e.boost from public.utcg_card_evolutions e\n'
    || E'      where e.user_id = nullif(current_setting(''utcg.eval_uid'', true), '''')::uuid\n'
    || E'        and e.player_id = elem->>''player_id'' and e.team_slug = elem->>''team_slug''\n'
    || E'        and e.year = (elem->>''year'')::int), 0);\n';
  c_new constant text :=
       E'    card.score := card.score + least(8,\n'
    || E'      public.utcg_card_boost(elem->>''player_id'', elem->>''team_slug'', (elem->>''year'')::int)\n'
    || E'      + coalesce((select e.boost from public.utcg_card_evolutions e\n'
    || E'        where e.user_id = nullif(current_setting(''utcg.eval_uid'', true), '''')::uuid\n'
    || E'          and e.player_id = elem->>''player_id'' and e.team_slug = elem->>''team_slug''\n'
    || E'          and e.year = (elem->>''year'')::int), 0));\n';
begin
  v_def := pg_get_functiondef(v_oid);
  if position(c_new in v_def) > 0 then raise notice 'eval_lineup already capped'; return; end if;
  if (length(v_def) - length(replace(v_def, c_old, ''))) / length(c_old) <> 1 then
    raise exception 'eval_lineup boost block anchor not unique';
  end if;
  execute replace(v_def, c_old, c_new);
end
$eval$;

-- Boss cache: computed once per ISO week.
create table if not exists public.utcg_boss_weeks (
  week_index int primary key,
  squad jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.utcg_boss_weeks enable row level security;
revoke all on public.utcg_boss_weeks from anon, authenticated;

create or replace function public.utcg_boss_current()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare wi int := public.utcg_week_index(); sq jsonb;
begin
  select squad into sq from public.utcg_boss_weeks where week_index = wi;
  if sq is null then
    sq := public.utcg_boss_squad(wi);
    if sq is not null then
      insert into public.utcg_boss_weeks (week_index, squad) values (wi, sq)
        on conflict (week_index) do nothing;
    end if;
  end if;
  return sq;
end $function$;
revoke execute on function public.utcg_boss_current() from public, anon, authenticated;

-- Read path uses the cache only (no insert from a STABLE read); the daily job fills it.
create or replace function public.utcg_boss_cached()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(
    (select squad from public.utcg_boss_weeks where week_index = public.utcg_week_index()),
    public.utcg_boss_squad(public.utcg_week_index()));
$function$;
revoke execute on function public.utcg_boss_cached() from public, anon, authenticated;

select pg_temp.utcg_patch('public.utcg_boss_play(text,jsonb)',
$o$  boss := public.utcg_boss_squad(public.utcg_week_index());$o$,
$n$  boss := public.utcg_boss_current();$n$);
select pg_temp.utcg_patch('public.utcg_weekly_state()',
$o$  boss := public.utcg_boss_squad(public.utcg_week_index());$o$,
$n$  boss := public.utcg_boss_cached();$n$);
select pg_temp.utcg_patch('public.utcg_refresh_week_content()',
$o$  if exists (select 1 from public.utcg_card_boosts where source = 'totw' and starts_on = wk_start) then
    return;
  end if;$o$,
$n$  if exists (select 1 from public.utcg_card_boosts where source = 'totw' and starts_on = wk_start) then
    perform public.utcg_boss_current();
    return;
  end if;$n$);
select pg_temp.utcg_patch('public.utcg_refresh_week_content()',
$o$    on conflict (key) do nothing;
end $function$$o$,
$n$    on conflict (key) do nothing;
  perform public.utcg_boss_current();
end $function$$n$);

select public.utcg_refresh_week_content();

notify pgrst, 'reload schema';

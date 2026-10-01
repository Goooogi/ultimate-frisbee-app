-- UTCG Phase 0.1 — Draft was coin-positive for everyone (live EV ≈ 197 on a
-- 150 entry, uncapped). Rebalanced from a 1000-run simulation against the live
-- deal + eval_lineup (vault: UTCG Economy & Modes Proposal):
--   targets 77/86/93/97 → 70/90/94/97 (easy round 1, round 2 is the skill wall)
--   rewards 70/130/300/600 → 90/110/140/210, jackpot 500 → 250 (4-0 = 800, 5.3×)
--   greedy drafter ≈ 0.89× entry, random-pick ≈ 0.60×.
-- Plus a daily cap: 5 PAID runs per UTC day; later runs are free practice runs
-- that pay nothing (run.practice), so the mode stays playable past the cap.
-- prosrc patches from the LIVE bodies — same pattern as 20260922200000.

alter table public.utcg_wallets
  add column if not exists draft_paid_today int not null default 0,
  add column if not exists draft_paid_day date;

alter table public.utcg_draft_runs
  add column if not exists practice boolean not null default false;

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

-- draft_start: count paid runs per UTC day; past the cap the run is practice.
select pg_temp.utcg_patch('public.utcg_draft_start(text)',
$o$  entry_fee int := 150;
$o$,
$n$  entry_fee int := 150;
  paid_cap int := 5;
  is_practice boolean;
$n$);

select pg_temp.utcg_patch('public.utcg_draft_start(text)',
$o$  if w.coins < entry_fee then raise exception 'insufficient coins'; end if;
  update public.utcg_wallets set coins = coins - entry_fee where user_id = uid;
$o$,
$n$  if w.draft_paid_day is distinct from current_date then
    w.draft_paid_today := 0;
  end if;
  is_practice := w.draft_paid_today >= paid_cap;
  if not is_practice then
    if w.coins < entry_fee then raise exception 'insufficient coins'; end if;
    update public.utcg_wallets
      set coins = coins - entry_fee,
          draft_paid_today = w.draft_paid_today + 1,
          draft_paid_day = current_date
      where user_id = uid;
  end if;
$n$);

select pg_temp.utcg_patch('public.utcg_draft_start(text)',
$o$  insert into public.utcg_draft_runs (user_id, formation, deals)
    values (uid, p_formation, public.utcg_draft_deal(slot_types[1], array[]::text[]))$o$,
$n$  insert into public.utcg_draft_runs (user_id, formation, deals, practice)
    values (uid, p_formation, public.utcg_draft_deal(slot_types[1], array[]::text[]), is_practice)$n$);

-- draft_play: new ladder; practice runs bank for display but pay 0.
select pg_temp.utcg_patch('public.utcg_draft_play(uuid)',
$o$  targets numeric[] := array[77, 86, 93, 97];
  rewards int[] := array[70, 130, 300, 600];
  jackpot int := 500;$o$,
$n$  targets numeric[] := array[70, 90, 94, 97];
  rewards int[] := array[90, 110, 140, 210];
  jackpot int := 250;$n$);

select pg_temp.utcg_patch('public.utcg_draft_play(uuid)',
$o$    update public.utcg_wallets set coins = coins + new_bank
      where user_id = uid returning * into w;
    update public.utcg_draft_runs
      set round = new_round, bank = new_bank, status = 'complete',
          payout = new_bank, completed_at = now()$o$,
$n$    update public.utcg_wallets
      set coins = coins + case when run.practice then 0 else new_bank end
      where user_id = uid returning * into w;
    update public.utcg_draft_runs
      set round = new_round, bank = new_bank, status = 'complete',
          payout = case when run.practice then 0 else new_bank end,
          completed_at = now()$n$);

select pg_temp.utcg_patch('public.utcg_draft_abandon(uuid)',
$o$  update public.utcg_wallets set coins = coins + run.bank
    where user_id = uid returning * into w;
  update public.utcg_draft_runs
    set status = 'complete', payout = run.bank, completed_at = now()$o$,
$n$  update public.utcg_wallets
    set coins = coins + case when run.practice then 0 else run.bank end
    where user_id = uid returning * into w;
  update public.utcg_draft_runs
    set status = 'complete',
        payout = case when run.practice then 0 else run.bank end,
        completed_at = now()$n$);

notify pgrst, 'reload schema';

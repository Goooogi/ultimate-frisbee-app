-- Applied via MCP 2026-07-22.
-- Draft Gauntlet economy rebalance: make 3+ wins meaningfully harder so a run
-- nets coins (final bank >= 150 entry) only ~60-70% of the time in the long run
-- (was ~80%+ — drafted squads reach ~88.8 avg strength, trivializing the old
-- 76/83/89 targets). Round 3 (target 93) is now the wall; round 4 (97) stays a
-- rare 600 + 500 jackpot prize. Rewards lowered to 70/130/200/600.
-- Modeled end-to-end (realistic best-of-5 drafts): ~66% net-win, ~15% reach 3+.
-- TS display mirror: src/lib/utcg/draft.ts DRAFT_TARGETS / DRAFT_REWARDS.
create or replace function public.utcg_draft_play(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  run public.utcg_draft_runs;
  targets numeric[] := array[77, 86, 93, 97];
  rewards int[] := array[70, 130, 200, 600];
  jackpot int := 500;
  ev jsonb; strength numeric; target numeric; p numeric; won boolean;
  new_round int; new_bank int; done boolean := false; w public.utcg_wallets;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  select * into run from public.utcg_draft_runs
    where id = p_run_id and user_id = uid for update;
  if run is null then raise exception 'run not found'; end if;
  if run.status <> 'playing' then raise exception 'run is not in the gauntlet'; end if;
  if run.round >= 4 then raise exception 'run already finished'; end if;

  ev := public.utcg_eval_lineup(run.formation, run.picks);
  strength := (ev->>'strength')::numeric;
  target := targets[run.round + 1];

  p := 1 / (1 + exp(-(strength - target) / 3.0));
  p := greatest(0.06, least(0.94, p));
  won := random() < p;

  if won then
    new_round := run.round + 1;
    new_bank := run.bank + rewards[new_round];
    if new_round >= 4 then
      new_bank := new_bank + jackpot;
      done := true;
    end if;
  else
    new_round := run.round;
    new_bank := run.bank;
    done := true;
  end if;

  if done then
    update public.utcg_wallets set coins = coins + new_bank
      where user_id = uid returning * into w;
    update public.utcg_draft_runs
      set round = new_round, bank = new_bank, status = 'complete',
          payout = new_bank, completed_at = now()
      where id = run.id returning * into run;
  else
    update public.utcg_draft_runs
      set round = new_round, bank = new_bank
      where id = run.id returning * into run;
  end if;

  return jsonb_build_object(
    'won', won, 'round', run.round, 'bank', run.bank,
    'status', run.status, 'payout', run.payout,
    'opponent_strength', target,
    'chem', (ev->>'chem')::int, 'strength', round(strength, 2),
    'coins', coalesce(w.coins, null));
end $function$;

notify pgrst, 'reload schema';

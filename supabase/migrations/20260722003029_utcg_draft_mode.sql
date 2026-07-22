-- Exact copy of remote migration 20260722003029 (applied via MCP 2026-07-21).
-- UTCG Draft mode: pay entry, draft 7 slots from server-dealt candidate sets,
-- then a 4-match gauntlet vs escalating opponents. Client can only pick an
-- INDEX into the server-dealt set. NOTE: utcg_draft_deal was rewritten onto
-- the utcg_card_pool matview in 20260722003729 — that file has the current def.

create table public.utcg_draft_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  formation text not null check (formation in ('vert','ho','hex','threeTwo')),
  status text not null default 'drafting' check (status in ('drafting','playing','complete')),
  slot_idx int not null default 0 check (slot_idx between 0 and 6),
  deals jsonb not null default '[]'::jsonb,
  picks jsonb not null default '[]'::jsonb,
  round int not null default 0 check (round between 0 and 4),
  bank int not null default 0,
  payout int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index utcg_draft_runs_one_active
  on public.utcg_draft_runs (user_id) where (status <> 'complete');
create index utcg_draft_runs_user_idx on public.utcg_draft_runs (user_id, created_at desc);

alter table public.utcg_draft_runs enable row level security;
create policy "utcg_draft_runs_select_own" on public.utcg_draft_runs
  for select using (auth.uid() = user_id);

create trigger utcg_draft_runs_touch before update on public.utcg_draft_runs
  for each row execute function public.utcg_touch_updated_at();

create or replace function public.utcg_formation_slots(p_formation text)
returns text[]
language sql immutable
set search_path to 'public'
as $function$
  select case p_formation
    when 'vert'     then array['handler','handler','cutter','cutter','cutter','cutter','cutter']
    when 'ho'       then array['handler','handler','handler','cutter','cutter','cutter','cutter']
    when 'hex'      then array['handler','handler','handler','handler','cutter','cutter','cutter']
    when 'threeTwo' then array['handler','handler','cutter','cutter','cutter','cutter','cutter']
    else null end;
$function$;

create or replace function public.utcg_draft_start(p_formation text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  entry_fee int := 150;
  w public.utcg_wallets;
  slot_types text[];
  run public.utcg_draft_runs;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  slot_types := public.utcg_formation_slots(p_formation);
  if slot_types is null then raise exception 'unknown formation %', p_formation; end if;

  if exists (select 1 from public.utcg_draft_runs where user_id = uid and status <> 'complete') then
    raise exception 'draft run already in progress';
  end if;

  perform public.utcg_ensure_wallet();
  select * into w from public.utcg_wallets where user_id = uid for update;
  if w.coins < entry_fee then raise exception 'insufficient coins'; end if;
  update public.utcg_wallets set coins = coins - entry_fee where user_id = uid;

  insert into public.utcg_draft_runs (user_id, formation, deals)
    values (uid, p_formation, public.utcg_draft_deal(slot_types[1], array[]::text[]))
    returning * into run;

  return to_jsonb(run);
end $function$;

create or replace function public.utcg_draft_pick(p_run_id uuid, p_index int)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  run public.utcg_draft_runs;
  slot_types text[];
  chosen jsonb;
  picked_players text[];
begin
  if uid is null then raise exception 'not authenticated'; end if;

  select * into run from public.utcg_draft_runs
    where id = p_run_id and user_id = uid for update;
  if run is null then raise exception 'run not found'; end if;
  if run.status <> 'drafting' then raise exception 'run is not drafting'; end if;
  if p_index is null or p_index < 0 or p_index >= jsonb_array_length(run.deals) then
    raise exception 'invalid pick index';
  end if;

  chosen := run.deals -> p_index;
  run.picks := run.picks || chosen;

  if run.slot_idx >= 6 then
    update public.utcg_draft_runs
      set picks = run.picks, deals = '[]'::jsonb, status = 'playing'
      where id = run.id returning * into run;
  else
    slot_types := public.utcg_formation_slots(run.formation);
    select coalesce(array_agg(x->>'player_id'), array[]::text[])
      into picked_players from jsonb_array_elements(run.picks) x;
    update public.utcg_draft_runs
      set picks = run.picks,
          slot_idx = run.slot_idx + 1,
          deals = public.utcg_draft_deal(slot_types[run.slot_idx + 2], picked_players)
      where id = run.id returning * into run;
  end if;

  return to_jsonb(run);
end $function$;

create or replace function public.utcg_draft_play(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  run public.utcg_draft_runs;
  targets numeric[] := array[76, 83, 89, 94];
  rewards int[] := array[120, 220, 380, 600];
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

create or replace function public.utcg_draft_abandon(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  run public.utcg_draft_runs;
  w public.utcg_wallets;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  select * into run from public.utcg_draft_runs
    where id = p_run_id and user_id = uid for update;
  if run is null then raise exception 'run not found'; end if;
  if run.status = 'complete' then raise exception 'run already complete'; end if;

  update public.utcg_wallets set coins = coins + run.bank
    where user_id = uid returning * into w;
  update public.utcg_draft_runs
    set status = 'complete', payout = run.bank, completed_at = now()
    where id = run.id returning * into run;

  return jsonb_build_object('payout', run.payout, 'coins', w.coins);
end $function$;

notify pgrst, 'reload schema';

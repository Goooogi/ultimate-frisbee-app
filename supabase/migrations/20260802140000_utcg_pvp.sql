-- UTCG PvP — async ladder, 100-coin stake, winner takes 200.
--
-- Design (chosen by Hunter 2026-08-02):
--   * ASYNC ladder. A player submits a squad + stake; the server matches them
--     against another user's PREVIOUSLY STORED squad snapshot and resolves
--     immediately. No lobby, no realtime, playable with a handful of users.
--   * Scoring reuses utcg_eval_lineup — so chemistry AND overall both count,
--     exactly as in Squad Battle. No second scoring implementation to drift.
--   * Tie → higher chem wins; then lower mean_score (scrappier squad); only a
--     dead-exact tie refunds both.
--
-- ECONOMY SAFETY (mirrors the marketplace's posture):
--   * SECURITY DEFINER + locked search_path.
--   * Stake is debited under `for update` on the wallet row; the payout is a
--     separate credited update. A player can never pay twice or be paid twice
--     for one entry because the whole thing is one statement-level transaction.
--   * Card OWNERSHIP is re-verified server-side per entry, same as
--     utcg_record_match — a stored snapshot is never trusted as proof of
--     ownership at payout time.
--   * The opponent's stake was already escrowed when THEY submitted, so the
--     200-coin pot is always fully funded. See utcg_pvp_squads.staked_coins.

-- ── Stored squad snapshots (the "ladder") ────────────────────────────────────
create table if not exists public.utcg_pvp_squads (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  formation     text not null,
  cards         jsonb not null,
  chem          int  not null,
  mean_score    numeric(6,2) not null,
  strength      numeric(8,4) not null,
  -- Coins this snapshot has escrowed and not yet resolved. Funds the pot when
  -- someone challenges it. Zeroed the moment the snapshot is consumed.
  staked_coins  int not null default 0 check (staked_coins >= 0),
  -- A snapshot is consumed by exactly ONE opponent, then retired. Enforced by
  -- the partial unique index below plus the `for update skip locked` claim.
  consumed_at   timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists utcg_pvp_squads_open_idx
  on public.utcg_pvp_squads (strength)
  where consumed_at is null;

-- One OPEN snapshot per user: prevents a user parking N squads to farm the pot.
create unique index if not exists utcg_pvp_squads_one_open_per_user
  on public.utcg_pvp_squads (user_id)
  where consumed_at is null;

-- ── Match history (both sides readable) ──────────────────────────────────────
create table if not exists public.utcg_pvp_matches (
  id              uuid primary key default gen_random_uuid(),
  challenger_id   uuid not null references auth.users(id) on delete cascade,
  defender_id     uuid not null references auth.users(id) on delete cascade,
  challenger_strength numeric(8,4) not null,
  defender_strength   numeric(8,4) not null,
  challenger_chem int not null,
  defender_chem   int not null,
  -- 'challenger' | 'defender' | 'draw'
  outcome         text not null check (outcome in ('challenger','defender','draw')),
  -- How the tie was settled, when it was one: 'strength'|'chem'|'mean'|'draw'
  decided_by      text not null,
  pot             int not null,
  created_at      timestamptz not null default now()
);

create index if not exists utcg_pvp_matches_challenger_idx
  on public.utcg_pvp_matches (challenger_id, created_at desc);
create index if not exists utcg_pvp_matches_defender_idx
  on public.utcg_pvp_matches (defender_id, created_at desc);

-- ── RLS: read-only to the participants; ALL writes go through the RPC ────────
alter table public.utcg_pvp_squads   enable row level security;
alter table public.utcg_pvp_matches  enable row level security;

drop policy if exists utcg_pvp_squads_select_own on public.utcg_pvp_squads;
create policy utcg_pvp_squads_select_own on public.utcg_pvp_squads
  for select using (user_id = auth.uid());

drop policy if exists utcg_pvp_matches_select_participant on public.utcg_pvp_matches;
create policy utcg_pvp_matches_select_participant on public.utcg_pvp_matches
  for select using (challenger_id = auth.uid() or defender_id = auth.uid());

-- No insert/update/delete policies anywhere: the SECURITY DEFINER RPC is the
-- only writer, so a client with the anon key cannot mint squads or matches.

-- ── The one entry point ──────────────────────────────────────────────────────
create or replace function public.utcg_pvp_enter(p_formation text, p_cards jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  stake constant int := 100;
  n int; i int; elem jsonb; owned record;
  ev jsonb; my_chem int; my_mean numeric; my_strength numeric;
  foe public.utcg_pvp_squads;
  w public.utcg_wallets;
  outcome text; decided text; payout int := 0; pot int := 0;
  match_id uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  n := jsonb_array_length(p_cards);
  if n <> 7 then raise exception 'squad must have exactly 7 cards'; end if;

  -- Ownership + duplicate check, identical in spirit to utcg_record_match.
  for i in 0..6 loop
    elem := p_cards -> i;
    select oc.copies into owned
      from public.utcg_owned_cards oc
      where oc.user_id = uid and oc.league = 'ufa'
        and oc.player_id = (elem->>'player_id')
        and oc.team_slug = (elem->>'team_slug')
        and oc.year = (elem->>'year')::int
        and oc.copies >= 1;
    if owned is null then raise exception 'card not owned or invalid: %', elem; end if;

    if exists (
      select 1 from generate_series(0, i-1) j
      where (p_cards->j->>'player_id') = (elem->>'player_id')
        and (p_cards->j->>'team_slug') = (elem->>'team_slug')
        and (p_cards->j->>'year') = (elem->>'year')
    ) then
      raise exception 'duplicate card in squad';
    end if;
  end loop;

  -- Chem + overall, from the SAME evaluator Squad Battle uses.
  ev := public.utcg_eval_lineup(p_formation, p_cards);
  my_chem     := (ev->>'chem')::int;
  my_mean     := (ev->>'mean_score')::numeric;
  my_strength := (ev->>'strength')::numeric;

  -- Refuse a second entry while we already have coins escrowed. Without this,
  -- re-queuing would debit another 100 onto the SAME snapshot while the pot a
  -- challenger can win stays 200 — the extra stake would be unrecoverable.
  if exists (select 1 from public.utcg_pvp_squads
               where user_id = uid and consumed_at is null and staked_coins > 0) then
    raise exception 'you already have a squad staked — wait for a challenger';
  end if;

  -- Take the stake first, under a row lock.
  perform public.utcg_ensure_wallet();
  select * into w from public.utcg_wallets where user_id = uid for update;
  if w.coins < stake then
    raise exception 'insufficient coins: need %, have %', stake, w.coins;
  end if;
  update public.utcg_wallets set coins = coins - stake where user_id = uid;

  -- Claim the closest-strength OPEN snapshot that isn't ours. skip locked so
  -- two simultaneous challengers can never claim the same defender.
  select * into foe
    from public.utcg_pvp_squads s
    where s.consumed_at is null
      and s.user_id <> uid
      and s.staked_coins >= stake
    order by abs(s.strength - my_strength), s.created_at
    limit 1
    for update skip locked;

  if foe is null then
    -- Nobody to play. Park OUR squad as the open snapshot carrying our stake,
    -- so the next challenger has a funded pot. Coins stay debited (escrowed).
    -- Reuse a stale unstaked snapshot if one exists (staked_coins = 0 can only
    -- happen for a row we never funded); otherwise insert. The guard above
    -- guarantees we never ADD to an already-funded snapshot.
    update public.utcg_pvp_squads
      set formation = p_formation,
          cards = p_cards,
          chem = my_chem,
          mean_score = my_mean,
          strength = my_strength,
          staked_coins = stake,
          created_at = now()
      where user_id = uid and consumed_at is null and staked_coins = 0;

    if not found then
      insert into public.utcg_pvp_squads
        (user_id, formation, cards, chem, mean_score, strength, staked_coins)
      values (uid, p_formation, p_cards, my_chem, my_mean, my_strength, stake);
    end if;

    select * into w from public.utcg_wallets where user_id = uid;
    return jsonb_build_object(
      'status', 'queued',
      'chem', my_chem, 'strength', round(my_strength, 2),
      'stake', stake,
      'coins', w.coins, 'packs_opened', w.packs_opened,
      'matches_played', w.matches_played, 'best_wins', w.best_wins
    );
  end if;

  -- Resolve. Tie ladder: strength → chem → lower mean → true draw.
  pot := stake + stake;
  if my_strength > foe.strength then
    outcome := 'challenger'; decided := 'strength';
  elsif my_strength < foe.strength then
    outcome := 'defender';   decided := 'strength';
  elsif my_chem > foe.chem then
    outcome := 'challenger'; decided := 'chem';
  elsif my_chem < foe.chem then
    outcome := 'defender';   decided := 'chem';
  elsif my_mean < foe.mean_score then
    outcome := 'challenger'; decided := 'mean';
  elsif my_mean > foe.mean_score then
    outcome := 'defender';   decided := 'mean';
  else
    outcome := 'draw';       decided := 'draw';
  end if;

  -- Retire the defender's snapshot and release its escrow into the pot.
  update public.utcg_pvp_squads
    set consumed_at = now(), staked_coins = 0
    where id = foe.id;

  if outcome = 'challenger' then
    payout := pot;
    update public.utcg_wallets set coins = coins + payout where user_id = uid;
  elsif outcome = 'defender' then
    payout := 0;
    update public.utcg_wallets set coins = coins + pot where user_id = foe.user_id;
  else
    -- True draw: refund both sides their own stake.
    payout := stake;
    update public.utcg_wallets set coins = coins + stake where user_id = uid;
    update public.utcg_wallets set coins = coins + stake where user_id = foe.user_id;
  end if;

  insert into public.utcg_pvp_matches
    (challenger_id, defender_id, challenger_strength, defender_strength,
     challenger_chem, defender_chem, outcome, decided_by, pot)
  values (uid, foe.user_id, my_strength, foe.strength,
          my_chem, foe.chem, outcome, decided, pot)
  returning id into match_id;

  -- PvP counts as a played match for the profile stat, but deliberately does
  -- NOT touch matches_today: that cap governs the PvE coin faucet, and PvP is
  -- zero-sum between players rather than newly minted coins.
  update public.utcg_wallets
    set matches_played = matches_played + 1
    where user_id = uid;

  select * into w from public.utcg_wallets where user_id = uid;
  return jsonb_build_object(
    'status', 'resolved',
    'match_id', match_id,
    'outcome', outcome,
    'decided_by', decided,
    'chem', my_chem, 'strength', round(my_strength, 2),
    'opponent_chem', foe.chem, 'opponent_strength', round(foe.strength, 2),
    'pot', pot, 'payout', payout, 'stake', stake,
    'coins', w.coins, 'packs_opened', w.packs_opened,
    'matches_played', w.matches_played, 'best_wins', w.best_wins
  );
end $function$;

revoke all on function public.utcg_pvp_enter(text, jsonb) from public;
grant execute on function public.utcg_pvp_enter(text, jsonb) to authenticated;

notify pgrst, 'reload schema';

-- ── Hardening + escrow recovery (added after security review, 2026-08-02) ────

-- Dangling default grants: RLS default-denies without a permissive write
-- policy, so these were not exploitable — but they'd become a live hole the
-- moment anyone added a write policy without noticing. Revoke explicitly.
revoke insert, update, delete on public.utcg_pvp_squads  from anon, authenticated;
revoke insert, update, delete on public.utcg_pvp_matches from anon, authenticated;

/**
 * Withdraw an unplayed challenge and refund the escrowed stake.
 *
 * WHY THIS EXISTS: a parked squad only resolves when someone else enters. With
 * a small player pool a challenge can sit indefinitely, and because a user may
 * hold only ONE open squad, the coins AND the ability to re-enter were both
 * locked with no recovery path. That's a trap, not a tradeoff.
 *
 * Race safety: takes a plain `for update` (NOT skip locked) on our own row, so
 * if a challenger is mid-resolve we block until they commit and then find the
 * squad consumed — the guarded update returns no rows and we raise. A squad can
 * therefore never both pay out and refund.
 */
create or replace function public.utcg_pvp_cancel()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  s public.utcg_pvp_squads;
  w public.utcg_wallets;
  refunded int := 0;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  select * into s
    from public.utcg_pvp_squads
    where user_id = uid and consumed_at is null
    for update;

  if s is null then raise exception 'no open squad to cancel'; end if;

  refunded := s.staked_coins;

  update public.utcg_pvp_squads
    set consumed_at = now(), staked_coins = 0
    where id = s.id and consumed_at is null;

  if not found then raise exception 'squad was just played — cannot cancel'; end if;

  if refunded > 0 then
    update public.utcg_wallets set coins = coins + refunded where user_id = uid;
  end if;

  select * into w from public.utcg_wallets where user_id = uid;
  return jsonb_build_object(
    'refunded', refunded,
    'coins', w.coins, 'packs_opened', w.packs_opened,
    'matches_played', w.matches_played, 'best_wins', w.best_wins
  );
end $function$;

revoke all on function public.utcg_pvp_cancel() from public, anon;
grant execute on function public.utcg_pvp_cancel() to authenticated;

notify pgrst, 'reload schema';

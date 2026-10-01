-- UTCG Phase 0.2 — staked PvP was a pure transfer that a main + alt could farm
-- (throw matches, 0% tax, uncapped) and lend squads through.
--   * rake: 10% of the pot is destroyed on a decided match (draws refund, no
--     rake) — PvP becomes a coin sink. Stored per match for history math.
--   * same-pair cap: an opponent you've played in the last 24h is EXCLUDED from
--     matchmaking (not raised — one parked alt must never block you entirely).
--   * card lock: a card in your parked squad can't leave your collection via
--     the market (utcg_market_take_card). Quicksell already keeps the last
--     copy, so it can't strip a parked card and needs no patch.
-- prosrc patches from the LIVE bodies — same pattern as 20260922200000.

alter table public.utcg_pvp_matches
  add column if not exists rake int not null default 0;

create index if not exists utcg_pvp_matches_pair_idx on public.utcg_pvp_matches
  (least(challenger_id, defender_id), greatest(challenger_id, defender_id), created_at desc);

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

select pg_temp.utcg_patch('public.utcg_pvp_enter(text,jsonb)',
$o$  stake constant int := 100;
$o$,
$n$  stake constant int := 100;
  rake_pct constant numeric := 0.10;
  rake int := 0;
$n$);

select pg_temp.utcg_patch('public.utcg_pvp_enter(text,jsonb)',
$o$      and s.staked_coins >= stake
    order by abs(s.strength - my_strength), s.created_at$o$,
$n$      and s.staked_coins >= stake
      and not exists (
        select 1 from public.utcg_pvp_matches m
        where least(m.challenger_id, m.defender_id) = least(uid, s.user_id)
          and greatest(m.challenger_id, m.defender_id) = greatest(uid, s.user_id)
          and m.created_at >= now() - interval '24 hours')
    order by abs(s.strength - my_strength), s.created_at$n$);

select pg_temp.utcg_patch('public.utcg_pvp_enter(text,jsonb)',
$o$  if outcome = 'challenger' then
    payout := pot;
    update public.utcg_wallets set coins = coins + payout where user_id = uid;
  elsif outcome = 'defender' then
    payout := 0;
    update public.utcg_wallets set coins = coins + pot where user_id = foe.user_id;$o$,
$n$  if outcome <> 'draw' then
    rake := floor(pot * rake_pct)::int;
  end if;

  if outcome = 'challenger' then
    payout := pot - rake;
    update public.utcg_wallets set coins = coins + payout where user_id = uid;
  elsif outcome = 'defender' then
    payout := 0;
    update public.utcg_wallets set coins = coins + pot - rake where user_id = foe.user_id;$n$);

select pg_temp.utcg_patch('public.utcg_pvp_enter(text,jsonb)',
$o$     challenger_chem, defender_chem, outcome, decided_by, pot)
  values (uid, foe.user_id, my_strength, foe.strength,
          my_chem, foe.chem, outcome, decided, pot)$o$,
$n$     challenger_chem, defender_chem, outcome, decided_by, pot, rake)
  values (uid, foe.user_id, my_strength, foe.strength,
          my_chem, foe.chem, outcome, decided, pot, rake)$n$);

select pg_temp.utcg_patch('public.utcg_pvp_enter(text,jsonb)',
$o$    'pot', pot, 'payout', payout, 'stake', stake,$o$,
$n$    'pot', pot, 'rake', rake, 'payout', payout, 'stake', stake,$n$);

select pg_temp.utcg_patch('public.utcg_market_take_card(uuid,text,text,text,integer,integer)',
$o$  if have is null or have < p_qty then
    raise exception 'card not owned in sufficient quantity';
  end if;
$o$,
$n$  if have is null or have < p_qty then
    raise exception 'card not owned in sufficient quantity';
  end if;
  if have - p_qty < 1 and exists (
    select 1 from public.utcg_pvp_squads s, jsonb_array_elements(s.cards) c
    where s.user_id = p_user and s.consumed_at is null and s.staked_coins > 0
      and c->>'player_id' = p_player_id and c->>'team_slug' = p_team_slug
      and (c->>'year')::int = p_year
  ) then
    raise exception 'card is in your parked PvP squad — withdraw the squad first';
  end if;
$n$);

notify pgrst, 'reload schema';

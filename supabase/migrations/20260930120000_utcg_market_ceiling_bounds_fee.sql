-- UTCG Phase 0.3 — the market let a main + alt move any amount of coins with
-- one junk card (no price ceiling) and move cards for free (0% on trades).
--   * sell listings: ask ≤ 15 × the card's quicksell value (floor already = 1×).
--     EA added FUT price ranges in 2015 for exactly this funnel.
--   * offers: ≤ 10 copies per card, coins ≤ the listed card's ceiling.
--   * trade fee: 5% (rounded up) of the quicksell value of the cards OFFERED,
--     charged + escrowed at offer time (never at accept, where the offerer's
--     balance could already be spent), refunded with the offer on
--     decline/withdraw/cancel, destroyed on accept.
-- prosrc patches from the LIVE bodies — same pattern as 20260922200000.

alter table public.utcg_trade_offers
  add column if not exists fee int not null default 0 check (fee >= 0);

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

select pg_temp.utcg_patch('public.utcg_market_list(text,text,integer,text,integer)',
$o$      raise exception 'price below quicksell floor (%).', floor_price;
    end if;
$o$,
$n$      raise exception 'price below quicksell floor (%).', floor_price;
    end if;
    if p_ask_price > floor_price * 15 then
      raise exception 'price above this card''s ceiling (%).', floor_price * 15;
    end if;
$n$);

select pg_temp.utcg_patch('public.utcg_market_make_offer(uuid,jsonb,integer)',
$o$  offer public.utcg_trade_offers; elem jsonb; n int; i int;
$o$,
$n$  offer public.utcg_trade_offers; elem jsonb; n int; i int;
  lscore numeric; coin_cap int; card_val int; fee int := 0;
$n$);

select pg_temp.utcg_patch('public.utcg_market_make_offer(uuid,jsonb,integer)',
$o$  if n > 5 then raise exception 'at most 5 cards per offer'; end if;
$o$,
$n$  if n > 5 then raise exception 'at most 5 cards per offer'; end if;

  select p.player_score::numeric into lscore from public.twelve_oh_players p
    where p.league = 'ufa' and p.player_id = l.player_id
      and p.team_slug = l.team_slug and p.year = l.year;
  if lscore is null then raise exception 'listed card not found'; end if;
  coin_cap := 15 * public.utcg_quicksell_value(public.utcg_tier_rank(lscore));
  if p_coins > coin_cap then
    raise exception 'offer coins above this card''s ceiling (%)', coin_cap;
  end if;

  for i in 0..n-1 loop
    elem := p_cards -> i;
    if coalesce((elem->>'qty')::int, 1) > 10 then
      raise exception 'at most 10 copies of a card per offer';
    end if;
    select public.utcg_quicksell_value(public.utcg_tier_rank(p.player_score::numeric))
      into card_val
      from public.twelve_oh_players p
      where p.league = 'ufa' and p.player_id = elem->>'player_id'
        and p.team_slug = elem->>'team_slug' and p.year = (elem->>'year')::int;
    if card_val is null then raise exception 'unknown card in offer: %', elem; end if;
    fee := fee + card_val * coalesce((elem->>'qty')::int, 1);
  end loop;
  fee := ceil(fee * 0.05)::int;
$n$);

select pg_temp.utcg_patch('public.utcg_market_make_offer(uuid,jsonb,integer)',
$o$  if p_coins > 0 then
    perform public.utcg_ensure_wallet();
    select * into w from public.utcg_wallets where user_id = uid for update;
    if w.coins < p_coins then raise exception 'insufficient coins'; end if;
    update public.utcg_wallets set coins = coins - p_coins where user_id = uid;
  end if;

  insert into public.utcg_trade_offers (listing_id, offerer_id, offer_coins)
    values (l.id, uid, p_coins) returning * into offer;$o$,
$n$  if p_coins + fee > 0 then
    perform public.utcg_ensure_wallet();
    select * into w from public.utcg_wallets where user_id = uid for update;
    if w.coins < p_coins + fee then
      raise exception 'insufficient coins (offer % + trade fee %)', p_coins, fee;
    end if;
    update public.utcg_wallets set coins = coins - p_coins - fee where user_id = uid;
  end if;

  insert into public.utcg_trade_offers (listing_id, offerer_id, offer_coins, fee)
    values (l.id, uid, p_coins, fee) returning * into offer;$n$);

select pg_temp.utcg_patch('public.utcg_market_refund_offer(uuid)',
$o$  if o.offer_coins > 0 then
    update public.utcg_wallets set coins = coins + o.offer_coins where user_id = o.offerer_id;
  end if;$o$,
$n$  if o.offer_coins + o.fee > 0 then
    update public.utcg_wallets set coins = coins + o.offer_coins + o.fee
      where user_id = o.offerer_id;
  end if;$n$);

notify pgrst, 'reload schema';

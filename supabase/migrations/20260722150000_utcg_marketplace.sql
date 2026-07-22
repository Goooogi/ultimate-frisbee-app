-- Applied via MCP 2026-07-22.
-- UTCG Marketplace: player-to-player card economy (sell for coins, or list for
-- trade and field card+coin offers). Same doctrine as the rest of UTCG:
--   * server-authoritative — every coin/copy move is a SECURITY DEFINER RPC;
--     users have NO direct insert/update on any market table (RLS select-only).
--   * ESCROW — listing a card (or attaching cards/coins to a trade offer) moves
--     the copy/coins OUT of the owner's usable balance immediately, so a card
--     can't be double-sold or played while it's on the market. Cancel/decline/
--     withdraw returns escrow; a completed sale/trade transfers it.
--   * fungible copies — a "card" is the (player_id, team_slug, year) identity in
--     utcg_owned_cards.copies; transfers decrement one row and upsert another.
--   * 5% coin SINK on completed sales & accepted offers (economy anti-inflation),
--     floor = the card's quicksell value so nothing lists below what the game
--     already pays, max 20 active listings per user.

-- ─── Tables ─────────────────────────────────────────────────────────────────

create table public.utcg_listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references auth.users(id) on delete cascade,
  league text not null default 'ufa',
  player_id text not null,
  team_slug text not null,
  year int not null,
  kind text not null check (kind in ('sell','trade')),
  ask_price int check (ask_price is null or ask_price >= 0),
  status text not null default 'active'
    check (status in ('active','sold','traded','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  -- a sell listing must carry a price; a trade listing must not.
  constraint utcg_listings_price_kind check (
    (kind = 'sell'  and ask_price is not null) or
    (kind = 'trade' and ask_price is null)
  )
);
create index utcg_listings_active_idx on public.utcg_listings (status, created_at desc);
create index utcg_listings_seller_idx on public.utcg_listings (seller_id, status);
-- at most one ACTIVE listing per (seller, card identity) — you escrow one copy
-- per listing; relisting the same card requires the prior one to close.
create unique index utcg_listings_one_active_per_card
  on public.utcg_listings (seller_id, league, player_id, team_slug, year)
  where (status = 'active');

create table public.utcg_trade_offers (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.utcg_listings(id) on delete cascade,
  offerer_id uuid not null references auth.users(id) on delete cascade,
  offer_coins int not null default 0 check (offer_coins >= 0),
  status text not null default 'pending'
    check (status in ('pending','accepted','declined','withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index utcg_trade_offers_listing_idx on public.utcg_trade_offers (listing_id, status);
create index utcg_trade_offers_offerer_idx on public.utcg_trade_offers (offerer_id, status);

-- The cards attached to a trade offer (the offerer's side of the swap). Escrowed
-- out of the offerer's collection when the offer is made.
create table public.utcg_trade_offer_cards (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.utcg_trade_offers(id) on delete cascade,
  league text not null default 'ufa',
  player_id text not null,
  team_slug text not null,
  year int not null,
  qty int not null default 1 check (qty >= 1)
);
create index utcg_trade_offer_cards_offer_idx on public.utcg_trade_offer_cards (offer_id);

create trigger utcg_listings_touch before update on public.utcg_listings
  for each row execute function public.utcg_touch_updated_at();
create trigger utcg_trade_offers_touch before update on public.utcg_trade_offers
  for each row execute function public.utcg_touch_updated_at();

-- ─── RLS: select-only, writes go through RPCs ───────────────────────────────

alter table public.utcg_listings enable row level security;
alter table public.utcg_trade_offers enable row level security;
alter table public.utcg_trade_offer_cards enable row level security;

-- Listings are a PUBLIC market — anyone signed in can browse active ones (and a
-- seller always sees their own, in any status).
create policy "utcg_listings_select" on public.utcg_listings
  for select using (status = 'active' or seller_id = auth.uid());

-- Offers are private to the two parties: the offerer and the listing's seller.
create policy "utcg_trade_offers_select" on public.utcg_trade_offers
  for select using (
    offerer_id = auth.uid()
    or exists (select 1 from public.utcg_listings l
               where l.id = listing_id and l.seller_id = auth.uid())
  );

create policy "utcg_trade_offer_cards_select" on public.utcg_trade_offer_cards
  for select using (
    exists (
      select 1 from public.utcg_trade_offers o
      join public.utcg_listings l on l.id = o.listing_id
      where o.id = offer_id
        and (o.offerer_id = auth.uid() or l.seller_id = auth.uid())
    )
  );

-- ─── Internal helpers (grant/take a card copy) ──────────────────────────────

-- Move one-or-more copies of a card TO a user (upsert). SECURITY DEFINER callers
-- only — never granted to clients.
create or replace function public.utcg_market_grant_card(
  p_user uuid, p_league text, p_player_id text, p_team_slug text, p_year int, p_qty int)
returns void
language sql
set search_path to 'public'
as $function$
  insert into public.utcg_owned_cards (user_id, league, player_id, team_slug, year, copies)
    values (p_user, p_league, p_player_id, p_team_slug, p_year, p_qty)
  on conflict (user_id, league, player_id, team_slug, year)
    do update set copies = public.utcg_owned_cards.copies + p_qty;
$function$;

-- Take one-or-more copies FROM a user (must own enough; deletes row at 0). Raises
-- if the caller doesn't have p_qty copies. Row is assumed already FOR UPDATE
-- locked by the caller.
create or replace function public.utcg_market_take_card(
  p_user uuid, p_league text, p_player_id text, p_team_slug text, p_year int, p_qty int)
returns void
language plpgsql
set search_path to 'public'
as $function$
declare have int;
begin
  -- qty must be positive — a negative qty would turn this debit into a credit
  -- (card-duplication primitive). Validated here at the source, not just via the
  -- downstream qty>=1 CHECK. (security review 2026-07-22)
  if p_qty is null or p_qty <= 0 then
    raise exception 'qty must be >= 1';
  end if;
  select copies into have from public.utcg_owned_cards
    where user_id = p_user and league = p_league
      and player_id = p_player_id and team_slug = p_team_slug and year = p_year
    for update;
  if have is null or have < p_qty then
    raise exception 'card not owned in sufficient quantity';
  end if;
  if have = p_qty then
    delete from public.utcg_owned_cards
      where user_id = p_user and league = p_league
        and player_id = p_player_id and team_slug = p_team_slug and year = p_year;
  else
    update public.utcg_owned_cards set copies = copies - p_qty
      where user_id = p_user and league = p_league
        and player_id = p_player_id and team_slug = p_team_slug and year = p_year;
  end if;
end $function$;

-- ─── List a card (sell or trade) ────────────────────────────────────────────

create or replace function public.utcg_market_list(
  p_player_id text, p_team_slug text, p_year int,
  p_kind text, p_ask_price int default null)
returns public.utcg_listings
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  score numeric; floor_price int; active_count int; listing public.utcg_listings;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_kind not in ('sell','trade') then raise exception 'invalid listing kind'; end if;

  -- Verify ownership + read the card's score (for the sell floor). Lock the row.
  select p.player_score::numeric into score
    from public.utcg_owned_cards oc
    join public.twelve_oh_players p
      on p.league = 'ufa' and p.player_id = oc.player_id
     and p.team_slug = oc.team_slug and p.year = oc.year
    where oc.user_id = uid and oc.league = 'ufa'
      and oc.player_id = p_player_id and oc.team_slug = p_team_slug and oc.year = p_year
    for update of oc;
  if score is null then raise exception 'card not owned'; end if;

  if p_kind = 'sell' then
    if p_ask_price is null then raise exception 'sell listing needs a price'; end if;
    floor_price := public.utcg_quicksell_value(public.utcg_tier_rank(score));
    if p_ask_price < floor_price then
      raise exception 'price below quicksell floor (%).', floor_price;
    end if;
  else
    p_ask_price := null; -- trade listings carry no price
  end if;

  select count(*) into active_count from public.utcg_listings
    where seller_id = uid and status = 'active';
  if active_count >= 20 then raise exception 'too many active listings (max 20)'; end if;

  -- Escrow: take one copy out of the seller's collection.
  perform public.utcg_market_take_card(uid, 'ufa', p_player_id, p_team_slug, p_year, 1);

  insert into public.utcg_listings (seller_id, player_id, team_slug, year, kind, ask_price)
    values (uid, p_player_id, p_team_slug, p_year, p_kind, p_ask_price)
    returning * into listing;
  return listing;
exception
  when unique_violation then
    raise exception 'you already have an active listing for this card';
end $function$;

-- ─── Cancel a listing (return escrow, decline pending offers) ────────────────

create or replace function public.utcg_market_cancel(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  l public.utcg_listings; o record;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  select * into l from public.utcg_listings where id = p_listing_id for update;
  if l is null then raise exception 'listing not found'; end if;
  if l.seller_id <> uid then raise exception 'not your listing'; end if;
  if l.status <> 'active' then raise exception 'listing is not active'; end if;

  -- Refund every pending offer's escrow, then decline it.
  for o in select * from public.utcg_trade_offers
             where listing_id = l.id and status = 'pending' for update loop
    perform public.utcg_market_refund_offer(o.id);
    update public.utcg_trade_offers set status = 'declined' where id = o.id;
  end loop;

  -- Return the escrowed card to the seller.
  perform public.utcg_market_grant_card(uid, l.league, l.player_id, l.team_slug, l.year, 1);
  update public.utcg_listings
    set status = 'cancelled', closed_at = now() where id = l.id;
end $function$;

-- ─── Buy (sell listing) ─────────────────────────────────────────────────────

create or replace function public.utcg_market_buy(p_listing_id uuid)
returns public.utcg_wallets
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  l public.utcg_listings; sink int; proceeds int;
  buyer public.utcg_wallets;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  -- Lock the listing first (prevents two buyers racing the same card).
  select * into l from public.utcg_listings where id = p_listing_id for update;
  if l is null then raise exception 'listing not found'; end if;
  if l.status <> 'active' then raise exception 'listing no longer available'; end if;
  if l.kind <> 'sell' then raise exception 'listing is not for sale'; end if;
  if l.seller_id = uid then raise exception 'cannot buy your own listing'; end if;

  perform public.utcg_ensure_wallet();
  -- Lock both wallets in a stable order (by user_id) to avoid deadlocks.
  perform 1 from public.utcg_wallets
    where user_id in (uid, l.seller_id) order by user_id for update;

  select * into buyer from public.utcg_wallets where user_id = uid for update;
  if buyer.coins < l.ask_price then raise exception 'insufficient coins'; end if;

  sink := floor(l.ask_price * 0.05);
  proceeds := l.ask_price - sink;

  -- Move coins: buyer pays full price, seller receives 95%.
  update public.utcg_wallets set coins = coins - l.ask_price where user_id = uid;
  update public.utcg_wallets set coins = coins + proceeds where user_id = l.seller_id;

  -- Deliver the escrowed card to the buyer.
  perform public.utcg_market_grant_card(uid, l.league, l.player_id, l.team_slug, l.year, 1);

  update public.utcg_listings set status = 'sold', closed_at = now() where id = l.id;

  select * into buyer from public.utcg_wallets where user_id = uid;
  return buyer;
end $function$;

-- ─── Make a trade offer (escrow offerer's cards + coins) ─────────────────────
-- p_cards is a jsonb array of {player_id, team_slug, year, qty}.

create or replace function public.utcg_market_make_offer(
  p_listing_id uuid, p_cards jsonb, p_coins int default 0)
returns public.utcg_trade_offers
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  l public.utcg_listings; w public.utcg_wallets;
  offer public.utcg_trade_offers; elem jsonb; n int; i int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_coins < 0 then raise exception 'coins must be >= 0'; end if;

  select * into l from public.utcg_listings where id = p_listing_id for update;
  if l is null then raise exception 'listing not found'; end if;
  if l.status <> 'active' then raise exception 'listing no longer available'; end if;
  if l.kind <> 'trade' then raise exception 'listing is not open to trades'; end if;
  if l.seller_id = uid then raise exception 'cannot make an offer on your own listing'; end if;

  n := coalesce(jsonb_array_length(p_cards), 0);
  if n = 0 and p_coins = 0 then raise exception 'offer must include a card or coins'; end if;
  if n > 5 then raise exception 'at most 5 cards per offer'; end if;

  -- Escrow coins.
  if p_coins > 0 then
    perform public.utcg_ensure_wallet();
    select * into w from public.utcg_wallets where user_id = uid for update;
    if w.coins < p_coins then raise exception 'insufficient coins'; end if;
    update public.utcg_wallets set coins = coins - p_coins where user_id = uid;
  end if;

  insert into public.utcg_trade_offers (listing_id, offerer_id, offer_coins)
    values (l.id, uid, p_coins) returning * into offer;

  -- Escrow each offered card (validate ownership, take a copy, record it).
  for i in 0..n-1 loop
    elem := p_cards -> i;
    perform public.utcg_market_take_card(
      uid, 'ufa', elem->>'player_id', elem->>'team_slug', (elem->>'year')::int,
      coalesce((elem->>'qty')::int, 1));
    insert into public.utcg_trade_offer_cards (offer_id, player_id, team_slug, year, qty)
      values (offer.id, elem->>'player_id', elem->>'team_slug', (elem->>'year')::int,
              coalesce((elem->>'qty')::int, 1));
  end loop;

  return offer;
end $function$;

-- Refund one offer's escrow (coins + cards) back to the offerer. Internal; assumes
-- the offer is being closed by the caller (does NOT change offer.status).
create or replace function public.utcg_market_refund_offer(p_offer_id uuid)
returns void
language plpgsql
set search_path to 'public'
as $function$
declare o public.utcg_trade_offers; c record;
begin
  select * into o from public.utcg_trade_offers where id = p_offer_id;
  if o is null then raise exception 'offer not found'; end if;
  if o.offer_coins > 0 then
    update public.utcg_wallets set coins = coins + o.offer_coins where user_id = o.offerer_id;
  end if;
  for c in select * from public.utcg_trade_offer_cards where offer_id = o.id loop
    perform public.utcg_market_grant_card(o.offerer_id, c.league, c.player_id, c.team_slug, c.year, c.qty);
  end loop;
end $function$;

-- ─── Accept an offer (atomic swap) ──────────────────────────────────────────

create or replace function public.utcg_market_accept_offer(p_offer_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  o public.utcg_trade_offers; l public.utcg_listings; c record;
  sink int; proceeds int; sib record; v_listing_id uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  -- Lock the LISTING first (matches utcg_market_cancel's listing-first order so
  -- accept + cancel racing the same listing can't deadlock). Resolve the offer's
  -- listing id with an unlocked read, take the listing lock, THEN lock the offer.
  -- (security review 2026-07-22)
  select listing_id into v_listing_id from public.utcg_trade_offers where id = p_offer_id;
  if v_listing_id is null then raise exception 'offer not found'; end if;

  select * into l from public.utcg_listings where id = v_listing_id for update;
  if l is null then raise exception 'listing not found'; end if;
  if l.seller_id <> uid then raise exception 'not your listing'; end if;
  if l.status <> 'active' then raise exception 'listing no longer available'; end if;

  select * into o from public.utcg_trade_offers where id = p_offer_id for update;
  if o is null then raise exception 'offer not found'; end if;
  if o.status <> 'pending' then raise exception 'offer is no longer pending'; end if;

  perform public.utcg_ensure_wallet();

  -- Offerer's coins (escrowed) go to the seller, minus the 5% sink.
  if o.offer_coins > 0 then
    sink := floor(o.offer_coins * 0.05);
    proceeds := o.offer_coins - sink;
    update public.utcg_wallets set coins = coins + proceeds where user_id = l.seller_id;
  end if;

  -- Offerer's escrowed cards go to the seller.
  for c in select * from public.utcg_trade_offer_cards where offer_id = o.id loop
    perform public.utcg_market_grant_card(l.seller_id, c.league, c.player_id, c.team_slug, c.year, c.qty);
  end loop;

  -- The listed (escrowed) card goes to the offerer.
  perform public.utcg_market_grant_card(o.offerer_id, l.league, l.player_id, l.team_slug, l.year, 1);

  update public.utcg_trade_offers set status = 'accepted' where id = o.id;
  update public.utcg_listings set status = 'traded', closed_at = now() where id = l.id;

  -- Auto-decline + refund every other pending offer on this listing.
  for sib in select * from public.utcg_trade_offers
               where listing_id = l.id and id <> o.id and status = 'pending' for update loop
    perform public.utcg_market_refund_offer(sib.id);
    update public.utcg_trade_offers set status = 'declined' where id = sib.id;
  end loop;
end $function$;

-- ─── Decline / withdraw an offer (return escrow) ────────────────────────────

create or replace function public.utcg_market_decline_offer(p_offer_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare uid uuid := auth.uid(); o public.utcg_trade_offers; l public.utcg_listings;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select * into o from public.utcg_trade_offers where id = p_offer_id for update;
  if o is null then raise exception 'offer not found'; end if;
  if o.status <> 'pending' then raise exception 'offer is no longer pending'; end if;
  select * into l from public.utcg_listings where id = o.listing_id;
  if l.seller_id <> uid then raise exception 'not your listing'; end if;

  perform public.utcg_market_refund_offer(o.id);
  update public.utcg_trade_offers set status = 'declined' where id = o.id;
end $function$;

create or replace function public.utcg_market_withdraw_offer(p_offer_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare uid uuid := auth.uid(); o public.utcg_trade_offers;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select * into o from public.utcg_trade_offers where id = p_offer_id for update;
  if o is null then raise exception 'offer not found'; end if;
  if o.offerer_id <> uid then raise exception 'not your offer'; end if;
  if o.status <> 'pending' then raise exception 'offer is no longer pending'; end if;

  perform public.utcg_market_refund_offer(o.id);
  update public.utcg_trade_offers set status = 'withdrawn' where id = o.id;
end $function$;

-- ─── Grants: clients may EXECUTE only the user-facing RPCs ───────────────────

revoke execute on function public.utcg_market_grant_card(uuid, text, text, text, int, int) from public, anon, authenticated;
revoke execute on function public.utcg_market_take_card(uuid, text, text, text, int, int) from public, anon, authenticated;
revoke execute on function public.utcg_market_refund_offer(uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';

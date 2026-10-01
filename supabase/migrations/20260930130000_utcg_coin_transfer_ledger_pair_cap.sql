-- UTCG Phase 1.2 — who-paid-whom ledger + a weekly cap per pair of accounts.
-- Nothing recorded the buyer of a listing, so a main + N alts funnel was
-- invisible. Every coin-moving RPC now appends a row; a pair (either
-- direction) may move at most 2,000 coins per rolling 7 days. Card-only legs
-- are logged with amount 0 + card_value so squad lending shows in the admin
-- view (1.3). Staked PvP EXCLUDES capped opponents from matchmaking rather
-- than raising, so one parked alt can't lock a player out of PvP.
-- prosrc patches from the LIVE bodies — same pattern as 20260922200000.

create table if not exists public.utcg_coin_transfers (
  id bigint generated always as identity primary key,
  from_user uuid not null references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  amount int not null check (amount >= 0),
  card_value int not null default 0,
  source text not null check (source in ('market_buy', 'offer_accept', 'pvp_stake')),
  ref_id uuid,
  reference_value int,
  created_at timestamptz not null default now()
);
create index if not exists utcg_coin_transfers_pair_idx on public.utcg_coin_transfers
  (least(from_user, to_user), greatest(from_user, to_user), created_at desc);
create index if not exists utcg_coin_transfers_created_idx on public.utcg_coin_transfers (created_at desc);
alter table public.utcg_coin_transfers enable row level security;
-- Audit log: no client policies; read only through admin-gated definer RPCs.
revoke all on public.utcg_coin_transfers from anon, authenticated;

create or replace function public.utcg_pair_moved_7d(p_a uuid, p_b uuid)
returns int
language sql
stable
set search_path to 'public'
as $function$
  select coalesce(sum(amount), 0)::int from public.utcg_coin_transfers
  where least(from_user, to_user) = least(p_a, p_b)
    and greatest(from_user, to_user) = greatest(p_a, p_b)
    and created_at >= now() - interval '7 days';
$function$;
revoke execute on function public.utcg_pair_moved_7d(uuid, uuid) from public, anon, authenticated;

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

-- market_buy: cap, then log buyer → seller (proceeds actually received).
select pg_temp.utcg_patch('public.utcg_market_buy(uuid)',
$o$  proceeds := l.ask_price - sink;
$o$,
$n$  proceeds := l.ask_price - sink;
  if public.utcg_pair_moved_7d(uid, l.seller_id) + proceeds > 2000 then
    raise exception 'weekly trade limit with this player reached (2,000 coins per 7 days)';
  end if;
$n$);

select pg_temp.utcg_patch('public.utcg_market_buy(uuid)',
$o$  update public.utcg_listings set status = 'sold', closed_at = now() where id = l.id;
$o$,
$n$  update public.utcg_listings set status = 'sold', closed_at = now() where id = l.id;
  insert into public.utcg_coin_transfers
    (from_user, to_user, amount, source, ref_id, reference_value)
  select uid, l.seller_id, proceeds, 'market_buy', l.id,
         public.utcg_quicksell_value(public.utcg_tier_rank(p.player_score::numeric))
    from public.twelve_oh_players p
    where p.league = 'ufa' and p.player_id = l.player_id
      and p.team_slug = l.team_slug and p.year = l.year;
$n$);

-- accept_offer: cap on the coin leg; log both directions (cards as card_value).
select pg_temp.utcg_patch('public.utcg_market_accept_offer(uuid)',
$o$  if o.offer_coins > 0 then
    sink := floor(o.offer_coins * 0.05);
    proceeds := o.offer_coins - sink;
$o$,
$n$  if o.offer_coins > 0 then
    sink := floor(o.offer_coins * 0.05);
    proceeds := o.offer_coins - sink;
    if public.utcg_pair_moved_7d(o.offerer_id, l.seller_id) + proceeds > 2000 then
      raise exception 'weekly trade limit with this player reached (2,000 coins per 7 days)';
    end if;
$n$);

select pg_temp.utcg_patch('public.utcg_market_accept_offer(uuid)',
$o$  update public.utcg_trade_offers set status = 'accepted' where id = o.id;
$o$,
$n$  insert into public.utcg_coin_transfers
    (from_user, to_user, amount, card_value, source, ref_id, reference_value)
  select o.offerer_id, l.seller_id, coalesce(proceeds, 0),
         coalesce((select sum(public.utcg_quicksell_value(public.utcg_tier_rank(p.player_score::numeric)) * oc.qty)
                     from public.utcg_trade_offer_cards oc
                     join public.twelve_oh_players p
                       on p.league = 'ufa' and p.player_id = oc.player_id
                      and p.team_slug = oc.team_slug and p.year = oc.year
                    where oc.offer_id = o.id), 0)::int,
         'offer_accept', o.id,
         public.utcg_quicksell_value(public.utcg_tier_rank(lp.player_score::numeric))
    from public.twelve_oh_players lp
    where lp.league = 'ufa' and lp.player_id = l.player_id
      and lp.team_slug = l.team_slug and lp.year = l.year;
  insert into public.utcg_coin_transfers (from_user, to_user, amount, card_value, source, ref_id)
  select l.seller_id, o.offerer_id, 0,
         public.utcg_quicksell_value(public.utcg_tier_rank(lp.player_score::numeric)),
         'offer_accept', o.id
    from public.twelve_oh_players lp
    where lp.league = 'ufa' and lp.player_id = l.player_id
      and lp.team_slug = l.team_slug and lp.year = l.year;

  update public.utcg_trade_offers set status = 'accepted' where id = o.id;
$n$);

-- pvp_enter: skip opponents whose pair is at the weekly cap; log loser → winner.
select pg_temp.utcg_patch('public.utcg_pvp_enter(text,jsonb)',
$o$          and m.created_at >= now() - interval '24 hours')
$o$,
$n$          and m.created_at >= now() - interval '24 hours')
      and public.utcg_pair_moved_7d(uid, s.user_id) + stake <= 2000
$n$);

select pg_temp.utcg_patch('public.utcg_pvp_enter(text,jsonb)',
$o$  returning id into match_id;
$o$,
$n$  returning id into match_id;

  if outcome <> 'draw' then
    insert into public.utcg_coin_transfers (from_user, to_user, amount, source, ref_id)
    values (case when outcome = 'challenger' then foe.user_id else uid end,
            case when outcome = 'challenger' then uid else foe.user_id end,
            stake - rake, 'pvp_stake', match_id);
  end if;
$n$);

notify pgrst, 'reload schema';

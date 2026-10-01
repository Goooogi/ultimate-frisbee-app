-- UTCG Phase 1.3 — admin view of suspicious account pairs, read from the
-- utcg_coin_transfers ledger. Admin-gated exactly like admin_list_users().
-- A pair is returned when any flag trips inside the window:
--   coins   ≥ 1,000 moved between the two accounts
--   cards   ≥ 1,000 quicksell value moved (card-only squad lending)
--   price   a sale/offer at ≥ 5× the card's quicksell reference
--   new     either account < 14 days old with ≥ 3 transfers between them

create or replace function public.utcg_admin_flagged_pairs(p_days int default 30)
returns table(
  user_a uuid, user_a_email text, user_a_created_at timestamptz,
  user_b uuid, user_b_email text, user_b_created_at timestamptz,
  coins_moved int, card_value_moved int, transfers int,
  max_price_ratio numeric, last_transfer_at timestamptz, reasons text[]
)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'not authorized';
  end if;
  return query
    with pairs as (
      select least(t.from_user, t.to_user) a, greatest(t.from_user, t.to_user) b,
             sum(t.amount)::int coins, sum(t.card_value)::int cards, count(*)::int n,
             max(case when t.reference_value > 0 then t.amount::numeric / t.reference_value end) ratio,
             max(t.created_at) last_at
      from public.utcg_coin_transfers t
      where t.created_at >= now() - make_interval(days => p_days)
      group by 1, 2
    ), flagged as (
      select p.*, ua.email::text a_email, ua.created_at a_created,
             ub.email::text b_email, ub.created_at b_created,
             array_remove(array[
               case when p.coins >= 1000 then 'coins' end,
               case when p.cards >= 1000 then 'cards' end,
               case when p.ratio >= 5 then 'price' end,
               case when p.n >= 3 and greatest(ua.created_at, ub.created_at) >= now() - interval '14 days'
                    then 'new' end
             ], null) why
      from pairs p
      join auth.users ua on ua.id = p.a
      join auth.users ub on ub.id = p.b
    )
    select f.a, f.a_email, f.a_created, f.b, f.b_email, f.b_created,
           f.coins, f.cards, f.n, round(f.ratio, 2), f.last_at, f.why
    from flagged f
    where cardinality(f.why) > 0
    order by f.coins + f.cards desc;
end $function$;
revoke execute on function public.utcg_admin_flagged_pairs(int) from public, anon;
grant execute on function public.utcg_admin_flagged_pairs(int) to authenticated;

notify pgrst, 'reload schema';

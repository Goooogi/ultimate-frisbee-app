-- Exact copy of remote migration 20260722003729 (applied via MCP 2026-07-21).
-- Security-review hardening:
-- 1) HIGH fix: utcg_record_match daily reward cap (10 rewarded matches/UTC day;
--    further matches play but earn 0) — was infinitely replayable for coins.
-- 2) MEDIUM fix: utcg_card_pool matview + indexes backs utcg_draft_deal
--    (was ~130ms/candidate over live derive_position calls).
--    REFRESH MATERIALIZED VIEW CONCURRENTLY public.utcg_card_pool after any
--    12-0 re-score.
-- 3) LOW: revoke authenticated EXECUTE on utcg_eval_lineup.

alter table public.utcg_wallets
  add column if not exists matches_today int not null default 0,
  add column if not exists matches_day date;

create or replace function public.utcg_record_match(p_formation text, p_cards jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  daily_cap int := 10;
  n int; i int; elem jsonb; owned record;
  ev jsonb; chem_total int; strength numeric;
  wins int; reward int; capped boolean := false; w public.utcg_wallets;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  n := jsonb_array_length(p_cards);
  if n <> 7 then raise exception 'squad must have exactly 7 cards'; end if;

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

  ev := public.utcg_eval_lineup(p_formation, p_cards);
  chem_total := (ev->>'chem')::int;
  strength := (ev->>'strength')::numeric;

  wins := round(
    case
      when strength <= 40 then 0
      when strength <= 81.6 then 0 + (strength-40)/(81.6-40)*(2-0)
      when strength <= 85.6 then 2 + (strength-81.6)/(85.6-81.6)*(5-2)
      when strength <= 87.7 then 5 + (strength-85.6)/(87.7-85.6)*(6-5)
      when strength <= 89.66 then 6 + (strength-87.7)/(89.66-87.7)*(7-6)
      when strength <= 91.14 then 7 + (strength-89.66)/(91.14-89.66)*(8-7)
      when strength <= 92.16 then 8 + (strength-91.14)/(92.16-91.14)*(9-8)
      when strength <= 93.16 then 9 + (strength-92.16)/(93.16-92.16)*(10-9)
      when strength <= 93.77 then 10 + (strength-93.16)/(93.77-93.16)*(11-10)
      when strength <= 94.46 then 11 + (strength-93.77)/(94.46-93.77)*(12-11)
      else 12 end
  );
  wins := greatest(0, least(12, wins));

  perform public.utcg_ensure_wallet();
  select * into w from public.utcg_wallets where user_id = uid for update;

  if w.matches_day is distinct from current_date then
    w.matches_today := 0;
  end if;

  if w.matches_today >= daily_cap then
    reward := 0;
    capped := true;
  else
    reward := 20 + wins * 12
            + case when wins >= 12 then 300 when wins >= 11 then 150 when wins >= 10 then 60 else 0 end;
  end if;

  update public.utcg_wallets
    set coins = coins + reward,
        matches_played = matches_played + 1,
        best_wins = greatest(best_wins, wins),
        matches_today = w.matches_today + 1,
        matches_day = current_date
    where user_id = uid returning * into w;

  return jsonb_build_object(
    'wins', wins, 'losses', 12 - wins, 'reward', reward, 'capped', capped,
    'chem', chem_total, 'strength', round(strength, 2),
    'coins', w.coins, 'packs_opened', w.packs_opened,
    'matches_played', w.matches_played, 'best_wins', w.best_wins
  );
end $function$;

create materialized view public.utcg_card_pool as
select p.player_id, p.name, p.team_slug, p.team_abbr, p.year,
       p.player_score::numeric as score,
       public.utcg_tier_rank(p.player_score::numeric) as tier_rank,
       public.utcg_derive_position(p.goals, p.assists, p.yards_thrown, p.yards_received) as position,
       public.utcg_ufa_division(p.team_slug) as division
from public.twelve_oh_players p
where p.league = 'ufa';

create unique index utcg_card_pool_pk on public.utcg_card_pool (player_id, team_slug, year);
create index utcg_card_pool_deal_idx on public.utcg_card_pool (position, tier_rank);

revoke all on public.utcg_card_pool from public, anon, authenticated;

create or replace function public.utcg_draft_deal(p_slot text, p_exclude_players text[])
returns jsonb
language plpgsql
volatile
set search_path to 'public'
as $function$
declare
  deal jsonb := '[]'::jsonb;
  taken text[] := coalesce(p_exclude_players, array[]::text[]);
  k int; r numeric; rolled int; picked record;
  wsum numeric := 0.5 + 3 + 8 + 14 + 26 + 28 + 20.5;
begin
  for k in 1..5 loop
    r := random() * wsum;
    rolled := case
      when r < 0.5 then 7
      when r < 0.5 + 3 then 6
      when r < 0.5 + 3 + 8 then 5
      when r < 0.5 + 3 + 8 + 14 then 4
      when r < 0.5 + 3 + 8 + 14 + 26 then 3
      when r < 0.5 + 3 + 8 + 14 + 26 + 28 then 2
      else 1 end;

    select cp.player_id, cp.name, cp.team_slug, cp.team_abbr, cp.year,
           cp.score, cp.tier_rank, cp.position as pos, cp.division
      into picked
      from public.utcg_card_pool cp
      where cp.player_id <> all(taken)
        and cp.position in (p_slot, 'hybrid')
        and cp.tier_rank = rolled
      order by random() limit 1;

    if picked is null then
      select cp.player_id, cp.name, cp.team_slug, cp.team_abbr, cp.year,
             cp.score, cp.tier_rank, cp.position as pos, cp.division
        into picked
        from public.utcg_card_pool cp
        where cp.player_id <> all(taken)
          and cp.position in (p_slot, 'hybrid')
        order by abs(cp.tier_rank - rolled), random()
        limit 1;
    end if;

    if picked is null then raise exception 'card pool exhausted for slot %', p_slot; end if;

    taken := taken || picked.player_id;
    deal := deal || jsonb_build_object(
      'player_id', picked.player_id, 'name', picked.name,
      'team_slug', picked.team_slug, 'team_abbr', picked.team_abbr,
      'year', picked.year, 'player_score', picked.score,
      'tier_rank', picked.tier_rank, 'position', picked.pos,
      'division', picked.division);
  end loop;
  return deal;
end $function$;

revoke execute on function public.utcg_draft_deal(text, text[]) from public, anon, authenticated;

revoke execute on function public.utcg_eval_lineup(text, jsonb) from authenticated;

notify pgrst, 'reload schema';
